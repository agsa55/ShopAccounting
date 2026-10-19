// src/app/api/reports/inventory-advanced/route.ts — v6.7 ★★★ FIXED TYPING
// ShopAccounting — Advanced Inventory Reports API
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

function safeNum(val: any): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

function parseDateBound(value: any, endOfDay = false): Date | null {
  if (!value) return null

  const raw = String(value).trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
    return isNaN(d.getTime()) ? null : d
  }

  const d = new Date(raw)
  if (isNaN(d.getTime())) return null

  if (endOfDay) {
    d.setHours(23, 59, 59, 999)
  } else {
    d.setHours(0, 0, 0, 0)
  }

  return d
}

function toLocalISODate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function endOfToday(): Date {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

function normalizeToken(value: any): string {
  return String(value ?? '').toLowerCase().trim()
}

function isFieldSupported(model: any, fieldName: string): boolean {
  try {
    const fields = ((model as any).fields || {}) as Record<string, unknown>
    return fieldName in fields
  } catch {
    return false
  }
}

async function resolveEffectiveFiscalYear(
  tenantDb: any,
  tenantId: string,
  fiscalYearIdParam: string | null
): Promise<any> {
  if (fiscalYearIdParam) {
    const fy = await tenantDb.fiscalYear.findFirst({
      where: {
        id: fiscalYearIdParam,
        tenantId,
      },
    })

    if (!fy) {
      throw new Error('سال مالی انتخابی یافت نشد.')
    }

    return fy
  }

  const fy = await tenantDb.fiscalYear.findFirst({
    where: {
      tenantId,
      isActive: true,
      isClosed: false,
    },
    orderBy: {
      startDate: 'desc',
    },
  })

  if (!fy) {
    throw new Error('سال مالی فعالی برای این فروشگاه تعریف نشده است.')
  }

  return fy
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

async function adjustStockLevelsToAsOf(
  tenantDb: any,
  tenantId: string,
  stockLevels: IStockLevel[],
  asOf: Date
): Promise<IStockLevel[]> {
  if (!stockLevels.length) return stockLevels

  const productIds = Array.from(new Set(stockLevels.map((sl) => sl.productId)))

  const movementsAfter = await tenantDb.stockMovement
    .findMany({
      where: {
        tenantId,
        createdAt: {
          gt: asOf,
        },
        productId: {
          in: productIds,
        },
      },
      select: {
        productId: true,
        fromWarehouseId: true,
        toWarehouseId: true,
        quantity: true,
      },
      take: 10000,
    })
    .catch(() => [])
        console.log('[Inventory] adjustStockLevelsToAsOf', {
      asOf: asOf.toISOString(),
      movementsAfterCount: movementsAfter.length,
      levelCount: stockLevels.length,
    })

  const map = new Map<string, IStockLevel>(
    stockLevels.map((sl) => [`${sl.productId}|${sl.warehouseId}`, { ...sl }])
  )

  for (const m of movementsAfter) {
    const qty = Math.abs(safeNum(m.quantity))
    if (qty === 0) continue

    const from = m.fromWarehouseId || null
    const to = m.toWarehouseId || null

    // ورودی به انبار بعد از تاریخ مرجع => در گذشته این مقدار هنوز وارد نشده بود
    if (to && !from) {
      const key = `${m.productId}|${to}`
      const sl = map.get(key)
      if (sl) {
        sl.quantity = safeNum(sl.quantity) - qty
      }
    }

    // خروجی از انبار بعد از تاریخ مرجع => در گذشته این مقدار هنوز خارج نشده بود
    else if (from && !to) {
      const key = `${m.productId}|${from}`
      const sl = map.get(key)
      if (sl) {
        sl.quantity = safeNum(sl.quantity) + qty
      }
    }

    // انتقال بعد از تاریخ مرجع => در گذشته هنوز انتقال انجام نشده بود
    else if (from && to) {
      const fromKey = `${m.productId}|${from}`
      const toKey = `${m.productId}|${to}`

      const fromSl = map.get(fromKey)
      if (fromSl) {
        fromSl.quantity = safeNum(fromSl.quantity) + qty
      }

      const toSl = map.get(toKey)
      if (toSl) {
        toSl.quantity = safeNum(toSl.quantity) - qty
      }
    }
  }

  return Array.from(map.values()).map((sl) => ({
    ...sl,
    quantity: Math.round(safeNum(sl.quantity) * 1000) / 1000,
  }))
}

export const GET = withTenantAndPermission('dashboard')(
  async (req: NextRequest, _ctx: any, tenant: any) => {
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
      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'
      const asOfParam = (searchParams.get('asOf') || '').trim()

      console.log('[Inventory v6.8] Query params', {
        reportType,
        warehouseId,
        categoryId,
        dateFrom,
        dateTo,
        lowStockOnly,
        fiscalYearId: fiscalYearIdParam || null,
        allYears,
        asOf: asOfParam || null,
      })

      // ★ برای گزارش‌های موجودی، تاریخ مرجع پایان سال مالی در نظر گرفته می‌شود
      let fiscalYearForSnapshot: any = null
      let snapshotFiscalYearId: string | null = null
      let asOfDate: Date | null = null

       if (!allYears) {
        try {
          fiscalYearForSnapshot = await resolveEffectiveFiscalYear(
            tenantDb,
            tenantId,
            fiscalYearIdParam || null
          )

          snapshotFiscalYearId = fiscalYearForSnapshot.id

          const fyStart = parseDateBound(fiscalYearForSnapshot.startDate, false)
          const fyEnd = parseDateBound(fiscalYearForSnapshot.endDate, true)

          if (!fyStart || !fyEnd) {
            throw new Error('تاریخ‌های سال مالی انتخابی نامعتبر است.')
          }

          if (asOfParam) {
            const parsed = parseDateBound(asOfParam, true)

            if (!parsed) {
              return NextResponse.json(
                { success: false, error: 'تاریخ asOf نامعتبر است' },
                { status: 400 }
              )
            }

            if (parsed < fyStart) {
              asOfDate = new Date(fyStart)
            } else if (parsed > fyEnd) {
              asOfDate = new Date(fyEnd)
            } else {
              asOfDate = parsed
            }
          } else {
            asOfDate = new Date(fyEnd)
          }

          if (asOfDate) {
            asOfDate.setHours(23, 59, 59, 999)
          }

          console.log('[Inventory v6.10] Snapshot fiscal year', {
            fiscalYearId: snapshotFiscalYearId,
            fiscalYearName: fiscalYearForSnapshot?.name,
            asOfDate: asOfDate ? toLocalISODate(asOfDate) : null,
          })
        } catch (err: any) {
          if (fiscalYearIdParam) {
            return NextResponse.json(
              {
                success: false,
                error:
                  err?.message ||
                  'سال مالی انتخابی یافت نشد یا برای این فروشگاه معتبر نیست.',
                code: 'INVALID_FISCAL_YEAR',
              },
              { status: 400 }
            )
          }

          console.warn('[Inventory v6.10] Fiscal year snapshot fallback:', err?.message)

          fiscalYearForSnapshot = null
          snapshotFiscalYearId = null
          asOfDate = null
        }
      }
   

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

         // ★ تشخیص وضعیت سال مالی + clamp تاریخ مرجع
          const nowDate = endOfToday()

      let fiscalYearState: 'future' | 'ongoing' | 'closed' | 'none' = 'none'
      if (fiscalYearForSnapshot) {
        const fyStartMs = new Date(fiscalYearForSnapshot.startDate).getTime()
        const fyEndMs = new Date(fiscalYearForSnapshot.endDate).getTime()

        if (fyStartMs > nowDate.getTime()) fiscalYearState = 'future'
        else if (fyEndMs < nowDate.getTime()) fiscalYearState = 'closed'
        else fiscalYearState = 'ongoing'
      }

      // برای سال جاری نمی‌توان آینده را دید؛ تاریخ مرجع حداکثر امروز است
      if (asOfDate && asOfDate.getTime() > nowDate.getTime()) {
        asOfDate = new Date(nowDate)
      }

      console.log('[Inventory v6.9] fiscal year state', {
        reportType,
        fiscalYearState,
        asOfDate: asOfDate ? toLocalISODate(asOfDate) : null,
      })

      // فقط سالی که هنوز شروع نشده، موجودی ندارد
      if (fiscalYearState === 'future' && ['stockByWarehouse', 'value', 'lowStock'].includes(reportType)) {
        return NextResponse.json({
          success: true,
          fiscalYearId: snapshotFiscalYearId,
          fiscalYearName: fiscalYearForSnapshot?.name || null,
          fiscalYearState,
          allYears,
          asOf: null,
          inventoryScope: 'not-started',
          message: 'این سال مالی هنوز شروع نشده است؛ برای آن موجودی معنا ندارد.',
          data: {
            type: reportType,
            products: [],
            warehouseValues: [],
            categoryValues: [],
            warehouses,
            categories,
            summary: {
              totalProducts: 0,
              totalQty: 0,
              totalValue: 0,
              totalRetailValue: 0,
              totalPotentialProfit: 0,
              lowStockCount: 0,
              outOfStockCount: 0,
              totalWarehouses: 0,
              totalQuantity: 0,
              totalLowStock: 0,
              totalOutOfStock: 0,
              totalShortageValue: 0,
              warehouseCount: warehouses.length,
            },
          },
        })
      }
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

                if (asOfDate && stockLevels.length > 0) {
          stockLevels = await adjustStockLevelsToAsOf(
            tenantDb,
            tenantId,
            stockLevels,
            asOfDate
          )
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
          fiscalYearId: snapshotFiscalYearId,
          fiscalYearName: fiscalYearForSnapshot?.name || null,
          allYears,
          asOf: asOfDate ? toLocalISODate(asOfDate) : null,
          inventoryScope: asOfDate ? 'period-end' : 'current',
          warning: allYears ? ALL_YEARS_WARNING : undefined,
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
      //  ★ v6.8: ایزولاسیون سال مالی برای حرکات انبار
      // ═══════════════════════════════════════════════════════════════
      if (reportType === 'movements') {
        let fy: any = null
        let effectiveFiscalYearId: string | null = null

        if (!allYears) {
          try {
            fy = await resolveEffectiveFiscalYear(
              tenantDb,
              tenantId,
              fiscalYearIdParam || null
            )

            effectiveFiscalYearId = fy.id
          } catch (err: any) {
            return NextResponse.json(
              {
                success: false,
                error:
                  err?.message ||
                  (fiscalYearIdParam
                    ? 'سال مالی انتخابی یافت نشد.'
                    : 'سال مالی فعالی برای این فروشگاه تعریف نشده است.'),
                code: fiscalYearIdParam
                  ? 'INVALID_FISCAL_YEAR'
                  : 'NO_ACTIVE_FISCAL_YEAR',
              },
              { status: 400 }
            )
          }
        }

        const hasFiscalYearIdOnStockMovement = isFieldSupported(
          tenantDb.stockMovement,
          'fiscalYearId'
        )

        let fromDate: Date | null = null
        let toDate: Date | null = null

           fromDate = parseDateBound(dateFrom, false)
        toDate = parseDateBound(dateTo, true)

        if (dateFrom && !fromDate) {
          return NextResponse.json(
            { success: false, error: 'تاریخ شروع نامعتبر است' },
            { status: 400 }
          )
        }

        if (dateTo && !toDate) {
          return NextResponse.json(
            { success: false, error: 'تاریخ پایان نامعتبر است' },
            { status: 400 }
          )
        }

        if (effectiveFiscalYearId && fy) {
          const fyStart = new Date(fy.startDate)
          const fyEnd = new Date(fy.endDate)

          fyStart.setHours(0, 0, 0, 0)
          fyEnd.setHours(23, 59, 59, 999)

          // ★ اگر StockMovement فیلد fiscalYearId ندارد،
          //   پیش‌فرض بازه تاریخ = کل سال مالی انتخاب‌شده
                // ★ پیش‌فرض بازه تاریخ = کل سال مالی انتخاب‌شده.
          // این کار باعث می‌شود حرکات قدیمی بدون fiscalYearId هم داخل همان سال دیده شوند.
          if (!fromDate) fromDate = new Date(fyStart)
          if (!toDate) toDate = new Date(fyEnd)
          // ★ clamp تاریخ‌های ارسالی داخل سال مالی
          if (fromDate && fromDate < fyStart) fromDate = new Date(fyStart)
          if (toDate && toDate > fyEnd) toDate = new Date(fyEnd)

          if (fromDate && toDate && fromDate > toDate) {
            return NextResponse.json(
              {
                success: false,
                error: `بازه تاریخ انتخابی با سال مالی «${fy.name}» هم‌پوشانی ندارد.`,
                code: 'DATE_RANGE_OUTSIDE_FISCAL_YEAR',
              },
              { status: 400 }
            )
          }
        } else {
          if (fromDate && toDate && fromDate > toDate) {
            return NextResponse.json(
              {
                success: false,
                error: 'تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد',
              },
              { status: 400 }
            )
          }
        }

        const movWhere: any = { tenantId }

        if (warehouseId && warehouseId !== 'all') {
          movWhere.OR = [
            { fromWarehouseId: warehouseId },
            { toWarehouseId: warehouseId },
          ]
        }

        if (fromDate || toDate) {
          movWhere.createdAt = {}

          if (fromDate) movWhere.createdAt.gte = fromDate
          if (toDate) movWhere.createdAt.lte = toDate
        }

        // ★ اگر فیلد fiscalYearId روی StockMovement وجود داشته باشد، مستقیم فیلتر می‌کنیم
             // ★ اگر فیلد fiscalYearId روی StockMovement وجود داشته باشد:
        //   - حرکات متصل به سال مالی انتخابی
        //   - حرکات قدیمی بدون fiscalYearId که تاریخشان داخل همان سال مالی است
        if (effectiveFiscalYearId && hasFiscalYearIdOnStockMovement) {
          movWhere.AND = [
            {
              OR: [
                { fiscalYearId: effectiveFiscalYearId },
                { fiscalYearId: null },
              ],
            },
          ]
        }
        const movementsRaw: any[] = await tenantDb.stockMovement
          .findMany({
            where: movWhere,
            orderBy: { createdAt: 'desc' },
            take: 1000,
          })
          .catch(() => [])

        // ★ گرفتن نام کالاها و انبارها
        const productIds = [
          ...new Set(movementsRaw.map((m) => m.productId).filter(Boolean)),
        ]

        const warehouseIds = [
          ...new Set([
            ...movementsRaw.map((m) => m.fromWarehouseId).filter(Boolean),
            ...movementsRaw.map((m) => m.toWarehouseId).filter(Boolean),
          ]),
        ]
        const [products, whs] = await Promise.all([
          productIds.length > 0
            ? tenantDb.product.findMany({
                where: { id: { in: productIds } },
                select: {
                  id: true,
                  name: true,
                  code: true,
                  unit: { select: { nameFa: true, symbol: true } },
                },
              })
            : Promise.resolve([] as any[]),
          warehouseIds.length > 0
            ? tenantDb.warehouse.findMany({
                where: { id: { in: warehouseIds } },
                select: { id: true, name: true },
              })
            : Promise.resolve([] as any[]),
        ]) as [any[], any[]]

        const productMap = new Map<string, any>(
          products.map((p: any) => [p.id, p])
        )

        const whMap = new Map<string, any>(
          whs.map((w: any) => [w.id, w])
        )
        const MOVEMENT_LABELS: Record<string, string> = {
          sale: 'فروش',
          purchase: 'خرید',
          transfer: 'انتقال',
          adjustment: 'انبار گردانی',
          initial: 'موجودی اولیه',
          return: 'مرجوع',
        }

        const result = movementsRaw.map((m: any) => {
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
            fromWarehouseName: m.fromWarehouseId
              ? whMap.get(m.fromWarehouseId)?.name || '—'
              : null,
            toWarehouseId: m.toWarehouseId || null,
            toWarehouseName: m.toWarehouseId
              ? whMap.get(m.toWarehouseId)?.name || '—'
              : null,
            quantity,
            unitCost,
            totalValue: Math.round(totalValue),
            movementType: m.movementType,
            movementTypeLabel:
              MOVEMENT_LABELS[m.movementType] || m.movementType,
            referenceType: m.referenceType || null,
            referenceId: m.referenceId || null,
            description: m.description || null,
            fiscalYearId: m.fiscalYearId || null,
            isOutgoing: !!m.fromWarehouseId && !m.toWarehouseId,
            isIncoming: !!m.toWarehouseId && !m.fromWarehouseId,
            isTransfer: !!m.fromWarehouseId && !!m.toWarehouseId,
          }
        })

        // ★ خلاصه
        const summary = {
          totalMovements: result.length,
          totalIn: Math.round(
            result
              .filter((m) => m.isIncoming)
              .reduce((s, m) => s + m.totalValue, 0)
          ),
          totalOut: Math.round(
            result
              .filter((m) => m.isOutgoing)
              .reduce((s, m) => s + m.totalValue, 0)
          ),
          totalTransfer: result.filter((m) => m.isTransfer).length,
          byType: Object.keys(MOVEMENT_LABELS)
            .map((type) => {
              const typeMovements = result.filter(
                (m) => m.movementType === type
              )

              return {
                type,
                label: MOVEMENT_LABELS[type],
                count: typeMovements.length,
                value: Math.round(
                  typeMovements.reduce((s, m) => s + m.totalValue, 0)
                ),
              }
            })
            .filter((t) => t.count > 0),
        }

        const uniqueFiscalYearIds = Array.from(
          new Set(result.map((m: any) => m.fiscalYearId || 'NULL'))
        )

        const movementTypeCounts = result.reduce<Record<string, number>>(
          (acc, m) => {
            const key = normalizeToken(m.movementType) || 'NULL'
            acc[key] = (acc[key] || 0) + 1
            return acc
          },
          {}
        )

        const fiscalYearScopeNote = effectiveFiscalYearId
          ? hasFiscalYearIdOnStockMovement
            ? 'حرکات انبار بر اساس fiscalYearId فیلتر شدند.'
            : 'StockMovement فاقد فیلد fiscalYearId است؛ فیلتر بر اساس بازه تاریخ سال مالی اعمال شد.'
          : allYears
            ? 'همه سال‌های مالی بدون فیلتر سال مالی.'
            : null

        const diagnostics = {
          rawMovementCount: movementsRaw.length,
          resultCount: result.length,
          hasFiscalYearIdOnStockMovement,
          fiscalYearScopeNote,
          uniqueFiscalYearIds,
          movementTypeCounts,
        }

        console.log('[Inventory v6.8] movements', {
          fiscalYearId: effectiveFiscalYearId,
          fiscalYearName: fy?.name || null,
          allYears,
          totalMovements: result.length,
          summary,
          diagnostics,
        })

        return NextResponse.json({
          success: true,
          fiscalYearId: effectiveFiscalYearId,
          fiscalYearName: fy?.name || null,
          allYears,
          warning: allYears ? ALL_YEARS_WARNING : undefined,
          data: {
            type: 'movements',
            movements: result,
            warehouses,
            summary,
            dateRange: {
              from: fromDate ? toLocalISODate(fromDate) : null,
              to: toDate ? toLocalISODate(toDate) : null,
            },
            fiscalYearRange: fy
              ? {
                  from: fy.startDate,
                  to: fy.endDate,
                }
              : null,
            diagnostics,
          },
        })
      }
      // ═══════════════════════════════════════════════════════════════
      //  نوع ۳: ارزش انبار (value) — گروه‌بندی بر اساس انبار
      // ═══════════════════════════════════════════════════════════════
       if (reportType === 'value') {
        const slWhere: any = { tenantId }

        if (warehouseId && warehouseId !== 'all') {
          slWhere.warehouseId = warehouseId
        }

        let stockLevels: IStockLevel[] = await tenantDb.stockLevel
          .findMany({
            where: slWhere,
          })
          .catch(() => [])

        if (categoryId && categoryId !== 'all') {
          const scopedProducts = await tenantDb.product
            .findMany({
              where: {
                tenantId,
                isActive: true,
                categoryId,
              },
              select: { id: true },
            })
            .catch(() => [])

          const scopedIds = new Set(scopedProducts.map((p: any) => p.id))
          stockLevels = stockLevels.filter((sl) => scopedIds.has(sl.productId))
        }

        if (asOfDate && stockLevels.length > 0) {
          stockLevels = await adjustStockLevelsToAsOf(
            tenantDb,
            tenantId,
            stockLevels,
            asOfDate
          )
        }

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

 return NextResponse.json({ success: true, fiscalYearId: snapshotFiscalYearId, fiscalYearName: fiscalYearForSnapshot?.name || null, allYears, asOf: asOfDate ? toLocalISODate(asOfDate) : null, inventoryScope: asOfDate ? 'period-end' : 'current', warning: allYears ? ALL_YEARS_WARNING : undefined, data: { type: 'value', warehouseValues, categoryValues, warehouses, summary, }, })
      }

      // ═══════════════════════════════════════════════════════════════
      //  نوع ۴: کالاهای کم‌موجود (lowStock)
      // ═══════════════════════════════════════════════════════════════
         if (reportType === 'lowStock') {
        const productWhere: any = { tenantId, isActive: true }

        if (categoryId && categoryId !== 'all') {
          productWhere.categoryId = categoryId
        }

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
        let stockLevels: IStockLevel[] = []

        if (productIds.length > 0) {
          const slWhere: any = {
            tenantId,
            productId: { in: productIds },
          }

          if (warehouseId && warehouseId !== 'all') {
            slWhere.warehouseId = warehouseId
          }

          stockLevels = await tenantDb.stockLevel
            .findMany({
              where: slWhere,
            })
            .catch(() => [])
        }
                if (asOfDate && stockLevels.length > 0) {
          stockLevels = await adjustStockLevelsToAsOf(
            tenantDb,
            tenantId,
            stockLevels,
            asOfDate
          )
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

 return NextResponse.json({ success: true, fiscalYearId: snapshotFiscalYearId, fiscalYearName: fiscalYearForSnapshot?.name || null, allYears, asOf: asOfDate ? toLocalISODate(asOfDate) : null, inventoryScope: asOfDate ? 'period-end' : 'current', warning: allYears ? ALL_YEARS_WARNING : undefined, data: { type: 'lowStock', products: result, summary, }, })
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