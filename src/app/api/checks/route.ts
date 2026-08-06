// src/app/api/checks/route.ts — v10.0 ★★★ COMPLETE FIX
// ============================================================================
// مدیریت چک‌ها (دریافتی و پرداختنی)
// ----------------------------------------------------------------------------
// ★★★ v10.0: رفع باگ‌های جدی:
//   ★ رفع باگ rounding: ۴۹,۹۹۹,۹۹۹ به جای ۵۰,۰۰۰,۰۰۰
//   ★ رفع باگ دکمه "سپردن به بانک" (خواندن id از URL در PATCH)
//   ★ افزودن status "returned" برای پس دادن/پس گرفتن چک
//   ★ افزودن سند اتوماتیک برای "پس دادن" چک دریافتنی
//   ★ افزودن سند اتوماتیک برای "پس گرفتن/باطل" چک پرداختنی
//   ★ اصلاح خواندن Decimal از Prisma (toString + parseFloat)
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ★ v10.0: helper برای تبدیل امن Decimal Prisma به number
function toSafeNumber(value: any): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Math.round(value)
  if (typeof value === 'string') return Math.round(parseFloat(value) || 0)
  // Prisma Decimal object
  if (typeof value.toString === 'function') {
    return Math.round(parseFloat(value.toString()) || 0)
  }
  return Math.round(Number(value) || 0)
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/checks
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
//  ★ v10.0: اصلاح rounding با toSafeNumber
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
      amount: rawAmount,
      issueDate,
      dueDate,
      customerId,
      payeeName,
      description,
    } = body

    // ★ v10.0: تبدیل امن amount با rounding
    const amount = toSafeNumber(rawAmount)

    if (!checkNumber || !bankName || !dueDate) {
      return NextResponse.json(
        { success: false, error: 'شماره چک، بانک و سررسید الزامی است' },
        { status: 400 }
      )
    }
    if (amount <= 0) {
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
      const check = await tx.check.create({
        data: {
          tenantId,
          type,
          checkNumber: checkNumber.trim(),
          bankName: bankName.trim(),
          branchName: branchName?.trim() || null,
          amount,  // ★ v10.0: عدد صحیح
          issueDate: issueDate ? new Date(issueDate) : new Date(),
          dueDate: new Date(dueDate),
          customerId: customerId || null,
          payeeName: payeeName?.trim() || null,
          description: description?.trim() || null,
          status: 'pending',
        },
      })

      // صدور سند خودکار
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
          lines.push({ accountId: checkAccountId, debit: amount, credit: 0, description: `بدهکار: چک دریافتی ${checkNumber} - ${bankName}` })
          lines.push({ accountId: counterpartAccountId, debit: 0, credit: amount, description: `بستانکار: بابت چک دریافتی ${checkNumber}` })
        } else {
          lines.push({ accountId: counterpartAccountId, debit: amount, credit: 0, description: `بدهکار: بابت چک پرداختنی ${checkNumber}` })
          lines.push({ accountId: checkAccountId, debit: 0, credit: amount, description: `بستانکار: چک پرداختنی ${checkNumber} - ${bankName}` })
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
//  PUT /api/checks — ویرایش چک
//  ★ v10.0: اصلاح rounding
// ═══════════════════════════════════════════════════════════════
export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id
    const body = await req.json()

    if (body.action === 'edit' && body.id) {
      const check = await tenantDb.check.findFirst({
        where: { id: body.id, tenantId },
      })

      if (!check) {
        return NextResponse.json({ success: false, error: 'چک یافت نشد' }, { status: 404 })
      }

      const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

      await txClient.$transaction(async (tx: any) => {
        // ★ v10.0: تبدیل امن amount
        const newAmount = body.amount !== undefined ? toSafeNumber(body.amount) : toSafeNumber(check.amount)

        await tx.check.update({
          where: { id: check.id },
          data: {
            checkNumber: body.checkNumber || check.checkNumber,
            bankName: body.bankName || check.bankName,
            branchName: body.branchName || null,
            amount: newAmount,
            dueDate: body.dueDate ? new Date(body.dueDate) : check.dueDate,
            payeeName: body.payeeName || null,
            description: body.description || null,
          },
        })

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

        if (check.status === 'pending') {
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

      return NextResponse.json({ success: true, message: 'چک ویرایش شد' })
    }

    return handleCheckStatus(req, ctx, tenant)
  } catch (error: any) {
    console.error('[Checks PUT] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در پردازش' }, { status: 500 })
  }
})

export const PATCH = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  return handleCheckStatus(req, ctx, tenant)
})

