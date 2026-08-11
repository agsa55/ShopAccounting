// ============================================================================
// src/lib/accounting/closing-entry.ts — منطق صدور سند اختتامیه و افتتاحیه
// ============================================================================
// ★ v1.0: پیاده‌سازی حرفه‌ای سند اختتامیه (Closing) و افتتاحیه (Opening)
// ★ این ماژول دو نوع سند تولید می‌کند:
//   ۱. سند اختتامیه: صفر کردن حساب‌های موقت (درآمد/هزینه) + انتقال سود/زیان
//   ۲. سند افتتاحیه: انتقال مانده حساب‌های دائمی به سال جدید
// ============================================================================

import { db } from '@/lib/db'

// ─── انواع حساب‌ها ────────────────────────────────────────────

/** حساب‌های موقت (Temporary/Income Statement Accounts) — در پایان سال صفر می‌شوند */
const TEMPORARY_ACCOUNT_TYPES = [
  'درآمد',
  'بهای_تمام_شده',
  'هزینه',
]

/** حساب‌های دائمی (Permanent/Balance Sheet Accounts) — مانده به سال بعد منتقل می‌شود */
const PERMANENT_ACCOUNT_TYPES = [
  'صندوق',
  'بانک',
  'موجودی',
  'دریافتنی',
  'دارایی',
  'دارایی_ثابت',
  'کاهنده_دارایی',
  'پرداختنی',
  'بدهی',
  'سرمایه',
]

export interface ClosingPreview {
  revenues: Array<{ accountId: string; name: string; code: string; balance: number }>
  expenses: Array<{ accountId: string; name: string; code: string; balance: number }>
  totalRevenue: number
  totalExpense: number
  netProfit: number
  retainedEarningsAccountId: string | null
  retainedEarningsAccountName: string
  hasDraftEntries: boolean
  draftEntriesCount: number
  unbalancedAccounts: Array<{ accountId: string; name: string; balance: number }>
}

export interface OpeningPreview {
  assets: Array<{ accountId: string; name: string; code: string; balance: number }>
  liabilities: Array<{ accountId: string; name: string; code: string; balance: number }>
  equity: Array<{ accountId: string; name: string; code: string; balance: number }>
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  // برای بررسی تراز: Total Assets = Total Liabilities + Total Equity
  isBalanced: boolean
  difference: number
}

// ─── تشخیص نوع حساب ──────────────────────────────────────────

function isTemporaryAccount(type: string): boolean {
  return TEMPORARY_ACCOUNT_TYPES.includes(type)
}

function isPermanentAccount(type: string): boolean {
  return PERMANENT_ACCOUNT_TYPES.includes(type)
}

function isAssetAccount(type: string, code: string): boolean {
  return ['صندوق', 'بانک', 'موجودی', 'دریافتنی', 'دارایی', 'دارایی_ثابت'].includes(type) ||
    code.startsWith('1')
}

function isLiabilityAccount(type: string, code: string): boolean {
  return ['پرداختنی', 'بدهی'].includes(type) || code.startsWith('2')
}

function isEquityAccount(type: string, code: string): boolean {
  return type === 'سرمایه' || code.startsWith('3')
}

function isContraAsset(type: string): boolean {
  return type === 'کاهنده_دارایی'
}

// ─── محاسبه مانده حساب در یک بازه ────────────────────────────

async function calculateAccountBalance(
  tx: any,
  accountId: string,
  startDate: Date,
  endDate: Date,
  tenantId: string
): Promise<number> {
  const lines = await tx.journalEntryLine.findMany({
    where: {
      accountId,
      journalEntry: {
        tenantId,
        status: 'posted',
        date: { gte: startDate, lte: endDate },
        isCancelled: false,
      },
    },
    select: { debit: true, credit: true },
  })

  let balance = 0
  for (const line of lines) {
    balance += Number(line.debit || 0) - Number(line.credit || 0)
  }
  return balance
}

// ═══════════════════════════════════════════════════════════════
//  پیش‌نمایش سند اختتامیه (برای نمایش در Wizard قبل از تأیید)
// ═══════════════════════════════════════════════════════════════

