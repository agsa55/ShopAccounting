// ============================================================================
// src/app/api/stock-levels/route.ts — v1.0
// دریافت موجودی محصولات در یک انبار خاص
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

export const GET = withTenantAndPermission('pos')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const { searchParams } = new URL(req.url)
      const warehouseId = searchParams.get('warehouseId')
      const tenantId = searchParams.get('tenantId') || tenant.tenantId

      if (!warehouseId) {
        return NextResponse.json(
          { success: false, error: 'شناسه انبار الزامی است' },
          { status: 400 }
        )
      }

      const stockLevels = await db.client.stockLevel.findMany({
        where: { warehouseId, tenantId },
        select: {
          productId: true,
          quantity: true,
        },
      })

      return NextResponse.json({
        success: true,
        data: stockLevels,
      })
    } catch (error: any) {
      console.error('[StockLevels] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در بارگذاری موجودی انبار' },
        { status: 500 }
      )
    }
  }
)