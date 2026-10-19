// ============================================================================
// src/app/api/fiscal-years/pre-close-check/route.ts — v3.2 Fiscal Year Target Safe
// بررسی پیش‌نیازهای بستن سال مالی
// ============================================================================
// ★ v3.2:
//   - احترام کامل به fiscalYearId درخواستی
//   - رد صریح سال مالی بسته‌شده
//   - رد وجود سند اختتامیه قبلی برای همان سال
//   - preview افتتاحیه سال‌محور و بدون double count
//   - محاسبه روزها بر اساس UTC calendar day برای کاهش خطای timezone
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { previewClosingEntry } from '@/lib/accounting/closing-entry'

export type CloseMode = 'normal' | 'early' | 'too_early'

export const CLOSE_MODE_LABELS: Record<CloseMode, string> = {
  normal: 'بستن عادی سال مالی',
  early: 'بستن زودهنگام با تأیید ویژه',
  too_early: 'بستن سال مالی در این زمان ممکن نیست',
}

const NORMAL_WINDOW_DAYS = 7
const MIN_DAYS_FOR_EARLY = 180
const DRAFT_STATUSES = ['draft', 'DRAFT', 'Draft']
const POSTED_STATUSES = ['posted', 'POSTED', 'Posted']

function utcDayNumber(d: Date): number {
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) /
      (1000 * 60 * 60 * 24)
  )
}

