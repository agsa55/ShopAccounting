// ============================================================================
// src/lib/accounting/fiscal-year-close-service.ts
// ShopAccounting — Fiscal Year Close Service (Production Safe)
// ============================================================================
// ★ وظیفه:
//   - بستن ایمن سال مالی
//   - جلوگیری از بستن تکراری
//   - جلوگیری از race condition
//   - صدور سند اختتامیه فقط برای حساب‌های موقت
//   - انتقال سود/زیان به سود انباشته
//   - بازگشت پیشنهاد سال بعد بدون ساخت خودکار آن
// ============================================================================

import { randomUUID } from 'crypto'

export class HttpError extends Error {
  statusCode: number
  code?: string
  details?: any

  constructor(statusCode: number, message: string, code?: string, details?: any) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

const POSTED_STATUSES = ['posted', 'POSTED', 'Posted']
const DRAFT_STATUSES = ['draft', 'DRAFT', 'Draft']

const NORMAL_WINDOW_DAYS = 7
const MIN_DAYS_FOR_EARLY = 180

const EXCLUDED_CLOSE_SOURCE_TYPES = new Set([
  'fiscal_year_close',
  'fiscal_year_open',
  'initial_balance',
  'opening_balance',
  'manual_cash_movement',
])

const FA_DIGITS = '۰۱۲۴۵۶۸۹'

export interface CloseFiscalYearInput {
  tenantDb: any
  tenantId: string
  userId?: string | null
  fiscalYearId?: string | null
  forceEarly?: boolean
  reason?: string
}

export interface CloseFiscalYearResult {
  closedYear: {
    id: string
    name: string
    startDate: Date
    endDate: Date
  }
  closingEntry: {
    id: string
    number: string
    totalDebit: number
    totalCredit: number
    linesCount: number
  } | null
  totalRevenue: number
  totalExpense: number
  netProfit: number
  closeMode: 'normal' | 'early' | 'too_early'
  daysPassed: number
  daysUntilEnd: number
  suggestedNextYear: {
    name: string
    startDate: string
    endDate: string
  }
}

function utcDayNumber(d: Date): number {
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) /
      (1000 * 60 * 60 * 24)
  )
}

function normalizeText(value: any): string {
  return String(value || '').toLowerCase().trim()
}

function isRevenueAccount(acc: { code: string; type: string; name: string }): boolean {
  const code = String(acc.code || '')
  const type = normalizeText(acc.type)
  const name = normalizeText(acc.name)

  if (code.startsWith('5')) return false
  if (name.includes('بهای') || name.includes('بها تمام')) return false

  return (
    code.startsWith('4') ||
    code.startsWith('6') ||
    type.includes('revenue') ||
    type.includes('income') ||
    type.includes('sales') ||
    name.includes('فروش') ||
    name.includes('درآمد')
  )
}

function isExpenseAccount(acc: { code: string; type: string; name: string }): boolean {
  const code = String(acc.code || '')
  const type = normalizeText(acc.type)
  const name = normalizeText(acc.name)

  return (
    code.startsWith('5') ||
    code.startsWith('7') ||
    type.includes('expense') ||
    type.includes('cogs') ||
    type.includes('cost') ||
    name.includes('هزینه') ||
    name.includes('بهای') ||
    name.includes('بها تمام')
  )
}

function generateNextYearName(prevName: string): string {
  const yearMatch = prevName.match(/(\d{4})/)

  if (!yearMatch) {
    return `${prevName} (بعدی)`
  }

  const yearStr = yearMatch[1]
  const isFa = /[۰-۹]/.test(yearStr)

  let year: number

  if (isFa) {
    year = parseInt(
      yearStr.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))),
      10
    )
  } else {
    year = parseInt(yearStr, 10)
  }

  const nextYear = year + 1

  const nextYearStr = isFa
    ? String(nextYear).replace(/\d/g, (d) => FA_DIGITS[Number(d)])
    : String(nextYear)

  return prevName.replace(yearStr, nextYearStr)
}

