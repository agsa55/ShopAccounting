// ============================================================================
// src/app/api/reports/aging/route.ts — GET (v3.30 ★★★)
// ShopAccounting — Aging Report (گزارش سنین بدهی)
// ============================================================================
// ★★★ v3.30: گزارش سنین بدهی — حیاتی برای مدیریت نسیه
//
// این گزارش به مدیر فروشگاه نشان می‌دهد کدام مشتریان بدهکار هستند
// و بدهی‌شان در کدام بازه زمانی قرار دارد.
//
// منابع داده:
//   ۱. Customer.currentBalance — مانده کل بدهی هر مشتری
//   ۲. Invoice — فاکتورهای نسیه (paymentType=credit) که هنوز پرداخت نشده‌اند
//
// بازه‌های سنین بدهی:
//   - ۰-۳۰ روز (جاری)
//   - ۳۱-۶۰ روز (کوتاه‌مدت)
//   - ۶۱-۹۰ روز (میان‌مدت)
//   - ۹۰+ روز (سوخت‌شده/مشکوک‌الوصول)
//
// محاسبه:
//   برای هر فاکتور نسیه پرداخت‌نشده:
//   - سن بدهی = تاریخ مرجع (asOf) - تاریخ فاکتور (invoiceDate)
//   - مبلغ بدهی = remainingAmount (مبلغ باقی‌مانده)
//   - اگر فاکتور dueDate دارد، از آن استفاده می‌شود
//
// خروجی:
//   {
//     success: true,
//     data: {
//       asOf: 'YYYY-MM-DD',
//       buckets: {
//         '0-30': { total: number, customers: [...] },
//         '31-60': { total: number, customers: [...] },
//         '61-90': { total: number, customers: [...] },
//         '90+': { total: number, customers: [...] },
//       },
//       customers: [
//         {
//           customerId, customerName, mobile,
//           totalDebt,  // مجموع بدهی
//           buckets: { '0-30': n, '31-60': n, '61-90': n, '90+': n },
//           invoiceCount, lastInvoiceDate,
//           details: [{ invoiceId, invoiceNumber, invoiceDate, dueDate, amount, age, bucket }],
//         }
//       ],
//       summary: {
//         totalDebt, customerCount,
//         bucketTotals: { '0-30': n, '31-60': n, '61-90': n, '90+': n },
//       }
//     }
//   }
//
// نیاز به پلن: حرفه‌ای یا سازمانی (canAccessCredit)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'

// ═══════════════════════════════════════════════════════════════
//  ثابت‌ها و توابع کمکی
// ═══════════════════════════════════════════════════════════════

const BUCKET_RANGES = [
  { key: '0-30',  label: '۰ تا ۳۰ روز (جاری)',           min: 0,  max: 30,  color: 'emerald' },
  { key: '31-60', label: '۳۱ تا ۶۰ روز (کوتاه‌مدت)',       min: 31, max: 60,  color: 'amber' },
  { key: '61-90', label: '۶۱ تا ۹۰ روز (میان‌مدت)',        min: 61, max: 90,  color: 'orange' },
  { key: '90+',   label: 'بیش از ۹۰ روز (مشکوک‌الوصول)',   min: 91, max: 9999, color: 'red' },
] as const

// ★ تعیین bucket بر اساس سن بدهی (روز)
function getBucket(ageDays: number): string {
  for (const b of BUCKET_RANGES) {
    if (ageDays >= b.min && ageDays <= b.max) return b.key
  }
  return '90+'
}

