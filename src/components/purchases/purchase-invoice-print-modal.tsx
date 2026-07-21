'use client'

// ============================================================================
// src/components/purchases/purchase-invoice-print-modal.tsx
// ShopAccounting v6.9 — Purchase Invoice Print Modal (رسید فاکتور خرید)
// ============================================================================
// ★★★ ویژگی‌ها:
//   ★ نمایش جزئیات فاکتور خرید با قالب رسید
//   ★ چاپ مستقیم از مرورگر (window.print)
//   ★ قالب A4 portrait با لوگو، مهر و امضا
//   ★ نمایش: شماره، تاریخ، تامین‌کننده، انبار، محصولات، جمع‌ها
//   ★ خروجی چاپ-friendly (بدون منوهای اضافی)
// ============================================================================

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Printer, X } from 'lucide-react'

// ============================================================================
//  Helpers
// ============================================================================

const toFaNum = (n: number | string) =>
  String(n || 0).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])

const formatNumber = (n: number) => (n || 0).toLocaleString('fa-IR')

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ★ تبدیل تاریخ میلادی به شمسی
function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy: number
  if (gy > 1600) { jy = 979; gy -= 1600 } else { jy = 0; gy -= 621 }
  const gy2 = gm > 2 ? gy + 1 : gy
  let days =
    365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1]
  jy += 33 * Math.floor(days / 12053)
  days = days % 12053
  jy += 4 * Math.floor(days / 1461)
  days = days % 1461
  if (days > 365) {
    jy += Math.floor((days - 1) / 365)
    days = (days - 1) % 365
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30)
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30)
  return [jy, jm, jd]
}

function formatJalaliDate(isoDate: string): string {
  if (!isoDate) return '—'
  try {
    const d = new Date(isoDate)
    if (isNaN(d.getTime())) return '—'
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return `${toFaNum(jy)}/${toFaNum(jm).padStart(2, '۰')}/${toFaNum(jd).padStart(2, '۰')}`
  } catch { return isoDate }
}

const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

function formatJalaliLong(isoDate: string): string {
  if (!isoDate) return '—'
  try {
    const d = new Date(isoDate)
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return `${toFaNum(jd)} ${JALALI_MONTHS[jm - 1]} ${toFaNum(jy)}`
  } catch { return isoDate }
}

// ============================================================================
//  Types
// ============================================================================

interface PrintItem {
  id: string
  productName: string
  quantity: number
  unitPrice: number
  discountAmount: number
  taxAmount: number
  lineTotal: number
}

interface PrintData {
  id: string
  number: string
  invoiceDate: string
  status: string
  paymentType: string
  subTotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  remainingAmount: number
  description?: string | null
  supplier?: { name: string; code: string } | null
  warehouse?: { name: string } | null
  items: PrintItem[]
}

// ============================================================================
//  Main Component
// ============================================================================

interface PurchaseInvoicePrintModalProps {
  invoiceId: string | null
  invoiceNumber?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  storeName?: string
}

