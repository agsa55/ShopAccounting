// ============================================================================
// src/app/api/initial-balance/route.ts — GET/POST/PUT/DELETE (v10.9)
// ★ v10.9: Idempotency + جلوگیری از Double Submit + تراز بودن سند
// ★ v10.9.1: اصلاح کامل type safety برای TypeScript
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ─── Type تعریف‌ها برای TypeScript ─────────────────────────────
interface BalanceData {
  id: string
  accountId?: string | null
  type?: string
  title?: string
  amount?: number
  debitAmount?: number
  creditAmount?: number
  description?: string
  fiscalYearId?: string | null
  journalEntryId?: string | null
  tenantId: string
  account?: {
    id: string
    code: string
    name: string
  } | null
  journalEntry?: {
    id: string
    number: string
    status: string
  } | null
  createdAt?: Date
  updatedAt?: Date
}

interface ItemInput {
  accountId?: string
  type?: string
  title?: string
  amount?: number | string
  debitAmount?: number | string
  creditAmount?: number | string
  description?: string
}

// ─── GET: دریافت موجودی‌های اولیه ─────────────────────────────
export const GET = withTenantAndPermission('accounting')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    console.log('[InitialBalance GET] tenantId:', tenantId)

    const balances: BalanceData[] = await tenantDb.initialBalance.findMany({
      where: { tenantId },
      include: {
        account: {
          select: { id: true, code: true, name: true },
        },
        journalEntry: {
          select: { id: true, number: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    let totalDebit = 0
    let totalCredit = 0
    let isPosted = false

    for (const b of balances) {
      totalDebit += Number(b.debitAmount) || 0
      totalCredit += Number(b.creditAmount) || 0
      if (b.journalEntry) isPosted = true
    }

    console.log('[InitialBalance GET] found:', balances.length, 'balances, isPosted:', isPosted)

    return NextResponse.json({
      success: true,
      data: balances,
      summary: {
        totalDebit,
        totalCredit,
        isPosted,
        count: balances.length,
      },
    })
  } catch (error: any) {
    console.error('[InitialBalance GET] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در دریافت موجودی اولیه' },
      { status: 500 }
    )
  }
})

// ─── POST: ثبت موجودی اولیه + ایجاد سند افتتاحیه ─────────────
export const POST = withTenantAndPermission('accounting')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    console.log('[InitialBalance POST] tenantId:', tenantId)
    console.log('[InitialBalance POST] items:', body.items?.length, 'postToJournal:', body.postToJournal)

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'حداقل یک آیتم موجودی اولیه الزامی است' },
        { status: 400 }
      )
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ v10.9: Idempotency — اگر postToJournal=true، چک کن قبلاً ثبت نشده
    // ═══════════════════════════════════════════════════════════════
    if (body.postToJournal) {
      try {
        const existingJournal = await tenantDb.journalEntry.findFirst({
          where: {
            tenantId,
            sourceType: 'initial_balance',
            isCancelled: false,
          },
        })

        if (existingJournal) {
          console.warn('[InitialBalance POST] ⚠️ Opening journal already exists, skipping...')
          return NextResponse.json({
            success: true,
            message: 'سند افتتاحیه قبلاً ایجاد شده است',
            data: { skipped: true, existingJournalId: existingJournal.id },
          })
        }

        const existingBalanceWithJournal = await tenantDb.initialBalance.findFirst({
          where: {
            tenantId,
            journalEntryId: { not: null },
          },
        })

        if (existingBalanceWithJournal) {
          console.warn('[InitialBalance POST] ⚠️ Balance with journal exists, skipping...')
          return NextResponse.json({
            success: true,
            message: 'موجودی اولیه با سند قبلاً ثبت شده است',
            data: { skipped: true, existingId: existingBalanceWithJournal.id },
          })
        }
      } catch (err) {
        console.warn('[InitialBalance POST] Idempotency check failed:', err)
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ v10.9.1: تعریف نوع صریح برای آرایه (رفع خطای never[])
    // ═══════════════════════════════════════════════════════════════
    const createdBalances: BalanceData[] = []

    for (const rawItem of body.items as ItemInput[]) {
      const item = rawItem as any
      
      if (!item.accountId && !item.type) {
        console.warn('[InitialBalance POST] Skipping item without accountId or type')
        continue
      }

      try {
        const balance: BalanceData = await tenantDb.initialBalance.create({
          data: {
            tenantId,
            accountId: item.accountId || null,
            type: item.type || 'cash',
            title: item.title || item.description || 'موجودی اولیه',
            amount: Number(item.amount || item.debitAmount || item.creditAmount) || 0,
            debitAmount: Number(item.debitAmount) || 0,
            creditAmount: Number(item.creditAmount) || 0,
            description: item.description || item.title || 'موجودی اولیه',
            fiscalYearId: body.fiscalYearId || null,
          },
          include: {
            account: {
              select: { id: true, code: true, name: true },
            },
          },
        })
        createdBalances.push(balance)
      } catch (err: any) {
        console.error('[InitialBalance POST] Create balance failed:', err)
        if (err?.code === 'P2002') {
          return NextResponse.json({
            success: true,
            message: 'موجودی اولیه قبلاً ثبت شده است',
            data: { skipped: true },
          })
        }
        return NextResponse.json(
          { success: false, error: `خطا در ثبت موجودی: ${err?.message}` },
          { status: 500 }
        )
      }
    }

    console.log('[InitialBalance POST] Created balances:', createdBalances.length)

    // ═══════════════════════════════════════════════════════════════
    //  ایجاد سند افتتاحیه (فقط اگر postToJournal=true)
    // ═══════════════════════════════════════════════════════════════
    if (body.postToJournal && createdBalances.length > 0) {
      console.log('[InitialBalance POST] Creating journal entry...')

      try {
        const journalLines: any[] = []
        let totalDebit = 0
        let totalCredit = 0

        for (const balance of createdBalances) {
          const debit = Number(balance.debitAmount) || Number(balance.amount) || 0
          const credit = Number(balance.creditAmount) || 0

          if (debit > 0) {
            journalLines.push({
              accountId: balance.accountId || null,
              description: `موجودی اولیه - ${balance.title || balance.account?.name || ''}`,
              debit,
              credit: 0,
            })
            totalDebit += debit
          }

          if (credit > 0) {
            journalLines.push({
              accountId: balance.accountId || null,
              description: `موجودی اولیه - ${balance.title || balance.account?.name || ''}`,
              debit: 0,
              credit,
            })
            totalCredit += credit
          }
        }

        console.log('[InitialBalance POST] Journal totals:', { totalDebit, totalCredit })

        if (journalLines.length < 2) {
          console.error('[InitialBalance POST] ❌ Not enough journal lines!')
          return NextResponse.json(
            { success: false, error: 'حداقل ۲ ردیف برای سند افتتاحیه لازم است' },
            { status: 400 }
          )
        }

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          console.error('[InitialBalance POST] ❌ Journal not balanced!')
          return NextResponse.json(
            {
              success: false,
              error: `سند تراز نیست. بدهکار: ${totalDebit}, بستانکار: ${totalCredit}`,
            },
            { status: 400 }
          )
        }

        let journalNumber = 'JE-000001'
        try {
          const count = await tenantDb.journalEntry.count({
            where: { tenantId },
          })
          journalNumber = `JE-${(count + 1).toString().padStart(6, '0')}`
        } catch {
          journalNumber = `JE-${Date.now().toString().slice(-6)}`
        }

        const journalEntry = await tenantDb.journalEntry.create({
          data: {
            number: journalNumber,
            tenantId,
            date: body.date ? new Date(body.date) : new Date(),
            description: 'سند افتتاحیه — راه‌اندازی اولیه فروشگاه',
            status: 'posted',
            sourceType: 'initial_balance',
            sourceId: createdBalances[0]?.id || null,
            fiscalYearId: body.fiscalYearId || null,
            totalDebit,
            totalCredit,
            createdBy: tenant.user?.id || null,
            lines: {
              create: journalLines,
            },
          },
          include: { lines: true },
        })

        try {
          for (const balance of createdBalances) {
            await tenantDb.initialBalance.update({
              where: { id: balance.id },
              data: { journalEntryId: journalEntry.id },
            })
          }
        } catch (err) {
          console.warn('[InitialBalance POST] Link to journal failed (non-critical):', err)
        }

        console.log('[InitialBalance POST] ✅ Journal created:', journalEntry.id, 'with', journalEntry.lines.length, 'lines')

        return NextResponse.json({
          success: true,
          data: {
            balances: createdBalances,
            journalEntry: {
              id: journalEntry.id,
              number: journalEntry.number,
              totalDebit,
              totalCredit,
            },
          },
          message: 'موجودی اولیه و سند افتتاحیه با موفقیت ثبت شدند',
        })
      } catch (err: any) {
        console.error('[InitialBalance POST] ❌ Journal creation failed:', err)

        if (err?.code === 'P2002') {
          console.warn('[InitialBalance POST] ⚠️ Duplicate journal detected')
          return NextResponse.json({
            success: true,
            message: 'سند افتتاحیه قبلاً ایجاد شده است',
            data: { skipped: true, balances: createdBalances },
          })
        }

        return NextResponse.json(
          { success: false, error: `خطا در ایجاد سند افتتاحیه: ${err?.message}` },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      data: createdBalances,
      message: body.postToJournal
        ? 'موجودی اولیه و سند افتتاحیه با موفقیت ثبت شدند'
        : 'موجودی اولیه به‌صورت پیش‌نویس ذخیره شد',
    })
  } catch (error: any) {
    console.error('[InitialBalance POST] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطای سرور' },
      { status: 500 }
    )
  }
})

