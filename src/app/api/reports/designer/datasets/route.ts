// ============================================================================
// src/app/api/reports/designer/datasets/route.ts — v12.0 ★★★
// ShopAccounting — List Report Datasets API
// ----------------------------------------------------------------------------
// این API لیست دیتاست‌های مجاز برای گزارش دلخواه را برمی‌گرداند.
//
// ★ امنیت:
//   - فقط دیتاست‌های تعریف‌شده در سمت سرور برگردانده می‌شوند
//   - کاربر نمی‌تواند دیتاست غیرمجازی را درخواست کند
//   - احراز هویت از طریق JWT یا header انجام می‌شود
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { extractTenantId } from '@/lib/reports/report-auth'
import { getDatasetSummaries } from '@/lib/reports/report-datasets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // 1. Extract tenantId
    const tenantId = await extractTenantId(req)
    if (!tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'tenantId یافت نشد. لطفاً دوباره وارد شوید.',
        },
        { status: 401 }
      )
    }

    // 2. Get dataset summaries from server-side definitions
    const summaries = getDatasetSummaries()

    // 3. Return
    return NextResponse.json({
      success: true,
      data: {
        datasets: summaries,
        total: summaries.length,
      },
    })

  } catch (error: any) {
    console.error('[List Datasets API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'خطای داخلی سرور',
      },
      { status: 500 }
    )
  }
}