// ============================================================================
// src/app/api/stock-movements/route.ts — GET / POST (v2.1 ★★★ TypeScript Fix)
// انتقال بین انبارها + مشاهده حرکت‌های کالا
// ----------------------------------------------------------------------------
// ★★★ v2.1: رفع خطاهای TypeScript — افزودن type parameter به Map
// ★★★ v2.0: اصلاحات Transaction Safety
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  GET /api/stock-movements — لیست حرکت‌های کالا
//  Query: tenantId, type (transfer|purchase|sale|all), limit, productId
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'all'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const productId = searchParams.get('productId')

    const where: any = { tenantId }
    if (type && type !== 'all') where.movementType = type
    if (productId) where.productId = productId

    const movements = await tenantDb.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // ★ گرفتن نام محصولات و انبارها جداگانه (مطمئن‌تر از include)
    const productIds = [...new Set(movements.map((m: any) => m.productId).filter(Boolean))]
    const warehouseIds = [...new Set([
      ...movements.map((m: any) => m.fromWarehouseId).filter(Boolean),
      ...movements.map((m: any) => m.toWarehouseId).filter(Boolean),
    ])]

    const [products, warehouses] = await Promise.all([
      productIds.length > 0 ? tenantDb.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, code: true },
      }) : [],
      warehouseIds.length > 0 ? tenantDb.warehouse.findMany({
        where: { id: { in: warehouseIds } },
        select: { id: true, name: true },
      }) : [],
    ])

    // ★★★ v2.1: افزودن type parameter به Map (رفع خطای TS2339)
    const productMap = new Map<string, { id: string; name: string; code: string | null }>(
      products.map((p: any) => [p.id, p])
    )
    const warehouseMap = new Map<string, { id: string; name: string }>(
      warehouses.map((w: any) => [w.id, w])
    )

    const result = movements.map((m: any) => {
      const product = productMap.get(m.productId)
      return {
        ...m,
        productName: product?.name || m.productId,
        productCode: product?.code || null,
        fromWarehouseName: m.fromWarehouseId ? warehouseMap.get(m.fromWarehouseId)?.name : null,
        toWarehouseName: m.toWarehouseId ? warehouseMap.get(m.toWarehouseId)?.name : null,
      }
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error('[StockMovements GET] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری حرکت‌های کالا' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/stock-movements — انتقال بین انبارها
//  ★★★ v2.0: تمام بررسی‌ها + عملیات داخل یک Transaction
//  Body: { tenantId, productId, fromWarehouseId, toWarehouseId, quantity, description }
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()
    const { productId, fromWarehouseId, toWarehouseId, quantity, description } = body

    // ★ اعتبارسنجی اولیه (بدون نیاز به DB)
    if (!productId || !fromWarehouseId || !toWarehouseId) {
      return NextResponse.json({ success: false, error: 'محصول، انبار مبدأ و مقصد الزامی هستند' }, { status: 400 })
    }
    if (fromWarehouseId === toWarehouseId) {
      return NextResponse.json({ success: false, error: 'انبار مبدأ و مقصد نمی‌توانند یکسان باشند' }, { status: 400 })
    }
    const qty = parseFloat(quantity)
    if (!qty || qty <= 0) {
      return NextResponse.json({ success: false, error: 'تعداد باید بیشتر از صفر باشد' }, { status: 400 })
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    // ★★★ v2.0: تمام بررسی‌ها + عملیات داخل Transaction (جلوگیری از Race Condition)
    const result = await txClient.$transaction(async (tx: any) => {
      // ★ بررسی انبارها (داخل transaction)
      const [fromWh, toWh] = await Promise.all([
        tx.warehouse.findFirst({ where: { id: fromWarehouseId, tenantId, isActive: true } }),
        tx.warehouse.findFirst({ where: { id: toWarehouseId, tenantId, isActive: true } }),
      ])
      if (!fromWh) throw new Error('انبار مبدأ یافت نشد یا غیرفعال است')
      if (!toWh) throw new Error('انبار مقصد یافت نشد یا غیرفعال است')

      // ★ بررسی محصول (داخل transaction)
      const product = await tx.product.findFirst({ where: { id: productId, tenantId } })
      if (!product) throw new Error('محصول یافت نشد')

      // ★ بررسی موجودی در انبار مبدأ (داخل transaction — بدون race condition)
      const fromStockLevel = await tx.stockLevel.findUnique({
        where: { warehouseId_productId: { warehouseId: fromWarehouseId, productId } },
      })

      if (!fromStockLevel || fromStockLevel.quantity < qty) {
        throw new Error(`موجودی کافی در انبار مبدأ نیست. موجودی فعلی: ${fromStockLevel?.quantity || 0}`)
      }

      // ★ کاهش موجودی انبار مبدأ
      await tx.stockLevel.update({
        where: { warehouseId_productId: { warehouseId: fromWarehouseId, productId } },
        data: { quantity: { decrement: qty } },
      })

      // ★ افزایش موجودی انبار مقصد (upsert)
      const toStockLevel = await tx.stockLevel.findUnique({
        where: { warehouseId_productId: { warehouseId: toWarehouseId, productId } },
      })

      if (toStockLevel) {
        // ★ محاسبه میانگین وزنی جدید (cost انبار مبدأ را به انبار مقصد منتقل می‌کنیم)
        const oldTotalValue = toStockLevel.quantity * toStockLevel.averageCost
        const newTotalValue = oldTotalValue + (qty * fromStockLevel.averageCost)
        const newTotalQty = toStockLevel.quantity + qty
        const newAvgCost = newTotalQty > 0 ? newTotalValue / newTotalQty : fromStockLevel.averageCost

        await tx.stockLevel.update({
          where: { warehouseId_productId: { warehouseId: toWarehouseId, productId } },
          data: {
            quantity: { increment: qty },
            averageCost: newAvgCost,
          },
        })
      } else {
        // ★ ایجاد StockLevel در انبار مقصد
        await tx.stockLevel.create({
          data: {
            tenantId,
            warehouseId: toWarehouseId,
            productId,
            quantity: qty,
            averageCost: fromStockLevel.averageCost,
          },
        })
      }

      // ★ ثبت حرکت کالا (یک رکورد با fromWarehouseId و toWarehouseId مطابق schema)
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          productId,
          fromWarehouseId,
          toWarehouseId,
          quantity: qty,
          unitCost: fromStockLevel.averageCost,
          movementType: 'transfer',
          referenceType: 'manual',
          referenceId: null,
          description: description || `انتقال ${qty} عدد ${product.name} از ${fromWh.name} به ${toWh.name}`,
        },
      })

      console.log(`[StockMovements POST] انتقال ${qty} از ${fromWh.name} به ${toWh.name} - محصول: ${product.name}`)

      return movement
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: `انتقال ${qty} عدد با موفقیت انجام شد`,
    }, { status: 201 })
  } catch (error: any) {
    console.error('[StockMovements POST] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'خطا در ثبت انتقال',
    }, { status: 500 })
  }
})