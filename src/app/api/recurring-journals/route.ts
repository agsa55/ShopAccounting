// ============================================================================
// src/app/api/recurring-journals/route.ts — GET/POST (v6.1 Jalali Utils)
// ShopAccounting — Recurring Journals API (CRUD)
// ============================================================================
// ★ v6.1:
//   - استفاده از src/lib/jalali-utils.ts موجود پروژه
//   - محاسبه تاریخ اجرای بعدی بر اساس تقویم شمسی
//   - اعتبارسنجی حساب‌ها نسبت به tenant
//   - اعتبارسنجی قوی ردیف‌های سند
//   - بررسی سال مالی برای تاریخ شروع
//   - بازگشت activeFiscalYear / hasOpenFiscalYear / warning
//   - بازگشت nextExecutionFiscalYear و canGenerateNext برای هر الگو
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import {
  calculateNextExecutionDate,
  findFiscalYearForDateFromList,
  parseLocalDate,
  startOfDay,
} from '@/lib/jalali-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ═══════════════════════════════════════════════════════════════
// Types / Helpers
// ═══════════════════════════════════════════════════════════════

export interface FiscalYearPayload {
  id: string | null
  name: string | null
  startDate: string | null
  endDate: string | null
  isActive: boolean
  isClosed: boolean
}

function apiError(message: string, status = 400) {
  const err: any = new Error(message)
  err.status = status
  return err
}

export function buildFiscalYearPayload(fy: any): FiscalYearPayload | null {
  if (!fy) return null

  return {
    id: fy.id || null,
    name: fy.name || null,
    startDate: fy.startDate || null,
    endDate: fy.endDate || null,
    isActive: Boolean(fy.isActive),
    isClosed: Boolean(fy.isClosed),
  }
}

export async function getFiscalYears(tenantDb: any, tenantId: string): Promise<any[]> {
  try {
    return await tenantDb.fiscalYear.findMany({
      where: { tenantId },
      orderBy: { startDate: 'asc' },
    })
  } catch {
    return []
  }
}

export function getActiveOpenFiscalYear(fys: any[]): any | null {
  return (
    (fys || [])
      .filter((fy: any) => fy?.isActive === true && fy?.isClosed !== true)
      .sort(
        (a: any, b: any) =>
          new Date(b?.startDate || 0).getTime() -
          new Date(a?.startDate || 0).getTime()
      )[0] || null
  )
}

export function parseStoredLines(value: any): any[] {
  try {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') return JSON.parse(value)
    return []
  } catch {
    return []
  }
}

function toAmount(value: any, label: string): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw apiError(`${label} نامعتبر است`)
  }
  return Math.round(n * 100) / 100
}

export async function validateAndNormalizeLines(
  tenantDb: any,
  tenantId: string,
  rawLines: any
): Promise<any[]> {
  let lines = rawLines

  if (typeof lines === 'string') {
    try {
      lines = JSON.parse(lines)
    } catch {
      lines = []
    }
  }

  if (!Array.isArray(lines) || lines.length < 2) {
    throw apiError('حداقل دو ردیف سند الزامی است')
  }

  const normalized: any[] = []
  const accountIds = new Set<string>()

  let totalDebit = 0
  let totalCredit = 0
  let hasDebit = false
  let hasCredit = false

  for (const line of lines) {
    const accountId = String(line?.accountId || '').trim()

    if (!accountId) {
      throw apiError('همه ردیف‌ها باید حساب مشخص داشته باشند')
    }

    const debit = toAmount(line?.debit, 'مبلغ بدهکار')
    const credit = toAmount(line?.credit, 'مبلغ بستانکار')

    if (debit > 0 && credit > 0) {
      throw apiError('یک ردیف نمی‌تواند همزمان بدهکار و بستانکار باشد')
    }

    if (debit > 0) hasDebit = true
    if (credit > 0) hasCredit = true

    totalDebit += debit
    totalCredit += credit
    accountIds.add(accountId)

    normalized.push({
      accountId,
      debit,
      credit,
      description: line?.description ? String(line.description) : null,
    })
  }

  if (!hasDebit || !hasCredit) {
    throw apiError('سند باید حداقل یک ردیف بدهکار و یک ردیف بستانکار داشته باشد')
  }

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw apiError(
      `سند تراز نیست. بدهکار: ${totalDebit}, بستانکار: ${totalCredit}`
    )
  }

  const uniqueIds = Array.from(accountIds)

  const accounts = await tenantDb.account.findMany({
    where: {
      id: { in: uniqueIds },
      tenantId,
    },
    select: { id: true },
  })

  if (accounts.length !== uniqueIds.length) {
    throw apiError(
      'یکی از حساب‌های انتخابی نامعتبر است یا به این فروشگاه تعلق ندارد.'
    )
  }

  return normalized
}