// ─── PUT: به‌روزرسانی موجودی اولیه ─────────────────────────────
export const PUT = withTenantAndPermission('accounting')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: 'شناسه موجودی الزامی است' },
        { status: 400 }
      )
    }

    const existing: BalanceData | null = await tenantDb.initialBalance.findFirst({
      where: { id: body.id, tenantId },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'موجودی یافت نشد' },
        { status: 404 }
      )
    }

    if (existing.journalEntryId) {
      return NextResponse.json(
        { success: false, error: 'موجودی با سند ثبت شده قابل ویرایش نیست' },
        { status: 400 }
      )
    }

    const updated: BalanceData = await tenantDb.initialBalance.update({
      where: { id: body.id },
      data: {
        accountId: body.accountId ?? existing.accountId,
        type: body.type ?? existing.type,
        title: body.title ?? existing.title,
        amount: body.amount !== undefined ? Number(body.amount) : existing.amount,
        debitAmount: body.debitAmount !== undefined ? Number(body.debitAmount) : existing.debitAmount,
        creditAmount: body.creditAmount !== undefined ? Number(body.creditAmount) : existing.creditAmount,
        description: body.description ?? existing.description,
      },
      include: {
        account: { select: { id: true, code: true, name: true } },
      },
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'موجودی با موفقیت به‌روزرسانی شد',
    })
  } catch (error: any) {
    console.error('[InitialBalance PUT] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در به‌روزرسانی موجودی' },
      { status: 500 }
    )
  }
})

// ─── DELETE: حذف موجودی اولیه ────────────────────────────────
export const DELETE = withTenantAndPermission('accounting')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه موجودی الزامی است' },
        { status: 400 }
      )
    }

    const balance: BalanceData | null = await tenantDb.initialBalance.findFirst({
      where: { id, tenantId },
    })

    if (!balance) {
      return NextResponse.json(
        { success: false, error: 'موجودی یافت نشد' },
        { status: 404 }
      )
    }

    if (balance.journalEntryId) {
      return NextResponse.json(
        { success: false, error: 'موجودی با سند ثبت شده قابل حذف نیست' },
        { status: 400 }
      )
    }

    await tenantDb.initialBalance.delete({ where: { id } })

    return NextResponse.json({
      success: true,
      message: 'موجودی با موفقیت حذف شد',
    })
  } catch (error: any) {
    console.error('[InitialBalance DELETE] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در حذف موجودی' },
      { status: 500 }
    )
  }
})