export async function previewClosingEntry(
  tenantId: string,
  fiscalYearId: string,
  startDate: Date,
  endDate: Date
): Promise<ClosingPreview> {
  const result: ClosingPreview = {
    revenues: [],
    expenses: [],
    totalRevenue: 0,
    totalExpense: 0,
    netProfit: 0,
    retainedEarningsAccountId: null,
    retainedEarningsAccountName: 'سود (زیان) انباشته',
    hasDraftEntries: false,
    draftEntriesCount: 0,
    unbalancedAccounts: [],
  }

  try {
    // ── ۱. بررسی اسناد Draft ───────────────────────────────────
    const draftCount = await db.client.journalEntry.count({
      where: {
        tenantId,
        status: 'draft',
        date: { gte: startDate, lte: endDate },
      },
    })
    result.hasDraftEntries = draftCount > 0
    result.draftEntriesCount = draftCount

    // ── ۲. دریافت همه حساب‌ها ──────────────────────────────────
    const accounts = await db.client.account.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true, type: true },
    })

    // ── ۳. یافتن حساب سود انباشته ──────────────────────────────
     // ── ۳. یافتن حساب سود انباشته ──────────────────────────────
    // ★★★ FIX: اولویت با کد ۳۱۰۰، سپس نام شامل «سود» و «انباشته»
 const retainedEarnings =
  accounts.find((a) => a.code === '3100') ||
  accounts.find((a) => a.name.includes('سود') && a.name.includes('انباشته')) ||
  accounts.find((a) => a.type === 'سرمایه' && a.code.startsWith('31'))
    if (retainedEarnings) {
      result.retainedEarningsAccountId = retainedEarnings.id
      result.retainedEarningsAccountName = retainedEarnings.name
    }

    // ── ۴. محاسبه مانده هر حساب ─────────────────────────────────
    for (const account of accounts) {
      const balance = await calculateAccountBalance(
        db.client,
        account.id,
        startDate,
        endDate,
        tenantId
      )

      if (Math.abs(balance) < 0.01) continue

      if (isTemporaryAccount(account.type)) {
        const accInfo = {
          accountId: account.id,
          name: account.name,
          code: account.code,
          balance,
        }

        if (account.type === 'درآمد') {
          // درآمد: مانده بستانکار (credit - debit > 0 در حالت عادی)
          // اما ما balance = debit - credit حساب کردیم، پس درآمد مانده منفی دارد
          result.revenues.push({ ...accInfo, balance: -balance })
          result.totalRevenue += -balance
        } else {
          // هزینه و بهای تمام‌شده: مانده بدهکار
          result.expenses.push(accInfo)
          result.totalExpense += balance
        }
      }
    }

    result.netProfit = result.totalRevenue - result.totalExpense

    // ── ۵. مرتب‌سازی بر اساس مبلغ ──────────────────────────────
    result.revenues.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
    result.expenses.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))

    return result
  } catch (error: any) {
    console.error('[ClosingEntry] preview error:', error?.message)
    return result
  }
}

// ═══════════════════════════════════════════════════════════════
//  پیش‌نمایش سند افتتاحیه (انتقال مانده حساب‌های دائمی)
// ═══════════════════════════════════════════════════════════════

export async function previewOpeningEntry(
  tenantId: string,
  asOfDate: Date
): Promise<OpeningPreview> {
  const result: OpeningPreview = {
    assets: [],
    liabilities: [],
    equity: [],
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    isBalanced: false,
    difference: 0,
  }

  try {
    const accounts = await db.client.account.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true, type: true },
    })

    // محاسبه مانده تا تاریخ asOfDate (برای افتتاحیه: روز قبل از شروع سال جدید)
    const startDate = new Date(0) // از ابتدای زمان

    for (const account of accounts) {
      if (!isPermanentAccount(account.type)) continue

      const balance = await calculateAccountBalance(
        db.client,
        account.id,
        startDate,
        asOfDate,
        tenantId
      )

      if (Math.abs(balance) < 0.01) continue

      const accInfo = {
        accountId: account.id,
        name: account.name,
        code: account.code,
        balance,
      }

      if (isAssetAccount(account.type, account.code)) {
        result.assets.push(accInfo)
        if (isContraAsset(account.type)) {
          // حساب کاهنده دارایی مانده بستانکار دارد، از دارایی کم می‌شود
          result.totalAssets -= balance
        } else {
          result.totalAssets += balance
        }
      } else if (isLiabilityAccount(account.type, account.code)) {
        result.liabilities.push({ ...accInfo, balance: -balance })
        result.totalLiabilities += -balance
      } else if (isEquityAccount(account.type, account.code)) {
        result.equity.push({ ...accInfo, balance: -balance })
        result.totalEquity += -balance
      }
    }

    // مرتب‌سازی
    result.assets.sort((a, b) => a.code.localeCompare(b.code))
    result.liabilities.sort((a, b) => a.code.localeCompare(b.code))
    result.equity.sort((a, b) => a.code.localeCompare(b.code))

    // بررسی تراز: دارایی = بدهی + سرمایه
    const expectedEquity = result.totalAssets - result.totalLiabilities
    result.difference = Math.abs(result.totalEquity - expectedEquity)
    result.isBalanced = result.difference < 1 // تلورانس ۱ ریال

    return result
  } catch (error: any) {
    console.error('[OpeningEntry] preview error:', error?.message)
    return result
  }
}

