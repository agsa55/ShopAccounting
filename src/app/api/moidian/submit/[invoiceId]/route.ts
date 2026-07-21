// ============================================================================
// src/app/api/moidian/submit/[invoiceId]/route.ts — POST
// ارسال یک فاکتور به سامانه مودیان
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { submitInvoiceToMoidian } from '@/lib/moidian'

export const POST = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canMoidianIntegration) {
      return NextResponse.json(
        { success: false, error: 'اتصال سامانه مودیان در پلن فعلی شما در دسترس نیست' },
        { status: 403 }
      )
    }

    const { invoiceId } = ctx.params as { invoiceId: string }
    if (!invoiceId) {
      return NextResponse.json({ success: false, error: 'شناسه فاکتور الزامی است' }, { status: 400 })
    }

    const result = await submitInvoiceToMoidian(tenant.tenantId, invoiceId)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: {
        referenceId: result.referenceId,
        status: result.status,
      },
      message: 'فاکتور با موفقیت به سامانه مودیان ارسال شد',
    })
  } catch (error: any) {
    console.error('[Moidian Submit] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در ارسال فاکتور به مودیان' },
      { status: 500 }
    )
  }
})
