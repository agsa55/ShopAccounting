// ============================================================================
// src/app/api/cashier-dashboard/route.ts — v13.2 Fiscal Year Reactive + Secure Tenant
// ShopAccounting — Cashier Dashboard API
// ----------------------------------------------------------------------------
// ★★★ v13.2:
//   - اگر تاریخ امروز داخل سال مالی انتخابی نباشد، کل سال مالی انتخابی گزارش می‌شود
//   - رفع ثابت ماندن کارت صندوق‌دار هنگام تغییر سال مالی
//   - پشتیبانی امن از Invoice.fiscalYearId
//   - fallback تاریخی برای مدل‌هایی که fiscalYearId ندارند
//   - محاسبه جریان نقدی بر اساس بازه مؤثر
//   - حفظ ساختار پاسخ قبلی برای UI
// ★★★ v13.0/v13.1:
//   - رفع مشکل امنیتی: tenantId دیگر از query param خوانده نمی‌شود
//   - استفاده از withTenantAndPermission و tenant.tenantDb
//   - ایزولاسیون سال مالی
//   - clamp بازه روز داخل سال مالی
//   - سود JE-based سال‌محور
//   - موجودی صندوق سال‌محور
//   - پشتیبانی از CashMovement.fiscalYearId در صورت وجود
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import {
  clampDateRange,
  inferCashMovementDirection,
  isFieldSupported,
  normalizeToken,
  resolveEffectiveFiscalYear,
  safeNum,
} from '@/lib/fiscal-year-reporting'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALL_YEARS_WARNING =
  'این داشبورد همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

const FALLBACK_FISCAL_YEAR_WARNING =
  'تاریخ امروز در سال مالی انتخابی قرار ندارد؛ بنابراین عملکرد کل سال مالی انتخابی نمایش داده شد.'
const OPENING_JOURNAL_SOURCE_TYPES: string[] = [
  'fiscal_year_open',
  'initial_balance',
]

const NON_OPERATIONAL_JOURNAL_SOURCE_TYPES: string[] = [
  'fiscal_year_open',
  'initial_balance',
  'opening_balance',
  'manual_cash_movement',
]

const LEGACY_NON_OPERATIONAL_JOURNAL_SOURCE_TYPES: string[] = [
  'initial_balance',
  'manual_cash_movement',
]
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

function toEnglishDigits(value: any): string {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
}

function normalizeType(value: any): string {
  return normalizeToken(value)
}

function isReturnInvoiceType(value: any): boolean {
  const t = normalizeType(value)
  return (
    t === 'sale_return' ||
    t === 'return' ||
    t === 'برگشتی' ||
    t === 'return_sale' ||
    t.includes('return')
  )
}

function isPurchaseInvoiceType(value: any): boolean {
  const t = normalizeType(value)
  return (
    t.includes('purchase') ||
    t === 'buy' ||
    t.includes('خرید')
  )
}

function isSalesRelatedInvoiceType(value: any): boolean {
  return !isPurchaseInvoiceType(value)
}

function isCashLikePaymentType(value: any): boolean {
  const t = normalizeType(toEnglishDigits(value))
  if (!t) return false

  if (
    t.includes('card') ||
    t.includes('کارت') ||
    t.includes('check') ||
    t.includes('چک') ||
    t.includes('cheque') ||
    t.includes('credit') ||
    t.includes('نسیه')
  ) {
    return false
  }

  return (
    t.includes('cash') ||
    t.includes('نقد') ||
    t.includes('installment') ||
    t.includes('قسط') ||
    t.includes('prepay') ||
    t.includes('down') ||
    t.includes('partial') ||
    t.includes('پیش')
  )
}

function getManualMovementDirection(value: any): 'in' | 'out' | null {
  const t = normalizeType(toEnglishDigits(value))

  if (!t) return null

  if (
    t.includes('opening_balance') ||
    t.includes('initial_balance') ||
    t.includes('installment') ||
    t.includes('قسط')
  ) {
    return null
  }

  if (
    t === 'deposit' ||
    t.includes('deposit') ||
    t.includes('واریز') ||
    t.includes('وارد')
  ) {
    return 'in'
  }

  if (
    t === 'withdrawal' ||
    t.includes('withdrawal') ||
    t.includes('expense') ||
    t.includes('برداشت') ||
    t.includes('هزینه') ||
    t.includes('خارج')
  ) {
    return 'out'
  }

  return null
}

const TEHRAN_UTC_OFFSET_MINUTES = 210; // Asia/Tehran = UTC+03:30

function tehranDayBoundsFromStoredUtcDate(value: any, endOfDay: boolean): Date {
  const d = new Date(value)

  if (Number.isNaN(d.getTime())) {
    return d
  }

  // تاریخ‌های سال مالی در دیتابیس/Prisma معمولاً به‌صورت UTC ذخیره/خوانده می‌شوند.
  // پس باید از اجزای UTC تاریخ استفاده کنیم، نه setHours محلی.
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth()
  const day = d.getUTCDate()

  // نیمه‌شب UTC همان تاریخ میلادی
  const storedUtcDateMidnight = Date.UTC(year, month, day, 0, 0, 0, 0)

  // تبدیل به نیمه‌شب تهران:
  // تهران = UTC + 3:30
  // پس UTCِ نیمه‌شب تهران = نیمه‌شب تاریخ - 3:30
  const tehranMidnightUtc =
    storedUtcDateMidnight - TEHRAN_UTC_OFFSET_MINUTES * 60 * 1000

  if (!endOfDay) {
    return new Date(tehranMidnightUtc)
  }

  return new Date(tehranMidnightUtc + 24 * 60 * 60 * 1000 - 1)
}

