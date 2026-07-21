// src/app/api/initial-balance/route.ts — v8.8.7 (FIXED)
// ============================================================================
// ویزارد راه‌اندازی اولیه فروشگاه
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  GET /api/initial-balance — دریافت موجودی‌های اولیه ثبت‌شده
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('settings')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantId = tenant.tenantId
    console.log('[InitialBalance GET] tenantId:', tenantId)

    // ✅ استفاده مستقیم از db.client
    const balances = await db.client.initialBalance.findMany({
      where: { tenantId },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    }).catch((err: any) => {
      console.error('[InitialBalance GET] query error:', err?.message)
      return []
    })

    console.log('[InitialBalance GET] found:', balances.length, 'balances')

    const totalAssets = balances
      .filter((b: any) => ['cash', 'bank', 'inventory', 'fixed_asset'].includes(b.type))
      .reduce((sum: number, b: any) => sum + b.amount, 0)

    const totalLiabilities = balances
      .filter((b: any) => b.type === 'liability')
      .reduce((sum: number, b: any) => sum + b.amount, 0)

    const summary = {
      totalAssets,
      totalLiabilities,
      equity: totalAssets - totalLiabilities,
      isPosted: balances.length > 0 && balances.some((b: any) => b.isPosted),
      journalEntryId: balances.find((b: any) => b.journalEntryId)?.journalEntryId || null,
      count: balances.length,
    }

    return NextResponse.json({
      success: true,
      data: balances,
      summary,
    })
  } catch (error: any) {
    console.error('[InitialBalance GET] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در بارگذاری' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/initial-balance — ثبت موجودی‌های اولیه + سند افتتاحیه
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('settings')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id

    console.log('[InitialBalance POST] tenantId:', tenantId)

    const body = await req.json()
    const { items = [], postToJournal = false } = body

    console.log('[InitialBalance POST] items:', items.length, 'postToJournal:', postToJournal)

    // ★ اعتبارسنجی
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'حداقل یک آیتم الزامی است' },
        { status: 400 }
      )
    }

    const validTypes = ['cash', 'bank', 'inventory', 'fixed_asset', 'liability']
    for (const item of items) {
      if (!validTypes.includes(item.type)) {
        return NextResponse.json(
          { success: false, error: `نوع نامعتبر: ${item.type}` },
          { status: 400 }
        )
      }
      if (!item.title?.trim()) {
        return NextResponse.json(
          { success: false, error: 'عنوان هر آیتم الزامی است' },
          { status: 400 }
        )
      }
      if (typeof item.amount !== 'number' || item.amount <= 0) {
        return NextResponse.json(
          { success: false, error: `مبلغ نامعتبر برای: ${item.title}` },
          { status: 400 }
        )
      }
    }

    // ★ تراکنش
    const result = await db.client.$transaction(async (tx: any) => {
      // ۱. حذف موجودی‌های قدیمی
      await tx.initialBalance.deleteMany({ where: { tenantId } }).catch(() => {})

      // ۲. ایجاد موجودی‌های جدید
      const createdBalances = await Promise.all(
        items.map((item: any) =>
          tx.initialBalance.create({
            data: {
              tenantId,
              type: item.type,
              title: item.title.trim(),
              amount: item.amount,
              accountId: item.accountId || null,
              productId: item.productId || null,
              quantity: item.quantity || null,
              description: item.description?.trim() || null,
              isPosted: false,
            },
          })
        )
      )

      console.log('[InitialBalance POST] Created balances:', createdBalances.length)

      // ۳. صدور سند افتتاحیه
      let journalEntryId: string | null = null

      if (postToJournal && createdBalances.length > 0) {
        console.log('[InitialBalance POST] Creating journal entry...')

        const accounts = await tx.account.findMany({ where: { tenantId } })
        const findAccountByCode = (code: string) => accounts.find(a => a.code === code)

        const lines: any[] = []

        // ★ دارایی‌ها (Debit)
        for (const bal of createdBalances.filter((b: any) =>
          ['cash', 'bank', 'inventory', 'fixed_asset'].includes(b.type)
        )) {
          let accountId: string | null = null

          switch (bal.type) {
            case 'cash':
              accountId = bal.accountId || findAccountByCode('1010')?.id
              break
            case 'bank':
              accountId = bal.accountId || findAccountByCode('1100')?.id
              break
            case 'inventory':
              accountId = bal.accountId || findAccountByCode('1200')?.id
              break
            case 'fixed_asset':
              accountId = bal.accountId || findAccountByCode('1400')?.id
              break
          }

          if (accountId) {
            lines.push({
              accountId,
              debit: bal.amount,
              credit: 0,
              description: `${bal.title} — موجودی اولیه`,
            })
          }
        }

        // ★ بدهی‌ها (Credit)
        for (const bal of createdBalances.filter((b: any) => b.type === 'liability')) {
          const accountId = bal.accountId || findAccountByCode('2100')?.id

          if (accountId) {
            lines.push({
              accountId,
              debit: 0,
              credit: bal.amount,
              description: `${bal.title} — بدهی اولیه`,
            })
          }
        }

        // ★ سرمایه (Credit)
        const totalAssets = createdBalances
          .filter((b: any) => ['cash', 'bank', 'inventory', 'fixed_asset'].includes(b.type))
          .reduce((s: number, b: any) => s + b.amount, 0)

        const totalLiabilities = createdBalances
          .filter((b: any) => b.type === 'liability')
          .reduce((s: number, b: any) => s + b.amount, 0)

        const totalEquity = totalAssets - totalLiabilities

        const equityAccount = findAccountByCode('3000')
        if (equityAccount && totalEquity > 0) {
          lines.push({
            accountId: equityAccount.id,
            debit: 0,
            credit: totalEquity,
            description: 'سرمایه مالک — سند افتتاحیه',
          })
        }

        if (lines.length >= 2) {
          const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0)
          const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0)

          console.log('[InitialBalance POST] Journal totals:', { totalDebit, totalCredit })

          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

          const journalEntry = await tx.journalEntry.create({
            data: {
              number: jeNumber,
              date: new Date(),
              description: 'سند افتتاحیه — راه‌اندازی اولیه فروشگاه',
              status: 'posted',
              sourceType: 'initial_balance',
              totalDebit,
              totalCredit,
              createdBy: userId || null,
              tenantId,
              lines: { create: lines },
            },
            include: { lines: true },
          })

          journalEntryId = journalEntry.id
          console.log('[InitialBalance POST] Journal created:', journalEntryId, 'with', lines.length, 'lines')

          // ★ به‌روزرسانی initialBalance
          await tx.initialBalance.updateMany({
            where: { tenantId },
            data: {
              journalEntryId,
              isPosted: true,
            },
          })
        }
      }

      return { createdBalances, journalEntryId }
    })

    return NextResponse.json({
      success: true,
      data: {
        count: result.createdBalances.length,
        journalEntryId: result.journalEntryId,
        isPosted: !!result.journalEntryId,
      },
      message: result.journalEntryId
        ? '✅ موجودی‌های اولیه ثبت شد و سند افتتاحیه صادر گردید'
        : '✅ موجودی‌های اولیه ذخیره شد',
    })
  } catch (error: any) {
    console.error('[InitialBalance POST] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در ثبت' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/initial-balance — حذف موجودی‌های اولیه + سند افتتاحیه
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantAndPermission('settings')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantId = tenant.tenantId
    console.log('[InitialBalance DELETE] tenantId:', tenantId)

    const result = await db.client.$transaction(async (tx: any) => {
      // ۱. پیدا کردن موجودی‌های اولیه
      const balances = await tx.initialBalance.findMany({ where: { tenantId } })
      console.log('[InitialBalance DELETE] found:', balances.length, 'balances')

      // ۲. ابطال اسناد
      for (const bal of balances) {
        if (bal.journalEntryId) {
          await tx.journalEntry.update({
            where: { id: bal.journalEntryId },
            data: {
              isCancelled: true,
              status: 'cancelled',
            },
          }).catch(() => {})
        }
      }

      // ۳. حذف موجودی‌ها
      const deleted = await tx.initialBalance.deleteMany({ where: { tenantId } })

      return { deletedCount: deleted.count }
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: '✅ موجودی‌های اولیه حذف شد',
    })
  } catch (error: any) {
    console.error('[InitialBalance DELETE] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در حذف' },
      { status: 500 }
    )
  }
})