function roundMoney(value: number): number {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

async function buildOpeningPreview(
  tenantDb: any,
  tenantId: string,
  fiscalYearId: string,
  startDate: Date,
  endDate: Date,
  closingPreview: any
) {
  const accounts = await tenantDb.account.findMany({
    where: { tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
    },
  })

  const permanentAccounts = accounts.filter((a: any) => {
    const code = String(a.code || '')
    return (
      code.startsWith('1') ||
      code.startsWith('2') ||
      code.startsWith('3')
    )
  })

  const permanentIds = new Set<string>(
    permanentAccounts.map((a: any) => String(a.id))
  )

  const rawEntries = await tenantDb.journalEntry.findMany({
    where: {
      tenantId,
      status: { in: POSTED_STATUSES },
      OR: [
        { fiscalYearId },
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

  const entries = rawEntries.filter((e: any) => e.isCancelled !== true)

  const balances = new Map<string, number>()

  for (const entry of entries) {
    for (const line of entry.lines || []) {
      const accountId = String(line.accountId || '')
      if (!permanentIds.has(accountId)) continue

      const signed =
        Number(line.debit || 0) - Number(line.credit || 0)

      balances.set(accountId, (balances.get(accountId) || 0) + signed)
    }
  }

  let retainedEarningsAccountId =
    closingPreview?.retainedEarningsAccountId || null

  if (!retainedEarningsAccountId) {
    const retainedAcc = accounts.find((a: any) => {
      const code = String(a.code || '')
      const name = String(a.name || '')
      return code === '3100' || name.includes('سود انباشته')
    })

    retainedEarningsAccountId = retainedAcc?.id || null
  }

  const netProfit = Number(closingPreview?.netProfit || 0)

  const assets: any[] = []
  const liabilities: any[] = []
  const equity: any[] = []

  for (const acc of accounts) {
    const code = String(acc.code || '')
    const accountId = String(acc.id)
    const signed = balances.get(accountId) || 0

    if (code.startsWith('1')) {
      const balance = roundMoney(signed)
      if (Math.abs(balance) >= 1) {
        assets.push({
          accountId,
          name: acc.name,
          code,
          balance,
        })
      }
    } else if (code.startsWith('2')) {
      const balance = roundMoney(-signed)
      if (Math.abs(balance) >= 1) {
        liabilities.push({
          accountId,
          name: acc.name,
          code,
          balance,
        })
      }
    } else if (code.startsWith('3')) {
      let balance = roundMoney(-signed)

      if (retainedEarningsAccountId && accountId === String(retainedEarningsAccountId)) {
        balance += roundMoney(netProfit)
      }

      if (Math.abs(balance) >= 1) {
        equity.push({
          accountId,
          name: acc.name,
          code,
          balance,
        })
      }
    }
  }

  assets.sort((a, b) => String(a.code).localeCompare(String(b.code), 'fa'))
  liabilities.sort((a, b) => String(a.code).localeCompare(String(b.code), 'fa'))
  equity.sort((a, b) => String(a.code).localeCompare(String(b.code), 'fa'))

  const totalAssets = roundMoney(
    assets.reduce((sum, item) => sum + Number(item.balance || 0), 0)
  )

  const totalLiabilities = roundMoney(
    liabilities.reduce((sum, item) => sum + Number(item.balance || 0), 0)
  )

  const totalEquity = roundMoney(
    equity.reduce((sum, item) => sum + Number(item.balance || 0), 0)
  )

  const difference = roundMoney(
    totalAssets - (totalLiabilities + totalEquity)
  )

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    isBalanced: Math.abs(difference) < 1,
    difference,
  }
}

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const features = getFeaturesByPlanName(tenant.planTierName)

      if (!features.canCloseFiscalYear) {
        return NextResponse.json(
          {
            success: false,
            error: 'بستن سال مالی در پلن فعلی در دسترس نیست',
          },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)
      const requestedFiscalYearId = (
        searchParams.get('fiscalYearId') || ''
      ).trim()

      let targetYear: any = null

      // ── ۱. اگر fiscalYearId داده شد، همان سال بررسی شود ──────
      if (requestedFiscalYearId) {
        targetYear = await tenantDb.fiscalYear.findFirst({
          where: {
            id: requestedFiscalYearId,
            tenantId,
          },
        })

        if (!targetYear) {
          return NextResponse.json(
            {
              success: false,
              error: 'سال مالی درخواستی یافت نشد.',
              code: 'FISCAL_YEAR_NOT_FOUND',
            },
            { status: 404 }
          )
        }
      } else {
        // ── ۲. در غیر این صورت، سال فعال و باز ───────────────────
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
          return NextResponse.json(
            {
              success: false,
              error: 'هیچ سال مالی فعالی وجود ندارد',
              code: 'NO_ACTIVE_FISCAL_YEAR',
            },
            { status: 400 }
          )
        }
      }

      // ── ۳. اگر سال بسته شده، قطعاً اجازه ادامه نیست ───────────
      if (targetYear.isClosed === true) {
        return NextResponse.json(
          {
            success: false,
            error: 'این سال مالی قبلاً بسته شده است.',
            code: 'FISCAL_YEAR_ALREADY_CLOSED',
          },
          { status: 409 }
        )
      }

      // ── ۴. اگر سال غیرفعال است ولی بسته نشده، هشدار/رد ───────
      if (targetYear.isActive !== true) {
        return NextResponse.json(
          {
            success: false,
            error: 'سال مالی انتخابی فعال نیست.',
            code: 'FISCAL_YEAR_NOT_ACTIVE',
          },
          { status: 400 }
        )
      }

      // ── . اگر برای همین سال قبلاً سند اختتامیه وجود دارد، رد ─
      const existingCloseRaw = await tenantDb.journalEntry.findFirst({
        where: {
          tenantId,
          fiscalYearId: targetYear.id,
          sourceType: 'fiscal_year_close',
          status: { in: POSTED_STATUSES },
        },
        orderBy: {
          date: 'desc',
        },
      })

      if (existingCloseRaw && existingCloseRaw.isCancelled !== true) {
        return NextResponse.json(
          {
            success: false,
            error: 'برای این سال مالی قبلاً سند اختتامیه صادر شده است.',
            code: 'FISCAL_YEAR_CLOSE_ENTRY_EXISTS',
          },
          { status: 409 }
        )
      }

      // ── ۶. محاسبات زمانی ──────────────────────────────────────
      const now = new Date()
      const startDate = new Date(targetYear.startDate)
      const endDate = new Date(targetYear.endDate)

      const nowDay = utcDayNumber(now)
      const startDay = utcDayNumber(startDate)
      const endDay = utcDayNumber(endDate)

      const daysPassed = nowDay - startDay
      const daysUntilEnd = endDay - nowDay
      const isYearEnded = daysUntilEnd <= 0

      // ── ۷. تعیین حالت بستن ────────────────────────────────────
      let closeMode: CloseMode = 'normal'
      let closeModeReason = ''

      if (daysUntilEnd <= NORMAL_WINDOW_DAYS) {
        closeMode = 'normal'
        closeModeReason = isYearEnded
          ? 'سال مالی به پایان رسیده است'
          : `در ${NORMAL_WINDOW_DAYS} روز پایانی سال مالی هستید`
      } else if (daysPassed >= MIN_DAYS_FOR_EARLY) {
        closeMode = 'early'
        closeModeReason = `${daysUntilEnd} روز تا پایان سال باقی مانده است. بستن زودهنگام نیاز به تأیید ویژه دارد.`
      } else {
        closeMode = 'too_early'
        closeModeReason = `فقط ${daysPassed} روز از سال مالی سپری شده است. حداقل ${MIN_DAYS_FOR_EARLY} روز لازم است.`
      }

      // ── ۸. بررسی اسناد Draft بر اساس سال هدف ──────────────────
      const draftEntriesCount = await tenantDb.journalEntry.count({
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

      // ── ۹. اسناد بدون fiscalYearId داخل بازه سال ──────────────
      const nullFiscalYearEntriesCount = await tenantDb.journalEntry.count({
        where: {
          tenantId,
          fiscalYearId: null,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      })

      // ── ۱۰. پیش‌نمایش سند اختتامیه ─────────────────────────────
      const closingPreview = await previewClosingEntry(
        tenantId,
        targetYear.id,
        startDate,
        endDate
      )

      // ── ۱۱. پیش‌نمایش سند افتتاحیه سال‌محور ────────────────────
      const openingPreview = await buildOpeningPreview(
        tenantDb,
        tenantId,
        targetYear.id,
        startDate,
        endDate,
        closingPreview
      )

      // ── ۱۲. تصمیم‌گیری نهایی: canProceed ───────────────────────
      let canProceed = true
      const warnings: string[] = []
      const blockers: string[] = []

      if (closeMode === 'too_early') {
        blockers.push(
          `🔴 ${closeModeReason} در شرایط بسیار خاص (مثل انحلال شرکت) با پشتیبانی تماس بگیرید.`
        )
        canProceed = false
      }

      if (closeMode === 'early') {
        warnings.push(
          `🟡 ${closeModeReason} برای ادامه باید دلیل موجه وارد کنید.`
        )
      }

      if (draftEntriesCount > 0) {
        blockers.push(
          `${draftEntriesCount} سند در وضعیت پیش‌نویس (Draft) وجود دارد. ابتدا آنها را تأیید یا حذف کنید.`
        )
        canProceed = false
      }

      if (nullFiscalYearEntriesCount > 0) {
        warnings.push(
          `⚠️ ${nullFiscalYearEntriesCount} سند داخل بازه این سال مالی هنوز به fiscalYearId متصل نشده است. در فرآیند بستن سال، به‌صورت خودکار به این سال وصل می‌شود.`
        )
      }

      if (!openingPreview.isBalanced) {
        warnings.push(
          `⚠️ مانده حساب‌ها ${openingPreview.difference.toLocaleString(
            'fa-IR'
          )} ریال اختلاف دارد. ممکن است حساب‌ها نیاز به بررسی داشته باشند.`
        )
      }

      return NextResponse.json({
        success: true,
        data: {
          activeYear: {
            id: targetYear.id,
            name: targetYear.name,
            startDate: targetYear.startDate,
            endDate: targetYear.endDate,
            isYearEnded,
            daysUntilEnd,
            daysPassed,
          },
          closeMode,
          closeModeReason,
          canProceed,
          warnings,
          blockers,
          closingPreview,
          openingPreview,
          nullFiscalYearEntriesCount,
        },
      })
    } catch (error: any) {
      console.error('[PreCloseCheck] Error:', error?.message)

      return NextResponse.json(
        { success: false, error: 'خطا در بررسی پیش‌نیازها' },
        { status: 500 }
      )
    }
  }
)