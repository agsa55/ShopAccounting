'use client'

// ============================================================================
// src/components/pos/thermal-receipt-print.tsx — ESC/POS-Style Print (v3.36.7 ★★★)
// ----------------------------------------------------------------------------
// ★★★ v3.36.7 تغییرات:
//   ★ رفع مشکل چاپ مستقیم بدون مودال (useMemo → useEffect)
//   ★ رفع مشکل سایز کاغذ در چاپ ۵/۸ سانتی (استفاده از window.print داخل iframe)
//   ★ فاکتور A4 وسط صفحه (margin: auto + text-align: center)
//   ★ سایز صحیح iframe برای پیش‌نمایش هر قالب
// ============================================================================

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Receipt, FileText, Printer, CheckCircle2, Loader2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

export type ReceiptTemplate = 'thermal-58mm' | 'thermal-80mm' | 'a4'

export interface ReceiptItem {
  productName: string
  quantity: number
  unitPrice: number
  discount?: number
  tax?: number
  lineTotal: number
  unitLabel?: string
}

export interface ReceiptData {
  invoiceNumber: string
  invoiceDate: string
  customerName: string
  cashierName?: string
  items: ReceiptItem[]
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

interface ThermalReceiptPrintProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: ReceiptData
  defaultTemplate?: ReceiptTemplate
}

const DEFAULT_SETTINGS = {
  headerText: 'فاکتور فروش',
  footerText: 'با تشکر از خرید شما',
  primaryColor: '#059669',
}

function toFa(n: number): string {
  return n.toLocaleString('fa-IR')
}

function dashedLine(width: number): string {
  return '─'.repeat(Math.floor(width / 8))
}

// ═══════════════════════════════════════════════════════════════
//  تولید HTML رسید حرارتی 58mm
// ═══════════════════════════════════════════════════════════════

