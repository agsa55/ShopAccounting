// ============================================================================
// src/app/api/customers/[id]/statement/route.ts — v2.0 Cross-Year Safe Statement
// ShopAccounting — Customer Statement / گردش حساب مشتری
// ----------------------------------------------------------------------------
// ★ v2.0:
//   - محاسبه مانده ابتدای دوره
//   - محاسبه مانده پایان دوره
//   - نمایش اسناد باز سنوات قبل
//   - پشتیبانی از allYears
//   - جلوگیری از پنهان شدن بدهی مشتری با تغییر سال مالی
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALL_YEARS_WARNING =
  'این گردش حساب همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

const INVALID_INVOICE_STATUSES = [
  'cancelled',
  'Canceled',
  'Cancelled',
  'void',
  'Void',
  'draft',
  'Draft',
]

const MAX_INVOICES = 10000
const MAX_PAYMENTS = 20000

function safeNum(value: any): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeToken(value: any): string {
  return String(value ?? '').toLowerCase().trim()
}

function isReturnInvoiceType(value: any): boolean {
  const t = normalizeToken(value)
  return (
    t === 'sale_return' ||
    t === 'return' ||
    t === 'return_sale' ||
    t.includes('return') ||
    t.includes('برگشتی')
  )
}

function toDateOrNull(value: any): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function fiscalBounds(fy: any) {
  const start = new Date(fy.startDate)
  const end = new Date(fy.endDate)

  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

async function resolveEffectiveFiscalYear(
  tenantDb: any,
  tenantId: string,
  fiscalYearIdParam: string | null
) {
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

function sumAmounts(entries: any[]): number {
  return entries.reduce((sum, entry) => sum + safeNum(entry.amount), 0)
}

export const GET = withTenantAndPermission('pos')(
  async (req: NextRequest, context: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { id: customerId } = await context.params

      if (!customerId) {
        return NextResponse.json(
          { success: false, error: 'شناسه مشتری الزامی است.' },
          { status: 400 }
        )
      }

      const customer = await tenantDb.customer.findFirst({
        where: {
          id: customerId,
          tenantId,
        },
        select: {
          id: true,
          code: true,
          firstName: true,
          lastName: true,
          mobile: true,
          nationalCode: true,
          address: true,
          currentBalance: true,
          creditLimit: true,
          isBlacklisted: true,
          createdAt: true,
        },
      })

      if (!customer) {
        return NextResponse.json(
          {
            success: false,
            error: 'مشتری یافت نشد یا به این فروشگاه تعلق ندارد.',
            code: 'CUSTOMER_NOT_FOUND',
          },
          { status: 404 }
        )
      }

      const { searchParams } = new URL(req.url)

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'

      const fromParam = searchParams.get('from')
      const toParam = searchParams.get('to')

      let requestedFrom = fromParam ? new Date(`${fromParam}T00:00:00`) : null
      let requestedTo = toParam ? new Date(`${toParam}T23:59:59.999`) : null

      if (requestedFrom && Number.isNaN(requestedFrom.getTime())) {
        return NextResponse.json(
          { success: false, error: 'تاریخ from نامعتبر است.' },
          { status: 400 }
        )
      }

      if (requestedTo && Number.isNaN(requestedTo.getTime())) {
        return NextResponse.json(
          { success: false, error: 'تاریخ to نامعتبر است.' },
          { status: 400 }
        )
      }

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

      // ─── خواندن همه فاکتورهای معتبر مشتری از همه سنوات ───────
      const allInvoices = await tenantDb.invoice.findMany({
        where: {
          tenantId,
          customerId,
          status: {
            notIn: INVALID_INVOICE_STATUSES,
          },
        },
        select: {
          id: true,
          number: true,
          invoiceDate: true,
          createdAt: true,
          invoiceType: true,
          status: true,
          paymentType: true,
          totalAmount: true,
          paidAmount: true,
          remainingAmount: true,
          discountAmount: true,
          taxAmount: true,
          description: true,
          fiscalYearId: true,
        },
        orderBy: {
          invoiceDate: 'asc',
        },
        take: MAX_INVOICES,
      })

      const invoiceIds = allInvoices.map((inv: any) => inv.id)

      // ─── خواندن همه پرداخت‌های مرتبط ─────────────────────────
      let allPayments: any[] = []

      if (invoiceIds.length > 0) {
        allPayments = await tenantDb.invoicePayment.findMany({
          where: {
            tenantId,
            invoiceId: {
              in: invoiceIds,
            },
          },
          select: {
            id: true,
            invoiceId: true,
            amount: true,
            paidAt: true,
            paymentType: true,
            paymentRef: true,
          },
          orderBy: {
            paidAt: 'asc',
          },
          take: MAX_PAYMENTS,
        })
      }

      const getInvoiceDate = (inv: any): Date => {
        return toDateOrNull(inv.invoiceDate) || toDateOrNull(inv.createdAt) || new Date(0)
      }
            const invoiceDateById = new Map<string, Date>(
        allInvoices.map((inv: any) => [inv.id, getInvoiceDate(inv)])
      )
           const getPaymentDate = (payment: any): Date => {
        return (
          toDateOrNull(payment.paidAt) ||
          invoiceDateById.get(payment.invoiceId) ||
          new Date(0)
        )
      }

      // ─── ساخت دفتر کل کامل از همه سنوات ──────────────────────
      const fullLedger: any[] = [
        ...allInvoices.map((inv: any) => {
          const isReturn = isReturnInvoiceType(inv.invoiceType)
          const amount = isReturn ? -safeNum(inv.totalAmount) : safeNum(inv.totalAmount)

          return {
            id: `invoice-${inv.id}`,
            date: getInvoiceDate(inv),
            type: 'invoice',
            reference: inv.number,
            description: isReturn ? 'برگشت فروش' : 'فاکتور',
            amount,
            invoiceType: inv.invoiceType,
            status: inv.status,
            paymentType: inv.paymentType,
            remainingAmount: safeNum(inv.remainingAmount),
          }
        }),
        ...allPayments.map((payment: any) => ({
          id: `payment-${payment.id}`,
          date: getPaymentDate(payment),
          type: 'payment',
          reference: payment.paymentRef || payment.id,
          description: 'پرداخت دریافتی',
          amount: -safeNum(payment.amount),
          paymentType: payment.paymentType,
        })),
      ].sort((a, b) => a.date.getTime() - b.date.getTime())

      // ─── تعیین بازه زمانی گزارش ──────────────────────────────
      let rangeFrom: Date | null = null
      let rangeTo: Date | null = null
      let dateRangeValid = true

      if (allYears) {
        rangeFrom = requestedFrom || (fullLedger.length ? fullLedger[0].date : null)
        rangeTo = requestedTo || (fullLedger.length ? fullLedger[fullLedger.length - 1].date : null)
      } else {
        const bounds = fiscalBounds(fy)

        const baseFrom = requestedFrom
          ? new Date(Math.max(requestedFrom.getTime(), bounds.start.getTime()))
          : new Date(bounds.start)

        const baseTo = requestedTo
          ? new Date(Math.min(requestedTo.getTime(), bounds.end.getTime()))
          : new Date(bounds.end)

        baseFrom.setHours(0, 0, 0, 0)
        baseTo.setHours(23, 59, 59, 999)

        rangeFrom = baseFrom
        rangeTo = baseTo
      }

      if (rangeFrom && rangeTo && rangeFrom.getTime() > rangeTo.getTime()) {
        dateRangeValid = false
      }

      const fromTime = rangeFrom ? rangeFrom.getTime() : null
      const toTime = rangeTo ? rangeTo.getTime() : null

      // ─── مانده ابتدای دوره ───────────────────────────────────
      const openingEntries =
        fromTime !== null
          ? fullLedger.filter((entry) => entry.date.getTime() < fromTime)
          : []

      const openingBalance = sumAmounts(openingEntries)

      // ─── تراکنش‌های دوره ─────────────────────────────────────
      const periodEntries = dateRangeValid
        ? fullLedger.filter((entry) => {
            const t = entry.date.getTime()
            const afterFrom = fromTime === null || t >= fromTime
            const beforeTo = toTime === null || t <= toTime
            return afterFrom && beforeTo
          })
        : []

      const periodNet = sumAmounts(periodEntries)
      const closingBalance = openingBalance + periodNet

      // ─── جمع‌های دوره ────────────────────────────────────────
      const periodInvoiceEntries = periodEntries.filter((entry) => entry.type === 'invoice')
      const periodPaymentEntries = periodEntries.filter((entry) => entry.type === 'payment')

      const grossPurchases = periodInvoiceEntries
        .filter((entry) => safeNum(entry.amount) > 0)
        .reduce((sum, entry) => sum + safeNum(entry.amount), 0)

      const returns = periodInvoiceEntries
        .filter((entry) => safeNum(entry.amount) < 0)
        .reduce((sum, entry) => sum + Math.abs(safeNum(entry.amount)), 0)

      const netPurchases = grossPurchases - returns

      const paymentsReceived = periodPaymentEntries.reduce(
        (sum, entry) => sum + Math.abs(safeNum(entry.amount)),
        0
      )

      // ─── کل مانده باز از همه سنوات ───────────────────────────
      const outstandingFromInvoices = allInvoices.reduce(
        (sum: number, inv: any) => sum + Math.max(0, safeNum(inv.remainingAmount)),
        0
      )

      const outstandingAllYears =
        outstandingFromInvoices > 0
          ? outstandingFromInvoices
          : Math.max(0, safeNum(customer.currentBalance))

      // ─── اسناد باز سنوات قبل ─────────────────────────────────
      const priorOpenInvoices =
        fromTime !== null
          ? allInvoices
              .filter((inv: any) => {
                const invTime = getInvoiceDate(inv).getTime()
                return invTime < fromTime && safeNum(inv.remainingAmount) > 0
              })
              .map((inv: any) => ({
                id: inv.id,
                number: inv.number,
                invoiceDate: inv.invoiceDate || inv.createdAt,
                totalAmount: safeNum(inv.totalAmount),
                paidAmount: safeNum(inv.paidAmount),
                remainingAmount: safeNum(inv.remainingAmount),
                paymentType: inv.paymentType,
                status: inv.status,
              }))
          : []

      // ─── فاکتورها و پرداخت‌های دوره برای خروجی سازگار ────────
      const periodInvoices = allInvoices.filter((inv: any) => {
        const t = getInvoiceDate(inv).getTime()
        const afterFrom = fromTime === null || t >= fromTime
        const beforeTo = toTime === null || t <= toTime
        return afterFrom && beforeTo
      })

      const periodPayments = allPayments.filter((payment: any) => {
        const t = getPaymentDate(payment).getTime()
        const afterFrom = fromTime === null || t >= fromTime
        const beforeTo = toTime === null || t <= toTime
        return afterFrom && beforeTo
      })

      // ─── دفتر کل دوره با مانده yürüyen ───────────────────────
      const ledger = periodEntries.map((entry) => ({ ...entry }))

      let running = openingBalance
      for (const entry of ledger) {
        running += safeNum(entry.amount)
        entry.periodRunningBalance = running
      }

      console.log('[CustomerStatement v2.0] Summary', {
        tenantId,
        customerId,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        period: {
          from: rangeFrom?.toISOString() || null,
          to: rangeTo?.toISOString() || null,
        },
        openingBalance,
        closingBalance,
        periodNet,
        outstandingAllYears,
        invoiceCount: allInvoices.length,
        paymentCount: allPayments.length,
        periodInvoiceCount: periodInvoices.length,
        periodPaymentCount: periodPayments.length,
        priorOpenInvoiceCount: priorOpenInvoices.length,
      })

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        warning: allYears ? ALL_YEARS_WARNING : undefined,
        data: {
          customer,
          period: {
            from: rangeFrom,
            to: rangeTo,
          },
          openingBalance,
          closingBalance,
          periodNet,
          outstandingAllYears,
          priorOpenInvoices,
          totals: {
            grossPurchases,
            returns,
            netPurchases,
            paymentsReceived,
            invoiceOutstanding: outstandingAllYears,
            periodNet,
          },
          ledger,
          invoices: periodInvoices,
          payments: periodPayments,
          diagnostics: {
            fiscalYearApplied: Boolean(effectiveFiscalYearId && !allYears),
            requestedFiscalYearId: fiscalYearIdParam || null,
            allYearsRequested: allYears,
            dateRangeValid,
            invoiceCount: allInvoices.length,
            paymentCount: allPayments.length,
            periodInvoiceCount: periodInvoices.length,
            periodPaymentCount: periodPayments.length,
            priorOpenInvoiceCount: priorOpenInvoices.length,
            truncatedInvoices: allInvoices.length >= MAX_INVOICES,
            truncatedPayments: allPayments.length >= MAX_PAYMENTS,
            scopeMethod:
              'date-based full ledger with opening balance and prior open invoices',
          },
        },
      })
    } catch (error: any) {
      console.error('[CustomerStatement v2.0] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error:
            'خطا در دریافت گردش حساب مشتری: ' + (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)