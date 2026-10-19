// ============================================================================
// src/app/api/fiscal-years/basic-close/route.ts
// ShopAccounting — Legacy Basic Close Wrapper (Production Safe)
// ============================================================================
// ★ v4.4:
//   - این فایل دیگر منطق مستقل بستن سال مالی ندارد.
//   - فقط یک wrapper سازگار با مسیر قدیمی است.
//   - تمام عملیات واقعی به سرویس مرکزی closeFiscalYearCore() واگذار می‌شود.
//   - از بستن تکراری، سال بسته‌شده، سند اختتامیه تکراری و race condition جلوگیری می‌شود.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { ensureDefaultAccounts } from '@/lib/accounts-auto-seed'
import {
  closeFiscalYearCore,
  HttpError,
} from '@/lib/accounting/fiscal-year-close-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const POST = withTenantAndPermission('pos')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      // ── ۱. بررسی پلن ─────────────────────────────────────────
      const features = getFeaturesByPlanName(tenant.planTierName)

      if (!features?.canCloseFiscalYear) {
        return NextResponse.json(
          {
            success: false,
            error: 'بستن سال مالی در پلن فعلی در دسترس نیست',
            code: 'PLAN_NOT_ALLOWED',
          },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      // ── ۲. اطمینان از existence حساب‌های پیش‌فرض ──────────────
      // این کار برای سازگاری با نسخه قبلی basic-close انجام می‌شود.
      // اگر خطا داد، جلوی فرآیند را نمی‌گیریم؛ سرویس مرکزی بعداً حساب لازم را بررسی می‌کند.
      await ensureDefaultAccounts(tenantId).catch(() => {})

      // ── . دریافت ورودی‌ها ────────────────────────────────────
      const body = await req.json().catch(() => ({}))
      const url = new URL(req.url)

      const fiscalYearId = String(
        body?.fiscalYearId ||
          url.searchParams.get('fiscalYearId') ||
          ''
      ).trim()

      const forceEarly =
        body?.forceEarly === true ||
        body?.force === true ||
        body?.forceClose === true ||
        url.searchParams.get('forceEarly') === 'true'

      const reason = String(
        body?.reason ||
          body?.earlyReason ||
          body?.earlyCloseReason ||
          url.searchParams.get('reason') ||
          ''
      ).trim()

      // ── ۴. واگذاری کامل به سرویس مرکزی ────────────────────────
      const result = await closeFiscalYearCore({
        tenantDb,
        tenantId,
        userId: tenant.user?.id || null,
        fiscalYearId: fiscalYearId || null,
        forceEarly,
        reason,
      })

      // ── ۵. پاسخ سازگار با ساختار قبلی basic-close ─────────────
      return NextResponse.json({
        success: true,
        message: `سال مالی «${result.closedYear.name}» بسته شد.`,
        data: {
          closingEntry: result.closingEntry,
          openingEntry: null,
          netProfit: result.netProfit,
          fiscalYearId: result.closedYear.id,

          // اطلاعات تکمیلی برای debug / UI
          totalRevenue: result.totalRevenue,
          totalExpense: result.totalExpense,
          closeMode: result.closeMode,
          daysPassed: result.daysPassed,
          daysUntilEnd: result.daysUntilEnd,
          suggestedNextYear: result.suggestedNextYear,
        },
      })
    } catch (error: any) {
      console.error('[BasicClose] Error:', error)

      if (error instanceof HttpError) {
        return NextResponse.json(
          {
            success: false,
            error: error.message,
            code: error.code,
            details: error.details,
          },
          { status: error.statusCode }
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در بستن حساب',
          code: 'INTERNAL_ERROR',
        },
        { status: 500 }
      )
    }
  }
)