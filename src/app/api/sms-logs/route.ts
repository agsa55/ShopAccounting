// ============================================================================
// src/app/api/sms-logs/route.ts — GET (v5.2 ★★★ Phase 4)
// ShopAccounting — SMS Logs API (history of sent SMS)
// ----------------------------------------------------------------------------
// GET /api/sms-logs?limit=50&type=installment_reminder
//
// ★ نیاز به توکن معتبر دارد (withTenantIsolation)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'

export const GET = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const { searchParams } = new URL(req.url)
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
      const type = searchParams.get('type')
      const status = searchParams.get('status')

      const where: any = { tenantId: tenant.tenantId }
      if (type) where.type = type
      if (status) where.status = status

      const logs = await tenant.tenantDb.smsLog.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        take: limit,
      })

      // ★ محاسبه آمار
      const totalCount = await tenant.tenantDb.smsLog.count({ where: { tenantId: tenant.tenantId } })
      const sentCount = await tenant.tenantDb.smsLog.count({
        where: { tenantId: tenant.tenantId, status: 'sent' }
      })
      const failedCount = await tenant.tenantDb.smsLog.count({
        where: { tenantId: tenant.tenantId, status: 'failed' }
      })
      const mockCount = await tenant.tenantDb.smsLog.count({
        where: { tenantId: tenant.tenantId, mockMode: true }
      })

      return NextResponse.json({
        success: true,
        data: {
          logs,
          stats: {
            total: totalCount,
            sent: sentCount,
            failed: failedCount,
            mock: mockCount,
          },
        },
      })
    } catch (error: any) {
      console.error('[SMS Logs GET] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت لاگ‌ها' },
        { status: 500 }
      )
    }
  }
)
