// ============================================================================
// src/app/api/reports/designer/datasets/[id]/route.ts — v12.1
// ShopAccounting — Single Report Dataset Detail API
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { extractTenantId, getTenantInfo } from '@/lib/reports/report-auth'
import { getDataset } from '@/lib/reports/report-datasets'
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'شناسه دیتاست الزامی است.',
        },
        { status: 400 }
      )
    }

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

    const fiscalYearStrategy = dataset.fiscalYear?.strategy || 'none'

    return NextResponse.json({
      success: true,
      data: {
        ...dataset,
        fiscalYearStrategy,
        allowsFiscalYearFilter: fiscalYearStrategy !== 'none',
      },
    })
  } catch (error: any) {
    console.error('[Dataset Detail API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'خطای داخلی سرور',
      },
      { status: 500 }
    )
  }
}