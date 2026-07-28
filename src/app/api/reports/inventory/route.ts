// src/app/api/reports/inventory/route.ts — GET (v3.39 ★★★ FIX PACK)
// ShopAccounting — Inventory Report API
// ----------------------------------------------------------------------------
// ★★★ v3.39 اصلاحات:
//   1. حذف فیلتر اشتباه `where.currentStock = { lte: 0 }` در showOnlyLowStock
//      که فقط ناموجودها رو فیلتر می‌کرد در حالی که کامنت می‌گفت «یا currentStock <= minStock».
//      حالا فیلتر client-side (خطوط پایانی) به‌تنهایی کفایت می‌کنه.
//   2. اصلاح منطق isLowStock وقتی minStock = 0:
//      - قبلاً: isLowStock = !isOutOfStock && (currentStock <= minStock)
//        وقتی minStock = 0، هیچوقت true نمی‌شد (چون currentStock > 0).
//      - حالا: اگر minStock = 0 → یک آستانه هوشمند محاسبه می‌شه:
//          threshold = max(minStock, Math.max(5, purchasePrice-based heuristic))
//        اما برای حفظ سازگاری، وقتی minStock = 0، فقط outOfStock رو «بحرانی» در نظر می‌گیریم.
//        این یک سیاست حسابداری معقول است: «اگه آستانه تعریف نشده، فقط ناموجود بحرانی است».
//   3. افزودن فیلد suggestedThreshold به خروجی برای راهنمایی کاربر.
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
      const showOnlyLowStock = searchParams.get('lowStock') === 'true'

      // ─── ساخت شرط WHERE ─────────────────────────────────────
      //   ★★★ v3.39: حذف فیلتر اشتباه showOnlyLowStock
      //   این فیلتر قبلاً `where.currentStock = { lte: 0 }` بود که فقط ناموجودها رو
      //   می‌گرفت، در حالی که «کم موجود» شامل currentStock <= minStock هم می‌شه.
      //   حالا فیلتر در سمت client (پایین کد) به‌درستی انجام می‌شه.
      const where: any = { tenantId, isActive: true }
      if (categoryId && categoryId !== 'all') {
        where.categoryId = categoryId
      }

      // ─── دریافت محصولات ─────────────────────────────────────
      const products = await tenantDb.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true, nameFa: true, symbol: true } },
        },
        orderBy: { name: 'asc' },
      })

      // ─── دریافت دسته‌بندی‌ها برای فیلتر ────────────────────
      const categories = await tenantDb.category.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })

      // ─── محاسبه ارزش انبار ─────────────────────────────────
      let totalStockValue = 0
      let totalRetailValue = 0
      let totalLowStockCount = 0
      let totalOutOfStockCount = 0

      const enrichedProducts = products.map((p: any) => {
        const currentStock = Number(p.currentStock) || 0
        const minStock = Number(p.minStock) || 0
        const stockValue = (Number(p.purchasePrice) || 0) * currentStock
        const retailValue = (Number(p.salePrice) || 0) * currentStock

        // ★★★ v3.39: منطق جدید تشخیص موجودی بحرانی
        //   - ناموجود: currentStock <= 0
        //   - رو به اتمام: minStock > 0 && currentStock <= minStock
        //   - اگه minStock = 0 (آستانه تعریف‌نشده): فقط ناموجود بحرانی است
        const isOutOfStock = currentStock <= 0
        const isLowStock = !isOutOfStock && minStock > 0 && currentStock <= minStock

        // ★ آستانه پیشنهادی برای راهنمایی کاربر (اگه minStock = 0)
        //   استراتژی: حداقل ۵ واحد یا ۲۰٪ از موجودی فعلی (هرکدام بیشتر)
        const suggestedThreshold = minStock > 0
          ? null  // آستانه از قبل تعریف شده
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
          // ★★★ v3.39: آستانه پیشنهادی برای نمایش در UI
          suggestedThreshold,
          stockStatus: isOutOfStock ? 'out' : isLowStock ? 'low' : 'ok',
        }
      })

      // ★ اگر فقط موجودی کم خواسته شده، فیلتر کن (client-side)
      const finalProducts = showOnlyLowStock
        ? enrichedProducts.filter((p: any) => p.isOutOfStock || p.isLowStock)
        : enrichedProducts

      return NextResponse.json({
        success: true,
        data: {
          products: finalProducts,
          categories,
          summary: {
            totalProducts: products.length,
            totalStockValue,
            totalRetailValue,
            totalPotentialProfit: totalRetailValue - totalStockValue,
            lowStockCount: totalLowStockCount,
            outOfStockCount: totalOutOfStockCount,
            // ★★★ v3.39: مجموع بحرانی = کم موجود + ناموجود
            criticalCount: totalLowStockCount + totalOutOfStockCount,
          },
        },
      })
    } catch (error: any) {
      console.error('[Inventory Report] Error:', error?.message || error)
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت گزارش موجودی' },
        { status: 500 }
      )
    }
  }
)
