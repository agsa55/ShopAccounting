// ============================================================================
// src/app/api/fiscal-years/pre-close-check/route.ts — v2.0 حالت ترکیبی
// ============================================================================
// ★ v2.0: اضافه شدن منطق سه حالته (normal / early / too_early)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { checkSubscriptionStatus, getRenewOptions } from '@/lib/plan-limits'
import { previewClosingEntry, previewOpeningEntry } from '@/lib/accounting/closing-entry'

// ─── تایپ‌های حالت بستن ─────────────────────────────────────

export type CloseMode = 'normal' | 'early' | 'too_early'

export const CLOSE_MODE_LABELS: Record<CloseMode, string> = {
  normal: 'بستن عادی سال مالی',
  early: 'بستن زودهنگام با تأیید ویژه',
  too_early: 'بستن سال مالی در این زمان ممکن نیست',
}

// ─── ثابت‌های زمان‌بندی ─────────────────────────────────────

const NORMAL_WINDOW_DAYS = 7      // ۷ روز آخر سال → حالت عادی
const MIN_DAYS_FOR_EARLY = 180    // حداقل ۶ ماه برای بستن زودهنگام

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

      // ── ۳. تعیین حالت بستن (منطق سه حالته) ──────────────────
      let closeMode: CloseMode = 'normal'
      let closeModeReason = ''

      if (daysUntilEnd <= NORMAL_WINDOW_DAYS) {
        // 🟢 حالت عادی: ۷ روز آخر یا بعد از پایان
        closeMode = 'normal'
        closeModeReason = isYearEnded
          ? 'سال مالی به پایان رسیده است'
          : `در ${NORMAL_WINDOW_DAYS} روز پایانی سال مالی هستید`
      } else if (daysPassed >= MIN_DAYS_FOR_EARLY) {
        // 🟡 حالت زودتر: بعد از ۶ ماه
        closeMode = 'early'
        closeModeReason = `${daysUntilEnd} روز تا پایان سال باقی مانده است. بستن زودهنگام نیاز به تأیید ویژه دارد.`
      } else {
        // 🔴 حالت خیلی زود: قبل از ۶ ماه
        closeMode = 'too_early'
        closeModeReason = `فقط ${daysPassed} روز از سال مالی سپری شده است. حداقل ${MIN_DAYS_FOR_EARLY} روز لازم است.`
      }

      // ── ۴. بررسی وضعیت پلن ──────────────────────────────────
      const subscriptionStatus = await checkSubscriptionStatus(tenantId)
      const renewOptions = await getRenewOptions(tenantId)

      // ── ۵. بررسی اسناد Draft ──────────────────────────────────
      const draftEntriesCount = await tenantDb.journalEntry.count({
        where: {
          tenantId,
          status: 'draft',
          date: { gte: activeYear.startDate, lte: activeYear.endDate },
        },
      })

      // ── ۶. پیش‌نمایش سند اختتامیه ────────────────────────────
      const closingPreview = await previewClosingEntry(
        tenantId,
        activeYear.id,
        activeYear.startDate,
        activeYear.endDate
      )

          // ── ۷. پیش‌نمایش سند افتتاحیه ────────────────────────────
      const openingPreview = await previewOpeningEntry(tenantId, endDate)

      // ★★★ FIX: رفع هشدار کاذب
      // اگر اختلاف برابر با سود خالص باشد، یعنی سند اختتامیه هنوز صادر نشده
      // و پس از صدور، تراز برقرار می‌شود. پس این یک هشدار کاذب است.
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

      // ── ۸. پیشنهاد نام سال جدید ──────────────────────────────
      const nextYearName = generateNextYearName(activeYear.name)

      // ── ۹. تصمیم‌گیری نهایی: canProceed ─────────────────────
      let canProceed = true
      const warnings: string[] = []
      const blockers: string[] = []

      // Blocker 1: حالت خیلی زود
      if (closeMode === 'too_early') {
        blockers.push(
          `🔴 ${closeModeReason} در شرایط بسیار خاص (مثل انحلال شرکت) با پشتیبانی تماس بگیرید.`
        )
        canProceed = false
      }

      // Warning 1: حالت زودتر
      if (closeMode === 'early') {
        warnings.push(
          `🟡 ${closeModeReason} برای ادامه باید دلیل موجه وارد کنید.`
        )
      }

      // Blocker 2: اسناد Draft
      if (draftEntriesCount > 0) {
        blockers.push(
          `${draftEntriesCount} سند در وضعیت پیش‌نویس (Draft) وجود دارد. ابتدا آنها را تأیید یا حذف کنید.`
        )
        canProceed = false
      }

      // Warning 2: پلن منقضی شده
      if (subscriptionStatus.billingCycle === 'annual' && subscriptionStatus.isExpired) {
        if (subscriptionStatus.status === 'read_only') {
          blockers.push(
            'اشتراک شما منقضی شده و در حالت فقط خواندنی است. برای بستن سال مالی، ابتدا اشتراک را تمدید کنید.'
          )
          canProceed = false
        } else if (subscriptionStatus.status === 'grace_period') {
          warnings.push(
            `⚠️ شما در دوره مهلت هستید. ${Math.abs(subscriptionStatus.daysRemaining)} روز برای تمدید فرصت دارید.`
          )
        }
      }

      // Warning 3: عدم تراز
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
          // ★★★ فیلدهای جدید برای حالت ترکیبی
          closeMode,
          closeModeReason,
          closeModeLabels: {
            normal: '🟢 بستن عادی سال مالی',
            early: '🟡 بستن زودهنگام با تأیید ویژه',
            too_early: '🔴 بستن در این زمان ممکن نیست',
          },
          subscription: {
            status: subscriptionStatus.status,
            tierNameFa: subscriptionStatus.tierNameFa,
            billingCycle: subscriptionStatus.billingCycle,
            isLifetime: subscriptionStatus.isLifetime,
            isExpired: subscriptionStatus.isExpired,
            daysRemaining: subscriptionStatus.daysRemaining,
            message: subscriptionStatus.message,
          },
          requiresRenewal:
            subscriptionStatus.billingCycle === 'annual' &&
            subscriptionStatus.isExpired,
          canProceed,
          warnings,
          blockers,
          closingPreview,
          openingPreview,
          suggestedNewYearName: nextYearName,
          renewOptions: subscriptionStatus.billingCycle === 'annual' ? renewOptions : [],
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

function generateNextYearName(prevName: string): string {
  // ★★★ FIX: پشتیبانی از ارقام فارسی (۱۴۰۵) و انگلیسی (1405)
const faYearMatch = prevName.match(/([۰-۹]{4}|\d{4})/)
  if (faYearMatch) {
    const yearStr = faYearMatch[1]
    const isFa = /[۰-۹]/.test(yearStr)
    let year: number
    if (isFa) {
      year = parseInt(
        yearStr.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))),
        10
      )
    } else {
      year = parseInt(yearStr, 10)
    }
    const nextYear = year + 1
    const nextYearStr = isFa
      ? String(nextYear).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)])
      : String(nextYear)
    return prevName.replace(yearStr, nextYearStr)
  }
  return prevName + ' (بعدی)'
}