function fiscalStartEnd(fy: any) {
  return {
    start: tehranDayBoundsFromStoredUtcDate(fy.startDate, false),
    end: tehranDayBoundsFromStoredUtcDate(fy.endDate, true),
  }
}

// ═══════════════════════════════════════════════════════════════
//  Profit from Journal Entries
// ═══════════════════════════════════════════════════════════════

async function calculateProfitForInvoiceIds(
  tenantDb: any,
  tenantId: string,
  invoiceIds: string[],
  fiscalYearId: string | null,
  fy: any
): Promise<{ revenue: number; cogs: number; profit: number }> {
  if (!invoiceIds || invoiceIds.length === 0) {
    return { revenue: 0, cogs: 0, profit: 0 }
  }

  try {
    const hasJEFiscalYearId = isFieldSupported(
      tenantDb.journalEntry,
      'fiscalYearId'
    )

    const where: any = {
      tenantId,
      sourceId: { in: invoiceIds },
      status: 'posted',
    }

    if (fiscalYearId) {
      if (hasJEFiscalYearId) {
        where.fiscalYearId = fiscalYearId
      } else if (fy) {
        const { start, end } = fiscalStartEnd(fy)
        where.date = { gte: start, lte: end }
      }
    }

    const rawEntries = await tenantDb.journalEntry.findMany({
      where,
      include: { lines: true },
    })

    const entries = rawEntries.filter((e: any) => e.isCancelled !== true)

    if (!entries || entries.length === 0) {
      return { revenue: 0, cogs: 0, profit: 0 }
    }

    const lines = entries.flatMap((e: any) => e.lines || [])

    if (!lines || lines.length === 0) {
      return { revenue: 0, cogs: 0, profit: 0 }
    }

    const accountIds = Array.from(
      new Set(lines.map((l: any) => l.accountId).filter(Boolean))
    )

    let accounts: any[] = []

    if (accountIds.length > 0) {
      accounts = await tenantDb.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, code: true, name: true, type: true },
      })
    }

    const accountMap = new Map<string, any>(
      accounts.map((a: any) => [a.id, a])
    )

    let revenue = 0
    let cogs = 0

    const forbiddenRevenueNames = [
      'بهای',
      'صندوق',
      'بانک',
      'موجودی',
      'دریافتنی',
      'پرداختنی',
      'چک',
      'خرید',
    ]

    for (const line of lines) {
      const acc = accountMap.get(line.accountId)
      if (!acc) continue

      const code = toEnglishDigits(String(acc.code || ''))
      const name = String(acc.name || '')
      const type = normalizeType(String(acc.type || ''))

      const debit = safeNum(line.debit)
      const credit = safeNum(line.credit)

      const isCogsAccount =
        code.startsWith('50') ||
        type.includes('cogs') ||
        type.includes('بهای') ||
        name.includes('بهای تمام شده')

      const looksLikeRevenueName =
        name.includes('فروش') &&
        !forbiddenRevenueNames.some((forbidden) => name.includes(forbidden))

      const isRevenueAccount =
        !isCogsAccount &&
        (code.startsWith('41') ||
          type.includes('income') ||
          type.includes('revenue') ||
          type.includes('درآمد') ||
          looksLikeRevenueName)

      if (isRevenueAccount) {
        revenue += credit - debit
      }

      if (isCogsAccount) {
        cogs += debit - credit
      }
    }

    return {
      revenue,
      cogs,
      profit: revenue - cogs,
    }
  } catch (err: any) {
    console.warn('[cashier-dashboard v13.2] Profit calculation failed:', err?.message)
    return { revenue: 0, cogs: 0, profit: 0 }
  }
}

// ═══════════════════════════════════════════════════════════════
//  Journal-based cash balance
// ═══════════════════════════════════════════════════════════════

