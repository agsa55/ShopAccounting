'use client'

// ============================================================================
// src/components/pos/pos-page.tsx
// ShopAccounting v37 — POS Page (Cart + Top Search Bar)
// ============================================================================
// ★★★ v37 تغییرات:
//   ★ جستجو به‌عنوان نوار مستقل بالای سبد (همیشه visible — دسکتاپ و موبایل)
//   ★ F2 حالا کار می‌کند (فیلد همیشه در DOM است)
//   ★ dropdown لوک‌آپ زیر فیلد جستجو
//   ★ کلیک روی محصول در dropdown → افزودن فوری به سبد
//   ★ سبد فاکتور = ۱۰۰٪ عرض
//   ★ حذف کامل لیست محصولات
//   ★ حفظ فیلتر دسته‌بندی، بارکدخوان USB، دوربین
//   ★ تمام دیالوگ‌ها و امکانات حفظ شد
// ★★★ v34.1 تغییرات (حفظ شده):
//   ★ دیتا پیکر شمسی در مودال نسیه با همان تم یاسی صفحه گزارشات
//   ★ تقویم Popup کامپکت (200px) با گرادینت بنفش ملایم
//   ★ اصلاح الگوریتم تاریخ شمسی (الگوریتم استاندارد jalaali-js)
//   ★ الگوریتم استاندارد jalCal برای تشخیص کبیسه شمسی
//   ★ کلیک روی فیلد → باز شدن تقویم ماهانه، ناوبری ماه/سال
//   ★ دکمه «امروز» برای انتخاب سریع تاریخ جاری
//   ★ بستن با کلیک خارج
// ★★★ v34.1 تغییرات:
//   ★ مودال نسیه کمی بزرگتر (400px → 480px) با max-h و اسکرول
//   ★ تقویم کوچک‌تر و فشرده‌تر (240px → 200px، خانه‌های 20px)
//   ★ باز شدن تقویم رو به بالا (bottom: 100%) برای جلوگیری از بریده شدن
//   ★ سایه‌ها و فونت‌ها متناسب با اندازه جدید تنظیم شد
// ★ v26 ویژگی‌های حفظ‌شده:
//   ★ ردیف‌های لیست محصولات فشرده‌تر و حرفه‌ای‌تر
//   ★ ردیف‌های سبد فاکتور فوق‌فشرده با اسکرول روان برای 10+ آیتم
//   ★ بخش پایینی جمع‌وجور و مرتب
//   ★ طراحی کلی حرفه‌ای و زیبا با سایه‌ها و گرادیان‌های ظریف
// ★ v24 ویژگی‌های حفظ‌شده:
//   ★ نمایش لیستی/جدولی محصولات + نمای کارتی
//   ★ اعتبارسنجی موجودی هنگام افزودن به سبد و افزایش تعداد
//   ★ دیالوگ قسطی (Installment) با محاسبه اقساط و جدول زمان‌بندی
//   ★ دیالوگ نسیه (Credit) با انتخاب تاریخ سررسید و توضیحات
//   ★ نمایش موجودی باقیمانده در آیتم‌های سبد
//   ★ قیمت و تخفیف قابل ویرایش در هر آیتم سبد
//   ★ دکمه‌های رنگی نوع پرداخت
//   ★ تشخیص بارکد اسکنر
//   ★ محاسبه lineTotal با تخفیف و مالیات
// ============================================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useStore, type CartItem, type InstallmentPlanData } from '@/lib/store'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Search,
  Barcode,
  Plus,
  Minus,
  X,
  XCircle,
  Ban,
  Trash2,
  ShoppingCart,
  Printer,
  CheckCircle2,
  User,
  Package,
  AlertTriangle,
  Keyboard,
  WifiOff,
  Loader2,
  CreditCard,
  Banknote,
  Clock,
  CalendarClock,
  List,
  LayoutGrid,
  Calendar,
  FileText,
  Receipt,
  Percent,
  Lock,
  Crown,
  // ★★★ v3.36: آیکون‌های جدید برای اسکن دوربین و قالب‌های چاپ
  Camera,
  ScanLine,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
// ★★★ v3.36: import hook جستجوی تنبل + کامپوننت‌های جدید
import { usePosProductSearch } from '@/lib/use-pos-product-search'
import { BarcodeScannerModal } from '@/components/pos/barcode-scanner-modal'
// ★★★ v8.0: Universal POS Adapter برای اتصال کارتخوان
import {
  createPosAdapter,
  checkBrowserSupport,
  type PosAdapter,
  type CardPaymentResult,
  type PosAdapterConfig,
  type ReferenceCodeType,
  REFERENCE_CODE_TYPES,
} from '@/lib/pos-adapters'
// ★★★ v3.36.8: مودال چاپ مستقیماً داخل این فایل قرار گرفت (بدون وابستگی خارجی)
//   دیگر از thermal-receipt-print.tsx استفاده نمی‌کنیم

// ═══════════════════════════════════════════════════════════════
//  ★★★ v3.36.8: تایپ‌ها و توابع چاپ (inline)
// ═══════════════════════════════════════════════════════════════

type PrintTemplate = 'thermal-58mm' | 'thermal-80mm' | 'a4'

interface PrintReceiptData {
  invoiceNumber: string
  invoiceDate: string
  customerName: string
  cashierName?: string
  items: { productName: string; quantity: number; unitPrice: number; discount?: number; lineTotal: number; unitLabel?: string }[]
  subTotal: number
  discountAmount: number
  invoiceDiscountAmount?: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  remainingAmount: number
  paymentType: string
  paymentTypeLabel: string
  storeName: string
  storeAddress?: string
  storePhone?: string
  headerText?: string
  footerText?: string
  bankAccounts?: string
  logoData?: string
  currency?: string
}

function printToFa(n: number): string { return n.toLocaleString('fa-IR') }
function printEscapeHtml(s: string): string {
  if (s == null) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

// ★ تولید HTML برای پرینتر حرارتی 58mm
function generatePrintHtml58(data: PrintReceiptData): string {
  const currency = data.currency || 'ریال'
  const itemsHtml = data.items.map((item) => `
<div class="item">
  <div class="item-name">${printEscapeHtml(item.productName)}</div>
  <div class="item-meta"><span>${printToFa(item.quantity)} × ${printToFa(item.unitPrice)}</span><span>${printToFa(item.lineTotal)}</span></div>
</div>`).join('')
  return `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><title>رسید</title>
<style>
@page { size: 58mm auto; margin: 1mm; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Tahoma, sans-serif; font-size: 9px; width: 54mm; margin: 0 auto; color: #000; padding: 1mm; }
.header { text-align:center; margin-bottom:2mm; }
.header h1 { font-size:11px; font-weight:bold; }
.header .store { font-size:9px; margin-top:0.5mm; }
.sep { text-align:center; margin:1.5mm 0; border-bottom:1px dashed #999; }
.info { font-size:9px; margin:1mm 0; }
.info .row { margin:0.3mm 0; }
.info .label { display:inline-block; min-width:16mm; color:#555; }
.info .val { font-weight:bold; }
.item { padding:0.8mm 0; border-bottom:1px dotted #ccc; }
.item-name { font-size:9px; font-weight:bold; }
.item-meta { display:flex; justify-content:space-between; font-size:8.5px; margin-top:0.3mm; }
.totals { margin-top:1.5mm; font-size:9px; }
.totals .row { display:flex; justify-content:space-between; margin:0.4mm 0; }
.grand { border-top:1px solid #000; padding-top:1mm; margin-top:1mm; font-size:11px; font-weight:bold; }
.footer { text-align:center; font-size:8px; color:#444; margin-top:2mm; padding-top:1mm; border-top:1px solid #999; }
</style></head><body>
<div class="header">
  ${data.logoData ? `<img src="${data.logoData}" style="max-height:28px;max-width:50px;" />` : ''}
  <h1>${printEscapeHtml(data.headerText || 'فاکتور فروش')}</h1>
  <div class="store">${printEscapeHtml(data.storeName)}</div>
</div>
<div class="sep"></div>
<div class="info">
  <div class="row"><span class="label">شماره:</span><span class="val">${printEscapeHtml(data.invoiceNumber)}</span></div>
  <div class="row"><span class="label">تاریخ:</span><span class="val">${printEscapeHtml(data.invoiceDate)}</span></div>
  <div class="row"><span class="label">مشتری:</span><span class="val">${printEscapeHtml(data.customerName || 'فروش عمومی')}</span></div>
</div>
<div class="sep"></div>
${itemsHtml}
<div class="sep"></div>
<div class="totals">
  <div class="row"><span>جمع کل:</span><span>${printToFa(data.subTotal)} ${currency}</span></div>
  ${data.discountAmount > 0 ? `<div class="row"><span>تخفیف:</span><span>- ${printToFa(data.discountAmount)}</span></div>` : ''}
  ${data.taxAmount > 0 ? `<div class="row"><span>مالیات:</span><span>+ ${printToFa(data.taxAmount)}</span></div>` : ''}
  <div class="row grand"><span>قابل پرداخت:</span><span>${printToFa(data.totalAmount)} ${currency}</span></div>
</div>
<div class="footer">${printEscapeHtml(data.footerText || 'با تشکر از خرید شما')}</div>

</body></html>`
}

// ★ تولید HTML برای پرینتر حرارتی 80mm
function generatePrintHtml80(data: PrintReceiptData): string {
  const currency = data.currency || 'ریال'
  const itemsHtml = data.items.map((item) => `
<tr>
  <td style="width:50%;">${printEscapeHtml(item.productName)}</td>
  <td style="width:12%;text-align:center;">${printToFa(item.quantity)}</td>
  <td style="width:18%;text-align:left;font-family:monospace;">${printToFa(item.unitPrice)}</td>
  <td style="width:20%;text-align:left;font-family:monospace;font-weight:bold;">${printToFa(item.lineTotal)}</td>
</tr>`).join('')
  return `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><title>رسید</title>
<style>
@page { size: 80mm auto; margin: 2mm; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Tahoma, sans-serif; font-size: 10px; width: 76mm; margin: 0 auto; color: #000; padding: 1mm; }
.header { text-align:center; margin-bottom:2mm; border-bottom:2px solid #000; padding-bottom:1.5mm; }
.header h1 { font-size:13px; font-weight:bold; }
.header .store { font-size:11px; margin-top:0.5mm; font-weight:bold; }
.sep { text-align:center; margin:1.5mm 0; border-bottom:1px dashed #999; }
.info { font-size:10px; margin:1.5mm 0; }
.info .row { display:flex; justify-content:space-between; margin:0.5mm 0; }
.info .label { color:#555; }
.info .val { font-weight:bold; font-family:monospace; }
table { width:100%; border-collapse:collapse; margin:1mm 0; }
th { font-size:9px; text-align:right; padding:1mm; border-bottom:1px solid #000; background:#f0f0f0; }
td { font-size:9.5px; padding:0.8mm 1mm; border-bottom:1px dotted #ccc; vertical-align:top; }
.totals { margin-top:2mm; font-size:10px; }
.totals .row { display:flex; justify-content:space-between; margin:0.5mm 0; }
.grand { border-top:2px solid #000; padding-top:1.5mm; margin-top:1mm; font-size:12px; font-weight:bold; }
.footer { text-align:center; font-size:9px; color:#555; margin-top:2mm; padding-top:1.5mm; border-top:1px solid #999; }
</style></head><body>
<div class="header">
  ${data.logoData ? `<img src="${data.logoData}" style="max-height:35px;max-width:70px;" />` : ''}
  <h1>${printEscapeHtml(data.headerText || 'فاکتور فروش')}</h1>
  <div class="store">${printEscapeHtml(data.storeName)}</div>
</div>
<div class="info">
  <div class="row"><span class="label">شماره فاکتور:</span><span class="val">${printEscapeHtml(data.invoiceNumber)}</span></div>
  <div class="row"><span class="label">تاریخ:</span><span class="val">${printEscapeHtml(data.invoiceDate)}</span></div>
  <div class="row"><span class="label">مشتری:</span><span class="val">${printEscapeHtml(data.customerName || 'فروش عمومی')}</span></div>
</div>
<div class="sep"></div>
<table>
  <thead><tr><th>کالا</th><th>تعداد</th><th>قیمت</th><th>جمع</th></tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>
<div class="sep"></div>
<div class="totals">
  <div class="row"><span>جمع کل:</span><span>${printToFa(data.subTotal)} ${currency}</span></div>
  ${data.discountAmount > 0 ? `<div class="row"><span>تخفیف:</span><span>- ${printToFa(data.discountAmount)}</span></div>` : ''}
  ${data.taxAmount > 0 ? `<div class="row"><span>مالیات:</span><span>+ ${printToFa(data.taxAmount)}</span></div>` : ''}
  <div class="row grand"><span>قابل پرداخت:</span><span>${printToFa(data.totalAmount)} ${currency}</span></div>
</div>
<div class="footer">${printEscapeHtml(data.footerText || 'با تشکر از خرید شما')}</div>

</body></html>`
}

// ★★★ تولید HTML برای A4 (Portrait، وسط صفحه، multi-page)
function generatePrintHtmlA4(data: PrintReceiptData): string {
  const currency = data.currency || 'ریال'
  const primaryColor = '#059669'
  const itemsHtml = data.items.map((item, idx) => `
<tr>
  <td style="text-align:center;width:30px;">${printToFa(idx + 1)}</td>
  <td>${printEscapeHtml(item.productName)}</td>
  <td style="text-align:center;width:80px;">${printToFa(item.quantity)} ${item.unitLabel || ''}</td>
  <td style="text-align:left;width:100px;font-family:monospace;">${printToFa(item.unitPrice)}</td>
  <td style="text-align:left;width:80px;font-family:monospace;">${item.discount && item.discount > 0 ? printToFa(item.discount) : '—'}</td>
  <td style="text-align:left;width:120px;font-family:monospace;font-weight:bold;">${printToFa(item.lineTotal)}</td>
</tr>`).join('')
  return `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><title>فاکتور ${printEscapeHtml(data.invoiceNumber)}</title>
<style>
@page { size: A4 portrait; margin: 15mm; }
* { margin:0; padding:0; box-sizing:border-box; }
html, body { font-family: Tahoma, sans-serif; font-size: 11px; color: #333; background: #fff; }
/* ★★★ v3.36.9: body با flexbox برای وسط‌چین مطمئن */
body { display: flex; justify-content: center; min-height: 100vh; }
.page { width: 100%; max-width: 170mm; }
.header { background: ${primaryColor}; color: white; padding: 14px; border-radius: 6px 6px 0 0; display:flex; align-items:center; gap:12px; page-break-inside: avoid; }
.header img { max-height: 45px; max-width: 90px; }
.header h1 { font-size: 20px; margin-bottom: 4px; }
.header .meta { font-size: 11px; opacity: 0.9; }
.info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; padding:12px 14px; background:#f9f9f9; border-bottom:1px solid #ddd; page-break-inside: avoid; }
.info-item { font-size: 11px; }
.info-item .label { color: #666; margin-left: 5px; }
.info-item .value { font-weight: bold; }
table.items { width: 100%; border-collapse: collapse; margin: 12px 0; }
table.items thead { display: table-header-group; }
table.items th { background: ${primaryColor}15; color: ${primaryColor}; padding: 8px 10px; text-align: right; font-size: 11px; border-bottom: 2px solid ${primaryColor}; }
table.items td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
table.items tr { page-break-inside: avoid; }
/* ★★★ v3.36.9: وسط‌چین sections با margin auto */
.totals-section { margin: 12px auto 0; width: 280px; page-break-inside: avoid; }
.totals-section .row { display:flex; justify-content:space-between; padding:4px 0; font-size:11px; }
.grand-total { border-top:2px solid ${primaryColor}; padding-top:6px; margin-top:4px; font-weight:bold; font-size:13px; }
.payment-box { background:#fff8e1; border:1px solid #ffe082; border-radius:6px; padding:8px 10px; margin:12px auto 0; width:280px; font-size:11px; page-break-inside: avoid; }
.payment-box .row { display:flex; justify-content:space-between; padding:2px 0; }
.signature { display:flex; justify-content:space-between; margin:28px auto 0; width:280px; page-break-inside: avoid; }
.signature div { text-align:center; font-size:10px; color:#666; }
.signature div::before { content:''; display:block; width:180px; border-top:1px dashed #999; margin-bottom:4px; }
.footer { margin:24px auto 0; width:280px; padding-top:12px; border-top:1px solid #ddd; text-align:center; font-size:10px; color:#666; page-break-inside: avoid; }
@media print { body { font-size: 11px; display: block; } .page { margin: 0; } }
@media screen { body { background: #f0f0f0; padding: 20px; } .page { background: white; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 4px; } }
</style></head><body>
<div class="page">
  <div class="header">
    ${data.logoData ? `<img src="${data.logoData}" alt="logo" />` : ''}
    <div style="flex:1;">
      <h1>${printEscapeHtml(data.headerText || 'فاکتور فروش')}</h1>
      <div class="meta">${printEscapeHtml(data.storeName)}</div>
      ${data.storeAddress ? `<div class="meta">${printEscapeHtml(data.storeAddress)}</div>` : ''}
      ${data.storePhone ? `<div class="meta">تلفن: ${printEscapeHtml(data.storePhone)}</div>` : ''}
    </div>
  </div>
  <div class="info-grid">
    <div>
      <div class="info-item"><span class="label">شماره فاکتور:</span><span class="value">${printEscapeHtml(data.invoiceNumber)}</span></div>
      <div class="info-item" style="margin-top:4px;"><span class="label">تاریخ:</span><span class="value">${printEscapeHtml(data.invoiceDate)}</span></div>
    </div>
    <div>
      <div class="info-item"><span class="label">مشتری:</span><span class="value">${printEscapeHtml(data.customerName || 'فروش عمومی')}</span></div>
      ${data.cashierName ? `<div class="info-item" style="margin-top:4px;"><span class="label">صندوق‌دار:</span><span class="value">${printEscapeHtml(data.cashierName)}</span></div>` : ''}
    </div>
  </div>
  <table class="items">
    <thead><tr><th>#</th><th>کالا</th><th>تعداد</th><th>قیمت واحد</th><th>تخفیف</th><th>مبلغ کل</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="totals-section">
    <div class="row"><span>جمع کل:</span><span>${printToFa(data.subTotal)} ${currency}</span></div>
    ${data.discountAmount > 0 ? `<div class="row"><span>تخفیف آیتم‌ها:</span><span>- ${printToFa(data.discountAmount)}</span></div>` : ''}
    ${data.invoiceDiscountAmount && data.invoiceDiscountAmount > 0 ? `<div class="row"><span>تخفیف فاکتور:</span><span>- ${printToFa(data.invoiceDiscountAmount)}</span></div>` : ''}
    ${data.taxAmount > 0 ? `<div class="row"><span>مالیات:</span><span>+ ${printToFa(data.taxAmount)}</span></div>` : ''}
    <div class="grand-total" style="display:flex;justify-content:space-between;"><span>قابل پرداخت:</span><span>${printToFa(data.totalAmount)} ${currency}</span></div>
  </div>
  <div class="payment-box">
    <div class="row"><span>روش پرداخت:</span><span style="font-weight:bold;">${printEscapeHtml(data.paymentTypeLabel)}</span></div>
    ${data.paidAmount > 0 ? `<div class="row"><span>پرداخت شده:</span><span>${printToFa(data.paidAmount)} ${currency}</span></div>` : ''}
    ${data.remainingAmount > 0 ? `<div class="row"><span>باقیمانده:</span><span style="color:#c00;">${printToFa(data.remainingAmount)} ${currency}</span></div>` : ''}
  </div>
  <div class="signature"><div>مهر و امضای فروشنده</div><div>امضای مشتری</div></div>
  <div class="footer">
    <div style="font-weight:bold;margin-bottom:4px;">${printEscapeHtml(data.footerText || 'با تشکر از خرید شما')}</div>
    <div style="color:#999;font-size:9px;">ShopAccounting</div>
  </div>
</div>

</body></html>`
}

// ★ تابع تولید HTML بر اساس قالب
function generatePrintHtml(template: PrintTemplate, data: PrintReceiptData): string {
  if (template === 'thermal-58mm') return generatePrintHtml58(data)
  if (template === 'thermal-80mm') return generatePrintHtml80(data)
  return generatePrintHtmlA4(data)
}

// ============ Types ============

interface Product {
  id: string
  code: string
  barcode: string | null
  name: string
  categoryId: string | null
  unitId?: string | null
  purchasePrice: number
  salePrice: number
  taxRate: number
  currentStock: number
  minStock: number
  isActive: boolean
  category?: { id: string; name: string } | null
  unit?: { id: string; name: string; nameFa: string; symbol: string | null } | null
}

interface Customer {
  id: string
  code: string
  firstName: string
  lastName: string
  mobile: string | null
  currentBalance: number
  isBlacklisted: boolean
}

interface Category {
  id: string
  name: string
  productCount: number
}

interface InstallmentScheduleItem {
  number: number
  amount: number
  dueDate: string
}

interface CreditData {
  dueDate: string
  description: string
}

// ============ Units Map ============

const UNITS_MAP: Record<string, { nameFa: string; symbol: string }> = {
  'unit-piece': { nameFa: 'عدد', symbol: 'عدد' },
  'unit-box': { nameFa: 'جعبه', symbol: 'جعبه' },
  'unit-carton': { nameFa: 'کارتن', symbol: 'کارتن' },
  'unit-pack': { nameFa: 'بسته', symbol: 'بسته' },
  'unit-kg': { nameFa: 'کیلوگرم', symbol: 'کگ' },
  'unit-g': { nameFa: 'گرم', symbol: 'گ' },
  'unit-liter': { nameFa: 'لیتر', symbol: 'لی' },
  'unit-ml': { nameFa: 'میلی‌لیتر', symbol: 'ملی' },
  'unit-meter': { nameFa: 'متر', symbol: 'م' },
  'unit-cm': { nameFa: 'سانتی‌متر', symbol: 'سم' },
  'unit-m2': { nameFa: 'مترمربع', symbol: 'م²' },
  'unit-ton': { nameFa: 'تن', symbol: 'تن' },
  'unit-roll': { nameFa: 'رول', symbol: 'رول' },
  'unit-bundle': { nameFa: 'دسته', symbol: 'دسته' },
  'unit-dozen': { nameFa: 'جین', symbol: 'جین' },
  'unit-set': { nameFa: 'ست', symbol: 'ست' },
  'unit-pair': { nameFa: 'جفت', symbol: 'جفت' },
  'unit-sachet': { nameFa: 'بسته کوچک', symbol: 'بستک' },
  'unit-crate': { nameFa: 'جعبه چوبی', symbol: 'جچوب' },
  'unit-bag': { nameFa: 'کیسه', symbol: 'کیسه' },
}

function getUnitLabel(product: Product): string {
  if (product.unit?.nameFa) {
    return product.unit.symbol || product.unit.nameFa
  }
  if (product.unitId && UNITS_MAP[product.unitId]) {
    return UNITS_MAP[product.unitId].symbol || UNITS_MAP[product.unitId].nameFa
  }
  return 'عدد'
}

function getUnitNameFa(product: Product): string {
  if (product.unit?.nameFa) {
    return product.unit.nameFa
  }
  if (product.unitId && UNITS_MAP[product.unitId]) {
    return UNITS_MAP[product.unitId].nameFa
  }
  return 'عدد'
}

// ============ Format helpers ============

function formatPrice(price: number): string {
  return price.toLocaleString('fa-IR')
}

// ★ v26: تبدیل عدد لاتین به فارسی (برای نمایش تعداد و اعداد سبد)
function toFaNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

// ★ v26.3: تبدیل عدد فارسی به لاتین (برای استخراج مقدار ورودی)
function toEnNum(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
}

// ★★★ v34: تبدیل تاریخ میلادی به شمسی (الگوریتم استاندارد jalaali-js) ★★★
function div(a: number, b: number): number { return Math.floor(a / b) }
function mod(a: number, b: number): number { return a - Math.floor(a / b) * b }

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy: number
  if (gy > 1600) { jy = 979; gy -= 1600 } else { jy = 0; gy -= 621 }
  const gy2 = gm > 2 ? gy + 1 : gy
  let days = 365 * gy
    + div(gy2 + 3, 4)
    - div(gy2 + 99, 100)
    + div(gy2 + 399, 400)
    - 80
    + gd
    + g_d_m[gm - 1]
  jy += 33 * div(days, 12053)
  days = mod(days, 12053)
  jy += 4 * div(days, 1461)
  days = mod(days, 1461)
  if (days > 365) {
    jy += div(days - 1, 365)
    days = mod(days - 1, 365)
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30)
  const jd = 1 + (days < 186 ? mod(days, 31) : mod(days - 186, 30))
  return [jy, jm, jd]
}

