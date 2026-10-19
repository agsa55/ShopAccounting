// src/app/api/stock-counts/route.ts
// ShopAccounting v6.5.1 — Stock Count API (with Prisma client fallback)
// ============================================================================
// ★★★ ویژگی‌ها:
//   ★ GET: لیست اسناد انبار گردانی
//   ★ POST: ایجاد سند جدید + آیتم‌ها (با موجودی سیستمی و unitCost)
//   ★ PATCH: تأیید نهایی، به‌روزرسانی موجودی، ثبت حرکت انبار و صدور سند حسابداری تعدیل
//   ★ محاسبه خودکار difference و differenceAmount
//   ★ پشتیبانی از draft / in_progress / completed / cancelled
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'
import { getActiveFiscalYear } from '@/lib/fiscal-year'
// ═══════════════════════════════════════════════════════════════
//  GET /api/stock-counts — لیست اسناد انبار گردانی
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  GET /api/stock-counts — لیست اسناد انبار گردانی
//  ★ v6.6: فیلتر سال مالی + نمایش اسناد باز از همه سال‌ها
// ═══════════════════════════════════════════════════════════════

const OPEN_STOCK_COUNT_STATUSES = ['draft', 'in_progress']

function fiscalBounds(fy: any): { start: Date; end: Date } | null {
  if (!fy || !fy.startDate || !fy.endDate) return null

  const start = new Date(fy.startDate)
  const end = new Date(fy.endDate)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null

  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb as any
      const tenantId = tenant.tenantId
      const { searchParams } = new URL(req.url)

      const status = searchParams.get('status') || 'all'
      const warehouseId = searchParams.get('warehouseId')
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'

      const scClient = tenantDb.stockCount || (db.client as any).stockCount
      if (!scClient) {
        return NextResponse.json(
          {
            success: false,
            error:
              'مدل StockCount در Prisma client موجود نیست. لطفاً npx prisma generate را اجرا کنید.',
          },
          { status: 500 }
        )
      }

      let fy: any = null
      let effectiveFiscalYearId: string | null = null
      let bounds: { start: Date; end: Date } | null = null
      let fiscalYearWarning: string | null = null

      if (!allYears) {
        try {
          if (fiscalYearIdParam) {
            fy = await tenantDb.fiscalYear.findFirst({
              where: {
                id: fiscalYearIdParam,
                tenantId,
              },
            })

            if (!fy) {
              throw new Error('سال مالی انتخابی یافت نشد.')
            }
          } else {
            fy = await getActiveFiscalYear(tenantDb, tenantId)
          }

          effectiveFiscalYearId = fy.id
          bounds = fiscalBounds(fy)
        } catch (err: any) {
          fiscalYearWarning =
            err?.message ||
            'سال مالی معتبری یافت نشد؛ همه سنوات نمایش داده می‌شود.'
          effectiveFiscalYearId = null
          bounds = null
        }
      }

      const baseWhere: any = { tenantId }

      if (status && status !== 'all') {
        baseWhere.status = status
      }

      if (warehouseId) {
        baseWhere.warehouseId = warehouseId
      }

      const includeShape = {
        items: {
          include: {
            Product: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      }

      const fetchWithWhere = async (where: any): Promise<any[]> => {
        try {
          return await scClient.findMany({
            where,
            orderBy: {
              countDate: 'desc',
            },
            take: limit,
            include: includeShape,
          })
        } catch (err: any) {
          console.warn('[StockCounts GET] query failed:', err?.message)
          return []
        }
      }

      let scopedRows: any[] = []
      let openRows: any[] = []

      if (allYears || !effectiveFiscalYearId || !bounds) {
        scopedRows = await fetchWithWhere(baseWhere)
      } else {
        const fiscalStart = bounds.start
        const fiscalEnd = bounds.end

        const dateOnlyWhere = {
          ...baseWhere,
          countDate: {
            gte: fiscalStart,
            lte: fiscalEnd,
          },
        }

        const fiscalOrDateWhere = {
          ...baseWhere,
          OR: [
            { fiscalYearId: effectiveFiscalYearId },
            {
              countDate: {
                gte: fiscalStart,
                lte: fiscalEnd,
              },
            },
          ],
        }

        scopedRows = await fetchWithWhere(fiscalOrDateWhere)

        // اگر فیلد fiscalYearId در مدل StockCount وجود نداشته باشد،
        // کوئری OR خطا می‌دهد و fetchWithWhere آرایه خالی برمی‌گرداند.
        // در این حالت fallback به فیلتر تاریخی می‌کنیم.
        if (scopedRows.length === 0) {
          scopedRows = await fetchWithWhere(dateOnlyWhere)
        }

        // اسناد باز باید از همه سال‌ها دیده شوند، مگر اینکه کاربر
        // فیلتر وضعیت روی اسناد بسته مثل completed/cancelled گذاشته باشد.
        const shouldIncludeOpenAllYears =
          !status ||
          status === 'all' ||
          OPEN_STOCK_COUNT_STATUSES.includes(status)

        if (shouldIncludeOpenAllYears) {
          const openWhere: any = { ...baseWhere }
          delete openWhere.status

          if (
            status &&
            status !== 'all' &&
            OPEN_STOCK_COUNT_STATUSES.includes(status)
          ) {
            openWhere.status = status
          } else {
            openWhere.status = {
              in: OPEN_STOCK_COUNT_STATUSES,
            }
          }

          openRows = await fetchWithWhere(openWhere)
        }
      }

      const mergedMap = new Map<string, any>()

      const fiscalStart = bounds?.start ?? null
      const fiscalEnd = bounds?.end ?? null

      const addRow = (row: any, source: 'scoped' | 'open') => {
        if (!row?.id) return

        const isInFiscalScope = (() => {
          if (allYears || !effectiveFiscalYearId || !fiscalStart || !fiscalEnd) {
            return true
          }

          if ((row as any).fiscalYearId === effectiveFiscalYearId) {
            return true
          }

          const d = row.countDate ? new Date(row.countDate) : null
          if (!d || Number.isNaN(d.getTime())) return false

          return d >= fiscalStart && d <= fiscalEnd
        })()

        const rowStatus = String(row.status || '').toLowerCase()
        const isOpenStatus = OPEN_STOCK_COUNT_STATUSES.includes(rowStatus)
        const isCrossYearOpen = !allYears && isOpenStatus && !isInFiscalScope

        const existing = mergedMap.get(row.id)

        const enriched = {
          ...row,
          _source: existing ? `${existing._source}+${source}` : source,
          _isInFiscalScope: isInFiscalScope,
          _isCrossYearOpen: isCrossYearOpen,
        }

        mergedMap.set(row.id, enriched)
      }

      scopedRows.forEach((row) => addRow(row, 'scoped'))
      openRows.forEach((row) => addRow(row, 'open'))

      const stockCounts = Array.from(mergedMap.values())
        .sort((a, b) => {
          const da = a.countDate ? new Date(a.countDate).getTime() : 0
          const db = b.countDate ? new Date(b.countDate).getTime() : 0
          return db - da
        })
        .slice(0, limit)

      const warehouseIds = [
        ...new Set(stockCounts.map((sc: any) => sc.warehouseId).filter(Boolean)),
      ]

      const userIds = [
        ...new Set([
          ...stockCounts.map((sc: any) => sc.countedBy).filter(Boolean),
          ...stockCounts.map((sc: any) => sc.approvedBy).filter(Boolean),
        ]),
      ]

      const [warehouses, users]: [any[], any[]] = await Promise.all([
        warehouseIds.length > 0
          ? tenantDb.warehouse.findMany({
              where: { id: { in: warehouseIds } },
              select: { id: true, name: true, code: true },
            })
          : [],
        userIds.length > 0
          ? tenantDb.storeUser.findMany({
              where: { id: { in: userIds } },
              select: { id: true, username: true },
            })
          : [],
      ])

      const warehouseMap = new Map<string, any>(
        warehouses.map((w: any) => [w.id, w])
      )

      const userMap = new Map<string, any>(users.map((u: any) => [u.id, u]))

      const result = stockCounts.map((sc: any) => {
        const {
          _source,
          _isInFiscalScope,
          _isCrossYearOpen,
          ...clean
        } = sc

        return {
          ...clean,
          warehouseName: warehouseMap.get(sc.warehouseId)?.name || '—',
          warehouseCode: warehouseMap.get(sc.warehouseId)?.code || null,
          countedByName: sc.countedBy
            ? userMap.get(sc.countedBy)?.username || null
            : null,
          approvedByName: sc.approvedBy
            ? userMap.get(sc.approvedBy)?.username || null
            : null,
          itemsCount: sc.items?.length || 0,
          computedDifference:
            sc.items?.reduce(
              (sum: number, item: any) => sum + (item.differenceAmount || 0),
              0
            ) || 0,
          crossYearOpen: Boolean(_isCrossYearOpen),
        }
      })

      console.log('[StockCounts GET v6.6] Result', {
        tenantId,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        statusFilter: status,
        warehouseFilter: warehouseId || null,
        scopedCount: scopedRows.length,
        openCount: openRows.length,
        mergedCount: stockCounts.length,
        returnedCount: result.length,
      })

      return NextResponse.json({
        success: true,
        data: result,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        warning: allYears
          ? 'این لیست همه سال‌های مالی را شامل می‌شود.'
          : fiscalYearWarning || undefined,
        diagnostics: {
          fiscalYearApplied: Boolean(effectiveFiscalYearId && !allYears),
          requestedFiscalYearId: fiscalYearIdParam || null,
          allYearsRequested: allYears,
          openDocumentsIncludedAllYears:
            !allYears && Boolean(effectiveFiscalYearId),
          scopedCount: scopedRows.length,
          openCount: openRows.length,
          mergedCount: stockCounts.length,
          scopeMethod: effectiveFiscalYearId
            ? 'fiscalYearId-or-countDate + open-status-exception'
            : 'all-years-fallback',
        },
      })
    } catch (error: any) {
      console.error('[StockCounts GET] Error:', error?.message || error)
      return NextResponse.json(
        { success: false, error: 'خطا در بارگذاری اسناد انبار گردانی' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  POST /api/stock-counts — ایجاد سند انبار گردانی جدید
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb as any
    const tenantId = tenant.tenantId
    const body = await req.json()
    const { warehouseId, countDate, status, notes, items } = body

    if (!warehouseId) {
      return NextResponse.json({ success: false, error: 'انتخاب انبار الزامی است' }, { status: 400 })
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'حداقل یک آیتم الزامی است' }, { status: 400 })
    }

    const warehouse = await tenantDb.warehouse.findFirst({
      where: { id: warehouseId, tenantId, isActive: true },
    })
    if (!warehouse) {
      return NextResponse.json({ success: false, error: 'انبار یافت نشد یا غیرفعال است' }, { status: 400 })
    }

    const scClientPost = tenantDb.stockCount || (db.client as any).stockCount
    if (!scClientPost) {
      return NextResponse.json({
        success: false,
        error: 'مدل StockCount در Prisma client موجود نیست.',
      }, { status: 500 })
    }

    const existingCount = await scClientPost.count({ where: { tenantId } })
    const number = `SC-${(existingCount + 1).toString().padStart(4, '0')}`

    const productIds = items.map((item: any) => item.productId).filter(Boolean)
    if (productIds.length === 0) {
      return NextResponse.json({ success: false, error: 'هیچ محصول معتبری وجود ندارد' }, { status: 400 })
    }

    // ★★★ اصلاح TypeScript: تعیین نوع صریح برای آرایه‌های خروجی Promise.all
    const [products, stockLevels]: [any[], any[]] = await Promise.all([
      tenantDb.product.findMany({
        where: { id: { in: productIds }, tenantId, isActive: true },
        select: { id: true, name: true, code: true, currentStock: true, purchasePrice: true },
      }),
      tenantDb.stockLevel.findMany({
        where: { warehouseId, productId: { in: productIds } },
      }),
    ])

    // ★★★ اصلاح TypeScript: تعیین نوع صریح برای Map
    const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]))
    const stockLevelMap = new Map<string, any>(stockLevels.map((sl: any) => [sl.productId, sl]))

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
      return NextResponse.json({ success: false, error: 'هیچ آیتم معتبری برای ثبت وجود ندارد' }, { status: 400 })
    }

    const txClient = (tenantDb.stockCount ? tenantDb : db.client) as any

    const result = await txClient.$transaction(async (tx: any) => {
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

// ═══════════════════════════════════════════════════════════════
//  PATCH /api/stock-counts — تأیید نهایی، به‌روزرسانی انبار و صدور سند حسابداری
// ═══════════════════════════════════════════════════════════════

export const PATCH = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb as any
    const tenantId = tenant.tenantId
    const body = await req.json()
    const { id, status, approvedBy } = body

    if (!['completed', 'approved', 'cancelled'].includes(status)) {
      return NextResponse.json({ success: false, error: 'وضعیت نامعتبر است' }, { status: 400 })
    }

    const scClient = tenantDb.stockCount || (db.client as any).stockCount
    if (!scClient) {
      return NextResponse.json({ success: false, error: 'مدل StockCount یافت نشد' }, { status: 500 })
    }

    const stockCount = await scClient.findUnique({
      where: { id, tenantId },
      include: { items: true, warehouse: true },
    })

    if (!stockCount) {
      return NextResponse.json({ success: false, error: 'سند انبارگردانی یافت نشد' }, { status: 404 })
    }

    if (stockCount.status === 'completed' || stockCount.status === 'cancelled') {
      return NextResponse.json({ success: false, error: 'این سند قبلاً نهایی یا لغو شده است' }, { status: 400 })
    }

    if (status === 'cancelled') {
      await scClient.update({
        where: { id },
        data: { status: 'cancelled' },
      })
      return NextResponse.json({ success: true, message: 'سند انبارگردانی لغو شد' })
    }

    let activeFY: any = null
    try {
      activeFY = await getActiveFiscalYear(tenantDb, tenantId)
    } catch {
      activeFY = null
    }

    const countFiscalYearId =
      (stockCount as any).fiscalYearId || activeFY?.id || null

    if (!countFiscalYearId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'سال مالی فعال یا سال مالی سند یافت نشد؛ برای تأیید و صدور سند حسابداری لازم است.',
          code: 'NO_FISCAL_YEAR_FOR_STOCK_COUNT_APPROVAL',
        },
        { status: 400 }
      )
    }

    const accounts = await getStandardAccountIds(tenantId)
  
    if (!accounts.inventoryAccountId) {
      return NextResponse.json({ success: false, error: 'حساب موجودی کالا (1200) در کدینگ یافت نشد' }, { status: 500 })
    }

  const shortageExpenseAccountId = '5100' // حساب 5100 هزینه‌های اداری / کسری انبار
    const overageIncomeAccountId = accounts.serviceRevenueId || '4200'

    const journalLinesData: any[] = []
    let totalAdjustmentDebit = 0
    let totalAdjustmentCredit = 0

    const stockLevelUpdates: any[] = []
    const stockMovementsData: any[] = []

    for (const item of stockCount.items) {
      if (item.difference === 0) continue

      const absDifference = Math.abs(item.difference)
      const adjustmentAmount = absDifference * item.unitCost

      stockLevelUpdates.push(
        (tenantDb.stockLevel || db.client.stockLevel).upsert({
          where: {
            warehouseId_productId: {
              warehouseId: stockCount.warehouseId,
              productId: item.productId,
            },
          },
          update: {
            quantity: { increment: item.difference },
          },
          create: {
            tenantId,
            warehouseId: stockCount.warehouseId,
            productId: item.productId,
            quantity: item.countedQty,
            unitLabel: item.unitLabel || 'عدد',
            averageCost: item.unitCost,
          },
        })
      )

          stockMovementsData.push({
        tenantId,
        productId: item.productId,
        toWarehouseId: stockCount.warehouseId,
        quantity: absDifference,
        unitLabel: item.unitLabel || 'عدد',
        unitCost: item.unitCost,
        movementType: 'adjustment',
        referenceType: 'stock_count',
        referenceId: stockCount.id,
        fiscalYearId: countFiscalYearId,
        description: `تعدیل انبارگردانی: ${item.difference > 0 ? 'اضافی' : 'کسری'} (${item.reason || 'بدون دلیل'})`,
      })

      if (item.difference < 0) {
        journalLinesData.push({
          accountId: shortageExpenseAccountId,
          description: `کسری انبارگردانی: ${item.productId}`,
          debit: adjustmentAmount,
          credit: 0,
        })
        journalLinesData.push({
          accountId: accounts.inventoryAccountId,
          description: `کسری انبارگردانی: ${item.productId}`,
          debit: 0,
          credit: adjustmentAmount,
        })
        totalAdjustmentDebit += adjustmentAmount
        totalAdjustmentCredit += adjustmentAmount
      } else {
        journalLinesData.push({
          accountId: accounts.inventoryAccountId,
          description: `اضافات انبارگردانی: ${item.productId}`,
          debit: adjustmentAmount,
          credit: 0,
        })
        journalLinesData.push({
          accountId: overageIncomeAccountId,
          description: `اضافات انبارگردانی: ${item.productId}`,
          debit: 0,
          credit: adjustmentAmount,
        })
        totalAdjustmentDebit += adjustmentAmount
        totalAdjustmentCredit += adjustmentAmount
      }
    }

    const txClient = (tenantDb.stockCount ? tenantDb : db.client) as any

    await txClient.$transaction(async (tx: any) => {
      await tx.stockCount.update({
        where: { id },
        data: {
          status: 'completed',
          approvedBy: approvedBy || tenant.user?.id || 'system',
          approvedAt: new Date(),
        },
      })

      if (stockLevelUpdates.length > 0) {
        await Promise.all(stockLevelUpdates.map((op: any) => op))
      }

      if (stockMovementsData.length > 0) {
        await tx.stockMovement.createMany({
          data: stockMovementsData,
        })
      }

      if (journalLinesData.length > 0) {
        const jeCount = await tx.journalEntry.count({ where: { tenantId } })
        const jeNumber = `JE-SC-${String(jeCount + 1).padStart(6, '0')}`

           await tx.journalEntry.create({
          data: {
            tenantId,
            number: jeNumber,
            date: stockCount.countDate,
            description: `سند تعدیل موجودی ناشی از انبارگردانی شماره ${stockCount.number}`,
            status: 'posted',
            sourceType: 'stock_count',
            sourceId: stockCount.id,
            fiscalYearId: countFiscalYearId,
            totalDebit: totalAdjustmentDebit,
            totalCredit: totalAdjustmentCredit,
            createdBy: approvedBy || tenant.user?.id || 'system',
            lines: {
              create: journalLinesData,
            },
          },
        })
      }
    })

    console.log(`[StockCounts PATCH] سند انبار گردانی ${stockCount.number} تأیید و اسناد حسابداری آن صادر شد.`)

    return NextResponse.json({ 
      success: true, 
      message: 'انبارگردانی با موفقیت تأیید، موجودی به‌روز و سند حسابداری تعدیل صادر شد.' 
    })
  } catch (error: any) {
    console.error('[StockCounts PATCH] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'خطا در تأیید نهایی انبارگردانی',
    }, { status: 500 })
  }
})