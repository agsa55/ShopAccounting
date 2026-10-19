// src/app/api/reports/inventory/route.ts — GET (v4.0 Fiscal Year / AsOf Aware)
// ShopAccounting — Inventory Report API
// ----------------------------------------------------------------------------
// ★★★ v4.0:
//   - پذیرش fiscalYearId از store مرکزی
//   - پذیرش asOf برای گزارش موجودی تاریخی
//   - clamp تاریخ asOf داخل سال مالی
//   - تلاش برای محاسبه موجودی تاریخی از روی StockMovement
//   - fallback امن به موجودی فعلی اگر حرکت کالا موجود نباشد
//   - اصلاح summary بعد از فیلتر lowStock
//   - افزودن diagnostics برای عیب‌یابی
//   - حفظ سازگاری با relation StockLevels مطابق v3.41
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ─── Helpers ────────────────────────────────────────────────────

function safeNum(val: any): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

function normalizeToken(value: any): string {
  return String(value ?? '').toLowerCase().trim()
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

function isFieldSupported(model: any, fieldName: string): boolean {
  try {
    const fields = ((model as any).fields || {}) as Record<string, unknown>
    return fieldName in fields
  } catch {
    return false
  }
}

function getFirstSupportedField(model: any, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (isFieldSupported(model, candidate)) return candidate
  }
  return null
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

function buildInventoryRow(p: any, selectedWarehouse: string | null) {
  const levels = Array.isArray(p.StockLevels) ? p.StockLevels : []

  let currentStock = 0
  let averageCost = 0

  if (selectedWarehouse) {
    const whStock =
      levels.find((l: any) => String(l.warehouseId) === selectedWarehouse) ||
      levels[0]

    currentStock = Math.max(0, safeNum(whStock?.quantity))
    averageCost =
      safeNum(whStock?.averageCost) ||
      safeNum(p.averageCost) ||
      safeNum(p.purchasePrice) ||
      0
  } else {
    const levelQty = levels.reduce(
      (sum: number, l: any) => sum + Math.max(0, safeNum(l.quantity)),
      0
    )

    currentStock = Math.max(0, safeNum(p.currentStock) || levelQty)

    let totalQty = 0
    let totalValue = 0

    for (const l of levels) {
      const q = Math.max(0, safeNum(l.quantity))
      const c = safeNum(l.averageCost)

      if (q > 0 && c > 0) {
        totalQty += q
        totalValue += q * c
      }
    }

    averageCost =
      totalQty > 0
        ? totalValue / totalQty
        : safeNum(p.averageCost) || safeNum(p.purchasePrice) || 0
  }

  const minStock = safeNum(p.minStock)
  const purchasePrice = safeNum(p.purchasePrice)
  const salePrice = safeNum(p.salePrice)

  const stockValue = averageCost * currentStock
  const retailValue = salePrice * currentStock

  const isOutOfStock = currentStock <= 0
  const isLowStock = !isOutOfStock && minStock > 0 && currentStock <= minStock

  const suggestedThreshold =
    minStock > 0
      ? null
      : Math.max(5, Math.ceil(Math.abs(currentStock) * 0.2))

  return {
    id: p.id,
    code: p.code || '',
    barcode: p.barcode || '',
    name: p.name || 'بدون نام',
    categoryId: p.categoryId || null,
    categoryName: p.category?.name || '—',
    unitName: p.unit?.nameFa || p.unit?.symbol || p.unit?.name || 'عدد',
    purchasePrice,
    salePrice,
    averageCost,
    currentStock,
    minStock,
    stockValue,
    retailValue,
    potentialProfit: retailValue - stockValue,
    isOutOfStock,
    isLowStock,
    suggestedThreshold,
    stockStatus: isOutOfStock ? 'out' : isLowStock ? 'low' : 'ok',
    warehouseStocks: p.StockLevels || [],
  }
}

// ─── GET ────────────────────────────────────────────────────────

export const GET = withTenantAndPermission('dashboard')(
  async (req: NextRequest, _ctx: any, tenant: any) => {
    console.log('[Inventory v4.0] ★★★ VERSION LOADED — FISCAL YEAR / ASOF AWARE')

    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)

      const categoryId = searchParams.get('categoryId')
      const warehouseIdParam = searchParams.get('warehouseId')
      const showOnlyLowStock = searchParams.get('lowStock') === 'true'

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const asOfParam = searchParams.get('asOf')

      const selectedWarehouse =
        warehouseIdParam && warehouseIdParam !== 'all' ? warehouseIdParam : null

      // ══════════════════════════════════════════════════════
      // ۱. تعیین سال مالی مؤثر
      // ══════════════════════════════════════════════════════
      let fy: any = null
      let effectiveFiscalYearId: string | null = null

      if (fiscalYearIdParam) {
        try {
          fy = await resolveEffectiveFiscalYear(
            tenantDb,
            tenantId,
            fiscalYearIdParam
          )

          effectiveFiscalYearId = fy.id
        } catch (err: any) {
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
      }

      // ══════════════════════════════════════════════════════
      // ۲. تعیین تاریخ asOf
      // ══════════════════════════════════════════════════════
      let asOf: Date =
        parseDateBound(asOfParam, true) ||
        (fy ? parseDateBound(fy.endDate, true) || endOfToday() : endOfToday())

      if (fy) {
        const fyStart = parseDateBound(fy.startDate, false)
        const fyEnd = parseDateBound(fy.endDate, true)

        if (fyStart && asOf < fyStart) {
          asOf = new Date(fyStart)
        }

        if (fyEnd && asOf > fyEnd) {
          asOf = new Date(fyEnd)
        }

        asOf.setHours(23, 59, 59, 999)
      }

      const asOfISO = toLocalISODate(asOf)
      const isHistorical = asOf.getTime() < Date.now() - 60_000

      console.log('[Inventory v4.0] Effective query context', {
        tenantId,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        selectedWarehouse: selectedWarehouse || 'all',
        categoryId: categoryId || 'all',
        showOnlyLowStock,
        asOf: asOfISO,
        isHistorical,
      })

      // ══════════════════════════════════════════════════════
      // ۳. ساخت شرط WHERE کالاها
      // ══════════════════════════════════════════════════════
      const where: any = {
        tenantId,
        isActive: true,
      }

      if (categoryId && categoryId !== 'all') {
        where.categoryId = categoryId
      }

      if (selectedWarehouse) {
        where.StockLevels = {
          some: {
            warehouseId: selectedWarehouse,
            tenantId,
          },
        }
      }

      // ══════════════════════════════════════════════════════
      // ۴. دریافت کالاها
      // ══════════════════════════════════════════════════════
      const products = await tenantDb.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true, nameFa: true, symbol: true } },
          ...(selectedWarehouse
            ? {
                StockLevels: {
                  where: {
                    warehouseId: selectedWarehouse,
                    tenantId,
                  },
                  select: {
                    warehouseId: true,
                    quantity: true,
                    averageCost: true,
                  },
                },
              }
            : {
                StockLevels: {
                  select: {
                    warehouseId: true,
                    quantity: true,
                    averageCost: true,
                  },
                },
              }),
        },
        orderBy: { name: 'asc' },
      })

      // ══════════════════════════════════════════════════════
      // ۵. دریافت دسته‌بندی‌ها
      // ══════════════════════════════════════════════════════
      const categories = await tenantDb.category.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })

      // ══════════════════════════════════════════════════════
      // ۶. دریافت انبارها
      // ══════════════════════════════════════════════════════
      let warehouses: any[] = []

      try {
        warehouses = await tenantDb.warehouse.findMany({
          where: { tenantId, isActive: true },
          select: { id: true, name: true, code: true, isDefault: true },
          orderBy: { name: 'asc' },
        })
      } catch {
        warehouses = []
      }

      // ══════════════════════════════════════════════════════
      // ۷. ساخت ردیف پایه موجودی
      // ══════════════════════════════════════════════════════
      const baseRows = products.map((p: any) =>
        buildInventoryRow(p, selectedWarehouse)
      )

      const productIds = baseRows.map((r: any) => r.id).filter(Boolean)

      // ══════════════════════════════════════════════════════
      // ۸. تلاش برای محاسبه موجودی تاریخی از StockMovement
      // ══════════════════════════════════════════════════════
      const movementAdjustments: Record<string, number> = {}
      const warehouseMovementAdjustments: Record<string, number> = {}

      const movementDiagnostics: Record<string, any> = {
        modelFound: false,
        productField: null,
        dateField: null,
        quantityField: null,
        directionField: null,
        warehouseField: null,
        movementCount: 0,
        applied: false,
        skippedReason: null,
        error: null,
      }

      const movementModel =
        (tenantDb as any).stockMovement || (tenantDb as any).stockMovements

      if (movementModel) {
        movementDiagnostics.modelFound = true
      }

      if (!movementModel) {
        movementDiagnostics.skippedReason =
          'StockMovement model not found; using current stock fallback.'
      } else if (!isHistorical) {
        movementDiagnostics.skippedReason =
          'asOf is current/future; no historical adjustment required.'
      } else if (productIds.length === 0) {
        movementDiagnostics.skippedReason = 'No products in scope.'
      } else {
        const productField = getFirstSupportedField(movementModel, [
          'productId',
        ])

        const dateField = getFirstSupportedField(movementModel, [
          'createdAt',
          'movementDate',
          'date',
          'transactionDate',
          'occurredAt',
        ])

        const quantityField = getFirstSupportedField(movementModel, [
          'quantityChange',
          'quantityDelta',
          'deltaQuantity',
          'change',
          'quantity',
          'amount',
          'movementQuantity',
        ])

        const directionField = getFirstSupportedField(movementModel, [
          'direction',
          'movementType',
          'type',
          'transactionType',
          'kind',
        ])

        const warehouseField = getFirstSupportedField(movementModel, [
          'warehouseId',
        ])

        movementDiagnostics.productField = productField
        movementDiagnostics.dateField = dateField
        movementDiagnostics.quantityField = quantityField
        movementDiagnostics.directionField = directionField
        movementDiagnostics.warehouseField = warehouseField

        if (!productField || !dateField || !quantityField) {
          movementDiagnostics.skippedReason =
            'Required StockMovement fields not found.'
        } else if (selectedWarehouse && !warehouseField) {
          movementDiagnostics.skippedReason =
            'Warehouse-specific historical adjustment skipped because StockMovement has no warehouseId field.'
        } else {
          try {
            const movementWhere: Record<string, any> = {
              tenantId,
            }

            movementWhere[dateField] = {
              gt: asOf,
            }

            movementWhere[productField] = {
              in: productIds,
            }

            if (selectedWarehouse && warehouseField) {
              movementWhere[warehouseField] = selectedWarehouse
            }

            const select: Record<string, any> = {
              id: true,
            }

            select[productField] = true
            select[dateField] = true
            select[quantityField] = true

            if (
              directionField &&
              directionField !== productField &&
              directionField !== dateField &&
              directionField !== quantityField
            ) {
              select[directionField] = true
            }

            if (
              warehouseField &&
              warehouseField !== productField &&
              warehouseField !== dateField &&
              warehouseField !== quantityField &&
              warehouseField !== directionField
            ) {
              select[warehouseField] = true
            }

            const movements = await movementModel.findMany({
              where: movementWhere,
              select,
            })

            movementDiagnostics.movementCount = Array.isArray(movements)
              ? movements.length
              : 0

            const signedQuantityFields = new Set([
              'quantitychange',
              'quantitydelta',
              'deltaquantity',
              'change',
              'amountchange',
            ])

            const isSignedQuantityField = signedQuantityFields.has(
              String(quantityField).toLowerCase()
            )

            const outTerms = [
              'out',
              'exit',
              'sale',
              'sell',
              'issue',
              'dispatch',
              'ship',
              'debit',
              'خروج',
              'فروش',
              'حواله',
              'ارسال',
            ]

            const inTerms = [
              'in',
              'enter',
              'purchase',
              'receive',
              'receipt',
              'stock',
              'credit',
              'ورود',
              'خرید',
              'دریافت',
              'وارد',
            ]

            for (const m of movements || []) {
              const pid = String(m[productField] || '')
              if (!pid) continue

              let qty = safeNum(m[quantityField])

              if (!isSignedQuantityField && directionField) {
                const dir = normalizeToken(m[directionField])

                const isOut = outTerms.some((term) => dir.includes(term))
                const isIn = inTerms.some((term) => dir.includes(term))

                if (isOut && qty > 0) qty = -qty
                if (isIn && qty < 0) qty = -qty
              }

              movementAdjustments[pid] =
                (movementAdjustments[pid] || 0) + qty

              if (warehouseField) {
                const wid = String(m[warehouseField] || '')
                if (wid) {
                  const key = `${pid}:${wid}`
                  warehouseMovementAdjustments[key] =
                    (warehouseMovementAdjustments[key] || 0) + qty
                }
              }
            }

            movementDiagnostics.applied =
              movementDiagnostics.movementCount > 0
          } catch (err: any) {
            movementDiagnostics.error = err?.message || String(err)
            console.warn(
              '[Inventory v4.0] StockMovement historical adjustment failed:',
              err?.message || err
            )
          }
        }
      }

      // ══════════════════════════════════════════════════════
      // ۹. اعمال تنظیم تاریخی روی ردیف‌ها
      // ══════════════════════════════════════════════════════
      const adjustedRows = baseRows.map((row: any) => {
        if (!movementDiagnostics.applied) return row

        let stock = row.currentStock

        if (selectedWarehouse) {
          const key = `${row.id}:${selectedWarehouse}`
          const adj = warehouseMovementAdjustments[key]

          if (typeof adj === 'number') {
            stock = Math.max(0, stock - adj)
          }
        } else {
          const adj = movementAdjustments[row.id]

          if (typeof adj === 'number') {
            stock = Math.max(0, stock - adj)
          }
        }

        if (stock === row.currentStock) return row

        const stockValue = row.averageCost * stock
        const retailValue = row.salePrice * stock
        const isOutOfStock = stock <= 0
        const isLowStock =
          !isOutOfStock && row.minStock > 0 && stock <= row.minStock

        return {
          ...row,
          currentStock: stock,
          stockValue,
          retailValue,
          potentialProfit: retailValue - stockValue,
          isOutOfStock,
          isLowStock,
          stockStatus: isOutOfStock ? 'out' : isLowStock ? 'low' : 'ok',
        }
      })

      // ══════════════════════════════════════════════════════
      // ۱۰. فیلتر نهایی و summary صحیح
      // ══════════════════════════════════════════════════════
      const finalRows = showOnlyLowStock
        ? adjustedRows.filter((p: any) => p.isOutOfStock || p.isLowStock)
        : adjustedRows

      const totalStockValue = finalRows.reduce(
        (sum: number, p: any) => sum + safeNum(p.stockValue),
        0
      )

      const totalRetailValue = finalRows.reduce(
        (sum: number, p: any) => sum + safeNum(p.retailValue),
        0
      )

      const totalPotentialProfit = totalRetailValue - totalStockValue

      const lowStockCount = finalRows.filter((p: any) => p.isLowStock).length
      const outOfStockCount = finalRows.filter((p: any) => p.isOutOfStock).length

      const inventoryMode = !isHistorical
        ? 'current-stock'
        : movementDiagnostics.applied
          ? 'historical-adjusted-from-current-minus-post-asOf-movements'
          : 'current-stock-fallback'

      console.log('[Inventory v4.0] Summary', {
        fiscalYearId: effectiveFiscalYearId,
        asOf: asOfISO,
        inventoryMode,
        totalProducts: finalRows.length,
        totalStockValue,
        totalRetailValue,
        lowStockCount,
        outOfStockCount,
        movementDiagnostics,
      })

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        data: {
          products: finalRows,
          categories,
          warehouses,
          summary: {
            totalProducts: finalRows.length,
            totalStockValue,
            totalRetailValue,
            totalPotentialProfit,
            lowStockCount,
            outOfStockCount,
            criticalCount: lowStockCount + outOfStockCount,
          },
          asOf: asOfISO,
          fiscalYearRange: fy
            ? {
                from: fy.startDate,
                to: fy.endDate,
              }
            : null,
          diagnostics: {
            inventoryMode,
            isHistorical,
            selectedWarehouse: selectedWarehouse || 'all',
            categoryId: categoryId || 'all',
            showOnlyLowStock,
            baseProductCount: baseRows.length,
            finalProductCount: finalRows.length,
            movement: movementDiagnostics,
          },
        },
      })
    } catch (error: any) {
      console.error('[Inventory v4.0] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error:
            'خطا در دریافت گزارش موجودی: ' + (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)