// ★ محاسبه سن بدهی به روز
function calculateAgeDays(invoiceDate: Date, asOf: Date): number {
  const diffMs = asOf.getTime() - invoiceDate.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

// ═══════════════════════════════════════════════════════════════
//  GET — گزارش سنین بدهی
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(
  async (request: NextRequest, _context: any, tenant: any) => {
    console.log('[AgingReport] Handler started, tenantId:', tenant?.tenantId)
    try {
      // ★ بررسی پلن — فقط حرفه‌ای و سازمانی
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

      // ★ تاریخ مرجع (asOf) — پیش‌فرض امروز
      const { searchParams } = new URL(request.url)
      const asOfParam = searchParams.get('asOf')
      const asOf = asOfParam ? new Date(asOfParam) : new Date()
      if (isNaN(asOf.getTime())) {
        return NextResponse.json(
          { success: false, error: 'تاریخ asOf نامعتبر است (فرمت YYYY-MM-DD)' },
          { status: 400 }
        )
      }
      asOf.setHours(23, 59, 59, 999)
      const asOfISO = asOf.toISOString().split('T')[0]

      console.log('[AgingReport] asOf:', asOfISO)

      // ─── ۱. دریافت مشتریانی که بدهی دارند (currentBalance > 0) ────
      let customersWithDebt: any[] = []
      try {
        customersWithDebt = await tenantDb.customer.findMany({
          where: {
            tenantId,
            currentBalance: { gt: 0 },
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
          orderBy: { currentBalance: 'desc' },
        })
      } catch (err: any) {
        console.error('[AgingReport] Customer query failed:', err?.message)
        return NextResponse.json(
          { success: false, error: 'خطا در دریافت مشتریان: ' + (err?.message || '') },
          { status: 500 }
        )
      }
      console.log('[AgingReport] Found', customersWithDebt.length, 'customers with debt')

      if (customersWithDebt.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            asOf: asOfISO,
            buckets: {
              '0-30': { total: 0, customers: [] },
              '31-60': { total: 0, customers: [] },
              '61-90': { total: 0, customers: [] },
              '90+': { total: 0, customers: [] },
            },
            customers: [],
            summary: {
              totalDebt: 0,
              customerCount: 0,
              bucketTotals: { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 },
            },
            message: 'هیچ بدهی ثبت نشده است',
          },
        })
      }

      // ─── ۲. دریافت فاکتورهای نسیه پرداخت‌نشده ─────────────────
      //   فاکتورهایی که paymentType=credit و remainingAmount > 0
      let creditInvoices: any[] = []
      try {
        creditInvoices = await tenantDb.invoice.findMany({
          where: {
            tenantId,
            paymentType: 'credit',
            remainingAmount: { gt: 0 },
          },
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
          },
          orderBy: { invoiceDate: 'asc' },
        })
      } catch (err: any) {
        console.warn('[AgingReport] Invoice query failed, using customer balance only:', err?.message)
        creditInvoices = []
      }
      console.log('[AgingReport] Found', creditInvoices.length, 'unpaid credit invoices')

      // ─── ۳. گروه‌بندی فاکتورها بر اساس مشتری ───────────────────
      const customerInvoicesMap = new Map<string, any[]>()
      for (const inv of creditInvoices) {
        if (!inv.customerId) continue
        const list = customerInvoicesMap.get(inv.customerId) || []
        list.push(inv)
        customerInvoicesMap.set(inv.customerId, list)
      }

      // ─── ۴. محاسبه سنین بدهی برای هر مشتری ────────────────────
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

      for (const customer of customersWithDebt) {
        const customerName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'بدون نام'
        const invoices = customerInvoicesMap.get(customer.id) || []

        // ★ buckets برای این مشتری
        const customerBuckets: Record<string, number> = {
          '0-30': 0,
          '31-60': 0,
          '61-90': 0,
          '90+': 0,
        }

        const details: any[] = []
        let lastInvoiceDate: Date | null = null

        if (invoices.length > 0) {
          // ★ حالت ۱: فاکتورهای نسیه داریم — سن هر فاکتور را محاسبه کن
          for (const inv of invoices) {
            const invDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.invoiceDate)
            const ageDays = calculateAgeDays(invDate, asOf)
            const bucket = getBucket(ageDays)
            const amount = Number(inv.remainingAmount) || 0

            customerBuckets[bucket] += amount

            // ★ به‌روزرسانی آخرین تاریخ فاکتور
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
              ageDays,
              bucket,
            })
          }

          // ★ مرتب‌سازی details بر اساس سن (قدیمی‌ترین اول)
          details.sort((a, b) => b.ageDays - a.ageDays)
        } else {
          // ★ حالت ۲: فاکتور نسیه پیدا نشد — از currentBalance استفاده کن
          //   در این حالت، سن بدهی را بر اساس lastPurchaseAt تخمین می‌زنیم
          const refDate = customer.lastPurchaseAt ? new Date(customer.lastPurchaseAt) : asOf
          const ageDays = calculateAgeDays(refDate, asOf)
          const bucket = getBucket(ageDays)
          const amount = Number(customer.currentBalance) || 0

          customerBuckets[bucket] += amount
          lastInvoiceDate = customer.lastPurchaseAt ? new Date(customer.lastPurchaseAt) : null

          details.push({
            invoiceId: null,
            invoiceNumber: 'بدون فاکتور',
            invoiceDate: customer.lastPurchaseAt,
            dueDate: null,
            totalAmount: amount,
            paidAmount: 0,
            remainingAmount: amount,
            ageDays,
            bucket,
            note: 'بدهی مستقیم (فاکتور نسیه یافت نشد)',
          })
        }

        const customerTotalDebt = Number(customer.currentBalance) || 0
        totalDebt += customerTotalDebt

        // ★ اضافه کردن به buckets کلی
        for (const b of BUCKET_RANGES) {
          if (customerBuckets[b.key] > 0) {
            bucketCustomers[b.key].push({
              customerId: customer.id,
              customerName,
              mobile: customer.mobile,
              amount: customerBuckets[b.key],
            })
            bucketTotals[b.key] += customerBuckets[b.key]
          }
        }

        customersResult.push({
          customerId: customer.id,
          customerCode: customer.code,
          customerName,
          mobile: customer.mobile,
          totalDebt: customerTotalDebt,
          buckets: customerBuckets,
          invoiceCount: invoices.length,
          lastInvoiceDate: lastInvoiceDate ? lastInvoiceDate.toISOString() : null,
          details,
        })
      }

      // ★ مرتب‌سازی مشتریان بر اساس مجموع بدهی (نزولی)
      customersResult.sort((a, b) => b.totalDebt - a.totalDebt)

      // ─── ۵. آماده‌سازی خروجی ─────────────────────────────────
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

      console.log('[AgingReport] Summary:', {
        totalDebt,
        customerCount: customersResult.length,
        bucketTotals,
      })

      return NextResponse.json({
        success: true,
        data: {
          asOf: asOfISO,
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
        },
      })
    } catch (error: any) {
      console.error('[AgingReport] Error:', error)
      console.error('[AgingReport] Error code:', error?.code)
      console.error('[AgingReport] Error meta:', error?.meta)
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
