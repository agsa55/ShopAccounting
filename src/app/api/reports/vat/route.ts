// ============================================================================
// src/app/api/reports/vat/route.ts — GET (v4.0 Fiscal Year Isolation)
// ShopAccounting — VAT (Value Added Tax) Report API
// ----------------------------------------------------------------------------
// ★★★ v4.0:
//   - ایزولاسیون کامل سال مالی
//   - پیش‌فرض: سال مالی فعال
//   - fiscalYearId: سال مالی انتخابی
//   - allYears=true: همه سال‌ها فقط برای بررسی مدیریتی
//   - clamp بازه تاریخ داخل سال مالی
//   - حذف فاکتورهای cancelled/void
//   - جداسازی فاکتورهای خرید از VAT فروش
//   - diagnostics برای عیب‌یابی invoiceType
//
// ★★★ v3.39:
//   - فیلتر invoiceType
//   - تفریق برگشتی‌ها
//   - نمایش برگشتی‌ها با علامت منفی
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

function normalizeToken(value: any): string {
  return String(value ?? '').toLowerCase().trim()
}
function safeNum(val: any): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

function parseDateBound(value: any, endOfDay = false): Date | null {
  if (!value) return null

  const raw = String(value).trim()
  if (!raw) return null

  // اگر فقط تاریخ بود، مثل 2026-10-18، آن را به وقت محلی سرور تبدیل کن
  // تا مشکل UTC / timezone پیش نیاید.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
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

function isInvalidInvoiceStatus(value: any): boolean {
  const status = normalizeToken(value)
  return status === 'cancelled' || status === 'canceled' || status === 'void'
}

function isPurchaseInvoiceType(value: any): boolean {
  const t = normalizeToken(value)
  return t.includes('purchase')
}

function isSaleReturnInvoiceType(value: any): boolean {
  const t = normalizeToken(value)
  return t === 'sale_return' || (t.includes('sale') && t.includes('return'))
}

function isSaleInvoiceType(value: any): boolean {
  const t = normalizeToken(value)

  if (isPurchaseInvoiceType(t)) return false
  if (isSaleReturnInvoiceType(t)) return false

  return (
    t === 'sale' ||
    t === 'sales' ||
    t.includes('sale') ||
    t === '' ||
    t === 'normal' ||
    t === 'invoice'
  )
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

export const GET = withTenantAndPermission('dashboard')(
  async (req: NextRequest, _ctx: any, tenant: any) => {
    console.log('[VAT v4.0] ★★★ VERSION LOADED — FISCAL YEAR ISOLATION')

    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)

      const fromParam = searchParams.get('from') || searchParams.get('dateFrom')
      const toParam = searchParams.get('to') || searchParams.get('dateTo')

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'

      let fy: any = null
      let effectiveFiscalYearId: string | null = null

      // ══════════════════════════════════════════════════════
      // ۱. تعیین سال مالی مؤثر
      // ══════════════════════════════════════════════════════
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

      // ══════════════════════════════════════════════════════
      // ۲. تنظیم بازه تاریخ
      // ══════════════════════════════════════════════════════
      let fromDate: Date | null = parseDateBound(fromParam, false)
      let toDate: Date | null = parseDateBound(toParam, true)

      if (fromParam && !fromDate) {
        return NextResponse.json(
          { success: false, error: 'تاریخ شروع نامعتبر است' },
          { status: 400 }
        )
      }

      if (toParam && !toDate) {
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

        if (!fromDate) fromDate = new Date(fyStart)
        if (!toDate) toDate = new Date(fyEnd)

        if (fromDate < fyStart) fromDate = new Date(fyStart)
        if (toDate > fyEnd) toDate = new Date(fyEnd)

        fromDate.setHours(0, 0, 0, 0)
        toDate.setHours(23, 59, 59, 999)

        if (fromDate > toDate) {
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
        if (fromDate) fromDate.setHours(0, 0, 0, 0)
        if (toDate) toDate.setHours(23, 59, 59, 999)

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

      const dateWhere: any = {}

      if (fromDate) dateWhere.gte = fromDate
      if (toDate) dateWhere.lte = toDate

      console.log('[VAT v4.0] Effective query context', {
        tenantId,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        dateFrom: fromDate?.toISOString() || null,
        dateTo: toDate?.toISOString() || null,
      })

      // ══════════════════════════════════════════════════════
      // ۳. واکشی فاکتورها
      // ══════════════════════════════════════════════════════
         const invoiceWhere: any = {
        tenantId,
      }

      if (Object.keys(dateWhere).length > 0) {
        invoiceWhere.invoiceDate = dateWhere
      }

      if (effectiveFiscalYearId) {
        invoiceWhere.AND = [
          {
            OR: [
              // فاکتورهایی که مستقیماً به همین سال مالی متصل‌اند
              { fiscalYearId: effectiveFiscalYearId },

              // فاکتورهای قدیمی که fiscalYearId ندارند،
              // ولی تاریخشان به‌وسیله invoiceDate بالای همین query داخل سال مالی محدود شده است.
              { fiscalYearId: null },
            ],
          },
        ]
      }

      const rawInvoices = await tenantDb.invoice.findMany({
        where: invoiceWhere,
        select: {
          id: true,
          number: true,
          invoiceDate: true,
          invoiceType: true,
          paymentType: true,
          status: true,
          subTotal: true,
          discountAmount: true,
          taxAmount: true,
          totalAmount: true,
          customerId: true,
          fiscalYearId: true,
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mobile: true,
            },
          },
          items: {
            select: {
              productName: true,
              quantity: true,
              unitPrice: true,
              discountAmount: true,
              taxAmount: true,
              lineTotal: true,
            },
          },
        },
        orderBy: {
          invoiceDate: 'desc',
        },
      })

      // ══════════════════════════════════════════════════════
      // ۴. فیلتر نرم فاکتورهای باطل/لغو
      // ══════════════════════════════════════════════════════
      const validInvoices = rawInvoices.filter((inv: any) => {
        return !isInvalidInvoiceStatus(inv.status)
      })

      // ══════════════════════════════════════════════════════
      // ۵. طبقه‌بندی فاکتورها
      // ══════════════════════════════════════════════════════
      const saleInvoices: any[] = []
      const returnInvoices: any[] = []
      const ignoredInvoices: any[] = []

      for (const inv of validInvoices) {
        const t = normalizeToken(inv.invoiceType)

        if (isPurchaseInvoiceType(t)) {
          ignoredInvoices.push(inv)
          continue
        }

        if (isSaleReturnInvoiceType(t)) {
          returnInvoices.push(inv)
          continue
        }

        if (isSaleInvoiceType(t)) {
          saleInvoices.push(inv)
          continue
        }

        ignoredInvoices.push(inv)
      }

      // ══════════════════════════════════════════════════════
      // ۶. محاسبه خلاصه VAT
      // ══════════════════════════════════════════════════════
      let totalSalesBase = 0
      let totalReturnsBase = 0
      let totalTaxCollected = 0
      let totalReturnTax = 0
      let totalDiscountSale = 0
      let totalDiscountReturn = 0
      let totalSalesWithTax = 0
      let totalReturnsWithTax = 0

      const taxRates: Record<
        string,
        { count: number; baseAmount: number; taxAmount: number }
      > = {}

      const enrichedSaleInvoices = saleInvoices.map((inv: any) => {
        const subTotal = safeNum(inv.subTotal)
        const taxAmount = safeNum(inv.taxAmount)
        const discountAmount = safeNum(inv.discountAmount)
        const totalAmount = safeNum(inv.totalAmount)

        totalSalesBase += subTotal
        totalTaxCollected += taxAmount
        totalDiscountSale += discountAmount
        totalSalesWithTax += totalAmount

        const itemsByTaxRate: Record<
          string,
          { baseAmount: number; taxAmount: number; count: number }
        > = {}

        for (const item of inv.items || []) {
          const itemBase =
            safeNum(item.quantity) * safeNum(item.unitPrice) -
            safeNum(item.discountAmount)

          const itemTax = safeNum(item.taxAmount)
          const rate = itemBase > 0 ? ((itemTax / itemBase) * 100).toFixed(1) : '0'
          const rateKey = `${rate}%`

          if (!itemsByTaxRate[rateKey]) {
            itemsByTaxRate[rateKey] = { baseAmount: 0, taxAmount: 0, count: 0 }
          }

          itemsByTaxRate[rateKey].baseAmount += itemBase
          itemsByTaxRate[rateKey].taxAmount += itemTax
          itemsByTaxRate[rateKey].count += 1

          if (!taxRates[rateKey]) {
            taxRates[rateKey] = { count: 0, baseAmount: 0, taxAmount: 0 }
          }

          taxRates[rateKey].count += 1
          taxRates[rateKey].baseAmount += itemBase
          taxRates[rateKey].taxAmount += itemTax
        }

        const customerName = inv.customer
          ? `${inv.customer.firstName || ''} ${inv.customer.lastName || ''}`.trim()
          : 'فروش عمومی'

        return {
          id: inv.id,
          number: inv.number,
          invoiceDate: inv.invoiceDate,
          invoiceDateJalali: new Date(inv.invoiceDate).toLocaleDateString('fa-IR'),
          invoiceType: 'sale',
          paymentType: inv.paymentType,
          status: inv.status,
          fiscalYearId: inv.fiscalYearId || null,
          customerName,
          subTotal,
          discountAmount,
          taxAmount,
          totalAmount,
          itemsByTaxRate,
        }
      })

      const enrichedReturnInvoices = returnInvoices.map((inv: any) => {
        const subTotal = safeNum(inv.subTotal)
        const taxAmount = safeNum(inv.taxAmount)
        const discountAmount = safeNum(inv.discountAmount)
        const totalAmount = safeNum(inv.totalAmount)

        totalReturnsBase += subTotal
        totalReturnTax += taxAmount
        totalDiscountReturn += discountAmount
        totalReturnsWithTax += totalAmount

        const itemsByTaxRate: Record<
          string,
          { baseAmount: number; taxAmount: number; count: number }
        > = {}

        for (const item of inv.items || []) {
          const itemBase =
            safeNum(item.quantity) * safeNum(item.unitPrice) -
            safeNum(item.discountAmount)

          const itemTax = safeNum(item.taxAmount)
          const rate = itemBase > 0 ? ((itemTax / itemBase) * 100).toFixed(1) : '0'
          const rateKey = `${rate}%`

          if (!itemsByTaxRate[rateKey]) {
            itemsByTaxRate[rateKey] = { baseAmount: 0, taxAmount: 0, count: 0 }
          }

          itemsByTaxRate[rateKey].baseAmount += itemBase
          itemsByTaxRate[rateKey].taxAmount += itemTax
          itemsByTaxRate[rateKey].count += 1
        }

        const customerName = inv.customer
          ? `${inv.customer.firstName || ''} ${inv.customer.lastName || ''}`.trim()
          : 'فروش عمومی'

        return {
          id: inv.id,
          number: inv.number,
          invoiceDate: inv.invoiceDate,
          invoiceDateJalali: new Date(inv.invoiceDate).toLocaleDateString('fa-IR'),
          invoiceType: 'return',
          paymentType: inv.paymentType,
          status: inv.status,
          fiscalYearId: inv.fiscalYearId || null,
          customerName,
          subTotal: -subTotal,
          discountAmount: -discountAmount,
          taxAmount: -taxAmount,
          totalAmount: -totalAmount,
          itemsByTaxRate,
        }
      })

      const allEnrichedInvoices = [
        ...enrichedSaleInvoices,
        ...enrichedReturnInvoices,
      ]

      const netTaxBase = totalSalesBase - totalReturnsBase
      const netTaxCollected = totalTaxCollected - totalReturnTax
      const netDiscount = totalDiscountSale - totalDiscountReturn
      const netSalesWithTax = totalSalesWithTax - totalReturnsWithTax

      const saleInvoiceCount = saleInvoices.length
      const returnInvoiceCount = returnInvoices.length
      const ignoredInvoiceCount = ignoredInvoices.length

      const vatPayable = netTaxCollected

      // ══════════════════════════════════════════════════════
      // ۷. diagnostics
      // ══════════════════════════════════════════════════════
      const invoiceTypeCounts: Record<string, number> = {}
      const statusCounts: Record<string, number> = {}
      const fiscalYearIdCounts: Record<string, number> = {}
      const ignoredInvoiceTypeCounts: Record<string, number> = {}

      for (const inv of rawInvoices) {
        const t = normalizeToken(inv.invoiceType) || 'NULL'
        invoiceTypeCounts[t] = (invoiceTypeCounts[t] || 0) + 1

        const st = normalizeToken(inv.status) || 'NULL'
        statusCounts[st] = (statusCounts[st] || 0) + 1

        const fyId = inv.fiscalYearId || 'NULL'
        fiscalYearIdCounts[fyId] = (fiscalYearIdCounts[fyId] || 0) + 1
      }

      for (const inv of ignoredInvoices) {
        const t = normalizeToken(inv.invoiceType) || 'NULL'
        ignoredInvoiceTypeCounts[t] = (ignoredInvoiceTypeCounts[t] || 0) + 1
      }

      console.log('[VAT v4.0] Summary', {
        fiscalYearId: effectiveFiscalYearId,
        allYears,
        rawInvoiceCount: rawInvoices.length,
        validInvoiceCount: validInvoices.length,
        saleInvoiceCount,
        returnInvoiceCount,
        ignoredInvoiceCount,
        totalSalesBase,
        totalReturnsBase,
        netTaxBase,
        totalTaxCollected,
        totalReturnTax,
        netTaxCollected,
        vatPayable,
      })

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        warning: allYears ? ALL_YEARS_WARNING : undefined,
        data: {
          invoices: allEnrichedInvoices,
          summary: {
            saleInvoiceCount,
            returnInvoiceCount,
            ignoredInvoiceCount,
            invoiceCount: saleInvoiceCount,

            totalSales: totalSalesBase,
            totalReturns: totalReturnsBase,
            netTaxBase,

            totalDiscountSale,
            totalDiscountReturn,
            totalDiscount: netDiscount,

            totalTaxCollected: netTaxCollected,
            totalSalesWithTax: netSalesWithTax,
            vatPayable,

                taxRates: Object.entries(taxRates).map(([rateKey, data]) => ({
              rate: Number(String(rateKey).replace('%', '')) || 0,
              count: data.count,
              baseAmount: data.baseAmount,
              taxAmount: data.taxAmount,
            })),
          },

          dateRange: {
            from: fromDate ? fromDate.toISOString() : null,
            to: toDate ? toDate.toISOString() : null,
          },

          fiscalYearRange: fy
            ? {
                from: fy.startDate,
                to: fy.endDate,
              }
            : null,

          diagnostics: {
            rawInvoiceCount: rawInvoices.length,
            validInvoiceCount: validInvoices.length,
            saleInvoiceCount,
            returnInvoiceCount,
            ignoredInvoiceCount,
            invoiceTypeCounts,
            statusCounts,
            fiscalYearIdCounts,
            ignoredInvoiceTypeCounts,
          },
        },
      })
    } catch (error: any) {
      console.error('[VAT v4.0] Error:', error?.message || error)

      return NextResponse.json(
        {
          success: false,
          error: 'خطا در دریافت گزارش VAT: ' + (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)