// ═══════════════════════════════════════════════════════════════
//  GET — لیست تمام الگوهای تکرارشونده
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features?.canViewAccounts) {
        return NextResponse.json(
          {
            success: false,
            error:
              'اسناد تکرارشونده فقط در پلن حرفه‌ای و سازمانی در دسترس است',
          },
          { status: 403 }
        )
      }

      const { searchParams } = new URL(req.url)
      const includeInactive = searchParams.get('includeInactive') === 'true'

      const where: any = { tenantId }
      if (!includeInactive) where.isActive = true

      const [templatesRaw, fiscalYears] = await Promise.all([
        tenantDb.recurringJournal.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        }),
        getFiscalYears(tenantDb, tenantId),
      ])

      const activeFy = getActiveOpenFiscalYear(fiscalYears)
      const hasOpenFiscalYear = Boolean(activeFy)

      const allAccountIds: string[] = []

      for (const rj of templatesRaw) {
        const lines = parseStoredLines((rj as any).journalLines)
        for (const line of lines) {
          if (line?.accountId) allAccountIds.push(String(line.accountId))
        }
      }

      const accountMap = new Map<string, { code: string; name: string }>()

      if (allAccountIds.length > 0) {
        try {
          const accounts = await tenantDb.account.findMany({
            where: {
              id: { in: [...new Set(allAccountIds)] },
              tenantId,
            },
            select: { id: true, code: true, name: true },
          })

          for (const acc of accounts) {
            accountMap.set(String(acc.id), {
              code: acc.code || '-',
              name: acc.name || '-',
            })
          }
        } catch {}
      }

      const enriched = await Promise.all(
        templatesRaw.map(async (rj: any) => {
          let generatedCount = 0

          try {
            generatedCount = await tenantDb.journalEntry.count({
              where: {
                tenantId,
                sourceType: 'recurring',
                sourceId: rj.id,
              },
            })
          } catch {}

          const storedLines = parseStoredLines(rj.journalLines)

          const lines = storedLines.map((line: any) => ({
            accountId: line?.accountId || '',
            debit: Number(line?.debit || 0),
            credit: Number(line?.credit || 0),
            description: line?.description || '',
            accountName:
              accountMap.get(String(line?.accountId || ''))?.name || '-',
            accountCode:
              accountMap.get(String(line?.accountId || ''))?.code || '-',
          }))

          const nextFy = rj.nextExecutionDate
            ? findFiscalYearForDateFromList(fiscalYears, rj.nextExecutionDate)
            : null

          let generationWarning: string | null = null

          if (!rj.isActive) {
            generationWarning = 'الگو غیرفعال است'
          } else if (!rj.nextExecutionDate) {
            generationWarning = 'تاریخ اجرای بعدی مشخص نیست'
          } else if (!nextFy) {
            generationWarning =
              'برای تاریخ اجرای بعدی، سال مالی تعریف نشده است'
          } else if (nextFy.isClosed) {
            generationWarning = `سال مالی «${nextFy.name}» بسته است`
          } else if (!nextFy.isActive) {
            generationWarning = `سال مالی «${nextFy.name}» فعال نیست`
          }

          const canGenerateNext = Boolean(
            rj.isActive &&
              rj.nextExecutionDate &&
              nextFy &&
              nextFy.isActive &&
              !nextFy.isClosed
          )

          return {
            id: rj.id,
            title: rj.title,
            description: rj.description,
            frequency: rj.frequency,
            dayOfMonth: rj.dayOfMonth,
            dayOfWeek: rj.dayOfWeek,
            monthOfYear: rj.monthOfYear,
            startDate: rj.startDate,
            endDate: rj.endDate,
            nextExecutionDate: rj.nextExecutionDate,
            lastExecutedAt: rj.lastExecutedAt,
            isActive: Boolean(rj.isActive),
            autoPost: Boolean(rj.autoPost),
            lines,
            generatedCount,
            createdAt: rj.createdAt,
            nextExecutionFiscalYear: buildFiscalYearPayload(nextFy),
            canGenerateNext,
            generationWarning,
          }
        })
      )

      return NextResponse.json({
        success: true,
        data: enriched,
        activeFiscalYear: buildFiscalYearPayload(activeFy),
        hasOpenFiscalYear,
        warning: hasOpenFiscalYear
          ? null
          : 'سال مالی فعال و بازی وجود ندارد. ایجاد الگوی جدید و اجرای خودکار غیرفعال است.',
      })
    } catch (error: any) {
      console.error('[RecurringJournals GET] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در بارگذاری اسناد تکرارشونده',
        },
        { status: error?.status || 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  POST — ایجاد الگوی تکرارشونده جدید
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features?.canViewAccounts) {
        return NextResponse.json(
          {
            success: false,
            error:
              'اسناد تکرارشونده فقط در پلن حرفه‌ای و سازمانی در دسترس است',
          },
          { status: 403 }
        )
      }

      const body = await req.json()

      const {
        title,
        description,
        frequency,
        dayOfMonth,
        dayOfWeek,
        monthOfYear,
        startDate: rawStartDate,
        endDate: rawEndDate,
        lines,
        autoPost = true,
      } = body

      if (!title || !String(title).trim()) {
        throw apiError('عنوان الزامی است')
      }

      const validFrequencies = ['weekly', 'monthly', 'quarterly', 'yearly']
      if (!validFrequencies.includes(frequency)) {
        throw apiError('دوره تکرار نامعتبر است')
      }

      const normalizedLines = await validateAndNormalizeLines(
        tenantDb,
        tenantId,
        lines
      )

      const startDate = parseLocalDate(rawStartDate) || startOfDay(new Date())

      if (!startDate || Number.isNaN(startDate.getTime())) {
        throw apiError('تاریخ شروع نامعتبر است')
      }

      let endDate: Date | null = null
      if (rawEndDate) {
        endDate = parseLocalDate(rawEndDate)
        if (!endDate) throw apiError('تاریخ پایان نامعتبر است')
        if (endDate < startDate) {
          throw apiError('تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد')
        }
      }

      const fiscalYears = await getFiscalYears(tenantDb, tenantId)
      const activeFy = getActiveOpenFiscalYear(fiscalYears)

      if (!activeFy) {
        throw apiError(
          'سال مالی فعال و بازی وجود ندارد. برای ایجاد الگوی جدید ابتدا یک سال مالی فعال تعریف کنید.'
        )
      }

      const startFy = findFiscalYearForDateFromList(fiscalYears, startDate)

      if (!startFy) {
        throw apiError(
          'برای تاریخ شروع این الگو، سال مالی تعریف نشده است. لطفاً ابتدا سال مالی مربوطه را ایجاد کنید.'
        )
      }

      if (startFy.isClosed) {
        throw apiError(
          `سال مالی «${startFy.name}» بسته شده است و امکان ایجاد الگو با تاریخ شروع در آن وجود ندارد.`
        )
      }

      if (!startFy.isActive || startFy.id !== activeFy.id) {
        throw apiError(
          'تاریخ شروع الگو باید داخل سال مالی فعال و باز باشد.'
        )
      }

      const nextExecutionDate = calculateNextExecutionDate(
        frequency,
        dayOfMonth ?? null,
        dayOfWeek ?? null,
        monthOfYear ?? null,
        startDate
      )

      const recurringJournal = await tenantDb.recurringJournal.create({
        data: {
          tenantId,
          title: String(title).trim(),
          description: description ? String(description) : null,
          frequency,
          dayOfMonth: dayOfMonth ?? null,
          dayOfWeek: dayOfWeek ?? null,
          monthOfYear: monthOfYear ?? null,
          startDate,
          endDate,
          nextExecutionDate,
          journalLines: JSON.stringify(normalizedLines),
          isActive: true,
          autoPost: Boolean(autoPost),
        },
      })

      const nextFy = findFiscalYearForDateFromList(
        fiscalYears,
        nextExecutionDate
      )

      return NextResponse.json(
        {
          success: true,
          data: {
            id: recurringJournal.id,
            title: recurringJournal.title,
            frequency: recurringJournal.frequency,
            nextExecutionDate: recurringJournal.nextExecutionDate,
            isActive: recurringJournal.isActive,
            nextExecutionFiscalYear: buildFiscalYearPayload(nextFy),
          },
          message: 'الگوی تکرارشونده با موفقیت ایجاد شد',
        },
        { status: 201 }
      )
    } catch (error: any) {
      console.error('[RecurringJournals POST] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در ایجاد الگوی تکرارشونده',
        },
        { status: error?.status || 500 }
      )
    }
  }
)