// ============================================================================
// src/app/api/reports/designer/datasets/[id]/route.ts — v12.0 ★★★
// ShopAccounting — Single Report Dataset Detail API
// ----------------------------------------------------------------------------
// این API جزئیات کامل یک دیتاست (شامل فیلدها) را برمی‌گرداند.
//
// ★ امنیت:
//   - فقط دیتاست‌های تعریف‌شده در سمت سرور قابل دسترسی هستند
//   - اگر دیتاست وجود نداشته باشد، خطای 404 برگردانده می‌شود
//   - احراز هویت از طریق JWT یا header انجام می‌شود
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { extractTenantId } from '@/lib/reports/report-auth'
import { getDataset } from '@/lib/reports/report-datasets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    // 2. Validate id
    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'شناسه دیتاست الزامی است.',
        },
        { status: 400 }
      )
    }

    // 3. Get dataset from server-side definitions
    const dataset = getDataset(id)

    if (!dataset) {
      return NextResponse.json(
        {
          success: false,
          error: `دیتاست '${id}' یافت نشد.`,
        },
        { status: 404 }
      )
    }

    // 4. Return full dataset (including fields)
    return NextResponse.json({
      success: true,
      data: dataset,
    })

  } catch (error: any) {
    console.error('[Dataset Detail API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'خطای داخلی سرور',
      },
      { status: 500 }
    )
  }
}