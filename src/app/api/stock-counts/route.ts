// src/app/api/stock-counts/route.ts
// ShopAccounting v6.5.1 — Stock Count API (with Prisma client fallback)
// ============================================================================
// ★★★ ویژگی‌ها:
//   ★ GET: لیست اسناد انبار گردانی
//   ★ POST: ایجاد سند جدید + آیتم‌ها (با موجودی سیستمی و unitCost)
//   ★ محاسبه خودکار difference و differenceAmount
//   ★ پشتیبانی از draft / in_progress / completed / cancelled
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  GET /api/stock-counts — لیست اسناد انبار گردانی
//  Query: tenantId, status, warehouseId, limit
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'all'
    const warehouseId = searchParams.get('warehouseId')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

    const where: any = { tenantId }
    if (status && status !== 'all') where.status = status
    if (warehouseId) where.warehouseId = warehouseId

    // ★★★ v6.5.1: fallback — اگه tenantDb.stockCount undefined بود (prisma generate نشده)، از db.client استفاده کن
    const scClient = (tenantDb as any).stockCount || (db.client as any).stockCount
    if (!scClient) {
      console.warn('[StockCounts GET] StockCount model not found in Prisma client. لطفاً npx prisma generate را اجرا کنید.')
      return NextResponse.json({
        success: false,
        error: 'مدل StockCount در Prisma client موجود نیست. لطفاً npx prisma generate را اجرا کرده و سرور را restart کنید.',
        hint: 'پس از اضافه کردن مدل‌ها به schema.prisma: 1) npx prisma generate  2) npx prisma db push  3) restart npm run dev',
      }, { status: 500 })
    }

    let stockCounts: any[] = []
    try {
      stockCounts = await scClient.findMany({
        where,
        orderBy: { countDate: 'desc' },
        take: limit,
        include: {
          items: {
            include: {
              Product: { select: { id: true, name: true, code: true } },
            },
          },
        },
      })
    } catch (err: any) {
      console.warn('[StockCounts GET] Query failed:', err?.message)
      return NextResponse.json({
        success: true,
        data: [],
        warning: 'خطا در query — بررسی کنید مدل‌ها به‌درستی migrate شده باشند',
      })
    }

    // ★ گرفتن نام انبارها و کاربران جداگانه
    const warehouseIds = [...new Set(stockCounts.map((sc: any) => sc.warehouseId).filter(Boolean))]
    const userIds = [...new Set([
      ...stockCounts.map((sc: any) => sc.countedBy).filter(Boolean),
      ...stockCounts.map((sc: any) => sc.approvedBy).filter(Boolean),
    ])]

    const [warehouses, users] = await Promise.all([
      warehouseIds.length > 0 ? tenantDb.warehouse.findMany({
        where: { id: { in: warehouseIds } },
        select: { id: true, name: true, code: true },
      }) : [],
      userIds.length > 0 ? tenantDb.storeUser.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      }) : [],
    ])

    const warehouseMap = new Map(warehouses.map((w: any) => [w.id, w]))
    const userMap = new Map(users.map((u: any) => [u.id, u]))

    const result = stockCounts.map((sc: any) => ({
      ...sc,
      warehouseName: warehouseMap.get(sc.warehouseId)?.name || '—',
      warehouseCode: warehouseMap.get(sc.warehouseId)?.code || null,
      countedByName: sc.countedBy ? userMap.get(sc.countedBy)?.username : null,
      approvedByName: sc.approvedBy ? userMap.get(sc.approvedBy)?.username : null,
      itemsCount: sc.items?.length || 0,
      // ★ محاسبه مجدد جمع اختلاف (در صورت نیاز)
      computedDifference: sc.items?.reduce((sum: number, item: any) => sum + (item.differenceAmount || 0), 0) || 0,
    }))

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error('[StockCounts GET] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری اسناد انبار گردانی' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/stock-counts — ایجاد سند انبار گردانی جدید
//  Body: {
//    tenantId, warehouseId, countDate?, status?, notes?,
//    items: [{ productId, countedQty, reason? }]
//  }
//  ★ سیستم خودکار: systemQty و unitCost و difference و differenceAmount را محاسبه می‌کند
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()
    const { warehouseId, countDate, status, notes, items } = body

    // ★ اعتبارسنجی
    if (!warehouseId) {
      return NextResponse.json({ success: false, error: 'انتخاب انبار الزامی است' }, { status: 400 })
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'حداقل یک آیتم الزامی است' }, { status: 400 })
    }

    // ★ بررسی انبار
    const warehouse = await tenantDb.warehouse.findFirst({
      where: { id: warehouseId, tenantId, isActive: true },
    })
    if (!warehouse) {
      return NextResponse.json({ success: false, error: 'انبار یافت نشد یا غیرفعال است' }, { status: 400 })
    }

    // ★★★ v6.5.1: fallback برای count
    const scClientPost = (tenantDb as any).stockCount || (db.client as any).stockCount
    if (!scClientPost) {
      return NextResponse.json({
        success: false,
        error: 'مدل StockCount در Prisma client موجود نیست. لطفاً npx prisma generate را اجرا کرده و سرور را restart کنید.',
        hint: 'پس از اضافه کردن مدل‌ها به schema.prisma: 1) npx prisma generate  2) npx prisma db push  3) restart npm run dev',
      }, { status: 500 })
    }

    // ★ تولید شماره سند
    const existingCount = await scClientPost.count({ where: { tenantId } })
    const number = `SC-${(existingCount + 1).toString().padStart(4, '0')}`

    // ★ جمع‌آوری productId های یکتا
    const productIds = items.map((item: any) => item.productId).filter(Boolean)
    if (productIds.length === 0) {
      return NextResponse.json({ success: false, error: 'هیچ محصول معتبری وجود ندارد' }, { status: 400 })
    }

    // ★ گرفتن محصولات و StockLevel‌ها
    const [products, stockLevels] = await Promise.all([
      tenantDb.product.findMany({
        where: { id: { in: productIds }, tenantId, isActive: true },
        select: { id: true, name: true, code: true, currentStock: true, purchasePrice: true },
      }),
      tenantDb.stockLevel.findMany({
        where: { warehouseId, productId: { in: productIds } },
      }),
    ])

    const productMap = new Map(products.map((p: any) => [p.id, p]))
    const stockLevelMap = new Map(stockLevels.map((sl: any) => [sl.productId, sl]))

    // ★ ساخت آیتم‌های سند با محاسبه خودکار
    const stockCountItems: any[] = []
    let totalDifference = 0
    let totalItems = 0

    for (const item of items) {
      const product = productMap.get(item.productId)
      if (!product) continue

      const stockLevel = stockLevelMap.get(item.productId)
      const systemQty = stockLevel?.quantity || 0
      const unitCost = stockLevel?.averageCost || product.purchasePrice || 0
      const countedQty = parseFloat(item.countedQty) || 0
      const difference = countedQty - systemQty
      const differenceAmount = difference * unitCost

      totalDifference += differenceAmount
      totalItems++

      stockCountItems.push({
        productId: item.productId,
        systemQty,
        countedQty,
        difference,
        unitCost,
        differenceAmount,
        reason: item.reason || null,
      })
    }

    if (stockCountItems.length === 0) {
      return NextResponse.json({ success: false, error: 'هیچ آیتم معتبی برای ثبت وجود ندارد' }, { status: 400 })
    }

    // ★★★ v6.5.1: استفاده از tenantDb اگر stockCount داره، وگرنه db.client
    const txClient = ((tenantDb as any).stockCount ? tenantDb : db.client) as any

    const result = await txClient.$transaction(async (tx: any) => {
      // ★ ایجاد سند اصلی
      const stockCount = await tx.stockCount.create({
        data: {
          tenantId,
          number,
          warehouseId,
          countDate: countDate ? new Date(countDate) : new Date(),
          status: status || 'draft',
          notes: notes || null,
          countedBy: tenant.user?.id || null,
          totalDifference,
          totalItems,
        },
      })

      // ★ ایجاد آیتم‌ها
      for (const item of stockCountItems) {
        await tx.stockCountItem.create({
          data: {
            stockCountId: stockCount.id,
            ...item,
          },
        })
      }

      return stockCount
    })

    console.log(`[StockCounts POST] سند انبار گردانی ${number} ایجاد شد — ${totalItems} آیتم، اختلاف: ${totalDifference}`)

    return NextResponse.json({
      success: true,
      data: result,
      message: `سند انبار گردانی ${number} با ${totalItems} آیتم ایجاد شد`,
    }, { status: 201 })
  } catch (error: any) {
    console.error('[StockCounts POST] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'خطا در ایجاد سند انبار گردانی',
    }, { status: 500 })
  }
})
