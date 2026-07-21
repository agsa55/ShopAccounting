// ============================================================================
// src/app/api/sync/route.ts — POST (v3.0)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.0: بسیار ساده‌شده — دیگه نیازی به سینک بین بانک‌ها نیست
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const POST = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    const lastSyncAt = body.lastSyncAt ? new Date(body.lastSyncAt) : null

    console.log(`[Sync] v3.0: Sync for tenant ${tenantId}`)

    const syncResult: any = {
      tenantId,
      syncTime: new Date().toISOString(),
      changes: {
        products: 0,
        invoices: 0,
        customers: 0,
        categories: 0,
        installmentPlans: 0,
      },
    }

    const dateFilter = lastSyncAt ? { updatedAt: { gte: lastSyncAt } } : {}

    try {
      syncResult.changes.products = await tenantDb.product.count({
        where: { tenantId, ...dateFilter },
      })
    } catch { /* ignore */ }

    try {
      syncResult.changes.invoices = await tenantDb.invoice.count({
        where: { tenantId, ...dateFilter },
      })
    } catch { /* ignore */ }

    try {
      syncResult.changes.customers = await tenantDb.customer.count({
        where: { tenantId, ...dateFilter },
      })
    } catch { /* ignore */ }

    try {
      syncResult.changes.categories = await tenantDb.category.count({
        where: { tenantId, ...dateFilter },
      })
    } catch { /* ignore */ }

    try {
      syncResult.changes.installmentPlans = await tenantDb.installmentPlan.count({
        where: { tenantId, ...dateFilter },
      })
    } catch { /* ignore */ }

    return NextResponse.json({
      success: true,
      data: syncResult,
    })
  } catch (error: any) {
    console.error('[Sync] POST error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در همگام‌سازی اطلاعات' },
      { status: 500 }
    )
  }
})
