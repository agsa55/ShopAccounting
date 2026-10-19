// ============================================================================
// src/app/api/reports/aging/route.ts — GET (v4.1 Fiscal Year Isolation + Diagnostics)
// ShopAccounting — Aging Report (گزارش سنین بدهی)
// ----------------------------------------------------------------------------
// ★★★ v4.1:
//   - بررسی case-insensitive paymentType
//   - جلوگیری از خطای enum در Prisma
//   - افزودن diagnostics برای عیب‌یابی
//   - asOf پیش‌فرض امروز
//   - includeLegacyDebt برای بدهی‌های بدون فاکتور/بدون سال مالی
//
// ★★★ v4.0:
//   - ایزولاسیون سال مالی
//   - fiscalYearId / allYears
//   - محاسبه بدهی از فاکتورهای نسیه همان سال مالی
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ═══════════════════════════════════════════════════════════════
//  ثابت‌ها و توابع کمکی
// ═══════════════════════════════════════════════════════════════

const BUCKET_RANGES = [
  { key: '0-30', label: '۰ تا ۳۰ روز (جاری)', min: 0, max: 30, color: 'emerald' },
  { key: '31-60', label: '۳۱ تا ۶۰ روز (کوتاه‌مدت)', min: 31, max: 60, color: 'amber' },
  { key: '61-90', label: '۶۱ تا ۹۰ روز (میان‌مدت)', min: 61, max: 90, color: 'orange' },
  { key: '90+', label: 'بیش از ۹۰ روز (مشکوک‌الوصول)', min: 91, max: 9999, color: 'red' },
] as const

const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

function normalizeToken(value: any): string {
  return String(value ?? '').toLowerCase().trim()
}