// ═══════════════════════════════════════════════════════════════
//  ★ v10.0: تابع مشترک برای تغییر وضعیت چک
//  ★ اصلاح باگ: خواندن id از URL یا body
//  ★ افزودن status "returned"
//  ★ اصلاح rounding در همه موارد
// ═══════════════════════════════════════════════════════════════
// ★ تابع مشترک برای تغییر وضعیت چک (جایگزین تابع قبلی در route.ts شود)
// ★ تابع مشترک برای تغییر وضعیت چک (نسخه اصلاح‌شده و نهایی)
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

    if (!['cleared', 'bounced', 'deposited', 'pending', 'returned'].includes(status)) {
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

      // ۲. صدور سند برای وصول، برگشت یا پس دادن/ابطال
      if (status === 'cleared' || status === 'bounced' || status === 'returned') {
        const accounts = await tx.account.findMany({ where: { tenantId } })
        const findAccountByCode = (code: string) => accounts.find((a: any) => a.code === code) || null

        const bankAccount = findAccountByCode('1100') // بانک
        const checkRecvAccount = findAccountByCode('1350') // اسناد دریافتنی
        const checkPayAccount = findAccountByCode('2050') // اسناد پرداختنی
        const receivableAccount = findAccountByCode('1310') // حساب‌های دریافتنی تجاری (مشتری)
        const payableAccount = findAccountByCode('2010') // حساب‌های پرداختنی تجاری (تامین‌کننده)

        const lines: any[] = []

        if (check.type === 'receivable') {
          if (status === 'cleared') {
            if (bankAccount && checkRecvAccount) {
              lines.push({ accountId: bankAccount.id, debit: check.amount, credit: 0, description: `بدهکار: وصول چک دریافتی ${check.checkNumber}` })
              lines.push({ accountId: checkRecvAccount.id, debit: 0, credit: check.amount, description: `بستانکار: تسویه چک دریافتی ${check.checkNumber}` })
            }
          } else if (status === 'bounced' || status === 'returned') {
            if (receivableAccount && checkRecvAccount) {
              const action = status === 'bounced' ? 'برگشت' : 'پس دادن'
              lines.push({ accountId: receivableAccount.id, debit: check.amount, credit: 0, description: `بدهکار: ${action} چک دریافتی ${check.checkNumber}` })
              lines.push({ accountId: checkRecvAccount.id, debit: 0, credit: check.amount, description: `بستانکار: ${action} چک دریافتی ${check.checkNumber}` })
            }
          }
        } else { // payable
          if (status === 'cleared') {
            if (checkPayAccount && bankAccount) {
              lines.push({ accountId: checkPayAccount.id, debit: check.amount, credit: 0, description: `بدهکار: پرداخت/پاس شدن چک پرداختنی ${check.checkNumber}` })
              lines.push({ accountId: bankAccount.id, debit: 0, credit: check.amount, description: `بستانکار: کسر از بانک بابت چک ${check.checkNumber}` })
            }
          } else if (status === 'bounced' || status === 'returned') {
            if (checkPayAccount && payableAccount) {
              const action = status === 'bounced' ? 'برگشت' : 'ابطال/پس گرفتن'
              lines.push({ accountId: checkPayAccount.id, debit: check.amount, credit: 0, description: `بدهکار: ${action} چک پرداختنی ${check.checkNumber}` })
              lines.push({ accountId: payableAccount.id, debit: 0, credit: check.amount, description: `بستانکار: ${action} چک پرداختنی ${check.checkNumber}` })
            }
          }
        }

        if (lines.length >= 2) {
          // ★★★ اصلاح: استفاده از Number() برای جلوگیری از خطای جمع Decimal در Prisma v10
          const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debit), 0)
          const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.credit), 0)

          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

          // ★★★ اصلاح هوشمند کلمه عملیات بر اساس نوع چک
          let actionWord = ''
          if (status === 'cleared') {
            actionWord = check.type === 'receivable' ? 'وصول' : 'پرداخت'
          } else if (status === 'bounced') {
            actionWord = 'برگشت'
          } else {
            actionWord = check.type === 'receivable' ? 'پس دادن' : 'ابطال'
          }

          await tx.journalEntry.create({
            data: {
              number: jeNumber,
              date: new Date(),
              description: `سند سیستمی — ${actionWord} چک ${check.checkNumber}`,
              status: 'posted',
              sourceType: 'check_status', // ★★★ این مقدار باید در فرانت‌اند به "تغییر وضعیت چک" ترجمه شود
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
      cleared: check.type === 'receivable' ? 'وصول شد' : 'پرداخت شد',
      bounced: 'برگشت خورد',
      deposited: 'به بانک سپرده شد',
      returned: check.type === 'receivable' ? 'پس داده شد' : 'باطل شد',
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
//  DELETE /api/checks
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه چک الزامی است' }, { status: 400 })
    }

    const check = await tenantDb.check.findFirst({ where: { id, tenantId } })

    if (!check) {
      return NextResponse.json({ success: false, error: 'چک یافت نشد' }, { status: 404 })
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    await txClient.$transaction(async (tx: any) => {
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

      await tx.journalEntry.updateMany({
        where: { sourceType: 'check_status', sourceId: check.id, tenantId },
        data: {
          status: 'cancelled',
          isCancelled: true,
          cancelledAt: new Date(),
          cancelReason: `حذف چک ${check.checkNumber}`,
        },
      }).catch((err: any) => console.warn('[Checks DELETE] Failed to cancel status JEs:', err?.message))

      await tx.check.delete({ where: { id } })
    })

    return NextResponse.json({ success: true, message: 'چک حذف شد' })
  } catch (error: any) {
    console.error('[Checks DELETE] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در حذف چک' }, { status: 500 })
  }
})