async function getJournalCashBalance(
  tenantDb: any,
  tenantId: string,
  cashAccountId: string,
  fiscalYearId: string | null,
  fy: any,
  beforeDate?: Date,
  excludeInitialBalance = false
): Promise<number> {
  try {
    const hasJEFiscalYearId = isFieldSupported(
      tenantDb.journalEntry,
      'fiscalYearId'
    )

    const where: any = {
      tenantId,
      status: 'posted',
      lines: {
        some: {
          accountId: cashAccountId,
        },
      },
    }

    // ★ v13.1:
    // اسناد افتتاحیه و تراکنش‌های دستی صندوق از موجودی جاری journal حذف می‌شوند
    // تا با CashMovement دوبار شمرده نشوند.
    // ★ v13.3 production-safe:
    // برای سال مالی مشخص، سند افتتاحیه سال مالی هم به‌عنوان opening balance
    // از حرکات جاری حذف می‌شود تا دوباره شمرده نشود.
    if (excludeInitialBalance) {
      where.sourceType = {
        notIn: fiscalYearId
          ? NON_OPERATIONAL_JOURNAL_SOURCE_TYPES
          : LEGACY_NON_OPERATIONAL_JOURNAL_SOURCE_TYPES,
      }
    }

    if (beforeDate) {
      where.date = { lt: beforeDate }
    }

    if (fiscalYearId) {
      if (hasJEFiscalYearId) {
        where.fiscalYearId = fiscalYearId
      } else if (fy) {
        const { start, end } = fiscalStartEnd(fy)

        if (beforeDate) {
          where.date = { gte: start, lt: beforeDate }
        } else {
          where.date = { gte: start, lte: end }
        }
      }
    }

    const rawEntries = await tenantDb.journalEntry.findMany({
      where,
      include: {
        lines: {
          where: {
            accountId: cashAccountId,
          },
          select: {
            debit: true,
            credit: true,
          },
        },
      },
    })

    const entries = rawEntries.filter((e: any) => e.isCancelled !== true)

    return entries.reduce((sum: number, entry: any) => {
      for (const line of entry.lines || []) {
        sum += safeNum(line.debit) - safeNum(line.credit)
      }
      return sum
    }, 0)
  } catch (err: any) {
    console.warn(
      '[cashier-dashboard v13.2] Journal cash balance failed:',
      err?.message
    )
    return 0
  }
}

async function getJournalCashFlow(
  tenantDb: any,
  tenantId: string,
  cashAccountId: string,
  startDate: Date,
  endDateExclusive: Date,
  fiscalYearId: string | null,
  fy: any,
  excludeInitialBalance = false
): Promise<{ inflow: number; outflow: number }> {
  try {
    const hasJEFiscalYearId = isFieldSupported(
      tenantDb.journalEntry,
      'fiscalYearId'
    )

    const where: any = {
      tenantId,
      status: 'posted',
      date: {
        gte: startDate,
        lt: endDateExclusive,
      },
      lines: {
        some: {
          accountId: cashAccountId,
        },
      },
    }

    // ★ v13.1: جلوگیری از دوبار شماری manual_cash_movement
    // ★ v13.3 production-safe:
    // برای سال مالی مشخص، سند افتتاحیه هم از جریان عملیاتی امروز حذف می‌شود.
    if (excludeInitialBalance) {
      where.sourceType = {
        notIn: fiscalYearId
          ? NON_OPERATIONAL_JOURNAL_SOURCE_TYPES
          : LEGACY_NON_OPERATIONAL_JOURNAL_SOURCE_TYPES,
      }
    }

    if (fiscalYearId && hasJEFiscalYearId) {
      where.fiscalYearId = fiscalYearId
    }

    const rawEntries = await tenantDb.journalEntry.findMany({
      where,
      include: {
        lines: {
          where: {
            accountId: cashAccountId,
          },
          select: {
            debit: true,
            credit: true,
          },
        },
      },
    })

    const entries = rawEntries.filter((e: any) => e.isCancelled !== true)

    let inflow = 0
    let outflow = 0

    for (const entry of entries) {
      for (const line of entry.lines || []) {
        inflow += safeNum(line.debit)
        outflow += safeNum(line.credit)
      }
    }

    return { inflow, outflow }
  } catch (err: any) {
    console.warn(
      '[cashier-dashboard v13.2] Journal cash flow failed:',
      err?.message
    )
    return { inflow: 0, outflow: 0 }
  }
}

// ═══════════════════════════════════════════════════════════════
//  Manual cash movements
// ═══════════════════════════════════════════════════════════════

async function getManualCashBalance(
  tenantDb: any,
  tenantId: string,
  fiscalYearId: string | null,
  fy: any,
  beforeDate?: Date
): Promise<{ balance: number; inflow: number; outflow: number }> {
  try {
    const hasCMFiscalYearId = isFieldSupported(
      tenantDb.cashMovement,
      'fiscalYearId'
    )

    const where: any = { tenantId }

    if (fiscalYearId) {
      if (hasCMFiscalYearId) {
        where.fiscalYearId = fiscalYearId
      } else if (fy) {
        const { start, end } = fiscalStartEnd(fy)

        if (beforeDate) {
          where.createdAt = { gte: start, lt: beforeDate }
        } else {
          where.createdAt = { gte: start, lte: end }
        }
      }
    } else if (beforeDate) {
      where.createdAt = { lt: beforeDate }
    }

    const movements = await tenantDb.cashMovement.findMany({
      where,
      select: {
        amount: true,
        transactionType: true,
        createdAt: true,
        invoiceId: true,
      },
    })

    let inflow = 0
    let outflow = 0

    for (const mov of movements) {
      if ((mov as any).invoiceId) continue

      const direction = getManualMovementDirection(mov.transactionType)
      if (!direction) continue

      if (beforeDate) {
        const createdAt = mov.createdAt ? new Date(mov.createdAt) : null
        if (createdAt && createdAt >= beforeDate) continue
      }

      const amount = safeNum(mov.amount)
      if (!amount) continue

      if (direction === 'in') inflow += amount
      else outflow += amount
    }

    return { balance: inflow - outflow, inflow, outflow }
  } catch (err: any) {
    console.warn('[cashier-dashboard v13.2] Manual cash balance failed:', err?.message)
    return { balance: 0, inflow: 0, outflow: 0 }
  }
}

