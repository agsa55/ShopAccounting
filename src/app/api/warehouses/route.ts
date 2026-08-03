// ============================================================================
// src/app/api/warehouses/route.ts (v9.5 - FINAL FIXED)
// ★ Product با حرف بزرگ (مطابق schema)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'

const MAX_WAREHOUSES_BY_TIER: Record<string, number> = {
  basic: 1,
  professional: 2,
  enterprise: 0,
}

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const warehouses = await tenantDb.warehouse.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { StockLevels: true, PurchaseInvoices: true, Invoices: true },
        },
      },
    })

    const warehousesWithDetails = await Promise.all(
      warehouses.map(async (wh: any) => {
        try {
          // ★ بارگذاری موجودی‌ها - استفاده از Product (حرف بزرگ)
          const stockLevels = await tenantDb.stockLevel.findMany({
            where: { warehouseId: wh.id },
            include: {
              Product: {  // ★ حرف بزرگ P
                select: {
                  id: true,
                  name: true,
                  code: true,
                  salePrice: true,
                  purchasePrice: true,
                  minStock: true,
                  unitLabel: true,
                },
              },
            },
            orderBy: { quantity: 'desc' },
          })

          // ★ توجه: item.Product (حرف بزرگ)
          const stockItems = stockLevels.map((item: any) => ({
            productId: item.Product?.id,
            productName: item.Product?.name || 'محصول حذف‌شده',
            productCode: item.Product?.code || '',
            quantity: item.quantity || 0,
            unitLabel: item.Product?.unitLabel || 'عدد',
            salePrice: item.Product?.salePrice || 0,
            purchasePrice: item.Product?.purchasePrice || 0,
            value: (item.quantity || 0) * (item.Product?.salePrice || 0),
            costValue: (item.quantity || 0) * (item.Product?.purchasePrice || 0),
            minStock: item.Product?.minStock || 0,
          }))

          const totalValue = stockItems.reduce((sum: number, item: any) => sum + (item.value || 0), 0)
          const totalCostValue = stockItems.reduce((sum: number, item: any) => sum + (item.costValue || 0), 0)
          const totalItems = stockItems.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)
          const totalStockItems = stockItems.length

          const lowStockCount = stockItems.filter((item: any) => 
            item.minStock > 0 && item.quantity <= item.minStock
          ).length

          const activeStockCount = stockItems.filter((item: any) => item.quantity > 0).length

          return {
            id: wh.id,
            name: wh.name,
            code: wh.code,
            isDefault: wh.isDefault,
            isActive: wh.isActive,
            _count: wh._count,
            stockItems: stockItems.slice(0, 10),
            totalStockItems,
            activeStockCount,
            totalValue,
            totalCostValue,
            totalItems,
            lowStockCount,
          }
        } catch (err) {
          console.error(`[Warehouses GET] Error for warehouse ${wh.name}:`, err)
          return {
            id: wh.id,
            name: wh.name,
            code: wh.code,
            isDefault: wh.isDefault,
            isActive: wh.isActive,
            _count: wh._count,
            stockItems: [],
            totalStockItems: 0,
            activeStockCount: 0,
            totalValue: 0,
            totalCostValue: 0,
            totalItems: 0,
            lowStockCount: 0,
          }
        }
      })
    )

    const planName = tenant.planName || tenant.planTierName || 'simple'
    const features = getFeaturesByPlanName(planName)
    const tier = features.tier
    const maxWarehouses = MAX_WAREHOUSES_BY_TIER[tier] ?? 1
    const isUnlimited = maxWarehouses === 0

    return NextResponse.json({
      success: true,
      data: warehousesWithDetails,
      planInfo: {
        tier,
        planName,
        maxWarehouses: isUnlimited ? 'نامحدود' : maxWarehouses,
        currentCount: warehouses.length,
        canAdd: isUnlimited || warehouses.length < maxWarehouses,
      },
    })
  } catch (error: any) {
    console.error('[Warehouses GET] Error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error?.message || 'خطا در بارگذاری انبارها' 
    }, { status: 500 })
  }
})

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    const planName = tenant.planName || tenant.planTierName || 'simple'
    const features = getFeaturesByPlanName(planName)
    const tier = features.tier
    const maxWarehouses = MAX_WAREHOUSES_BY_TIER[tier] ?? 1
    const isUnlimited = maxWarehouses === 0

    const currentCount = await tenantDb.warehouse.count({ where: { tenantId } })
    if (!isUnlimited && currentCount >= maxWarehouses) {
      return NextResponse.json({
        success: false,
        error: `در پلن ${features.label} فقط ${maxWarehouses} انبار مجاز است.`,
        code: 'PLAN_LIMIT_WAREHOUSES',
      }, { status: 403 })
    }

    if (!body.name) {
      return NextResponse.json({ success: false, error: 'نام انبار الزامی است' }, { status: 400 })
    }

    let code = body.code
    if (!code) {
      code = `WH-${(currentCount + 1).toString().padStart(2, '0')}`
    }

    const existing = await tenantDb.warehouse.findFirst({ where: { tenantId, code } })
    if (existing) {
      return NextResponse.json({ success: false, error: 'کد انبار تکراری است' }, { status: 400 })
    }

    const isDefault = body.isDefault === true
    if (isDefault) {
      await tenantDb.warehouse.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      })
    }

    const shouldBeDefault = isDefault || currentCount === 0

    const warehouse = await tenantDb.warehouse.create({
      data: {
        tenantId,
        name: body.name,
        code,
        isDefault: shouldBeDefault,
        isActive: body.isActive !== false,
        branchId: body.branchId || null,
      },
    })

    return NextResponse.json({ success: true, data: warehouse }, { status: 201 })
  } catch (error: any) {
    console.error('[Warehouses POST] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'خطا در ایجاد انبار' }, { status: 500 })
  }
})

