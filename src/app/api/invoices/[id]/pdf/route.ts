// ============================================================================
// src/app/api/invoices/[id]/pdf/route.ts — GET (v3.32 ★★★)
// ShopAccounting — Invoice PDF Generation
// ============================================================================
// ★★★ v3.32: تولید PDF فاکتور با فرمت حرفه‌ای
//
// Supported methods:
//
//   GET /api/invoices/[id]/pdf
//     - دریافت فاکتور به‌صورت HTML آماده چاپ (می‌تواند به PDF تبدیل شود)
//     - خروجی: Content-Type: text/html
//     - کاربر می‌تواند با Ctrl+P آن را به PDF تبدیل کند
//     - یا با Puppeteer (در آینده) به PDF تبدیل شود
//
// ویژگی‌های PDF:
//   - لوگوی فروشگاه (اگر تنظیم شده باشد)
//   - نام و آدرس فروشگاه
//   - شماره فاکتور، تاریخ، وضعیت
//   - اطلاعات مشتری
//   - جدول اقلام فاکتور
//   - جمع‌بندی (subtotal, discount, tax, total)
//   - مبلغ پرداخت‌شده و باقی‌مانده
//   - مهر و امضا
//   - فوتر
//
// نیاز به پلن: همه پلن‌ها (canPrintInvoice)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'

// ═══════════════════════════════════════════════════════════════
//  توابع کمکی
// ═══════════════════════════════════════════════════════════════

function formatPrice(price: number): string {
  return (price || 0).toLocaleString('fa-IR')
}

function formatDate(date: string | Date | null): string {
  if (!date) return '—'
  try {
    return new Date(date).toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

function getStatusLabel(status: string): { label: string; color: string } {
  const s = (status || '').toLowerCase()
  switch (s) {
    case 'paid':
    case 'confirmed':
      return { label: 'پرداخت‌شده', color: '#16a34a' }
    case 'pending':
      return { label: 'در انتظار پرداخت', color: '#d97706' }
    case 'partial':
      return { label: 'پرداخت جزئی', color: '#2563eb' }
    case 'cancelled':
      return { label: 'لغوشده', color: '#dc2626' }
    case 'draft':
      return { label: 'پیش‌نویس', color: '#6b7280' }
    default:
      return { label: status || 'نامشخص', color: '#6b7280' }
  }
}

function getPaymentTypeLabel(type: string): string {
  const t = (type || 'cash').toLowerCase()
  switch (t) {
    case 'cash': return 'نقدی'
    case 'card': return 'کارتخوان'
    case 'credit': return 'نسیه'
    case 'installment': return 'قسطی'
    case 'check': return 'چک'
    default: return type || 'نقدی'
  }
}

// ═══════════════════════════════════════════════════════════════
//  GET — تولید HTML فاکتور برای چاپ/PDF
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('pos')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    console.log('[Invoice PDF] Handler started, tenantId:', tenant?.tenantId)
    try {
      // ★ بررسی پلن — همه پلن‌ها می‌توانند فاکتور چاپ کنند
      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features.canPrintInvoice) {
        return NextResponse.json(
          { success: false, error: 'چاپ فاکتور در پلن شما در دسترس نیست' },
          { status: 403 }
        )
      }

      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      // ★★★ Next.js 16: params یک Promise است
      const params = ctx.params && typeof (ctx.params as any).then === 'function'
        ? await ctx.params
        : (ctx.params || {})
      const id = params?.id

      if (!id) {
        return NextResponse.json(
          { success: false, error: 'شناسه فاکتور الزامی است' },
          { status: 400 }
        )
      }

      // ─── ۱. دریافت فاکتور ─────────────────────────────────────
      const invoice = await tenantDb.invoice.findFirst({
        where: { id, tenantId },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mobile: true,
              address: true,
              nationalCode: true,
            },
          },
          cashier: {
            select: { id: true, username: true },
          },
          items: true,
          payments: {
            orderBy: { paidAt: 'asc' },
          },
        },
      })

      if (!invoice) {
        return NextResponse.json(
          { success: false, error: 'فاکتور یافت نشد' },
          { status: 404 }
        )
      }

      // ─── ۲. دریافت تنظیمات فروشگاه ────────────────────────────
      let storeSettings: any = null
      try {
        storeSettings = await tenantDb.storeSetting.findFirst({
          where: { tenantId },
        })
      } catch {
        // ignore
      }

      // ★ اطلاعات فروشگاه
      const storeName = storeSettings?.storeName || tenant.companyName || 'فروشگاه'
      const storeAddress = storeSettings?.address || tenant.address || ''
      const storePhone = storeSettings?.phone || tenant.ownerMobile || ''
      const storeRegNumber = storeSettings?.registrationNumber || tenant.registrationNumber || ''
      const storeLogo = storeSettings?.logoUrl || tenant.logoUrl || ''
      const taxRate = storeSettings?.defaultTaxRate || 9

      // ★ اطلاعات مشتری
      const customerName = invoice.customer
        ? `${invoice.customer.firstName || ''} ${invoice.customer.lastName || ''}`.trim()
        : 'مشتری نقدی'
      const customerMobile = invoice.customer?.mobile || ''
      const customerAddress = invoice.customer?.address || ''
      const customerNationalCode = invoice.customer?.nationalCode || ''

      // ★ اطلاعات فاکتور
      const statusInfo = getStatusLabel(invoice.status)
      const paymentTypeLabel = getPaymentTypeLabel(invoice.paymentType)
      const invoiceNumber = invoice.number
      const invoiceDate = formatDate(invoice.invoiceDate)
      const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : null

      // ★ محاسبات
      const subTotal = Number(invoice.subTotal) || 0
      const discountAmount = Number(invoice.discountAmount) || 0
      const taxAmount = Number(invoice.taxAmount) || 0
      const totalAmount = Number(invoice.totalAmount) || 0
      const paidAmount = Number(invoice.paidAmount) || 0
      const remainingAmount = Number(invoice.remainingAmount) || 0

      // ─── ۳. ساخت HTML فاکتور ─────────────────────────────────
      const html = generateInvoiceHTML({
        storeName,
        storeAddress,
        storePhone,
        storeRegNumber,
        storeLogo,
        invoiceNumber,
        invoiceDate,
        dueDate,
        statusInfo,
        paymentTypeLabel,
        customerName,
        customerMobile,
        customerAddress,
        customerNationalCode,
        items: invoice.items || [],
        subTotal,
        discountAmount,
        taxAmount,
        totalAmount,
        paidAmount,
        remainingAmount,
        cashierName: invoice.cashier?.username || '',
        description: invoice.description || '',
      })

      console.log('[Invoice PDF] Generated HTML for invoice:', invoiceNumber)

      // ─── ۴. بازگشت HTML ──────────────────────────────────────
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `inline; filename="invoice-${invoiceNumber}.html"`,
        },
      })
    } catch (error: any) {
      console.error('[Invoice PDF] Error:', error)
      console.error('[Invoice PDF] Error code:', error?.code)
      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در تولید PDF فاکتور',
          code: error?.code || 'UNKNOWN',
        },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  تابع تولید HTML فاکتور