async function getManualCashFlow(
  tenantDb: any,
  tenantId: string,
  startDate: Date,
  endDateExclusive: Date,
  fiscalYearId: string | null,
  fy: any
): Promise<{ inflow: number; outflow: number }> {
  try {
    const hasCMFiscalYearId = isFieldSupported(
      tenantDb.cashMovement,
      'fiscalYearId'
    )

    const where: any = {
      tenantId,
      createdAt: {
        gte: startDate,
        lt: endDateExclusive,
      },
    }

    if (fiscalYearId && hasCMFiscalYearId) {
      where.fiscalYearId = fiscalYearId
    }

    const movements = await tenantDb.cashMovement.findMany({
      where,
      select: {
        amount: true,
        transactionType: true,
        createdAt: true,
        invoiceId: true,
      },
    })

    let inflow = 0
    let outflow = 0

    for (const mov of movements) {
      if ((mov as any).invoiceId) continue

      const direction = getManualMovementDirection(mov.transactionType)
      if (!direction) continue

      const createdAt = mov.createdAt ? new Date(mov.createdAt) : null
      if (!createdAt) continue
      if (createdAt < startDate || createdAt >= endDateExclusive) continue

      const amount = safeNum(mov.amount)
      if (!amount) continue

      if (direction === 'in') inflow += amount
      else outflow += amount
    }

    return { inflow, outflow }
  } catch (err: any) {
    console.warn('[cashier-dashboard v13.2] Manual cash flow failed:', err?.message)
    return { inflow: 0, outflow: 0 }
  }
}

// ═══════════════════════════════════════════════════════════════
//  Opening balance
// ═══════════════════════════════════════════════════════════════

