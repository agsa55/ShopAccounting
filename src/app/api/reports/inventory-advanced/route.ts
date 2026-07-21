// src/app/api/reports/inventory-advanced/route.ts — v6.7 ★★★ FIXED TYPING
// ShopAccounting — Advanced Inventory Reports API
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

function safeNum(val: any): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

// ★ Types برای دیتاها
interface IWarehouse {
  id: string
  name: string
  code: string
  isDefault: boolean
}

interface ICategory {
  id: string
  name: string
}

interface IProduct {
  id: string
  code: string
  barcode?: string
  name: string
  categoryId?: string
  unitId?: string
  salePrice?: number | string
  purchasePrice?: number | string
  minStock?: number | string
  category?: ICategory
  unit?: {
    id: string
    nameFa?: string
    symbol?: string
  }
}

interface IStockLevel {
  id: string
  tenantId: string
  productId: string
  warehouseId: string
  quantity: number
  averageCost: number
}

interface IStockMovement {
  id: string
  tenantId: string
  productId: string
  fromWarehouseId?: string
  toWarehouseId?: string
  quantity: number
  unitCost: number
  movementType: string
  referenceType?: string
  referenceId?: string
  description?: string
  createdAt: Date
}

export const GET = withTenantAndPermission('dashboard')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)
      const reportType = searchParams.get('type') || 'stockByWarehouse'
      const warehouseId = searchParams.get('warehouseId')
      const categoryId = searchParams.get('categoryId')
      const dateFrom = searchParams.get('dateFrom')
      const dateTo = searchParams.get('dateTo')
      const lowStockOnly = searchParams.get('lowStockOnly') === 'true'

      console.log('[Inventory v6.7] Query params', {
        reportType,
        warehouseId,
        categoryId,
        dateFrom,
        dateTo,
        lowStockOnly,
      })

      // ★ گرفتن انبارها
      const warehouses: IWarehouse[] = await tenantDb.warehouse
        .findMany({
          where: { tenantId, isActive: true },
          select: { id: true, name: true, code: true, isDefault: true },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        })
        .catch(() => [])

      // ★ گرفتن دسته‌بندی‌ها
      const categories: ICategory[] = await tenantDb.category
        .findMany({
          where: { tenantId, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
        .catch(() => [])

      // ═══════════════════════════════════════════════════════════════
      //  نوع ۱: موجودی هر محصول در هر انبار (stockByWarehouse)
      // ═══════════════════════════════════════════════════════════════
      if (reportType === 'stockByWarehouse') {
        const productWhere: any = { tenantId, isActive: true }
        if (categoryId && categoryId !== 'all') productWhere.categoryId = categoryId

        const products: IProduct[] = await tenantDb.product
          .findMany({
            where: productWhere,
            include: {
              category: { select: { id: true, name: true } },
              unit: { select: { id: true, nameFa: true, symbol: true } },
            },
            orderBy: { name: 'asc' },
          })
          .catch(() => [])

        const productIds = products.map((p) => p.id)

        // ★ گرفتن StockLevel‌ها
        let stockLevels: IStockLevel[] = []
        if (productIds.length > 0) {
          const slWhere: any = { tenantId, productId: { in: productIds } }
          if (warehouseId && warehouseId !== 'all') slWhere.warehouseId = warehouseId
          stockLevels = await tenantDb.stockLevel.findMany({
            where: slWhere,
          }).catch(() => [])
        }

        // ★ گروه‌بندی بر اساس productId
        const stockByProduct = new Map<string, IStockLevel[]>()
        for (const sl of stockLevels) {
          const arr = stockByProduct.get(sl.productId) || []
          arr.push(sl)
          stockByProduct.set(sl.productId, arr)
        }

        const warehouseMap = new Map(warehouses.map((w) => [w.id, w]))

        const result = products.map((p) => {
          const sls = stockByProduct.get(p.id) || []
          const warehouseStocks = sls.map((sl) => ({
            warehouseId: sl.warehouseId,
            warehouseName: warehouseMap.get(sl.warehouseId)?.name || '—',
            quantity: safeNum(sl.quantity),
            averageCost: safeNum(sl.averageCost),
            stockValue: safeNum(sl.quantity) * safeNum(sl.averageCost),
          }))

          const totalQty = warehouseStocks.reduce((s, w) => s + w.quantity, 0)
          const totalValue = warehouseStocks.reduce((s, w) => s + w.stockValue, 0)
          const avgCost = totalQty > 0 ? totalValue / totalQty : 0

          return {
            id: p.id,
            code: p.code || '',
            barcode: p.barcode || '',
            name: p.name,
            categoryName: p.category?.name || '—',
            unitName: p.unit?.nameFa || p.unit?.symbol || 'عدد',
            salePrice: safeNum(p.salePrice),
            minStock: safeNum(p.minStock),
            totalQty,
            totalValue: Math.round(totalValue),
            avgCost,
            retailValue: Math.round(totalQty * safeNum(p.salePrice)),
            potentialProfit: Math.round(totalQty * safeNum(p.salePrice) - totalValue),
            warehouseStocks,
            isLowStock: totalQty <= safeNum(p.minStock),
            isOutOfStock: totalQty <= 0,
          }
        })

        // ★ فیلتر کم‌موجود
        const finalResult = lowStockOnly ? result.filter((p) => p.isLowStock || p.isOutOfStock) : result

        // ★ خلاصه
        const summary = {
          totalProducts: finalResult.length,
          totalQty: finalResult.reduce((s, p) => s + p.totalQty, 0),
          totalValue: Math.round(finalResult.reduce((s, p) => s + p.totalValue, 0)),
          totalRetailValue: Math.round(finalResult.reduce((s, p) => s + p.retailValue, 0)),
          totalPotentialProfit: Math.round(finalResult.reduce((s, p) => s + p.potentialProfit, 0)),
          lowStockCount: finalResult.filter((p) => p.isLowStock && !p.isOutOfStock).length,
          outOfStockCount: finalResult.filter((p) => p.isOutOfStock).length,
          warehouseCount: warehouses.length,
        }

        console.log('[Inventory v6.7] stockByWarehouse', {
          productCount: result.length,
          filteredCount: finalResult.length,
          summary,
        })

        return NextResponse.json({
          success: true,
          data: {
            type: 'stockByWarehouse',
            products: finalResult,
            warehouses,
            categories,
            summary,
          },
        })
      }

      // ═══════════════════════════════════════════════════════════════
      //  نوع ۲: حرکت کالا (movements)
      // ═══════════════════════════════════════════════════════════════
      if (reportType === 'movements') {
        const movWhere: any = { tenantId }
        if (warehouseId && warehouseId !== 'all') {
          movWhere.OR = [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }]
        }
        if (dateFrom || dateTo) {
          movWhere.createdAt = {}
          if (dateFrom) movWhere.createdAt.gte = new Date(dateFrom)
          if (dateTo) {
            const td = new Date(dateTo)
            td.setHours(23, 59, 59, 999)
            movWhere.createdAt.lte = td
          }
        }

        const movements: IStockMovement[] = await tenantDb.stockMovement
          .findMany({
            where: movWhere,
            orderBy: { createdAt: 'desc' },
            take: 1000,
          })
          .catch(() => [])

        // ★ گرفتن نام محصولات و انبارها
        const productIds = [...new Set(movements.map((m) => m.productId).filter(Boolean))]
        const warehouseIds = [
          ...new Set([
            ...movements.map((m) => m.fromWarehouseId).filter(Boolean),
            ...movements.map((m) => m.toWarehouseId).filter(Boolean),
          ]),
        ]

        const [products, whs] = await Promise.all([
          productIds.length > 0
            ? (tenantDb.product.findMany({
                where: { id: { in: productIds } },
                select: { id: true, name: true, code: true, unit: { select: { nameFa: true, symbol: true } } },
              }) as Promise<IProduct[]>)
            : Promise.resolve([] as IProduct[]),
          warehouseIds.length > 0
            ? (tenantDb.warehouse.findMany({
                where: { id: { in: warehouseIds } },
                select: { id: true, name: true },
              }) as Promise<IWarehouse[]>)
            : Promise.resolve([] as IWarehouse[]),
        ])

        const productMap = new Map(products.map((p) => [p.id, p]))
        const whMap = new Map(whs.map((w) => [w.id, w]))

        const MOVEMENT_LABELS: Record<string, string> = {
          sale: 'فروش',
          purchase: 'خرید',
          transfer: 'انتقال',
          adjustment: 'انبار گردانی',
          initial: 'موجودی اولیه',
          return: 'مرجوع',
        }

        const result = movements.map((m) => {
          const product = productMap.get(m.productId)
          const unitCost = safeNum(m.unitCost)
          const quantity = safeNum(m.quantity)
          const totalValue = quantity * unitCost

          return {
            id: m.id,
            date: m.createdAt,
            productId: m.productId,
            productName: product?.name || '—',
            productCode: product?.code || '',
            unitName: product?.unit?.nameFa || product?.unit?.symbol || 'عدد',
            fromWarehouseId: m.fromWarehouseId || null,
            fromWarehouseName: m.fromWarehouseId ? whMap.get(m.fromWarehouseId)?.name || '—' : null,
            toWarehouseId: m.toWarehouseId || null,
            toWarehouseName: m.toWarehouseId ? whMap.get(m.toWarehouseId)?.name || '—' : null,
            quantity,
            unitCost,
            totalValue: Math.round(totalValue),
            movementType: m.movementType,
            movementTypeLabel: MOVEMENT_LABELS[m.movementType] || m.movementType,
            referenceType: m.referenceType || null,
            referenceId: m.referenceId || null,
            description: m.description || null,
            isOutgoing: !!m.fromWarehouseId && !m.toWarehouseId,
            isIncoming: !!m.toWarehouseId && !m.fromWarehouseId,
            isTransfer: !!m.fromWarehouseId && !!m.toWarehouseId,
          }
        })

        // ★ خلاصه
        const summary = {
          totalMovements: result.length,
          totalIn: Math.round(result.filter((m) => m.isIncoming).reduce((s, m) => s + m.totalValue, 0)),
          totalOut: Math.round(result.filter((m) => m.isOutgoing).reduce((s, m) => s + m.totalValue, 0)),
          totalTransfer: result.filter((m) => m.isTransfer).length,
          byType: Object.keys(MOVEMENT_LABELS)
            .map((type) => {
              const typeMovements = result.filter((m) => m.movementType === type)
              return {
                type,
                label: MOVEMENT_LABELS[type],
                count: typeMovements.length,
                value: Math.round(typeMovements.reduce((s, m) => s + m.totalValue, 0)),
              }
            })
            .filter((t) => t.count > 0),
        }

        console.log('[Inventory v6.7] movements', {
          totalMovements: result.length,
          summary,
        })

        return NextResponse.json({
          success: true,
          data: {
            type: 'movements',
            movements: result,
            warehouses,
            summary,
          },
        })
      }

      // ═══════════════════════════════════════════════════════════════
      //  نوع ۳: ارزش انبار (value) — گروه‌بندی بر اساس انبار
      // ═══════════════════════════════════════════════════════════════
      if (reportType === 'value') {
        const slWhere: any = { tenantId }
        if (warehouseId && warehouseId !== 'all') slWhere.warehouseId = warehouseId

        const stockLevels: IStockLevel[] = await tenantDb.stockLevel.findMany({
          where: slWhere,
        }).catch(() => [])

        // ★ گروه‌بندی بر اساس انبار
        const byWarehouse = new Map<string, { quantity: number; value: number; count: number }>()
        for (const sl of stockLevels) {
          const quantity = safeNum(sl.quantity)
          const averageCost = safeNum(sl.averageCost)
          const value = quantity * averageCost

          const existing = byWarehouse.get(sl.warehouseId) || { quantity: 0, value: 0, count: 0 }
          existing.quantity += quantity
          existing.value += value
          existing.count++
          byWarehouse.set(sl.warehouseId, existing)
        }

        const warehouseMap = new Map(warehouses.map((w) => [w.id, w]))

        const warehouseValues = Array.from(byWarehouse.entries())
          .map(([whId, data]) => ({
            warehouseId: whId,
            warehouseName: warehouseMap.get(whId)?.name || '—',
            isDefault: warehouseMap.get(whId)?.isDefault || false,
            productCount: data.count,
            totalQuantity: data.quantity,
            totalValue: Math.round(data.value),
          }))
          .sort((a, b) => b.totalValue - a.totalValue)

        // ★ گروه‌بندی بر اساس دسته
        const productIds = [...new Set(stockLevels.map((sl) => sl.productId))]
        const products: IProduct[] = productIds.length > 0
          ? await tenantDb.product
              .findMany({
                where: { id: { in: productIds } },
                include: { category: { select: { id: true, name: true } } },
              })
              .catch(() => [])
          : []

        const productMap = new Map(products.map((p) => [p.id, p]))
        const byCategory = new Map<string, {
          name: string
          quantity: number
          value: number
          count: number
        }>()

        for (const sl of stockLevels) {
          const product = productMap.get(sl.productId)
          const catName = product?.category?.name || 'بدون دسته'
          const quantity = safeNum(sl.quantity)
          const averageCost = safeNum(sl.averageCost)
          const value = quantity * averageCost

          const existing = byCategory.get(catName) || {
            name: catName,
            quantity: 0,
            value: 0,
            count: 0,
          }
          existing.quantity += quantity
          existing.value += value
          existing.count++
          byCategory.set(catName, existing)
        }

        // ★ اصلاح v6.7: افزودن totalValue و رندینگ صحیح
        const categoryValues = Array.from(byCategory.values())
          .map((cat) => ({
            ...cat,
            value: Math.round(cat.value),
            totalValue: Math.round(cat.value), // ★ برای سازگاری کامپوننت
          }))
          .sort((a, b) => b.value - a.value)

        const summary = {
          totalWarehouses: warehouseValues.length,
          totalProducts: products.length,
          totalQuantity: warehouseValues.reduce((s, w) => s + w.totalQuantity, 0),
          totalValue: Math.round(warehouseValues.reduce((s, w) => s + w.totalValue, 0)),
          avgValuePerWarehouse:
            warehouseValues.length > 0
              ? Math.round(warehouseValues.reduce((s, w) => s + w.totalValue, 0) / warehouseValues.length)
              : 0,
        }

        console.log('[Inventory v6.7] value', {
          warehouseCount: warehouseValues.length,
          categoryCount: categoryValues.length,
          summary,
        })

        return NextResponse.json({
          success: true,
          data: {
            type: 'value',
            warehouseValues,
            categoryValues,
            warehouses,
            summary,
          },
        })
      }

      // ═══════════════════════════════════════════════════════════════
      //  نوع ۴: کالاهای کم‌موجود (lowStock)
      // ═══════════════════════════════════════════════════════════════
      if (reportType === 'lowStock') {
        const products: IProduct[] = await tenantDb.product
          .findMany({
            where: { tenantId, isActive: true },
            include: {
              category: { select: { id: true, name: true } },
              unit: { select: { id: true, nameFa: true, symbol: true } },
            },
            orderBy: { name: 'asc' },
          })
          .catch(() => [])

        const productIds = products.map((p) => p.id)
        let stockLevels: IStockLevel[] = []
        if (productIds.length > 0) {
          stockLevels = await tenantDb.stockLevel
            .findMany({
              where: { tenantId, productId: { in: productIds } },
            })
            .catch(() => [])
        }

        const stockByProduct = new Map<string, number>()
        for (const sl of stockLevels) {
          stockByProduct.set(sl.productId, (stockByProduct.get(sl.productId) || 0) + safeNum(sl.quantity))
        }

        const result = products
          .map((p) => {
            const totalQty = stockByProduct.get(p.id) || 0
            const minStock = safeNum(p.minStock)
            const purchasePrice = safeNum(p.purchasePrice)
            const shortage = totalQty <= minStock ? Math.max(0, minStock - totalQty) : 0

            return {
              id: p.id,
              code: p.code || '',
              name: p.name,
              categoryName: p.category?.name || '—',
              unitName: p.unit?.nameFa || p.unit?.symbol || 'عدد',
              currentStock: totalQty,
              minStock,
              salePrice: safeNum(p.salePrice),
              purchasePrice,
              status: totalQty <= 0 ? 'out' : totalQty <= minStock ? 'low' : 'ok',
              shortage,
              shortageValue: Math.round(shortage * purchasePrice),
            }
          })
          .filter((p) => p.status !== 'ok')

        const summary = {
          totalLowStock: result.filter((p) => p.status === 'low').length,
          totalOutOfStock: result.filter((p) => p.status === 'out').length,
          totalShortageValue: Math.round(result.reduce((s, p) => s + p.shortageValue, 0)),
        }

        console.log('[Inventory v6.7] lowStock', {
          lowStockCount: summary.totalLowStock,
          outOfStockCount: summary.totalOutOfStock,
          summary,
        })

        return NextResponse.json({
          success: true,
          data: {
            type: 'lowStock',
            products: result,
            summary,
          },
        })
      }

      return NextResponse.json(
        {
          success: false,
          error: 'نوع گزارش نامعتبر است',
        },
        { status: 400 }
      )
    } catch (error: any) {
      console.error('[Inventory v6.7] Error:', error?.message || error)
      return NextResponse.json(
        {
          success: false,
          error: 'خطا در دریافت گزارش انبارداری: ' + (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)