function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  let gy: number
  if (jy > 979) { gy = 1600; jy -= 979 } else { gy = 621 }
  let days = 365 * jy
    + div(jy, 33) * 8
    + div(mod(jy, 33) + 3, 4)
    + 78
    + jd
    + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186)
  gy += 400 * div(days, 146097)
  days = mod(days, 146097)
  if (days > 36524) {
    gy += 100 * div(--days, 36524)
    days = mod(days, 36524)
    if (days >= 365) days++
  }
  gy += 4 * div(days, 1461)
  days = mod(days, 1461)
  if (days > 365) {
    gy += div(days - 1, 365)
    days = mod(days - 1, 365)
  }
  let gd = days + 1
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm: number
  for (gm = 0; gm < 13; gm++) {
    const v = sal_a[gm]
    if (gd <= v) break
    gd -= v
  }
  return [gy, gm, gd]
}

// ★★★ v34: الگوریتم استاندارد jalCal برای تشخیص کبیسه شمسی ★★★
function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
  const bl = breaks.length
  const gy = jy + 621
  let leapJ = -14
  let jp = breaks[0]
  let jm = 0, jump = 0, leap = 0, n = 0
  if (jy < jp || jy >= breaks[bl - 1]) throw new Error('Invalid Jalaali year ' + jy)
  for (let i = 1; i < bl; i += 1) {
    jm = breaks[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }
  n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4
  return { leap, gy, march }
}

function isJalaliLeapYear(jy: number): boolean {
  return jalCal(jy).leap === 0
}

function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isJalaliLeapYear(jy) ? 30 : 29
}

// ★ تبدیل ISO date به رشته شمسی
function formatDateToJalali(isoDate: string): string {
  const d = new Date(isoDate)
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return `${toFaNum(jy)}/${toFaNum(jm).padStart(2, '۰')}/${toFaNum(jd).padStart(2, '۰')}`
}

// ★ نام ماه‌های شمسی
const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
]

function formatDateToJalaliLong(isoDate: string): string {
  const d = new Date(isoDate)
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return `${toFaNum(jd)} ${JALALI_MONTHS[jm - 1]} ${toFaNum(jy)}`
}

function getStockColor(stock: number, minStock: number): string {
  if (stock <= 0) return 'text-red-500'
  if (stock <= minStock * 0.5) return 'text-red-500'
  if (stock <= minStock) return 'text-amber-500'
  return 'text-emerald-500'
}

function getStockDot(stock: number, minStock: number): string {
  if (stock <= 0) return 'bg-red-400'
  if (stock <= minStock * 0.5) return 'bg-red-400'
  if (stock <= minStock) return 'bg-amber-400'
  return 'bg-emerald-400'
}

function getStockLabel(stock: number, minStock: number): string {
  if (stock <= 0) return 'ناموجود'
  if (stock <= minStock * 0.5) return 'بحرانی'
  if (stock <= minStock) return 'کم'
  return `${formatPrice(stock)}`
}

// ★★★ Compute installment schedule ★★★
function computeInstallmentSchedule(
  totalAmount: number,
  downPayment: number,
  numberOfInstallments: number,
  interestRate: number,
  period: 'monthly' | 'biweekly' | 'weekly'
): { schedule: InstallmentScheduleItem[]; installmentAmount: number; totalWithInterest: number; remainingAmount: number } {
  const remainingAmount = totalAmount - downPayment
  const interestMultiplier = 1 + interestRate / 100
  const totalWithInterest = Math.round(downPayment + remainingAmount * interestMultiplier)
  const remainingWithInterest = Math.round(remainingAmount * interestMultiplier)
  const installmentAmount = numberOfInstallments > 0 ? Math.round(remainingWithInterest / numberOfInstallments) : 0
  const lastInstallment = remainingWithInterest - installmentAmount * (numberOfInstallments - 1)

  const schedule: InstallmentScheduleItem[] = []
  const now = new Date()

  for (let i = 0; i < numberOfInstallments; i++) {
    const dueDate = new Date(now)
    if (period === 'monthly') {
      dueDate.setMonth(dueDate.getMonth() + i + 1)
    } else if (period === 'biweekly') {
      dueDate.setDate(dueDate.getDate() + (i + 1) * 14)
    } else {
      dueDate.setDate(dueDate.getDate() + (i + 1) * 7)
    }

    schedule.push({
      number: i + 1,
      amount: i === numberOfInstallments - 1 ? lastInstallment : installmentAmount,
      dueDate: dueDate.toISOString().split('T')[0],
    })
  }

  return { schedule, installmentAmount, totalWithInterest, remainingAmount }
}

// ============ Payment type config ============

type PaymentTypeKey = 'Cash' | 'Card' | 'Credit' | 'Installment' | 'Check'

const paymentTypeConfig: {
  value: PaymentTypeKey
  label: string
  icon: React.ElementType
  color: string        // ★ رنگ اصلی هر نوع
  activeBg: string     // ★ پس‌زمینه فعال
  activeBorder: string // ★ حاشیه فعال
  activeText: string   // ★ متن فعال
  activeDot: string    // ★ دایره رادیو فعال
  inactiveBg: string
  inactiveBorder: string
  inactiveText: string
  hoverBg: string
}[] = [
  {
    value: 'Cash',
    label: 'نقدی',
    icon: Banknote,
    color: 'emerald',
    activeBg: 'bg-emerald-50',
    activeBorder: 'border-emerald-400',
    activeText: 'text-emerald-700',
    activeDot: 'border-emerald-500 after:bg-emerald-500',
    inactiveBg: 'bg-white',
    inactiveBorder: 'border-slate-200',
    inactiveText: 'text-slate-400',
    hoverBg: 'hover:bg-emerald-50/50',
  },
  {
    value: 'Card',
    label: 'کارتخوان',
    icon: CreditCard,
    color: 'blue',
    activeBg: 'bg-blue-50',
    activeBorder: 'border-blue-400',
    activeText: 'text-blue-700',
    activeDot: 'border-blue-500 after:bg-blue-500',
    inactiveBg: 'bg-white',
    inactiveBorder: 'border-slate-200',
    inactiveText: 'text-slate-400',
    hoverBg: 'hover:bg-blue-50/50',
  },
  {
    value: 'Credit',
    label: 'نسیه',
    icon: Clock,
    color: 'orange',
    activeBg: 'bg-orange-50',
    activeBorder: 'border-orange-400',
    activeText: 'text-orange-700',
    activeDot: 'border-orange-500 after:bg-orange-500',
    inactiveBg: 'bg-white',
    inactiveBorder: 'border-slate-200',
    inactiveText: 'text-slate-400',
    hoverBg: 'hover:bg-orange-50/50',
  },
  {
    value: 'Installment',
    label: 'قسطی',
    icon: CalendarClock,
    color: 'purple',
    activeBg: 'bg-purple-50',
    activeBorder: 'border-purple-400',
    activeText: 'text-purple-700',
    activeDot: 'border-purple-500 after:bg-purple-500',
    inactiveBg: 'bg-white',
    inactiveBorder: 'border-slate-200',
    inactiveText: 'text-slate-400',
    hoverBg: 'hover:bg-purple-50/50',
  },
  {
    value: 'Check',
    label: 'چک',
    icon: FileText,
    color: 'cyan',
    activeBg: 'bg-cyan-50',
    activeBorder: 'border-cyan-400',
    activeText: 'text-cyan-700',
    activeDot: 'border-cyan-500 after:bg-cyan-500',
    inactiveBg: 'bg-white',
    inactiveBorder: 'border-slate-200',
    inactiveText: 'text-slate-400',
    hoverBg: 'hover:bg-cyan-50/50',
  },
]

// ============ Helper: compute line total ============

function computeLineTotal(
  quantity: number,
  unitPrice: number,
  discount: number,
  taxRate: number
): number {
  const base = quantity * unitPrice
  const afterDiscount = base * (1 - discount / 100)
  const afterTax = afterDiscount * (1 + taxRate / 100)
  return Math.round(afterTax)
}

// ============ Helper: get tenant ID ============

function getTenantIdFromStore(): string | null {
  try {
    const state = useStore.getState()
    return state.tenantId || state.user?.tenantId || null
  } catch {
    return null
  }
}

// ============ Helper: get auth headers ============
//   ★★★ v7.5.1: ضروری برای API‌های محافظت‌شده با withTenantAndPermission
//   بدون این هدر، میدل‌ور tenant را استخراج نمی‌کند و درخواست 401/403 برمی‌گرداند.
//   این تابع قبلاً فراموش شده بود و باعث می‌شد جستجوی مشتری در صندوق فروش کار نکند.

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ============ Main Component ============

