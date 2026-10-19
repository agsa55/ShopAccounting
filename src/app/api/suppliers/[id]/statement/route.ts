// ============================================================================
// src/app/api/suppliers/[id]/statement/route.ts — v2.0 Cross-Year Safe Supplier Statement
// ShopAccounting — Supplier Statement / گردش حساب تامین‌کننده
// ----------------------------------------------------------------------------
// ★ v2.0:
//   - محاسبه مانده ابتدای دوره
//   - محاسبه مانده پایان دوره
//   - نمایش اسناد باز سنوات قبل
//   - پشتیبانی از allYears
//   - جلوگیری از پنهان شدن بدهی تامین‌کننده با تغییر سال مالی
//   - تلاش برای خواندن جدول پرداخت جداگانه در صورت وجود
//   - fallback به paidAmount روی فاکتور در صورت نبود جدول پرداخت
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
    t === 'purchase_return' ||
    t === 'return' ||
    t === 'return_purchase' ||
    t.includes('return') ||
    t.includes('برگشتی') ||
    t.includes('مرجوعی')
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

async function tryFindMany(model: any, wheres: any[]): Promise<any[]> {
  if (!model || typeof model.findMany !== 'function') return []

  const collected: any[] = []

  for (const where of wheres) {
    try {
      const rows = await model.findMany({ where })
      if (Array.isArray(rows)) {
        collected.push(...rows)
      }
    } catch {
      // این مدل یا این فیلد وجود ندارد؛ ادامه بده
    }
  }

  return collected
}

function normalizePaymentRow(row: any, sourceModelName: string): any | null {
  if (!row) return null

  const id = row.id ?? row.paymentId ?? null
  if (!id) return null

  const invoiceId =
    row.purchaseInvoiceId ??
    row.invoiceId ??
    row.purchaseInvoice?.id ??
    row.invoice?.id ??
    null

  const amount = safeNum(
    row.amount ??
      row.paymentAmount ??
      row.paidAmount ??
      row.totalAmount ??
      0
  )

  if (amount === 0) return null

  const date =
    row.paidAt ??
    row.paymentDate ??
    row.transactionDate ??
    row.createdAt ??
    null

  const paymentType =
    row.paymentType ??
    row.paymentMethod ??
    row.method ??
    row.type ??
    null

  const paymentRef =
    row.paymentRef ??
    row.reference ??
    row.trackingCode ??
    row.checkNumber ??
    null

  return {
    id: `${sourceModelName}:${id}`,
    rawId: id,
    invoiceId,
    amount,
    date,
    paymentType,
    paymentRef,
    source: sourceModelName,
  }
}