export async function closeFiscalYearCore(
  input: CloseFiscalYearInput
): Promise<CloseFiscalYearResult> {
  const {
    tenantDb,
    tenantId,
    userId = null,
    fiscalYearId = null,
    forceEarly = false,
    reason = '',
  } = input

  if (!tenantDb?.$transaction) {
    throw new HttpError(500, 'Tranzaction برای دیتابیس در دسترس نیست.', 'DB_TRANSACTION_UNAVAILABLE')
  }

  // ─── ۱. یافتن سال هدف ───────────────────────────────────────
  let targetYear: any = null

  if (fiscalYearId) {
    targetYear = await tenantDb.fiscalYear.findFirst({
      where: {
        id: fiscalYearId,
        tenantId,
      },
    })

    if (!targetYear) {
      throw new HttpError(404, 'سال مالی درخواستی یافت نشد.', 'FISCAL_YEAR_NOT_FOUND')
    }
  } else {
    targetYear = await tenantDb.fiscalYear.findFirst({
      where: {
        tenantId,
        isActive: true,
        isClosed: false,
      },
      orderBy: {
        startDate: 'desc',
      },
    })

    if (!targetYear) {
      throw new HttpError(
        400,
        'هیچ سال مالی فعال و بازی برای بستن وجود ندارد.',
        'NO_ACTIVE_FISCAL_YEAR'
      )
    }
  }

  if (targetYear.isClosed === true) {
    throw new HttpError(409, 'این سال مالی قبلاً بسته شده است.', 'FISCAL_YEAR_ALREADY_CLOSED')
  }

  if (targetYear.isActive !== true) {
    throw new HttpError(400, 'سال مالی انتخابی فعال نیست.', 'FISCAL_YEAR_NOT_ACTIVE')
  }

  const startDate = new Date(targetYear.startDate)
  const endDate = new Date(targetYear.endDate)

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    startDate >= endDate
  ) {
    throw new HttpError(
      400,
      'تاریخ شروع/پایان سال مالی نامعتبر است.',
      'INVALID_FISCAL_YEAR_RANGE'
    )
  }

  // ─── ۲. بررسی زمان بستن ─────────────────────────────────────
  const now = new Date()

  const nowDay = utcDayNumber(now)
  const startDay = utcDayNumber(startDate)
  const endDay = utcDayNumber(endDate)

  const daysPassed = nowDay - startDay
  const daysUntilEnd = endDay - nowDay

  let closeMode: 'normal' | 'early' | 'too_early' = 'normal'

  if (daysUntilEnd <= NORMAL_WINDOW_DAYS) {
    closeMode = 'normal'
  } else if (daysPassed >= MIN_DAYS_FOR_EARLY) {
    closeMode = 'early'
  } else {
    closeMode = 'too_early'
  }

  if (closeMode === 'too_early') {
    if (!forceEarly || !reason.trim()) {
      throw new HttpError(
        400,
        `فقط ${daysPassed} روز از سال مالی سپری شده است. حداقل ${MIN_DAYS_FOR_EARLY} روز لازم است. برای شرایط خاص، بستن زودهنگام با دلیل موجه مجاز است.`,
        'FISCAL_YEAR_TOO_EARLY',
        { daysPassed, daysUntilEnd }
      )
    }
  }

  if (closeMode === 'early' && !reason.trim()) {
    throw new HttpError(
      400,
      'برای بستن زودهنگام سال مالی، وارد کردن دلیل الزامی است.',
      'EARLY_CLOSE_REASON_REQUIRED'
    )
  }

  // ─── ۳. transaction و lock ───────────────────────────────────
  return await tenantDb.$transaction(async (tx: any) => {
    const lockKey = `fiscal-year-close:${tenantId}:${targetYear.id}`

    try {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`
    } catch {
      // اگر دیتابیس PostgreSQL نباشد، بدون advisory lock ادامه می‌دهیم.
    }

    const freshYear = await tx.fiscalYear.findUnique({
      where: {
        id: targetYear.id,
      },
    })

    if (!freshYear) {
      throw new HttpError(404, 'سال مالی درخواستی یافت نشد.', 'FISCAL_YEAR_NOT_FOUND')
    }

    if (freshYear.isClosed === true) {
      throw new HttpError(409, 'این سال مالی قبلاً بسته شده است.', 'FISCAL_YEAR_ALREADY_CLOSED')
    }

    if (freshYear.isActive !== true) {
      throw new HttpError(400, 'سال مالی انتخابی فعال نیست.', 'FISCAL_YEAR_NOT_ACTIVE')
    }

    // ─── . جلوگیری از سند اختتامیه تکراری ─────────────────────
    const existingClose = await tx.journalEntry.findFirst({
      where: {
        tenantId,
        sourceType: 'fiscal_year_close',
        status: { in: POSTED_STATUSES },
        OR: [
          { fiscalYearId: targetYear.id },
          {
            fiscalYearId: null,
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
        ],
      },
      orderBy: {
        date: 'desc',
      },
    })

    if (existingClose && existingClose.isCancelled !== true) {
      throw new HttpError(
        409,
        'برای این سال مالی قبلاً سند اختتامیه صادر شده است.',
        'FISCAL_YEAR_CLOSE_ENTRY_EXISTS'
      )
    }

    // ─── ۵. جلوگیری از بستن با سند Draft ───────────────────────
    const draftCount = await tx.journalEntry.count({
      where: {
        tenantId,
        status: { in: DRAFT_STATUSES },
        OR: [
          { fiscalYearId: targetYear.id },
          {
            fiscalYearId: null,
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
        ],
      },
    })

    if (draftCount > 0) {
      throw new HttpError(
        400,
        `${draftCount} سند پیش‌نویس در این سال مالی وجود دارد. ابتدا آنها را تأیید یا حذف کنید.`,
        'HAS_DRAFT_ENTRIES'
      )
    }

    // ─── ۶. گرفتن اسناد قابل بستن ──────────────────────────────
    const rawEntries = await tx.journalEntry.findMany({
      where: {
        tenantId,
        status: { in: POSTED_STATUSES },
        OR: [
          { fiscalYearId: targetYear.id },
          {
            fiscalYearId: null,
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
        ],
      },
      include: {
        lines: true,
      },
    })

    const entries = rawEntries.filter((e: any) => {
      if (e.isCancelled === true) return false

      const sourceType = String(e.sourceType || '')
      if (EXCLUDED_CLOSE_SOURCE_TYPES.has(sourceType)) return false

      return true
    })

    // ─── . گرفتن حساب‌ها ─────────────────────────────────────
    const accountsList = await tx.account.findMany({
      where: { tenantId },
      select: {
        id: true,
        code: true,
        type: true,
        name: true,
      },
    })

    const accountMap = new Map<string, { code: string; type: string; name: string }>()

    for (const a of accountsList) {
      accountMap.set(String(a.id), {
        code: String(a.code || ''),
        type: normalizeText(a.type),
        name: normalizeText(a.name),
      })
    }

    // ─── ۸. محاسبه مانده درآمد و هزینه ─────────────────────────
    const revenueBalances = new Map<string, number>()
    const expenseBalances = new Map<string, number>()

    for (const entry of entries) {
      for (const line of entry.lines || []) {
        const accountId = String(line.accountId || '')
        if (!accountId) continue

        const acc = accountMap.get(accountId)
        if (!acc) continue

        const debit = Number(line.debit || 0)
        const credit = Number(line.credit || 0)

        if (isRevenueAccount(acc)) {
          const current = revenueBalances.get(accountId) || 0
          revenueBalances.set(accountId, current + credit - debit)
        } else if (isExpenseAccount(acc)) {
          const current = expenseBalances.get(accountId) || 0
          expenseBalances.set(accountId, current + debit - credit)
        }
      }
    }

    const totalRevenue = Array.from(revenueBalances.values()).reduce(
      (s, v) => s + Number(v || 0),
      0
    )

    const totalExpense = Array.from(expenseBalances.values()).reduce(
      (s, v) => s + Number(v || 0),
      0
    )

    const netProfit = totalRevenue - totalExpense

    // ─── . پیدا کردن حساب سود انباشته ─────────────────────────
    const retainedAccount =
      accountsList.find((a: any) => String(a.code || '') === '3100') ||
      accountsList.find((a: any) => {
        const name = normalizeText(a.name)
        return (
          name.includes('سود انباشته') ||
          name.includes('زیان انباشته') ||
          (name.includes('سود') && name.includes('انباشته'))
        )
      }) ||
      accountsList.find((a: any) => String(a.code || '').startsWith('31')) ||
      accountsList.find((a: any) => {
        const type = normalizeText(a.type)
        const code = String(a.code || '')
        const name = normalizeText(a.name)

        return (
          type.includes('equity') &&
          code.startsWith('3') &&
          !name.includes('سرمایه')
        )
      })

    const retainedEarningsAccountId = retainedAccount ? String(retainedAccount.id) : null

    if (Math.abs(netProfit) > 0.001 && !retainedEarningsAccountId) {
      throw new HttpError(
        400,
        'حساب سود (زیان) انباشته پیدا نشد. برای بستن سال مالی این حساب الزامی است.',
        'RETAINED_EARNINGS_ACCOUNT_NOT_FOUND'
      )
    }

    // ─── ۱۰. ساخت خطوط سند اختتامیه ────────────────────────────
    const closingLines: any[] = []

    for (const [accountId, balance] of revenueBalances.entries()) {
      const amount = Number(balance || 0)
      if (Math.abs(amount) <= 0.001) continue

      closingLines.push({
        accountId,
        debit: amount > 0 ? amount : 0,
        credit: amount < 0 ? Math.abs(amount) : 0,
        description: 'بستن حساب درآمد — انتقال به سود انباشته',
      })
    }

    for (const [accountId, balance] of expenseBalances.entries()) {
      const amount = Number(balance || 0)
      if (Math.abs(amount) <= 0.001) continue

      closingLines.push({
        accountId,
        debit: amount < 0 ? Math.abs(amount) : 0,
        credit: amount > 0 ? amount : 0,
        description: 'بستن حساب هزینه — انتقال به سود انباشته',
      })
    }

    if (retainedEarningsAccountId && Math.abs(netProfit) > 0.001) {
      closingLines.push({
        accountId: retainedEarningsAccountId,
        debit: netProfit < 0 ? Math.abs(netProfit) : 0,
        credit: netProfit > 0 ? netProfit : 0,
        description:
          netProfit > 0
            ? 'انتقال سود سال مالی به سود انباشته'
            : 'انتقال زیان سال مالی به سود انباشته',
      })
    }

    let closingEntry: any = null

    if (closingLines.length > 0) {
      const totalDebit = closingLines.reduce(
        (s: number, l: any) => s + Number(l.debit || 0),
        0
      )

      const totalCredit = closingLines.reduce(
        (s: number, l: any) => s + Number(l.credit || 0),
        0
      )

      if (Math.abs(totalDebit - totalCredit) > 1) {
        throw new HttpError(
          500,
          'سند اختتامیه محاسبه‌شده متوازن نیست. لطفاً با پشتیبانی تماس بگیرید.',
          'CLOSING_ENTRY_UNBALANCED',
          { totalDebit, totalCredit, difference: totalDebit - totalCredit }
        )
      }

      const jeCount = await tx.journalEntry.count({
        where: { tenantId },
      })

      const jeNumber = `JE-CLOSE-${(jeCount + 1).toString().padStart(6, '0')}`

      closingEntry = await tx.journalEntry.create({
        data: {
          number: jeNumber,
          fiscalYearId: targetYear.id,
          sourceId: targetYear.id,
          date: endDate,
          description: `سند اختتامیه سال مالی ${targetYear.name} — سود/زیان: ${Math.round(
            netProfit
          ).toLocaleString('fa-IR')} ریال`,
          status: 'posted',
          sourceType: 'fiscal_year_close',
          totalDebit,
          totalCredit,
          createdBy: userId || null,
          tenantId,
          lines: {
            create: closingLines,
          },
        },
      })
    }

    // ─── ۱. بستن سال مالی ─────────────────────────────────────
    await tx.fiscalYear.update({
      where: {
        id: targetYear.id,
      },
      data: {
        isClosed: true,
        closedAt: new Date(),
        closedBy: userId || null,
        isActive: false,
        notes:
          (freshYear.notes ? String(freshYear.notes) + ' | ' : '') +
          `بسته شد در ${new Date().toISOString().split('T')[0]} — ` +
          `سود/زیان: ${Math.round(netProfit).toLocaleString('fa-IR')} ریال` +
          (reason.trim() ? ` — دلیل: ${reason.trim()}` : ''),
      },
    })

    // ─── ۱۲. غیرفعال کردن سایر سال‌های فعال ────────────────────
    await tx.fiscalYear.updateMany({
      where: {
        tenantId,
        NOT: {
          id: targetYear.id,
        },
        isActive: true,
      },
      data: {
        isActive: false,
      },
    })

    // ─── ۱۳. audit log ─────────────────────────────────────────
    try {
      await tx.auditLogs.create({
        data: {
          id: randomUUID(),
          tenantId,
          userId: userId || null,
          action: 'FISCAL_YEAR_CLOSE',
          entityType: 'FiscalYear',
          entityId: targetYear.id,
          details: JSON.stringify({
            closedYearName: targetYear.name,
            netProfit,
            totalRevenue,
            totalExpense,
            closingEntryNumber: closingEntry?.number || null,
            closeMode,
            daysPassed,
            daysUntilEnd,
            reason: reason.trim() || null,
          }),
        },
      })
    } catch (auditErr) {
      console.warn('[FiscalYearCloseService] Audit log failed:', auditErr)
    }

    // ─── ۱۴. پیشنهاد سال بعد، بدون ساخت خودکار ─────────────────
    const suggestedStart = new Date(endDate)
    suggestedStart.setDate(suggestedStart.getDate() + 1)
    suggestedStart.setHours(0, 0, 0, 0)

    const suggestedEnd = new Date(suggestedStart)
    suggestedEnd.setDate(suggestedEnd.getDate() + 364)

    return {
      closedYear: {
        id: targetYear.id,
        name: targetYear.name,
        startDate: targetYear.startDate,
        endDate: targetYear.endDate,
      },
      closingEntry: closingEntry
        ? {
            id: closingEntry.id,
            number: closingEntry.number,
            totalDebit: Number(closingEntry.totalDebit || 0),
            totalCredit: Number(closingEntry.totalCredit || 0),
            linesCount: closingLines.length,
          }
        : null,
      totalRevenue,
      totalExpense,
      netProfit,
      closeMode,
      daysPassed,
      daysUntilEnd,
      suggestedNextYear: {
        name: generateNextYearName(targetYear.name),
        startDate: suggestedStart.toISOString(),
        endDate: suggestedEnd.toISOString(),
      },
    }
  })
}