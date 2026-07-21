// ============================================================================
// src/app/api/reports/vat/route.ts — GET (v3.39 ★★★ FIXED)
// ShopAccounting — VAT (Value Added Tax) Report API
// ============================================================================
// ★ اصلاحات v3.39:
//   1. ✅ فیلتر invoiceType: فقط فاکتورهای فروش (نه برگشتی)
//   2. ✅ تفریق برگشتی‌ها از پایه مالیاتی
//   3. ✅ تعداد فاکتور صحیح (فقط sale فاکتورها)
//   4. ✅ نمایش برگشتی‌ها با علامت منفی در جدول
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const GET = withTenantAndPermission('dashboard')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)
      const fromDate = searchParams.get('from')
      const toDate = searchParams.get('to')

      // ─── ساخت شرط WHERE برای فاکتورها ──────────────────────
      const where: any = { tenantId }
      if (fromDate || toDate) {
        where.invoiceDate = {}
        if (fromDate) where.invoiceDate.gte = new Date(fromDate)
        if (toDate) {
          const endOfDay = new Date(toDate)
          endOfDay.setHours(23, 59, 59, 999)
          where.invoiceDate.lte = endOfDay
        }
      }

      // ─── دریافت فاکتورها با آیتم‌ها ────────────────────────
      // ★ v3.39: تمام فاکتورها را می‌گیریم (sale + sale_return)
      //   سپس جداگانه‌ به‌صورت مثبت و منفی محاسبه می‌کنیم
      const invoices = await tenantDb.invoice.findMany({
        where,
        select: {
          id: true,
          number: true,
          invoiceDate: true,
          invoiceType: true,  // ★ v3.39: اضافه شد
          paymentType: true,
          status: true,
          subTotal: true,
          discountAmount: true,
          taxAmount: true,
          totalAmount: true,
          customerId: true,
          customer: {
            select: { id: true, firstName: true, lastName: true, mobile: true },
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
        orderBy: { invoiceDate: 'desc' },
      })

      // ─── تفکیک فاکتورهای فروش و برگشتی ─────────────────────
      // ★ v3.39: جداگانه‌سازی فاکتورهای فروش و برگشتی
      const saleInvoices = invoices.filter((inv: any) => {
        const invType = (inv.invoiceType || '').toLowerCase()
        return invType !== 'sale_return' && invType !== 'purchase_return'
      })

      const returnInvoices = invoices.filter((inv: any) => {
        const invType = (inv.invoiceType || '').toLowerCase()
        return invType === 'sale_return' || invType === 'purchase_return'
      })

      // ─── محاسبه خلاصه VAT ──────────────────────────────────
      let totalSalesBase = 0      // پایه مالیاتی فاکتورهای فروش
      let totalReturnsBase = 0    // پایه مالیاتی برگشتی‌ها (منفی میشود)
      let totalTaxCollected = 0   // مالیات دریافتی از فروش
      let totalReturnTax = 0      // مالیات برگشتی (منفی میشود)
      let totalDiscountSale = 0   // تخفیف‌های فاکتورهای فروش
      let totalDiscountReturn = 0 // تخفیف‌های برگشتی
      let totalSalesWithTax = 0   // کل فروش با مالیات
      let totalReturnsWithTax = 0 // کل برگشتی با مالیات

      // ─── تفکیک نرخ‌های مالیاتی ──────────────────────────────
      const taxRates: Record<string, { count: number; baseAmount: number; taxAmount: number }> = {}

      // ★ پردازش فاکتورهای فروش
      const enrichedSaleInvoices = saleInvoices.map((inv: any) => {
        const subTotal = Number(inv.subTotal) || 0
        const taxAmount = Number(inv.taxAmount) || 0
        const discountAmount = Number(inv.discountAmount) || 0
        const totalAmount = Number(inv.totalAmount) || 0

        totalSalesBase += subTotal
        totalTaxCollected += taxAmount
        totalDiscountSale += discountAmount
        totalSalesWithTax += totalAmount

        // ★ تفکیک نرخ مالیات بر اساس آیتم‌ها
        const itemsByTaxRate: Record<string, { baseAmount: number; taxAmount: number; count: number }> = {}
        for (const item of inv.items || []) {
          const itemBase = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) - (Number(item.discountAmount) || 0)
          const itemTax = Number(item.taxAmount) || 0
          const rate = itemBase > 0 ? ((itemTax / itemBase) * 100).toFixed(1) : '0'
          const rateKey = `${rate}%`

          if (!itemsByTaxRate[rateKey]) {
            itemsByTaxRate[rateKey] = { baseAmount: 0, taxAmount: 0, count: 0 }
          }
          itemsByTaxRate[rateKey].baseAmount += itemBase
          itemsByTaxRate[rateKey].taxAmount += itemTax
          itemsByTaxRate[rateKey].count++

          // ★ در خلاصه کلی
          if (!taxRates[rateKey]) {
            taxRates[rateKey] = { count: 0, baseAmount: 0, taxAmount: 0 }
          }
          taxRates[rateKey].count++
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
          invoiceType: 'sale',  // ★ v3.39: علامت نشان‌دهنده فاکتور فروش
          paymentType: inv.paymentType,
          status: inv.status,
          customerName,
          subTotal,
          discountAmount,
          taxAmount,
          totalAmount,
          itemsByTaxRate,
        }
      })

      // ★ پردازش برگشتی‌ها
      const enrichedReturnInvoices = returnInvoices.map((inv: any) => {
        const subTotal = Number(inv.subTotal) || 0
        const taxAmount = Number(inv.taxAmount) || 0
        const discountAmount = Number(inv.discountAmount) || 0
        const totalAmount = Number(inv.totalAmount) || 0

        // ★ v3.39: برگشتی‌ها به‌صورت منفی حساب میشن
        totalReturnsBase += subTotal
        totalReturnTax += taxAmount
        totalDiscountReturn += discountAmount
        totalReturnsWithTax += totalAmount

        const itemsByTaxRate: Record<string, { baseAmount: number; taxAmount: number; count: number }> = {}
        for (const item of inv.items || []) {
          const itemBase = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) - (Number(item.discountAmount) || 0)
          const itemTax = Number(item.taxAmount) || 0
          const rate = itemBase > 0 ? ((itemTax / itemBase) * 100).toFixed(1) : '0'
          const rateKey = `${rate}%`

          if (!itemsByTaxRate[rateKey]) {
            itemsByTaxRate[rateKey] = { baseAmount: 0, taxAmount: 0, count: 0 }
          }
          itemsByTaxRate[rateKey].baseAmount += itemBase
          itemsByTaxRate[rateKey].taxAmount += itemTax
          itemsByTaxRate[rateKey].count++
        }

        const customerName = inv.customer
          ? `${inv.customer.firstName || ''} ${inv.customer.lastName || ''}`.trim()
          : 'فروش عمومی'

        return {
          id: inv.id,
          number: inv.number,
          invoiceDate: inv.invoiceDate,
          invoiceDateJalali: new Date(inv.invoiceDate).toLocaleDateString('fa-IR'),
          invoiceType: 'return',  // ★ v3.39: علامت نشان‌دهنده برگشتی
          paymentType: inv.paymentType,
          status: inv.status,
          customerName,
          subTotal: -subTotal,    // ★ v3.39: منفی برای برگشتی
          discountAmount: -discountAmount,
          taxAmount: -taxAmount,
          totalAmount: -totalAmount,
          itemsByTaxRate,
        }
      })

      // ★ ترکیب فروش و برگشتی (فروش‌ها اول)
      const allEnrichedInvoices = [...enrichedSaleInvoices, ...enrichedReturnInvoices]

      // ─── محاسبه خلاصه نهایی ─────────────────────────────────
      // ★ v3.39: پایه مالیاتی = فروش - برگشتی
      const netTaxBase = totalSalesBase - totalReturnsBase
      
      // ★ v3.39: مالیات خالص = مالیات فروش - مالیات برگشتی
      const netTaxCollected = totalTaxCollected - totalReturnTax
      
      // ★ v3.39: تخفیف خالص
      const netDiscount = totalDiscountSale - totalDiscountReturn
      
      // ★ v3.39: کل فروش خالص
      const netSalesWithTax = totalSalesWithTax - totalReturnsWithTax
      
      // ★ v3.39: تعداد فاکتور فقط از فاکتورهای فروش
      const saleInvoiceCount = saleInvoices.length
      const returnInvoiceCount = returnInvoices.length

      // ─── محاسبه VAT قابل پرداخت ─────────────────────────────
      // VAT قابل پرداخت = مالیات دریافتی از فروش - مالیات پرداختی برای خرید
      // فعلاً فقط مالیات فروش را داریم (مالیات خرید از اسناد حسابداری محاسبه می‌شود)
      const vatPayable = netTaxCollected

      return NextResponse.json({
        success: true,
        data: {
          invoices: allEnrichedInvoices,  // ★ v3.39: ترتیب: فروش + برگشتی
          summary: {
            // ★ v3.39: شمارش صحیح
            saleInvoiceCount,              // تعداد فاکتورهای فروش
            returnInvoiceCount,            // تعداد برگشتی‌ها
            invoiceCount: saleInvoiceCount, // کل (فقط فروش برای شمارش رسمی)
            
            // ★ v3.39: پایه‌های صحیح
            totalSales: totalSalesBase,           // پایه فروش
            totalReturns: totalReturnsBase,       // پایه برگشتی
            netTaxBase,                           // پایه خالص
            
            // ★ تخفیفات
            totalDiscountSale,
            totalDiscountReturn,
            totalDiscount: netDiscount,
            
            // ★ مالیات
            totalTaxCollected: netTaxCollected,   // مالیات خالص
            
            // ★ مجموع
            totalSalesWithTax: netSalesWithTax,   // کل فروش خالص
            vatPayable,
            
            taxRates: Object.entries(taxRates).map(([rate, data]) => ({
              rate,
              count: data.count,
              baseAmount: data.baseAmount,
              taxAmount: data.taxAmount,
            })),
          },
        },
      })
    } catch (error: any) {
      console.error('[VAT Report v3.39] Error:', error?.message || error)
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت گزارش VAT' },
        { status: 500 }
      )
    }
  }
)