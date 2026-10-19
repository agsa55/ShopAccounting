// ============================================================================
// src/app/api/dashboard/route.ts — GET /api/dashboard (v2.0 Fiscal Year Isolation)
// ShopAccounting — Legacy Dashboard API
// ----------------------------------------------------------------------------
// ★★★ v2.0:
//   - ایزولاسیون سال مالی
//   - استفاده از withTenantAndPermission
//   - fiscalYearId / allYears
//   - clamp بازه‌های زمانی داخل سال مالی
//   - حذف فاکتورهای cancelled
//   - کسر برگشتی‌ها از فروش خالص
//   - مانده دریافتنی سال‌محور
//   - diagnostics و warning مدیریتی
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALL_YEARS_WARNING =
  'این داشبورد همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

const INVALID_INVOICE_STATUS_FILTER = {
  notIn: ['cancelled', 'Cancelled'],
}

const SALE_INVOICE_TYPE_FILTER = {
  notIn: ['sale_return', 'purchase_return'],
}

const RETURN_INVOICE_TYPE_FILTER = {
  in: ['sale_return', 'purchase_return'],
}

function safeNum(val: any): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

function normalizeToken(value: any): string {
  return String(value ?? '').toLowerCase().trim()
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
  async (request: NextRequest, _context: any, tenant: any) => {
    console.log('[Dashboard v2.0] ★★★ VERSION LOADED — FISCAL YEAR ISOLATION')

    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(request.url)

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'

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

      // ─── بازه‌های تاریخی ───────────────────────────────────
      const today = new Date()

      const todayStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      )

      const todayEnd = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        23,
        59,
        59,
        999
      )

      const monthStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      )

      const monthEnd = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      )

      const sevenDaysAgo = new Date(today)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
      sevenDaysAgo.setHours(0, 0, 0, 0)

      function clampRange(from: Date, to: Date) {
        if (!fy) {
          return { from, to, valid: true }
        }

        const fyStart = new Date(fy.startDate)
        const fyEnd = new Date(fy.endDate)

        fyStart.setHours(0, 0, 0, 0)
        fyEnd.setHours(23, 59, 59, 999)

        const f = new Date(Math.max(from.getTime(), fyStart.getTime()))
        const t = new Date(Math.min(to.getTime(), fyEnd.getTime()))

        f.setHours(0, 0, 0, 0)
        t.setHours(23, 59, 59, 999)

        return {
          from: f,
          to: t,
          valid: f.getTime() <= t.getTime(),
        }
      }

      const todayRange = clampRange(todayStart, todayEnd)
      const monthRange = clampRange(monthStart, monthEnd)
      const last7Range = clampRange(sevenDaysAgo, todayEnd)

      function baseInvoiceWhere(extra: any = {}): any {
        const where: any = {
          tenantId,
          ...extra,
        }

        if (effectiveFiscalYearId) {
          where.fiscalYearId = effectiveFiscalYearId
        }

        return where
      }

      // ─── فروش امروز ────────────────────────────────────────
      let todaySales = 0
      let todayInvoiceCount = 0
      let todayCash = 0
      let todayOnline = 0

      if (todayRange.valid) {
        try {
          const todayInvoices = await tenantDb.invoice.findMany({
            where: baseInvoiceWhere({
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: SALE_INVOICE_TYPE_FILTER,
              invoiceDate: {
                gte: todayRange.from,
                lte: todayRange.to,
              },
            }),
            select: {
              totalAmount: true,
              paidAmount: true,
              paymentType: true,
            },
          })

          todaySales = todayInvoices.reduce(
            (sum: number, inv: any) => sum + safeNum(inv.totalAmount),
            0
          )

          todayInvoiceCount = todayInvoices.length

          for (const inv of todayInvoices) {
            const pt = normalizeToken(inv.paymentType)
            const paid = safeNum(inv.paidAmount)

            if (pt === 'cash') {
              todayCash += paid
            }

            if (pt === 'card' || pt === 'online' || pt === 'mixed') {
              todayOnline += paid
            }
          }
        } catch (err: any) {
          console.warn('[Dashboard v2.0] Today sales query error:', err?.message)
        }
      }

      // ─── فروش ماهانه ───────────────────────────────────────
      let monthSales = 0
      let monthInvoiceCount = 0

      if (monthRange.valid) {
        try {
          const salesData: any = await tenantDb.invoice.aggregate({
            where: baseInvoiceWhere({
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: SALE_INVOICE_TYPE_FILTER,
              invoiceDate: {
                gte: monthRange.from,
                lte: monthRange.to,
              },
            }),
            _sum: { totalAmount: true },
            _count: true,
          })

          const returnsData: any = await tenantDb.invoice.aggregate({
            where: baseInvoiceWhere({
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: RETURN_INVOICE_TYPE_FILTER,
              invoiceDate: {
                gte: monthRange.from,
                lte: monthRange.to,
              },
            }),
            _sum: { totalAmount: true },
          })

          const grossSales = safeNum(salesData?._sum?.totalAmount)
          const returns = safeNum(returnsData?._sum?.totalAmount)

          monthSales = grossSales - returns
          monthInvoiceCount = safeNum(salesData?._count)
        } catch (err: any) {
          console.warn('[Dashboard v2.0] Monthly sales query error:', err?.message)
        }
      }

      // ─── تعداد مشتریان ─────────────────────────────────────
      let totalCustomers = 0

      try {
        totalCustomers = await tenantDb.customer.count({
          where: { tenantId },
        })
      } catch {
        /* ignore */
      }

      // ─── موجودی کم و ناموجود ───────────────────────────────
      let lowStockProducts = 0
      let outOfStockProducts = 0
      let lowStockProductList: any[] = []

      try {
        const allProducts = await tenantDb.product.findMany({
          where: {
            tenantId,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            code: true,
            currentStock: true,
            minStock: true,
            salePrice: true,
          },
        })

        const lowItems = allProducts.filter((p: any) => {
          const cs = safeNum(p.currentStock)
          const ms = safeNum(p.minStock) || 5
          return cs > 0 && cs < ms
        })

        const outItems = allProducts.filter((p: any) => safeNum(p.currentStock) <= 0)

        lowStockProducts = lowItems.length
        outOfStockProducts = outItems.length
        lowStockProductList = [...lowItems.slice(0, 5), ...outItems.slice(0, 3)]
      } catch {
        /* ignore */
      }

      // ─── طلب‌کاری / مانده دریافتنی ─────────────────────────
        // ─── طلب‌کاری / مانده دریافتنی ─────────────────────────
      // ★ استاندارد:
      // totalReceivable = همه طلب‌های باز از همه سنوات
      // totalReceivableCurrentFiscalYear = فقط طلب‌های باز همان سال مالی انتخابی
      let totalReceivable = 0
      let totalReceivableCurrentFiscalYear = 0

      try {
        const allOpenReceivableAgg: any = await tenantDb.invoice.aggregate({
          where: {
            tenantId,
            status: INVALID_INVOICE_STATUS_FILTER,
            invoiceType: SALE_INVOICE_TYPE_FILTER,
            remainingAmount: { gt: 0 },
          },
          _sum: { remainingAmount: true },
        })

        totalReceivable = safeNum(allOpenReceivableAgg?._sum?.remainingAmount)

        if (effectiveFiscalYearId) {
          const currentFyReceivableAgg: any = await tenantDb.invoice.aggregate({
            where: baseInvoiceWhere({
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: SALE_INVOICE_TYPE_FILTER,
              remainingAmount: { gt: 0 },
            }),
            _sum: { remainingAmount: true },
          })

          totalReceivableCurrentFiscalYear = safeNum(
            currentFyReceivableAgg?._sum?.remainingAmount
          )
        } else {
          totalReceivableCurrentFiscalYear = totalReceivable
        }
      } catch {
        /* ignore */
      }

      // ─── آخرین فاکتورها ────────────────────────────────────
      let recentInvoices: any[] = []

      try {
        const invoices = await tenantDb.invoice.findMany({
          where: baseInvoiceWhere({
            status: INVALID_INVOICE_STATUS_FILTER,
            invoiceType: SALE_INVOICE_TYPE_FILTER,
          }),
          take: 5,
          orderBy: {
            invoiceDate: 'desc',
          },
          include: {
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                mobile: true,
              },
            },
          },
        })

        recentInvoices = invoices.map((inv: any) => ({
          id: inv.id,
          number: inv.number,
          totalAmount: safeNum(inv.totalAmount),
          paidAmount: safeNum(inv.paidAmount),
          remainingAmount: safeNum(inv.remainingAmount),
          status: inv.status,
          paymentType: inv.paymentType,
          invoiceDate: inv.invoiceDate,
          customerName: inv.customer
            ? `${inv.customer.firstName || ''} ${inv.customer.lastName || ''}`.trim()
            : null,
        }))
      } catch (err: any) {
        console.warn('[Dashboard v2.0] Recent invoices query error:', err?.message)
      }

      // ─── فروش روزانه ۷ روز اخیر ───────────────────────────
      let dailySales: { date: string; sales: number }[] = []

      try {
        const dailySalesMap = new Map<string, number>()

        for (let i = 6; i >= 0; i--) {
          const d = new Date(today)
          d.setDate(d.getDate() - i)
          const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(
            d.getDate()
          ).padStart(2, '0')}`
          dailySalesMap.set(key, 0)
        }

        if (last7Range.valid) {
          const lastWeekInvoices = await tenantDb.invoice.findMany({
            where: baseInvoiceWhere({
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: SALE_INVOICE_TYPE_FILTER,
              invoiceDate: {
                gte: last7Range.from,
                lte: last7Range.to,
              },
            }),
            select: {
              invoiceDate: true,
              totalAmount: true,
            },
          })

          for (const inv of lastWeekInvoices) {
            const d = new Date(inv.invoiceDate)
            const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(
              d.getDate()
            ).padStart(2, '0')}`

            if (dailySalesMap.has(key)) {
              dailySalesMap.set(
                key,
                (dailySalesMap.get(key) || 0) + safeNum(inv.totalAmount)
              )
            }
          }
        }

        dailySales = Array.from(dailySalesMap.entries()).map(([date, sales]) => ({
          date,
          sales: Math.round(sales),
        }))
      } catch (err: any) {
        console.warn('[Dashboard v2.0] Daily sales query error:', err?.message)
      }

      // ─── فروش بر اساس دسته‌بندی ────────────────────────────
      let categorySales: { name: string; value: number }[] = []

      try {
        if (monthRange.valid) {
          const monthInvoicesWithItems = await tenantDb.invoice.findMany({
            where: baseInvoiceWhere({
              status: INVALID_INVOICE_STATUS_FILTER,
              invoiceType: SALE_INVOICE_TYPE_FILTER,
              invoiceDate: {
                gte: monthRange.from,
                lte: monthRange.to,
              },
            }),
            include: {
              items: {
                include: {
                  product: {
                    include: {
                      category: {
                        select: {
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          })

          const categorySalesMap = new Map<string, number>()

          for (const inv of monthInvoicesWithItems) {
            for (const item of inv.items || []) {
              const catName = (item as any).product?.category?.name || 'سایر'
              categorySalesMap.set(
                catName,
                (categorySalesMap.get(catName) || 0) + safeNum(item.lineTotal)
              )
            }
          }

          categorySales = Array.from(categorySalesMap.entries())
            .map(([name, value]) => ({
              name,
              value: Math.round(value),
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)
        }
      } catch (err: any) {
        console.warn('[Dashboard v2.0] Category sales query error:', err?.message)
      }

      console.log('[Dashboard v2.0] Summary', {
        tenantId,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        todaySales,
        todayInvoiceCount,
        monthSales,
        monthInvoiceCount,
        totalReceivable,
      })

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        warning: allYears ? ALL_YEARS_WARNING : undefined,
        data: {
          todaySales,
          todayInvoices: todayInvoiceCount,
          todayCash,
          todayOnline,
          todayPOS: 0,
          monthSales,
          monthInvoices: monthInvoiceCount,
          lowStockProducts,
          outOfStockProducts,
              totalCustomers,
          totalReceivable,
          totalReceivableCurrentFiscalYear,
          recentInvoices,
          lowStockProductList,
          dailySales,
          categorySales,
          fiscalYearRange: fy
            ? {
                from: fy.startDate,
                to: fy.endDate,
              }
            : null,
          diagnostics: {
            fiscalYearApplied: Boolean(effectiveFiscalYearId && !allYears),
            requestedFiscalYearId: fiscalYearIdParam || null,
            allYearsRequested: allYears,
            todayRangeValid: todayRange.valid,
            monthRangeValid: monthRange.valid,
            last7RangeValid: last7Range.valid,
          },
        },
      })
    } catch (error: any) {
      console.error('[Dashboard v2.0] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: 'خطای داخلی سرور',
          details: error?.message,
        },
        { status: 500 }
      )
    }
  }
)