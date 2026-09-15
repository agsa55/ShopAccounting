// ============================================================================
// src/app/api/fiscal-years/basic-close-preview/route.ts
// ★ v3.1: محدودیت سالی یک‌بار برای بستن حساب
// ★ همه پلن‌ها مادام‌العمر — ولی فقط سالی یک‌بار می‌توانند حساب را ببندند
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ★★★ حداقل فاصله بین دو بار بستن حساب (روز)
const MIN_DAYS_BETWEEN_CLOSES = 365

export const GET = withTenantAndPermission('pos')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    // ── ۱. شمارش اسناد ─────────────────────────────────────
    const entryCount = await tenantDb.journalEntry.count({
      where: { tenantId, status: 'posted' },
    })

    if (entryCount === 0) {
      return NextResponse.json({
        success: false,
        error: 'هیچ سند حسابداری ثبت نشده است',
      }, { status: 404 })
    }

    // ── ۲. آخرین سند اختتامیه قبلی ────────────────────────
    const existingCloseEntry = await tenantDb.journalEntry.findFirst({
      where: {
        tenantId,
        sourceType: 'fiscal_year_close',
        status: 'posted',
      },
      orderBy: { date: 'desc' },
    })

    // ── ۳. بازیابی اسناد ───────────────────────────────────
    const dateFilter = existingCloseEntry
      ? { gt: existingCloseEntry.date }
      : undefined

    const entries = await tenantDb.journalEntry.findMany({
      where: {
        tenantId,
        status: 'posted',
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      select: { id: true, date: true },
      orderBy: { date: 'asc' },
    })

    const entryIds = entries.map((e: any) => e.id)

    // ── ۴. بازیابی lines (بدون include) ───────────────────
    const allLines = entryIds.length > 0 ? await tenantDb.journalEntryLine.findMany({
      where: { journalEntryId: { in: entryIds } },
      select: {
        id: true,
        accountId: true,
        debit: true,
        credit: true,
      },
    }) : []

    // ── ۵. Manual Join: گرفتن account ها جداگانه ──────────
    const accountIdsFromLines = [...new Set(allLines.map((l: any) => l.accountId).filter(Boolean))]

    let accountsMap = new Map<string, { code: string; name: string; type: string }>()

    if (accountIdsFromLines.length > 0) {
      const accounts = await tenantDb.account.findMany({
        where: { id: { in: accountIdsFromLines } },
        select: { id: true, code: true, name: true, type: true },
      })
      accountsMap = new Map(accounts.map((a: any) => [a.id, { code: a.code, name: a.name, type: a.type || '' }]))
    }

    // ── ۶. محاسبه درآمد/هزینه/سود ──────────────────────────
    let totalRevenue = 0
    let totalExpenses = 0
    let totalCogs = 0
    const revenueMap = new Map<string, { name: string; balance: number }>()
    const expenseMap = new Map<string, { name: string; balance: number }>()

    for (const line of allLines) {
      const account = accountsMap.get(line.accountId)
      if (!account) continue

      const code = account.code || ''
      const name = account.name || ''
      const type = account.type || ''
      const debit = Number(line.debit || 0)
      const credit = Number(line.credit || 0)

      const isRevenue = code.startsWith('4') || type === 'درآمد'
      const isCogs = code === '5000' || type === 'بهای_تمام_شده'
      const isExpense = code.startsWith('51') || code.startsWith('52') || type === 'هزینه'

      if (isRevenue) {
        const balance = credit - debit
        totalRevenue += balance
        const existing = revenueMap.get(line.accountId) || { name, balance: 0 }
        existing.balance += balance
        revenueMap.set(line.accountId, existing)
      } else if (isCogs) {
        const balance = debit - credit
        totalCogs += balance
        const existing = expenseMap.get(line.accountId) || { name, balance: 0 }
        existing.balance += balance
        expenseMap.set(line.accountId, existing)
      } else if (isExpense) {
        const balance = debit - credit
        totalExpenses += balance
        const existing = expenseMap.get(line.accountId) || { name, balance: 0 }
        existing.balance += balance
        expenseMap.set(line.accountId, existing)
      }
    }

    const netProfit = totalRevenue - totalCogs - totalExpenses

    // ── ۷. اطلاعات اشتراک + محدودیت سالی یک‌بار ──────────
    let subscriptionInfo: any = {
      daysRemaining: null,
      daysFromStart: null,
      daysSinceLastClose: null,
      isLifetime: true,
      isExpiringSoon: false,
      isExpired: false,
      canClose: false,
      closeReason: '',
      nextCloseDate: null,
    }

    try {
      const now = new Date()

      // ★★★ v3.1: محدودیت سالی یک‌بار برای بستن حساب
      if (existingCloseEntry) {
        // ── حالت ۱: قبلاً بسته شده ──
        const lastCloseDate = new Date(existingCloseEntry.date)
        const daysSinceLastClose = Math.floor(
          (now.getTime() - lastCloseDate.getTime()) / (1000 * 60 * 60 * 24)
        )
        const daysUntilNextClose = MIN_DAYS_BETWEEN_CLOSES - daysSinceLastClose

        // محاسبه تاریخ مجاز بعدی برای بستن
        const nextCloseDate = new Date(lastCloseDate)
        nextCloseDate.setDate(nextCloseDate.getDate() + MIN_DAYS_BETWEEN_CLOSES)

        subscriptionInfo.daysSinceLastClose = daysSinceLastClose
        subscriptionInfo.nextCloseDate = nextCloseDate.toISOString()

        if (daysSinceLastClose >= MIN_DAYS_BETWEEN_CLOSES) {
          // ✅ یک سال کامل گذشته — مجاز به بستن
          subscriptionInfo.canClose = true
          subscriptionInfo.closeReason = `یک سال کامل از آخرین بستن گذشته (${daysSinceLastClose} روز) — مجاز به بستن حساب`
          subscriptionInfo.daysRemaining = 0
          console.log('[BasicClosePreview] ✅ Can close: one year passed since last close')
        } else {
          // ❌ هنوز یک سال کامل نشده — غیرمجاز
          subscriptionInfo.canClose = false
          subscriptionInfo.daysRemaining = daysUntilNextClose
          subscriptionInfo.closeReason = `بستن حساب فقط سالی یک‌بار مجاز است. ${daysUntilNextClose} روز دیگر می‌توانید حساب را ببندید.`
          console.log(`[BasicClosePreview] ❌ Cannot close: only ${daysSinceLastClose} days since last close (need ${MIN_DAYS_BETWEEN_CLOSES})`)
        }
      } else {
        // ── حالت ۲: اولین بار — بررسی تاریخ اولین سند ──
        const firstEntry = await tenantDb.journalEntry.findFirst({
          where: { tenantId, status: 'posted' },
          orderBy: { date: 'asc' },
          select: { date: true },
        })

        if (firstEntry) {
          const firstEntryDate = new Date(firstEntry.date)
          const daysSinceFirstEntry = Math.floor(
            (now.getTime() - firstEntryDate.getTime()) / (1000 * 60 * 60 * 24)
          )
          const daysUntilFirstClose = MIN_DAYS_BETWEEN_CLOSES - daysSinceFirstEntry

          // محاسبه تاریخ مجاز برای اولین بستن
          const nextCloseDate = new Date(firstEntryDate)
          nextCloseDate.setDate(nextCloseDate.getDate() + MIN_DAYS_BETWEEN_CLOSES)

          subscriptionInfo.daysFromStart = daysSinceFirstEntry
          subscriptionInfo.nextCloseDate = nextCloseDate.toISOString()

          if (daysSinceFirstEntry >= MIN_DAYS_BETWEEN_CLOSES) {
            // ✅ یک سال کامل از شروع فعالیت گذشته
            subscriptionInfo.canClose = true
            subscriptionInfo.closeReason = `یک سال کامل از شروع فعالیت گذشته (${daysSinceFirstEntry} روز) — مجاز به بستن حساب`
            subscriptionInfo.daysRemaining = 0
            console.log('[BasicClosePreview] ✅ Can close: one year passed since first entry')
          } else {
            // ❌ هنوز یک سال از شروع فعالیت نشده
            subscriptionInfo.canClose = false
            subscriptionInfo.daysRemaining = daysUntilFirstClose
            subscriptionInfo.closeReason = `برای بستن حساب، حداقل یک سال کامل از شروع فعالیت لازم است. ${daysUntilFirstClose} روز دیگر می‌توانید حساب را ببندید.`
            console.log(`[BasicClosePreview] ❌ Cannot close: only ${daysSinceFirstEntry} days since first entry (need ${MIN_DAYS_BETWEEN_CLOSES})`)
          }
        } else {
          // ── حالت ۳: هیچ سندی وجود ندارد ──
          subscriptionInfo.canClose = false
          subscriptionInfo.closeReason = 'هیچ سند حسابداری ثبت نشده است. ابتدا فاکتور یا سند حسابداری ثبت کنید.'
          console.log('[BasicClosePreview] ❌ Cannot close: no journal entries')
        }
      }
    } catch (err: any) {
      console.error('[BasicClosePreview] ❌ Error checking close eligibility:', err?.message)
      // در صورت خطا → غیرمجاز (امن‌تر)
      subscriptionInfo.canClose = false
      subscriptionInfo.closeReason = 'خطا در بررسی وضعیت بستن حساب'
    }

    // ── ۸. Blockers ──────────────────────────────────────────
    const blockers: string[] = []

    const draftCount = await tenantDb.journalEntry.count({
      where: { tenantId, status: 'draft' },
    })
    if (draftCount > 0) {
      blockers.push(`${draftCount} سند پیش‌نویس وجود دارد که باید تأیید یا حذف شود`)
    }

    // ── ۹. پاسخ ──────────────────────────────────────────────
    const firstEntryDate = entries.length > 0 ? entries[0].date : null
    const lastEntryDate = entries.length > 0 ? entries[entries.length - 1].date : null

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          entryCount: entries.length,
          totalEntryCount: entryCount,
          firstEntryDate,
          lastEntryDate,
          hasClosingEntry: !!existingCloseEntry,
          lastClosingDate: existingCloseEntry?.date || null,
        },
        revenue: totalRevenue,
        expenses: totalExpenses,
        cogs: totalCogs,
        netProfit,
        closingPreview: {
          revenues: Array.from(revenueMap.values()).filter(r => Math.abs(r.balance) > 0.01),
          expenses: Array.from(expenseMap.values()).filter(e => Math.abs(e.balance) > 0.01),
        },
        subscription: subscriptionInfo,
        canProceed: blockers.length === 0 && subscriptionInfo.canClose,
        blockers,
      },
    })
  } catch (error: any) {
    console.error('[BasicClosePreview] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در بارگذاری' },
      { status: 500 }
    )
  }
})