export function PurchaseInvoicePrintModal({
  invoiceId,
  invoiceNumber,
  open,
  onOpenChange,
  storeName = 'فروشگاه',
}: PurchaseInvoicePrintModalProps) {
  const [data, setData] = useState<PrintData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ★ Load invoice details
  useEffect(() => {
    if (!open || !invoiceId) return
    setLoading(true)
    setError(null)
    setData(null)

    fetch(`/api/purchase-invoices/${invoiceId}`, { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data) {
          setData(json.data)
        } else {
          setError(json.error || 'خطا در دریافت فاکتور')
        }
      })
      .catch(err => setError(err?.message || 'خطا در ارتباط با سرور'))
      .finally(() => setLoading(false))
  }, [open, invoiceId])

  // ★ Print function — روش پایدار با srcdoc iframe
  const handlePrint = () => {
    if (!data) return
    const html = generatePrintHtml(data, storeName)

    // ★★★ v6.9.3: استفاده از srcdoc — مطمئن‌ترین روش
    //   srcdoc محتوا رو قبل از append ست می‌کنه، پس onload بعد از لود کامل محتوا فایر می‌شه
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    iframe.style.visibility = 'hidden'
    iframe.setAttribute('srcdoc', html)

    iframe.onload = function() {
      try {
        const win = iframe.contentWindow
        if (!win) return
        win.focus()
        // ★ تاخیر برای رندر کامل فونت‌ها و استایل‌ها
        setTimeout(function() {
          win.print()
          // ★ حذف iframe بعد از چاپ
          setTimeout(function() {
            if (iframe.parentNode) {
              document.body.removeChild(iframe)
            }
          }, 2000)
        }, 500)
      } catch (e) {
        console.error('Print error:', e)
        if (iframe.parentNode) {
          document.body.removeChild(iframe)
        }
      }
    }

    document.body.appendChild(iframe)
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[95vh]" dir="rtl">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-emerald-600" />
              رسید فاکتور خرید {invoiceNumber || data?.number || ''}
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-500 text-sm">{error}</div>
        ) : data ? (
          <div className="space-y-3 overflow-y-auto max-h-[75vh] pr-1">
            {/* ★ پیش‌نمایش رسید */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm" id="receipt-preview">
              {/* ★ هدر رسید */}
              <div className="flex items-start justify-between mb-4 pb-3 border-b-2 border-emerald-500">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {storeName.charAt(0) || 'ف'}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">{storeName}</h2>
                    <p className="text-[10px] text-gray-500">رسید فاکتور خرید</p>
                  </div>
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-gray-700">شماره: <span dir="ltr">{data.number}</span></p>
                  <p className="text-[10px] text-gray-500">تاریخ: {formatJalaliDate(data.invoiceDate)}</p>
                </div>
              </div>

              {/* ★ اطلاعات تامین‌کننده و انبار */}
              <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500 mb-0.5">تامین‌کننده</p>
                  <p className="font-bold text-gray-800">{data.supplier?.name || '—'}</p>
                  {data.supplier?.code && <p className="text-[10px] text-gray-400" dir="ltr">کد: {data.supplier.code}</p>}
                </div>
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[10px] text-gray-500 mb-0.5">انبار</p>
                  <p className="font-bold text-gray-800">{data.warehouse?.name || '—'}</p>
                  <p className="text-[10px] text-gray-400">
                    وضعیت: {
                      data.status === 'confirmed' ? 'ثبت نهایی' :
                      data.status === 'paid' ? 'پرداخت شده' :
                      data.status === 'draft' ? 'پیش‌نویس' :
                      data.status === 'cancelled' ? 'لغو شده' : data.status
                    }
                  </p>
                </div>
              </div>

              {/* ★ جدول محصولات */}
              <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200">
                      <th className="py-1.5 px-2 text-right font-medium text-gray-600">#</th>
                      <th className="py-1.5 px-2 text-right font-medium text-gray-600">نام کالا</th>
                      <th className="py-1.5 px-2 text-center font-medium text-gray-600">تعداد</th>
                      <th className="py-1.5 px-2 text-left font-medium text-gray-600">قیمت واحد</th>
                      <th className="py-1.5 px-2 text-left font-medium text-gray-600">تخفیف</th>
                      <th className="py-1.5 px-2 text-left font-medium text-gray-600">جمع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item, idx) => (
                      <tr key={item.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 px-2 text-gray-400">{toFaNum(idx + 1)}</td>
                        <td className="py-1.5 px-2 font-medium text-gray-800">{item.productName}</td>
                        <td className="py-1.5 px-2 text-center text-gray-600">{formatNumber(item.quantity)}</td>
                        <td className="py-1.5 px-2 text-left text-gray-600" dir="ltr">{formatNumber(item.unitPrice)}</td>
                        <td className="py-1.5 px-2 text-left text-red-500" dir="ltr">
                          {item.discountAmount > 0 ? formatNumber(item.discountAmount) : '—'}
                        </td>
                        <td className="py-1.5 px-2 text-left font-bold text-gray-800" dir="ltr">{formatNumber(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ★ جمع‌ها */}
              <div className="flex justify-end mb-4">
                <div className="w-56 space-y-1 text-xs">
                  <div className="flex justify-between py-1">
                    <span className="text-gray-500">جمع کل:</span>
                    <span className="font-mono font-bold" dir="ltr">{formatNumber(data.subTotal)}</span>
                  </div>
                  {data.discountAmount > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-gray-500">تخفیف:</span>
                      <span className="font-mono text-red-500" dir="ltr">-{formatNumber(data.discountAmount)}</span>
                    </div>
                  )}
                  {data.taxAmount > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-gray-500">مالیات:</span>
                      <span className="font-mono text-amber-600" dir="ltr">+{formatNumber(data.taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1.5 border-t-2 border-emerald-500 bg-emerald-50 px-2 -mx-2 rounded">
                    <span className="font-bold text-gray-800">مبلغ نهایی:</span>
                    <span className="font-mono font-bold text-emerald-700" dir="ltr">{formatNumber(data.totalAmount)} ریال</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-500">پرداخت شده:</span>
                    <span className="font-mono text-emerald-600" dir="ltr">{formatNumber(data.paidAmount)}</span>
                  </div>
                  {data.remainingAmount > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-gray-500">باقیمانده:</span>
                      <span className="font-mono text-red-500" dir="ltr">{formatNumber(data.remainingAmount)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ★ مهر و امضا */}
              <div className="flex justify-between items-end pt-4 border-t border-gray-200">
                <div className="text-center">
                  <div className="w-32 border-t border-dashed border-gray-300 mb-1"></div>
                  <p className="text-[10px] text-gray-500">امضای تحویل‌دهنده (تامین‌کننده)</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">این رسید توسط سیستم ShopAccounting صادر شده است</p>
                  <p className="text-[9px] text-gray-300">{formatJalaliLong(data.invoiceDate)}</p>
                </div>
                <div className="text-center">
                  <div className="w-32 border-t border-dashed border-gray-300 mb-1"></div>
                  <p className="text-[10px] text-gray-500">امضای دریافت‌کننده (انباردار)</p>
                </div>
              </div>

              {data.description && (
                <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-700">
                  <span className="font-bold">توضیحات: </span>{data.description}
                </div>
              )}
            </div>

            {/* ★ دکمه چاپ */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>بستن</Button>
              <Button onClick={handlePrint} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
                <Printer className="w-4 h-4" />
                چاپ رسید
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
//  Print HTML Generator
// ============================================================================

function generatePrintHtml(data: PrintData, storeName: string): string {
  const itemsHtml = data.items.map((item, idx) => `
    <tr>
      <td style="text-align:center;width:30px;">${toFaNum(idx + 1)}</td>
      <td>${escapeHtml(item.productName)}</td>
      <td style="text-align:center;">${formatNumber(item.quantity)}</td>
      <td style="text-align:left;font-family:monospace;">${formatNumber(item.unitPrice)}</td>
      <td style="text-align:left;font-family:monospace;">${item.discountAmount > 0 ? formatNumber(item.discountAmount) : '—'}</td>
      <td style="text-align:left;font-family:monospace;font-weight:bold;">${formatNumber(item.lineTotal)}</td>
    </tr>
  `).join('')

  const statusLabel = data.status === 'confirmed' ? 'ثبت نهایی' :
    data.status === 'paid' ? 'پرداخت شده' :
    data.status === 'draft' ? 'پیش‌نویس' :
    data.status === 'cancelled' ? 'لغو شده' : data.status

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<title>رسید فاکتور خرید ${escapeHtml(data.number)}</title>
<style>
@page { size: A4 portrait; margin: 15mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Tahoma, sans-serif; font-size: 11px; color: #333; background: #fff; }
.page { width: 100%; max-width: 170mm; margin: 0 auto; }
.header { background: #059669; color: white; padding: 14px; border-radius: 6px 6px 0 0; display: flex; justify-content: space-between; align-items: center; }
.header h1 { font-size: 18px; margin-bottom: 4px; }
.header .meta { text-align: left; font-size: 11px; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0 0 6px 6px; }
.info-item { font-size: 11px; }
.info-item .label { color: #6b7280; font-size: 10px; }
.info-item .value { font-weight: bold; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; }
th { background: #f3f4f6; padding: 8px; text-align: right; font-size: 11px; border-bottom: 2px solid #d1d5db; }
td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
.totals { margin: 12px 0 12px auto; width: 280px; }
.totals .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; }
.totals .grand { border-top: 2px solid #059669; padding-top: 6px; margin-top: 4px; font-weight: bold; font-size: 13px; background: #ecfdf5; padding: 6px 8px; border-radius: 4px; }
.signature { display: flex; justify-content: space-between; margin-top: 36px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
.signature div { text-align: center; font-size: 10px; color: #666; }
.signature div::before { content: ''; display: block; width: 180px; border-top: 1px dashed #999; margin-bottom: 4px; margin-left: auto; margin-right: auto; }
.footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 9px; color: #999; }
.note { margin-top: 8px; padding: 6px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; font-size: 10px; color: #92400e; }
@media print { body { font-size: 11px; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <h1>${escapeHtml(storeName)}</h1>
      <div style="font-size:11px;opacity:0.9;">رسید فاکتور خرید</div>
    </div>
    <div class="meta">
      <div>شماره: <strong dir="ltr">${escapeHtml(data.number)}</strong></div>
      <div>تاریخ: ${formatJalaliDate(data.invoiceDate)}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-item">
      <div class="label">تامین‌کننده</div>
      <div class="value">${escapeHtml(data.supplier?.name || '—')}</div>
      ${data.supplier?.code ? `<div style="font-size:10px;color:#999;" dir="ltr">کد: ${escapeHtml(data.supplier.code)}</div>` : ''}
    </div>
    <div class="info-item">
      <div class="label">انبار</div>
      <div class="value">${escapeHtml(data.warehouse?.name || '—')}</div>
      <div style="font-size:10px;color:#999;">وضعیت: ${statusLabel}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px;">#</th>
        <th>نام کالا</th>
        <th style="text-align:center;width:60px;">تعداد</th>
        <th style="text-align:left;width:100px;">قیمت واحد</th>
        <th style="text-align:left;width:80px;">تخفیف</th>
        <th style="text-align:left;width:100px;">جمع</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>جمع کل:</span><span dir="ltr">${formatNumber(data.subTotal)}</span></div>
    ${data.discountAmount > 0 ? `<div class="row"><span>تخفیف:</span><span dir="ltr" style="color:#dc2626;">-${formatNumber(data.discountAmount)}</span></div>` : ''}
    ${data.taxAmount > 0 ? `<div class="row"><span>مالیات:</span><span dir="ltr" style="color:#d97706;">+${formatNumber(data.taxAmount)}</span></div>` : ''}
    <div class="row grand"><span>مبلغ نهایی:</span><span dir="ltr">${formatNumber(data.totalAmount)} ریال</span></div>
    <div class="row"><span style="color:#059669;">پرداخت شده:</span><span dir="ltr">${formatNumber(data.paidAmount)}</span></div>
    ${data.remainingAmount > 0 ? `<div class="row"><span style="color:#dc2626;">باقیمانده:</span><span dir="ltr">${formatNumber(data.remainingAmount)}</span></div>` : ''}
  </div>

  ${data.description ? `<div class="note"><strong>توضیحات: </strong>${escapeHtml(data.description)}</div>` : ''}

  <div class="signature">
    <div>امضای تحویل‌دهنده (تامین‌کننده)</div>
    <div>امضای دریافت‌کننده (انباردار)</div>
  </div>

  <div class="footer">
    <div style="font-weight:bold;margin-bottom:4px;">${escapeHtml(storeName)} — رسید فاکتور خرید</div>
    <div>تاریخ صدور: ${formatJalaliLong(data.invoiceDate)}</div>
    <div style="margin-top:4px;color:#ccc;font-size:8px;">ShopAccounting</div>
  </div>
</div>
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

export default PurchaseInvoicePrintModal
