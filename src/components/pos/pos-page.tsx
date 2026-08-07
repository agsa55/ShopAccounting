'use client'

// ============================================================================
// src/components/pos/pos-page.tsx — v9.1 ★ OFFLINE-OPTIMIZED
// ★ جستجوی آفلاین از IndexedDB + localStorage
// ★ بارگذاری محصولات، مشتریان، انبارها از cache
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
  Camera,
  ScanLine,
    Store, Building2 
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { usePosProductSearch } from '@/lib/use-pos-product-search'
import { BarcodeScannerModal } from '@/components/pos/barcode-scanner-modal'
import {
  createPosAdapter,
  checkBrowserSupport,
  type PosAdapter,
  type CardPaymentResult,
  type PosAdapterConfig,
  type ReferenceCodeType,
  REFERENCE_CODE_TYPES,
} from '@/lib/pos-adapters'

// ═══════════════════════════════════════════════════════════════
//  ★★★ Print Receipt Types
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

// ============ واحدهای اعشاری (Decimal Units) ============
const DECIMAL_UNIT_IDS = [
  'unit-kg', 'unit-g', 'unit-liter', 'unit-ml',
  'unit-meter', 'unit-cm', 'unit-m2', 'unit-ton',
]
const DECIMAL_UNIT_LABELS = [
  'کگ', 'گ', 'لی', 'ملی', 'م', 'سم', 'م²', 'تن',
  'کیلوگرم', 'گرم', 'لیتر', 'میلی‌لیتر', 'متر', 'سانتی‌متر', 'مترمربع',
]

function isDecimalUnitLabel(label?: string | null): boolean {
  return label ? DECIMAL_UNIT_LABELS.includes(label) : false
}

function isDecimalUnitProduct(product?: Product | null): boolean {
  if (!product) return false
  const unitId = product.unitId || product.unit?.id
  if (unitId && DECIMAL_UNIT_IDS.includes(unitId)) return true
  return isDecimalUnitLabel(getUnitLabel(product))
}

function getQuantityStep(isDecimal: boolean): number {
  return isDecimal ? 0.5 : 1
}

function getMinQuantity(isDecimal: boolean): number {
  return isDecimal ? 0.5 : 1
}

function roundQuantity(qty: number, isDecimal: boolean): number {
  if (!isDecimal) return Math.max(1, Math.round(qty))
  return Math.max(0.001, Math.round(qty * 1000) / 1000)
}

function parseQuantityInput(s: string): number {
  const normalized = toEnNum(s)
    .replace(/[٫\/،,]/g, '.')
    .replace(/[^\d.]/g, '')
  const parts = normalized.split('.')
  const clean = parts.length > 1 ? parts[0] + '.' + parts.slice(1).join('') : parts[0]
  return parseFloat(clean)
}

// ============ Format helpers ============

function formatPrice(price: number): string {
  return price.toLocaleString('fa-IR')
}

function toFaNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

function toEnNum(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
}

// ============ Jalali Date Conversion ============

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

function formatDateToJalali(isoDate: string): string {
  const d = new Date(isoDate)
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return `${toFaNum(jy)}/${toFaNum(jm).padStart(2, '۰')}/${toFaNum(jd).padStart(2, '۰')}`
}

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
  color: string
  activeBg: string
  activeBorder: string
  activeText: string
  activeDot: string
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

