// ============================================================================
// src/app/api/products/lookup/route.ts — جستجوی سریع محصول + موجودی انبار
// ============================================================================
// ★★★ v6.1: پشتیبانی از warehouseId برای بازگرداندن موجودی واقعی انبار
// ★★★ v6.1.1: پشتیبانی همزمان از پارامترهای q و search (compatibility)
//   - برخی فرانت‌اندها (POS) از search= استفاده می‌کنند
//   - برخی (فاکتور خرید) از q= استفاده می‌کنند
//   - این route هر دو را می‌پذیرد
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

export const GET = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)

    // ★★★ v6.1.1: پشتیبانی از هر دو پارامتر q و search
    const q = (searchParams.get('q') || searchParams.get('search') || '').trim()
    const barcode = (searchParams.get('barcode') || '').trim()
    const code = (searchParams.get('code') || '').trim()
    const warehouseId = (searchParams.get('warehouseId') || '').trim()
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

    if (!q && !barcode && !code) {
      return NextResponse.json({ success: true, data: [] })
    }

    // ★ ساخت شرط جستجو
    const where: any = {
      tenantId,
      isActive: true,
    }

    if (barcode) {
      where.barcode = barcode
    } else if (code) {
      where.code = { contains: code }
    } else if (q) {
      // ★★★ v6.1.1: جستجوی ترکیبی (مثل customers)
      // اگر عبارت دارای فاصله باشد، احتمالاً "نام + spec" است
      const parts = q.split(/\s+/).filter(Boolean)
      const orConditions: any[] = [
        { name: { contains: q } },
        { code: { contains: q } },
        { barcode: { contains: q } },
      ]

      // ★ اگر چند کلمه است، هر کلمه را جداگانه هم امتحان کن (مثلاً "شیر پرچرب")
      if (parts.length >= 2) {
        for (const part of parts) {
          orConditions.push({ name: { contains: part } })
        }
      }

      where.OR = orConditions
    }

    const products = await tenantDb.product.findMany({
      where,
      take: limit,
      include: {
        category: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, nameFa: true, symbol: true } },
      },
      orderBy: { name: 'asc' },
    })

    // ★★★ v6.1: اگر warehouseId دارد، موجودی واقعی انبار را جایگزین کن
    let result = products
    if (warehouseId && products.length > 0) {
      try {
        const stockLevels = await tenantDb.stockLevel.findMany({
          where: {
            tenantId,
            warehouseId,
            productId: { in: products.map(p => p.id) },
          },
        })
        const stockMap = new Map(stockLevels.map((s: any) => [s.productId, s]))

        result = products.map(p => {
          const stock = stockMap.get(p.id)
          return {
            ...p,
            currentStock: stock ? stock.quantity : 0,
            averageCost: stock ? stock.averageCost : p.purchasePrice,
          }
        })
      } catch (stockErr: any) {
        // ★ fallback: اگر stockLevel در schema نیست، مقدار fallback را برگردان
        console.warn('[Products Lookup] StockLevel query failed, using fallback:', stockErr?.message)
        result = products.map(p => ({
          ...p,
          averageCost: p.purchasePrice,
        }))
      }
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error('[Products Lookup] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در جستجوی محصول' }, { status: 500 })
  }
})
