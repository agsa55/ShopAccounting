// ============================================================================
// src/app/api/fiscal-years/pre-close-check/route.ts — v3.0 ★★★
// بررسی پیش‌نیازهای بستن سال مالی
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { previewClosingEntry, previewOpeningEntry } from '@/lib/accounting/closing-entry'

export type CloseMode = 'normal' | 'early' | 'too_early'

export const CLOSE_MODE_LABELS: Record<CloseMode, string> = {
  normal: 'بستن عادی سال مالی',
  early: 'بستن زودهنگام با تأیید ویژه',
  too_early: 'بستن سال مالی در این زمان ممکن نیست',
}

const NORMAL_WINDOW_DAYS = 7
const MIN_DAYS_FOR_EARLY = 180

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features.canCloseFiscalYear) {
        return NextResponse.json(
          { success: false, error: 'بستن سال مالی در پلن فعلی در دسترس نیست' },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      // ── ۱. یافتن سال فعال ────────────────────────────────────
      const activeYear = await tenantDb.fiscalYear.findFirst({
        where: { tenantId, isActive: true, isClosed: false },
      })

      if (!activeYear) {
        return NextResponse.json(
          { success: false, error: 'هیچ سال مالی فعالی وجود ندارد' },
          { status: 400 }
        )
      }

      // ── ۲. محاسبات زمانی ────────────────────────────────────
      const now = new Date()
      const startDate = new Date(activeYear.startDate)
      const endDate = new Date(activeYear.endDate)

      const daysUntilEnd = Math.ceil(
        (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
      const daysPassed = Math.floor(
        (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      const isYearEnded = daysUntilEnd <= 0

      // ── ۳. تعیین حالت بستن ──────────────────────────────────
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

      // ── ۴. بررسی اسناد Draft ──────────────────────────────────
      const draftEntriesCount = await tenantDb.journalEntry.count({
        where: {
          tenantId,
          status: 'draft',
          date: { gte: activeYear.startDate, lte: activeYear.endDate },
        },
      })

      // ── ۵. پیش‌نمایش سند اختتامیه ────────────────────────────
      const closingPreview = await previewClosingEntry(
        tenantId,
        activeYear.id,
        activeYear.startDate,
        activeYear.endDate
      )

      // ── ۶. پیش‌نمایش سند افتتاحیه (فقط برای نمایش، ساخته نمی‌شود)
      const openingPreview = await previewOpeningEntry(tenantId, endDate)

      // ★ FIX: رفع هشدار کاذب (سود خالص هنوز منتقل نشده)
      const netProfitAbs = Math.abs(closingPreview.netProfit || 0)
      if (
        !openingPreview.isBalanced &&
        netProfitAbs > 0 &&
        Math.abs(openingPreview.difference - netProfitAbs) < 1
      ) {
        openingPreview.isBalanced = true
        ;(openingPreview as any).differenceNote =
          'این اختلاف برابر با سود خالص است و پس از صدور سند اختتامیه به‌صورت خودکار رفع می‌شود.'
      }

      // ── ۷. تصمیم‌گیری نهایی: canProceed ─────────────────────
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

      if (!openingPreview.isBalanced) {
        warnings.push(
          `⚠️ مانده حساب‌ها ${openingPreview.difference.toLocaleString('fa-IR')} ریال اختلاف دارد. ممکن است حساب‌ها نیاز به بررسی داشته باشند.`
        )
      }

      return NextResponse.json({
        success: true,
        data: {
          activeYear: {
            id: activeYear.id,
            name: activeYear.name,
            startDate: activeYear.startDate,
            endDate: activeYear.endDate,
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