async function getOpeningBalance(
  tenantDb: any,
  tenantId: string,
  cashierId: string,
  fiscalYearId: string | null,
  fy: any,
  cashAccountId: string | null
): Promise<number> {
  let opening = 0

  // ۱) موجودی اولیه از CashMovement
  try {
    const hasCMFiscalYearId = isFieldSupported(
      tenantDb.cashMovement,
      'fiscalYearId'
    )

    const where: any = {
      tenantId,
      cashierId,
      transactionType: 'opening_balance',
    }

    if (fiscalYearId) {
      if (hasCMFiscalYearId) {
        where.fiscalYearId = fiscalYearId
      } else if (fy) {
        const { start, end } = fiscalStartEnd(fy)
        where.createdAt = { gte: start, lte: end }
      }
    }

    const openingMov = await tenantDb.cashMovement.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    })

     if (openingMov) {
      opening = safeNum((openingMov as any).amount)

      console.log('[CashierDashboard DEBUG] opening from CashMovement', {
        cashierId,
        fiscalYearId,
        movementId: openingMov.id,
        transactionType: openingMov.transactionType,
        amount: openingMov.amount,
        createdAt: openingMov.createdAt,
        computedOpening: opening,
      })
    }
  } catch (err: any) {
    console.warn(
      '[cashier-dashboard v13.2] CashMovement opening_balance failed:',
      err?.message
    )
  }

  // ۲) موجودی اولیه از InitialBalance
  if (opening === 0) {
    try {
      const model = (tenantDb as any).initialBalance

      if (model) {
        const where: any = { tenantId, type: 'cash' }

        if (isFieldSupported(model, 'isPosted')) {
          where.isPosted = true
        }

        if (fiscalYearId) {
          if (isFieldSupported(model, 'fiscalYearId')) {
            where.fiscalYearId = fiscalYearId
          } else if (fy && isFieldSupported(model, 'createdAt')) {
            const { start, end } = fiscalStartEnd(fy)
            where.createdAt = { gte: start, lte: end }
          }
        }

        const records = await model.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        })

          opening = records.reduce(
          (sum: number, r: any) => sum + safeNum(r.amount),
          0
        )

        console.log('[CashierDashboard DEBUG] opening from InitialBalance', {
          fiscalYearId,
          recordsCount: records.length,
          computedOpening: opening,
          records: records.map((r: any) => ({
            id: r.id,
            amount: r.amount,
            type: r.type,
            createdAt: r.createdAt,
          })),
        })
      }
    } catch (err: any) {
      console.warn(
        '[cashier-dashboard v13.2] InitialBalance query failed:',
        err?.message
      )
    }
  }

  // ۳) موجودی اولیه از سند حسابداری افتتاحیه / موجودی اولیه
  if (opening === 0 && cashAccountId) {
    try {
      const hasJEFiscalYearId = isFieldSupported(
        tenantDb.journalEntry,
        'fiscalYearId'
      )

      // ★ v13.3 production-safe:
      // برای سال مالی مشخص، اول fiscal_year_open و بعد initial_balance بررسی می‌شود.
      // برای همه سنوات، رفتار قدیمی حفظ می‌شود تا از جمع چند سند افتتاحیه سال‌های مختلف
      // در نمای مدیریتی جلوگیری شود.
      const sourceTypes: string[] = fiscalYearId
        ? [...OPENING_JOURNAL_SOURCE_TYPES]
        : ['initial_balance']

      for (const sourceType of sourceTypes) {
        const where: any = {
          tenantId,
          sourceType,
          status: 'posted',
          isCancelled: false,
          lines: {
            some: {
              accountId: cashAccountId,
            },
          },
        }

        if (fiscalYearId) {
          if (hasJEFiscalYearId) {
            where.fiscalYearId = fiscalYearId
          } else if (fy) {
            const { start, end } = fiscalStartEnd(fy)
            where.date = { gte: start, lte: end }
          }
        }

        const entries = await tenantDb.journalEntry.findMany({
          where,
          include: {
            lines: {
              where: {
                accountId: cashAccountId,
              },
              select: {
                debit: true,
                credit: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        })

        const value = entries.reduce((sum: number, entry: any) => {
          for (const line of entry.lines || []) {
            sum += safeNum(line.debit) - safeNum(line.credit)
          }
          return sum
        }, 0)

        console.log('[CashierDashboard DEBUG] opening journal probe', {
          sourceType,
          fiscalYearId,
          cashAccountId,
          entriesCount: entries.length,
          computedValue: value,
          lines: entries.flatMap((e: any) =>
            (e.lines || []).map((l: any) => ({
              entryId: e.id,
              debit: l.debit,
              credit: l.credit,
            }))
          ),
        })

        if (Math.abs(value) >= 1) {
          opening = value

          console.log('[CashierDashboard DEBUG] opening accepted from journal', {
            sourceType,
            fiscalYearId,
            computedOpening: opening,
          })

          break
        }
      }
    } catch (err: any) {
      console.warn(
        '[cashier-dashboard v13.3] Journal opening balance failed:',
        err?.message
      )
    }
  }

  return opening
}


// ═══════════════════════════════════════════════════════════════
//  Fallback cash balance if cash account not found
// ═══════════════════════════════════════════════════════════════

async function calculateCashBalanceFallback(
  tenantDb: any,
  tenantId: string,
  openingBalance: number,
  fiscalYearId: string | null,
  fy: any,
  beforeDate?: Date
): Promise<{
  cashBalance: number
  paymentIn: number
  paymentOut: number
  movementIn: number
  movementOut: number
}> {
  let paymentIn = 0
  let paymentOut = 0

  const paymentModel = (tenantDb as any).invoicePayment

  if (paymentModel) {
    try {
      const hasIPFiscalYearId = isFieldSupported(paymentModel, 'fiscalYearId')

      const where: any = { tenantId }

      if (fiscalYearId) {
        if (hasIPFiscalYearId) {
          where.fiscalYearId = fiscalYearId
        } else if (fy) {
          const { start, end } = fiscalStartEnd(fy)
          const dateField = isFieldSupported(paymentModel, 'paidAt') ? 'paidAt' : 'createdAt'

          if (beforeDate) {
            where[dateField] = { gte: start, lt: beforeDate }
          } else {
            where[dateField] = { gte: start, lte: end }
          }
        }
      } else if (beforeDate) {
        const dateField = isFieldSupported(paymentModel, 'paidAt') ? 'paidAt' : 'createdAt'
        where[dateField] = { lt: beforeDate }
      }

      const payments = await paymentModel.findMany({
        where,
        select: {
          amount: true,
          paymentType: true,
          paidAt: true,
          createdAt: true,
          invoice: {
            select: {
              invoiceType: true,
              fiscalYearId: true,
            },
          },
        },
      })

      for (const payment of payments) {
        const paidDateValue = payment.paidAt || payment.createdAt
        const paidDate = paidDateValue ? new Date(paidDateValue) : null

        if (beforeDate && paidDate && paidDate >= beforeDate) {
          continue
        }

        if (
          fiscalYearId &&
          payment.invoice?.fiscalYearId &&
          payment.invoice.fiscalYearId !== fiscalYearId
        ) {
          continue
        }

        if (!isCashLikePaymentType(payment.paymentType)) continue

        const amount = safeNum(payment.amount)
        if (!amount) continue

        const invoiceType = normalizeType(payment.invoice?.invoiceType)

        if (isPurchaseInvoiceType(invoiceType)) {
          paymentOut += amount
        } else if (isReturnInvoiceType(invoiceType)) {
          paymentOut += amount
        } else {
          paymentIn += amount
        }
      }
    } catch (err: any) {
      console.warn('[cashier-dashboard v13.2] Fallback InvoicePayment query failed:', err?.message)
    }
  }

  const manual = await getManualCashBalance(
    tenantDb,
    tenantId,
    fiscalYearId,
    fy,
    beforeDate
  )

  const cashBalance =
    openingBalance +
    paymentIn -
    paymentOut +
    manual.inflow -
    manual.outflow

  return {
    cashBalance,
    paymentIn,
    paymentOut,
    movementIn: manual.inflow,
    movementOut: manual.outflow,
  }
}

// ═══════════════════════════════════════════════════════════════
//  Main API
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('pos')(
  async (req: NextRequest, _ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)

      const cashierId = searchParams.get('cashierId') || tenant.user?.id || null

      if (!cashierId) {
        return NextResponse.json(
          {
            success: false,
            error: 'cashierId الزامی است یا کاربر فعلی صندوق‌دار نیست.',
            code: 'MISSING_CASHIER_ID',
          },
          { status: 400 }
        )
      }

      const dateParam =
        searchParams.get('date') || new Date().toISOString().split('T')[0]

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'

      let fy: any = null
      let effectiveFiscalYearId: string | null = null

      if (!allYears) {
        try {
          fy = await resolveEffectiveFiscalYear(
            tenantDb,
            tenantId,
            fiscalYearIdParam || null
          )
          effectiveFiscalYearId = fy.id
        } catch (err: any) {
          return NextResponse.json(
            {
              success: false,
              error:
                err?.message ||
                (fiscalYearIdParam
                  ? 'سال مالی انتخابی یافت نشد.'
                  : 'سال مالی فعالی برای این فروشگاه تعریف نشده است.'),
              code: fiscalYearIdParam
                ? 'INVALID_FISCAL_YEAR'
                : 'NO_ACTIVE_FISCAL_YEAR',
            },
            { status: 400 }
          )
        }
      }

      const requestedStart = new Date(dateParam)

      if (Number.isNaN(requestedStart.getTime())) {
        return NextResponse.json(
          { success: false, error: 'تاریخ نامعتبر است' },
          { status: 400 }
        )
      }

      requestedStart.setHours(0, 0, 0, 0)

      const requestedEnd = new Date(dateParam)
      requestedEnd.setHours(23, 59, 59, 999)

         let range: any = clampDateRange(fy, requestedStart, requestedEnd)
      let usedFallbackFiscalYearRange = false

      if (fy) {
        const { start: fyStart, end: fyEnd } = fiscalStartEnd(fy)

        const requestedOutsideFiscalYear =
          requestedStart.getTime() > fyEnd.getTime() ||
          requestedEnd.getTime() < fyStart.getTime()

        if (
          requestedOutsideFiscalYear ||
          !range?.valid ||
          !range?.from ||
          !range?.to
        ) {
          range = {
            from: fyStart,
            to: fyEnd,
            valid: true,
          }
          usedFallbackFiscalYearRange = true
        } else {
          const from = new Date(range.from)
          const to = new Date(range.to)

          if (from.getTime() < fyStart.getTime()) {
            from.setTime(fyStart.getTime())
          }

          if (to.getTime() > fyEnd.getTime()) {
            to.setTime(fyEnd.getTime())
          }

          range = {
            from,
            to,
            valid: from.getTime() <= to.getTime(),
          }
        }

        console.log('[cashier-dashboard v13.2.1] range decision', {
          requestedStart: requestedStart.toISOString(),
          requestedEnd: requestedEnd.toISOString(),
          fyStart: fyStart.toISOString(),
          fyEnd: fyEnd.toISOString(),
          requestedOutsideFiscalYear,
          usedFallbackFiscalYearRange,
          finalRange: {
            from: range.from?.toISOString?.(),
            to: range.to?.toISOString?.(),
          },
        })
      }
      const emptySummary = {
        cashSales: 0,
        cardSales: 0,
        creditSales: 0,
        installmentSales: 0,
        installmentPrepaid: 0,
        installmentRemaining: 0,
        checkSales: 0,
        totalSales: 0,
        returns: 0,
        returnsCount: 0,
        netSales: 0,
        invoicesCount: 0,
        totalCashIn: 0,
        totalCashOut: 0,
        openingBalance: 0,
        startOfDayBalance: 0,
        currentBalance: 0,
        realCashBalance: 0,
        isMultiCashier: true,
        revenueToday: 0,
        cogsToday: 0,
        profitToday: 0,
        revenueTotal: 0,
        cogsTotal: 0,
        profitTotal: 0,
      }

      if (!range.valid || !range.from || !range.to) {
        return NextResponse.json({
          success: true,
          fiscalYearId: effectiveFiscalYearId,
          fiscalYearName: fy?.name || null,
          allYears,
          warning: allYears
            ? ALL_YEARS_WARNING
            : usedFallbackFiscalYearRange
            ? FALLBACK_FISCAL_YEAR_WARNING
            : undefined,
          summary: emptySummary,
          diagnostics: {
            fiscalYearApplied: Boolean(effectiveFiscalYearId && !allYears),
            requestedFiscalYearId: fiscalYearIdParam || null,
            allYearsRequested: allYears,
            dateRangeValid: false,
            usedFallbackFiscalYearRange,
            requestedDate: dateParam,
          },
        })
      }

      const rangeFrom: Date = range.from
      const rangeTo: Date = range.to

      const effectiveTomorrow = new Date(rangeTo)
      effectiveTomorrow.setDate(effectiveTomorrow.getDate() + 1)
      effectiveTomorrow.setHours(0, 0, 0, 0)

      const stats = {
        cashSales: 0,
        cardSales: 0,
        creditSales: 0,
        installmentSales: 0,
        installmentPrepaid: 0,
        installmentRemaining: 0,
        checkSales: 0,
        totalSales: 0,
        invoicesCount: 0,
        totalCashIn: 0,
        totalCashOut: 0,
      }

      const returnStats = {
        count: 0,
        totalAmount: 0,
      }

      const todaySalesInvoiceIds: string[] = []

      // ─── فاکتورهای بازه مؤثر این صندوق‌دار ─────────────────
      let invoices: any[] = []

      try {
        const hasInvoiceFiscalYearId = isFieldSupported(
          tenantDb.invoice,
          'fiscalYearId'
        )

        const invoiceWhere: any = {
          tenantId,
          cashierId,
          status: {
            notIn: ['cancelled', 'Cancelled', 'void', 'Void', 'draft', 'Draft'],
          },
          invoiceDate: {
            gte: rangeFrom,
            lte: rangeTo,
          },
        }

        if (effectiveFiscalYearId && hasInvoiceFiscalYearId) {
          invoiceWhere.fiscalYearId = effectiveFiscalYearId
        }

        invoices = await tenantDb.invoice.findMany({
          where: invoiceWhere,
          select: {
            id: true,
            paymentType: true,
            totalAmount: true,
            paidAmount: true,
            invoiceType: true,
          },
        })
      } catch (err: any) {
        console.warn('[cashier-dashboard v13.2] Invoice query failed:', err?.message)
      }

      invoices.forEach((inv: any) => {
        const amount = safeNum(inv.totalAmount)
        const paidAmount = safeNum(inv.paidAmount)
        const invoiceType = normalizeType(inv.invoiceType)

        if (isReturnInvoiceType(invoiceType)) {
          returnStats.count += 1
          returnStats.totalAmount += amount

          if (inv.id) todaySalesInvoiceIds.push(inv.id)
          return
        }

        if (isPurchaseInvoiceType(invoiceType)) {
          return
        }

        stats.totalSales += amount
        stats.invoicesCount += 1

        if (inv.id) todaySalesInvoiceIds.push(inv.id)

        const pType = normalizeType(inv.paymentType)

        switch (pType) {
          case 'cash':
          case 'نقدی':
            stats.cashSales += amount
            break
          case 'card':
          case 'pos':
          case 'کارتخوان':
            stats.cardSales += amount
            break
          case 'credit':
          case 'نسیه':
            stats.creditSales += amount
            break
          case 'installment':
          case 'قسطی':
          case 'اقساطی':
            stats.installmentPrepaid += paidAmount
            stats.installmentRemaining += amount - paidAmount
            stats.cashSales += paidAmount
            stats.installmentSales += amount - paidAmount
            break
          case 'check':
          case 'cheque':
          case 'چک':
            stats.checkSales += amount
            break
          default:
            stats.cashSales += amount
        }
      })

      // ─── سود امروز / سود بازه مؤثر ─────────────────────────
      let profitToday = { revenue: 0, cogs: 0, profit: 0 }
      let profitTotal = { revenue: 0, cogs: 0, profit: 0 }

      try {
        profitToday = await calculateProfitForInvoiceIds(
          tenantDb,
          tenantId,
          todaySalesInvoiceIds,
          effectiveFiscalYearId,
          fy
        )

        const hasInvoiceFiscalYearId = isFieldSupported(
          tenantDb.invoice,
          'fiscalYearId'
        )

        const allCashierInvoiceWhere: any = {
          tenantId,
          cashierId,
          status: {
            notIn: ['cancelled', 'Cancelled', 'void', 'Void', 'draft', 'Draft'],
          },
        }

        if (effectiveFiscalYearId) {
          if (hasInvoiceFiscalYearId) {
            allCashierInvoiceWhere.fiscalYearId = effectiveFiscalYearId
          } else if (fy) {
            const { start, end } = fiscalStartEnd(fy)
            allCashierInvoiceWhere.invoiceDate = { gte: start, lte: end }
          }
        }

        const allCashierInvoices = await tenantDb.invoice.findMany({
          where: allCashierInvoiceWhere,
          select: {
            id: true,
            invoiceType: true,
          },
        })

        const allSalesInvoiceIds = allCashierInvoices
          .filter((inv: any) => isSalesRelatedInvoiceType(inv.invoiceType))
          .map((inv: any) => inv.id)
          .filter(Boolean)

        profitTotal = await calculateProfitForInvoiceIds(
          tenantDb,
          tenantId,
          allSalesInvoiceIds,
          effectiveFiscalYearId,
          fy
        )
      } catch (err: any) {
        console.warn('[cashier-dashboard v13.2] Profit query failed:', err?.message)
      }

      // ─── حساب صندوق ────────────────────────────────────────
      let cashAccountId: string | null = null

      try {
        const cashAccount = await tenantDb.account.findFirst({
          where: {
            tenantId,
            OR: [
              { code: { startsWith: '101' } },
              { name: { contains: 'صندوق' } },
              { code: '1010' },
            ],
          },
          orderBy: { code: 'asc' },
        })

        if (cashAccount) {
          cashAccountId = cashAccount.id
        }
      } catch (err: any) {
        console.warn('[cashier-dashboard v13.2] Cash account query failed:', err?.message)
      }

      // ─── موجودی اولیه ──────────────────────────────────────
      const openingBalance = await getOpeningBalance(
        tenantDb,
        tenantId,
        cashierId,
        effectiveFiscalYearId,
        fy,
        cashAccountId
      )

      let startOfDayBalance = 0
      let currentBalance = 0
      let totalCashIn = 0
      let totalCashOut = 0

      if (cashAccountId) {
              const [
          journalOpsAll,
          journalOpsBefore,
          manualAll,
          manualBefore,
          journalTodayFlow,
          manualTodayFlow,
        ] = await Promise.all([
          getJournalCashBalance(
            tenantDb,
            tenantId,
            cashAccountId,
            effectiveFiscalYearId,
            fy,
            effectiveTomorrow,
            true
          ),
          getJournalCashBalance(
            tenantDb,
            tenantId,
            cashAccountId,
            effectiveFiscalYearId,
            fy,
            rangeFrom,
            true
          ),
          getManualCashBalance(
            tenantDb,
            tenantId,
            effectiveFiscalYearId,
            fy,
            effectiveTomorrow
          ),
          getManualCashBalance(
            tenantDb,
            tenantId,
            effectiveFiscalYearId,
            fy,
            rangeFrom
          ),
          getJournalCashFlow(
            tenantDb,
            tenantId,
            cashAccountId,
            rangeFrom,
            effectiveTomorrow,
            effectiveFiscalYearId,
            fy,
            true
          ),
          getManualCashFlow(
            tenantDb,
            tenantId,
            rangeFrom,
            effectiveTomorrow,
            effectiveFiscalYearId,
            fy
          ),
        ])

        currentBalance = openingBalance + journalOpsAll + manualAll.balance
        startOfDayBalance = openingBalance + journalOpsBefore + manualBefore.balance

        totalCashIn = journalTodayFlow.inflow + manualTodayFlow.inflow
        totalCashOut = journalTodayFlow.outflow + manualTodayFlow.outflow
      } else {
        const startFallback = await calculateCashBalanceFallback(
          tenantDb,
          tenantId,
          openingBalance,
          effectiveFiscalYearId,
          fy,
          rangeFrom
        )

          const currentFallback = await calculateCashBalanceFallback(
          tenantDb,
          tenantId,
          openingBalance,
          effectiveFiscalYearId,
          fy,
          effectiveTomorrow
        )
        startOfDayBalance = startFallback.cashBalance
        currentBalance = currentFallback.cashBalance

        totalCashIn =
          (currentFallback.paymentIn - startFallback.paymentIn) +
          (currentFallback.movementIn - startFallback.movementIn)

        totalCashOut =
          (currentFallback.paymentOut - startFallback.paymentOut) +
          (currentFallback.movementOut - startFallback.movementOut)
      }

      stats.totalCashIn = totalCashIn
      stats.totalCashOut = totalCashOut

  console.log('[cashier-dashboard v13.2.1] Final summary', {
        tenantId,
        cashierId,
        requestedDate: dateParam,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        usedFallbackFiscalYearRange,
        effectiveRange: {
          from: rangeFrom.toISOString(),
          to: rangeTo.toISOString(),
        },
        openingBalance,
        startOfDayBalance,
        currentBalance,
        totalSales: stats.totalSales,
        returns: returnStats.totalAmount,
        returnsCount: returnStats.count,
        netSales: stats.totalSales - returnStats.totalAmount,
        cashSales: stats.cashSales,
        cardSales: stats.cardSales,
        creditSales: stats.creditSales,
        installmentSales: stats.installmentSales,
        installmentPrepaid: stats.installmentPrepaid,
        installmentRemaining: stats.installmentRemaining,
        checkSales: stats.checkSales,
        totalCashIn: stats.totalCashIn,
        totalCashOut: stats.totalCashOut,
        profitToday: profitToday.profit,
        profitTotal: profitTotal.profit,
      })

      const warning = allYears
        ? ALL_YEARS_WARNING
        : usedFallbackFiscalYearRange
        ? FALLBACK_FISCAL_YEAR_WARNING
        : undefined

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        warning,
        summary: {
          cashSales: stats.cashSales,
          cardSales: stats.cardSales,
          creditSales: stats.creditSales,
          installmentSales: stats.installmentSales,
          installmentPrepaid: stats.installmentPrepaid,
          installmentRemaining: stats.installmentRemaining,
          checkSales: stats.checkSales,
          totalSales: stats.totalSales,
          returns: returnStats.totalAmount,
          returnsCount: returnStats.count,
          netSales: stats.totalSales - returnStats.totalAmount,
          invoicesCount: stats.invoicesCount,
          totalCashIn: stats.totalCashIn,
          totalCashOut: stats.totalCashOut,
          openingBalance,
          startOfDayBalance,
          currentBalance,
          realCashBalance: currentBalance,
          isMultiCashier: true,

          revenueToday: profitToday.revenue,
          cogsToday: profitToday.cogs,
          profitToday: profitToday.profit,

          revenueTotal: profitTotal.revenue,
          cogsTotal: profitTotal.cogs,
          profitTotal: profitTotal.profit,
        },
        diagnostics: {
          fiscalYearApplied: Boolean(effectiveFiscalYearId && !allYears),
          requestedFiscalYearId: fiscalYearIdParam || null,
          allYearsRequested: allYears,
          dateRangeValid: range.valid,
          usedFallbackFiscalYearRange,
          requestedDate: dateParam,
          dateRange: {
            from: rangeFrom.toISOString(),
            to: rangeTo.toISOString(),
          },
          hasCashAccountId: Boolean(cashAccountId),
          invoiceCount: invoices.length,
          todaySalesInvoiceIdsCount: todaySalesInvoiceIds.length,
        },
      })
    } catch (error: any) {
      console.error('[cashier-dashboard v13.2] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: 'خطا در دریافت داشبورد صندوق‌دار: ' + (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)