export default function PosPage() {
  const { toast } = useToast()
  const searchInputRef = useRef<HTMLInputElement>(null)

  const hasHydrated = useStore((s) => s._hasHydrated)

  // Store — POS state
  const cart = useStore((s) => s.cart) ?? []
  const selectedCustomerId = useStore((s) => s.selectedCustomerId)
  const selectedCustomerName = useStore((s) => s.selectedCustomerName)
  // ★ v26: paymentType ممکنه null باشه — تا انتخاب نشده دکمه تأیید غیرفعال
  const paymentType = useStore((s) => s.paymentType)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const addToCart = useStore((s) => s.addToCart) ?? (() => {})
  const removeFromCart = useStore((s) => s.removeFromCart) ?? (() => {})
  const updateCartItemQuantity = useStore((s) => s.updateCartItemQuantity) ?? (() => {})
  const clearCart = useStore((s) => s.clearCart) ?? (() => {})
  const setCustomer = useStore((s) => s.setCustomer) ?? (() => {})
  const setPaymentType = useStore((s) => s.setPaymentType) ?? (() => {})
  const isOnline = useStore((s) => s.isOnline) ?? true

  const setInstallmentPlan = useStore((s) => s.setInstallmentPlan) ?? (() => {})

  const storeName = useStore((s) => s.storeName)
  const user = useStore((s) => s.user)

  // ★★★ v27: Feature gating بر اساس پلن ★★★
  const planName = useStore((s) => s.planName)
  const planFeatures = useMemo(() => getFeaturesByPlanName(planName), [planName])

  // ★★★ v27: فیلتر روش‌های پرداخت بر اساس پلن ★★★
  // پایه: فقط نقدی | حرفه‌ای: همه | سازمانی: همه
  const allowedPaymentTypes = useMemo(() => {
    const allowed = planFeatures.posPaymentTypes // ['cash'] | ['cash','card','credit','installment']
    return paymentTypeConfig.filter((pt) => {
      const key = pt.value.toLowerCase()
      return allowed.includes(key as any)
    })
  }, [planFeatures])

  // Data state
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Local state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  // ★★★ v3.13: state برای دیالوگ چاپ و انتخاب قالب
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [printTemplate, setPrintTemplate] = useState<'a4' | '8cm'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('invoice-template-settings')
      if (saved) {
        try {
          const s = JSON.parse(saved)
          return s.defaultTemplate === '8cm' ? '8cm' : 'a4'
        } catch {}
      }
    }
    return 'a4'
  })
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  // Installment dialog state
  const [installmentDialogOpen, setInstallmentDialogOpen] = useState(false)
  const [installmentDownPayment, setInstallmentDownPayment] = useState(0)
  const [installmentCount, setInstallmentCount] = useState(3)
  const [installmentInterestRate, setInstallmentInterestRate] = useState(0)
  const [installmentPeriod, setInstallmentPeriod] = useState<'monthly' | 'biweekly' | 'weekly'>('monthly')

  // Credit dialog state
  const [creditDialogOpen, setCreditDialogOpen] = useState(false)
  const [creditDueDate, setCreditDueDate] = useState('')
  const [creditDescription, setCreditDescription] = useState('')

  // ★★★ v8.0: Card payment dialog state — اتصال به کارتخوان
  const [cardPaymentDialogOpen, setCardPaymentDialogOpen] = useState(false)
  const [cardPaymentStatus, setCardPaymentStatus] = useState<'idle' | 'connecting' | 'waiting_card' | 'verifying' | 'success' | 'failed' | 'cancelled' | 'timeout'>('idle')
  const [cardPaymentMessage, setCardPaymentMessage] = useState('')
  const [cardPaymentResult, setCardPaymentResult] = useState<CardPaymentResult | null>(null)
  const [activePosDevice, setActivePosDevice] = useState<any>(null)
  const [posAdapterInstance, setPosAdapterInstance] = useState<PosAdapter | null>(null)
  // ★ فرم ورودی دستی (وقتی terminalType = manual)
  const [manualReferenceNumber, setManualReferenceNumber] = useState('')
  const [manualReferenceType, setManualReferenceType] = useState<ReferenceCodeType>('rrn')
  const [manualCardLast4, setManualCardLast4] = useState('')
  const [manualCardType, setManualCardType] = useState('')

  // ★ v26.4: override مالیات — کاربر می‌تونه مبلغ مالیات رو دستی تغییر بده
  const [taxOverrideAmount, setTaxOverrideAmount] = useState<number | null>(null)

  // Barcode scanner detection state
  const lastKeyTimeRef = useRef<number>(0)
  const barcodeBufferRef = useRef<string>('')

  // ★★★ v37: state جستجوی لوک‌آپ (dropdown) — کنترل باز/بسته شدن
  //   دیگر نیازی به showMobileCart نیست چون جستجو همیشه visible است

  // ★★★ v3.36: state جدید — اسکن دوربین + دیالوگ چاپ حرارتی
  const [scannerOpen, setScannerOpen] = useState(false)
  const [thermalPrintOpen, setThermalPrintOpen] = useState(false)
  const [thermalPrintTemplate, setThermalPrintTemplate] = useState<PrintTemplate>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('invoice-template-settings')
      if (saved) {
        try {
          const s = JSON.parse(saved)
          // ★ مپ کردن template قدیمی به جدید
          if (s.defaultTemplate === '8cm') return 'thermal-80mm'
        } catch {}
      }
    }
    return 'thermal-80mm'
  })
  // ★★★ v3.36.6: ref برای ذخیره receiptData موقت هنگام چاپ خودکار
  //   (چون سبد بعد از ثبت پاک می‌شود، receiptData اصلی دیگر معتبر نیست)
  const pendingAutoPrintDataRef = useRef<PrintReceiptData | null>(null)
  // ★ state برای مشخص کردن اینکه آیا مودال چاپ به‌صورت خودکار باز شده یا دستی
  const [autoPrintMode, setAutoPrintMode] = useState(false)

  // ★★★ v6.1: انبار + لود تنبل مشتریان
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([])
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false)
  // ★★★ v3.36.8: قالب انتخاب‌شده در مودال چاپ (جدید - inline)
  const [selectedPrintTemplate, setSelectedPrintTemplate] = useState<PrintTemplate>('thermal-80mm')
  const [printSubmitting, setPrintSubmitting] = useState(false)

  // ★★★ v3.36.8: هنگام باز شدن مودال چاپ، قالب پیش‌فرض را ست کن
  useEffect(() => {
    if (thermalPrintOpen) {
      setSelectedPrintTemplate(thermalPrintTemplate)
      setPrintSubmitting(false)
    }
  }, [thermalPrintOpen, thermalPrintTemplate])

  // ★★★ v3.36.9: handleDoPrint و previewHtml به بعد از تعریف receiptData منتقل شدند (رفع خطای hoisting)

  // ★★★ v3.36: hook جستجوی تنبل — جایگزینِ بارگذاری همه محصولات در لود اولیه
  // ★★★ v3.36.1: destructure توابع stable از hook برای جلوگیری از infinite loop
  //   اگر `posSearch` را مستقیم در deps بگذاریم، چون در هر رندر یک آبجکت جدید است،
  //   loadData هر بار دوباره ساخته می‌شود و useEffect مدام اجرا می‌شود.
  //   اما loadRecents / lookupByBarcode / lookupByCode همگی با useCallback([]) ساخته
  //   شده‌اند و stable هستند.
  const {
    searchQuery: posSearchQuery,
    setSearchQuery: posSearchSetQuery,
    searchResults: posSearchResults,
    searchStatus: posSearchStatus,
    lookupByBarcode: posLookupByBarcode,
    lookupByCode: posLookupByCode,
    recents: posRecents,
    loadRecents: posLoadRecents,
    recentsLoading: posRecentsLoading,
  } = usePosProductSearch()

  // ============ Load Data from API ============

  const loadData = useCallback(async () => {
    setLoading(true)
    const tenantId = getTenantIdFromStore()
    if (!tenantId) {
      setLoading(false)
      return
    }

    try {
      // ★★★ v3.36: تغییر اساسی — بارگذاری محصولات به‌صورت LAZY
      //   قبلاً:  GET /api/products?limit=9999  (بار سنگین روی DB + frontend)
      //   اکنون: ۱) فقط categories (سبک)
      //         ۲) ۲۰ محصول اخیر از طریق hook (اختیاری، سبک)
      //   محصول هنگام نیاز (جستجو یا اسکن بارکد) fetch می‌شود.

      const categoriesRes = await fetch(`/api/categories?tenantId=${tenantId}`)
      if (categoriesRes.ok) {
        const data = await categoriesRes.json()
        if (data.success) {
          const cats = Array.isArray(data.data) ? data.data : (data.data?.categories || [])
          setCategories(
            cats.map((c: any) => ({
              id: c.id,
              name: c.name,
              productCount: c.productCount || 0,
            }))
          )
        }
      }

      // ★★★ v6.1: لود انبارها
      const whRes = await fetch(`/api/warehouses?tenantId=${tenantId}`)
      if (whRes.ok) {
        const whData = await whRes.json()
        if (whData.success) {
          setWarehouses(whData.data || [])
          const defaultWh = whData.data?.find((w: any) => w.isDefault)
          if (defaultWh) setSelectedWarehouseId(defaultWh.id)
          else if (whData.data?.length > 0) setSelectedWarehouseId(whData.data[0].id)
        }
      }

      // ★★★ v6.1: فقط ۵ مشتری اخیر
      const customersRes = await fetch(`/api/customers?tenantId=${tenantId}&limit=5`)
      if (customersRes.ok) {
        const data = await customersRes.json()
        if (data.success) {
          const custs = Array.isArray(data.data) ? data.data : (data.data?.customers || [])
          setCustomers(custs)
        }
      }

      // ★ بارگذاری ۲۰ محصول اخیر برای نمایش اولیه (در صورت موجود بودن endpoint)
      //   اگر endpoint پشتیبانی نشد، فقط وقتی کاربر جستجو کرد محصول لود می‌شود.
      await posLoadRecents()
    } catch (error) {
      console.error('Error loading POS data:', error)
    }
    setLoading(false)
    // ★★★ v3.36.1: deps خالی — posLoadRecents از useCallback([]) در hook است و stable است
    //   قرار دادن posSearch در deps باعث infinite loop می‌شد.
  }, [posLoadRecents])

  // ★★★ v7.5.1: جستجوی تنبل طرفین حساب (یکپارچه - فقط مشتریان)
  //   ★ رفع باگ: getAuthHeaders() قبلاً تعریف نشده بود → ReferenceError → جستجو کار نمی‌کرد
  //   ★ اضافه شد: tenantId در query string به‌عنوان fallback برای میدل‌ور
  //   ★ اضافه شد: لاگ خطا برای دیباگ آینده
  useEffect(() => {
    const term = customerSearch.trim()
    if (term.length < 2) {
      setCustomerSearchResults([])
      setCustomerSearchLoading(false)
      return
    }
    const tid = getTenantIdFromStore()
    if (!tid) {
      setCustomerSearchResults([])
      return
    }
    setCustomerSearchLoading(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        // ★★★ v7.5: استفاده از API یکپارچه طرف حساب (فقط مشتریان)
        //   tenantId هم در query است (برای fallback) و هم در Authorization header
        const res = await fetch(
          `/api/contacts?type=customer&search=${encodeURIComponent(term)}&tenantId=${encodeURIComponent(tid)}`,
          { headers: getAuthHeaders() }
        )
        if (!res.ok) {
          console.warn('[POS] /api/contacts failed:', res.status, res.statusText, '— fallback to /api/customers')
          // ★ fallback: اگه /api/contacts کار نکرد، از /api/customers استفاده کن
          const fallbackRes = await fetch(`/api/customers?tenantId=${tid}&search=${encodeURIComponent(term)}&limit=20`)
          if (!fallbackRes.ok) {
            if (!cancelled) setCustomerSearchResults([])
            return
          }
          const fallbackData = await fallbackRes.json()
          if (cancelled) return
          const list = fallbackData.success ? (Array.isArray(fallbackData.data) ? fallbackData.data : (fallbackData.data?.customers || [])) : []
          if (!cancelled) setCustomerSearchResults(list)
          return
        }
        const data = await res.json()
        if (cancelled) return
        // ★★★ v7.5.2: لاگ برای دیباگ — در کنسول مرورگر قابل مشاهده است
        console.log('[POS] /api/contacts response:', { success: data.success, count: data.data?.length, summary: data.summary, sample: data.data?.[0] })
        if (data.success) {
          setCustomerSearchResults(data.data || [])
        } else {
          setCustomerSearchResults([])
        }
      } catch (err) {
        console.error('[POS] customer search error:', err)
        if (!cancelled) setCustomerSearchResults([])
      } finally {
        if (!cancelled) setCustomerSearchLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [customerSearch])

  // ★★★ v3.36.1: ref برای جلوگیری از اجرای چندباره useEffect در StrictMode و re-render
  const didInitRef = useRef(false)
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    loadData()
  }, [loadData])

  // ★ v26: ریست نوع پرداخت هنگام لود صفحه — کاربر باید خودش انتخاب کنه
  useEffect(() => {
    setPaymentType(null as any)
    setTaxOverrideAmount(null)  // ★ v26.4: ریست override مالیات
    setInvoiceDiscountPercent('')  // ★★★ v3.21: ریست تخفیف کلی
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ★ v26.4: وقتی آیتم‌های سبد تغییر کردن، override مالیات باطل بشه
  // تا محاسبه خودکار مجدد اعمال بشه
  const cartItemsSignature = cart.map(c => `${c.productId}:${c.quantity}:${c.unitPrice}:${c.discount}`).join('|')
  useEffect(() => {
    setTaxOverrideAmount(null)
  }, [cartItemsSignature])

  // ============ Derived data ============

  const filteredProducts = useMemo(() => {
    // ★★★ v3.36: منبع محصولات تغییر کرد
    //   ۱) اگر کاربر در حال جستجوست → نتایج سرور (lazy) را نشان بده
    //   ۲) اگر دسته خاصی انتخاب شده → فقط recents فیلتر شده با دسته
    //   ۳) اگر هیچ کدوم → recents (۲۰ محصول اخیر) یا آرایه خالی
    const searchQ = posSearchQuery.trim()

    if (searchQ.length >= 2) {
      // ★ کاربر در حال جستجوست → نتایج سرور
      let filtered = posSearchResults.filter((p) => p.isActive)

      if (selectedCategory !== 'all') {
        filtered = filtered.filter((p) => p.categoryId === selectedCategory)
      }

      return filtered
    }

    // ★ حالت پیش‌فرض — recents (محصولات اخیر)
    let filtered = posRecents.filter((p) => p.isActive)

    if (selectedCategory !== 'all') {
      filtered = filtered.filter((p) => p.categoryId === selectedCategory)
    }

    return filtered
  }, [posSearchQuery, posSearchResults, posRecents, selectedCategory])

  // ★★★ v3.21: state برای تخفیف کلی فاکتور (درصد)
  const [invoiceDiscountPercent, setInvoiceDiscountPercent] = useState<string>('')

  const cartTotals = useMemo(() => {
    let subTotal = 0
    let totalDiscount = 0
    let totalTax = 0

    for (const item of cart) {
      const base = item.quantity * item.unitPrice
      const discountAmt = Math.round(base * (item.discount / 100))
      const afterDiscount = base - discountAmt
      const taxAmt = Math.round(afterDiscount * (item.taxRate / 100))
      subTotal += base
      totalDiscount += discountAmt
      totalTax += taxAmt
    }

    // ★ v26.4: اگه کاربر مالیات رو دستی تنظیم کرده، همون مقدار اعمال بشه
    const finalTax = taxOverrideAmount !== null ? taxOverrideAmount : totalTax

    // ★★★ v3.21: محاسبه تخفیف کلی فاکتور
    const discountPercent = parseFloat(invoiceDiscountPercent) || 0
    const invoiceDiscountAmount = discountPercent > 0 ? Math.round((subTotal - totalDiscount) * (discountPercent / 100)) : 0

    const totalAmount = subTotal - totalDiscount - invoiceDiscountAmount + finalTax
    return { subTotal, discountAmount: totalDiscount, invoiceDiscountAmount, invoiceDiscountPercent: discountPercent, taxAmount: finalTax, totalAmount, computedTax: totalTax }
  }, [cart, taxOverrideAmount, invoiceDiscountPercent])

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  )

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const installmentCalc = useMemo(() => {
    if (cartTotals.totalAmount <= 0) return null
    return computeInstallmentSchedule(
      cartTotals.totalAmount,
      installmentDownPayment,
      installmentCount,
      installmentInterestRate,
      installmentPeriod
    )
  }, [cartTotals.totalAmount, installmentDownPayment, installmentCount, installmentInterestRate, installmentPeriod])

  // ============ Handlers ============

  const handleAddToCart = useCallback(
    (product: Product) => {
      if (product.currentStock <= 0) {
        toast({
          title: 'محصول ناموجود است',
          description: `${product.name} در انبار موجود نیست`,
          variant: 'destructive',
        })
        return
      }

      // ★★★ v3.36: cache محصول در state محلی products
      //   چون بارگذاری first-load حذف شد، اینجا محصول را در cache نگه می‌داریم
      //   تا مرجعِ unitLabel و currentStock در سبد کار کند.
      setProducts((prev) => {
        if (prev.find((p) => p.id === product.id)) return prev
        return [...prev, product]
      })

      const existingItem = cart.find((c) => c.productId === product.id)
      if (existingItem && existingItem.quantity >= product.currentStock) {
        toast({
          title: 'موجودی کافی نیست',
          description: `موجودی فعلی: ${formatPrice(product.currentStock)} ${getUnitLabel(product)}`,
          variant: 'destructive',
        })
        return
      }

      if (typeof addToCart !== 'function') {
        console.warn('[POS] addToCart is not a function yet — store not hydrated')
        toast({ title: 'لطفاً صبر کنید', description: 'سیستم در حال بارگذاری است' })
        return
      }

      const lineTotal = computeLineTotal(1, product.salePrice, 0, product.taxRate)

      addToCart({
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.salePrice,
        discount: 0,
        taxRate: product.taxRate,
        lineTotal,
        currentStock: product.currentStock,
        unitLabel: getUnitLabel(product),
      })
    },
    [addToCart, cart, toast]
  )

  const handleIncreaseQuantity = useCallback(
    (productId: string) => {
      const item = cart.find((c) => c.productId === productId)
      if (item) {
        const product = products.find((p) => p.id === productId)
        const maxStock = product?.currentStock ?? item.currentStock ?? Infinity
        const newQty = item.quantity + 1

        if (newQty > maxStock) {
          toast({
            title: 'موجودی کافی نیست',
            description: `موجودی فعلی: ${formatPrice(maxStock)} ${product ? getUnitLabel(product) : item.unitLabel || 'عدد'}`,
            variant: 'destructive',
          })
          return
        }

        const newLineTotal = computeLineTotal(newQty, item.unitPrice, item.discount, item.taxRate)
        useStore.setState((state) => ({
          cart: state.cart.map((c) =>
            c.productId === productId
              ? { ...c, quantity: newQty, lineTotal: newLineTotal }
              : c
          ),
        }))
      }
    },
    [cart, products, toast]
  )

  const handleDecreaseQuantity = useCallback(
    (productId: string) => {
      const item = cart.find((c) => c.productId === productId)
      if (item && item.quantity > 1) {
        const newQty = item.quantity - 1
        const newLineTotal = computeLineTotal(newQty, item.unitPrice, item.discount, item.taxRate)
        useStore.setState((state) => ({
          cart: state.cart.map((c) =>
            c.productId === productId
              ? { ...c, quantity: newQty, lineTotal: newLineTotal }
              : c
          ),
        }))
      }
    },
    [cart]
  )

  const handleUnitPriceChange = useCallback(
    (productId: string, newPrice: number) => {
      if (isNaN(newPrice) || newPrice < 0) return
      useStore.setState((state) => ({
        cart: state.cart.map((c) => {
          if (c.productId === productId) {
            const newLineTotal = computeLineTotal(c.quantity, newPrice, c.discount, c.taxRate)
            return { ...c, unitPrice: newPrice, lineTotal: newLineTotal }
          }
          return c
        }),
      }))
    },
    []
  )

  const handleDiscountChange = useCallback(
    (productId: string, newDiscount: number) => {
      if (isNaN(newDiscount) || newDiscount < 0 || newDiscount > 100) return
      useStore.setState((state) => ({
        cart: state.cart.map((c) => {
          if (c.productId === productId) {
            const newLineTotal = computeLineTotal(c.quantity, c.unitPrice, newDiscount, c.taxRate)
            return { ...c, discount: newDiscount, lineTotal: newLineTotal }
          }
          return c
        }),
      }))
    },
    []
  )

  // ★★★ v3.36: جایگزینی handleSearchKeyDown
  //   قبلاً: جستجو در آرایه products (که همه محصولات بودن)
  //   اکنون: فراخوانی /api/products/lookup برای تطبیق فوری بارکد/کد
  const handleSearchKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && posSearchQuery.trim()) {
        const q = posSearchQuery.trim()

        // ★ اول: تطبیق بارکد (اگر q همه عدد است و بین ۴-۱۳ رقم)
        if (/^\d{4,13}$/.test(q)) {
          const found = await posLookupByBarcode(q)
          if (found) {
            handleAddToCart(found)
            posSearchSetQuery('')
            return
          }
        }

        // ★ دوم: تطبیق کد محصول
        const codeFound = await posLookupByCode(q)
        if (codeFound) {
          handleAddToCart(codeFound)
          posSearchSetQuery('')
          return
        }

        // ★ سوم: اگر چند نتیجه در searchResults هست، اولین را اضافه کن
        if (posSearchResults.length > 0) {
          handleAddToCart(posSearchResults[0])
          posSearchSetQuery('')
          return
        }

        // ★ هیچ نتیجه‌ای پیدا نشد
        toast({
          title: 'یافت نشد',
          description: `محصولی با بارکد/کد "${q}" یافت نشد`,
          variant: 'destructive',
        })
      }

      if (e.key === 'Escape') {
        posSearchSetQuery('')
        searchInputRef.current?.blur()
      }
    },
    [posSearchQuery, posSearchResults, posLookupByBarcode, posLookupByCode, posSearchSetQuery, handleAddToCart, toast]
  )

  // ★★★ v3.36: شنونده جهانی برای اسکنر بارکد USB (Keyboard Wedge)
  //   اسکنرهای USB/بلوتوث به‌صورت تایپ سریع + Enter عمل می‌کنند.
  //   این شنوننده حتی وقتی focus روی دکمه یا سبد است، کار می‌کند.
  useEffect(() => {
    let buffer = ''
    let lastTime = Date.now()
    let active = true

    const handler = async (e: KeyboardEvent) => {
      if (!active) return

      // ★ اگر focus روی input/textarea هست و کاربر دارد تایپ می‌کند، تداخل نکن
      //   مگر اینکه Enter باشد و buffer پر باشد.
      const target = e.target as HTMLElement
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      const now = Date.now()
      const delta = now - lastTime

      // ★ ریست بافر اگر فاصله زیاد بود
      if (delta > 100) buffer = ''

      lastTime = now

      if (e.key === 'Enter' && buffer.length >= 4) {
        // ★ اسکنر تشخیص داده شد
        const barcode = buffer
        buffer = ''

        // ★ اگر روی input جستجو نیستیم، مستقیم سرور را صدا بزن
        if (!isInput || target !== searchInputRef.current) {
          e.preventDefault()
          const product = await posLookupByBarcode(barcode)
          if (product) {
            handleAddToCart(product)
            toast({ title: '✓ افزودن به سبد', description: product.name })
          } else {
            toast({ title: 'یافت نشد', description: `بارکد ${barcode} در سیستم ثبت نشده`, variant: 'destructive' })
          }
            // ★★★ FIX v9.7.1: گوش دادن به رویداد تغییر موجودی از سایر صفحات
  // وقتی از صفحه فاکتورها برگشتی ثبت می‌شه، POS هم موجودی رو آپدیت می‌کنه
  useEffect(() => {
    const handler = async () => {
      console.log('[POS] inventory-changed event — refreshing product stock')
      await posLoadRecents()
    }
    window.addEventListener('inventory-changed', handler)
    return () => window.removeEventListener('inventory-changed', handler)
  }, [posLoadRecents])
        }
        return
      }

      // ★ کاراکترهای قابل چاپ → اضافه به بافر
      if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        buffer += e.key
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      active = false
      window.removeEventListener('keydown', handler)
    }
  }, [posLookupByBarcode, handleAddToCart, toast])

  // ★★★ v3.36: هندلر تشخیص بارکد از دوربین
  const handleBarcodeDetected = useCallback(
    async (barcode: string) => {
      const product = await posLookupByBarcode(barcode)
      if (product) {
        handleAddToCart(product)
        toast({ title: '✓ افزودن به سبد', description: product.name })
      } else {
        // ★ اگر با بارکد پیدا نشد، آن را در فیلد جستجو بگذار تا کاربر ببیند
        posSearchSetQuery(barcode)
        toast({
          title: 'بارکد یافت نشد',
          description: `محصولی با بارکد ${barcode} ثبت نشده. می‌توانید جستجو کنید.`,
          variant: 'destructive',
        })
      }
    },
    [posLookupByBarcode, posSearchSetQuery, handleAddToCart, toast]
  )

  // ★★★ v8.0: ref برای دسترسی به openCardPaymentDialog از داخل handleConfirmInvoice
  //   (چون openCardPaymentDialog بعد از handleConfirmInvoice تعریف می‌شه)
  const openCardPaymentDialogRef = useRef<(() => void) | null>(null)

  const handleConfirmInvoice = useCallback(() => {
    if (cart.length === 0) {
      toast({ title: 'خطا', description: 'سبد فاکتور خالی است' })
      return
    }

    console.log('[POS] handleConfirmInvoice:', { paymentType, selectedCustomerId, cartLength: cart.length })

    const pt = (paymentType || '').toLowerCase()
    if (pt === 'credit' || pt === 'installment' || pt === 'check') {
      if (!selectedCustomerId) {
        console.warn('[POS] Customer required but not selected for paymentType:', paymentType)
        toast({ title: 'مشتری انتخاب نشده', description: 'برای فروش نسیه/قسطی/چک، لطفاً ابتدا مشتری را انتخاب کنید', duration: 5000 })
        return
      }
    }

    if (pt === 'credit') {
      setCreditDueDate('')
      setCreditDescription('')
      setCreditDialogOpen(true)
      return
    }

    if (pt === 'installment') {
      setInstallmentDownPayment(0)
      setInstallmentCount(3)
      setInstallmentInterestRate(0)
      setInstallmentPeriod('monthly')
      setInstallmentDialogOpen(true)
      console.log('[POS] Installment dialog opened')
      return
    }

    // ★★★ v8.0: اگه نوع پرداخت کارتخوان بود، دیالوگ پرداخت کارتی رو باز کن
    if (pt === 'card') {
      if (openCardPaymentDialogRef.current) {
        openCardPaymentDialogRef.current()
      } else {
        console.error('[POS] openCardPaymentDialogRef not yet set')
      }
      return
    }

    setConfirmDialogOpen(true)
  }, [cart.length, paymentType, selectedCustomerId, toast])

  // ═══════════════════════════════════════════════════════════════
  //  ★★★ v8.0: Card Payment Logic — اتصال به کارتخوان
  // ═══════════════════════════════════════════════════════════════

  /**
   * ★ بارگذاری دستگاه POS فعال از API
   */
  const loadActivePosDevice = useCallback(async (): Promise<any | null> => {
    const tid = getTenantIdFromStore()
    if (!tid) return null
    try {
      const res = await fetch(`/api/pos-devices?tenantId=${tid}&active=true`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) return null
      const data = await res.json()
      if (data.success && data.data && data.data.length > 0) {
        return data.data[0]
      }
      return null
    } catch {
      return null
    }
  }, [])

  /**
   * ★ باز کردن دیالوگ پرداخت کارتی
   *   - اگه دستگاه فعالی تنظیم نشده، هشدار بده و به تنظیمات هدایت کن
   *   - اگه دستگاه باشه، adapter بساز و شروع به پرداخت کن
   */
  const openCardPaymentDialog = useCallback(async () => {
    setCardPaymentResult(null)
    setManualReferenceNumber('')
    setManualReferenceType('rrn')
    setManualCardLast4('')
    setManualCardType('')
    setCardPaymentStatus('idle')
    setCardPaymentMessage('در حال آماده‌سازی...')
    setCardPaymentDialogOpen(true)
    // ★ ثبت در ref تا handleConfirmInvoice بتونه صدا بزنه
    // (ref فقط یک‌بار در ابتدای mount مقداردهی می‌شه، نه در هر بار اجرا)

    const device = await loadActivePosDevice()
    if (!device) {
      setCardPaymentStatus('failed')
      setCardPaymentMessage('هیچ کارتخوان فعالی تنظیم نشده. لطفاً در تنظیمات یک کارتخوان اضافه کنید.')
      setActivePosDevice(null)
      return
    }

    setActivePosDevice(device)
    console.log('[POS] Active POS device:', { id: device.id, name: device.name, type: device.terminalType })

    // ★ بررسی پشتیبانی مرورگر
    const support = checkBrowserSupport(device.terminalType)
    if (!support.supported) {
      setCardPaymentStatus('failed')
      setCardPaymentMessage(support.message || 'مرورگر از این نوع اتصال پشتیبانی نمی‌کند')
      return
    }

    // ★ ساخت adapter
    const adapterConfig: PosAdapterConfig = {
      terminalType: device.terminalType,
      name: device.name,
      brand: device.brand,
      terminalId: device.terminalId || undefined,
      merchantId: device.merchantId || undefined,
      acceptorCode: device.acceptorCode || undefined,
      ipAddress: device.ipAddress || undefined,
      port: device.port || undefined,
      serialPort: device.serialPort || undefined,
      baudRate: device.baudRate,
      apiBaseUrl: device.apiBaseUrl || undefined,
      apiKey: device.apiKey || undefined,
    }
    const adapter = createPosAdapter(adapterConfig)
    setPosAdapterInstance(adapter)

    // ★ گوش دادن به رویدادهای adapter
    adapter.on('statusChange', (data: any) => {
      console.log('[POS Adapter] status:', data)
    })
    adapter.on('paymentProgress', (data: any) => {
      console.log('[POS Adapter] progress:', data)
      if (data.stage === 'waiting_manual_entry' || data.stage === 'awaiting_input') {
        setCardPaymentStatus('waiting_card')
        setCardPaymentMessage(data.message || 'منتظر ورود اطلاعات...')
      } else if (data.stage === 'waiting_card_swipe') {
        setCardPaymentStatus('waiting_card')
        setCardPaymentMessage(data.message || 'کارت را بکشید...')
      } else if (data.stage === 'sending_command') {
        setCardPaymentStatus('connecting')
        setCardPaymentMessage(data.message || 'در حال ارسال به کارتخوان...')
      } else if (data.stage === 'receiving_input') {
        setCardPaymentStatus('waiting_card')
        setCardPaymentMessage(data.message || 'در حال دریافت شماره پیرو...')
      } else if (data.stage === 'verifying') {
        setCardPaymentStatus('verifying')
        setCardPaymentMessage(data.message || 'در حال تأیید...')
      }
    })

    // ★ اتصال به adapter
    setCardPaymentStatus('connecting')
    setCardPaymentMessage('در حال اتصال به کارتخوان...')

    const connectResult = await adapter.connect()
    if (!connectResult.success) {
      setCardPaymentStatus('failed')
      setCardPaymentMessage(connectResult.message)
      return
    }

    // ★ اگه terminalType = manual، فقط منتظر ورود دستی بمون
    //   (UI فرم نمایش می‌ده و کاربر submit می‌کنه)
    if (device.terminalType === 'manual') {
      setCardPaymentStatus('waiting_card')
      setCardPaymentMessage('پس از کشیدن کارت، شماره پیرو و ۴ رقم آخر کارت را وارد کنید')
      // ★ شروع adapter.pay() — این منتظر می‌مونه تا submitManualResult صدا زده بشه
      adapter.pay({
        amount: cartTotals.totalAmount,
        invoiceId: undefined,
        invoiceNumber: undefined,
      }).then((result) => {
        handleCardPaymentResult(result, device.id)
      })
      return
    }

    // ★ برای بقیه حالت‌ها (keyboard-hid, web-serial, network-tcp)，
    //   adapter.pay() رو صدا بزن و منتظر نتیجه بمون
    setCardPaymentStatus('waiting_card')
    setCardPaymentMessage(`کارت را بکشید... مبلغ: ${formatPrice(cartTotals.totalAmount)} ریال`)

    try {
      const result = await adapter.pay({
        amount: cartTotals.totalAmount,
        timeoutMs: 60000,
      })
      handleCardPaymentResult(result, device.id)
    } catch (err: any) {
      setCardPaymentStatus('failed')
      setCardPaymentMessage(`خطا: ${err?.message || err}`)
    }
  }, [cartTotals.totalAmount, loadActivePosDevice])

  // ★★★ v8.0: ثبت openCardPaymentDialog در ref برای استفاده از handleConfirmInvoice
  useEffect(() => {
    openCardPaymentDialogRef.current = openCardPaymentDialog
  }, [openCardPaymentDialog])

  /**
   * ★ پردازش نتیجه پرداخت کارتی
   */
  const handleCardPaymentResult = useCallback(async (result: CardPaymentResult, deviceId: string) => {
    console.log('[POS] Card payment result:', result)
    setCardPaymentResult(result)

    if (result.success && result.status === 'successful') {
      setCardPaymentStatus('success')
      setCardPaymentMessage(
        `پرداخت موفق! شماره پیرو: ${result.referenceNumber || '-'}${result.cardNumber ? ` | کارت: ****${result.cardNumber}` : ''}`
      )

      // ★ ثبت پرداخت کارتی در API
      const tid = getTenantIdFromStore()
      try {
        await fetch(`/api/payments/card?tenantId=${tid}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            amount: result.amount,
            referenceNumber: result.referenceNumber,
            referenceType: result.referenceType || 'rrn',
            traceNumber: result.traceNumber,
            cardNumber: result.cardNumber,
            cardType: result.cardType,
            status: 'successful',
            posDeviceId: deviceId,
            description: 'پرداخت از صندوق فروش',
          }),
        })
      } catch (err) {
        console.warn('[POS] Failed to record card payment:', err)
      }

      // ★ ادامه ثبت فاکتور (مثل حالت عادی)
      //   بعد از ۱.۵ ثانیه، دیالوگ رو ببند و فاکتور رو ثبت کن
      setTimeout(() => {
        setCardPaymentDialogOpen(false)
        setConfirmDialogOpen(true)
      }, 1500)
    } else {
      setCardPaymentStatus(result.status as any)
      setCardPaymentMessage(result.errorMessage || 'پرداخت ناموفق بود')
    }
  }, [])

  /**
   * ★ لغو پرداخت کارتی
   */
  const handleCancelCardPayment = useCallback(async () => {
    if (posAdapterInstance) {
      try {
        await posAdapterInstance.cancelPayment()
        await posAdapterInstance.disconnect()
      } catch {}
    }
    setCardPaymentDialogOpen(false)
    setCardPaymentStatus('idle')
    setCardPaymentMessage('')
    setCardPaymentResult(null)
    setPosAdapterInstance(null)
  }, [posAdapterInstance])

  /**
   * ★ ثبت دستی نتیجه پرداخت (برای حالت manual)
   */
  const handleSubmitManualCardPayment = useCallback(async () => {
    if (!posAdapterInstance) return
    // ★ حداقل طول بسته به نوع کد مرجع
    const minLenByType: Record<string, number> = {
      rrn: 6, unique_code: 6, trace: 4, terminal: 5, auth_code: 4, stan: 4, other: 4
    }
    const minLen = minLenByType[manualReferenceType] || 6
    if (manualReferenceNumber.trim().length < minLen) {
      const typeNames: Record<string, string> = {
        rrn: 'شماره پیرو', unique_code: 'کد یکتا', trace: 'کد پیگیری',
        terminal: 'شماره پایانه', auth_code: 'کد تأیید', stan: 'شماره تراکنش', other: 'کد مرجع'
      }
      toast({ title: 'خطا', description: `${typeNames[manualReferenceType] || 'کد'} باید حداقل ${minLen} رقم باشد`, variant: 'destructive' })
      return
    }

    setCardPaymentStatus('verifying')
    setCardPaymentMessage('در حال ثبت...')

    // ★ فراخوانی submitManualResult روی ManualEntryAdapter
    const manualAdapter = posAdapterInstance as any
    if (typeof manualAdapter.submitManualResult === 'function') {
      await manualAdapter.submitManualResult({
        referenceNumber: manualReferenceNumber.trim(),
        referenceType: manualReferenceType,
        cardLast4: manualCardLast4.trim(),
        cardType: manualCardType || 'unknown',
        amount: cartTotals.totalAmount,
      })
    }
  }, [posAdapterInstance, manualReferenceNumber, manualReferenceType, manualCardLast4, manualCardType, cartTotals.totalAmount, toast])

  // ★★★ v3.20.1: این دو تابع باید قبل از handleConfirmInvoiceFinal تعریف بشن
  const getPaymentTypeLabel = useCallback((type: string): string => {
    const config = paymentTypeConfig.find((c) => c.value === type)
    return config?.label ?? type
  }, [])

  const handleConfirmInvoiceFinal = useCallback(async () => {
    setSubmitting(true)
    setConfirmDialogOpen(false)

    try {
      const tenantId = getTenantIdFromStore()

      const invoiceItems = cart.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: Math.round(item.quantity * item.unitPrice * (item.discount / 100)),
        taxAmount: Math.round(
          item.quantity * item.unitPrice * (1 - item.discount / 100) * (item.taxRate / 100)
        ),
      }))

      const ptFinal = (paymentType || '').toLowerCase()
      const isCreditOrInstallment = ptFinal === 'credit' || ptFinal === 'installment' || ptFinal === 'check'
      const paidAmount = isCreditOrInstallment ? 0 : cartTotals.totalAmount
      const remainingAmount = isCreditOrInstallment ? cartTotals.totalAmount : 0

      const payments =
        cartTotals.totalAmount > 0
          ? [
              {
                amount: paidAmount,
                paymentType:
                  ptFinal === 'card'
                    ? 'card'
                    : ptFinal === 'credit'
                    ? 'credit'
                    : ptFinal === 'installment'
                    ? 'installment'
                    : 'cash',
              },
            ]
          : []

      const requestBody: any = {
        tenantId,
        customerId: selectedCustomerId || undefined,
        paymentType: (paymentType || 'cash').toLowerCase(),
        items: invoiceItems,
        payments,
        discountAmount: cartTotals.discountAmount + (cartTotals.invoiceDiscountAmount || 0),
        taxAmount: cartTotals.taxAmount,
        paidAmount,
        remainingAmount,
        // ★★★ v6.1: ارسال warehouseId
        warehouseId: selectedWarehouseId || undefined,
      }

      const currentInstallmentPlan = useStore.getState().installmentPlan
      if (ptFinal === 'installment' && (installmentCalc || currentInstallmentPlan)) {
        const planData: InstallmentPlanData = {
          downPayment: installmentDownPayment || currentInstallmentPlan?.downPayment || 0,
          numberOfInstallments: installmentCount || currentInstallmentPlan?.numberOfInstallments || 1,
          interestRate: installmentInterestRate || currentInstallmentPlan?.interestRate || 0,
          installmentPeriod: installmentPeriod || currentInstallmentPlan?.installmentPeriod || 'monthly',
          totalWithInterest: installmentCalc?.totalWithInterest || currentInstallmentPlan?.totalWithInterest || 0,
          installmentAmount: installmentCalc?.installmentAmount || currentInstallmentPlan?.installmentAmount || 0,
          remainingAmount: installmentCalc?.remainingAmount || currentInstallmentPlan?.remainingAmount || 0,
        }
        requestBody.installmentPlanData = {
          ...planData,
          schedules: installmentCalc?.schedule || [],
        }
      }

      if (ptFinal === 'credit') {
        requestBody.creditData = {
          dueDate: creditDueDate || undefined,
          description: creditDescription || undefined,
        }
      }

       const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(requestBody),
      })
      let result: any
      try {
        result = await res.json()
      } catch (parseErr) {
        console.error('[POS] Failed to parse invoice response:', parseErr)
        toast({ title: 'خطای سرور', description: `خطا در ثبت فاکتور (کد ${res.status})`, variant: 'destructive' })
        setSubmitting(false)
        return
      }

      console.log('[POS] Invoice API response:', { status: res.status, success: result.success, error: result.error })

      if (res.ok && result.success) {
        const isInstallment = ptFinal === 'installment'
        const isCredit = ptFinal === 'credit'

        if (isInstallment && result.data?.installmentPlan) {
          const plan = result.data.installmentPlan
          toast({
            title: 'فاکتور قسطی ثبت شد',
            description: `فاکتور با ${(plan.numberOfInstallments || 0).toLocaleString('fa-IR')} قسط و پیش‌پرداخت ${formatPrice(plan.downPayment)} ریال ثبت شد.`,
          })
        } else if (isInstallment) {
          toast({
            title: 'فاکتور قسطی ثبت شد',
            description: `فاکتور قسطی با مبلغ ${formatPrice(cartTotals.totalAmount)} ریال ثبت شد.`,
          })
        } else if (isCredit) {
          toast({
            title: 'فاکتور نسیه ثبت شد',
            description: `فاکتور نسیه با مبلغ ${formatPrice(cartTotals.totalAmount)} ریال ثبت شد.`,
          })
        } else {
          toast({
            title: 'فاکتور تأیید شد',
            description: `فاکتور با مبلغ ${formatPrice(cartTotals.totalAmount)} ریال ثبت شد`,
          })
        }

        // ★★★ v3.24: ثبت چک خودکار اگه نوع پرداخت چک باشه
        if (ptFinal === 'check' && selectedCustomerId) {
          try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
            await fetch('/api/checks', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                type: 'receivable',
                checkNumber: `CHK-${Date.now().toString().slice(-6)}`,
                bankName: 'نامشخص (ثبت از POS)',
                amount: cartTotals.totalAmount,
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // ۳۰ روز بعد
                customerId: selectedCustomerId,
                description: `چک فاکتور`,
              }),
            })
            toast({ title: 'چک ثبت شد', description: 'چک دریافتنی برای این فاکتور ثبت شد' })
          } catch {}
        }

        setInstallmentPlan(null)
        setInstallmentDialogOpen(false)
        setConfirmDialogOpen(false)
        setPaymentType(null as any)  // ★ v26: ریست نوع پرداخت بعد از ثبت
        setTaxOverrideAmount(null)  // ★ v26.4: ریست override مالیات بعد از ثبت
        setInvoiceDiscountPercent('')  // ★★★ v3.21: ریست تخفیف کلی بعد از ثبت

        // ★★★ v3.36.6: چاپ خودکار فاکتور بعد از ثبت (با استفاده از ThermalReceiptPrint)
        //   - خواندن تنظیمات از localStorage (auto-print-settings)
        //   - اگر فعال بود و نوع پرداخت در لیست مجاز بود، مودال چاپ باز می‌شود
        //   - کاربر می‌تواند قالب را انتخاب کند (یا اگر defaultTemplate تنظیم شده، مستقیم چاپ کند)
        const printSettings = typeof window !== 'undefined' ? localStorage.getItem('auto-print-settings') : null
        if (printSettings) {
          try {
            const ps = JSON.parse(printSettings)
            if (ps.enabled && ps.paymentTypes && ps.paymentTypes.length > 0) {
              const currentPaymentType = (paymentType || 'cash').toLowerCase()
              if (ps.paymentTypes.includes(currentPaymentType)) {
                // ★ داده‌های سبد را قبل از clearCart کپی کن
                const cartCopy = [...cart]
                const totalsCopy = { ...cartTotals }
                const customerCopy = customers.find((c) => c.id === selectedCustomerId)
                const paymentTypeCopy = paymentType

                // ★ تنظیم قالب پیش‌فرض از تنظیمات (با fallback)
                const savedTemplate = ps.template || '8cm'
                // ★ مپ template قدیمی به جدید
                const mappedTemplate: PrintTemplate =
                  savedTemplate === 'a4' ? 'a4' :
                  savedTemplate === '58mm' ? 'thermal-58mm' :
                  'thermal-80mm'
                setThermalPrintTemplate(mappedTemplate)

                // ★ ساخت receiptData برای چاپ
                const customerNameForPrint = customerCopy
                  ? `${customerCopy.firstName || ''} ${customerCopy.lastName || ''}`.trim()
                  : 'فروش عمومی'

                const paymentTypeLabelForPrint = (() => {
                  const cfg = paymentTypeConfig.find((c) => c.value === paymentTypeCopy)
                  return cfg?.label ?? (paymentTypeCopy || 'نقدی')
                })()

                const pt = (paymentTypeCopy || '').toLowerCase()
                const paidAmountForPrint =
                  pt === 'credit' ? 0 :
                  pt === 'installment' ? installmentDownPayment :
                  totalsCopy.totalAmount

                const settings: any = (() => {
                  if (typeof window === 'undefined') return {}
                  const saved = localStorage.getItem('invoice-template-settings')
                  try { return saved ? JSON.parse(saved) : {} } catch { return {} }
                })()

                const autoPrintReceiptData: PrintReceiptData = {
                  invoiceNumber: result.data?.number || `INV-${Date.now().toString().slice(-6)}`,
                  invoiceDate: new Date().toLocaleDateString('fa-IR'),
                  customerName: customerNameForPrint,
                  cashierName: user?.username || undefined,
                  items: cartCopy.map((item: any) => ({
                    productName: item.productName,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    discount: item.discount || 0,
                    lineTotal: item.lineTotal,
                    unitLabel: item.unitLabel,
                  })),
                  subTotal: totalsCopy.subTotal,
                  discountAmount: totalsCopy.discountAmount,
                  invoiceDiscountAmount: totalsCopy.invoiceDiscountAmount || 0,
                  taxAmount: totalsCopy.taxAmount,
                  totalAmount: totalsCopy.totalAmount,
                  paidAmount: paidAmountForPrint,
                  remainingAmount: Math.max(0, totalsCopy.totalAmount - paidAmountForPrint),
                  paymentType: paymentTypeCopy || 'cash',
                  paymentTypeLabel: paymentTypeLabelForPrint,
                  storeName: storeName || 'فروشگاه',
                  storeAddress: settings.storeAddress,
                  storePhone: settings.storePhone,
                  headerText: settings.headerText || 'فاکتور فروش',
                  footerText: settings.footerText || 'با تشکر از خرید شما',
                  bankAccounts: settings.bankAccounts,
                  logoData: settings.logoData,
                  currency: 'ریال',
                }

                // ★ ذخیره در ref برای استفاده در مودال بعد از render
                pendingAutoPrintDataRef.current = autoPrintReceiptData
                setAutoPrintMode(true)

                // ★ باز کردن مودال چاپ بعد از پاک شدن سبد
                setTimeout(() => {
                  setThermalPrintOpen(true)
                  toast({
                    title: 'فاکتور ثبت شد',
                    description: 'لطفاً قالب چاپ را انتخاب کنید',
                  })
                }, 500)
              }
            }
          } catch (e) {
            console.warn('[POS] Auto-print failed (non-blocking):', e)
          }
        }

        clearCart()
        posSearchSetQuery('')
        setSelectedCategory('all')
           await posLoadRecents()
        loadData()
      } else {
        const errorMsg = result.error || result.message || `خطای سرور (کد ${res.status})`
        console.error('[POS] Invoice creation failed:', errorMsg)
        toast({
          title: 'خطا در ثبت فاکتور',
          description: errorMsg,
          variant: 'destructive',
          duration: 7000,
        })
      }
    } catch (error: any) {
      console.error('[POS] Invoice submission exception:', error)
      toast({ title: 'خطا', description: error?.message || 'خطا در ثبت فاکتور', variant: 'destructive' })
    }

    setSubmitting(false)
  }, [cart, cartTotals, paymentType, selectedCustomerId, clearCart, loadData, toast, installmentCalc, installmentDownPayment, installmentCount, installmentInterestRate, installmentPeriod, creditDueDate, creditDescription, setInstallmentPlan])

  const handlePrintInvoice = useCallback(() => {
    if (cart.length === 0) {
      toast({ title: 'خطا', description: 'سبد فاکتور خالی است' })
      return
    }
    // ★★★ v3.36.6: این مودال دستی است — از receiptData اصلی استفاده کن
    pendingAutoPrintDataRef.current = null
    setAutoPrintMode(false)
    setThermalPrintOpen(true)
  }, [cart.length, toast])

  // ★★★ v3.36: ساخت PrintReceiptData از وضعیت فعلی سبد برای ThermalReceiptPrint
  const receiptData: PrintReceiptData = useMemo(() => {
    const settings: any = (() => {
      if (typeof window === 'undefined') return {}
      const saved = localStorage.getItem('invoice-template-settings')
      try { return saved ? JSON.parse(saved) : {} } catch { return {} }
    })()

    const customer = customers.find((c) => c.id === selectedCustomerId)
    const customerName = customer
      ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
      : 'فروش عمومی'

    const paymentTypeLabel = (() => {
      const cfg = paymentTypeConfig.find((c) => c.value === paymentType)
      return cfg?.label ?? (paymentType || 'نقدی')
    })()

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`
    const today = new Date().toLocaleDateString('fa-IR')

    const pt = (paymentType || '').toLowerCase()
    const paidAmount =
      pt === 'credit' ? 0 :
      pt === 'installment' ? installmentDownPayment :
      cartTotals.totalAmount

    return {
      invoiceNumber,
      invoiceDate: today,
      customerName,
      cashierName: user?.username || undefined,
      items: cart.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
        lineTotal: item.lineTotal,
        unitLabel: item.unitLabel,
      })),
      subTotal: cartTotals.subTotal,
      discountAmount: cartTotals.discountAmount,
      invoiceDiscountAmount: cartTotals.invoiceDiscountAmount || 0,
      taxAmount: cartTotals.taxAmount,
      totalAmount: cartTotals.totalAmount,
      paidAmount,
      remainingAmount: Math.max(0, cartTotals.totalAmount - paidAmount),
      paymentType: paymentType || 'cash',
      paymentTypeLabel,
      storeName: storeName || 'فروشگاه',
      storeAddress: settings.storeAddress,
      storePhone: settings.storePhone,
      headerText: settings.headerText || 'فاکتور فروش',
      footerText: settings.footerText || 'با تشکر از خرید شما',
      bankAccounts: settings.bankAccounts,
      logoData: settings.logoData,
      currency: 'ریال',
    }
  }, [cart, cartTotals, customers, selectedCustomerId, paymentType, installmentDownPayment, user, storeName])

  // ═══════════════════════════════════════════════════════════════
  // ★★★ v3.36.9: توابع چاپ (بعد از تعریف receiptData — رفع خطای hoisting)
  // ═══════════════════════════════════════════════════════════════

  // ★★★ v3.36.8: تابع چاپ (باز کردن پنجره چاپ با HTML مناسب)
  const handleDoPrint = useCallback(() => {
    const currentData = autoPrintMode && pendingAutoPrintDataRef.current
      ? pendingAutoPrintDataRef.current
      : receiptData
    if (!currentData) return

    setPrintSubmitting(true)
    try {
      const baseHtml = generatePrintHtml(selectedPrintTemplate, currentData)
      // ★★★ v3.36.10: اسکریپت auto-print فقط برای پنجره چاپ اضافه می‌شود
      //   (نه برای iframe پیش‌نمایش — آن نباید خودکار چاپ کند)
      const printScript = '<script>window.onload = function() { setTimeout(function() { window.print(); }, 300); };</script>'
      const html = baseHtml.replace('</body>', printScript + '</body>')
      const printWindow = window.open('', '_blank', 'width=900,height=700')
      if (!printWindow) {
        toast({ title: 'خطا', description: 'پاپ‌آپ مسدود شده است', variant: 'destructive' })
        setPrintSubmitting(false)
        return
      }
      printWindow.document.open()
      printWindow.document.write(html)
      printWindow.document.close()
      toast({ title: 'ارسال به چاپ', description: 'پنجره چاپ باز شد' })
    } catch (err: any) {
      toast({ title: 'خطا در چاپ', description: err?.message || 'خطای ناشناخته', variant: 'destructive' })
    } finally {
      setPrintSubmitting(false)
    }
  }, [autoPrintMode, pendingAutoPrintDataRef, receiptData, selectedPrintTemplate, toast])

  // ★★★ v3.36.8: عرض پیش‌نمایش بر اساس قالب
  const previewWidth = selectedPrintTemplate === 'thermal-58mm' ? 220 : selectedPrintTemplate === 'thermal-80mm' ? 300 : 460

  // ★★★ v3.36.8: HTML پیش‌نمایش
  const previewHtml = useMemo(() => {
    if (!thermalPrintOpen) return ''
    const currentData = autoPrintMode && pendingAutoPrintDataRef.current
      ? pendingAutoPrintDataRef.current
      : receiptData
    if (!currentData) return ''
    return generatePrintHtml(selectedPrintTemplate, currentData)
  }, [thermalPrintOpen, autoPrintMode, pendingAutoPrintDataRef, receiptData, selectedPrintTemplate])

  const handleInstallmentConfirm = useCallback(() => {
    if (!installmentCalc) return

    if (installmentDownPayment < 0) {
      toast({ title: 'خطا', description: 'پیش‌پرداخت نمی‌تواند منفی باشد' })
      return
    }

    if (installmentDownPayment > cartTotals.totalAmount) {
      toast({ title: 'خطا', description: 'پیش‌پرداخت بیشتر از مبلغ کل است' })
      return
    }

    const planData: InstallmentPlanData = {
      downPayment: installmentDownPayment,
      numberOfInstallments: installmentCount,
      interestRate: installmentInterestRate,
      installmentPeriod: installmentPeriod,
      totalWithInterest: installmentCalc.totalWithInterest,
      installmentAmount: installmentCalc.installmentAmount,
      remainingAmount: installmentCalc.remainingAmount,
    }
    setInstallmentPlan(planData)

    setInstallmentDialogOpen(false)
    setConfirmDialogOpen(true)
  }, [installmentCalc, installmentDownPayment, installmentCount, installmentInterestRate, installmentPeriod, cartTotals.totalAmount, setInstallmentPlan, toast])

  const handleCreditConfirm = useCallback(() => {
    if (!creditDueDate) {
      toast({ title: 'خطا', description: 'لطفاً تاریخ سررسید را مشخص کنید' })
      return
    }

    setCreditDialogOpen(false)
    setConfirmDialogOpen(true)
  }, [creditDueDate, toast])

  // ============ Keyboard Shortcuts ============

  useEffect(() => {
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        if (e.key === 'Escape') target.blur()
        return
      }

      switch (e.key) {
        case 'F2':
          e.preventDefault()
          searchInputRef.current?.focus()
          break
        case 'F4':
          e.preventDefault()
          handleConfirmInvoice()
          break
        case 'Escape':
          e.preventDefault()
          posSearchSetQuery('')
          searchInputRef.current?.blur()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleConfirmInvoice])

  // ============ Render ============

  if (!hasHydrated) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-3 border-emerald-200 border-t-emerald-600" />
        <p className="text-slate-400 text-xs">در حال بارگذاری صندوق فروش...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50" dir="rtl">
      {/* ★★★ v37: Header — ساده، بدون جستجو (جستجو به نوار مستقل منتقل شد) ★★★ */}
      <header className="bg-gradient-to-l from-white to-slate-50/80 border-b border-slate-200/80 px-3 py-1.5 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
            <ShoppingCart className="w-3.5 h-3.5" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-slate-800">صندوق فروش</h1>
            <p className="text-[9px] text-slate-400 hidden xs:block">ثبت فاکتور فروش</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {warehouses.length > 1 && (
            <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
              <SelectTrigger className="h-7 w-[110px] text-[10px] border-slate-200 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map(wh => (
                  <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!isOnline && (
            <Badge variant="outline" className="gap-0.5 text-[9px] border-amber-300 text-amber-600 bg-amber-50 px-1.5 py-0">
              <WifiOff className="w-2.5 h-2.5" />
              آفلاین
            </Badge>
          )}
          <div className="hidden md:flex items-center">
            <Badge variant="outline" className="gap-1 text-[9px] font-normal border-slate-200 text-slate-400 px-1.5 py-0">
              <Keyboard className="w-2.5 h-2.5" />
              F2|F4|Esc
            </Badge>
          </div>
        </div>
      </header>

      {/* ★★★ v37: نوار جستجوی مستقل — بالای سبد، همیشه visible (دسکتاپ و موبایل) ★★★
          این تنها راه افزودن محصول به سبد است. F2 روی این فیلد focus می‌کند. */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 shrink-0 relative z-30">
        <div className="flex items-center gap-1.5">
          {/* ★ فیلد جستجوی لوک‌آپ */}
          <div className="relative flex-1">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="جستجوی محصول / بارکد... (تایپ کنید → کلیک روی نتیجه = افزودن به سبد) [F2]"
              value={posSearchQuery}
              onChange={(e) => posSearchSetQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="pr-9 pl-20 h-9 bg-slate-50 border-slate-200 focus:bg-white focus:border-emerald-400 focus:ring-emerald-400/20 text-[12px] font-medium"
            />
            {/* ★ وضعیت جستجو (سمت چپ) */}
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {posSearchStatus === 'searching' ? (
                <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
              ) : posSearchQuery.trim().length >= 2 && posSearchStatus === 'success' ? (
                <span className="text-[9px] text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded">
                  {toFaNum(posSearchResults.length)} نتیجه
                </span>
              ) : (
                <Barcode className="w-3.5 h-3.5 text-slate-300" />
              )}
            </div>

            {/* ★★★ LOOKUP DROPDOWN — نتایج زیر فیلد جستجو ★★★ */}
            {posSearchQuery.trim().length >= 2 && filteredProducts.length > 0 && (
              <div
                className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-[60vh] overflow-y-auto"
                style={{ top: '100%', right: 0 }}
              >
                <div className="sticky top-0 bg-slate-50 px-2.5 py-1.5 text-[10px] text-slate-600 border-b border-slate-100 flex items-center justify-between">
                  <span className="flex items-center gap-1 font-medium">
                    <Search className="w-3 h-3 text-emerald-500" />
                    {toFaNum(filteredProducts.length)} نتیجه یافت شد — برای افزودن به سبد کلیک کنید
                  </span>
                  <button
                    type="button"
                    onClick={() => posSearchSetQuery('')}
                    className="text-slate-400 hover:text-red-500 flex items-center gap-0.5"
                    title="بستن نتایج"
                  >
                    <X className="w-3 h-3" />
                    <span className="text-[9px]">بستن</span>
                  </button>
                </div>
                {filteredProducts.map((product) => (
                  <ProductLookupItem
                    key={product.id}
                    product={product}
                    cartQuantity={cart.find((c) => c.productId === product.id)?.quantity || 0}
                    onAdd={(p) => {
                      handleAddToCart(p)
                      // ★★ فیلتر دسته‌بندی حفظ می‌شود
                      // ★★ جستجو پاک نمی‌شود تا کاربر بتواند چند محصول مشابه اضافه کند
                    }}
                  />
                ))}
              </div>
            )}
            {/* ★ پیام "نتیجه‌ای یافت نشد" */}
            {posSearchQuery.trim().length >= 2 && filteredProducts.length === 0 && posSearchStatus !== 'searching' && (
              <div
                className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl p-4 text-center"
                style={{ top: '100%', right: 0 }}
              >
                <Package className="w-6 h-6 mx-auto text-slate-300 mb-1.5" />
                <p className="text-[12px] text-slate-600 font-medium">نتیجه‌ای یافت نشد</p>
                <p className="text-[10px] text-slate-400 mt-0.5">عبارت دیگری را امتحان کنید یا بارکد را اسکن کنید</p>
              </div>
            )}
          </div>

          {/* ★ دکمه اسکن بارکد با دوربین */}
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="shrink-0 p-2 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
            title="اسکن بارکد با دوربین موبایل/تبلت (بارکدخوان USB خودکار کار می‌کند)"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        {/* ★★★ نوار فیلتر دسته‌بندی — زیر فیلد جستجو ★★★ */}
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[9px] text-slate-400 shrink-0 flex items-center gap-0.5">
            <Package className="w-2.5 h-2.5" />
            دسته:
          </span>
          <div className="flex gap-1 overflow-x-auto pb-px scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              همه
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {cat.name}
                <span className="mr-0.5 text-[8px] opacity-60">({toFaNum(cat.productCount)})</span>
              </button>
            ))}
          </div>
        </div>

        {/* ★ راهنمای حالت پیش‌فرض */}
        {posSearchQuery.trim().length < 2 && !loading && (
          <div className="mt-1.5 text-[10px] text-slate-400 flex items-center gap-1">
            <ScanLine className="w-2.5 h-2.5" />
            {posRecents.length > 0
              ? `برای جستجو تایپ کنید یا بارکد را اسکن کنید (بارکدخوان USB خودکار کار می‌کند)`
              : 'بارکد را اسکن کنید یا نام محصول را تایپ کنید'}
          </div>
        )}
      </div>

      {/* ★★★ v37: Main content area — سبد فاکتور = ۱۰۰٪ عرض ★★★ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ===== CART (Primary & ONLY view — 100٪ width) ===== */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* ★ هدر سبد */}
          <div className="px-2.5 py-1.5 border-b border-slate-100 shrink-0 bg-gradient-to-l from-slate-50 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <ShoppingCart className="w-3 h-3 text-emerald-600" />
                <h2 className="font-bold text-[11px] text-slate-800">سبد فاکتور</h2>
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 text-[9px] px-1 py-0 h-4 mr-1">
                  {toFaNum(cartItemCount)} قلم
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                {/* ★ دکمه جستجو — focus روی فیلد بالای صفحه */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px] border-emerald-300 text-emerald-600 hover:bg-emerald-50"
                  onClick={() => searchInputRef.current?.focus()}
                  title="جستجوی محصول (F2)"
                >
                  <Search className="w-3 h-3 ml-0.5" />
                  جستجو
                </Button>
                {cart.length > 0 && (
                  <button type="button" className="text-slate-300 hover:text-red-500 transition-colors" onClick={clearCart} title="پاک کردن سبد">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ★ لیست آیتم‌های سبد — فشرده و قابل اسکرول */}
          <ScrollArea className="flex-1 min-h-0">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-300">
                <ShoppingCart className="w-16 h-16 mb-3" />
                <p className="text-[13px] font-medium">سبد فاکتور خالی است</p>
                <p className="text-[11px] mt-1 text-slate-400 max-w-[320px] text-center leading-relaxed">
                  برای افزودن محصول، در فیلد جستجوی بالای صفحه نام محصول را تایپ کنید یا بارکد را اسکن کنید
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 border-emerald-300 text-emerald-600 text-[10px] h-8"
                  onClick={() => searchInputRef.current?.focus()}
                >
                  <Search className="w-3.5 h-3.5 ml-1" />
                  شروع جستجو (F2)
                </Button>
                {/* ★ راهنمای میانبرها */}
                <div className="mt-4 text-[9px] text-slate-400 text-center max-w-[280px] leading-relaxed">
                  <p>💡 میانبرها: <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[8px]">F2</kbd> جستجو • <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[8px]">F4</kbd> تأیید فاکتور</p>
                  <p className="mt-1">💡 بارکدخوان USB به‌صورت خودکار کار می‌کند — فقط بارکد را اسکن کنید</p>
                </div>
              </div>
            ) : (
              <div className="p-1.5 space-y-px">
                {cart.map((item) => {
                  const product = products.find((p) => p.id === item.productId)
                  return (
                    <CompactCartItemRow
                      key={item.productId}
                      item={item}
                      unitLabel={product ? getUnitLabel(product) : 'عدد'}
                      onIncrease={handleIncreaseQuantity}
                      onDecrease={handleDecreaseQuantity}
                      onRemove={removeFromCart}
                      onUnitPriceChange={handleUnitPriceChange}
                      onDiscountChange={handleDiscountChange}
                    />
                  )
                })}
              </div>
            )}
          </ScrollArea>

          {/* ★ خلاصه سبد — inline در پایین سبد */}
          {cart.length > 0 && (
            <div className="border-t border-slate-200 shrink-0 bg-white">
              <div className="px-2.5 py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">جمع کل</span>
                  <span className="text-[12px] font-bold text-slate-700">{formatPrice(cartTotals.subTotal)} <span className="text-[9px] font-normal text-slate-400">ریال</span></span>
                </div>
                {cartTotals.discountAmount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">تخفیف آیتم‌ها</span>
                    <span className="text-[12px] font-bold text-red-500">-{formatPrice(cartTotals.discountAmount)} <span className="text-[9px] font-normal text-slate-400">ریال</span></span>
                  </div>
                )}
                {/* ★★★ v3.21: تخفیف کلی فاکتور (درصد) */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">تخفیف فاکتور</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={invoiceDiscountPercent ? toFaNum(invoiceDiscountPercent) : ''}
                      onChange={(e) => {
                        const enVal = toEnNum(e.target.value)
                        if (enVal === '' || (parseFloat(enVal) >= 0 && parseFloat(enVal) <= 100)) {
                          setInvoiceDiscountPercent(enVal)
                        }
                      }}
                      placeholder="۰"
                      className="w-12 h-5 text-[11px] px-1 py-0 bg-slate-50 border-slate-200 focus:border-blue-400 text-center font-bold text-slate-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      title="درصد تخفیف کلی فاکتور (۰ تا ۱۰۰)"
                    />
                    <span className="text-[10px] text-slate-400">٪</span>
                    {cartTotals.invoiceDiscountAmount > 0 && (
                      <span className="text-[10px] text-red-500 font-medium">
                        ({formatPrice(cartTotals.invoiceDiscountAmount)})
                      </span>
                    )}
                  </div>
                </div>
                {/* ★ v26.4: فیلد قابل ویرایش مالیات */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">مالیات</span>
                  <div className="flex items-center gap-0.5">
                    {planFeatures.canEditTax ? (
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={taxOverrideAmount !== null ? toFaNum(taxOverrideAmount) : toFaNum(cartTotals.computedTax)}
                        onChange={(e) => {
                          const enVal = toEnNum(e.target.value)
                          const num = parseFloat(enVal)
                          if (!isNaN(num) && num >= 0) {
                            setTaxOverrideAmount(Math.round(num))
                          } else if (enVal === '' || enVal === '۰') {
                            setTaxOverrideAmount(0)
                          }
                        }}
                        onBlur={() => {
                          if (taxOverrideAmount !== null && taxOverrideAmount === cartTotals.computedTax) {
                            setTaxOverrideAmount(null)
                          }
                        }}
                        className="w-24 h-5 text-[11px] px-1 py-0 bg-slate-50 border-slate-200 focus:border-blue-400 text-center font-bold text-slate-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        title="مبلغ مالیات (قابل ویرایش)"
                      />
                    ) : (
                      <span className="text-[12px] font-bold text-slate-500">
                        +{formatPrice(cartTotals.taxAmount)}
                      </span>
                    )}
                    <span className="text-[9px] text-slate-400">ریال</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-200">
                  <span className="font-bold text-slate-800 text-xs">مبلغ نهایی</span>
                  <span className="font-black text-base text-emerald-600">
                    {formatPrice(cartTotals.totalAmount)} <span className="text-[10px] font-bold">ریال</span>
                  </span>
                </div>
              </div>
              <div className="px-2.5 pb-1">
                <button type="button" className="w-full text-[9px] text-red-400 hover:text-red-600 py-0.5" onClick={clearCart}>
                  پاک کردن سبد
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ★★★ BOTTOM BAR — رادیو باتن نوع پرداخت + تأیید ★★★ */}
      <div className="bg-white border-t border-slate-200 shrink-0 shadow-[0_-2px_6px_rgba(0,0,0,0.05)]">
        {/* ★ ردیف اول: انتخاب نوع پرداخت (رادیو باتن) + قفل‌شده‌ها */}
        <div className="px-3 pt-2 pb-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-bold text-slate-500 shrink-0">نوع پرداخت:</span>
            <div className="flex items-center gap-1.5 flex-1">
              {paymentTypeConfig.map((pt) => {
                const Icon = pt.icon
                const isActive = paymentType === pt.value
                const isAllowed = planFeatures.posPaymentTypes.includes(pt.value.toLowerCase() as any)
                return (
                  <label
                    key={pt.value}
                    onClick={() => isAllowed && setPaymentType(pt.value)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border-2 transition-all duration-150 select-none ${
                      !isAllowed
                        ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed opacity-50'
                        : isActive
                          ? `${pt.activeBg} ${pt.activeBorder} ${pt.activeText} shadow-sm cursor-pointer`
                          : `${pt.inactiveBg} ${pt.inactiveBorder} ${pt.inactiveText} ${pt.hoverBg} cursor-pointer`
                    }`}
                    title={!isAllowed ? 'این روش پرداخت در پلن بالاتر در دسترس است' : undefined}
                  >
                    {/* ★ دایره رادیو */}
                    {!isAllowed ? (
                      <Lock className="w-3 h-3 shrink-0 text-amber-400" />
                    ) : (
                      <span
                        className={`shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${
                          isActive
                            ? `${pt.activeDot}`
                            : 'border-slate-300'
                        }`}
                      >
                        {isActive && (
                          <span className="block w-1.5 h-1.5 rounded-full bg-current" />
                        )}
                      </span>
                    )}
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${!isAllowed ? 'text-gray-300' : ''}`} />
                    <span className={`text-[11px] font-bold ${!isAllowed ? 'line-through' : ''}`}>{pt.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>

        {/* ★ ردیف دوم: مشتری + جمع + دکمه‌ها */}
        <div className="px-3 pb-2 flex items-center gap-2">
          {/* ★ انتخاب مشتری */}
          <div className="flex items-center gap-1.5 flex-1 sm:max-w-[200px] shrink-0 relative">
            <User className="w-3.5 h-3.5 text-slate-300 shrink-0 absolute right-2 top-1/2 -translate-y-1/2 z-10" />
            <Input
              placeholder={selectedCustomerId ? (selectedCustomerName || 'مشتری انتخاب شده') : 'جستجوی مشتری...'}
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="h-7 text-[11px] pr-7 border-slate-200 bg-slate-50/80 focus:bg-white"
            />
            {/* ★★★ v7.5.2: dropdown همیشه بالا باز می‌شود (bottom bar) + نمایش "بدون نتیجه" */}
            {/*   قبلاً top:'100%' بود و dropdown زیر viewport بریده می‌شد */}
            {customerSearch.trim().length >= 2 && (
              <div
                className="absolute z-[100] w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                style={{ bottom: '100%', marginBottom: '4px' }}
              >
                {customerSearchLoading ? (
                  <div className="p-2 text-center text-[10px] text-gray-400">در حال جستجو...</div>
                ) : customerSearchResults.length === 0 ? (
                  <div className="p-3 text-center text-[10px] text-gray-400">
                    <Search className="w-3.5 h-3.5 mx-auto mb-1 text-gray-300" />
                    مشتری‌ای با این نام یافت نشد
                  </div>
                ) : (
                  <>
                    {selectedCustomerId && (
                      <button onClick={() => { setCustomer(null, null); setCustomerSearch('') }} className="w-full text-right p-2 hover:bg-gray-50 border-b border-gray-100">
                        <span className="text-[10px] text-gray-400">حذف انتخاب</span>
                      </button>
                    )}
                    {/* ★★★ v7.5: پشتیبانی هم مشتریان (firstName/lastName) و هم طرف حساب (name) */}
                    {customerSearchResults.filter((c: any) => !c.isBlacklisted).map((c: any) => {
                      const displayName = c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.companyName || 'بدون نام'
                      return (
                        <button key={c.id} onClick={() => { setCustomer(c.id, displayName); setCustomerSearch(''); setCustomerSearchResults([]) }} className="w-full text-right p-2 hover:bg-emerald-50 border-b border-gray-100 last:border-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium">{displayName}</span>
                            {c.balance > 0 && <span className="text-[9px] text-red-400">(بدهی)</span>}
                            {c.currentBalance > 0 && <span className="text-[9px] text-red-400">(بدهی)</span>}
                          </div>
                          {c.mobile && <span className="text-[9px] text-gray-400" dir="ltr">{c.mobile}</span>}
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )}
            {selectedCustomer && selectedCustomer.currentBalance > 0 && (
              <Badge variant="outline" className="text-[8px] border-red-200 text-red-500 bg-red-50 px-1 py-0 shrink-0 h-5 absolute -top-2 -left-2">
                بدهی:{formatPrice(selectedCustomer.currentBalance)}
              </Badge>
            )}
          </div>

          {/* ★ جداکننده */}
          <div className="w-px h-6 bg-slate-200 shrink-0 hidden sm:block"></div>

          {/* ★ جمع کل */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="font-black text-base text-emerald-600">
              {formatPrice(cartTotals.totalAmount)}
            </span>
            <span className="text-[9px] text-slate-400">ریال</span>
            {(paymentType === 'Credit' || paymentType === 'Installment') &&
              cartTotals.totalAmount > 0 && (
                <span className="text-[9px] text-orange-500 font-medium hidden lg:inline">
                  (باقی)
                </span>
              )}
          </div>

          {/* ★ جداکننده */}
          <div className="w-px h-6 bg-slate-200 shrink-0 hidden sm:block"></div>

          {/* ★ دکمه‌های اقدام */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              onClick={handleConfirmInvoice}
              disabled={!paymentType || cart.length === 0 || submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-4 font-bold text-[11px] shadow-sm disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-all"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
              )}
              تأیید فاکتور
            </Button>
            {/* ★★★ v3.22: دکمه لغو خرید */}
            <Button
              variant="outline"
              onClick={() => {
                clearCart()
                posSearchSetQuery('')
                setSelectedCategory('all')
                setPaymentType(null as any)
                setTaxOverrideAmount(null)
                setInvoiceDiscountPercent('')
                toast({ title: 'خرید لغو شد', description: 'سبد فاکتور پاک شد' })
              }}
              disabled={cart.length === 0 || submitting}
              className="h-8 px-3 border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-md text-[11px] font-bold gap-1 transition-all"
              title="لغو خرید و پاک کردن سبد"
            >
              <XCircle className="w-3.5 h-3.5" />
              لغو خرید
            </Button>
            <Button
              variant="outline"
              onClick={handlePrintInvoice}
              disabled={cart.length === 0}
              className="h-8 w-8 p-0 border-slate-200 text-slate-400 disabled:opacity-30 rounded-md"
              title="چاپ رسید"
            >
              <Printer className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ★★★ v8.0: Card Payment Dialog — اتصال به کارتخوان */}
      <Dialog open={cardPaymentDialogOpen} onOpenChange={(open) => {
        if (!open) handleCancelCardPayment()
      }}>
        <DialogContent className="sm:max-w-[480px] w-[calc(100%-2rem)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <CreditCard className="w-4 h-4 text-blue-600" />
              پرداخت کارتی
              {activePosDevice && (
                <Badge variant="outline" className="text-[9px] mr-2">
                  {activePosDevice.name}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {activePosDevice
                ? `نوع اتصال: ${activePosDevice.terminalType} | مبلغ: ${formatPrice(cartTotals.totalAmount)} ریال`
                : 'در حال بارگذاری...'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            {/* Status Display */}
            <div className={`p-4 rounded-lg border-2 text-center ${
              cardPaymentStatus === 'success' ? 'border-emerald-300 bg-emerald-50' :
              cardPaymentStatus === 'failed' || cardPaymentStatus === 'cancelled' || cardPaymentStatus === 'timeout' ? 'border-red-300 bg-red-50' :
              cardPaymentStatus === 'idle' || cardPaymentStatus === 'connecting' ? 'border-blue-300 bg-blue-50' :
              'border-amber-300 bg-amber-50'
            }`}>
              {cardPaymentStatus === 'idle' || cardPaymentStatus === 'connecting' ? (
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-500 mb-2" />
              ) : cardPaymentStatus === 'waiting_card' ? (
                <CreditCard className="w-8 h-8 mx-auto text-amber-500 mb-2 animate-pulse" />
              ) : cardPaymentStatus === 'verifying' ? (
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-amber-500 mb-2" />
              ) : cardPaymentStatus === 'success' ? (
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
              ) : (
                <XCircle className="w-8 h-8 mx-auto text-red-500 mb-2" />
              )}
              <p className={`text-sm font-medium ${
                cardPaymentStatus === 'success' ? 'text-emerald-700' :
                cardPaymentStatus === 'failed' || cardPaymentStatus === 'cancelled' || cardPaymentStatus === 'timeout' ? 'text-red-600' :
                'text-gray-700'
              }`}>
                {cardPaymentMessage || (
                  cardPaymentStatus === 'idle' ? 'آماده...' :
                  cardPaymentStatus === 'connecting' ? 'در حال اتصال...' :
                  cardPaymentStatus === 'waiting_card' ? 'منتظر کارت...' :
                  cardPaymentStatus === 'verifying' ? 'در حال تأیید...' :
                  cardPaymentStatus === 'success' ? 'پرداخت موفق!' :
                  'نامشخص'
                )}
              </p>
              {cardPaymentResult && cardPaymentResult.referenceNumber && (
                <p className="text-[10px] text-gray-500 mt-1" dir="ltr">
                  RRN: {cardPaymentResult.referenceNumber}
                </p>
              )}
            </div>

            {/* Manual Entry Form — فقط وقتی terminalType = manual و status = waiting_card */}
            {activePosDevice?.terminalType === 'manual' && cardPaymentStatus === 'waiting_card' && (
              <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-[11px] text-slate-600 font-medium flex items-center gap-1">
                  <span className="text-emerald-500">★</span>
                  پس از کشیدن کارت روی کارتخوان، کد روی رسید رو اینجا وارد کنید:
                </p>

                {/* ★★★ v8.1: انتخاب نوع کد مرجع */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-slate-500">روی رسید شما کدام کد نوشته شده؟</Label>
                  <Select
                    value={manualReferenceType}
                    onValueChange={(v) => setManualReferenceType(v as ReferenceCodeType)}
                  >
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFERENCE_CODE_TYPES.map((rt) => (
                        <SelectItem key={rt.value} value={rt.value} className="text-xs">
                          <div className="flex flex-col">
                            <span className="font-medium">{rt.label}</span>
                            <span className="text-[9px] text-slate-400">{rt.example}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[9px] text-slate-400">
                    {REFERENCE_CODE_TYPES.find((rt) => rt.value === manualReferenceType)?.description}
                  </p>
                </div>

                {/* ★ فیلد کد مرجع — لیبل و placeholder بر اساس نوع انتخاب‌شده */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-slate-500">
                    {REFERENCE_CODE_TYPES.find((rt) => rt.value === manualReferenceType)?.label || 'کد مرجع'} *
                  </Label>
                  <Input
                    value={manualReferenceNumber}
                    onChange={(e) => setManualReferenceNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder={(() => {
                      const ph: Record<ReferenceCodeType, string> = {
                        rrn: 'مثلاً: 1234567',
                        unique_code: 'مثلاً: 123456789',
                        trace: 'مثلاً: 890123',
                        terminal: 'مثلاً: 1234567',
                        auth_code: 'مثلاً: 654321',
                        stan: 'مثلاً: 000123',
                        other: 'هر کد عددی روی رسید',
                      }
                      return ph[manualReferenceType] || 'مثلاً: 123456'
                    })()}
                    dir="ltr"
                    className="h-8 text-xs"
                    maxLength={15}
                    autoFocus
                  />
                </div>

                {/* ★ ۴ رقم آخر کارت — اختیاری */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-slate-500">
                      ۴ رقم آخر کارت
                      <span className="text-slate-300 font-normal mr-1">(اختیاری)</span>
                    </Label>
                    <Input
                      value={manualCardLast4}
                      onChange={(e) => setManualCardLast4(e.target.value.replace(/\D/g, '').slice(-4))}
                      placeholder="****"
                      dir="ltr"
                      className="h-8 text-xs"
                      maxLength={4}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-slate-500">
                      نوع کارت
                      <span className="text-slate-300 font-normal mr-1">(اختیاری)</span>
                    </Label>
                    <Input
                      value={manualCardType}
                      onChange={(e) => setManualCardType(e.target.value)}
                      placeholder="مثلاً: ملت"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleSubmitManualCardPayment}
                  disabled={(() => {
                    const minLenByType: Record<string, number> = {
                      rrn: 6, unique_code: 6, trace: 4, terminal: 5, auth_code: 4, stan: 4, other: 4
                    }
                    return manualReferenceNumber.trim().length < (minLenByType[manualReferenceType] || 6)
                  })()}
                  className="w-full h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
                  ثبت پرداخت
                </Button>
              </div>
            )}

            {/* Non-manual: توضیحات اضافی */}
            {activePosDevice?.terminalType !== 'manual' && cardPaymentStatus === 'waiting_card' && (
              <div className="text-[11px] text-slate-500 p-2 bg-slate-50 rounded-lg text-center">
                {activePosDevice?.terminalType === 'keyboard-hid' && 'کارتخوان در حالت کیبورد است — شماره پیرو به‌صورت خودکار شناسایی می‌شود.'}
                {activePosDevice?.terminalType === 'web-serial' && 'کارتخوان از طریق USB متصل است — منتظر پاسخ کارتخوان...'}
                {activePosDevice?.terminalType === 'network-tcp' && `کارتخوان ${activePosDevice?.ipAddress}:${activePosDevice?.port} متصل است — منتظر پاسخ...`}
                {activePosDevice?.terminalType === 'network-http' && `API کارتخوان متصل است — منتظر پاسخ...`}
              </div>
            )}

            {/* Failed State: امکان تلاش مجدد */}
            {(cardPaymentStatus === 'failed' || cardPaymentStatus === 'cancelled' || cardPaymentStatus === 'timeout') && (
              <div className="flex gap-2">
                <Button
                  onClick={openCardPaymentDialog}
                  variant="outline"
                  className="flex-1 h-8 text-xs"
                >
                  تلاش مجدد
                </Button>
                <Button
                  onClick={handleCancelCardPayment}
                  variant="ghost"
                  className="h-8 text-xs text-slate-500"
                >
                  بستن
                </Button>
              </div>
            )}
          </div>

          {/* Footer: فقط وقتی در حال انتظار */}
          {cardPaymentStatus === 'waiting_card' && (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCancelCardPayment}
                className="h-8 text-xs text-red-500 border-red-200 hover:bg-red-50"
              >
                <XCircle className="w-3.5 h-3.5 ml-1" />
                لغو پرداخت
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ★ تأیید فاکتور Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-[400px] w-[calc(100%-2rem)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              تأیید فاکتور
            </DialogTitle>
            <DialogDescription className="text-xs">
              آیا از ثبت فاکتور اطمینان دارید؟
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            {selectedCustomerName && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">مشتری:</span>
                <span className="font-medium">{selectedCustomerName}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">تعداد اقلام:</span>
              <span className="font-medium">{toFaNum(cart.length)} قلم</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">نوع پرداخت:</span>
              <span className="font-medium">{getPaymentTypeLabel(paymentType || '')}</span>
            </div>
            {(cartTotals.discountAmount > 0 || cartTotals.invoiceDiscountAmount > 0) && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">تخفیف:</span>
                <span className="font-medium text-red-500">-{formatPrice(cartTotals.discountAmount + (cartTotals.invoiceDiscountAmount || 0))} ریال</span>
              </div>
            )}
            <Separator />
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 text-sm">مبلغ کل:</span>
              <span className="font-black text-lg text-emerald-600">
                {formatPrice(cartTotals.totalAmount)} ریال
              </span>
            </div>
            {paymentType === 'Credit' && (
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-orange-700">مبلغ پرداختی:</span>
                  <span className="font-bold text-orange-700">۰ ریال</span>
                </div>
                <div className="flex items-center justify-between text-[11px] mt-0.5">
                  <span className="text-orange-700">مانده بدهی:</span>
                  <span className="font-bold text-orange-700">{formatPrice(cartTotals.totalAmount)} ریال</span>
                </div>
                {creditDueDate && (
                  <div className="flex items-center justify-between text-[11px] mt-0.5">
                    <span className="text-orange-700">تاریخ سررسید:</span>
                    <span className="font-bold text-orange-700">{formatDateToJalaliLong(creditDueDate)}</span>
                  </div>
                )}
              </div>
            )}
            {paymentType === 'Installment' && installmentCalc && (
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-purple-700">پیش‌پرداخت:</span>
                  <span className="font-bold text-purple-700">{formatPrice(installmentDownPayment)} ریال</span>
                </div>
                <div className="flex items-center justify-between text-[11px] mt-0.5">
                  <span className="text-purple-700">تعداد اقساط:</span>
                  <span className="font-bold text-purple-700">{toFaNum(installmentCount)} قسط</span>
                </div>
                <div className="flex items-center justify-between text-[11px] mt-0.5">
                  <span className="text-purple-700">مبلغ هر قسط:</span>
                  <span className="font-bold text-purple-700">{formatPrice(installmentCalc.installmentAmount)} ریال</span>
                </div>
                {installmentInterestRate > 0 && (
                  <div className="flex items-center justify-between text-[11px] mt-0.5">
                    <span className="text-purple-700">کل با سود:</span>
                    <span className="font-bold text-purple-700">{formatPrice(installmentCalc.totalWithInterest)} ریال</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)} className="border-slate-300 text-xs h-8">
              انصراف
            </Button>
            <Button onClick={handleConfirmInvoiceFinal} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8">
              <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
              تأیید و ثبت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★ Installment Dialog */}
      <Dialog open={installmentDialogOpen} onOpenChange={setInstallmentDialogOpen}>
        <DialogContent className="sm:max-w-[500px] w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700 text-sm">
              <CalendarClock className="w-4 h-4" />
              فروش قسطی
            </DialogTitle>
            <DialogDescription className="text-xs">
              مشخصات طرح قسطی را تعیین کنید
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 py-3">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-600">مبلغ کل فاکتور:</span>
              <span className="font-black text-sm text-slate-900">
                {formatPrice(cartTotals.totalAmount)} ریال
              </span>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-slate-600">پیش‌پرداخت (ریال)</Label>
              <Input
                type="number"
                min="0"
                max={cartTotals.totalAmount}
                step="10000"
                value={installmentDownPayment || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0
                  setInstallmentDownPayment(Math.min(val, cartTotals.totalAmount))
                }}
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-slate-600">تعداد اقساط</Label>
              <Select
                value={String(installmentCount)}
                onValueChange={(v) => setInstallmentCount(parseInt(v))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5, 6, 12].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {toFaNum(n)} قسط
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-slate-600">درصد سود</Label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={installmentInterestRate || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0
                    setInstallmentInterestRate(Math.min(val, 100))
                  }}
                  placeholder="0"
                  className="h-8 text-xs pl-7"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">%</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-slate-600">دوره پرداخت</Label>
              <Select
                value={installmentPeriod}
                onValueChange={(v) => setInstallmentPeriod(v as 'monthly' | 'biweekly' | 'weekly')}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">ماهانه</SelectItem>
                  <SelectItem value="biweekly">دو هفته‌ای</SelectItem>
                  <SelectItem value="weekly">هفتگی</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {installmentCalc && (
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-2 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-purple-700">مبلغ باقیمانده:</span>
                  <span className="font-bold text-purple-700">{formatPrice(installmentCalc.remainingAmount)} ریال</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-purple-700">مبلغ هر قسط:</span>
                  <span className="font-bold text-purple-800 text-xs">{formatPrice(installmentCalc.installmentAmount)} ریال</span>
                </div>
                {installmentInterestRate > 0 && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-purple-700">کل با سود:</span>
                    <span className="font-bold text-purple-800">{formatPrice(installmentCalc.totalWithInterest)} ریال</span>
                  </div>
                )}
              </div>
            )}

            {installmentCalc && installmentCalc.schedule.length > 0 && (
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-600">جدول اقساط</Label>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="py-1 px-2 text-slate-500 font-medium text-right">قسط</th>
                        <th className="py-1 px-2 text-slate-500 font-medium text-right">مبلغ (ریال)</th>
                        <th className="py-1 px-2 text-slate-500 font-medium text-right">تاریخ سررسید</th>
                      </tr>
                    </thead>
                    <tbody>
                      {installmentCalc.schedule.map((s) => (
                        <tr key={s.number} className="border-b border-slate-100 last:border-0">
                          <td className="py-1 px-2 font-medium text-slate-800">{toFaNum(s.number)}</td>
                          <td className="py-1 px-2 font-bold text-purple-700">{formatPrice(s.amount)} <span className="text-[8px] font-normal">ریال</span></td>
                          <td className="py-1 px-2 text-slate-600">{formatDateToJalaliLong(s.dueDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setInstallmentDialogOpen(false)} className="border-slate-300 text-xs h-8">
              انصراف
            </Button>
            <Button onClick={handleInstallmentConfirm} className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-8">
              <CalendarClock className="w-3.5 h-3.5 ml-1" />
              تأیید طرح قسطی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★ Credit Dialog — v34.1: کمی بزرگتر برای جایگیری تقویم */}
      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent className="sm:max-w-[480px] w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600 text-sm">
              <Clock className="w-4 h-4" />
              فروش نسیه
            </DialogTitle>
            <DialogDescription className="text-xs">
              مشخصات فروش نسیه را تعیین کنید
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 py-3">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-600">مبلغ کل فاکتور:</span>
              <span className="font-black text-sm text-slate-900">
                {formatPrice(cartTotals.totalAmount)} ریال
              </span>
            </div>

            <div className="rounded-lg bg-orange-50 border border-orange-200 p-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-orange-700">مبلغ پرداختی:</span>
                <span className="font-bold text-orange-700">۰ ریال</span>
              </div>
              <div className="flex items-center justify-between text-[11px] mt-0.5">
                <span className="text-orange-700">مانده بدهی:</span>
                <span className="font-bold text-orange-700">{formatPrice(cartTotals.totalAmount)} ریال</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-slate-600">تاریخ سررسید (شمسی)</Label>
              <ShamsiDatePicker value={creditDueDate} onChange={setCreditDueDate} />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-slate-600">توضیحات</Label>
              <Input type="text" value={creditDescription} onChange={(e) => setCreditDescription(e.target.value)} placeholder="اختیاری..." className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreditDialogOpen(false)} className="border-slate-300 text-xs h-8">
              انصراف
            </Button>
            <Button onClick={handleCreditConfirm} className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs h-8">
              <Clock className="w-3.5 h-3.5 ml-1" />
              تأیید فروش نسیه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ★★★ v3.36.6: مودال قدیمی چاپ حذف شد — حالا از ThermalReceiptPrint استفاده می‌شود */}

      {/* ★★★ v3.36: دیالوگ اسکن بارکد با دوربین */}
      <BarcodeScannerModal
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleBarcodeDetected}
      />

      {/* ★★★ v3.36.8: مودال چاپ inline (بدون وابستگی به فایل خارجی) */}
      <Dialog open={thermalPrintOpen} onOpenChange={(open) => {
        setThermalPrintOpen(open)
        if (!open) {
          pendingAutoPrintDataRef.current = null
          setAutoPrintMode(false)
        }
      }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-emerald-600" />
                چاپ رسید / فاکتور
              </span>
              <button
                type="button"
                onClick={() => setThermalPrintOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </DialogTitle>
            <DialogDescription className="text-xs">قالب چاپ را انتخاب کنید</DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3">
            {/* ★ انتخاب قالب */}
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { value: 'thermal-58mm', label: 'حرارتی ۵۸mm', desc: 'پرینتر مینی', paper: '58mm' },
                { value: 'thermal-80mm', label: 'حرارتی ۸۰mm', desc: 'پرینتر استاندارد', paper: '80mm' },
                { value: 'a4', label: 'A4 کامل', desc: 'پرینتر معمولی', paper: 'A4 portrait' },
              ] as const).map((opt) => {
                const isActive = selectedPrintTemplate === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedPrintTemplate(opt.value)}
                    className={`p-2 rounded-lg border-2 transition-all text-center ${isActive ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <Receipt className={`w-4 h-4 mx-auto mb-1 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <div className={`text-[10px] font-bold ${isActive ? 'text-emerald-700' : 'text-slate-600'}`}>{opt.label}</div>
                    <div className="text-[8px] text-slate-400 mt-0.5">{opt.desc}</div>
                    <div className="text-[8px] text-slate-500 mt-0.5 font-mono">کاغذ: {opt.paper}</div>
                    {isActive && <CheckCircle2 className="w-3 h-3 mx-auto mt-0.5 text-emerald-600" />}
                  </button>
                )
              })}
            </div>

            {/* ★ پیش‌نمایش با عرض مناسب */}
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
              <div className="bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600 flex items-center justify-between">
                <span>پیش‌نمایش</span>
                <span className="text-slate-400">عرض: {previewWidth}px</span>
              </div>
              <div className="flex justify-center bg-slate-100 p-2">
                <iframe
                  srcDoc={previewHtml}
                  style={{ width: `${previewWidth}px`, height: '320px' }}
                  className="bg-white border border-slate-200 rounded"
                  title="پیش‌نمایش"
                />
              </div>
            </div>

            {/* ★ راهنما */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-[10px] text-blue-700">
              <p className="font-bold mb-0.5">📌 سایز کاغذ:</p>
              <ul className="list-disc pr-4 space-y-0.5 text-blue-600">
                <li><b>58mm</b>: کاغذ حرارتی باریک (مینی)</li>
                <li><b>80mm</b>: کاغذ حرارتی استاندارد (فروشگاهی)</li>
                <li><b>A4</b>: کاغذ A4 عمودی (پرینتر معمولی)</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-1.5 pt-1 border-t">
            <Button variant="outline" size="sm" className="h-8 text-xs flex-1" onClick={() => setThermalPrintOpen(false)}>
              انصراف
            </Button>
            <Button
              size="sm"
              onClick={handleDoPrint}
              disabled={printSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs flex-1 gap-1"
            >
              {printSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              چاپ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ ★★★ v34: Shamsi Date Picker — تقویم Popup یاسی‌رنگ ★★★ ============
// همان کامپوننت دیتا پیکر صفحه گزارشات، با تم یاسی ملایم (Lilac / Lavender)

// ★ پالت رنگی یاسی ملایم
const LILAC = {
  popupBg: '#faf7ff',
  popupBgSolid: '#ffffff',
  headerBg: '#ede9fe',
  textPrimary: '#4c1d95',
  textSecondary: '#7c3aed',
  textMuted: '#a78bfa',
  textDisabled: '#d1d5db',
  textOnAccent: '#ffffff',
  border: '#e9d5ff',
  accent: '#7c3aed',
  accentHover: '#6d28d9',
  accentLight: '#ede9fe',
  accentSoft: '#ddd6fe',
  todayBorder: '#a78bfa',
  todayText: '#6d28d9',
}

const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

const navBtnStyle: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 4,
  border: 'none',
  background: 'transparent',
  color: LILAC.textSecondary,
  fontSize: 12,
  cursor: 'pointer',
  transition: 'background-color 0.1s',
  lineHeight: 1,
}

interface ShamsiDatePickerProps {
  value: string  // ISO date string (yyyy-mm-dd) یا خالی
  onChange: (value: string) => void
  placeholder?: string
}

function ShamsiDatePicker({ value, onChange, placeholder = 'انتخاب تاریخ سررسید' }: ShamsiDatePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // ★ نمایش تاریخ شمسی در دکمه
  const displayText = useMemo(() => {
    if (!value) return ''
    const d = new Date(value)
    if (isNaN(d.getTime())) return ''
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return `${toFaNum(jy)}/${toFaNum(jm).padStart(2, '۰')}/${toFaNum(jd).padStart(2, '۰')}`
  }, [value])

  // ★ امروز شمسی
  const todayJalali = useMemo(() => {
    const now = new Date()
    const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
    return { jy, jm, jd, iso: now.toISOString().split('T')[0] }
  }, [])

  // ★ موقعیت نمایش تقویم (سال/ماه شمسی)
  const initial = useMemo(() => {
    if (value) {
      const d = new Date(value)
      if (!isNaN(d.getTime())) {
        const [jy, jm] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
        return { jy, jm }
      }
    }
    return { jy: todayJalali.jy, jm: todayJalali.jm }
  }, [value, todayJalali])

  const [viewYear, setViewYear] = useState<number>(initial.jy)
  const [viewMonth, setViewMonth] = useState<number>(initial.jm)

  // ★ وقتی مقدار خارج از کامپوننت تغییر کرد، نمایش تقویم رو هم آپدیت کن
  useEffect(() => {
    if (value) {
      const d = new Date(value)
      if (!isNaN(d.getTime())) {
        const [jy, jm] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
        setViewYear(jy)
        setViewMonth(jm)
      }
    }
  }, [value])

  // ★ بستن تقویم با کلیک خارج
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const daysCount = daysInJalaliMonth(viewYear, viewMonth)

  // ★ محاسبه اولین روز هفته (شنبه = 0 در تقویم شمسی)
  const firstDayOffset = useMemo(() => {
    const [gy, gm, gd] = jalaliToGregorian(viewYear, viewMonth, 1)
    const jsDay = new Date(gy, gm - 1, gd).getDay() // 0=Sunday ... 6=Saturday
    return (jsDay + 1) % 7 // شنبه=0، یکشنبه=1، ... جمعه=6
  }, [viewYear, viewMonth])

  // ★ رسم خانه‌های تقویم
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOffset; i++) cells.push(null)
  for (let d = 1; d <= daysCount; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  // ★ تاریخ انتخاب‌شده فعلی به شمسی
  const selectedJalali = useMemo(() => {
    if (!value) return null
    const d = new Date(value)
    if (isNaN(d.getTime())) return null
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return { jy, jm, jd }
  }, [value])

  const goPrevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }
  const goNextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }
  const goPrevYear = () => setViewYear((y) => y - 1)
  const goNextYear = () => setViewYear((y) => y + 1)

  const pickToday = () => {
    onChange(todayJalali.iso)
    setOpen(false)
  }

  const handleDayClick = (jd: number) => {
    const [gy, gm, gd] = jalaliToGregorian(viewYear, viewMonth, jd)
    const isoDate = `${String(gy).padStart(4, '0')}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`
    onChange(isoDate)
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          height: 30,
          padding: '0 8px',
          borderRadius: 5,
          border: `1px solid ${LILAC.border}`,
          backgroundColor: LILAC.popupBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          cursor: 'pointer',
          fontSize: 11,
          transition: 'border-color 0.15s, background-color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = LILAC.accent; e.currentTarget.style.backgroundColor = LILAC.accentLight }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = LILAC.border; e.currentTarget.style.backgroundColor = LILAC.popupBg }}
      >
        <Calendar style={{ width: 14, height: 14, color: LILAC.textMuted, flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            textAlign: 'right',
            fontFamily: 'monospace',
            color: displayText ? LILAC.textPrimary : LILAC.textMuted,
            fontSize: 11,
          }}
          dir="ltr"
        >
          {displayText || placeholder}
        </span>
      </button>

      {open && (
        <>
          {/* Backdrop — capture clicks outside */}
          <div
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 40,
            }}
            onClick={() => setOpen(false)}
          />
          {/* ★ v34.1: Calendar popup — کوچک‌تر (200px) + باز شدن رو به بالا در مودال ★ */}
          <div
            dir="rtl"
            style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
              marginBottom: 3,
              zIndex: 60,
              width: 200,
              backgroundColor: LILAC.popupBgSolid,
              border: `1px solid ${LILAC.border}`,
              borderRadius: 8,
              boxShadow: '0 -8px 24px -4px rgba(124, 58, 237, 0.18), 0 -4px 8px -2px rgba(124, 58, 237, 0.1)',
              padding: 7,
              overflow: 'visible',
            }}
          >
            {/* ★ Header: گرادینت یاسی برای هدر — فشرده */}
            <div style={{
              background: `linear-gradient(135deg, ${LILAC.headerBg} 0%, ${LILAC.accentSoft} 100%)`,
              margin: -7,
              marginBottom: 5,
              padding: '5px 7px',
              borderRadius: '8px 8px 0 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <button
                type="button"
                onClick={goPrevYear}
                title="سال قبل"
                style={navBtnStyle}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >«</button>
              <button
                type="button"
                onClick={goPrevMonth}
                title="ماه قبل"
                style={navBtnStyle}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >‹</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, color: LILAC.textPrimary }}>
                {JALALI_MONTHS[viewMonth - 1]} {toFaNum(viewYear)}
              </div>
              <button
                type="button"
                onClick={goNextMonth}
                title="ماه بعد"
                style={navBtnStyle}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >›</button>
              <button
                type="button"
                onClick={goNextYear}
                title="سال بعد"
                style={navBtnStyle}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >»</button>
            </div>

            {/* ★ Weekday header — فشرده */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 1 }}>
              {PERSIAN_WEEKDAYS.map((w, i) => (
                <div key={i} style={{
                  textAlign: 'center',
                  fontSize: 9,
                  fontWeight: 600,
                  color: i === 6 ? LILAC.textSecondary : LILAC.textMuted,
                  padding: '1px 0',
                }}>{w}</div>
              ))}
            </div>

            {/* ★ Days grid — فشرده (20px squares) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={i} style={{ height: 20 }} />
                const isSelected = selectedJalali &&
                  selectedJalali.jy === viewYear &&
                  selectedJalali.jm === viewMonth &&
                  selectedJalali.jd === d
                const isToday = todayJalali.jy === viewYear && todayJalali.jm === viewMonth && todayJalali.jd === d
                const isFriday = i % 7 === 6
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleDayClick(d)}
                    style={{
                      height: 20,
                      borderRadius: 4,
                      fontSize: 10,
                      border: isSelected ? 'none' : (isToday ? `1px solid ${LILAC.todayBorder}` : 'none'),
                      backgroundColor: isSelected
                        ? LILAC.accent
                        : (isToday ? LILAC.accentLight : 'transparent'),
                      color: isSelected
                        ? LILAC.textOnAccent
                        : (isToday ? LILAC.todayText : (isFriday ? LILAC.textSecondary : LILAC.textPrimary)),
                      cursor: 'pointer',
                      fontWeight: isSelected ? 700 : (isToday ? 600 : (isFriday ? 500 : 400)),
                      transition: 'background-color 0.1s',
                      padding: 0,
                      lineHeight: 1,
                    }}
                    onMouseEnter={(e) => {
                      if (isSelected) return
                      e.currentTarget.style.backgroundColor = LILAC.accentSoft
                    }}
                    onMouseLeave={(e) => {
                      if (isSelected) return
                      e.currentTarget.style.backgroundColor = isToday ? LILAC.accentLight : 'transparent'
                    }}
                  >
                    {toFaNum(d)}
                  </button>
                )
              })}
            </div>

            {/* ★ Footer: today shortcut — فشرده */}
            <div style={{
              marginTop: 5,
              paddingTop: 4,
              borderTop: `1px dashed ${LILAC.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <button
                type="button"
                onClick={pickToday}
                style={{
                  fontSize: 9,
                  color: LILAC.accent,
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                امروز: {toFaNum(todayJalali.jd)} {JALALI_MONTHS[todayJalali.jm - 1]}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  fontSize: 9,
                  color: LILAC.textMuted,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                بستن ✕
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ============ ★★★ v26: Compact Product Row — فشرده ★★★ ============

interface CompactProductRowProps {
  product: Product
  cartQuantity: number
  onAdd: (product: Product) => void
}

function CompactProductRow({ product, cartQuantity, onAdd }: CompactProductRowProps) {
  const isOutOfStock = product.currentStock <= 0
  const dotColor = getStockDot(product.currentStock, product.minStock)
  const unitLabel = getUnitLabel(product)

  return (
    <button
      onClick={() => !isOutOfStock && onAdd(product)}
      disabled={isOutOfStock}
      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg transition-all text-right group border ${
        isOutOfStock
          ? 'opacity-40 cursor-not-allowed border-gray-100'
          : cartQuantity > 0
          ? 'bg-emerald-50/60 ring-1 ring-emerald-300 border-emerald-200 hover:bg-emerald-50'
          : 'border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30'
      }`}
    >
      {/* ★★★ سمت راست — badge سبد + نام محصول + موجودی ★★★ */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {cartQuantity > 0 && (
          <span className="bg-emerald-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
            {cartQuantity}
          </span>
        )}
        <span className="text-[13px] font-semibold text-slate-800 truncate flex-1 text-right">
          {product.name}
        </span>
        {/* موجودی فعلی */}
        <div className="flex items-center gap-1 shrink-0 bg-slate-100 px-2 py-0.5 rounded-md" title={`موجودی: ${getStockLabel(product.currentStock, product.minStock)}`}>
          <span className={`shrink-0 w-2 h-2 rounded-full ${dotColor}`} />
          <span className={`text-[11px] font-mono font-semibold ${
            product.currentStock <= 0
              ? 'text-red-500'
              : product.currentStock <= product.minStock
              ? 'text-amber-600'
              : 'text-slate-600'
          }`}>
            {toFaNum(formatPrice(product.currentStock))}
          </span>
          <span className="text-[10px] text-slate-400">{unitLabel}</span>
        </div>
      </div>

      {/* ★★★ سمت چپ — قیمت فروش + دکمه + بزرگ و سبز ★★★ */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex flex-col items-end">
          <span className="font-bold text-emerald-600 text-[14px] whitespace-nowrap leading-tight">
            {formatPrice(product.salePrice)}
          </span>
          <span className="text-[9px] text-slate-400 leading-tight">ریال</span>
        </div>
        {isOutOfStock ? (
          <AlertTriangle className="w-5 h-5 text-red-300 shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-emerald-500 group-hover:bg-emerald-600 flex items-center justify-center shrink-0 transition-colors shadow-sm">
            <Plus className="w-5 h-5 text-white font-bold" strokeWidth={3} />
          </div>
        )}
      </div>
    </button>
  )
}

// ============ ★★★ v26: Compact Product Card — فشرده ★★★ ============

interface CompactProductCardProps {
  product: Product
  cartQuantity: number
  onAdd: (product: Product) => void
}

function CompactProductCard({ product, cartQuantity, onAdd }: CompactProductCardProps) {
  const isOutOfStock = product.currentStock <= 0
  const dotColor = getStockDot(product.currentStock, product.minStock)
  const unitSymbol = getUnitLabel(product)

  return (
    <button
      onClick={() => !isOutOfStock && onAdd(product)}
      disabled={isOutOfStock}
      className={`group relative text-right rounded-lg border transition-all overflow-hidden ${
        isOutOfStock
          ? 'border-slate-100 bg-slate-50/50 opacity-50 cursor-not-allowed'
          : cartQuantity > 0
          ? 'border-emerald-200 bg-emerald-50/40 shadow-sm ring-1 ring-emerald-100'
          : 'border-slate-200 bg-white hover:border-emerald-200 hover:shadow-sm'
      }`}
    >
      {cartQuantity > 0 && (
        <div className="absolute top-1 left-1 z-10">
          <Badge className="bg-emerald-600 text-white text-[8px] h-4 min-w-[16px] flex items-center justify-center px-1 shadow-sm">
            {cartQuantity}
          </Badge>
        </div>
      )}
      <div className="p-2.5">
        {/* ★ نام محصول — سمت راست */}
        <h3 className="font-bold text-[12px] text-slate-800 leading-snug mb-2 line-clamp-2 min-h-[2rem] text-right">
          {product.name}
        </h3>

        {/* ★★★ v3.6: موجودی فعلی — کارت جداگانه با رنگ بر اساس وضعیت ★★★ */}
        <div className="flex items-center justify-between mb-2 px-1.5 py-1 rounded bg-slate-50" title={`موجودی: ${getStockLabel(product.currentStock, product.minStock)}`}>
          <span className="text-[9px] text-slate-500">موجودی</span>
          <div className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            <span className={`text-[10px] font-mono font-semibold ${
              product.currentStock <= 0
                ? 'text-red-500'
                : product.currentStock <= product.minStock
                ? 'text-amber-600'
                : 'text-slate-600'
            }`}>
              {toFaNum(formatPrice(product.currentStock))}
            </span>
            <span className="text-[8px] text-slate-400">{unitSymbol}</span>
          </div>
        </div>

        {/* ★★★ v3.6: قیمت فروش — سمت چپ با آیکون + ★★★ */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <div className="flex items-baseline gap-0.5">
            <span className="font-black text-emerald-600 text-[13px]">
              {formatPrice(product.salePrice)}
            </span>
            <span className="text-[8px] text-slate-400">ریال</span>
          </div>
          {isOutOfStock ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-300" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-emerald-50 group-hover:bg-emerald-600 flex items-center justify-center transition-colors">
              <Plus className="w-3 h-3 text-emerald-600 group-hover:text-white transition-colors" />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}


// ============ ★★★ v37: Product Lookup Item — آیتم dropdown لوک‌آپ ★★★ ============
// آیتم dropdown که زیر فیلد جستجو ظاهر می‌شود. کلیک روی آن محصول را به سبد اضافه می‌کند.
// این تنها راه افزودن محصول به سبد است (لیست محصولات حذف شده).

interface ProductLookupItemProps {
  product: Product
  cartQuantity: number
  onAdd: (product: Product) => void
}

function ProductLookupItem({ product, cartQuantity, onAdd }: ProductLookupItemProps) {
  const isOutOfStock = product.currentStock <= 0
  const dotColor = getStockDot(product.currentStock, product.minStock)
  const unitLabel = getUnitLabel(product)

  return (
    <button
      type="button"
      onClick={() => !isOutOfStock && onAdd(product)}
      disabled={isOutOfStock}
      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2.5 text-right transition-colors border-b border-slate-50 last:border-0 ${
        isOutOfStock
          ? 'opacity-40 cursor-not-allowed'
          : cartQuantity > 0
            ? 'bg-emerald-50/70 hover:bg-emerald-50'
            : 'hover:bg-slate-50'
      }`}
    >
      {/* ★ سمت راست — badge سبد + نام + موجودی */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {cartQuantity > 0 && (
          <span className="bg-emerald-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
            {cartQuantity}
          </span>
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] font-semibold text-slate-800 truncate text-right">
            {product.name}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${dotColor}`} />
            <span className={`text-[10px] font-mono ${
              product.currentStock <= 0
                ? 'text-red-500'
                : product.currentStock <= product.minStock
                  ? 'text-amber-600'
                  : 'text-slate-500'
            }`}>
              {toFaNum(formatPrice(product.currentStock))} {unitLabel}
            </span>
            {product.code && (
              <span className="text-[9px] text-slate-400" dir="ltr">• کد: {product.code}</span>
            )}
            {product.barcode && (
              <span className="text-[9px] text-slate-400" dir="ltr">• {product.barcode}</span>
            )}
          </div>
        </div>
      </div>

      {/* ★ سمت چپ — قیمت + دکمه + */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex flex-col items-end">
          <span className="font-bold text-emerald-600 text-[14px] whitespace-nowrap leading-tight">
            {formatPrice(product.salePrice)}
          </span>
          <span className="text-[8px] text-slate-400 leading-tight">ریال</span>
        </div>
        {isOutOfStock ? (
          <AlertTriangle className="w-5 h-5 text-red-300 shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center shrink-0 transition-colors shadow-sm">
            <Plus className="w-5 h-5 text-white font-bold" strokeWidth={3} />
          </div>
        )}
      </div>
    </button>
  )
}

// ============ ★★★ v26: Compact Cart Item Row — فوق‌فشرده ★★★ ============

interface CompactCartItemRowProps {
  item: CartItem
  unitLabel: string
  onIncrease: (productId: string) => void
  onDecrease: (productId: string) => void
  onRemove: (productId: string) => void
  onUnitPriceChange: (productId: string, newPrice: number) => void
  onDiscountChange: (productId: string, newDiscount: number) => void
}

function CompactCartItemRow({
  item,
  unitLabel,
  onIncrease,
  onDecrease,
  onRemove,
  onUnitPriceChange,
  onDiscountChange,
}: CompactCartItemRowProps) {
  const [localPrice, setLocalPrice] = useState(toFaNum(item.unitPrice))
  const [localDiscount, setLocalDiscount] = useState(toFaNum(item.discount))
  const priceInputRef = useRef<HTMLInputElement>(null)
  const discountInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setLocalPrice(toFaNum(item.unitPrice)) }, [item.unitPrice])
  useEffect(() => { setLocalDiscount(toFaNum(item.discount)) }, [item.discount])

  const handlePriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // کاربر هرچه تایپ کند فارسی نمایش داده شود
    const enVal = toEnNum(e.target.value)
    setLocalPrice(toFaNum(enVal))
  }, [])

  const handlePriceBlur = useCallback(() => {
    const enVal = toEnNum(localPrice)
    const newPrice = parseFloat(enVal)
    if (!isNaN(newPrice) && newPrice >= 0 && newPrice !== item.unitPrice) {
      onUnitPriceChange(item.productId, newPrice)
    } else {
      setLocalPrice(toFaNum(item.unitPrice))
    }
  }, [localPrice, item.unitPrice, item.productId, onUnitPriceChange])

  const handlePriceKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') priceInputRef.current?.blur()
  }, [])

  const handleDiscountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const enVal = toEnNum(e.target.value)
    setLocalDiscount(toFaNum(enVal))
  }, [])

  const handleDiscountBlur = useCallback(() => {
    const enVal = toEnNum(localDiscount)
    const newDiscount = parseFloat(enVal)
    if (!isNaN(newDiscount) && newDiscount >= 0 && newDiscount <= 100 && newDiscount !== item.discount) {
      onDiscountChange(item.productId, newDiscount)
    } else {
      setLocalDiscount(toFaNum(item.discount))
    }
  }, [localDiscount, item.discount, item.productId, onDiscountChange])

  const handleDiscountKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') discountInputRef.current?.blur()
  }, [])

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-slate-50/80 hover:bg-slate-100/60 border border-slate-100 group transition-colors">
      {/* ★ حذف */}
      <button
        type="button"
        className="shrink-0 w-4 h-4 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors"
        onClick={() => onRemove(item.productId)}
        title="حذف"
      >
        <X className="w-3 h-3" />
      </button>

      {/* ★ نام محصول + موجودی */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-slate-800 truncate" title={item.productName}>
            {item.productName}
          </span>
          {item.currentStock !== undefined && item.currentStock !== null && (
            <span className={`text-[8px] px-1 py-px rounded shrink-0 ${
              item.currentStock <= 0 ? 'text-red-500 bg-red-50'
              : item.currentStock <= item.quantity ? 'text-amber-500 bg-amber-50'
              : 'text-emerald-500 bg-emerald-50'
            }`}>
              {formatPrice(item.currentStock)} {unitLabel}
            </span>
          )}
        </div>
      </div>

      {/* ★ تعداد -/+/ */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          onClick={() => onDecrease(item.productId)}
          disabled={item.quantity <= 1}
        >
          <Minus className="w-2.5 h-2.5" />
        </button>
        <span className="w-5 text-center text-[11px] font-bold text-slate-800">
          {toFaNum(item.quantity)}
        </span>
        <button
          type="button"
          className="w-5 h-5 flex items-center justify-center rounded text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
          onClick={() => onIncrease(item.productId)}
        >
          <Plus className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* ★ قیمت واحد (اعداد فارسی) */}
      <Input
        ref={priceInputRef}
        type="text"
        inputMode="numeric"
        value={localPrice}
        onChange={handlePriceChange}
        onBlur={handlePriceBlur}
        onKeyDown={handlePriceKeyDown}
        className="shrink-0 w-16 h-5 text-[10px] px-1 py-0 bg-white border-slate-200 focus:border-emerald-400 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        title="قیمت واحد"
      />

      {/* ★ تخفیف % (اعداد فارسی) */}
      <div className="relative shrink-0">
        <Input
          ref={discountInputRef}
          type="text"
          inputMode="numeric"
          value={localDiscount}
          onChange={handleDiscountChange}
          onBlur={handleDiscountBlur}
          onKeyDown={handleDiscountKeyDown}
          className="w-10 h-5 text-[10px] px-1 py-0 bg-white border-slate-200 focus:border-orange-400 text-center pr-3 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          title="تخفیف %"
        />
        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[7px] text-slate-300">%</span>
      </div>

      {/* ★ مبلغ خط */}
      <span className="shrink-0 text-[11px] font-bold text-slate-800 min-w-[60px] text-left" title={`مبلغ: ${formatPrice(item.lineTotal)} ریال`}>
        {formatPrice(item.lineTotal)} <span className="text-[8px] text-slate-400 font-normal">ر</span>
      </span>
    </div>
  )
}