export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (!body.id) {
      return NextResponse.json({ success: false, error: 'شناسه الزامی است' }, { status: 400 })
    }

    const existing = await tenantDb.warehouse.findFirst({ where: { id: body.id, tenantId } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'انبار یافت نشد' }, { status: 404 })
    }

    const updateData: any = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.code !== undefined) {
      const dup = await tenantDb.warehouse.findFirst({ where: { tenantId, code: body.code, NOT: { id: body.id } } })
      if (dup) return NextResponse.json({ success: false, error: 'کد تکراری است' }, { status: 400 })
      updateData.code = body.code
    }
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    if (body.isDefault === true && !existing.isDefault) {
      await tenantDb.warehouse.updateMany({
        where: { tenantId, isDefault: true, NOT: { id: body.id } },
        data: { isDefault: false },
      })
      updateData.isDefault = true
    }

    await tenantDb.warehouse.update({ where: { id: body.id }, data: updateData })
    return NextResponse.json({ success: true, message: 'انبار به‌روزرسانی شد' })
  } catch (error: any) {
    console.error('[Warehouses PUT] Error:', error)
    return NextResponse.json({ success: false, error: 'خطا در به‌روزرسانی' }, { status: 500 })
  }
})

export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ success: false, error: 'شناسه الزامی است' }, { status: 400 })

    const warehouse = await tenantDb.warehouse.findFirst({ where: { id, tenantId } })
    if (!warehouse) return NextResponse.json({ success: false, error: 'انبار یافت نشد' }, { status: 404 })
    if (warehouse.isDefault) return NextResponse.json({ success: false, error: 'انبار پیش‌فرض قابل حذف نیست' }, { status: 400 })

    const stockCount = await tenantDb.stockLevel.count({
      where: { warehouseId: id, quantity: { gt: 0 } },
    })
    if (stockCount > 0) {
      return NextResponse.json({
        success: false,
        error: 'این انبار دارای موجودی است. ابتدا موجودی را به انبار دیگری منتقل کنید.',
      }, { status: 400 })
    }

    try { await tenantDb.stockLevel.deleteMany({ where: { warehouseId: id } }) } catch {}
    try { await tenantDb.stockMovement.deleteMany({ where: { OR: [{ fromWarehouseId: id }, { toWarehouseId: id }] } }) } catch {}
    
    await tenantDb.warehouse.delete({ where: { id } })
    return NextResponse.json({ success: true, message: 'انبار حذف شد' })
  } catch (error: any) {
    console.error('[Warehouses DELETE] Error:', error)
    return NextResponse.json({ success: false, error: 'خطا در حذف' }, { status: 500 })
  }
})