// ============================================================================
// src/lib/moidian/invoice-mapper.ts — تبدیل Invoice داخلی به فرمت مودیان (UF)
// ============================================================================
// ★ این فایل مسئول تبدیل مدل Invoice در دیتابیس به فرمت JSON است که
//   سامانه مودیان آن را می‌پذیرد (Universal File / Invoice Object).
//
// ★ نگاشت فیلدها:
//   - Invoice.number        → header.invoiceNumber
//   - Invoice.invoiceDate   → header.invoiceDate (YYYY-MM-DD)
//   - Tenant.registrationNumber → header.seller.taxid
//   - Customer.nationalCode → header.buyer.taxid (اختیاری)
//   - Invoice.paymentType   → header.paymentType
//   - InvoiceItem           → body.items[]
// ============================================================================

import type { MoidianInvoicePayload } from './client'

// ─── Typings داخلی ────────────────────────────────────────────

interface InvoiceForMoidian {
  id: string
  number: string
  invoiceDate: Date | string
  dueDate?: Date | string | null
  status: string
  paymentType: string
  subTotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  description?: string | null
  customerId?: string | null
  customer?: {
    firstName?: string
    lastName?: string
    name?: string
    mobile?: string | null
    nationalCode?: string | null
    address?: string | null
  } | null
  items: Array<{
    productId?: string | null
    productName: string
    quantity: number
    unitPrice: number
    discountAmount: number
    taxAmount: number
    lineTotal: number
  }>
}

interface SellerInfo {
  taxid: string
  name: string
  address?: string
  phone?: string
}

// ─── توابع کمکی ─────────────────────────────────────────────

/**
 * تبدیل تاریخ به فرمت YYYY-MM-DD (میلادی — مودیان میلادی می‌خواهد)
 */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0]
}

/**
 * تبدیل paymentType داخلی به کد عددی مودیان
 *   ۱ = نقدی (Cash)
 *   ۲ = اعتباری (Credit / نسیه)
 *   ۳ = چکی (Check)
 *   ۱ = قسطی (تقریباً نزدیک به نقدی — مودیان کد خاصی برای قسطی ندارد)
 */
function mapPaymentType(paymentType: string): number {
  const pt = (paymentType || 'cash').toLowerCase()
  if (pt === 'cash') return 1
  if (pt === 'credit') return 2
  if (pt === 'installment') return 1   // ★ قسطی → نقدی (چون در همان زمان فاکتور صادر می‌شود)
  if (pt === 'check') return 3
  if (pt === 'card') return 1
  if (pt === 'online') return 1
  return 1
}

/**
 * تشخیص واحد کالا (در صورت نبود اطلاعات دقیق، 'عدد' پیش‌فرض)
 */
function detectUnit(item: any): string {
  // ★ در آینده می‌توان unitId را از Product گرفت و نام واحد را بازگرداند
  // فعلاً 'عدد' پیش‌فرض است
  return 'عدد'
}

/**
 * تشخیص موضوع فاکتور از روی description یا پیش‌فرض
 */
function detectInvoiceSubject(invoice: InvoiceForMoidian): string {
  if (invoice.description && invoice.description.trim()) {
    return invoice.description.substring(0, 100)
  }
  return 'فاکتور فروش کالا و خدمات'
}

/**
 * تشخیص نوع فاکتور:
 *   ۱ = فروش (پیش‌فرض)
 *   ۲ = خرید
 *   ۳ = برگشت از فروش
 *   ۴ = برگشت از خرید
 */
function detectInvoiceType(invoice: InvoiceForMoidian): number {
  // ★ فعلاً فقط نوع ۱ (فروش) پیاده‌سازی شده
  // در آینده برای فاکتورهای برگشتی، ۳ خواهد بود
  return 1
}

// ─── تبدیل اصلی ──────────────────────────────────────────────

/**
 * تبدیل Invoice داخلی به فرمت مودیان
 *
 * @param invoice - مدل Invoice داخلی با items و customer
 * @param seller - اطلاعات فروشنده (از Tenant + StoreSetting)
 * @param fiscalYear - سال مالی (مثلاً '1403')
 */
