// src/app/api/reports/inventory/route.ts — GET (v3.41 ★★★ FIXED RELATION NAME)
// ShopAccounting — Inventory Report API
// ----------------------------------------------------------------------------
// ★★★ v3.41 اصلاحات:
//   1. تغییر نام relation در Prisma از warehouseStocks به StockLevels (مطابق schema.prisma)
//   2. نگاشت مجدد StockLevels به warehouseStocks در خروجی JSON برای سازگاری با فرانت‌اند
//   3. فیلتر و محاسبه دقیق موجودی بر اساس انبار انتخاب‌شده
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const GET = withTenantAndPermission('dashboard')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)
      const categoryId = searchParams.get('categoryId')
      const warehouseId = searchParams.get('warehouseId')
      const showOnlyLowStock = searchParams.get('lowStock') === 'true'

      // ─── ساخت شرط WHERE ─────────────────────────────────────
      const where: any = { tenantId, isActive: true }
      
      if (categoryId && categoryId !== 'all') {
        where.categoryId = categoryId
      }

      // ★★★ v3.41: استفاده از نام صحیح relation (StockLevels) در فیلتر
      if (warehouseId && warehouseId !== 'all') {
        where.StockLevels = {
          some: {
            warehouseId: warehouseId,
            tenantId: tenantId
          }
        }
      }

      // ─── دریافت محصولات ─────────────────────────────────────
      const products = await tenantDb.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true, nameFa: true, symbol: true } },
          // ★★★ v3.41: استفاده از نام صحیح relation (StockLevels)
          ...(warehouseId && warehouseId !== 'all' ? {
            StockLevels: {
              where: { warehouseId: warehouseId, tenantId: tenantId },
              select: {
                warehouseId: true,
                quantity: true,
                averageCost: true
              }
            }
          } : {
            StockLevels: {
              select: {
                warehouseId: true,
                quantity: true,
                averageCost: true
              }
            }
          })
        },
        orderBy: { name: 'asc' },
      })

      // ─── دریافت دسته‌بندی‌ها برای فیلتر ────────────────────
      const categories = await tenantDb.category.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })

      // ─── دریافت لیست انبارها (برای ارسال به فرانت‌اند) ─────
      let warehouses: any[] = []
      try {
        warehouses = await tenantDb.warehouse.findMany({
          where: { tenantId, isActive: true },
          select: { id: true, name: true, code: true, isDefault: true },
          orderBy: { name: 'asc' },
        })
      } catch { /* ignore if warehouse table not ready */ }

      // ─── محاسبه ارزش انبار ─────────────────────────────────
      let totalStockValue = 0
      let totalRetailValue = 0
      let totalLowStockCount = 0
      let totalOutOfStockCount = 0

      const enrichedProducts = products.map((p: any) => {
        // ★★★ v3.41: خواندن از StockLevels (نام صحیح در Prisma)
        let currentStock: number
        let avgCost: number

        if (warehouseId && warehouseId !== 'all') {
          const whStock = p.StockLevels?.[0]
          currentStock = Number(whStock?.quantity) || 0
          avgCost = Number(whStock?.averageCost) || Number(p.purchasePrice) || 0
        } else {
          currentStock = Number(p.currentStock) || 0
          avgCost = Number(p.purchasePrice) || 0
        }

        const minStock = Number(p.minStock) || 0
        const stockValue = avgCost * currentStock
        const retailValue = (Number(p.salePrice) || 0) * currentStock

        // منطق تشخیص موجودی بحرانی
        const isOutOfStock = currentStock <= 0
        const isLowStock = !isOutOfStock && minStock > 0 && currentStock <= minStock

        const suggestedThreshold = minStock > 0
          ? null
          : Math.max(5, Math.ceil(currentStock * 0.2))

        totalStockValue += stockValue
        totalRetailValue += retailValue
        if (isOutOfStock) totalOutOfStockCount++
        if (isLowStock) totalLowStockCount++

        return {
          id: p.id,
          code: p.code,
          barcode: p.barcode,
          name: p.name,
          categoryId: p.categoryId,
          categoryName: p.category?.name || '—',
          unitName: p.unit?.nameFa || p.unit?.symbol || 'عدد',
          purchasePrice: Number(p.purchasePrice) || 0,
          salePrice: Number(p.salePrice) || 0,
          currentStock,
          minStock,
          stockValue,
          retailValue,
          potentialProfit: retailValue - stockValue,
          isOutOfStock,
          isLowStock,
          suggestedThreshold,
          stockStatus: isOutOfStock ? 'out' : isLowStock ? 'low' : 'ok',
          // ★★★ v3.41: نگاشت نام صحیح Prisma به نامی که فرانت‌اند انتظار دارد
          warehouseStocks: p.StockLevels || [],
        }
      })

      // فیلتر نهایی (client-side) برای موجودی کم
      const finalProducts = showOnlyLowStock
        ? enrichedProducts.filter((p: any) => p.isOutOfStock || p.isLowStock)
        : enrichedProducts

      return NextResponse.json({
        success: true,
        data: {
          products: finalProducts,
          categories,
          warehouses,
          summary: {
            totalProducts: finalProducts.length,
            totalStockValue,
            totalRetailValue,
            totalPotentialProfit: totalRetailValue - totalStockValue,
            lowStockCount: totalLowStockCount,
            outOfStockCount: totalOutOfStockCount,
            criticalCount: totalLowStockCount + totalOutOfStockCount,
          },
        },
      })
    } catch (error: any) {
      console.error('[Inventory Report] Error:', error?.message || error)
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت گزارش موجودی: ' + (error?.message || 'نامشخص') },
        { status: 500 }
      )
    }
  }
)