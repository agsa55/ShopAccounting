// ============================================================================
// src/app/api/fiscal-years/close/route.ts
// ShopAccounting — Official Fiscal Year Close API (Production Safe)
// ============================================================================
// ★ وظیفه:
//   - بستن سال مالی انتخابی یا فعال
//   - صدور سند اختتامیه
//   - جلوگیری از بستن تکراری
//   - ساخت سال جدید نمی‌کند؛ فقط پیشنهاد سال بعد را برمی‌گرداند
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import {
  closeFiscalYearCore,
  HttpError,
} from '@/lib/accounting/fiscal-year-close-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function handleCloseRequest(req: NextRequest, tenant: any) {
  try {
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

    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'فقط مدیران اجازه بستن سال مالی را دارند',
          code: 'ROLE_NOT_ALLOWED',
        },
        { status: 403 }
      )
    }

    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

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

    const result = await closeFiscalYearCore({
      tenantDb,
      tenantId,
      userId: tenant.user?.id || null,
      fiscalYearId: fiscalYearId || null,
      forceEarly,
      reason,
    })

    return NextResponse.json({
      success: true,
      data: result,
      message:
        result.netProfit >= 0
          ? `سال مالی «${result.closedYear.name}» بسته شد — سود خالص: ${Math.round(
              result.netProfit
            ).toLocaleString('fa-IR')} ریال`
          : `سال مالی «${result.closedYear.name}» بسته شد — زیان خالص: ${Math.abs(
              Math.round(result.netProfit)
            ).toLocaleString('fa-IR')} ریال`,
    })
  } catch (error: any) {
    console.error('[FiscalYears Close] Error:', error)

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
        error: error?.message || 'خطا در بستن سال مالی',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    )
  }
}

export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    return handleCloseRequest(req, tenant)
  }
)

export const PUT = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    return handleCloseRequest(req, tenant)
  }
)