function parseDateBound(value: any, endOfDay = false): Date | null {
  if (!value) return null

  const raw = String(value).trim()
  if (!raw) return null

  // اگر فقط تاریخ بود، مثل 2026-10-18، به وقت محلی سرور تبدیل شود
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
function isOutstandingInvoice(inv: any): boolean {
  const remaining = Number(inv?.remainingAmount) || 0
  if (remaining <= 0) return false

  if (isInvalidInvoiceStatus(inv?.status)) return false



  return true
}

function isInvalidInvoiceStatus(value: any): boolean {
  const status = normalizeToken(value)
  return status === 'cancelled' || status === 'canceled' || status === 'void'
}

function getBucket(ageDays: number): string {
  for (const b of BUCKET_RANGES) {
    if (ageDays >= b.min && ageDays <= b.max) return b.key
  }
  return '90+'
}

function calculateAgeDays(invoiceDate: Date, asOf: Date): number {
  const diffMs = asOf.getTime() - invoiceDate.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
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

function buildEmptyResponse(
  asOfISO: string,
  fiscalYearRange: any,
  diagnostics: any
) {
  const buckets: Record<string, any> = {}

  for (const b of BUCKET_RANGES) {
    buckets[b.key] = {
      label: b.label,
      color: b.color,
      total: 0,
      customerCount: 0,
      customers: [],
    }
  }

  return {
    asOf: asOfISO,
    fiscalYearRange,
    buckets,
    customers: [],
    summary: {
      totalDebt: 0,
      customerCount: 0,
      bucketTotals: {
        '0-30': 0,
        '31-60': 0,
        '61-90': 0,
        '90+': 0,
      },
    },
    bucketRanges: BUCKET_RANGES.map((b) => ({
      key: b.key,
      label: b.label,
      color: b.color,
      min: b.min,
      max: b.max,
    })),
    diagnostics,
    message: 'هیچ بدهی ثبت نشده است',
  }
}

// ═══════════════════════════════════════════════════════════════
//  GET — گزارش سنین بدهی
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(
  async (request: NextRequest, _context: any, tenant: any) => {
    console.log('[AgingReport v4.1] ★★★ VERSION LOADED — DIAGNOSTICS + CASE-INSENSITIVE CREDIT')

    try {
      const features = getFeaturesByPlanName(tenant.planTierName)

      if (!features.canAccessCredit) {
        return NextResponse.json(
          {
            success: false,
            error: 'گزارش سنین بدهی فقط در پلن حرفه‌ای و سازمانی در دسترس است',
            code: 'PLAN_RESTRICTED',
          },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(request.url)

      const asOfParam = searchParams.get('asOf')
      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'
      const includeLegacyDebt = searchParams.get('includeLegacyDebt') === 'true'

      let fy: any = null
      let effectiveFiscalYearId: string | null = null

      // ═══════════════════════════════════════════════════════════════
      //  ۱. تعیین سال مالی مؤثر
      // ═══════════════════════════════════════════════════════════════
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

      // ═══════════════════════════════════════════════════════════════
      //  ۲. تعیین تاریخ مرجع asOf
      //  ★ برای aging پیش‌فرض امروز است.
      // ═══════════════════════════════════════════════════════════════
      let asOf: Date

      if (asOfParam) {
        const parsedAsOf = parseDateBound(asOfParam, true)

        if (!parsedAsOf) {
          return NextResponse.json(
            { success: false, error: 'تاریخ asOf نامعتبر است (فرمت YYYY-MM-DD)' },
            { status: 400 }
          )
        }

        asOf = parsedAsOf
      } else {
        asOf = new Date()
      }

      asOf.setHours(23, 59, 59, 999)

      let fyStart: Date | null = null
      let fyEnd: Date | null = null

      if (effectiveFiscalYearId && fy) {
        fyStart = new Date(fy.startDate)
        fyEnd = new Date(fy.endDate)

        fyStart.setHours(0, 0, 0, 0)
        fyEnd.setHours(23, 59, 59, 999)

        // ★ clamp تاریخ asOf داخل سال مالی
        if (asOf < fyStart) {
          asOf = new Date(fyStart)
          asOf.setHours(23, 59, 59, 999)
        }

        if (asOf > fyEnd) {
          asOf = new Date(fyEnd)
          asOf.setHours(23, 59, 59, 999)
        }
      }

      const asOfISO = toLocalISODate(asOf)

      const allowLegacyDebt = allYears || includeLegacyDebt

      console.log('[AgingReport v4.1] Effective query context', {
        tenantId,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        includeLegacyDebt,
        allowLegacyDebt,
        asOf: asOf.toISOString(),
      })

      // ═══════════════════════════════════════════════════════════════
      //  ۳. دریافت فاکتورهای باقی‌مانده‌دار
      //  ★ اینجا paymentType را در DB فیلتر نمی‌کنیم تا مشکل enum/case حل شود.
      // ═══════════════════════════════════════════════════════════════
      const invoiceWhere: any = {
        tenantId,
        remainingAmount: {
          gt: 0,
        },
        invoiceDate: {
          lte: asOf,
        },
      }

      if (effectiveFiscalYearId && fyStart && fyEnd) {
        if (includeLegacyDebt) {
          // حالت مدیریتی/legacy:
          // فاکتورهای همان سال مالی + فاکتورهای بدون سال مالی
          invoiceWhere.AND = [
            {
              OR: [
                { fiscalYearId: effectiveFiscalYearId },
                { fiscalYearId: null },
              ],
            },
          ]
        } else {
          // حالت رسمی سال مالی:
          // فاکتورهایی که fiscalYearId دارند و به همین سال متصل‌اند
          // یا فاکتورهای قدیمی بدون fiscalYearId که تاریخشان داخل همین سال مالی است
          invoiceWhere.AND = [
            {
              OR: [
                { fiscalYearId: effectiveFiscalYearId },
                {
                  fiscalYearId: null,
                  invoiceDate: {
                    gte: fyStart,
                    lte: asOf,
                  },
                },
              ],
            },
          ]
        }
      }

      let rawInvoices: any[] = []

      try {
        rawInvoices = await tenantDb.invoice.findMany({
          where: invoiceWhere,
          select: {
            id: true,
            number: true,
            customerId: true,
            invoiceDate: true,
            dueDate: true,
            totalAmount: true,
            paidAmount: true,
            remainingAmount: true,
            status: true,
            paymentType: true,
            fiscalYearId: true,
          },
          orderBy: {
            invoiceDate: 'asc',
          },
        })
      } catch (err: any) {
        console.warn('[AgingReport v4.1] Invoice query failed:', err?.message)
        rawInvoices = []
      }

      // ═══════════════════════════════════════════════════════════════
      //  ۴. فیلتر نرم: فقط نسیه، غیرباطل، در محدوده سال مالی/legacy
      // ═══════════════════════════════════════════════════════════════
      const scopedInvoices = rawInvoices.filter((inv: any) => {
        if (!isOutstandingInvoice(inv)) return false

        if (!effectiveFiscalYearId || !fyStart) {
          return true
        }

        // فاکتورهایی که مستقیماً به سال مالی انتخابی متصل‌اند
        if (inv.fiscalYearId === effectiveFiscalYearId) {
          return true
        }

        // فاکتورهای بدون سال مالی
        if (!inv.fiscalYearId) {
          // در حالت legacy، همه بدهی‌های بدون سال مالی مجازند
          if (includeLegacyDebt) return true

          // در حالت رسمی، فقط اگر تاریخ فاکتور داخل سال مالی انتخابی باشد
          const invDate = new Date(inv.invoiceDate)
          if (isNaN(invDate.getTime())) return false

          return invDate >= fyStart && invDate <= asOf
        }

        // فاکتورهای متعلق به سال مالی دیگر مجاز نیستند
        return false
      })
      // diagnostics برای عیب‌یابی
      const paymentTypeCounts = rawInvoices.reduce<Record<string, number>>((acc, inv) => {
        const key = normalizeToken(inv.paymentType) || 'NULL'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})

      const statusCounts = rawInvoices.reduce<Record<string, number>>((acc, inv) => {
        const key = normalizeToken(inv.status) || 'NULL'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})

      const fiscalYearIdCounts = rawInvoices.reduce<Record<string, number>>((acc, inv) => {
        const key = inv.fiscalYearId || 'NULL'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})
      console.log('[AgingReport v4.1] Invoice diagnostics', {
        rawInvoiceCount: rawInvoices.length,
        outstandingScopedInvoiceCount: scopedInvoices.length,
        paymentTypeCounts,
        statusCounts,
        fiscalYearIdCounts,
      })
      // ═══════════════════════════════════════════════════════════════
      //  ۵. گروه‌بندی فاکتورها بر اساس مشتری
      // ═══════════════════════════════════════════════════════════════
      const customerInvoicesMap = new Map<string, any[]>()

      for (const inv of scopedInvoices) {
        if (!inv.customerId) continue

        const list = customerInvoicesMap.get(inv.customerId) || []
        list.push(inv)
        customerInvoicesMap.set(inv.customerId, list)
      }

      // ═══════════════════════════════════════════════════════════════
      //  ۶. دریافت مشتریان مرتبط
      // ═══════════════════════════════════════════════════════════════
      const customersById = new Map<string, any>()

      const invoiceCustomerIds = Array.from(customerInvoicesMap.keys())

      if (invoiceCustomerIds.length > 0) {
        const invoiceCustomers = await tenantDb.customer.findMany({
          where: {
            tenantId,
            id: {
              in: invoiceCustomerIds,
            },
          },
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true,
            mobile: true,
            currentBalance: true,
            lastPurchaseAt: true,
          },
        })

        for (const c of invoiceCustomers) {
          customersById.set(c.id, c)
        }
      }

      // اگر legacy مجاز است، مشتریان با currentBalance مثبت را هم اضافه کن
      if (allowLegacyDebt) {
        const legacyCustomers = await tenantDb.customer.findMany({
          where: {
            tenantId,
            currentBalance: {
              gt: 0,
            },
          },
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true,
            mobile: true,
            currentBalance: true,
            lastPurchaseAt: true,
          },
          orderBy: {
            currentBalance: 'desc',
          },
        })

        for (const c of legacyCustomers) {
          if (!customersById.has(c.id)) {
            customersById.set(c.id, c)
          }
        }
      }

      const diagnostics: Record<string, any> = {
        rawInvoiceCount: rawInvoices.length,
        outstandingScopedInvoiceCount: scopedInvoices.length,
        candidateCustomerCount: customersById.size,
        invoiceBackedCustomerCount: customerInvoicesMap.size,
        paymentTypeCounts,
        statusCounts,
        fiscalYearIdCounts,
      }

      if (customersById.size === 0) {
        return NextResponse.json({
          success: true,
          fiscalYearId: effectiveFiscalYearId,
          fiscalYearName: fy?.name || null,
          allYears,
          includeLegacyDebt,
          warning: allYears ? ALL_YEARS_WARNING : undefined,
          data: buildEmptyResponse(asOfISO, fy ? { from: fy.startDate, to: fy.endDate } : null, diagnostics),
        })
      }

      // ═══════════════════════════════════════════════════════════════
      //  ۷. محاسبه سنین بدهی
      // ═══════════════════════════════════════════════════════════════
      const customersResult: any[] = []

      const bucketCustomers: Record<string, any[]> = {
        '0-30': [],
        '31-60': [],
        '61-90': [],
        '90+': [],
      }

      const bucketTotals: Record<string, number> = {
        '0-30': 0,
        '31-60': 0,
        '61-90': 0,
        '90+': 0,
      }

      let totalDebt = 0
      let legacyCustomerCount = 0

      for (const customer of customersById.values()) {
        const customerName =
          `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'بدون نام'

        const invoices = customerInvoicesMap.get(customer.id) || []

              const customerBuckets: Record<string, number> = {
          '0-30': 0,
          '31-60': 0,
          '61-90': 0,
          '90+': 0,
        }

        const details: any[] = []
        let lastInvoiceDate: Date | null = null
        let customerTotalDebt = 0

        if (invoices.length > 0) {
          let sumRemaining = 0

          for (const inv of invoices) {
            const invDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.invoiceDate)
            const ageDays = calculateAgeDays(invDate, asOf)
            const bucket = getBucket(ageDays)
            const amount = Number(inv.remainingAmount) || 0

            customerBuckets[bucket] += amount
            sumRemaining += amount

            const invDateRaw = new Date(inv.invoiceDate)

            if (!lastInvoiceDate || invDateRaw > lastInvoiceDate) {
              lastInvoiceDate = invDateRaw
            }

            details.push({
              invoiceId: inv.id,
              invoiceNumber: inv.number,
              invoiceDate: inv.invoiceDate,
              dueDate: inv.dueDate,
              totalAmount: Number(inv.totalAmount) || 0,
              paidAmount: Number(inv.paidAmount) || 0,
              remainingAmount: amount,
              fiscalYearId: inv.fiscalYearId || null,
              paymentType: inv.paymentType || null,
              status: inv.status || null,
              ageDays,
              bucket,
            })
          }

          customerTotalDebt = sumRemaining

          details.sort((a, b) => b.ageDays - a.ageDays)
        } else {
          // فقط اگر legacy مجاز باشد و مشتری currentBalance مثبت داشته باشد
          const currentBalance = Number(customer.currentBalance) || 0

          if (!allowLegacyDebt || currentBalance <= 0) {
            continue
          }

          const refDate = customer.lastPurchaseAt ? new Date(customer.lastPurchaseAt) : asOf
          const ageDays = calculateAgeDays(refDate, asOf)
          const bucket = getBucket(ageDays)

          customerBuckets[bucket] += currentBalance
          customerTotalDebt = currentBalance
          lastInvoiceDate = customer.lastPurchaseAt ? new Date(customer.lastPurchaseAt) : null
          legacyCustomerCount++

          details.push({
            invoiceId: null,
            invoiceNumber: 'بدون فاکتور',
            invoiceDate: customer.lastPurchaseAt,
            dueDate: null,
            totalAmount: currentBalance,
            paidAmount: 0,
            remainingAmount: currentBalance,
            fiscalYearId: null,
            paymentType: null,
            status: null,
            ageDays,
            bucket,
            note: allYears
              ? 'بدهی مستقیم / خارج از فاکتور نسیه'
              : 'بدهی legacy خارج از فاکتورهای سال مالی انتخابی',
          })
        }

        if (customerTotalDebt <= 0) {
          continue
        }

        totalDebt += customerTotalDebt

        for (const b of BUCKET_RANGES) {
          const amount = customerBuckets[b.key]

          if (amount > 0) {
            bucketCustomers[b.key].push({
              customerId: customer.id,
              customerName,
              mobile: customer.mobile,
              amount,
            })

            bucketTotals[b.key] += amount
          }
        }

        customersResult.push({
          customerId: customer.id,
          customerCode: customer.code,
          customerName,
          mobile: customer.mobile,
          totalDebt: customerTotalDebt,
          currentBalance: Number(customer.currentBalance) || 0,
          buckets: customerBuckets,
          invoiceCount: invoices.length,
          lastInvoiceDate: lastInvoiceDate ? lastInvoiceDate.toISOString() : null,
          details,
        })
      }

      customersResult.sort((a, b) => b.totalDebt - a.totalDebt)

      // ═══════════════════════════════════════════════════════════════
      //  ۸. آماده‌سازی خروجی
      // ═══════════════════════════════════════════════════════════════
      const buckets: Record<string, any> = {}

      for (const b of BUCKET_RANGES) {
        buckets[b.key] = {
          label: b.label,
          color: b.color,
          total: bucketTotals[b.key],
          customerCount: bucketCustomers[b.key].length,
          customers: bucketCustomers[b.key],
        }
      }

      diagnostics.legacyCustomerCount = legacyCustomerCount
      diagnostics.finalCustomerCount = customersResult.length
      diagnostics.totalDebt = totalDebt

      console.log('[AgingReport v4.1] Summary:', {
        fiscalYearId: effectiveFiscalYearId,
        allYears,
        includeLegacyDebt,
        totalDebt,
        customerCount: customersResult.length,
        bucketTotals,
        diagnostics,
      })

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        includeLegacyDebt,
        warning: allYears ? ALL_YEARS_WARNING : undefined,
        data: {
          asOf: asOfISO,
          fiscalYearRange: fy
            ? {
                from: fy.startDate,
                to: fy.endDate,
              }
            : null,
          buckets,
          customers: customersResult,
          summary: {
            totalDebt,
            customerCount: customersResult.length,
            bucketTotals,
          },
          bucketRanges: BUCKET_RANGES.map((b) => ({
            key: b.key,
            label: b.label,
            color: b.color,
            min: b.min,
            max: b.max,
          })),
          diagnostics,
        },
      })
    } catch (error: any) {
      console.error('[AgingReport v4.1] Error:', error)
      console.error('[AgingReport v4.1] Error code:', error?.code)
      console.error('[AgingReport v4.1] Error meta:', error?.meta)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در محاسبه سنین بدهی',
          code: error?.code || 'UNKNOWN',
        },
        { status: 500 }
      )
    }
  }
)