// ═══════════════════════════════════════════════════════════════
//  تولید و ثبت سند اختتامیه (Closing Entry)
// ═══════════════════════════════════════════════════════════════

export async function createClosingEntry(
  tx: any,
  tenantId: string,
  fiscalYearId: string,
  fiscalYearName: string,
  endDate: Date
): Promise<{
  success: boolean
  entryId?: string
  entryNumber?: string
  totalRevenue: number
  totalExpense: number
  netProfit: number
  error?: string
}> {
  try {
    const accounts = await tx.account.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true, type: true },
    })

    const lines: any[] = []
    let totalRevenue = 0
    let totalExpense = 0

    // ── محاسبه مانده حساب‌های موقت ────────────────────────────
    for (const account of accounts) {
      if (!isTemporaryAccount(account.type)) continue

      const balance = await calculateAccountBalance(
        tx,
        account.id,
        new Date(0),
        endDate,
        tenantId
      )

      if (Math.abs(balance) < 0.01) continue

      if (account.type === 'درآمد') {
        // درآمد: بستن با بدهکار کردن حساب
        // balance ما = debit - credit است
        // درآمد معمولاً credit > debit دارد، پس balance منفی است
        const revenueBalance = -balance
        if (Math.abs(revenueBalance) > 0.01) {
          lines.push({
            accountId: account.id,
            debit: revenueBalance,
            credit: 0,
            description: `بستن حساب ${account.name}`,
          })
          totalRevenue += revenueBalance
        }
      } else {
        // هزینه و بهای تمام‌شده: بستن با بستانکار کردن حساب
        if (Math.abs(balance) > 0.01) {
          lines.push({
            accountId: account.id,
            debit: 0,
            credit: balance,
            description: `بستن حساب ${account.name}`,
          })
          totalExpense += balance
        }
      }
    }

    // ── انتقال سود/زیان به سود انباشته ───────────────────────
    const netProfit = totalRevenue - totalExpense
  const retainedEarnings =
  accounts.find((a: any) => a.code === '3100') ||
  accounts.find((a: any) => a.name.includes('سود') && a.name.includes('انباشته')) ||
  accounts.find((a: any) => a.type === 'سرمایه' && a.code.startsWith('31'))
    if (retainedEarnings && Math.abs(netProfit) > 0.01) {
      if (netProfit > 0) {
        // سود: بستانکار کردن سود انباشته
        lines.push({
          accountId: retainedEarnings.id,
          debit: 0,
          credit: netProfit,
          description: `انتقال سود سال ${fiscalYearName} به سود انباشته`,
        })
      } else {
        // زیان: بدهکار کردن سود انباشته
        lines.push({
          accountId: retainedEarnings.id,
          debit: Math.abs(netProfit),
          credit: 0,
          description: `انتقال زیان سال ${fiscalYearName} به سود انباشته`,
        })
      }
    }

      if (lines.length === 0) {
      return {
        success: true,
        totalRevenue: 0,
        totalExpense: 0,
        netProfit: 0,
      }
    }

    const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0)
    const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0)

    // بررسی تراز سند
    if (Math.abs(totalDebit - totalCredit) > 1) {
      return {
        success: false,
        totalRevenue,
        totalExpense,
        netProfit,
        error: `سند اختتامیه تراز نیست: بدهکار=${totalDebit}، بستانکار=${totalCredit}`,
      }
    }

    const jeCount = await tx.journalEntry.count({ where: { tenantId } })
    const jeNumber = `JE-CLOSE-${(jeCount + 1).toString().padStart(6, '0')}`

    const entry = await tx.journalEntry.create({
      data: {
        number: jeNumber,
        fiscalYearId,
        date: endDate,
        description: `سند اختتامیه سال مالی ${fiscalYearName} — سود/زیان: ${netProfit.toLocaleString()} ریال`,
        status: 'posted',
        sourceType: 'fiscal_year_close',
        totalDebit,
        totalCredit,
        tenantId,
        lines: { create: lines },
      },
    })

    return {
      success: true,
      entryId: entry.id,
      entryNumber: entry.number,
      totalRevenue,
      totalExpense,
      netProfit,
    }
  } catch (error: any) {
    console.error('[ClosingEntry] create error:', error?.message)
    return {
      success: false,
      totalRevenue: 0,
      totalExpense: 0,
      netProfit: 0,
      error: error?.message || 'خطا در ایجاد سند اختتامیه',
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  تولید و ثبت سند افتتاحیه (Opening Entry)
// ═══════════════════════════════════════════════════════════════

// ============================================================================
// createOpeningEntry — v2.0 (اصلاح‌شده)
// صدور سند افتتاحیه با انتقال صحیح مانده حساب‌های دائمی
// ============================================================================

export async function createOpeningEntry(
  tx: any,
  tenantId: string,
  fiscalYearId: string,
  fiscalYearName: string,
  openingDate: Date
): Promise<{
  success: boolean
  error?: string
  entryNumber?: string
  entryId?: string
  totalAssets?: number
  totalLiabilities?: number
  totalEquity?: number
}> {
  try {
    console.log('[CreateOpeningEntry] Starting...', { tenantId, fiscalYearId, openingDate })

    // ★ v2.1: تبدیل openingDate به انتهای روز
    // این مشکل را حل می‌کند که اسناد بعد از ساعت ۰۰:۰۰ صادر شده‌اند
    const effectiveDate = new Date(openingDate)
    effectiveDate.setHours(23, 59, 59, 999)
    console.log('[CreateOpeningEntry] Effective date (end of day):', effectiveDate.toISOString())

    // ── ۱. دریافت همه حساب‌های دائمی ──────────────────────────────
    const accounts = await tx.account.findMany({
      where: {
        tenantId,
        isActive: true,
        type: {
          in: [
            'صندوق', 'بانک', 'موجودی', 'دریافتنی',
            'دارایی', 'دارایی_ثابت', 'کاهنده_دارایی',
            'پرداختنی', 'بدهی',
            'سرمایه',
          ],
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
    })

    console.log(`[CreateOpeningEntry] Found ${accounts.length} permanent accounts`)

    if (accounts.length === 0) {
      return {
        success: false,
        error: 'هیچ حساب دائمی‌ای یافت نشد',
      }
    }

    // ── ۲. محاسبه مانده هر حساب تا تاریخ افتتاحیه ──────────────────
    const openingItems: Array<{
      accountId: string
      code: string
      name: string
      type: string
      balance: number
    }> = []

    for (const account of accounts) {
      const lines = await tx.journalEntryLine.findMany({
        where: {
          accountId: account.id,
          journalEntry: {
            tenantId,
            status: 'posted',
            date: { lte: effectiveDate },  // ← استفاده از effectiveDate
            isCancelled: false,
          },
        },
        select: { debit: true, credit: true },
      })

      // balance = debit - credit
      let balance = 0
      for (const line of lines) {
        balance += Number(line.debit || 0) - Number(line.credit || 0)
      }

      // فقط حساب‌هایی که مانده غیرصفر دارند
      if (Math.abs(balance) > 0.01) {
        openingItems.push({
          accountId: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          balance,
        })
      }
    }

    console.log(`[CreateOpeningEntry] Found ${openingItems.length} accounts with non-zero balance:`,
      openingItems.map(i => `${i.code} ${i.name}: ${i.balance}`)
    )

    if (openingItems.length === 0) {
      return {
        success: false,
        error: 'هیچ حسابی با مانده غیرصفر یافت نشد',
      }
    }

    // ── ۳. ساخت خطوط سند افتتاحیه ─────────────────────────────────
    const journalLines: Array<{
      accountId: string
      description: string
      debit: number
      credit: number
    }> = []

    let totalAssets = 0
    let totalLiabilities = 0
    let totalEquity = 0

    // حساب‌های دارایی (ماهیت بدهکار)
    const assetTypes = ['صندوق', 'بانک', 'موجودی', 'دریافتنی', 'دارایی', 'دارایی_ثابت']
    // حساب‌های کاهنده دارایی (ماهیت بستانکار)
    const contraAssetTypes = ['کاهنده_دارایی']
    // حساب‌های بدهی (ماهیت بستانکار)
    const liabilityTypes = ['پرداختنی', 'بدهی']
    // حساب‌های سرمایه (ماهیت بستانکار)
    const equityTypes = ['سرمایه']

    for (const item of openingItems) {
      const description = `انتقال ${item.name} از سال قبل`

      if (assetTypes.includes(item.type)) {
        // حساب دارایی: balance مثبت → بدهکار
        if (item.balance > 0) {
          journalLines.push({
            accountId: item.accountId,
            description,
            debit: item.balance,
            credit: 0,
          })
          totalAssets += item.balance
        } else {
          // balance منفی در دارایی → بستانکار (حالت غیرعادی)
          journalLines.push({
            accountId: item.accountId,
            description,
            debit: 0,
            credit: Math.abs(item.balance),
          })
          totalAssets += item.balance
        }
      } else if (contraAssetTypes.includes(item.type)) {
        // کاهنده دارایی: balance منفی → بستانکار
        if (item.balance < 0) {
          journalLines.push({
            accountId: item.accountId,
            description,
            debit: 0,
            credit: Math.abs(item.balance),
          })
          totalAssets += item.balance // منفی است، از دارایی کم می‌شود
        } else {
          journalLines.push({
            accountId: item.accountId,
            description,
            debit: item.balance,
            credit: 0,
          })
          totalAssets -= item.balance
        }
      } else if (liabilityTypes.includes(item.type)) {
        // بدهی: balance منفی → بستانکار
        if (item.balance < 0) {
          journalLines.push({
            accountId: item.accountId,
            description,
            debit: 0,
            credit: Math.abs(item.balance),
          })
          totalLiabilities += Math.abs(item.balance)
        } else {
          journalLines.push({
            accountId: item.accountId,
            description,
            debit: item.balance,
            credit: 0,
          })
          totalLiabilities -= item.balance
        }
      } else if (equityTypes.includes(item.type)) {
        // سرمایه: balance منفی → بستانکار (حالت عادی)
        if (item.balance < 0) {
          journalLines.push({
            accountId: item.accountId,
            description,
            debit: 0,
            credit: Math.abs(item.balance),
          })
          totalEquity += Math.abs(item.balance)
        } else {
          // balance مثبت در سرمایه → بدهکار (زیان انباشته)
          journalLines.push({
            accountId: item.accountId,
            description,
            debit: item.balance,
            credit: 0,
          })
          totalEquity -= item.balance
        }
      }
    }

    console.log('[CreateOpeningEntry] Journal lines created:', journalLines.length)
    console.log('[CreateOpeningEntry] Totals:', { totalAssets, totalLiabilities, totalEquity })

    // ── ۴. بررسی تراز ─────────────────────────────────────────────
    const totalDebit = journalLines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = journalLines.reduce((s, l) => s + l.credit, 0)

    console.log('[CreateOpeningEntry] Balance check:', { totalDebit, totalCredit, diff: totalDebit - totalCredit })

    if (Math.abs(totalDebit - totalCredit) > 1) {
      console.warn('[CreateOpeningEntry] ⚠️ Journal is not balanced, but creating anyway')
    }

    // ── ۵. ایجاد سند افتتاحیه ──────────────────────────────────────
    const lastEntry = await tx.journalEntry.findFirst({
      where: { tenantId },
      orderBy: { number: 'desc' },
      select: { number: true },
    })

    let nextNumber = 1
    if (lastEntry?.number) {
      const match = lastEntry.number.match(/(\d+)$/)
      if (match) nextNumber = parseInt(match[1], 10) + 1
    }

    const entryNumber = `JE-OPEN-${String(nextNumber).padStart(6, '0')}`

   const journalEntry = await tx.journalEntry.create({
  data: {
    id: require('uuid').v4(),
    tenantId,
    fiscalYearId,
    number: entryNumber,
    date: openingDate,
    description: `سند افتتاحیه سال مالی ${fiscalYearName} — انتقال مانده حساب‌های دائمی`,
    status: 'posted',
   
    sourceType: 'fiscal_year_open',
    totalDebit,
    totalCredit,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
})

    // ── ۶. ایجاد خطوط سند ─────────────────────────────────────────
  for (const line of journalLines) {
  await tx.journalEntryLine.create({
    data: {
      id: require('uuid').v4(),
      journalEntryId: journalEntry.id,
      accountId: line.accountId,
      description: line.description,
      debit: line.debit,
      credit: line.credit,
      createdAt: new Date(),
      // updatedAt حذف شد (در مدل JournalEntryLine وجود ندارد)
    },
  })
}

    console.log(`[CreateOpeningEntry] ✅ Entry created: ${entryNumber}`)

    return {
      success: true,
      entryNumber,
      entryId: journalEntry.id,
      totalAssets,
      totalLiabilities,
      totalEquity,
    }
  } catch (error: any) {
    console.error('[CreateOpeningEntry] Error:', error?.message || error)
    return {
      success: false,
      error: error?.message || 'خطای ناشناخته در ایجاد سند افتتاحیه',
    }
  }
}