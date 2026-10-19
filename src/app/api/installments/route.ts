// ============================================================================
// src/app/api/installments/route.ts — DISABLED LEGACY ENDPOINT
// ShopAccounting — Compatibility / Security Guard
// ----------------------------------------------------------------------------
// ★ این endpoint قدیمی و ناامن بود:
//   - tenantId از query param می‌گرفت
//   - پیش‌فرض tenantId = 'demo' داشت
//   - داخل GET write انجام می‌داد
//   - با ساختار فعلی installmentPlan/installmentSchedule سازگار نبود
//
// ★ فعلاً غیرفعال شده تا از نشت داده و خطای build جلوگیری شود.
// ★ نسخه سالم و سال‌محور:
//   /api/installment-plans
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error:
        'این endpoint قدیمی غیرفعال است. لطفاً از /api/installment-plans استفاده کنید.',
      code: 'LEGACY_ENDPOINT_DISABLED',
      replacement: '/api/installment-plans',
    },
    { status: 501 }
  )
}