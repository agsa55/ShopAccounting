// ============================================================================
// src/app/api/reports/designer/datasets/route.ts — v12.1
// ShopAccounting — List Report Datasets API
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { extractTenantId, getTenantInfo } from '@/lib/reports/report-auth'
import { getDatasetSummaries } from '@/lib/reports/report-datasets'
import { getFeaturesByPlanName } from '@/lib/plan-features'
function resolveTenantPlanName(tenant: any): string {
  return (
    tenant?.planName ||
    tenant?.planTierName ||
    tenant?.plan?.name ||
    'basic'
  )
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
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

    const tenant = await getTenantInfo(tenantId)

    if (!tenant) {
      return NextResponse.json(
        {
          success: false,
          error: 'فروشگاه یافت نشد.',
        },
        { status: 404 }
      )
    }
const planName = resolveTenantPlanName(tenant)

    const features = getFeaturesByPlanName(planName)

    if (!(features as any).canUseCustomReportDesigner) {
      return NextResponse.json(
        {
          success: false,
          error:
            'طراحی گزارش دلخواه در پلن فعلی شما در دسترس نیست. لطفاً پلن خود را ارتقا دهید.',
        },
        { status: 403 }
      )
    }

    const summaries = getDatasetSummaries()

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
        error: error?.message || 'خطای داخلی سرور',
      },
      { status: 500 }
    )
  }
}