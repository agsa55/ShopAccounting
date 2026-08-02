// src/app/api/checks/route.ts — v9.0 ★★★ Transaction Safety
// ============================================================================
// مدیریت چک‌ها (دریافتی و پرداختنی)
// ----------------------------------------------------------------------------
// ★★★ v9.0: اصلاحات Transaction Safety:
//   ★ DELETE: ابطال سند + حذف چک داخل یک Transaction
//   ★ PUT (edit): ویرایش + ابطال سند قدیم + صدور سند جدید داخل Transaction
//   ★ حفظ تمام منطق v8.8 بدون تغییر
//
// این API امکان ثبت، وصول، برگشت و حذف چک‌ها را فراهم می‌کند.
// هر چک به‌صورت خودکار سند حسابداری ایجاد می‌کند:
//   - چک دریافتی: Dr. چک‌های دریافتنی / Cr. فروش یا بدهکاران
//   - چک پرداختنی: Dr. خرید یا بستانکاران / Cr. چک‌های پرداختنی
//   - وصول چک دریافتی: Dr. بانک / Cr. چک‌های دریافتنی
//   - پرداخت چک پرداختنی: Dr. چک‌های پرداختنی / Cr. بانک
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  GET /api/checks — لیست چک‌ها
//  Query: type (receivable | payable), status (pending | cleared | bounced | deposited)
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'all'
    const status = searchParams.get('status') || 'all'

    const where: any = { tenantId }
    if (type !== 'all') where.type = type
    if (status !== 'all') where.status = status

    const checks = await tenantDb.check.findMany({
      where,
      orderBy: { dueDate: 'asc' },
    }).catch(() => [])

    return NextResponse.json({
      success: true,
      data: { checks },
    })
  } catch (error: any) {
    console.error('[Checks GET] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری چک‌ها' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/checks — ثبت چک جدید
//  Body: {
//    type: 'receivable' | 'payable',
//    checkNumber, bankName, branchName?, amount,
//    issueDate, dueDate, customerId?, payeeName?, description?,
//  }
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id

    const body = await req.json()
    const {
      type = 'receivable',
      checkNumber,
      bankName,
      branchName,
      amount,
      issueDate,
      dueDate,
      customerId,
      payeeName,
      description,
    } = body

    // ★ اعتبارسنجی
    if (!checkNumber || !bankName || !amount || !dueDate) {
      return NextResponse.json(
        { success: false, error: 'شماره چک، بانک، مبلغ و سررسید الزامی است' },
        { status: 400 }
      )
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'مبلغ چک باید بزرگتر از صفر باشد' },
        { status: 400 }
      )
    }
    if (!['receivable', 'payable'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'نوع چک نامعتبر است' },
        { status: 400 }
      )
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    const result = await txClient.$transaction(async (tx: any) => {
      // ۱. ایجاد چک
      const check = await tx.check.create({
        data: {
          tenantId,
          type,
          checkNumber: checkNumber.trim(),
          bankName: bankName.trim(),
          branchName: branchName?.trim() || null,
          amount,
          issueDate: issueDate ? new Date(issueDate) : new Date(),
          dueDate: new Date(dueDate),
          customerId: customerId || null,
          payeeName: payeeName?.trim() || null,
          description: description?.trim() || null,
          status: 'pending',
        },
      })

      // ۲. صدور سند حسابداری خودکار
      const accounts = await tx.account.findMany({ where: { tenantId } })
      const findAccountByCode = (code: string) => accounts.find((a: any) => a.code === code) || null

      let checkAccountId: string | null = null
      let counterpartAccountId: string | null = null

      if (type === 'receivable') {
        checkAccountId = findAccountByCode('1350')?.id || null
        counterpartAccountId = (customerId ? findAccountByCode('1310') : findAccountByCode('4100'))?.id || null
      } else {
        checkAccountId = findAccountByCode('2050')?.id || null
        counterpartAccountId = (customerId ? findAccountByCode('2010') : findAccountByCode('5100'))?.id || null
      }

      if (checkAccountId && counterpartAccountId) {
        const jeCount = await tx.journalEntry.count({ where: { tenantId } })
        const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

        const lines: any[] = []

        if (type === 'receivable') {
          lines.push({
            accountId: checkAccountId,
            debit: amount,
            credit: 0,
            description: `بدهکار: چک دریافتی ${checkNumber} - ${bankName}`,
          })
          lines.push({
            accountId: counterpartAccountId,
            debit: 0,
            credit: amount,
            description: `بستانکار: بابت چک دریافتی ${checkNumber}`,
          })
        } else {
          lines.push({
            accountId: counterpartAccountId,
            debit: amount,
            credit: 0,
            description: `بدهکار: بابت چک پرداختنی ${checkNumber}`,
          })
          lines.push({
            accountId: checkAccountId,
            debit: 0,
            credit: amount,
            description: `بستانکار: چک پرداختنی ${checkNumber} - ${bankName}`,
          })
        }

        const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0)
        const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0)

        const journalEntry = await tx.journalEntry.create({
          data: {
            number: jeNumber,
            date: new Date(),
            description: `سند خودکار بابت چک ${type === 'receivable' ? 'دریافتی' : 'پرداختنی'} ${checkNumber}`,
            status: 'posted',
            sourceType: 'check',
            sourceId: check.id,
            totalDebit,
            totalCredit,
            createdBy: userId || null,
            tenantId,
            lines: { create: lines },
          },
        })

        await tx.check.update({
          where: { id: check.id },
          data: { journalEntryId: journalEntry.id },
        })
      }

      return check
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: `چک ${type === 'receivable' ? 'دریافتی' : 'پرداختنی'} با موفقیت ثبت شد`,
    })
  } catch (error: any) {
    console.error('[Checks POST] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در ثبت چک' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/checks — ویرایش چک یا تغییر وضعیت
//  ★★★ v9.0: ویرایش چک + ابطال سند قدیم + صدور سند جدید داخل Transaction
// ═══════════════════════════════════════════════════════════════
export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id
    const body = await req.json()

    // ★ اگه action: 'edit' هست، ویرایش چک
    if (body.action === 'edit' && body.id) {
      const check = await tenantDb.check.findFirst({
        where: { id: body.id, tenantId },
      })

      if (!check) {
        return NextResponse.json(
          { success: false, error: 'چک یافت نشد' },
          { status: 404 }
        )
      }

      // ★★★ v9.0: ویرایش + ابطال سند قدیم + صدور سند جدید داخل Transaction
      const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

      await txClient.$transaction(async (tx: any) => {
        // ۱. به‌روزرسانی چک
        await tx.check.update({
          where: { id: check.id },
          data: {
            checkNumber: body.checkNumber || check.checkNumber,
            bankName: body.bankName || check.bankName,
            branchName: body.branchName || null,
            amount: body.amount ? parseFloat(body.amount) : check.amount,
            dueDate: body.dueDate ? new Date(body.dueDate) : check.dueDate,
            payeeName: body.payeeName || null,
            description: body.description || null,
          },
        })

        // ۲. ابطال سند قدیم (اگر وجود دارد)
        if (check.journalEntryId) {
          await tx.journalEntry.update({
            where: { id: check.journalEntryId },
            data: {
              status: 'cancelled',
              isCancelled: true,
              cancelledAt: new Date(),
              cancelReason: `ویرایش چک ${check.checkNumber}`,
              description: `ابطال شده — ویرایش چک ${check.checkNumber}`,
            },
          }).catch((err: any) => console.warn('[Checks PUT edit] Failed to cancel old JE:', err?.message))
        }

        // ۳. صدور سند جدید با مقادیر به‌روز (فقط اگر چک هنوز pending است)
        if (check.status === 'pending') {
          const newAmount = body.amount ? parseFloat(body.amount) : check.amount
          const accounts = await tx.account.findMany({ where: { tenantId } })
          const findAccountByCode = (code: string) => accounts.find((a: any) => a.code === code) || null

          let checkAccountId: string | null = null
          let counterpartAccountId: string | null = null

          if (check.type === 'receivable') {
            checkAccountId = findAccountByCode('1350')?.id || null
            counterpartAccountId = (check.customerId ? findAccountByCode('1310') : findAccountByCode('4100'))?.id || null
          } else {
            checkAccountId = findAccountByCode('2050')?.id || null
            counterpartAccountId = (check.customerId ? findAccountByCode('2010') : findAccountByCode('5100'))?.id || null
          }

          if (checkAccountId && counterpartAccountId) {
            const jeCount = await tx.journalEntry.count({ where: { tenantId } })
            const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

            const lines: any[] = []

            if (check.type === 'receivable') {
              lines.push({ accountId: checkAccountId, debit: newAmount, credit: 0, description: `بدهکار: چک دریافتی ${body.checkNumber || check.checkNumber}` })
              lines.push({ accountId: counterpartAccountId, debit: 0, credit: newAmount, description: `بستانکار: بابت چک دریافتی` })
            } else {
              lines.push({ accountId: counterpartAccountId, debit: newAmount, credit: 0, description: `بدهکار: بابت چک پرداختنی` })
              lines.push({ accountId: checkAccountId, debit: 0, credit: newAmount, description: `بستانکار: چک پرداختنی ${body.checkNumber || check.checkNumber}` })
            }

            const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0)
            const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0)

            const newJE = await tx.journalEntry.create({
              data: {
                number: jeNumber,
                date: new Date(),
                description: `سند خودکار (ویرایش) بابت چک ${body.checkNumber || check.checkNumber}`,
                status: 'posted',
                sourceType: 'check',
                sourceId: check.id,
                totalDebit,
                totalCredit,
                createdBy: userId || null,
                tenantId,
                lines: { create: lines },
              },
            })

            await tx.check.update({
              where: { id: check.id },
              data: { journalEntryId: newJE.id },
            })
          }
        }
      })

      return NextResponse.json({
        success: true,
        message: 'چک ویرایش شد',
      })
    }

    // ★ در غیر این صورت، تغییر وضعیت
    return handleCheckStatus(req, ctx, tenant)
  } catch (error: any) {
    console.error('[Checks PUT] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در پردازش' },
      { status: 500 }
    )
  }
})