export function mapInvoiceToMoidian(
  invoice: InvoiceForMoidian,
  seller: SellerInfo,
  fiscalYear: string = '1403'
): MoidianInvoicePayload {
  // ★ ساخت buyer در صورت وجود مشتری
  const buyer = invoice.customer ? {
    taxid: invoice.customer.nationalCode || undefined,
    name: invoice.customer.name ||
      `${invoice.customer.firstName || ''} ${invoice.customer.lastName || ''}`.trim() ||
      undefined,
    address: invoice.customer.address || undefined,
    phone: invoice.customer.mobile || undefined,
  } : undefined

  // ★ پاک کردن فیلدهای undefined از buyer
  const cleanBuyer = buyer ? Object.fromEntries(
    Object.entries(buyer).filter(([_, v]) => v !== undefined && v !== null && v !== '')
  ) : undefined

  // ★ تبدیل آیتم‌ها
  const items = (invoice.items || []).map((item) => {
    const quantity = Number(item.quantity) || 1
    const unitPrice = Number(item.unitPrice) || 0
    const discount = Number(item.discountAmount) || 0
    const taxRate = unitPrice > 0 ? Math.round(((Number(item.taxAmount) || 0) / (unitPrice * quantity)) * 100) : 0
    const taxAmount = Number(item.taxAmount) || 0
    const lineTotal = Number(item.lineTotal) || (quantity * unitPrice - discount + taxAmount)

    return {
      description: item.productName || 'کالا',
      quantity,
      unit: detectUnit(item),
      unitPrice,
      discount,
      taxRate,
      taxAmount,
      totalAmount: lineTotal,
    }
  })

  // ★ محاسبه جمع کل
  const totalDiscount = items.reduce((s, i) => s + i.discount, 0)
  const totalTax = items.reduce((s, i) => s + i.taxAmount, 0)
  const totalAmount = items.reduce((s, i) => s + i.totalAmount, 0)

  return {
    header: {
      taxid: seller.taxid,
      fiscalYear,
      invoiceDate: formatDate(invoice.invoiceDate),
      invoiceNumber: invoice.number,
      invoiceType: detectInvoiceType(invoice),
      invoiceSubject: detectInvoiceSubject(invoice),
      paymentType: mapPaymentType(invoice.paymentType),
      ...(cleanBuyer ? { buyer: cleanBuyer } : {}),
      seller: {
        taxid: seller.taxid,
        name: seller.name,
        address: seller.address,
        phone: seller.phone,
      },
    },
    body: {
      items,
      totalDiscount,
      totalTax,
      totalAmount,
    },
  }
}

/**
 * اعتبارسنجی payload قبل از ارسال به مودیان
 */
export function validateMoidianPayload(payload: MoidianInvoicePayload): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // ★ اعتبارسنجی header
  if (!payload.header.taxid || !/^\d{11}$/.test(payload.header.taxid)) {
    errors.push('شناسه مالیاتی فروشنده نامعتبر است (باید ۱۱ رقم باشد)')
  }
  if (!payload.header.fiscalYear) {
    errors.push('سال مالی مشخص نشده است')
  }
  if (!payload.header.invoiceDate) {
    errors.push('تاریخ فاکتور مشخص نشده است')
  }
  if (!payload.header.invoiceNumber) {
    errors.push('شماره فاکتور مشخص نشده است')
  }
  if (!payload.header.seller?.name) {
    errors.push('نام فروشنده مشخص نشده است')
  }

  // ★ اعتبارسنجی body
  if (!payload.body.items || payload.body.items.length === 0) {
    errors.push('فاکتور باید حداقل یک آیتم داشته باشد')
  } else {
    payload.body.items.forEach((item, idx) => {
      if (!item.description) {
        errors.push(`آیتم ${idx + 1}: شرح خالی است`)
      }
      if (item.quantity <= 0) {
        errors.push(`آیتم ${idx + 1}: تعداد باید بزرگتر از صفر باشد`)
      }
      if (item.unitPrice < 0) {
        errors.push(`آیتم ${idx + 1}: قیمت واحد نمی‌تواند منفی باشد`)
      }
    })
  }

  // ★ اعتبارسنجی buyer (در صورت وجود)
  if (payload.header.buyer?.taxid && !/^\d{11}$/.test(payload.header.buyer.taxid)) {
    errors.push('شناسه مالیاتی خریدار نامعتبر است (باید ۱۱ رقم باشد)')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
