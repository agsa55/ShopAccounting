// ============================================================================
// src/app/api/moidian/query/[referenceId]/route.ts — GET
// استعلام وضعیت فاکتور در سامانه مودیان
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { queryInvoiceStatusInMoidian } from '@/lib/moidian'

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canMoidianIntegration) {
      return NextResponse.json(
        { success: false, error: 'اتصال سامانه مودیان در پلن فعلی شما در دسترس نیست' },
        { status: 403 }
      )
    }

    const { referenceId } = ctx.params as { referenceId: string }
    if (!referenceId) {
      return NextResponse.json({ success: false, error: 'شناسه مرجع الزامی است' }, { status: 400 })
    }

    const result = await queryInvoiceStatusInMoidian(tenant.tenantId, referenceId)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: { status: result.status },
    })
  } catch (error: any) {
    console.error('[Moidian Query] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در استعلام وضعیت' },
      { status: 500 }
    )
  }
})
