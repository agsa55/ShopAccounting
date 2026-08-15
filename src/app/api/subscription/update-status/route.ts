// ============================================================================
// src/app/api/subscription/update-status/route.ts
// ★ API جدید: وضعیت به‌روزرسانی سیستم
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'
import { getSubscriptionStatus } from '@/lib/trial-utils'

export const GET = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const status = await getSubscriptionStatus(tenant.tenantId)

      const response = NextResponse.json({
        success: true,
        data: status,
      })

      // هدرهای هشدار
      if (status.needsUpdate) {
        response.headers.set('X-Update-Required', 'true')
        response.headers.set('X-Days-Until-Update', String(status.daysUntilUpdate))
      }

      if (status.isLocked) {
        response.headers.set('X-System-Locked', 'true')
      }

      return response
    } catch (error: any) {
      console.error('[Update Status] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در بررسی وضعیت سیستم' },
        { status: 500 }
      )
    }
  }
)