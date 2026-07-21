// ============================================================================
// src/app/api/moidian/batch/route.ts — POST
// ارسال گروهی فاکتورها به سامانه مودیان
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { submitInvoiceToMoidian } from '@/lib/moidian'
import { db } from '@/lib/db'

interface BatchResult {
  invoiceId: string
  invoiceNumber: string
  success: boolean
  referenceId?: string
  error?: string
}

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canMoidianIntegration) {
      return NextResponse.json(
        { success: false, error: 'اتصال سامانه مودیان در پلن فعلی شما در دسترس نیست' },
        { status: 403 }
      )
    }

    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیران اجازه ارسال گروهی به مودیان را دارند' },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const invoiceIds: string[] = body.invoiceIds || []
    const limit = Math.min(body.limit || 50, 100) // ★ حداکثر ۱۰۰ فاکتور

    // ★ دریافت فاکتورهای قابل ارسال
    const where: any = {
      tenantId: tenant.tenantId,
      status: { in: ['paid', 'Paid', 'confirmed', 'Confirmed'] },
      // ★ فقط فاکتورهایی که هنوز به مودیان ارسال نشده‌اند یا قبلاً خطا داده‌اند
      OR: [
        { moidianStatus: null },
        { moidianStatus: 'FAILED' },
        { moidianStatus: 'PENDING' },
      ],
    }

    if (invoiceIds.length > 0) {
      where.id = { in: invoiceIds }
    }

    const invoices = await db.client.invoice.findMany({
      where,
      select: { id: true, number: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    })

    // ★ ارسال فاکتورها به‌صورت ترتیبی (مودیان محدودیت rate دارد)
    const results: BatchResult[] = []
    let successCount = 0
    let failCount = 0

    for (const inv of invoices) {
      const result = await submitInvoiceToMoidian(tenant.tenantId, inv.id)
      results.push({
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        success: result.success,
        referenceId: result.referenceId,
        error: result.error,
      })
      if (result.success) successCount++
      else failCount++

      // ★ تأخیر کوتاه بین درخواست‌ها (جلوگیری از rate limit)
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    return NextResponse.json({
      success: true,
      data: {
        total: invoices.length,
        successCount,
        failCount,
        results,
      },
      message: `${successCount} فاکتور موفق، ${failCount} فاکتور ناموفق از مجموع ${invoices.length} فاکتور`,
    })
  } catch (error: any) {
    console.error('[Moidian Batch POST] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در ارسال گروهی' },
      { status: 500 }
    )
  }
})