function generateThermal58(data: ReceiptData): string {
  const currency = data.currency || 'ریال'
  const sep = dashedLine(54)

  const itemsHtml = data.items
    .map((item) => {
      const qty = toFa(item.quantity)
      const price = toFa(item.unitPrice)
      const total = toFa(item.lineTotal)
      return `
<div class="item">
  <div class="item-name">${escapeHtml(item.productName)}</div>
  <div class="item-meta">
    <span>${qty} × ${price}</span>
    <span class="item-total">${total}</span>
  </div>
  ${item.discount && item.discount > 0 ? `<div class="item-disc">تخفیف: ${toFa(item.discount)}</div>` : ''}
</div>
`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>رسید ${data.invoiceNumber}</title>
<style>
  @page { size: 58mm auto; margin: 1mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Tahoma', 'Vazirmatn', sans-serif;
    font-size: 9px;
    width: 54mm;
    margin: 0 auto;
    color: #000;
    line-height: 1.35;
    padding: 1mm;
  }
  .header { text-align: center; margin-bottom: 2mm; }
  .header img { max-height: 28px; max-width: 50px; margin-bottom: 1mm; }
  .header h1 { font-size: 11px; font-weight: bold; }
  .header .store { font-size: 9px; margin-top: 0.5mm; }
  .header .meta { font-size: 8px; color: #333; margin-top: 0.5mm; }
  .sep { text-align: center; font-size: 8px; margin: 1.5mm 0; letter-spacing: -1px; }
  .info { font-size: 9px; margin: 1mm 0; }
  .info .row { display: block; margin: 0.3mm 0; }
  .info .label { display: inline-block; min-width: 16mm; }
  .info .val { font-weight: bold; }
  .item { padding: 0.8mm 0; border-bottom: 1px dotted #ccc; }
  .item-name { font-size: 9px; font-weight: bold; margin-bottom: 0.3mm; }
  .item-meta { display: table; width: 100%; font-size: 8.5px; }
  .item-meta span { display: table-cell; }
  .item-meta span:last-child { text-align: left; font-family: 'Consolas', monospace; }
  .item-disc { font-size: 8px; color: #666; margin-top: 0.2mm; }
  .totals { margin-top: 1.5mm; font-size: 9px; }
  .totals .row { display: table; width: 100%; margin: 0.4mm 0; }
  .totals .row > span { display: table-cell; }
  .totals .row > span:last-child { text-align: left; font-family: 'Consolas', monospace; font-weight: bold; }
  .grand { border-top: 1px solid #000; padding-top: 1mm; margin-top: 1mm; font-size: 11px; font-weight: bold; }
  .grand > span:last-child { font-size: 12px; }
  .payment-info { background: #f5f5f5; padding: 1mm; margin: 1.5mm 0; border-radius: 1mm; font-size: 8.5px; }
  .payment-info .row { display: flex; justify-content: space-between; margin: 0.3mm 0; }
  .footer { text-align: center; font-size: 8px; color: #444; margin-top: 2mm; padding-top: 1mm; border-top: 1px solid #999; }
  .footer .thanks { font-weight: bold; margin-bottom: 0.5mm; }
  .footer .bank { font-size: 7.5px; color: #666; }
  @media print {
    body { width: 54mm; }
    .no-print { display: none; }
  }
  @media screen {
    body { background: #f5f5f5; padding: 10px; }
  }
</style>
</head>
<body>
  <div class="header">
    ${data.logoData ? `<img src="${data.logoData}" alt="logo" />` : ''}
    <h1>${escapeHtml(data.headerText || DEFAULT_SETTINGS.headerText)}</h1>
    <div class="store">${escapeHtml(data.storeName)}</div>
    ${data.storeAddress ? `<div class="meta">${escapeHtml(data.storeAddress)}</div>` : ''}
    ${data.storePhone ? `<div class="meta">تلفن: ${escapeHtml(data.storePhone)}</div>` : ''}
  </div>

  <div class="sep">${sep}</div>

  <div class="info">
    <div class="row"><span class="label">شماره:</span><span class="val">${escapeHtml(data.invoiceNumber)}</span></div>
    <div class="row"><span class="label">تاریخ:</span><span class="val">${escapeHtml(data.invoiceDate)}</span></div>
    <div class="row"><span class="label">مشتری:</span><span class="val">${escapeHtml(data.customerName || 'فروش عمومی')}</span></div>
    ${data.cashierName ? `<div class="row"><span class="label">صندوق‌دار:</span><span class="val">${escapeHtml(data.cashierName)}</span></div>` : ''}
  </div>

  <div class="sep">${sep}</div>

  <div class="items">
    ${itemsHtml}
  </div>

  <div class="sep">${sep}</div>

  <div class="totals">
    <div class="row"><span>جمع کل:</span><span>${toFa(data.subTotal)} ${currency}</span></div>
    ${data.discountAmount > 0 ? `<div class="row"><span>تخفیف آیتم:</span><span>- ${toFa(data.discountAmount)}</span></div>` : ''}
    ${data.invoiceDiscountAmount && data.invoiceDiscountAmount > 0 ? `<div class="row"><span>تخفیف فاکتور:</span><span>- ${toFa(data.invoiceDiscountAmount)}</span></div>` : ''}
    ${data.taxAmount > 0 ? `<div class="row"><span>مالیات:</span><span>+ ${toFa(data.taxAmount)}</span></div>` : ''}
    <div class="row grand"><span>قابل پرداخت:</span><span>${toFa(data.totalAmount)} ${currency}</span></div>
  </div>

  <div class="payment-info">
    <div class="row"><span>روش پرداخت:</span><span>${escapeHtml(data.paymentTypeLabel)}</span></div>
    ${data.paidAmount > 0 ? `<div class="row"><span>پرداخت شده:</span><span>${toFa(data.paidAmount)} ${currency}</span></div>` : ''}
    ${data.remainingAmount > 0 ? `<div class="row"><span>باقیمانده:</span><span>${toFa(data.remainingAmount)} ${currency}</span></div>` : ''}
  </div>

  <div class="footer">
    <div class="thanks">${escapeHtml(data.footerText || DEFAULT_SETTINGS.footerText)}</div>
    ${data.bankAccounts ? `<div class="bank">${escapeHtml(data.bankAccounts)}</div>` : ''}
    <div style="margin-top:1mm; font-size:7px; color:#999;">ShopAccounting • ${new Date().toLocaleDateString('fa-IR')}</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 300);
    };
  </script>
</body>
</html>`
}

// ═══════════════════════════════════════════════════════════════
//  تولید HTML رسید حرارتی 80mm
// ═══════════════════════════════════════════════════════════════

function generateThermal80(data: ReceiptData): string {
  const currency = data.currency || 'ریال'
  const sep = dashedLine(74)

  const itemsHtml = data.items
    .map((item) => {
      const qty = toFa(item.quantity)
      const price = toFa(item.unitPrice)
      const total = toFa(item.lineTotal)
      return `
<tr>
  <td class="name">${escapeHtml(item.productName)}</td>
  <td class="qty">${qty}</td>
  <td class="price">${price}</td>
  <td class="total">${total}</td>
</tr>
${item.discount && item.discount > 0 ? `<tr><td colspan="4" class="disc">تخفیف: ${toFa(item.discount)} ${currency}</td></tr>` : ''}
`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>رسید ${data.invoiceNumber}</title>
<style>
  @page { size: 80mm auto; margin: 2mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Tahoma', 'Vazirmatn', sans-serif;
    font-size: 10px;
    width: 76mm;
    margin: 0 auto;
    color: #000;
    line-height: 1.4;
    padding: 1mm;
  }
  .header { text-align: center; margin-bottom: 2mm; border-bottom: 2px solid #000; padding-bottom: 1.5mm; }
  .header img { max-height: 35px; max-width: 70px; margin-bottom: 1mm; }
  .header h1 { font-size: 13px; font-weight: bold; }
  .header .store { font-size: 11px; margin-top: 0.5mm; font-weight: bold; }
  .header .meta { font-size: 9px; color: #444; margin-top: 0.3mm; }
  .sep { text-align: center; font-size: 9px; margin: 1.5mm 0; letter-spacing: -1px; }
  .info { font-size: 10px; margin: 1.5mm 0; }
  .info .row { display: table; width: 100%; margin: 0.5mm 0; }
  .info .row > span { display: table-cell; }
  .info .label { color: #555; }
  .info .val { text-align: left; font-weight: bold; font-family: 'Consolas', monospace; }
  table.items { width: 100%; border-collapse: collapse; margin: 1mm 0; }
  table.items th { font-size: 9px; text-align: right; padding: 1mm; border-bottom: 1px solid #000; background: #f0f0f0; }
  table.items td { font-size: 9.5px; padding: 0.8mm 1mm; border-bottom: 1px dotted #ccc; vertical-align: top; }
  table.items td.name { width: 50%; }
  table.items td.qty { width: 12%; text-align: center; }
  table.items td.price { width: 18%; text-align: left; font-family: 'Consolas', monospace; }
  table.items td.total { width: 20%; text-align: left; font-family: 'Consolas', monospace; font-weight: bold; }
  table.items td.disc { font-size: 8.5px; color: #888; padding-top: 0; padding-bottom: 1mm; }
  .totals { margin-top: 2mm; font-size: 10px; }
  .totals .row { display: table; width: 100%; margin: 0.5mm 0; }
  .totals .row > span { display: table-cell; }
  .totals .row > span:last-child { text-align: left; font-family: 'Consolas', monospace; font-weight: bold; }
  .grand { border-top: 2px solid #000; padding-top: 1.5mm; margin-top: 1mm; font-size: 12px; font-weight: bold; }
  .grand > span:last-child { font-size: 13px; }
  .payment-info { background: #f7f7f7; padding: 1.5mm; margin: 1.5mm 0; border: 1px dashed #999; font-size: 9.5px; }
  .payment-info .row { display: table; width: 100%; margin: 0.4mm 0; }
  .payment-info .row > span { display: table-cell; }
  .payment-info .row > span:last-child { text-align: left; font-weight: bold; }
  .footer { text-align: center; font-size: 9px; color: #555; margin-top: 2mm; padding-top: 1.5mm; border-top: 1px solid #999; }
  .footer .thanks { font-weight: bold; font-size: 10px; margin-bottom: 0.5mm; }
  .footer .bank { font-size: 8.5px; color: #666; }
  @media print {
    body { width: 76mm; }
    .no-print { display: none; }
  }
  @media screen {
    body { background: #f5f5f5; padding: 10px; }
  }
</style>
</head>
<body>
  <div class="header">
    ${data.logoData ? `<img src="${data.logoData}" alt="logo" />` : ''}
    <h1>${escapeHtml(data.headerText || DEFAULT_SETTINGS.headerText)}</h1>
    <div class="store">${escapeHtml(data.storeName)}</div>
    ${data.storeAddress ? `<div class="meta">${escapeHtml(data.storeAddress)}</div>` : ''}
    ${data.storePhone ? `<div class="meta">تلفن: ${escapeHtml(data.storePhone)}</div>` : ''}
  </div>

  <div class="info">
    <div class="row"><span class="label">شماره فاکتور:</span><span class="val">${escapeHtml(data.invoiceNumber)}</span></div>
    <div class="row"><span class="label">تاریخ:</span><span class="val">${escapeHtml(data.invoiceDate)}</span></div>
    <div class="row"><span class="label">مشتری:</span><span class="val">${escapeHtml(data.customerName || 'فروش عمومی')}</span></div>
    ${data.cashierName ? `<div class="row"><span class="label">صندوق‌دار:</span><span class="val">${escapeHtml(data.cashierName)}</span></div>` : ''}
  </div>

  <div class="sep">${sep}</div>

  <table class="items">
    <thead>
      <tr>
        <th>کالا</th>
        <th>تعداد</th>
        <th>قیمت</th>
        <th>جمع</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="sep">${sep}</div>

  <div class="totals">
    <div class="row"><span>جمع کل:</span><span>${toFa(data.subTotal)} ${currency}</span></div>
    ${data.discountAmount > 0 ? `<div class="row"><span>تخفیف آیتم‌ها:</span><span>- ${toFa(data.discountAmount)}</span></div>` : ''}
    ${data.invoiceDiscountAmount && data.invoiceDiscountAmount > 0 ? `<div class="row"><span>تخفیف فاکتور:</span><span>- ${toFa(data.invoiceDiscountAmount)}</span></div>` : ''}
    ${data.taxAmount > 0 ? `<div class="row"><span>مالیات:</span><span>+ ${toFa(data.taxAmount)}</span></div>` : ''}
    <div class="row grand"><span>قابل پرداخت:</span><span>${toFa(data.totalAmount)} ${currency}</span></div>
  </div>

  <div class="payment-info">
    <div class="row"><span>روش پرداخت:</span><span>${escapeHtml(data.paymentTypeLabel)}</span></div>
    ${data.paidAmount > 0 ? `<div class="row"><span>پرداخت شده:</span><span>${toFa(data.paidAmount)} ${currency}</span></div>` : ''}
    ${data.remainingAmount > 0 ? `<div class="row"><span>باقیمانده:</span><span>${toFa(data.remainingAmount)} ${currency}</span></div>` : ''}
  </div>

  <div class="footer">
    <div class="thanks">${escapeHtml(data.footerText || DEFAULT_SETTINGS.footerText)}</div>
    ${data.bankAccounts ? `<div class="bank">${escapeHtml(data.bankAccounts)}</div>` : ''}
    <div style="margin-top:1mm; font-size:8px; color:#999;">ShopAccounting • ${new Date().toLocaleDateString('fa-IR')}</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 300);
    };
  </script>
</body>
</html>`
}

// ═══════════════════════════════════════════════════════════════
//  تولید HTML فاکتور A4 (Portrait، وسط صفحه، multi-page)
// ═══════════════════════════════════════════════════════════════

function generateA4(data: ReceiptData): string {
  const currency = data.currency || 'ریال'
  const primaryColor = '#059669'

  const itemsHtml = data.items
    .map((item, idx) => {
      return `
<tr>
  <td style="text-align:center;">${toFa(idx + 1)}</td>
  <td>${escapeHtml(item.productName)}</td>
  <td style="text-align:center;">${toFa(item.quantity)} ${item.unitLabel || ''}</td>
  <td style="text-align:left; font-family:monospace;">${toFa(item.unitPrice)}</td>
  <td style="text-align:left; font-family:monospace;">${item.discount && item.discount > 0 ? toFa(item.discount) : '—'}</td>
  <td style="text-align:left; font-family:monospace; font-weight:bold;">${toFa(item.lineTotal)}</td>
</tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>فاکتور ${data.invoiceNumber}</title>
<style>
  /* ★★★ v3.36.7: A4 Portrait با margin مناسب */
  @page {
    size: A4 portrait;
    margin: 12mm 14mm;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    font-family: 'Tahoma', 'Vazirmatn', sans-serif;
    font-size: 11px;
    color: #333;
    background: #fff;
    text-align: right;  /* ★ متن راست‌چین */
  }
  /* ★★★ v3.36.7: container مرکزی برای اطمینان از وسط چین بودن */
  .page {
    width: 100%;
    max-width: 180mm;
    margin: 0 auto;
  }
  .header {
    background: ${primaryColor};
    color: white;
    padding: 12px 14px;
    border-radius: 6px 6px 0 0;
    display: flex;
    align-items: center;
    gap: 12px;
    page-break-inside: avoid;
  }
  .header img { max-height: 45px; max-width: 90px; }
  .header h1 { font-size: 20px; margin-bottom: 4px; }
  .header .meta { font-size: 11px; opacity: 0.9; }
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 12px 14px;
    background: #f9f9f9;
    border-bottom: 1px solid #ddd;
    page-break-inside: avoid;
  }
  .info-item { font-size: 11px; }
  .info-item .label { color: #666; margin-left: 5px; }
  .info-item .value { font-weight: bold; }
  table.items {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
  }
  table.items thead { display: table-header-group; }
  table.items th {
    background: ${primaryColor}15;
    color: ${primaryColor};
    padding: 8px 10px;
    text-align: right;
    font-size: 11px;
    border-bottom: 2px solid ${primaryColor};
  }
  table.items td {
    padding: 6px 10px;
    border-bottom: 1px solid #eee;
    font-size: 11px;
  }
  table.items tr { page-break-inside: avoid; }
  .totals-section {
    margin-top: 12px;
    margin-right: auto;
    margin-left: auto;
    width: 280px;
    page-break-inside: avoid;
  }
  .totals-section .row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 11px;
  }
  .grand-total {
    border-top: 2px solid ${primaryColor};
    padding-top: 6px;
    margin-top: 4px;
    font-weight: bold;
    font-size: 13px;
  }
  .payment-box {
    background: #fff8e1;
    border: 1px solid #ffe082;
    border-radius: 6px;
    padding: 8px 10px;
    margin-top: 12px;
    font-size: 11px;
    page-break-inside: avoid;
  }
  .payment-box .row {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
  }
  .signature {
    display: flex;
    justify-content: space-between;
    margin-top: 28px;
    page-break-inside: avoid;
  }
  .signature div {
    text-align: center;
    font-size: 10px;
    color: #666;
  }
  .signature div::before {
    content: '';
    display: block;
    width: 180px;
    border-top: 1px dashed #999;
    margin-bottom: 4px;
  }
  .footer {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px solid #ddd;
    text-align: center;
    font-size: 10px;
    color: #666;
    page-break-inside: avoid;
  }
  @media print {
    body { font-size: 11px; }
    .no-print { display: none; }
  }
  @media screen {
    body { background: #f0f0f0; padding: 20px; }
    .page {
      background: white;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border-radius: 4px;
    }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      ${data.logoData ? `<img src="${data.logoData}" alt="logo" />` : ''}
      <div style="flex:1;">
        <h1>${escapeHtml(data.headerText || DEFAULT_SETTINGS.headerText)}</h1>
        <div class="meta">${escapeHtml(data.storeName)}</div>
        ${data.storeAddress ? `<div class="meta">${escapeHtml(data.storeAddress)}</div>` : ''}
        ${data.storePhone ? `<div class="meta">تلفن: ${escapeHtml(data.storePhone)}</div>` : ''}
      </div>
    </div>

    <div class="info-grid">
      <div>
        <div class="info-item"><span class="label">شماره فاکتور:</span><span class="value">${escapeHtml(data.invoiceNumber)}</span></div>
        <div class="info-item" style="margin-top:4px;"><span class="label">تاریخ:</span><span class="value">${escapeHtml(data.invoiceDate)}</span></div>
      </div>
      <div>
        <div class="info-item"><span class="label">مشتری:</span><span class="value">${escapeHtml(data.customerName || 'فروش عمومی')}</span></div>
        ${data.cashierName ? `<div class="info-item" style="margin-top:4px;"><span class="label">صندوق‌دار:</span><span class="value">${escapeHtml(data.cashierName)}</span></div>` : ''}
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th style="width:30px;">#</th>
          <th>کالا</th>
          <th style="width:80px;">تعداد</th>
          <th style="width:100px;">قیمت واحد</th>
          <th style="width:80px;">تخفیف</th>
          <th style="width:120px;">مبلغ کل</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="totals-section">
      <div class="row"><span>جمع کل:</span><span>${toFa(data.subTotal)} ${currency}</span></div>
      ${data.discountAmount > 0 ? `<div class="row"><span>تخفیف آیتم‌ها:</span><span>- ${toFa(data.discountAmount)}</span></div>` : ''}
      ${data.invoiceDiscountAmount && data.invoiceDiscountAmount > 0 ? `<div class="row"><span>تخفیف فاکتور:</span><span>- ${toFa(data.invoiceDiscountAmount)}</span></div>` : ''}
      ${data.taxAmount > 0 ? `<div class="row"><span>مالیات:</span><span>+ ${toFa(data.taxAmount)}</span></div>` : ''}
      <div class="grand-total" style="display:flex; justify-content:space-between;">
        <span>قابل پرداخت:</span>
        <span>${toFa(data.totalAmount)} ${currency}</span>
      </div>
    </div>

    <div class="payment-box">
      <div class="row"><span>روش پرداخت:</span><span style="font-weight:bold;">${escapeHtml(data.paymentTypeLabel)}</span></div>
      ${data.paidAmount > 0 ? `<div class="row"><span>پرداخت شده:</span><span>${toFa(data.paidAmount)} ${currency}</span></div>` : ''}
      ${data.remainingAmount > 0 ? `<div class="row"><span>باقیمانده:</span><span style="color:#c00;">${toFa(data.remainingAmount)} ${currency}</span></div>` : ''}
    </div>

    <div class="signature">
      <div>مهر و امضای فروشنده</div>
      <div>امضای مشتری</div>
    </div>

    <div class="footer">
      <div style="font-weight:bold; margin-bottom:4px;">${escapeHtml(data.footerText || DEFAULT_SETTINGS.footerText)}</div>
      ${data.bankAccounts ? `<div>${escapeHtml(data.bankAccounts)}</div>` : ''}
      <div style="margin-top:4px; color:#999; font-size:9px;">ShopAccounting • ${new Date().toLocaleDateString('fa-IR')}</div>
    </div>
  </div>

  <script>
    window.onload = function() { setTimeout(function() { window.print(); }, 300); };
  </script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ═══════════════════════════════════════════════════════════════
//  کامپوننت اصلی
// ═══════════════════════════════════════════════════════════════

const TEMPLATE_OPTIONS: { value: ReceiptTemplate; label: string; description: string; icon: any; paperSize: string; previewWidth: number }[] = [
  {
    value: 'thermal-58mm',
    label: 'حرارتی ۵۸mm',
    description: 'پرینتر مینی USB/بلوتوث',
    icon: Receipt,
    paperSize: '58mm',
    previewWidth: 220,  // پیکسل برای پیش‌نمایش
  },
  {
    value: 'thermal-80mm',
    label: 'حرارتی ۸۰mm',
    description: 'پرینتر حرارتی استاندارد',
    icon: Receipt,
    paperSize: '80mm',
    previewWidth: 300,
  },
  {
    value: 'a4',
    label: 'A4 کامل',
    description: 'پرینتر معمولی (Portrait)',
    icon: FileText,
    paperSize: 'A4',
    previewWidth: 460,
  },
]

export function ThermalReceiptPrint({
  open,
  onOpenChange,
  data,
  defaultTemplate = 'thermal-80mm',
}: ThermalReceiptPrintProps) {
  const [template, setTemplate] = useState<ReceiptTemplate>(defaultTemplate)
  const [printing, setPrinting] = useState(false)
  const { toast } = useToast()

  // ★★★ v3.36.7: هنگام باز شدن، قالب پیش‌فرض را تنظیم کن (با useEffect نه useMemo)
  useEffect(() => {
    if (open) {
      setTemplate(defaultTemplate)
      setPrinting(false)
    }
  }, [open, defaultTemplate])

  const previewHtml = useMemo(() => {
    if (!open) return ''
    if (template === 'thermal-58mm') return generateThermal58(data)
    if (template === 'thermal-80mm') return generateThermal80(data)
    return generateA4(data)
  }, [template, data, open])

  // ★★★ v3.36.7: عرض پیش‌نمایش بر اساس قالب انتخاب‌شده
  const previewWidth = useMemo(() => {
    const opt = TEMPLATE_OPTIONS.find((o) => o.value === template)
    return opt?.previewWidth || 460
  }, [template])

  const doPrint = useCallback(() => {
    setPrinting(true)
    try {
      const printWindow = window.open('', '_blank', 'width=900,height=700')
      if (!printWindow) {
        toast({
          title: 'خطا',
          description: 'پاپ‌آپ مسدود شده است. لطفاً اجازه پاپ‌آپ بدهید.',
          variant: 'destructive',
        })
        setPrinting(false)
        return
      }
      printWindow.document.open()
      printWindow.document.write(previewHtml)
      printWindow.document.close()
      toast({ title: 'ارسال به چاپ', description: 'پنجره چاپ باز شد' })
    } catch (err: any) {
      toast({
        title: 'خطا در چاپ',
        description: err?.message || 'خطای ناشناخته',
        variant: 'destructive',
      })
    } finally {
      setPrinting(false)
    }
  }, [previewHtml, toast])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-emerald-600" />
              چاپ رسید / فاکتور
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
              aria-label="بستن"
            >
              <X className="w-4 h-4" />
            </button>
          </DialogTitle>
          <DialogDescription className="text-xs">
            قالب چاپ را انتخاب کنید
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          {/* ★ انتخاب قالب */}
          <div className="grid grid-cols-3 gap-1.5">
            {TEMPLATE_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const isActive = template === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTemplate(opt.value)}
                  className={`p-2 rounded-lg border-2 transition-all text-center ${
                    isActive
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 mx-auto mb-1 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}
                  />
                  <div className={`text-[10px] font-bold ${isActive ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {opt.label}
                  </div>
                  <div className="text-[8px] text-slate-400 mt-0.5 leading-tight">
                    {opt.description}
                  </div>
                  <div className="text-[8px] text-slate-500 mt-0.5 font-mono">
                    کاغذ: {opt.paperSize}
                  </div>
                  {isActive && (
                    <CheckCircle2 className="w-3 h-3 mx-auto mt-0.5 text-emerald-600" />
                  )}
                </button>
              )
            })}
          </div>

          {/* ★★★ v3.36.7: پیش‌نمایش با عرض مناسب هر قالب */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
            <div className="bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600 flex items-center justify-between">
              <span>پیش‌نمایش</span>
              <span className="text-slate-400">
                {data.invoiceNumber} • عرض: {previewWidth}px
              </span>
            </div>
            {/* ★ container برای وسط‌چین کردن iframe */}
            <div className="flex justify-center bg-slate-100 p-2">
              <iframe
                srcDoc={previewHtml}
                style={{ width: `${previewWidth}px`, height: '320px' }}
                className="bg-white border border-slate-200 rounded"
                title="پیش‌نمایش رسید"
              />
            </div>
          </div>

          {/* ★ راهنمای سایز کاغذ */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-[10px] text-blue-700">
            <p className="font-bold mb-0.5">📌 راهنمای سایز کاغذ:</p>
            <ul className="list-disc pr-4 space-y-0.5 text-blue-600">
              <li><b>58mm</b>: کاغذ حرارتی باریک (پرینترهای مینی)</li>
              <li><b>80mm</b>: کاغذ حرارتی استاندارد (پرینترهای فروشگاهی)</li>
              <li><b>A4</b>: کاغذ A4 عمودی (پرینترهای معمولی لیزری/جوهرافشان)</li>
            </ul>
            <p className="mt-1 text-blue-600">
              سایز کاغذ در چاپ نهایی به‌صورت خودکار برای هر قالب تنظیم می‌شود (@page size).
            </p>
          </div>
        </div>

        <DialogFooter className="gap-1.5 pt-1 border-t">
          <Button variant="outline" size="sm" className="h-8 text-xs flex-1" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button
            size="sm"
            onClick={doPrint}
            disabled={printing}
            className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs flex-1 gap-1"
          >
            {printing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Printer className="w-3.5 h-3.5" />
            )}
            چاپ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