export const GET = withTenantAndPermission('pos')(
  async (req: NextRequest, context: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { id: supplierId } = await context.params

      if (!supplierId) {
        return NextResponse.json(
          { success: false, error: 'شناسه تامین‌کننده الزامی است.' },
          { status: 400 }
        )
      }

      const supplier = await tenantDb.supplier.findFirst({
        where: {
          id: supplierId,
          tenantId,
        },
        select: {
          id: true,
          code: true,
          name: true,
          mobile: true,
          nationalCode: true,
          address: true,
          currentBalance: true,
          creditLimit: true,
          personType: true,
          companyName: true,
          createdAt: true,
        },
      })

      if (!supplier) {
        return NextResponse.json(
          {
            success: false,
            error: 'تامین‌کننده یافت نشد یا به این فروشگاه تعلق ندارد.',
            code: 'SUPPLIER_NOT_FOUND',
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

      // ─── تعیین بازه زمانی گزارش ─────────────────────────────
      let rangeFrom: Date | null = null
      let rangeTo: Date | null = null
      let dateRangeValid = true

      if (allYears) {
        rangeFrom = requestedFrom
        rangeTo = requestedTo
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

      // ─── خواندن همه فاکتورهای خرید معتبر تامین‌کننده از همه سنوات ─
      const allInvoices = await tenantDb.purchaseInvoice.findMany({
        where: {
          tenantId,
          supplierId,
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

      const getInvoiceDate = (inv: any): Date => {
        return (
          toDateOrNull(inv.invoiceDate) ||
          toDateOrNull(inv.createdAt) ||
          new Date(0)
        )
      }

      // ─── تلاش برای خواندن پرداخت‌ها از جدول‌های احتمالی ────────
      const paymentModelCandidates: Array<[string, any]> = [
        ['purchaseInvoicePayment', (tenantDb as any).purchaseInvoicePayment],
        ['purchasePayment', (tenantDb as any).purchasePayment],
        ['supplierPayment', (tenantDb as any).supplierPayment],
      ]

      const rawPaymentRows: any[] = []

      for (const [modelName, model] of paymentModelCandidates) {
        if (!model) continue

        const wheres: any[] = []

        if (invoiceIds.length > 0) {
          wheres.push({ purchaseInvoiceId: { in: invoiceIds } })
          wheres.push({ invoiceId: { in: invoiceIds } })
        }

        wheres.push({ supplierId, tenantId })
        wheres.push({ supplierId })

        const rows = await tryFindMany(model, wheres)

        for (const row of rows) {
          rawPaymentRows.push({ __model: modelName, __row: row })
        }
      }

      const normalizedPayments: any[] = []
      const seenPaymentIds = new Set<string>()

      for (const wrapped of rawPaymentRows) {
        const normalized = normalizePaymentRow(wrapped.__row, wrapped.__model)
        if (!normalized) continue

        if (seenPaymentIds.has(normalized.id)) continue
        seenPaymentIds.add(normalized.id)

        normalizedPayments.push(normalized)
      }

      const getPaymentDate = (payment: any): Date => {
        return (
          toDateOrNull(payment.date) ||
          toDateOrNull(payment.createdAt) ||
          new Date(0)
        )
      }

      // ─── اگر جدول پرداخت واقعی وجود نداشت، از paidAmount فاکتور استفاده کن ─
      const hasSupplierLevelPayments = normalizedPayments.some(
        (p: any) => !p.invoiceId
      )

      const paymentInvoiceIds = new Set(
        normalizedPayments
          .map((p: any) => p.invoiceId)
          .filter(Boolean)
      )

      const syntheticPayments: any[] = []

      if (!hasSupplierLevelPayments) {
        for (const inv of allInvoices) {
          const isReturn = isReturnInvoiceType(inv.invoiceType)
          const paid = safeNum(inv.paidAmount)

          if (!isReturn && paid > 0 && !paymentInvoiceIds.has(inv.id)) {
            syntheticPayments.push({
              id: `synthetic-payment-${inv.id}`,
              rawId: `synthetic-${inv.id}`,
              invoiceId: inv.id,
              amount: paid,
              date: getInvoiceDate(inv),
              paymentType: inv.paymentType || 'cash',
              paymentRef: null,
              source: 'invoice_paid_amount_fallback',
              synthetic: true,
            })
          }
        }
      }

      const allPaymentEntries = [...normalizedPayments, ...syntheticPayments]

      // ─── ساخت دفتر کل کامل از همه سنوات ──────────────────────
      const fullLedger: any[] = [
        ...allInvoices.map((inv: any) => {
          const isReturn = isReturnInvoiceType(inv.invoiceType)
          const amount = isReturn
            ? -safeNum(inv.totalAmount)
            : safeNum(inv.totalAmount)

          return {
            id: `purchase-invoice-${inv.id}`,
            date: getInvoiceDate(inv),
            type: isReturn ? 'purchase_return' : 'purchase_invoice',
            reference: inv.number,
            description: isReturn ? 'مرجوعی خرید' : 'فاکتور خرید',
            amount,
            invoiceType: inv.invoiceType,
            status: inv.status,
            paymentType: inv.paymentType,
            paidAmount: safeNum(inv.paidAmount),
            remainingAmount: safeNum(inv.remainingAmount),
          }
        }),
        ...allPaymentEntries.map((payment: any) => ({
          id: payment.id,
          date: getPaymentDate(payment),
          type: 'payment',
          reference: payment.paymentRef || payment.rawId || payment.id,
          description: payment.synthetic
            ? 'پرداخت ثبت‌شده روی فاکتور'
            : 'پرداخت به تامین‌کننده',
          amount: -Math.abs(safeNum(payment.amount)),
          paymentType: payment.paymentType,
          synthetic: Boolean(payment.synthetic),
        })),
      ].sort((a, b) => {
        const da = toDateOrNull(a.date)?.getTime() || 0
        const db = toDateOrNull(b.date)?.getTime() || 0
        return da - db
      })

      // ─── مانده ابتدای دوره ───────────────────────────────────
      const openingEntries =
        fromTime !== null
          ? fullLedger.filter((entry) => {
              const t = toDateOrNull(entry.date)?.getTime() || 0
              return t < fromTime
            })
          : []

      const openingBalance = sumAmounts(openingEntries)

      // ─── تراکنش‌های دوره ─────────────────────────────────────
      const periodEntries = dateRangeValid
        ? fullLedger.filter((entry) => {
            const t = toDateOrNull(entry.date)?.getTime() || 0
            const afterFrom = fromTime === null || t >= fromTime
            const beforeTo = toTime === null || t <= toTime
            return afterFrom && beforeTo
          })
        : []

      const periodNet = sumAmounts(periodEntries)
      const closingBalance = openingBalance + periodNet

      // ─── جمع‌های دوره ────────────────────────────────────────
      const periodInvoiceEntries = periodEntries.filter(
        (entry) =>
          entry.type === 'purchase_invoice' || entry.type === 'purchase_return'
      )

      const periodPaymentEntries = periodEntries.filter(
        (entry) => entry.type === 'payment'
      )

      const grossPurchases = periodInvoiceEntries
        .filter((entry) => safeNum(entry.amount) > 0)
        .reduce((sum, entry) => sum + safeNum(entry.amount), 0)

      const returns = periodInvoiceEntries
        .filter((entry) => safeNum(entry.amount) < 0)
        .reduce((sum, entry) => sum + Math.abs(safeNum(entry.amount)), 0)

      const netPurchases = grossPurchases - returns

      const paymentsMade = periodPaymentEntries.reduce(
        (sum, entry) => sum + Math.abs(safeNum(entry.amount)),
        0
      )

      // ─── کل مانده باز از همه سنوات ───────────────────────────
      const outstandingFromInvoices = allInvoices.reduce(
        (sum: number, inv: any) =>
          sum + Math.max(0, safeNum(inv.remainingAmount)),
        0
      )

      const outstandingAllYears =
        outstandingFromInvoices > 0
          ? outstandingFromInvoices
          : Math.max(0, safeNum(supplier.currentBalance))

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
                invoiceType: inv.invoiceType,
              }))
          : []

      // ─── فاکتورها و پرداخت‌های دوره برای خروجی سازگار ────────
      const periodInvoices = allInvoices.filter((inv: any) => {
        const t = getInvoiceDate(inv).getTime()
        const afterFrom = fromTime === null || t >= fromTime
        const beforeTo = toTime === null || t <= toTime
        return afterFrom && beforeTo
      })

      const periodPayments = allPaymentEntries.filter((payment: any) => {
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

      console.log('[SupplierStatement v2.0] Summary', {
        tenantId,
        supplierId,
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
        paymentCount: allPaymentEntries.length,
        syntheticPaymentCount: syntheticPayments.length,
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
          // سازگاری با ساختار فرانت‌اند موجود
          customer: supplier,
          supplier,

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

            // برای تامین‌کننده، paymentsMade مهم است
            paymentsMade,

            // alias برای سازگاری با مودال فرانت‌اند
            paymentsReceived: paymentsMade,

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
            paymentCount: allPaymentEntries.length,
            syntheticPaymentCount: syntheticPayments.length,
            periodInvoiceCount: periodInvoices.length,
            periodPaymentCount: periodPayments.length,
            priorOpenInvoiceCount: priorOpenInvoices.length,
            truncatedInvoices: allInvoices.length >= MAX_INVOICES,
            truncatedPayments: allPaymentEntries.length >= MAX_PAYMENTS,
            scopeMethod:
              'date-based full ledger with opening balance and prior open invoices',
          },
        },
      })
    } catch (error: any) {
      console.error('[SupplierStatement v2.0] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error:
            'خطا در دریافت گردش حساب تامین‌کننده: ' +
            (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)