// ═══════════════════════════════════════════════════════════════

function generateInvoiceHTML(data: {
  storeName: string
  storeAddress: string
  storePhone: string
  storeRegNumber: string
  storeLogo: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string | null
  statusInfo: { label: string; color: string }
  paymentTypeLabel: string
  customerName: string
  customerMobile: string
  customerAddress: string
  customerNationalCode: string
  items: any[]
  subTotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  remainingAmount: number
  cashierName: string
  description: string
}): string {
  const itemsRows = (data.items || [])
    .map((item: any, idx: number) => {
      const lineTotal = Number(item.lineTotal) || 0
      const unitPrice = Number(item.unitPrice) || 0
      const quantity = Number(item.quantity) || 0
      const itemDiscount = Number(item.discountAmount) || 0
      const itemTax = Number(item.taxAmount) || 0
      return `
        <tr>
          <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb;">${(idx + 1).toLocaleString('fa-IR')}</td>
          <td style="text-align: right; padding: 8px; border: 1px solid #e5e7eb; font-weight: 500;">${item.productName || '—'}</td>
          <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb;" dir="ltr">${quantity.toLocaleString('fa-IR')}</td>
          <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb;" dir="ltr">${formatPrice(unitPrice)}</td>
          <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb;" dir="ltr">${itemDiscount > 0 ? formatPrice(itemDiscount) : '—'}</td>
          <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb;" dir="ltr">${itemTax > 0 ? formatPrice(itemTax) : '—'}</td>
          <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;" dir="ltr">${formatPrice(lineTotal)}</td>
        </tr>
      `
    })
    .join('')

  return `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>فاکتور ${data.invoiceNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: Tahoma, Arial, sans-serif;
      background: #f3f4f6;
      padding: 20px;
      color: #1f2937;
      line-height: 1.6;
    }
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      overflow: hidden;
    }
    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 24px 32px;
      background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
      color: white;
    }
    .store-info {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .store-logo {
      width: 60px;
      height: 60px;
      border-radius: 8px;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .store-logo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .store-logo-placeholder {
      font-size: 24px;
      font-weight: bold;
      color: #16a34a;
    }
    .store-name {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .store-details {
      font-size: 11px;
      opacity: 0.9;
      line-height: 1.5;
    }
    .invoice-title {
      text-align: left;
    }
    .invoice-title h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    .invoice-number {
      font-size: 14px;
      opacity: 0.9;
    }
    .invoice-meta {
      display: flex;
      justify-content: space-between;
      padding: 16px 32px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }
    .meta-item {
      display: flex;
      gap: 8px;
      font-size: 12px;
    }
    .meta-label {
      color: #6b7280;
      font-weight: 500;
    }
    .meta-value {
      color: #1f2937;
      font-weight: 600;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;
      color: white;
      background: ${data.statusInfo.color};
    }
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      padding: 24px 32px;
    }
    .party-card {
      padding: 16px;
      background: #f9fafb;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }
    .party-label {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .party-name {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .party-details {
      font-size: 11px;
      color: #4b5563;
      line-height: 1.6;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 32px;
      width: calc(100% - 64px);
    }
    .items-table th {
      background: #f3f4f6;
      padding: 10px 8px;
      border: 1px solid #e5e7eb;
      font-size: 11px;
      font-weight: bold;
      color: #374151;
      text-align: center;
    }
    .items-table td {
      padding: 8px;
      border: 1px solid #e5e7eb;
      font-size: 12px;
      color: #1f2937;
    }
    .items-table tr:nth-child(even) td {
      background: #f9fafb;
    }
    .summary {
      display: flex;
      justify-content: space-between;
      padding: 24px 32px;
      gap: 24px;
    }
    .summary-left {
      flex: 1;
    }
    .summary-right {
      width: 280px;
    }
    .description-box {
      padding: 12px;
      background: #f9fafb;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
      font-size: 11px;
      color: #4b5563;
      min-height: 60px;
    }
    .description-label {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 6px;
      font-weight: 500;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 12px;
    }
    .summary-row.total {
      border-top: 2px solid #16a34a;
      margin-top: 8px;
      padding-top: 12px;
      font-size: 14px;
      font-weight: bold;
      color: #16a34a;
    }
    .summary-row.remaining {
      background: #fef3c7;
      padding: 8px 12px;
      border-radius: 4px;
      margin-top: 8px;
      color: #92400e;
      font-weight: bold;
    }
    .summary-label {
      color: #6b7280;
    }
    .summary-value {
      font-weight: 600;
      color: #1f2937;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      padding: 32px;
      margin-top: 24px;
    }
    .signature-box {
      text-align: center;
    }
    .signature-line {
      border-top: 1px dashed #9ca3af;
      margin-top: 48px;
      padding-top: 8px;
      font-size: 11px;
      color: #6b7280;
    }
    .footer {
      text-align: center;
      padding: 16px 32px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      font-size: 10px;
      color: #9ca3af;
    }
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .invoice-container {
        box-shadow: none;
        border-radius: 0;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- هدر فاکتور -->
    <div class="invoice-header">
      <div class="store-info">
        <div class="store-logo">
          ${data.storeLogo
            ? `<img src="${data.storeLogo}" alt="logo">`
            : `<div class="store-logo-placeholder">${data.storeName.charAt(0)}</div>`
          }
        </div>
        <div>
          <div class="store-name">${data.storeName}</div>
          <div class="store-details">
            ${data.storeAddress ? `<div>📍 ${data.storeAddress}</div>` : ''}
            ${data.storePhone ? `<div>📞 ${data.storePhone}</div>` : ''}
            ${data.storeRegNumber ? `<div>🆔 شماره ثبت: ${data.storeRegNumber}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="invoice-title">
        <h1>فاکتور فروش</h1>
        <div class="invoice-number">شماره: ${data.invoiceNumber}</div>
      </div>
    </div>

    <!-- اطلاعات فاکتور -->
    <div class="invoice-meta">
      <div class="meta-item">
        <span class="meta-label">تاریخ:</span>
        <span class="meta-value">${data.invoiceDate}</span>
      </div>
      ${data.dueDate ? `
      <div class="meta-item">
        <span class="meta-label">سررسید:</span>
        <span class="meta-value">${data.dueDate}</span>
      </div>
      ` : ''}
      <div class="meta-item">
        <span class="meta-label">روش پرداخت:</span>
        <span class="meta-value">${data.paymentTypeLabel}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">وضعیت:</span>
        <span class="status-badge">${data.statusInfo.label}</span>
      </div>
    </div>

    <!-- اطلاعات طرفین -->
    <div class="parties">
      <div class="party-card">
        <div class="party-label">فروشنده</div>
        <div class="party-name">${data.storeName}</div>
        <div class="party-details">
          ${data.storeAddress ? `<div>📍 ${data.storeAddress}</div>` : ''}
          ${data.storePhone ? `<div>📞 ${data.storePhone}</div>` : ''}
          ${data.cashierName ? `<div>👤 صندوق‌دار: ${data.cashierName}</div>` : ''}
        </div>
      </div>
      <div class="party-card">
        <div class="party-label">خریدار</div>
        <div class="party-name">${data.customerName}</div>
        <div class="party-details">
          ${data.customerMobile ? `<div>📞 ${data.customerMobile}</div>` : ''}
          ${data.customerNationalCode ? `<div>🆔 کد ملی: ${data.customerNationalCode}</div>` : ''}
          ${data.customerAddress ? `<div>📍 ${data.customerAddress}</div>` : ''}
        </div>
      </div>
    </div>

    <!-- جدول اقلام -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 40px;">#</th>
          <th>شرح کالا/خدمت</th>
          <th style="width: 70px;">تعداد</th>
          <th style="width: 100px;">قیمت واحد</th>
          <th style="width: 90px;">تخفیف</th>
          <th style="width: 90px;">مالیات</th>
          <th style="width: 110px;">مبلغ کل</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows || `
          <tr>
            <td colspan="7" style="text-align: center; padding: 24px; color: #9ca3af;">
              هیچ قلمی در این فاکتور ثبت نشده است
            </td>
          </tr>
        `}
      </tbody>
    </table>

    <!-- جمع‌بندی -->
    <div class="summary">
      <div class="summary-left">
        ${data.description ? `
          <div class="description-label">توضیحات:</div>
          <div class="description-box">${data.description}</div>
        ` : ''}
      </div>
      <div class="summary-right">
        <div class="summary-row">
          <span class="summary-label">جمع کل:</span>
          <span class="summary-value" dir="ltr">${formatPrice(data.subTotal)} ریال</span>
        </div>
        ${data.discountAmount > 0 ? `
        <div class="summary-row">
          <span class="summary-label">تخفیف:</span>
          <span class="summary-value" dir="ltr" style="color: #dc2626;">- ${formatPrice(data.discountAmount)} ریال</span>
        </div>
        ` : ''}
        ${data.taxAmount > 0 ? `
        <div class="summary-row">
          <span class="summary-label">مالیات:</span>
          <span class="summary-value" dir="ltr">+ ${formatPrice(data.taxAmount)} ریال</span>
        </div>
        ` : ''}
        <div class="summary-row total">
          <span>مبلغ نهایی:</span>
          <span dir="ltr">${formatPrice(data.totalAmount)} ریال</span>
        </div>
        ${data.paidAmount > 0 ? `
        <div class="summary-row">
          <span class="summary-label">پرداخت‌شده:</span>
          <span class="summary-value" dir="ltr" style="color: #16a34a;">${formatPrice(data.paidAmount)} ریال</span>
        </div>
        ` : ''}
        ${data.remainingAmount > 0 ? `
        <div class="summary-row remaining">
          <span>باقی‌مانده:</span>
          <span dir="ltr">${formatPrice(data.remainingAmount)} ریال</span>
        </div>
        ` : ''}
      </div>
    </div>

    <!-- امضاها -->
    <div class="signatures">
      <div class="signature-box">
        <div class="signature-line">مهر و امضای فروشنده</div>
      </div>
      <div class="signature-box">
        <div class="signature-line">امضای خریدار</div>
      </div>
    </div>

    <!-- فوتر -->
    <div class="footer">
      این فاکتور توسط سامانه حسابداری فروشگاهی صادر شده است • ${new Date().toLocaleDateString('fa-IR')}
      <br>
      برای تبدیل به PDF: Ctrl+P را بزنید و گزینه "Save as PDF" را انتخاب کنید
    </div>
  </div>

  <script>
    // ★ چاپ خودکار وقتی صفحه لود شد
    window.onload = function() {
      // ★ تأخیر کوتاه برای اطمینان از لود کامل
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>
  `.trim()
}