function getTenantIdFromStore(): string | null {
  try {
    const state = useStore.getState()
    return state.tenantId || state.user?.tenantId || null
  } catch {
    return null
  }
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ═══════════════════════════════════════════════════════════════
//  ★★★ Main POS Page Component
// ═══════════════════════════════════════════════════════════════

export default function PosPage() {
  const { toast } = useToast()
  const searchInputRef = useRef<HTMLInputElement>(null)

const isProcessingScan = useRef(false);
  const hasHydrated = useStore((s) => s._hasHydrated)
// Barcode scanner
  const lastKeyTimeRef = useRef<number>(0)
  const barcodeBufferRef = useRef<string>('')

  const barcodeTimerRef = useRef<NodeJS.Timeout | null>(null)
 

  // Store state
  const cart = useStore((s) => s.cart) ?? []
  const selectedCustomerId = useStore((s) => s.selectedCustomerId)
  const selectedCustomerName = useStore((s) => s.selectedCustomerName)
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
   const branchId = user?.branchId || null

  const planName = useStore((s) => s.planName)
  const planFeatures = useMemo(() => getFeaturesByPlanName(planName), [planName])

  const allowedPaymentTypes = useMemo(() => {
    const allowed = planFeatures.posPaymentTypes
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

  // Card payment state
  const [cardPaymentDialogOpen, setCardPaymentDialogOpen] = useState(false)
  const [cardPaymentStatus, setCardPaymentStatus] = useState<'idle' | 'connecting' | 'waiting_card' | 'verifying' | 'success' | 'failed' | 'cancelled' | 'timeout'>('idle')
  const [cardPaymentMessage, setCardPaymentMessage] = useState('')
  const [cardPaymentResult, setCardPaymentResult] = useState<CardPaymentResult | null>(null)
  const [activePosDevice, setActivePosDevice] = useState<any>(null)
  const [posAdapterInstance, setPosAdapterInstance] = useState<PosAdapter | null>(null)
  const [manualReferenceNumber, setManualReferenceNumber] = useState('')
  const [manualReferenceType, setManualReferenceType] = useState<ReferenceCodeType>('rrn')
  const [manualCardLast4, setManualCardLast4] = useState('')
  const [manualCardType, setManualCardType] = useState('')

  // Tax override
  const [taxOverrideAmount, setTaxOverrideAmount] = useState<number | null>(null)

  
  // Scanner & thermal print
  const [scannerOpen, setScannerOpen] = useState(false)
  const [thermalPrintOpen, setThermalPrintOpen] = useState(false)
  const [thermalPrintTemplate, setThermalPrintTemplate] = useState<PrintTemplate>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('invoice-template-settings')
      if (saved) {
        try {
          const s = JSON.parse(saved)
          if (s.defaultTemplate === '8cm') return 'thermal-80mm'
        } catch {}
      }
    }
    return 'thermal-80mm'
  })
  const pendingAutoPrintDataRef = useRef<PrintReceiptData | null>(null)
  const [autoPrintMode, setAutoPrintMode] = useState(false)

  // Warehouse state
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([])
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false)
  const [selectedPrintTemplate, setSelectedPrintTemplate] = useState<PrintTemplate>('thermal-80mm')
  const [printSubmitting, setPrintSubmitting] = useState(false)
  const [invoiceDiscountPercent, setInvoiceDiscountPercent] = useState<string>('')
  const [branches, setBranches] = useState<any[]>([])
  // ============ Effects ============

  // ★★★ دریافت لیست شعبه‌ها هنگام لود صفحه
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const res = await fetch('/api/branches', { headers: getAuthHeaders() })
        const data = await res.json()
        if (data.success) setBranches(data.data || [])
      } catch (err) {
        console.error('Failed to fetch branches', err)
      }
    }
    fetchBranches()
  }, [])

  // ★★★ محاسبه شعبه و انبار فعلی برای نمایش در نوار اطلاعات
  const currentWarehouse = useMemo(() => {
    return warehouses.find((w: any) => w.id === selectedWarehouseId) || null
  }, [warehouses, selectedWarehouseId])

  const currentBranch = useMemo(() => {
    if (!currentWarehouse?.branchId) return null
    return branches.find((b: any) => b.id === currentWarehouse.branchId) || null
  }, [branches, currentWarehouse])

  useEffect(() => {
    if (thermalPrintOpen) {
      setSelectedPrintTemplate(thermalPrintTemplate)
      setPrintSubmitting(false)
    }
  }, [thermalPrintOpen, thermalPrintTemplate])

  
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

  // ★ OFFLINE-OPTIMIZED: بارگذاری داده‌ها از cache یا سرور
  const loadData = useCallback(async () => {
    console.log('[POS] 🔄 شروع بارگذاری داده‌ها...')
    setLoading(true)

    const tenantId = getTenantIdFromStore()
    if (!tenantId) {
      console.warn('[POS] tenantId یافت نشد')
      setLoading(false)
      return
    }

    // ★ اگر آفلاین است، از cache بخوان
    if (!navigator.onLine) {
      console.log('[POS] 📡 آفلاین — بارگذاری از cache...')
      try {
        const {
          getCachedProducts,
          getCachedCustomers,
          getCachedCategories,
          getCachedWarehouses,
        } = await import('@/lib/offline-db')

        const [cachedProducts, cachedCustomers, cachedCategories, cachedWarehouses] =
          await Promise.all([
            getCachedProducts(),
            getCachedCustomers(),
            getCachedCategories(),
            getCachedWarehouses(),
          ])

        if (cachedProducts.length > 0) {
          setProducts(cachedProducts)
          console.log(`[POS] ✅ ${cachedProducts.length} محصول از cache بارگذاری شد`)
        }

        if (cachedCustomers.length > 0) {
          setCustomers(cachedCustomers)
          console.log(`[POS] ✅ ${cachedCustomers.length} مشتری از cache بارگذاری شد`)
        }

        if (cachedCategories.length > 0) {
          setCategories(
            cachedCategories.map((c: any) => ({
              id: c.id,
              name: c.name,
              productCount: c.productCount || 0,
            }))
          )
          console.log(`[POS] ✅ ${cachedCategories.length} دسته از cache بارگذاری شد`)
        }

        if (cachedWarehouses.length > 0) {
          setWarehouses(cachedWarehouses)
          const defaultWh = cachedWarehouses.find((w: any) => w.isDefault)
          if (defaultWh) {
            setSelectedWarehouseId(defaultWh.id)
          } else if (cachedWarehouses.length > 0) {
            setSelectedWarehouseId(cachedWarehouses[0].id)
          }
          console.log(`[POS] ✅ ${cachedWarehouses.length} انبار از cache بارگذاری شد`)
        }

        toast({
          title: '📡 حالت آفلاین',
          description: 'داده‌ها از حافظه محلی بارگذاری شدند',
          duration: 3000,
        })

      } catch (err) {
        console.error('[POS] خطا در بارگذاری cache:', err)
      }

      setLoading(false)
      return
    }

    // ★ آنلاین — واکشی از سرور
    const safeFetch = async (url: string): Promise<any | null> => {
      try {
        const res = await fetch(url, { headers: getAuthHeaders() })
        const json = await res.json()
        return json
      } catch {
        return null
      }
    }

    // Load categories
    const categoriesData = await safeFetch(`/api/categories?tenantId=${tenantId}`)
    if (categoriesData?.success) {
      const raw = categoriesData.data
      const cats = Array.isArray(raw) ? raw : (raw?.categories ?? [])
      setCategories(
        cats.map((c: any) => ({
          id: c.id,
          name: c.name,
          productCount: c.productCount || 0,
        }))
      )
      console.log(`[POS] ✅ ${cats.length} دسته بارگذاری شد`)

      // ★ Cache categories
      try {
        const { cacheCategories } = await import('@/lib/offline-db')
        await cacheCategories(cats)
      } catch {}
    } else {
      setCategories([])
      console.warn('[POS] ⚠️ دسته‌بندی‌ها بارگذاری نشد')
    }

    // Load warehouses
    const whData = await safeFetch(`/api/warehouses?tenantId=${tenantId}`)
    if (whData?.success) {
      const warehouses = whData.data ?? []
      setWarehouses(warehouses)
      const defaultWh = warehouses.find((w: any) => w.isDefault)
      if (defaultWh) {
        setSelectedWarehouseId(defaultWh.id)
      } else if (warehouses.length > 0) {
        setSelectedWarehouseId(warehouses[0].id)
      }
      console.log(`[POS] ✅ ${warehouses.length} انبار بارگذاری شد`)

      // ★ Cache warehouses
      try {
        const { cacheWarehousesMeta } = await import('@/lib/offline-db')
        await cacheWarehousesMeta(warehouses)
      } catch {}
    } else {
      setWarehouses([])
      console.warn('[POS] ⚠️ انبارها بارگذاری نشد')
    }

    // Load customers
    const customersData = await safeFetch(
      `/api/customers?tenantId=${tenantId}&limit=10`
    )
    if (customersData?.success) {
      const raw = customersData.data
      const custs = Array.isArray(raw) ? raw : (raw?.customers ?? [])
      setCustomers(custs)
      console.log(`[POS] ✅ ${custs.length} مشتری بارگذاری شد`)

      // ★ Cache customers
      try {
        const { cacheCustomers } = await import('@/lib/offline-db')
        await cacheCustomers(custs)
      } catch {}
       } else {
      setCustomers([])
      console.warn('[POS] ⚠️ مشتریان بارگذاری نشد')
    }
    // Load recents
    try {
      await posLoadRecents()
      console.log('[POS] ✅ محصولات اخیر بارگذاری شد')
    } catch (err) {
      console.error('[POS] خطا در بارگذاری محصولات اخیر:', err)
    }

    setLoading(false)
    console.log('[POS] ✅ بارگذاری کامل شد')

  }, [posLoadRecents, toast])

  useEffect(() => {
    let mounted = true
    
    if (mounted) {
      loadData()
    }
    
    return () => {
      mounted = false
    }
  }, [loadData])

    // ★ OFFLINE-FIX: گوش دادن به تغییرات اتصال شبکه
  useEffect(() => {
    const handleOnline = () => {
      console.log('[POS] 🟢 آنلاین شد — بارگذاری مجدد داده‌ها...')
      useStore.getState().setOnline(true)
      loadData()
      // ★ sync خودکار صف آفلاین
      import('@/lib/sync-engine').then(({ syncEngine }) => {
        syncEngine.init()
        syncEngine.sync().catch(() => {})
      }).catch(() => {})
      toast({
        title: '🟢 اتصال برقرار شد',
        description: 'داده‌ها به‌روزرسانی و صف آفلاین همگام‌سازی می‌شود',
        duration: 4000,
      })
    }
    const handleOffline = () => {
      console.log('[POS] 🔴 آفلاین شد')
      useStore.getState().setOnline(false)
      toast({
        title: '📡 اتصال قطع شد',
        description: 'حالت آفلاین فعال شد — داده‌ها از حافظه محلی خوانده می‌شوند',
        duration: 4000,
      })
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [loadData, toast])


  useEffect(() => {
    const handleInventoryChanged = async () => {
      console.log('[POS] inventory-changed event')
      await posLoadRecents()
    }

    window.addEventListener('inventory-changed', handleInventoryChanged)
    return () => window.removeEventListener('inventory-changed', handleInventoryChanged)
  }, [posLoadRecents])

  // ★ جستجوی مشتری (آفلاین + آنلاین)
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

    // ★ اگر آفلاین است، از customers state جستجو کن
    if (!navigator.onLine) {
      const termLower = term.toLowerCase()
      const filtered = customers.filter((c) => {
        const fullName = `${c.firstName} ${c.lastName}`.toLowerCase()
        const mobile = c.mobile || ''
        return fullName.includes(termLower) || mobile.includes(term) || c.code.toLowerCase().includes(termLower)
      })
      setCustomerSearchResults(filtered)
      setCustomerSearchLoading(false)
      return
    }

    // ★ آنلاین — واکشی از سرور
    setCustomerSearchLoading(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/contacts?type=customer&search=${encodeURIComponent(term)}&tenantId=${encodeURIComponent(tid)}`,
          { headers: getAuthHeaders() }
        )
        if (!res.ok) {
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
        console.log('[POS] /api/contacts response:', { success: data.success, count: data.data?.length })
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
  }, [customerSearch, customers])

  const didInitRef = useRef(false)
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    loadData()
  }, [loadData])

  useEffect(() => {
    setPaymentType(null as any)
    setTaxOverrideAmount(null)
    setInvoiceDiscountPercent('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cartItemsSignature = cart.map(c => `${c.productId}:${c.quantity}:${c.unitPrice}:${c.discount}`).join('|')
  useEffect(() => {
    setTaxOverrideAmount(null)
  }, [cartItemsSignature])

    // ============ Derived data ============

    const filteredProducts = useMemo(() => {
    const searchQ = posSearchQuery.trim()
    if (searchQ.length >= 2) {
      // ★ OFFLINE-FIX: جستجوی محلی از posRecents + products (fallback)
      if (!isOnline || !navigator.onLine) {
        const q = searchQ.toLowerCase()
        // ★ اصلاح: اگر posRecents خالی بود، از products state استفاده کن
        const offlineSource = posRecents.length > 0 ? posRecents : products
        let offlineResults = offlineSource.filter((p) => {
          if (p.isActive === false) return false
          return (
            p.name?.toLowerCase().includes(q) ||
            p.name?.includes(searchQ) ||
            p.code?.toLowerCase() === q ||
            p.code?.includes(searchQ) ||
            p.barcode === searchQ ||
            p.barcode?.includes(searchQ)
          )
        })
        if (selectedCategory !== 'all') {
          offlineResults = offlineResults.filter((p) => p.categoryId === selectedCategory)
        }
        console.log(`[POS] 📡 جستجوی آفلاین: ${offlineResults.length} نتیجه (منبع: ${posRecents.length > 0 ? 'posRecents' : 'products-cache'})`)
        return offlineResults
      }
      // ★ ONLINE: جستجوی سرور
      if (posSearchStatus === 'searching') return []
      let results = posSearchResults.filter((p) => p.isActive !== false)
      if (selectedCategory !== 'all') {
        results = results.filter((p) => p.categoryId === selectedCategory)
      }
      return results
    }
    // ★ بدون جستجو: نمایش محصولات اخیر
    // ★ OFFLINE-FIX: اگر posRecents خالی بود، از products استفاده کن
    const recentsSource = posRecents.length > 0 ? posRecents : products
    if (recentsSource.length === 0) return []
    let recents = recentsSource.filter((p) => p.isActive !== false)
    if (selectedCategory !== 'all') {
      recents = recents.filter((p) => p.categoryId === selectedCategory)
    }
    return recents
  }, [
    posSearchQuery,
    posSearchResults,
    posSearchStatus,
    posRecents,
    products,       // ★ OFFLINE-FIX: اضافه شد
    selectedCategory,
    isOnline,
  ])

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

    const finalTax = taxOverrideAmount !== null ? taxOverrideAmount : totalTax

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
  (product: any) => {
    console.log('1️⃣ [START] handleAddToCart فراخوانی شد برای:', product.name);
    console.log('2️⃣ [STOCK] مقدار currentStock محصول:', product.currentStock);

    // بررسی موجودی
    if (product.currentStock <= 0) {
      console.log('❌ [BLOCKED] موجودی محصول صفر یا کمتر است');
      toast({
        title: 'محصول ناموجود است',
        description: `${product.name} در انبار موجود نیست`,
        variant: 'destructive',
      });
      return;
    }

    // به‌روزرسانی کش محصولات
    setProducts((prev: any[]) => {
      if (prev.find((p) => p.id === product.id)) return prev;
      const updatedProducts = [...prev, product];
      import('@/lib/offline-db').then(({ cacheProducts }: any) => {
        cacheProducts(updatedProducts).catch((err: any) => console.warn('[POS] Cache failed:', err));
      }).catch(() => {});
      return updatedProducts;
    });

    console.log('3️⃣ [CART CHECK] طول فعلی سبد خرید:', cart.length);
    const existingItem = cart.find((c: any) => c.productId === product.id);
    
    if (existingItem && existingItem.quantity >= product.currentStock) {
      console.log('❌ [BLOCKED] تعداد در سبد از موجودی انبار بیشتر است');
      toast({
        title: 'موجودی کافی نیست',
        description: `موجودی فعلی: ${product.currentStock}`,
        variant: 'destructive',
      });
      return;
    }

    if (typeof addToCart !== 'function') {
      console.log('❌ [BLOCKED] تابع addToCart تعریف نشده است');
      toast({ title: 'لطفاً صبر کنید', description: 'سیستم در حال بارگذاری است' });
      return;
    }

    console.log('4️⃣ [EXECUTING] در حال محاسبه و فراخوانی addToCart...');
    const lineTotal = computeLineTotal(1, product.salePrice, 0, product.taxRate);

    const newItem = {
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice: product.salePrice,
      discount: 0,
      taxRate: product.taxRate,
      lineTotal,
      currentStock: product.currentStock,
      unitLabel: getUnitLabel(product),
    };

    console.log('5️⃣ [PAYLOAD] آبجکت ارسالی به addToCart:', newItem);
    
    // فراخوانی اصلی
    addToCart(newItem);
    
    console.log('✅ [SUCCESS] addToCart اجرا شد. اگر UI آپدیت نشد، مشکل از تعریف addToCart یا رندر لیست است.');

    if (!isOnline) {
      toast({
        title: '📡 آفلاین',
        description: 'تغییرات شما ذخیره و پس از اتصال ثبت می‌شوند',
        duration: 3000,
      });
    }
  },
  [addToCart, cart, toast, isOnline, setProducts, computeLineTotal, getUnitLabel]
);

 // ══════════════════════════════════════════════════════════════
// ★ بارکدخوان هوشمند در سطح کل صفحه (با پشتیبانی کامل آفلاین)
// ★★★ v2.1: رفع باگ اسکن دوگانه + پشتیبانی صریح و قطعی از حالت آفلاین
// ══════════════════════════════════════════════════════════════
useEffect(() => {
  const handleGlobalKeyDown = async (e: KeyboardEvent) => {
    // ★★★ جلوگیری از پردازش همزمان (رفع باگ اسکن دوتایی)
    if (isProcessingScan.current) {
      e.preventDefault()
      return
    }

    // ۱. اگر فوکوس روی اینپوت جستجوی خودمان است، اجازه دهیم handleSearchKeyDown کار کند
    if (document.activeElement === searchInputRef.current) return

    // ۲. اگر فوکوس روی هر اینپوت/textarea/select/contentEditable دیگری است، کاری نکنیم
    const activeEl = document.activeElement as HTMLElement | null
    if (activeEl) {
      const tagName = activeEl.tagName.toLowerCase()
      if (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        activeEl.isContentEditable
      ) {
        return
      }
    }

    // ۳. پردازش کلید Enter: اگر بافر بارکد غیرخالی است، آن را جستجو کن
    if (e.key === 'Enter') {
      const barcode = barcodeBufferRef.current.trim()
      if (barcode.length >= 3) {
        e.preventDefault()
        
        // ★★★ فعال کردن flag برای جلوگیری از اسکن مجدد
        isProcessingScan.current = true

        try {
          // ==========================================================
          // ★★★ حالت آفلاین: جستجو مستقیم و سریع در کش محلی
          // ==========================================================
          if (!navigator.onLine) {
            const offlineSource = posRecents.length > 0 ? posRecents : products
            const cachedProduct = offlineSource.find(
              (p) => p.isActive !== false && (p.barcode === barcode || p.code === barcode)
            )
            
            if (cachedProduct) {
              handleAddToCart(cachedProduct)
              toast({ 
                title: '✓ افزودن به سبد (آفلاین)', 
                description: cachedProduct.name 
              })
            } else {
              toast({
                title: '📡 آفلاین — یافت نشد',
                description: `بارکد "${barcode}" در حافظه محلی ثبت نشده است`,
                variant: 'destructive',
              })
            }
          } 
          // ==========================================================
          // ★★★ حالت آنلاین: جستجو در سرور
          // ==========================================================
          else {
            const foundByBarcode = await posLookupByBarcode(barcode)
            if (foundByBarcode && foundByBarcode.id) {
              handleAddToCart(foundByBarcode)
              toast({ title: '✓ افزودن به سبد', description: foundByBarcode.name })
            } else {
              // تلاش دوم: جستجو به عنوان کد محصول
              const codeFound = await posLookupByCode(barcode)
              if (codeFound && codeFound.id) {
                handleAddToCart(codeFound)
                toast({ title: '✓ افزودن به سبد', description: codeFound.name })
              } else {
                toast({
                  title: 'یافت نشد',
                  description: `محصولی با بارکد/کد "${barcode}" یافت نشد`,
                  variant: 'destructive',
                })
              }
            }
          }
        } catch (err) {
          console.error('[POS] Global barcode scan error:', err)
          toast({ title: 'خطا', description: 'خطا در پردازش بارکد', variant: 'destructive' })
        } finally {
          // پاک کردن بافر و ریست کردن تایمر
          barcodeBufferRef.current = ''
          if (barcodeTimerRef.current) {
            clearTimeout(barcodeTimerRef.current)
            barcodeTimerRef.current = null
          }
          
          // ★★★ غیرفعال کردن flag بعد از ۵۰۰ میلی‌ثانیه (Debounce)
          setTimeout(() => {
            isProcessingScan.current = false
          }, 500)
        }
      }
      return
    }

    // ۴. کلید Escape: پاک کردن بافر
    if (e.key === 'Escape') {
      barcodeBufferRef.current = ''
      if (barcodeTimerRef.current) {
        clearTimeout(barcodeTimerRef.current)
        barcodeTimerRef.current = null
      }
      return
    }

    // ۵. نادیده گرفتن کلیدهای کنترلی و کلیدهای خاص
    if (e.key.length > 1) return
    if (e.ctrlKey || e.metaKey || e.altKey) return

    // ۶. اضافه کردن کاراکتر به بافر بارکد
    barcodeBufferRef.current += e.key

    // ۷. تنظیم تایمر: اگر ۲ ثانیه کلیدی زده نشد، بافر را پاک کن
    if (barcodeTimerRef.current) {
      clearTimeout(barcodeTimerRef.current)
    }
    barcodeTimerRef.current = setTimeout(() => {
      barcodeBufferRef.current = ''
    }, 2000)
  }

  window.addEventListener('keydown', handleGlobalKeyDown)
  return () => {
    window.removeEventListener('keydown', handleGlobalKeyDown)
    if (barcodeTimerRef.current) {
      clearTimeout(barcodeTimerRef.current)
    }
  }
}, [posLookupByBarcode, posLookupByCode, handleAddToCart, toast, posRecents, products])

  const handleIncreaseQuantity = useCallback(
  (productId: string) => {
    const item = cart.find((c) => c.productId === productId)
    if (item) {
      const product = products.find((p) => p.id === productId)
      const maxStock = product?.currentStock ?? item.currentStock ?? Infinity
      // ★ DECIMAL: تشخیص واحد اعشاری
      const isDecimal = product ? isDecimalUnitProduct(product) : isDecimalUnitLabel(item.unitLabel)
      const step = getQuantityStep(isDecimal)
      const newQty = roundQuantity(item.quantity + step, isDecimal)
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
    if (item) {
      const product = products.find((p) => p.id === productId)
      // ★ DECIMAL: تشخیص واحد اعشاری
      const isDecimal = product ? isDecimalUnitProduct(product) : isDecimalUnitLabel(item.unitLabel)
      const step = getQuantityStep(isDecimal)
      const minQty = getMinQuantity(isDecimal)
      if (item.quantity <= minQty) return
      const newQty = roundQuantity(item.quantity - step, isDecimal)
      if (newQty < minQty) return
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
  [cart, products]
)

// ★ DECIMAL: ویرایش مستقیم تعداد (با پشتیبانی اعشار)
const handleQuantityChange = useCallback(
  (productId: string, newQuantity: number) => {
    const item = cart.find((c) => c.productId === productId)
    if (!item) return
    if (isNaN(newQuantity) || newQuantity <= 0) return
    const product = products.find((p) => p.id === productId)
    const isDecimal = product ? isDecimalUnitProduct(product) : isDecimalUnitLabel(item.unitLabel)
    let qty = roundQuantity(newQuantity, isDecimal)
    // ★ بررسی موجودی — اگر بیشتر از موجودی بود، به حداکثر موجودی محدود می‌شود
    const maxStock = product?.currentStock ?? item.currentStock ?? Infinity
    if (qty > maxStock) {
      qty = roundQuantity(maxStock, isDecimal)
      toast({
        title: 'موجودی کافی نیست',
        description: `حداکثر موجودی: ${formatPrice(maxStock)} ${product ? getUnitLabel(product) : item.unitLabel || 'عدد'} — همان مقدار اعمال شد`,
        variant: 'destructive',
        duration: 4000,
      })
    }
    if (qty === item.quantity) return
    const newLineTotal = computeLineTotal(qty, item.unitPrice, item.discount, item.taxRate)
    useStore.setState((state) => ({
      cart: state.cart.map((c) =>
        c.productId === productId
          ? { ...c, quantity: qty, lineTotal: newLineTotal }
          : c
      ),
    }))
  },
  [cart, products, toast]
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



// ۲. تابع handleSearchKeyDown را کاملاً با این نسخه جایگزین کنید:
const handleSearchKeyDown = useCallback(
  async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      if (isProcessingScan.current) return;

      const q = (e.currentTarget as HTMLInputElement).value.trim().replace(/[\r\n]/g, '');
      if (!q) return;

      isProcessingScan.current = true;
      const offline = !isOnline || !navigator.onLine;

      try {
        if (offline) {
          const qLower = q.toLowerCase();
          const offlineSource = posRecents.length > 0 ? posRecents : products;
          
          const byBarcode = offlineSource.find(
            (p) => p.isActive !== false && p.barcode === q
          );
          if (byBarcode) {
            handleAddToCart(byBarcode);
            posSearchSetQuery('');
            return;
          }
          
          const byCode = offlineSource.find(
            (p) => p.isActive !== false && p.code?.toLowerCase() === qLower
          );
          if (byCode) {
            handleAddToCart(byCode);
            posSearchSetQuery('');
            return;
          }

          const byName = offlineSource.find(
            (p) =>
              p.isActive !== false &&
              (p.name?.toLowerCase().includes(qLower) || p.name?.includes(q))
          );
          if (byName) {
            handleAddToCart(byName);
            posSearchSetQuery('');
            return;
          }

          if (filteredProducts.length > 0) {
            handleAddToCart(filteredProducts[0]);
            posSearchSetQuery('');
            return;
          }
          
          toast({
            title: '📡 آفلاین — یافت نشد',
            description: `محصولی با "${q}" در حافظه محلی یافت نشد`,
            variant: 'destructive',
          });
          return;
        }

        // ★ جستجو به عنوان بارکد
        const foundByBarcode = await posLookupByBarcode(q);
        if (foundByBarcode && foundByBarcode.id) {
          handleAddToCart(foundByBarcode);
          posSearchSetQuery('');
          return;
        }

        // ★ جستجو به عنوان کد محصول
        const codeFound = await posLookupByCode(q);
        if (codeFound && codeFound.id) {
          handleAddToCart(codeFound);
          posSearchSetQuery('');
          return;
        }

        // ★ استفاده از اولین نتیجه جستجوی متنی
        if (posSearchResults.length > 0) {
          const firstResult = posSearchResults[0];
          if (firstResult && firstResult.id) {
            handleAddToCart(firstResult);
            posSearchSetQuery('');
            return;
          }
        }

        toast({
          title: 'یافت نشد',
          description: `محصولی با بارکد/کد "${q}" یافت نشد.`,
          variant: 'destructive',
        });

      } catch (error) {
        console.error('Barcode scan error:', error);
        toast({ title: 'خطا', description: 'خطا در پردازش اسکن', variant: 'destructive' });
      } finally {
        setTimeout(() => {
          isProcessingScan.current = false;
        }, 500);
      }
    }

    if (e.key === 'Escape') {
      posSearchSetQuery('');
      searchInputRef.current?.blur();
    }
  },
  [
    posSearchResults,
    posRecents,
    posLookupByBarcode,
    posLookupByCode,
    posSearchSetQuery,
    handleAddToCart,
    filteredProducts,
    toast,
    isOnline,
    products,
  ]
);

  
  const handleBarcodeDetected = useCallback(
    async (barcode: string) => {
      // ★ OFFLINE: جستجو در cache
      if (!navigator.onLine) {
        const cachedProduct = posRecents.find(
          (p) => p.isActive !== false && p.barcode === barcode
        )
        if (cachedProduct) {
          handleAddToCart(cachedProduct)
          toast({ title: '✓ افزودن به سبد (آفلاین)', description: cachedProduct.name })
        } else {
          posSearchSetQuery(barcode)
          toast({
            title: '📡 آفلاین — یافت نشد',
            description: `بارکد ${barcode} در حافظه محلی ثبت نشده`,
            variant: 'destructive',
          })
        }
        return
      }

      // ★ ONLINE: جستجو در سرور
      const product = await posLookupByBarcode(barcode)
      if (product) {
        handleAddToCart(product)
        toast({ title: '✓ افزودن به سبد', description: product.name })
      } else {
        posSearchSetQuery(barcode)
        toast({
          title: 'بارکد یافت نشد',
          description: `محصولی با بارکد ${barcode} ثبت نشده. می‌توانید جستجو کنید.`,
          variant: 'destructive',
        })
      }
    },
    [posLookupByBarcode, posSearchSetQuery, handleAddToCart, toast, posRecents]
  )

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

  const openCardPaymentDialog = useCallback(async () => {
    setCardPaymentResult(null)
    setManualReferenceNumber('')
    setManualReferenceType('rrn')
    setManualCardLast4('')
    setManualCardType('')
    setCardPaymentStatus('idle')
    setCardPaymentMessage('در حال آماده‌سازی...')
    setCardPaymentDialogOpen(true)

    const device = await loadActivePosDevice()
    if (!device) {
      setCardPaymentStatus('failed')
      setCardPaymentMessage('هیچ کارتخوان فعالی تنظیم نشده. لطفاً در تنظیمات یک کارتخوان اضافه کنید.')
      setActivePosDevice(null)
      return
    }

    setActivePosDevice(device)
    console.log('[POS] Active POS device:', { id: device.id, name: device.name, type: device.terminalType })

    const support = checkBrowserSupport(device.terminalType)
    if (!support.supported) {
      setCardPaymentStatus('failed')
      setCardPaymentMessage(support.message || 'مرورگر از این نوع اتصال پشتیبانی نمی‌کند')
      return
    }

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

    setCardPaymentStatus('connecting')
    setCardPaymentMessage('در حال اتصال به کارتخوان...')

    const connectResult = await adapter.connect()
    if (!connectResult.success) {
      setCardPaymentStatus('failed')
      setCardPaymentMessage(connectResult.message)
      return
    }

    if (device.terminalType === 'manual') {
      setCardPaymentStatus('waiting_card')
      setCardPaymentMessage('پس از کشیدن کارت، شماره پیرو و ۴ رقم آخر کارت را وارد کنید')
      adapter.pay({
        amount: cartTotals.totalAmount,
        invoiceId: undefined,
        invoiceNumber: undefined,
      }).then((result) => {
        handleCardPaymentResult(result, device.id)
      })
      return
    }

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

  useEffect(() => {
    openCardPaymentDialogRef.current = openCardPaymentDialog
  }, [openCardPaymentDialog])

  const handleCardPaymentResult = useCallback(async (result: CardPaymentResult, deviceId: string) => {
    console.log('[POS] Card payment result:', result)
    setCardPaymentResult(result)

    if (result.success && result.status === 'successful') {
      setCardPaymentStatus('success')
      setCardPaymentMessage(
        `پرداخت موفق! شماره پیرو: ${result.referenceNumber || '-'}${result.cardNumber ? ` | کارت: ****${result.cardNumber}` : ''}`
      )

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

      setTimeout(() => {
        setCardPaymentDialogOpen(false)
        setConfirmDialogOpen(true)
      }, 1500)
    } else {
      setCardPaymentStatus(result.status as any)
      setCardPaymentMessage(result.errorMessage || 'پرداخت ناموفق بود')
    }
  }, [])

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

  const handleSubmitManualCardPayment = useCallback(async () => {
    if (!posAdapterInstance) return
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

  const getPaymentTypeLabel = useCallback((type: string): string => {
    const config = paymentTypeConfig.find((c) => c.value === type)
    return config?.label ?? type
  }, [])

  const handleConfirmInvoiceFinal = useCallback(async () => {
    // ★ OFFLINE: ذخیره در صف
    if (!navigator.onLine) {
      console.log('[POS] 🔴 آفلاین — فاکتور به صف اضافه می‌شود')

      useStore.getState().setOnline(false)

      try {
        const { addToSyncQueue, getSyncQueueCount } = await import('@/lib/offline-db')

        const offlineNumber = `OFF-${Date.now()}`

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
        const isCreditOrInstallment =
          ptFinal === 'credit' || ptFinal === 'installment' || ptFinal === 'check'
        
        // ★★★ اصلاح آفلاین: محاسبه صحیح پیش‌پرداخت
             // ★★★ اصلاح آفلاین: محاسبه صحیح پیش‌پرداخت
        const currentInstPlanOffline = useStore.getState().installmentPlan
        const downPaymentAmountOffline = installmentDownPayment || currentInstPlanOffline?.downPayment || 0
        const paidAmountOffline = isCreditOrInstallment ? (ptFinal === 'installment' ? downPaymentAmountOffline : 0) : cartTotals.totalAmount
        const remainingAmountOffline = cartTotals.totalAmount - paidAmountOffline

        // ساختار داده‌های اقساط برای صف آفلاین (با تایپ any برای جلوگیری از خطای TS)
        const installmentDataOffline: any = (ptFinal === 'installment' && (installmentCalc || currentInstPlanOffline)) ? {
          downPayment: downPaymentAmountOffline,
          numberOfInstallments: installmentCount || currentInstPlanOffline?.numberOfInstallments || 1,
          interestRate: installmentInterestRate || currentInstPlanOffline?.interestRate || 0,
          installmentPeriod: installmentPeriod || currentInstPlanOffline?.installmentPeriod || 'monthly',
          totalWithInterest: installmentCalc?.totalWithInterest || currentInstPlanOffline?.totalWithInterest || 0,
          installmentAmount: installmentCalc?.installmentAmount || currentInstPlanOffline?.installmentAmount || 0,
          remainingAmount: remainingAmountOffline,
          schedules: installmentCalc?.schedule || [],
        } : undefined

        await addToSyncQueue('invoice', {
          method: 'POST',
          url: '/api/invoices',
          body: {
            tenantId: getTenantIdFromStore(),
            branchId: branchId || undefined,
            customerId: selectedCustomerId || undefined,
            paymentType: ptFinal,
            items: invoiceItems,
            discountAmount: cartTotals.discountAmount + (cartTotals.invoiceDiscountAmount || 0),
            taxAmount: cartTotals.taxAmount,
            paidAmount: paidAmountOffline,
            remainingAmount: remainingAmountOffline,
            warehouseId: selectedWarehouseId || undefined,
            ...(installmentDataOffline ? { installmentData: installmentDataOffline } : {}),
          },
        })

        
                // ★ OFFLINE-FIX: کاهش موجودی در state محلی + IndexedDB cache
        try {
          const { updateCachedProductStock } = await import('@/lib/offline-db')
          for (const item of cart) {
            // بروزرسانی state محلی
            setProducts((prev) =>
              prev.map((p) =>
                p.id === item.productId
                  ? { ...p, currentStock: Math.max(0, p.currentStock - item.quantity) }
                  : p
              )
            )
            // بروزرسانی IndexedDB cache
            const product = products.find((p) => p.id === item.productId)
            if (product) {
              const newStock = Math.max(0, product.currentStock - item.quantity)
              await updateCachedProductStock(item.productId, newStock)
            }
          }
          console.log('[POS] ✅ موجودی cache آفلاین بروزرسانی شد')
        } catch (stockErr) {
          console.warn('[POS] ⚠️ خطا در بروزرسانی موجودی cache:', stockErr)
        }

        const count = await getSyncQueueCount()
        useStore.getState().setPendingSyncCount(count)

        toast({
          title: '📡 فاکتور در صف ذخیره شد',
          description: `شماره آفلاین: ${offlineNumber} — پس از اتصال ثبت خواهد شد`,
          duration: 5000,
        })

        clearCart()
        posSearchSetQuery('')
        setSelectedCategory('all')
        setPaymentType(null as any)
        setTaxOverrideAmount(null)
        setInvoiceDiscountPercent('')
        setConfirmDialogOpen(false)
        setSubmitting(false)
        return

      } catch (err: any) {
        console.error('[POS] خطا در ذخیره آفلاین:', err)
        toast({
          title: '❌ خطا در ذخیره آفلاین',
          description: err?.message || 'خطای ناشناخته',
          variant: 'destructive',
        })
        setSubmitting(false)
        return
      }
    }

    // ★ ONLINE: ارسال به سرور
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
      const isCreditOrInstallment =
        ptFinal === 'credit' || ptFinal === 'installment' || ptFinal === 'check'
      
      // ★★★ اصلاح: اگر قسطی است، مبلغ پرداختی برابر با پیش‌پرداخت است (نه صفر!)
      const currentInstPlan = useStore.getState().installmentPlan
      const downPaymentAmount = installmentDownPayment || currentInstPlan?.downPayment || 0
      const paidAmount = isCreditOrInstallment ? (ptFinal === 'installment' ? downPaymentAmount : 0) : cartTotals.totalAmount
      const remainingAmount = cartTotals.totalAmount - paidAmount
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
         branchId: branchId || undefined,
        customerId: selectedCustomerId || undefined,
        paymentType: (paymentType || 'cash').toLowerCase(),
        items: invoiceItems,
        payments,
        discountAmount: cartTotals.discountAmount + (cartTotals.invoiceDiscountAmount || 0),
        taxAmount: cartTotals.taxAmount,
        paidAmount,
        remainingAmount,
        warehouseId: selectedWarehouseId || undefined,
      }

          // ★★★ اصلاح: ارسال داده‌های اقساط با نام صحیح (installmentData) و همچنین در ریشه برای اطمینان صددرصدی
          // ★★★ اصلاح: ارسال داده‌های اقساط با نام صحیح و جلوگیری از خطای TypeScript
      const currentInstPlanReq = useStore.getState().installmentPlan
      if (ptFinal === 'installment' && (installmentCalc || currentInstPlanReq)) {
        const planData: any = {
          downPayment: installmentDownPayment || currentInstPlanReq?.downPayment || 0,
          numberOfInstallments: installmentCount || currentInstPlanReq?.numberOfInstallments || 1,
          interestRate: installmentInterestRate || currentInstPlanReq?.interestRate || 0,
          installmentPeriod: installmentPeriod || currentInstPlanReq?.installmentPeriod || 'monthly',
          totalWithInterest: installmentCalc?.totalWithInterest || currentInstPlanReq?.totalWithInterest || 0,
          installmentAmount: installmentCalc?.installmentAmount || currentInstPlanReq?.installmentAmount || 0,
          remainingAmount: installmentCalc?.remainingAmount || currentInstPlanReq?.remainingAmount || 0,
        }
        
        // ۱. ارسال به صورت nested (مطابق با انتظار بک‌اند)
        ;(requestBody as any).installmentData = {
          ...planData,
          schedules: installmentCalc?.schedule || [],
        }
        
        // ۲. ارسال به صورت flat در ریشه (برای اطمینان از خوانده شدن توسط بک‌اند)
        ;(requestBody as any).downPayment = planData.downPayment
        ;(requestBody as any).numberOfInstallments = planData.numberOfInstallments
        ;(requestBody as any).interestRate = planData.interestRate
        ;(requestBody as any).installmentPeriod = planData.installmentPeriod
        ;(requestBody as any).totalWithInterest = planData.totalWithInterest
        ;(requestBody as any).installmentAmount = planData.installmentAmount
        ;(requestBody as any).remainingAmount = planData.remainingAmount
      }

      if (ptFinal === 'credit') {
        requestBody.creditData = {
          dueDate: creditDueDate || undefined,
          description: creditDescription || undefined,
        }
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

      let res: Response
      try {
        res = await fetch('/api/invoices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(requestBody),
        })
      } catch (networkErr: any) {
        console.error('[POS] Network error during invoice submit:', networkErr)
        useStore.getState().setOnline(false)

        try {
          const { addToSyncQueue, getSyncQueueCount } = await import('@/lib/offline-db')
          await addToSyncQueue('invoice', {
            method: 'POST',
            url: '/api/invoices',
            body: requestBody,
          })
          const count = await getSyncQueueCount()
          useStore.getState().setPendingSyncCount(count)

          toast({
            title: '📡 اتصال قطع شد',
            description: 'فاکتور در صف ذخیره شد و پس از اتصال ثبت خواهد شد',
            duration: 5000,
          })

          clearCart()
          posSearchSetQuery('')
          setSelectedCategory('all')
          setPaymentType(null as any)
          setTaxOverrideAmount(null)
          setInvoiceDiscountPercent('')
        } catch (queueErr) {
          toast({
            title: '❌ خطای شبکه',
            description: 'اتصال قطع شد و امکان ذخیره آفلاین وجود ندارد',
            variant: 'destructive',
          })
        }

        setSubmitting(false)
        return
      }

      let result: any
      try {
        result = await res.json()
      } catch (parseErr) {
        console.error('[POS] Failed to parse invoice response:', parseErr)
        toast({
          title: 'خطای سرور',
          description: `خطا در ثبت فاکتور (کد ${res.status})`,
          variant: 'destructive',
        })
        setSubmitting(false)
        return
      }

      console.log('[POS] Invoice API response:', {
        status: res.status,
        success: result.success,
        error: result.error,
      })

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

        if (ptFinal === 'check' && selectedCustomerId) {
          try {
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
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split('T')[0],
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
        setPaymentType(null as any)
        setTaxOverrideAmount(null)
        setInvoiceDiscountPercent('')

        const printSettings =
          typeof window !== 'undefined'
            ? localStorage.getItem('auto-print-settings')
            : null
        if (printSettings) {
          try {
            const ps = JSON.parse(printSettings)
            if (ps.enabled && ps.paymentTypes && ps.paymentTypes.length > 0) {
              const currentPaymentType = (paymentType || 'cash').toLowerCase()
              if (ps.paymentTypes.includes(currentPaymentType)) {
                const cartCopy = [...cart]
                const totalsCopy = { ...cartTotals }
                const customerCopy = customers.find((c) => c.id === selectedCustomerId)
                const paymentTypeCopy = paymentType

                const savedTemplate = ps.template || '8cm'
                const mappedTemplate: PrintTemplate =
                  savedTemplate === 'a4'
                    ? 'a4'
                    : savedTemplate === '58mm'
                    ? 'thermal-58mm'
                    : 'thermal-80mm'
                setThermalPrintTemplate(mappedTemplate)

                const customerNameForPrint = customerCopy
                  ? `${customerCopy.firstName || ''} ${customerCopy.lastName || ''}`.trim()
                  : 'فروش عمومی'

                const paymentTypeLabelForPrint = (() => {
                  const cfg = paymentTypeConfig.find((c) => c.value === paymentTypeCopy)
                  return cfg?.label ?? (paymentTypeCopy || 'نقدی')
                })()

                const pt = (paymentTypeCopy || '').toLowerCase()
                const paidAmountForPrint =
                  pt === 'credit'
                    ? 0
                    : pt === 'installment'
                    ? installmentDownPayment
                    : totalsCopy.totalAmount

                const settings: any = (() => {
                  if (typeof window === 'undefined') return {}
                  const saved = localStorage.getItem('invoice-template-settings')
                  try {
                    return saved ? JSON.parse(saved) : {}
                  } catch {
                    return {}
                  }
                })()

                const autoPrintReceiptData: PrintReceiptData = {
                  invoiceNumber:
                    result.data?.number || `INV-${Date.now().toString().slice(-6)}`,
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

                pendingAutoPrintDataRef.current = autoPrintReceiptData
                setAutoPrintMode(true)

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
        const errorMsg =
          result.error || result.message || `خطای سرور (کد ${res.status})`
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
      toast({
        title: 'خطا',
        description: error?.message || 'خطا در ثبت فاکتور',
        variant: 'destructive',
      })
    }

    setSubmitting(false)
  }, [
    cart,
    cartTotals,
    paymentType,
    selectedCustomerId,
    selectedWarehouseId,
    clearCart,
    loadData,
    toast,
    installmentCalc,
    installmentDownPayment,
    installmentCount,
    installmentInterestRate,
    installmentPeriod,
    creditDueDate,
    creditDescription,
    setInstallmentPlan,
    posSearchSetQuery,
    posLoadRecents,
    customers,
    storeName,
    user,
  ])

  const handlePrintInvoice = useCallback(() => {
    if (cart.length === 0) {
      toast({ title: 'خطا', description: 'سبد فاکتور خالی است' })
      return
    }
    pendingAutoPrintDataRef.current = null
    setAutoPrintMode(false)
    setThermalPrintOpen(true)
  }, [cart.length, toast])

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

  const handleDoPrint = useCallback(() => {
    const currentData = autoPrintMode && pendingAutoPrintDataRef.current
      ? pendingAutoPrintDataRef.current
      : receiptData
    if (!currentData) return

    setPrintSubmitting(true)
    try {
      const baseHtml = generatePrintHtml(selectedPrintTemplate, currentData)
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

  const previewWidth = selectedPrintTemplate === 'thermal-58mm' ? 220 : selectedPrintTemplate === 'thermal-80mm' ? 300 : 460

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
  }, [handleConfirmInvoice, posSearchSetQuery])

  // ============ Render ============

  if (!hasHydrated) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-3 border-emerald-200 border-t-emerald-600" />
        <p className="text-slate-400 text-xs">در حال بارگذاری صندوق فروش...</p>
      </div>
    )
  }

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
      {/* ==================== HEADER ==================== */}
      <header className="bg-gradient-to-l from-white to-slate-50/80 border-b border-slate-200/80 px-2 sm:px-3 py-1.5 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
            <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-bold text-slate-800">صندوق فروش</h1>
            <p className="text-[9px] sm:text-[10px] text-slate-400 hidden xs:block">ثبت فاکتور فروش</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {warehouses.length > 1 && (
            <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
              <SelectTrigger className="h-8 w-[110px] sm:w-[140px] text-[10px] sm:text-xs border-slate-200 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map(wh => (
                  <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!isOnline && (
            <Badge variant="outline" className="gap-0.5 text-[8px] sm:text-[9px] border-amber-300 text-amber-600 bg-amber-50 px-1.5 py-0">
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

      {/* ==================== SEARCH BAR ==================== */}
      <div className="bg-white border-b border-slate-200 px-2 sm:px-3 py-2 sm:py-2.5 shrink-0 relative z-30">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* جستجو */}
          <div className="relative flex-1 order-1 sm:order-none">
            <Search className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 pointer-events-none" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="جستجو / بارکد [F2]"
              value={posSearchQuery}
              onChange={(e) => posSearchSetQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="pr-9 sm:pr-10 pl-16 sm:pl-20 
                h-10 sm:h-11 
                bg-slate-50 border-slate-200 
                text-base sm:text-sm 
                focus:bg-white focus:border-emerald-400 focus:ring-emerald-400/20 
                font-medium"
            />
                         {/* وضعیت جستجو */}
              <div className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {(!isOnline || !navigator.onLine) && posSearchQuery.trim().length >= 2 ? (
                  <span className="text-[9px] text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded hidden sm:block flex items-center gap-0.5">
                    <WifiOff className="w-2.5 h-2.5" />
                    {toFaNum(filteredProducts.length)} نتیجه
                  </span>
                ) : posSearchStatus === 'searching' ? (
                  <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                ) : posSearchQuery.trim().length >= 2 && posSearchStatus === 'success' ? (
                  <span className="text-[9px] text-emerald-600 font-medium bg-emerald-50 px-1.5 py-0.5 rounded hidden sm:block">
                    {toFaNum(posSearchResults.length)} نتیجه
                  </span>
                ) : (
                  <Barcode className="w-3.5 h-3.5 text-slate-300" />
                )}
              </div>

            {/* Lookup Dropdown */}
            {posSearchQuery.trim().length >= 2 && filteredProducts.length > 0 && (
              <div
                className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-[60vh] overflow-y-auto"
                style={{ top: '100%', right: 0 }}
              >
                <div className="sticky top-0 bg-slate-50 px-2.5 py-1.5 text-[10px] text-slate-600 border-b border-slate-100 flex items-center justify-between">
                  <span className="flex items-center gap-1 font-medium">
                    <Search className="w-3 h-3 text-emerald-500" />
                    {toFaNum(filteredProducts.length)} نتیجه
                  </span>
                  <button
                    type="button"
                    onClick={() => posSearchSetQuery('')}
                    className="text-slate-400 hover:text-red-500 flex items-center gap-0.5"
                    title="بستن نتایج"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                {filteredProducts.map((product) => (
                  <ProductLookupItem
                    key={product.id}
                    product={product}
                    cartQuantity={cart.find((c) => c.productId === product.id)?.quantity || 0}
                    onAdd={(p) => {
                      handleAddToCart(p)
                    }}
                  />
                ))}
              </div>
            )}
            {posSearchQuery.trim().length >= 2 && filteredProducts.length === 0 && posSearchStatus !== 'searching' && (
              <div
                className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl p-4 text-center"
                style={{ top: '100%', right: 0 }}
              >
                <Package className="w-6 h-6 mx-auto text-slate-300 mb-1.5" />
                <p className="text-[12px] text-slate-600 font-medium">نتیجه‌ای یافت نشد</p>
                <p className="text-[10px] text-slate-400 mt-0.5">عبارت دیگری را امتحان کنید</p>
              </div>
            )}
          </div>

          {/* دکمه دوربین */}
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="shrink-0 p-2 sm:p-2.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors h-10 sm:h-11 order-2 sm:order-none"
            title="اسکن بارکد با دوربین"
          >
            <Camera className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>
        </div>

        {/* فیلتر دسته */}
        <div className="flex items-center gap-1.5 sm:gap-2 mt-2">
          <span className="text-[9px] text-slate-400 shrink-0 flex items-center gap-0.5">
            <Package className="w-2.5 h-2.5" />
            دسته:
          </span>
          <div className="flex gap-1 overflow-x-auto pb-px scrollbar-hide flex-1">
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
                className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap ${
                  selectedCategory === cat.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>


            {/* ★★★ نوار اطلاعات شعبه و انبار فعال ★★★ */}
      <div className="bg-gradient-to-l from-emerald-50 via-teal-50 to-cyan-50 border-b border-emerald-200 px-2 sm:px-3 py-1.5 sm:py-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* آیکون فروشگاه */}
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center shrink-0">
              <Store className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-emerald-900">
              {storeName || 'فروشگاه'}
            </span>
          </div>

          {/* جداکننده */}
          <div className="w-px h-4 bg-emerald-300" />

          {/* شعبه */}
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            <span className="text-[10px] sm:text-xs text-slate-600">شعبه:</span>
            {currentBranch ? (
              <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[9px] sm:text-[10px] px-1.5 h-5">
                {currentBranch.name}
              </Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-[9px] sm:text-[10px] px-1.5 h-5">
                مرکزی
              </Badge>
            )}
          </div>

          {/* جداکننده */}
          <div className="w-px h-4 bg-emerald-300" />

          {/* انبار */}
          <div className="flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="text-[10px] sm:text-xs text-slate-600">انبار:</span>
            {currentWarehouse ? (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[9px] sm:text-[10px] px-1.5 h-5">
                {currentWarehouse.name}
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[9px] sm:text-[10px] px-1.5 h-5">
                انتخاب نشده
              </Badge>
            )}
          </div>

          {/* وضعیت اتصال */}
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-[9px] text-slate-500">
              {isOnline ? 'آنلاین' : 'آفلاین'}
            </span>
          </div>
        </div>
      </div>

      {/* ==================== MAIN CONTENT ==================== */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ===== CART ===== */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* CART HEADER */}
          <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100 shrink-0 bg-gradient-to-l from-slate-50 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 sm:gap-2">
                <ShoppingCart className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-600" />
                <h2 className="font-bold text-[11px] sm:text-sm text-slate-800">سبد</h2>
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 text-[9px] px-1 py-0 h-4 sm:h-5 mr-1">
                  {toFaNum(cartItemCount)}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 sm:h-8 px-1.5 sm:px-2 text-[10px] sm:text-xs border-emerald-300 text-emerald-600 hover:bg-emerald-50"
                  onClick={() => searchInputRef.current?.focus()}
                  title="جستجو (F2)"
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

          {/* CART ITEMS */}
          <ScrollArea className="flex-1 min-h-0">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4 text-slate-300">
                <ShoppingCart className="w-12 sm:w-16 h-12 sm:h-16 mb-2 sm:mb-3" />
                <p className="text-[12px] sm:text-sm font-medium">سبد فاکتور خالی است</p>
                <p className="text-[10px] sm:text-xs mt-1 text-slate-400 text-center max-w-[280px] leading-relaxed">
                  برای افزودن محصول نام را تایپ کنید
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 border-emerald-300 text-emerald-600 text-[10px] h-8"
                  onClick={() => searchInputRef.current?.focus()}
                >
                  <Search className="w-3.5 h-3.5 ml-1" />
                  شروع جستجو
                </Button>
              </div>
            ) : (
              <div className="p-1 sm:p-1.5 space-y-px">
             {cart.map((item) => {
  const product = products.find((p) => p.id === item.productId)
  // ★ DECIMAL: واحد و نوع اعشاری بودن
  const unitLabel = product ? getUnitLabel(product) : (item.unitLabel || 'عدد')
  const isDecimal = product ? isDecimalUnitProduct(product) : isDecimalUnitLabel(item.unitLabel)
  return (
    <CompactCartItemRow
      key={item.productId}
      item={item}
      unitLabel={unitLabel}
      isDecimal={isDecimal}
      onIncrease={handleIncreaseQuantity}
      onDecrease={handleDecreaseQuantity}
      onRemove={removeFromCart}
      onQuantityChange={handleQuantityChange}
      onUnitPriceChange={handleUnitPriceChange}
      onDiscountChange={handleDiscountChange}
    />
  )
})}
              </div>
            )}
          </ScrollArea>

          {/* CART SUMMARY */}
          {cart.length > 0 && (
            <div className="border-t border-slate-200 shrink-0 bg-white">
              <div className="px-2 sm:px-3 py-1.5 sm:py-2 space-y-1 text-[10px] sm:text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">جمع کل</span>
                  <span className="font-bold text-slate-700">{formatPrice(cartTotals.subTotal)} <span className="text-[8px] text-slate-400">ریال</span></span>
                </div>
                {cartTotals.discountAmount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">تخفیف</span>
                    <span className="font-bold text-red-500">-{formatPrice(cartTotals.discountAmount)} <span className="text-[8px] text-slate-400">ریال</span></span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">تخفیف فاکتور</span>
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
                      className="w-12 h-7 sm:h-8 text-[10px] px-1 py-0 bg-slate-50 border-slate-200 focus:border-blue-400 text-center font-bold text-slate-600"
                    />
                    <span className="text-[9px] text-slate-400">٪</span>
                    {cartTotals.invoiceDiscountAmount > 0 && (
                      <span className="text-[9px] text-red-500 font-medium">
                        ({formatPrice(cartTotals.invoiceDiscountAmount)})
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">مالیات</span>
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
                        className="w-20 sm:w-24 h-7 sm:h-8 text-[10px] px-1 py-0 bg-slate-50 border-slate-200 focus:border-blue-400 text-center font-bold text-slate-600"
                      />
                    ) : (
                      <span className="text-[11px] sm:text-xs font-bold text-slate-500">
                        +{formatPrice(cartTotals.taxAmount)}
                      </span>
                    )}
                    <span className="text-[8px] sm:text-[9px] text-slate-400">ریال</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 sm:pt-1.5 border-t border-dashed border-slate-200">
                  <span className="font-bold text-slate-800 text-[11px] sm:text-xs">مبلغ نهایی</span>
                  <span className="font-black text-base sm:text-lg text-emerald-600">
                    {formatPrice(cartTotals.totalAmount)} <span className="text-[8px] sm:text-[9px] font-bold">ریال</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================== BOTTOM BAR ==================== */}
      <div className="bg-white border-t border-slate-200 shrink-0 shadow-[0_-2px_6px_rgba(0,0,0,0.05)]">
              {/* نوع پرداخت */}
        <div className="px-2 sm:px-3 pt-2 pb-1.5 sm:pt-2.5 sm:pb-2">
          {/* Label */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] sm:text-xs font-bold text-slate-700">نوع پرداخت <span className="text-red-500">*</span></span>
          </div>

          {/* Radio Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap flex-1">
            {paymentTypeConfig.map((pt) => {
              const Icon = pt.icon
              const isActive = paymentType === pt.value
              const isAllowed = planFeatures.posPaymentTypes.includes(pt.value.toLowerCase() as any)
              return (
                <label
                  key={pt.value}
                  onClick={() => isAllowed && setPaymentType(pt.value)}
                  className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-md border-2 transition-all select-none text-[10px] sm:text-xs font-medium ${
                    !isAllowed
                      ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed opacity-50'
                      : isActive
                        ? `${pt.activeBg} ${pt.activeBorder} ${pt.activeText} shadow-sm cursor-pointer`
                        : `${pt.inactiveBg} ${pt.inactiveBorder} ${pt.inactiveText} ${pt.hoverBg} cursor-pointer`
                  }`}
                  title={pt.label}
                >
                  {/* Radio Circle */}
                  {!isAllowed ? (
                    <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-amber-400" />
                  ) : (
                    <span
                      className={`shrink-0 w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isActive
                          ? `${pt.activeDot} border-current`
                          : 'border-slate-300'
                      }`}
                    >
                      {isActive && (
                        <span className="block w-2 h-2 rounded-full bg-current" />
                      )}
                    </span>
                  )}

                  {/* Icon */}
                  <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${!isAllowed ? 'text-gray-300' : ''}`} />

                  {/* Label Text */}
                  <span className={`font-bold whitespace-nowrap ${!isAllowed ? 'line-through' : ''}`}>
                    {pt.label}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {/* مشتری + جمع + دکمه‌ها */}
        <div className="px-2 sm:px-3 pb-1.5 sm:pb-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* مشتری */}
          <div className="relative flex-1 sm:max-w-[200px]">
            <User className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 z-10" />
            <Input
              placeholder={selectedCustomerId ? (selectedCustomerName || 'مشتری') : 'مشتری...'}
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="h-9 sm:h-8 text-sm sm:text-xs pr-7 border-slate-200 bg-slate-50/80 focus:bg-white"
            />
            {/* Customer dropdown */}
            {customerSearch.trim().length >= 2 && (
              <div
                className="absolute z-[100] w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                style={{ bottom: '100%', marginBottom: '4px' }}
              >
                {customerSearchLoading ? (
                  <div className="p-2 text-center text-[10px] text-gray-400">در حال جستجو...</div>
                ) : customerSearchResults.length === 0 ? (
                  <div className="p-3 text-center text-[10px] text-gray-400">
                    <Search className="w-3.5 h-3.5 mx-auto mb-1" />
                    نتیجه‌ای یافت نشد
                  </div>
                ) : (
                  <>
                    {selectedCustomerId && (
                     <button 
  onClick={() => { setCustomer(null, null); setCustomerSearch('') }} 
  className="w-full text-right p-2 hover:bg-gray-50 border-b"
>
  <span className="text-[10px] text-gray-400">حذف انتخاب</span>
</button>
                    )}
                    {customerSearchResults.filter((c: any) => !c.isBlacklisted).map((c: any) => {
                      const displayName = c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'بدون نام'
                      return (
                        <button key={c.id} onClick={() => { setCustomer(c.id, displayName); setCustomerSearch(''); setCustomerSearchResults([]) }} className="w-full text-right p-2 hover:bg-emerald-50 border-b text-[11px] last:border-0">
                          <div className="font-medium">{displayName}</div>
                          {c.currentBalance > 0 && <span className="text-[9px] text-red-400">بدهی</span>}
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )}
            {selectedCustomer && selectedCustomer.currentBalance > 0 && (
              <Badge variant="outline" className="text-[8px] sm:text-[9px] border-red-200 text-red-500 bg-red-50 px-1 py-0 shrink-0 h-5 absolute -top-2 -left-2">
                بدهی:{formatPrice(selectedCustomer.currentBalance)}
              </Badge>
            )}
          </div>

          {/* جداکننده */}
          <div className="hidden sm:block w-px h-6 bg-slate-200"></div>

          {/* جمع */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="font-black text-base sm:text-lg text-emerald-600">
              {formatPrice(cartTotals.totalAmount)}
            </span>
            <span className="text-[8px] sm:text-[9px] text-slate-400">ریال</span>
          </div>

          {/* جداکننده */}
          <div className="hidden sm:block w-px h-6 bg-slate-200"></div>

          {/* دکمه‌ها */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              onClick={handleConfirmInvoice}
              disabled={!paymentType || cart.length === 0 || submitting}
              className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white h-9 sm:h-8 px-3 sm:px-4 font-bold text-[11px] sm:text-xs shadow-sm disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-all"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 ml-1 hidden sm:block" />
                  تأیید
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                clearCart()
                posSearchSetQuery('')
                setSelectedCategory('all')
                setPaymentType(null as any)
                setTaxOverrideAmount(null)
                setInvoiceDiscountPercent('')
                toast({ title: 'لغو شد', description: 'سبد پاک شد' })
              }}
              disabled={cart.length === 0 || submitting}
              className="h-9 sm:h-8 w-9 sm:w-auto px-0 sm:px-3 border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 disabled:opacity-30 rounded-md text-[11px] sm:text-xs"
            >
              <XCircle className="w-3.5 h-3.5 sm:ml-1" />
              <span className="hidden sm:inline">لغو</span>
            </Button>

            <Button
              variant="outline"
              onClick={handlePrintInvoice}
              disabled={cart.length === 0}
              className="h-9 sm:h-8 w-9 sm:w-auto p-0 sm:px-2 border-slate-200 text-slate-400 disabled:opacity-30 rounded-md"
            >
              <Printer className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ==================== MODALS ==================== */}

      {/* Card Payment */}
      <Dialog open={cardPaymentDialogOpen} onOpenChange={(open) => {
        if (!open) handleCancelCardPayment()
      }}>
        <DialogContent className="sm:max-w-[480px] w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
              <CreditCard className="w-4 h-4 text-blue-600" />
              پرداخت کارتی
            </DialogTitle>
            <DialogDescription className="text-xs">
              {activePosDevice ? `نوع: ${activePosDevice.terminalType}` : 'در حال بارگذاری...'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <div className={`p-3 sm:p-4 rounded-lg border-2 text-center text-[12px] sm:text-sm ${
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
              <p className={`font-medium ${
                cardPaymentStatus === 'success' ? 'text-emerald-700' :
                cardPaymentStatus === 'failed' || cardPaymentStatus === 'cancelled' || cardPaymentStatus === 'timeout' ? 'text-red-600' :
                'text-gray-700'
              }`}>
                {cardPaymentMessage}
              </p>
            </div>

            {activePosDevice?.terminalType === 'manual' && cardPaymentStatus === 'waiting_card' && (
              <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <Label className="text-[10px] sm:text-xs text-slate-600 font-medium">روی رسید کدام کد نوشته شده؟</Label>
                <Select
                  value={manualReferenceType}
                  onValueChange={(v) => setManualReferenceType(v as ReferenceCodeType)}
                >
                  <SelectTrigger className="h-8 sm:h-9 text-[10px] sm:text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERENCE_CODE_TYPES.map((rt) => (
                      <SelectItem key={rt.value} value={rt.value} className="text-xs">{rt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={manualReferenceNumber}
                  onChange={(e) => setManualReferenceNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="کد"
                  dir="ltr"
                  className="h-8 sm:h-9 text-xs"
                  maxLength={15}
                  autoFocus
                />

                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={manualCardLast4}
                    onChange={(e) => setManualCardLast4(e.target.value.replace(/\D/g, '').slice(-4))}
                    placeholder="****"
                    dir="ltr"
                    className="h-8 sm:h-9 text-xs"
                    maxLength={4}
                  />
                  <Input
                    value={manualCardType}
                    onChange={(e) => setManualCardType(e.target.value)}
                    placeholder="بانک"
                    className="h-8 sm:h-9 text-xs"
                  />
                </div>

                <Button
                  onClick={handleSubmitManualCardPayment}
                  disabled={manualReferenceNumber.length < 4}
                  className="w-full h-8 sm:h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
                  ثبت
                </Button>
              </div>
            )}

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

          {cardPaymentStatus === 'waiting_card' && (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCancelCardPayment}
                className="h-8 text-xs text-red-500 border-red-200 hover:bg-red-50"
              >
                <XCircle className="w-3.5 h-3.5 ml-1" />
                لغو
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* تأیید فاکتور */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-[400px] w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 text-sm sm:text-base">
              <CheckCircle2 className="w-4 h-4" />
              تأیید فاکتور
            </DialogTitle>
            <DialogDescription className="text-xs">
              آیا از ثبت فاکتور اطمینان دارید؟
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3 text-[11px] sm:text-xs">
            {selectedCustomerName && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">مشتری:</span>
                <span className="font-medium">{selectedCustomerName}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">اقلام:</span>
              <span className="font-medium">{toFaNum(cart.length)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">نوع پرداخت:</span>
              <span className="font-medium">{getPaymentTypeLabel(paymentType || '')}</span>
            </div>
            {(cartTotals.discountAmount > 0 || cartTotals.invoiceDiscountAmount > 0) && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">تخفیف:</span>
                <span className="font-medium text-red-500">-{formatPrice(cartTotals.discountAmount + (cartTotals.invoiceDiscountAmount || 0))}</span>
              </div>
            )}
            <Separator />
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">مبلغ کل:</span>
              <span className="font-black text-base sm:text-lg text-emerald-600">
                {formatPrice(cartTotals.totalAmount)}
              </span>
            </div>
            {paymentType === 'Credit' && (
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-2 mt-2">
                <div className="flex justify-between text-[10px] text-orange-700">
                  <span>پرداختی:</span>
                  <span className="font-bold">۰</span>
                </div>
                <div className="flex justify-between text-[10px] text-orange-700 mt-0.5">
                  <span>بدهی:</span>
                  <span className="font-bold">{formatPrice(cartTotals.totalAmount)}</span>
                </div>
              </div>
            )}
            {paymentType === 'Installment' && installmentCalc && (
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-2 mt-2 space-y-1 text-[10px] text-purple-700">
                <div className="flex justify-between">
                  <span>پیش‌پرداخت:</span>
                  <span className="font-bold">{formatPrice(installmentDownPayment)}</span>
                </div>
                <div className="flex justify-between">
                  <span>اقساط:</span>
                  <span className="font-bold">{toFaNum(installmentCount)} قسط</span>
                </div>
                <div className="flex justify-between">
                  <span>مبلغ هر قسط:</span>
                  <span className="font-bold">{formatPrice(installmentCalc.installmentAmount)}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)} className="border-slate-300 text-xs sm:text-sm h-8 sm:h-9">
              انصراف
            </Button>
            <Button onClick={handleConfirmInvoiceFinal} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm h-8 sm:h-9">
              <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
              تأیید
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* قسطی */}
      <Dialog open={installmentDialogOpen} onOpenChange={setInstallmentDialogOpen}>
        <DialogContent className="sm:max-w-[500px] w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700 text-sm sm:text-base">
              <CalendarClock className="w-4 h-4" />
              قسطی
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5 py-3 text-[11px] sm:text-xs">
            <div className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-600">مبلغ کل:</span>
              <span className="font-black text-sm text-slate-900">
                {formatPrice(cartTotals.totalAmount)}
              </span>
            </div>

            <div className="space-y-1">
              <Label className="text-slate-600">پیش‌پرداخت (ریال)</Label>
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
                className="h-8 sm:h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-slate-600">تعداد اقساط</Label>
              <Select
                value={String(installmentCount)}
                onValueChange={(v) => setInstallmentCount(parseInt(v))}
              >
                <SelectTrigger className="h-8 sm:h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5, 6, 12].map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">
                      {toFaNum(n)} قسط
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-slate-600">درصد سود</Label>
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
                  className="h-8 sm:h-9 text-xs pl-7"
                />
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">%</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-slate-600">دوره</Label>
              <Select
                value={installmentPeriod}
                onValueChange={(v) => setInstallmentPeriod(v as 'monthly' | 'biweekly' | 'weekly')}
              >
                <SelectTrigger className="h-8 sm:h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly" className="text-xs">ماهانه</SelectItem>
                  <SelectItem value="biweekly" className="text-xs">دو هفته‌ای</SelectItem>
                  <SelectItem value="weekly" className="text-xs">هفتگی</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {installmentCalc && (
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-2 space-y-1 text-[10px] text-purple-700">
                <div className="flex justify-between">
                  <span>باقیمانده:</span>
                  <span className="font-bold">{formatPrice(installmentCalc.remainingAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>مبلغ قسط:</span>
                  <span className="font-bold">{formatPrice(installmentCalc.installmentAmount)}</span>
                </div>
                {installmentInterestRate > 0 && (
                  <div className="flex justify-between">
                    <span>جمع با سود:</span>
                    <span className="font-bold">{formatPrice(installmentCalc.totalWithInterest)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setInstallmentDialogOpen(false)} className="border-slate-300 text-xs sm:text-sm h-8 sm:h-9">
              انصراف
            </Button>
            <Button onClick={handleInstallmentConfirm} className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs sm:text-sm h-8 sm:h-9">
              <CalendarClock className="w-3.5 h-3.5 ml-1" />
              تأیید
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نسیه */}
      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent className="sm:max-w-[480px] w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600 text-sm sm:text-base">
              <Clock className="w-4 h-4" />
              نسیه
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5 py-3 text-[11px] sm:text-xs">
            <div className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-600">مبلغ کل:</span>
              <span className="font-black text-sm text-slate-900">
                {formatPrice(cartTotals.totalAmount)}
              </span>
            </div>

            <div className="rounded-lg bg-orange-50 border border-orange-200 p-2">
              <div className="flex justify-between text-[10px] text-orange-700">
                <span>پرداختی:</span>
                <span className="font-bold">۰</span>
              </div>
              <div className="flex justify-between text-[10px] text-orange-700 mt-0.5">
                <span>بدهی:</span>
                <span className="font-bold">{formatPrice(cartTotals.totalAmount)}</span>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-slate-600">تاریخ سررسید (شمسی)</Label>
              <ShamsiDatePicker value={creditDueDate} onChange={setCreditDueDate} />
            </div>

            <div className="space-y-1">
              <Label className="text-slate-600">توضیحات</Label>
              <Input type="text" value={creditDescription} onChange={(e) => setCreditDescription(e.target.value)} placeholder="اختیاری..." className="h-8 sm:h-9 text-xs" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreditDialogOpen(false)} className="border-slate-300 text-xs sm:text-sm h-8 sm:h-9">
              انصراف
            </Button>
            <Button onClick={handleCreditConfirm} className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs sm:text-sm h-8 sm:h-9">
              <Clock className="w-3.5 h-3.5 ml-1" />
              تأیید
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* اسکن دوربین */}
      <BarcodeScannerModal
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleBarcodeDetected}
      />

      {/* چاپ */}
      <Dialog open={thermalPrintOpen} onOpenChange={(open) => {
        setThermalPrintOpen(open)
        if (!open) {
          pendingAutoPrintDataRef.current = null
          setAutoPrintMode(false)
        }
      }}>
        <DialogContent className="sm:max-w-[560px] w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center justify-between gap-2 text-sm sm:text-base">
              <span className="flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-emerald-600" />
                چاپ
              </span>
              <button
                type="button"
                onClick={() => setThermalPrintOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { value: 'thermal-58mm', label: '۵۸mm', desc: 'مینی' },
                { value: 'thermal-80mm', label: '۸۰mm', desc: 'استاندارد' },
                { value: 'a4', label: 'A4', desc: 'کامل' },
              ] as const).map((opt) => {
                const isActive = selectedPrintTemplate === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedPrintTemplate(opt.value)}
                    className={`p-2 rounded-lg border-2 transition-all text-center text-[10px] sm:text-xs ${isActive ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <Receipt className={`w-4 h-4 mx-auto mb-1 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <div className={`font-bold ${isActive ? 'text-emerald-700' : 'text-slate-600'}`}>{opt.label}</div>
                    <div className="text-slate-400 mt-0.5">{opt.desc}</div>
                    {isActive && <CheckCircle2 className="w-3 h-3 mx-auto mt-0.5 text-emerald-600" />}
                  </button>
                )
              })}
            </div>

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

// ══════════════════════════════════════════════════════════════════════════════
// ★★★ تاریخ شمسی
// ══════════════════════════════════════════════════════════════════════════════

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

interface ShamsiDatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function ShamsiDatePicker({ value, onChange, placeholder = 'انتخاب تاریخ' }: ShamsiDatePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const displayText = useMemo(() => {
    if (!value) return ''
    const d = new Date(value)
    if (isNaN(d.getTime())) return ''
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return `${toFaNum(jy)}/${toFaNum(jm).padStart(2, '۰')}/${toFaNum(jd).padStart(2, '۰')}`
  }, [value])

  const todayJalali = useMemo(() => {
    const now = new Date()
    const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
    return { jy, jm, jd, iso: now.toISOString().split('T')[0] }
  }, [])

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

  const firstDayOffset = useMemo(() => {
    const [gy, gm, gd] = jalaliToGregorian(viewYear, viewMonth, 1)
    const jsDay = new Date(gy, gm - 1, gd).getDay()
    return (jsDay + 1) % 7
  }, [viewYear, viewMonth])

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOffset; i++) cells.push(null)
  for (let d = 1; d <= daysCount; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

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
          height: 32,
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
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = LILAC.accent }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = LILAC.border }}
      >
        <Calendar style={{ width: 14, height: 14, color: LILAC.textMuted, flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'right', fontFamily: 'monospace', color: displayText ? LILAC.textPrimary : LILAC.textMuted }} dir="ltr">
          {displayText || placeholder}
        </span>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
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
              boxShadow: '0 -8px 24px -4px rgba(124, 58, 237, 0.18)',
              padding: 7,
            }}
          >
            <div style={{
              background: `linear-gradient(135deg, ${LILAC.headerBg} 0%, ${LILAC.accentSoft} 100%)`,
              margin: -7,
              marginBottom: 5,
              padding: '5px 7px',
              borderRadius: '8px 8px 0 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 4,
            }}>
              <button
                type="button"
                onClick={goPrevMonth}
                style={{
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: 'none',
                  background: 'transparent',
                  color: LILAC.textSecondary,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                ‹
              </button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, color: LILAC.textPrimary }}>
                {JALALI_MONTHS[viewMonth - 1]} {toFaNum(viewYear)}
              </div>
              <button
                type="button"
                onClick={goNextMonth}
                style={{
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: 'none',
                  background: 'transparent',
                  color: LILAC.textSecondary,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                ›
              </button>
            </div>

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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={i} style={{ height: 20 }} />
                const isSelected = selectedJalali &&
                  selectedJalali.jy === viewYear &&
                  selectedJalali.jm === viewMonth &&
                  selectedJalali.jd === d
                const isToday = todayJalali.jy === viewYear && todayJalali.jm === viewMonth && todayJalali.jd === d
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
                      backgroundColor: isSelected ? LILAC.accent : (isToday ? LILAC.accentLight : 'transparent'),
                      color: isSelected ? LILAC.textOnAccent : (isToday ? LILAC.todayText : LILAC.textPrimary),
                      cursor: 'pointer',
                      fontWeight: isSelected ? 700 : (isToday ? 600 : 400),
                      padding: 0,
                      lineHeight: '1',
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
                onClick={() => {
                  onChange(todayJalali.iso)
                  setOpen(false)
                }}
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
                امروز: {toFaNum(todayJalali.jd)}
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

// ══════════════════════════════════════════════════════════════════════════════
// ★ Compact Cart Item Row
// ══════════════════════════════════════════════════════════════════════════════

interface CompactCartItemRowProps {
  item: CartItem
  unitLabel: string
  isDecimal: boolean
  onIncrease: (productId: string) => void
  onDecrease: (productId: string) => void
  onRemove: (productId: string) => void
  onQuantityChange: (productId: string, newQuantity: number) => void
  onUnitPriceChange: (productId: string, newPrice: number) => void
  onDiscountChange: (productId: string, newDiscount: number) => void
}
function CompactCartItemRow({
  item,
  unitLabel,
  isDecimal,
  onIncrease,
  onDecrease,
  onRemove,
  onQuantityChange,
  onUnitPriceChange,
  onDiscountChange,
}: CompactCartItemRowProps) {
  const [localPrice, setLocalPrice] = useState(toFaNum(item.unitPrice))
  const [localDiscount, setLocalDiscount] = useState(toFaNum(item.discount))
  // ★ DECIMAL: state محلی برای ویرایش تعداد
  const [localQty, setLocalQty] = useState(toFaNum(item.quantity))
  const priceInputRef = useRef<HTMLInputElement>(null)
  const discountInputRef = useRef<HTMLInputElement>(null)
  const qtyInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setLocalPrice(toFaNum(item.unitPrice)) }, [item.unitPrice])
  useEffect(() => { setLocalDiscount(toFaNum(item.discount)) }, [item.discount])
  // ★ DECIMAL: همگام‌سازی تعداد نمایشی با مقدار واقعی (پس از اعمال محدودیت موجودی)
  useEffect(() => { setLocalQty(toFaNum(item.quantity)) }, [item.quantity])
  const handlePriceBlur = useCallback(() => {
    const enVal = toEnNum(localPrice)
    const newPrice = parseFloat(enVal)
    if (!isNaN(newPrice) && newPrice >= 0 && newPrice !== item.unitPrice) {
      onUnitPriceChange(item.productId, newPrice)
    } else {
      setLocalPrice(toFaNum(item.unitPrice))
    }
  }, [localPrice, item.unitPrice, item.productId, onUnitPriceChange])
  const handleDiscountBlur = useCallback(() => {
    const enVal = toEnNum(localDiscount)
    const newDiscount = parseFloat(enVal)
    if (!isNaN(newDiscount) && newDiscount >= 0 && newDiscount <= 100 && newDiscount !== item.discount) {
      onDiscountChange(item.productId, newDiscount)
    } else {
      setLocalDiscount(toFaNum(item.discount))
    }
  }, [localDiscount, item.discount, item.productId, onDiscountChange])
  // ★ DECIMAL: ثبت تعداد ویرایش‌شده هنگام خروج از فیلد
  const handleQtyBlur = useCallback(() => {
    const newQty = parseQuantityInput(localQty)
    if (!isNaN(newQty) && newQty > 0 && newQty !== item.quantity) {
      onQuantityChange(item.productId, newQty)
    } else {
      setLocalQty(toFaNum(item.quantity))
    }
  }, [localQty, item.quantity, item.productId, onQuantityChange])
  return (
    <div className="flex flex-wrap items-center gap-1 px-1.5 sm:px-2 py-1.5 sm:py-2 rounded-md bg-slate-50/80 hover:bg-slate-100/60 border border-slate-100 group transition-colors text-[10px] sm:text-xs">
      {/* حذف */}
      <button
        type="button"
        className="shrink-0 w-8 h-8 sm:w-5 sm:h-5 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors"
        onClick={() => onRemove(item.productId)}
        title="حذف"
      >
        <X className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
      </button>
      {/* نام */}
      <div className="flex-1 min-w-[90px] sm:min-w-0">
        <div className="truncate font-semibold text-slate-800">
          {item.productName}
        </div>
      </div>
      {/* ★ DECIMAL: تعداد قابل ویرایش + واحد */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          className="w-8 h-8 sm:w-5 sm:h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => onDecrease(item.productId)}
          disabled={item.quantity <= getMinQuantity(isDecimal)}
        >
          <Minus className="w-3 h-3" />
        </button>
        <Input
          ref={qtyInputRef}
          type="text"
          inputMode="decimal"
          value={localQty}
          onChange={(e) => setLocalQty(toFaNum(toEnNum(e.target.value)))}
          onBlur={handleQtyBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="shrink-0 w-12 sm:w-11 h-8 sm:h-5 text-[10px] sm:text-[9px] px-1 py-0 bg-white border-slate-200 focus:border-emerald-400 text-center font-bold"
          title={isDecimal ? 'مقدار اعشاری مجاز است (مثلاً 0.5)' : 'فقط عدد صحیح'}
        />
        <span
          className="shrink-0 w-6 text-center text-[8px] sm:text-[9px] text-slate-400 font-medium"
          title={unitLabel}
        >
          {unitLabel}
        </span>
        <button
          type="button"
          className="w-8 h-8 sm:w-5 sm:h-5 flex items-center justify-center rounded text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
          onClick={() => onIncrease(item.productId)}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
      {/* قیمت */}
      <Input
        ref={priceInputRef}
        type="text"
        inputMode="numeric"
        value={localPrice}
        onChange={(e) => setLocalPrice(toFaNum(toEnNum(e.target.value)))}
        onBlur={handlePriceBlur}
        className="shrink-0 w-14 sm:w-12 h-8 sm:h-5 text-[10px] sm:text-[9px] px-1 py-0 bg-white border-slate-200 focus:border-emerald-400 text-center"
      />
      {/* تخفیف % */}
      <div className="relative shrink-0">
        <Input
          ref={discountInputRef}
          type="text"
          inputMode="numeric"
          value={localDiscount}
          onChange={(e) => setLocalDiscount(toFaNum(toEnNum(e.target.value)))}
          onBlur={handleDiscountBlur}
          className="w-10 sm:w-9 h-8 sm:h-5 text-[10px] sm:text-[9px] px-1 py-0 bg-white border-slate-200 focus:border-orange-400 text-center pr-3"
        />
        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[7px] text-slate-300">%</span>
      </div>
      {/* جمع */}
      <span className="shrink-0 text-[10px] sm:text-[9px] font-bold text-slate-800 min-w-[50px] sm:min-w-[45px] text-left">
        {formatPrice(item.lineTotal)}
      </span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ★ Product Lookup Item
// ══════════════════════════════════════════════════════════════════════════════

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
      className={`w-full flex items-center justify-between gap-2 px-2 sm:px-2.5 py-2.5 text-right transition-colors border-b border-slate-50 last:border-0 text-[11px] sm:text-xs ${
        isOutOfStock
          ? 'opacity-40 cursor-not-allowed'
          : cartQuantity > 0
            ? 'bg-emerald-50/70 hover:bg-emerald-50'
            : 'hover:bg-slate-50'
      }`}
    >
      {/* نام + موجودی */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {cartQuantity > 0 && (
          <span className="bg-emerald-600 text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
            {cartQuantity}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <span className="text-[12px] sm:text-xs font-semibold text-slate-800 truncate block">
            {product.name}
          </span>
          <span className="text-[9px] text-slate-400 block mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full inline-block mr-1 ${dotColor}`}></span>
            {toFaNum(formatPrice(product.currentStock))} {unitLabel}
          </span>
        </div>
      </div>

      {/* قیمت + دکمه */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="font-bold text-emerald-600 text-[13px] whitespace-nowrap">
          {formatPrice(product.salePrice)}
        </span>
        {isOutOfStock ? (
          <AlertTriangle className="w-4 h-4 text-red-300" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center transition-colors shadow-sm">
            <Plus className="w-4 h-4 text-white font-bold" strokeWidth={3} />
          </div>
        )}
      </div>
    </button>
  )
}