export const PATCH = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  return handleCheckStatus(req, ctx, tenant)
})

// ★ تابع مشترک برای تغییر وضعیت چک
async function handleCheckStatus(req: NextRequest, ctx: any, tenant: any) {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id

    const body = await req.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: 'شناسه چک و وضعیت جدید الزامی است' },
        { status: 400 }
      )
    }

    if (!['cleared', 'bounced', 'deposited', 'pending'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'وضعیت نامعتبر است' },
        { status: 400 }
      )
    }

    const check = await tenantDb.check.findFirst({
      where: { id, tenantId },
    })

    if (!check) {
      return NextResponse.json(
        { success: false, error: 'چک یافت نشد' },
        { status: 404 }
      )
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    await txClient.$transaction(async (tx: any) => {
      // ۱. به‌روزرسانی وضعیت چک
      await tx.check.update({
        where: { id: check.id },
        data: { status },
      })

      // ۲. صدور سند برای وصول یا برگشت
      if (status === 'cleared' || status === 'bounced') {
        const accounts = await tx.account.findMany({ where: { tenantId } })
        const findAccountByCode = (code: string) => accounts.find((a: any) => a.code === code) || null

        const bankAccount = findAccountByCode('1100')
        const checkRecvAccount = findAccountByCode('1350')
        const checkPayAccount = findAccountByCode('2050')

        const lines: any[] = []

        if (check.type === 'receivable') {
          if (status === 'cleared') {
            if (bankAccount && checkRecvAccount) {
              lines.push({
                accountId: bankAccount.id,
                debit: check.amount,
                credit: 0,
                description: `بدهکار: وصول چک دریافتی ${check.checkNumber}`,
              })
              lines.push({
                accountId: checkRecvAccount.id,
                debit: 0,
                credit: check.amount,
                description: `بستانکار: تسویه چک دریافتی ${check.checkNumber}`,
              })
            }
          } else if (status === 'bounced') {
            const receivableAccount = findAccountByCode('1310')
            if (receivableAccount && checkRecvAccount) {
              lines.push({
                accountId: receivableAccount.id,
                debit: check.amount,
                credit: 0,
                description: `بدهکار: برگشت چک دریافتی ${check.checkNumber}`,
              })
              lines.push({
                accountId: checkRecvAccount.id,
                debit: 0,
                credit: check.amount,
                description: `بستانکار: برگشت چک دریافتی ${check.checkNumber}`,
              })
            }
          }
        } else {
          if (status === 'cleared') {
            if (checkPayAccount && bankAccount) {
              lines.push({
                accountId: checkPayAccount.id,
                debit: check.amount,
                credit: 0,
                description: `بدهکار: تسویه چک پرداختنی ${check.checkNumber}`,
              })
              lines.push({
                accountId: bankAccount.id,
                debit: 0,
                credit: check.amount,
                description: `بستانکار: پرداخت چک ${check.checkNumber} از بانک`,
              })
            }
          } else if (status === 'bounced') {
            const payableAccount = findAccountByCode('2010')
            if (checkPayAccount && payableAccount) {
              lines.push({
                accountId: checkPayAccount.id,
                debit: check.amount,
                credit: 0,
                description: `بدهکار: برگشت چک پرداختنی ${check.checkNumber}`,
              })
              lines.push({
                accountId: payableAccount.id,
                debit: 0,
                credit: check.amount,
                description: `بستانکار: برگشت چک پرداختنی ${check.checkNumber}`,
              })
            }
          }
        }

        if (lines.length >= 2) {
          const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0)
          const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0)

          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

          await tx.journalEntry.create({
            data: {
              number: jeNumber,
              date: new Date(),
              description: `سند خودکار — ${status === 'cleared' ? 'وصول' : 'برگشت'} چک ${check.checkNumber}`,
              status: 'posted',
              sourceType: 'check_status',
              sourceId: check.id,
              totalDebit,
              totalCredit,
              createdBy: userId || null,
              tenantId,
              lines: { create: lines },
            },
          })
        }
      }
    })

    const statusLabels: Record<string, string> = {
      cleared: 'وصول شد',
      bounced: 'برگشت خورد',
      deposited: 'به بانک سپرده شد',
      pending: 'در انتظار',
    }

    return NextResponse.json({
      success: true,
      message: `چک ${statusLabels[status] || status}`,
    })
  } catch (error: any) {
    console.error('[Checks PATCH] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در تغییر وضعیت چک' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/checks — حذف چک
//  ★★★ v9.0: ابطال سند + حذف چک داخل یک Transaction
//  Query: id
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه چک الزامی است' },
        { status: 400 }
      )
    }

    const check = await tenantDb.check.findFirst({
      where: { id, tenantId },
    })

    if (!check) {
      return NextResponse.json(
        { success: false, error: 'چک یافت نشد' },
        { status: 404 }
      )
    }

    // ★★★ v9.0: ابطال سند + حذف چک داخل یک Transaction
    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    await txClient.$transaction(async (tx: any) => {
      // ۱. ابطال سند مربوطه (اگه وجود داره)
      if (check.journalEntryId) {
        await tx.journalEntry.update({
          where: { id: check.journalEntryId },
          data: {
            status: 'cancelled',
            isCancelled: true,
            cancelledAt: new Date(),
            cancelReason: `حذف چک ${check.checkNumber}`,
            description: `ابطال شده — حذف چک ${check.checkNumber}`,
          },
        }).catch((err: any) => console.warn('[Checks DELETE] Failed to cancel JE:', err?.message))
      }

      // ۲. ابطال سندهای تغییر وضعیت مرتبط (sourceType: 'check_status')
      await tx.journalEntry.updateMany({
        where: { sourceType: 'check_status', sourceId: check.id, tenantId },
        data: {
          status: 'cancelled',
          isCancelled: true,
          cancelledAt: new Date(),
          cancelReason: `حذف چک ${check.checkNumber}`,
        },
      }).catch((err: any) => console.warn('[Checks DELETE] Failed to cancel status JEs:', err?.message))

      // ۳. حذف چک
      await tx.check.delete({ where: { id } })
    })

    return NextResponse.json({
      success: true,
      message: 'چک حذف شد',
    })
  } catch (error: any) {
    console.error('[Checks DELETE] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در حذف چک' },
      { status: 500 }
    )
  }
})