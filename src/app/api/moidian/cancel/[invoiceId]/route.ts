// ============================================================================
// src/app/api/moidian/cancel/[invoiceId]/route.ts — POST
// لغو فاکتور در سامانه مودیان
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { cancelInvoiceInMoidian } from '@/lib/moidian'
import { db } from '@/lib/db'

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

    // ★ دریافت referenceId از فاکتور
    const invoice = await db.client.invoice.findFirst({
      where: { id: invoiceId, tenantId: tenant.tenantId },
      select: { id: true, moidianReferenceId: true, moidianStatus: true },
    })

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'فاکتور یافت نشد' }, { status: 404 })
    }

    if (!invoice.moidianReferenceId) {
      return NextResponse.json({ success: false, error: 'این فاکتور هنوز به مودیان ارسال نشده است' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const reason = body.reason || 'CANCELLED_BY_SELLER'

    const result = await cancelInvoiceInMoidian(tenant.tenantId, invoice.moidianReferenceId, reason)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'فاکتور با موفقیت در مودیان لغو شد',
    })
  } catch (error: any) {
    console.error('[Moidian Cancel] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در لغو فاکتور' },
      { status: 500 }
    )
  }
})
