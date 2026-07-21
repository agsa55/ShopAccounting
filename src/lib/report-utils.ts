// ============================================================================
// src/lib/report-utils.ts — گزارش‌گیری: خروجی Excel و چاپ
// ShopAccounting v35 — Reports Utilities
// ============================================================================
// ★ اصلاحات v35:
//   ★★★ ستون ردیف (شماره ردیف) به همه گزارش‌ها اضافه شد
//   ★★★ تمام محتوای جدول وسط‌چین شد
//   ★★★ تمام اعداد فارسی (۰۱۲۳۴۵۶۷۸۹) — حتی در Excel
//   ★★★ هدر گزارش در تمام صفحات چاپ تکرار می‌شه (position: fixed)
//   ★★★ امضاءها در پایین صفحه آخر نمایش داده می‌شن (نه صفحه بعدی)
//   ★★★ هدر جدول (thead) در تمام صفحات چاپ تکرار می‌شه
//   ★★★ صفحه‌بندی خودکار با CSS page-break برای جلوگیری از بریدن ردیف‌ها
//
// ★ ویژگی‌ها:
//   - exportToExcel: تولید فایل Excel (.xls) بدون نیاز به کتابخانه خارجی
//   - printReport: باز کردن پنجره چاپ با گزارش شیک (هدر، عنوان، بازه، فوتر)
// ============================================================================

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

/** تبدیل اعداد انگلیسی به فارسی */
export function toFaNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

/** تبدیل اعداد فارسی به انگلیسی */
export function toEnNum(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
}

/** فرمت عدد با جداکننده هزارگان (فارسی) */
export function formatNumberFa(num: number | string | null | undefined): string {
  const n = typeof num === 'string' ? parseInt(toEnNum(num), 10) || 0 : (num || 0)
  return (n || 0).toLocaleString('fa-IR')
}

/** فرمت مبلغ با "تومان" (اعداد فارسی) */
export function formatCurrencyFa(num: number | null | undefined): string {
  return `${formatNumberFa(num || 0)} تومان`
}

/** تبدیل هر رشته به فارسی — اعداد و سایر کاراکترها */
function convertToFarsi(text: any): string {
  if (text === null || text === undefined) return ''
  return String(text).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

/** HTML escape برای جلوگیری از injection در Excel/Print */
function escapeHtml(text: any): string {
  if (text === null || text === undefined) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ═══════════════════════════════════════════════════════════════
//  تایپ‌های مشترک
// ═══════════════════════════════════════════════════════════════

export interface ReportMeta {
  /** عنوان گزارش */
  title: string
  /** نام فروشگاه */
  storeName?: string
  /** بازه زمانی (مثلاً "۱ فروردین ۱۴۰۳ تا ۳۱ فروردین ۱۴۰۳") */
  period?: string
  /** فیلترهای اضافی (مثلاً "صندوق‌دار: علی محمدی") */
  filters?: { label: string; value: string }[]
  /** خلاصه آماری در بالای گزارش */
  summary?: { label: string; value: string; color?: 'green' | 'red' | 'amber' | 'blue' | 'gray' }[]
  /** یادداشت پایین گزارش */
  note?: string
}

export interface ReportColumn {
  /** عنوان ستون */
  label: string
  /** کلید در آبجکت داده (اگه rows آبجکت باشن) */
  key?: string
  /** عرض ستون (px) */
  width?: number
  /** ترازبندی: center (پیش‌فرض)، right، left */
  align?: 'right' | 'center' | 'left'
  /** آیا ستون عدد/مبلغ هست (برای رنگ‌بندی و فرمت) */
  isNumeric?: boolean
  /** آیا ستون مبلغ هست (با "تومان" نمایش داده بشه) */
  isCurrency?: boolean
  /** رنگ متن شرطی (برای وضعیت) */
  colorClass?: (value: any, row: any) => string
}

// ═══════════════════════════════════════════════════════════════
//  Export to Excel — بدون کتابخانه خارجی
//  HTML table → .xls file (با MIME صحیح)
//  ★★★ v35: ستون ردیف + اعداد فارسی + وسط‌چین
// ═══════════════════════════════════════════════════════════════

export function exportToExcel(
  meta: ReportMeta,
  columns: ReportColumn[],
  rows: Record<string, any>[],
  fileName?: string
): void {
  const safeFileName = (fileName || meta.title || 'report').replace(/[^\w\u0600-\u06FF\s-]/g, '_')
  const now = new Date().toLocaleString('fa-IR')

  // ★★★ v35: تبدیل اعداد در عنوان، فیلترها و خلاصه به فارسی
  const farsiTitle = convertToFarsi(meta.title)
  const farsiStoreName = meta.storeName ? convertToFarsi(meta.storeName) : ''
  const farsiPeriod = meta.period ? convertToFarsi(meta.period) : ''
  const farsiFilters = (meta.filters || []).map(f => ({
    label: convertToFarsi(f.label),
    value: convertToFarsi(f.value)
  }))
  const farsiSummary = (meta.summary || []).map(s => ({
    label: convertToFarsi(s.label),
    value: convertToFarsi(s.value),
    color: s.color || 'gray'
  }))

  // ★ تولید HTML جدول با استایل کامل
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="fa" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<!--[if gte mso 9]>
<xml>
  <x:ExcelWorkbook>
    <x:ExcelWorksheets>
      <x:ExcelWorksheet>
        <x:Name>${escapeHtml(farsiTitle)}</x:Name>
        <x:WorksheetOptions>
          <x:DisplayGridlines/>
          <x:RightToLeft/>
          <x:FitToWindow/>
          <x:Print>
            <x:ValidPrinterInfo/>
            <x:PaperSizeIndex>9</x:PaperSizeIndex>
            <x:HorizontalResolution>600</x:HorizontalResolution>
            <x:VerticalResolution>600</x:VerticalResolution>
          </x:Print>
        </x:WorksheetOptions>
      </x:ExcelWorksheet>
    </x:ExcelWorksheets>
  </x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
  @page { size: A4 landscape; margin: 1cm; }
  body { font-family: 'Tahoma', 'B Nazanin', 'Vazirmatn', sans-serif; font-size: 11pt; color: #1f2937; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: center; }
  .report-header { text-align: center; margin-bottom: 20px; }
  .report-title { font-size: 18pt; font-weight: bold; color: #047857; margin: 4px 0; }
  .report-store { font-size: 12pt; color: #6b7280; }
  .report-period { font-size: 11pt; color: #374151; margin-top: 6px; }
  .report-meta { font-size: 10pt; color: #6b7280; margin-top: 4px; }
  .summary-table { margin: 16px auto; border-collapse: separate; border-spacing: 8px; }
  .summary-cell { background: #f3f4f6; padding: 8px 16px; border-radius: 6px; text-align: center; min-width: 120px; }
  .summary-label { font-size: 9pt; color: #6b7280; }
  .summary-value { font-size: 13pt; font-weight: bold; margin-top: 2px; }
  .summary-green { color: #047857; }
  .summary-red { color: #b91c1c; }
  .summary-amber { color: #b45309; }
  .summary-blue { color: #1d4ed8; }
  .summary-gray { color: #374151; }
  th { background: #064e3b; color: white; font-weight: bold; text-align: center; }
  tr:nth-child(even) { background: #f9fafb; }
  tr:hover { background: #ecfdf5; }
  .row-num { width: 50px; background: #f9fafb; font-weight: bold; color: #6b7280; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .text-left { text-align: left; }
  .num { text-align: center; direction: ltr; font-family: 'Tahoma'; }
  .currency { text-align: center; direction: ltr; font-family: 'Tahoma'; color: #047857; font-weight: bold; }
  .text-green { color: #047857; }
  .text-red { color: #b91c1c; }
  .text-amber { color: #b45309; }
  .text-blue { color: #1d4ed8; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #d1d5db; font-size: 9pt; color: #6b7280; text-align: center; }
  .total-row td { background: #064e3b !important; color: white !important; font-weight: bold; }
</style>
</head>
<body>
  <div class="report-header">
    ${farsiStoreName ? `<div class="report-store">${escapeHtml(farsiStoreName)}</div>` : ''}
    <div class="report-title">${escapeHtml(farsiTitle)}</div>
    ${farsiPeriod ? `<div class="report-period">بازه گزارش: ${escapeHtml(farsiPeriod)}</div>` : ''}
    ${(farsiFilters.length > 0) ? `<div class="report-meta">${farsiFilters.map(f => `${escapeHtml(f.label)}: ${escapeHtml(f.value)}`).join(' • ')}</div>` : ''}
    ${now ? `<div class="report-meta">تاریخ تولید: ${escapeHtml(now)}</div>` : ''}
  </div>

  ${farsiSummary.length > 0 ? `
  <table class="summary-table" align="center">
    <tr>
      ${farsiSummary.map(s => `
        <td class="summary-cell">
          <div class="summary-label">${escapeHtml(s.label)}</div>
          <div class="summary-value summary-${s.color}">${escapeHtml(s.value)}</div>
        </td>
      `).join('')}
    </tr>
  </table>
  ` : ''}

  <table>
    <thead>
      <tr>
        <th class="row-num">ردیف</th>
        ${columns.map(col => `<th style="${col.width ? `width: ${col.width}px; ` : ''}text-align: center">${escapeHtml(convertToFarsi(col.label))}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows.length === 0
        ? `<tr><td colspan="${columns.length + 1}" style="text-align: center; padding: 30px; color: #9ca3af;">داده‌ای برای نمایش وجود ندارد</td></tr>`
        : rows.map((row, idx) => {
          // ★★★ v35: شماره ردیف فارسی
          const rowNum = toFaNum(idx + 1)
          const cells = [
            `<td class="row-num">${rowNum}</td>`,
            ...columns.map(col => {
              const rawValue = col.key ? row[col.key] : ''
              let displayValue = ''
              let className = ''

              if (col.isCurrency) {
                const n = Number(rawValue) || 0
                // ★★★ v35: اعداد فارسی در مبلغ
                displayValue = convertToFarsi(`${(n || 0).toLocaleString('fa-IR')} تومان`)
                className = 'currency'
              } else if (col.isNumeric) {
                const n = Number(rawValue) || 0
                // ★★★ v35: اعداد فارسی در عدد
                displayValue = convertToFarsi((n || 0).toLocaleString('fa-IR'))
                className = 'num'
              } else {
                // ★★★ v35: تبدیل اعداد فارسی در متن
                displayValue = convertToFarsi(String(rawValue ?? ''))
              }

              // ★ رنگ شرطی (مثلاً برای وضعیت)
              if (col.colorClass) {
                const color = col.colorClass(rawValue, row)
                if (color) className += ` ${color}`
              }

              return `<td class="${className}">${escapeHtml(displayValue)}</td>`
            })
          ].join('')
          return `<tr>${cells}</tr>`
        }).join('')
      }
    </tbody>
  </table>

  ${meta.note ? `<div style="margin-top: 16px; padding: 10px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; font-size: 10pt; color: #92400e;">${escapeHtml(convertToFarsi(meta.note))}</div>` : ''}

  <div class="footer">
    این گزارش توسط سیستم حسابداری فروشگاهی تولید شده است • ${escapeHtml(now)}
  </div>
</body>
</html>`

  // ★ ساخت Blob و دانلود
  const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeFileName}.xls`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ═══════════════════════════════════════════════════════════════
//  Print Report — باز کردن پنجره چاپ با گزارش شیک
//  ★★★ v35: هدر تکرار شونده + امضا در صفحه آخر + ستون ردیف + اعداد فارسی
// ═══════════════════════════════════════════════════════════════

export function printReport(
  meta: ReportMeta,
  columns: ReportColumn[],
  rows: Record<string, any>[]
): void {
  const now = new Date().toLocaleString('fa-IR')

  // ★★★ v35: تبدیل اعداد در تمام بخش‌ها به فارسی
  const farsiTitle = convertToFarsi(meta.title)
  const farsiStoreName = meta.storeName ? convertToFarsi(meta.storeName) : ''
  const farsiPeriod = meta.period ? convertToFarsi(meta.period) : ''
  const farsiFilters = (meta.filters || []).map(f => ({
    label: convertToFarsi(f.label),
    value: convertToFarsi(f.value)
  }))
  const farsiSummary = (meta.summary || []).map(s => ({
    label: convertToFarsi(s.label),
    value: convertToFarsi(s.value),
    color: s.color || 'gray'
  }))
  const farsiNote = meta.note ? convertToFarsi(meta.note) : ''

  // ★★★ v35: تولید ردیف‌های جدول با شماره ردیف فارسی + اعداد فارسی
  const tableRows = rows.length === 0
    ? `<tr><td colspan="${columns.length + 1}" class="empty-state">داده‌ای برای نمایش وجود ندارد</td></tr>`
    : rows.map((row, idx) => {
        const rowNum = toFaNum(idx + 1)
        const cells = [
          `<td class="row-num">${rowNum}</td>`,
          ...columns.map(col => {
            const rawValue = col.key ? row[col.key] : ''
            let displayValue = ''
            let className = col.isCurrency ? 'currency' : (col.isNumeric ? 'num' : '')

            if (col.isCurrency) {
              const n = Number(rawValue) || 0
              displayValue = convertToFarsi(`${(n || 0).toLocaleString('fa-IR')} تومان`)
            } else if (col.isNumeric) {
              const n = Number(rawValue) || 0
              displayValue = convertToFarsi((n || 0).toLocaleString('fa-IR'))
            } else {
              displayValue = convertToFarsi(String(rawValue ?? ''))
            }

            if (col.colorClass) {
              const color = col.colorClass(rawValue, row)
              if (color) className += ` ${color}`
            }

            return `<td class="${className}">${escapeHtml(displayValue)}</td>`
          })
        ].join('')
        return `<tr>${cells}</tr>`
      }).join('')

  // ★★★ v35: تولید HTML برای چاپ با CSS پیشرفته
  //   - هدر گزارش در تمام صفحات تکرار می‌شه (position: fixed در print)
  //   - هدر جدول (thead) در تمام صفحات چاپ می‌شه (display: table-header-group)
  //   - امضاءها در صفحه آخر با page-break-inside: avoid
  //   - page-break-after: avoid برای جلوگیری از بریدن ردیف‌ها
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(farsiTitle)}</title>
<style>
  @page { size: A4 landscape; margin: 1.5cm 1.5cm 2cm 1.5cm; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }

    /* ★★★ هدر گزارش در تمام صفحات چاپ می‌شه */
    .report-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: white;
      z-index: 1000;
      padding-bottom: 8px;
      border-bottom: 2px solid #047857;
    }
    /* ★ فضا برای هدر ثابت */
    body { padding-top: 110px; }

    /* ★★★ هدر جدول در تمام صفحات تکرار می‌شه */
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }

    /* ★ جلوگیری از بریدن ردیف‌ها بین صفحات */
    tr { page-break-inside: avoid; }
    tbody { page-break-inside: auto; }

    /* ★★★ امضاءها در صفحه آخر — page-break-inside: avoid */
    .report-footer {
      page-break-inside: avoid;
      page-break-after: auto;
    }
  }

  * { box-sizing: border-box; }
  body {
    font-family: 'Tahoma', 'B Nazanin', 'Vazirmatn', sans-serif;
    font-size: 10pt;
    color: #1f2937;
    margin: 0;
    padding: 20px;
    background: white;
    line-height: 1.6;
  }

  /* ★★★ هدر گزارش — در نمایش آنلاین و چاپ */
  .report-header {
    text-align: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 2px solid #047857;
  }
  .store-logo {
    display: inline-block;
    width: 48px;
    height: 48px;
    background: #047857;
    color: white;
    border-radius: 10px;
    line-height: 48px;
    font-size: 18pt;
    font-weight: bold;
    margin-bottom: 4px;
  }
  .store-name { font-size: 11pt; color: #6b7280; margin-bottom: 2px; }
  .report-title { font-size: 18pt; font-weight: bold; color: #064e3b; margin: 2px 0; }
  .report-period {
    font-size: 10pt;
    color: #374151;
    margin-top: 4px;
    padding: 4px 12px;
    background: #ecfdf5;
    border-radius: 4px;
    display: inline-block;
  }
  .report-meta { font-size: 9pt; color: #6b7280; margin-top: 4px; }
  .report-meta span { margin-left: 12px; }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    margin: 12px 0;
  }
  .summary-card {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 8px 10px;
    text-align: center;
    background: #f9fafb;
  }
  .summary-label { font-size: 9pt; color: #6b7280; margin-bottom: 2px; }
  .summary-value { font-size: 13pt; font-weight: bold; }
  .summary-card.green { border-color: #a7f3d0; background: #ecfdf5; }
  .summary-card.green .summary-value { color: #047857; }
  .summary-card.red { border-color: #fecaca; background: #fef2f2; }
  .summary-card.red .summary-value { color: #b91c1c; }
  .summary-card.amber { border-color: #fde68a; background: #fffbeb; }
  .summary-card.amber .summary-value { color: #b45309; }
  .summary-card.blue { border-color: #bfdbfe; background: #eff6ff; }
  .summary-card.blue .summary-value { color: #1d4ed8; }
  .summary-card.gray { border-color: #e5e7eb; background: #f9fafb; }
  .summary-card.gray .summary-value { color: #374151; }

  /* ★★★ جدول گزارش */
  table.report-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    font-size: 9.5pt;
  }
  table.report-table th {
    background: #064e3b;
    color: white;
    font-weight: bold;
    padding: 8px 6px;
    text-align: center;
    border: 1px solid #064e3b;
    font-size: 9.5pt;
  }
  table.report-table td {
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    vertical-align: middle;
    text-align: center;  /* ★★★ تمام محتوا وسط‌چین */
  }
  table.report-table tbody tr:nth-child(even) { background: #f9fafb; }
  table.report-table tbody tr:hover { background: #ecfdf5; }
  .empty-state {
    text-align: center;
    padding: 30px;
    color: #9ca3af;
    font-style: italic;
  }
  /* ★★★ ستون ردیف */
  .row-num {
    width: 45px;
    background: #f3f4f6 !important;
    font-weight: bold;
    color: #6b7280;
    text-align: center;
  }
  /* اعداد و مبالغ وسط‌چین */
  .num { text-align: center; direction: ltr; font-family: 'Tahoma'; }
  .currency { text-align: center; direction: ltr; font-family: 'Tahoma'; color: #047857; font-weight: bold; }
  .text-green { color: #047857 !important; font-weight: bold; }
  .text-red { color: #b91c1c !important; font-weight: bold; }
  .text-amber { color: #b45309 !important; font-weight: bold; }
  .text-blue { color: #1d4ed8 !important; font-weight: bold; }

  .report-note {
    margin-top: 12px;
    padding: 8px 12px;
    background: #fffbeb;
    border: 1px solid #fcd34d;
    border-radius: 4px;
    font-size: 9.5pt;
    color: #92400e;
  }

  /* ★★★ فوتر و امضاءها — در صفحه آخر */
  .report-footer {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 2px solid #d1d5db;
    text-align: center;
    font-size: 8.5pt;
    color: #6b7280;
  }
  .report-footer .footer-info {
    margin-bottom: 16px;
  }
  .report-footer .signature {
    display: flex;
    justify-content: space-between;
    margin-top: 30px;
    padding: 0 20px;
    page-break-inside: avoid;
  }
  .report-footer .signature div {
    border-top: 1px solid #6b7280;
    padding-top: 4px;
    width: 180px;
    text-align: center;
    font-size: 9pt;
    color: #374151;
    font-weight: bold;
  }
  .action-bar {
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 2000;
    display: flex;
    gap: 8px;
  }
  .action-bar button {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11pt;
    font-family: inherit;
  }
  .action-bar .print-btn { background: #047857; color: white; }
  .action-bar .close-btn { background: #6b7280; color: white; }
  .action-bar button:hover { opacity: 0.9; }
</style>
</head>
<body>
  <div class="action-bar no-print">
    <button class="print-btn" onclick="window.print()">🖨️ چاپ گزارش</button>
    <button class="close-btn" onclick="window.close()">✕ بستن</button>
  </div>

  <div class="report-header">
    <div class="store-logo">${escapeHtml((farsiStoreName || 'ح').charAt(0))}</div>
    ${farsiStoreName ? `<div class="store-name">${escapeHtml(farsiStoreName)}</div>` : ''}
    <div class="report-title">${escapeHtml(farsiTitle)}</div>
    ${farsiPeriod ? `<div class="report-period">📅 بازه گزارش: ${escapeHtml(farsiPeriod)}</div>` : ''}
    <div class="report-meta">
      <span>🕒 تاریخ تولید: ${escapeHtml(now)}</span>
      ${farsiFilters.map(f => `<span>${escapeHtml(f.label)}: ${escapeHtml(f.value)}</span>`).join('')}
    </div>
  </div>

  ${farsiSummary.length > 0 ? `
  <div class="summary-grid">
    ${farsiSummary.map(s => `
      <div class="summary-card ${s.color}">
        <div class="summary-label">${escapeHtml(s.label)}</div>
        <div class="summary-value">${escapeHtml(s.value)}</div>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <table class="report-table">
    <thead>
      <tr>
        <th class="row-num">ردیف</th>
        ${columns.map(col => `<th style="${col.width ? `width: ${col.width}px; ` : ''}text-align: center">${escapeHtml(convertToFarsi(col.label))}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  ${farsiNote ? `<div class="report-note">📝 ${escapeHtml(farsiNote)}</div>` : ''}

  <div class="report-footer">
    <div class="footer-info">
      این گزارش توسط سیستم حسابداری فروشگاهی تولید شده است<br>
      تاریخ تولید: ${escapeHtml(now)}
    </div>
    <div class="signature">
      <div>امضای مدیر فروشگاه</div>
      <div>مهر و امضای حسابدار</div>
    </div>
  </div>

  <script>
    // ★ چاپ خودکار بعد از لود
    window.addEventListener('load', function() {
      setTimeout(function() {
        try { window.print() } catch(e) { console.error(e) }
      }, 500)
    })
  </script>
</body>
</html>`

  // ★ باز کردن در پنجره جدیده
  const printWindow = window.open('', '_blank', 'width=1200,height=800')
  if (!printWindow) {
    alert('مرورگر شما پنجره popup را مسدود کرده است. لطفاً اجازه باز شدن popup را بدهید.')
    return
  }
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

// ═══════════════════════════════════════════════════════════════
//  توابع کمکی برای تولید ستون‌های رایج
// ═══════════════════════════════════════════════════════════════

/** ستون مبلغ با فرمت تومان */
export function currencyColumn(key: string, label: string, width?: number): ReportColumn {
  return { key, label, width, isCurrency: true, align: 'center' }
}

/** ستون عددی */
export function numericColumn(key: string, label: string, width?: number): ReportColumn {
  return { key, label, width, isNumeric: true, align: 'center' }
}

/** ستون متنی */
export function textColumn(key: string, label: string, width?: number, align: 'right' | 'center' | 'left' = 'center'): ReportColumn {
  return { key, label, width, align }
}

/** ستون وضعیت با رنگ‌بندی شرطی */
export function statusColumn(key: string, label: string, width?: number): ReportColumn {
  return {
    key, label, width, align: 'center',
    colorClass: (value: any) => {
      const v = String(value || '').toUpperCase()
      if (['PAID', 'COMPLETED', 'ACTIVE', 'CONFIRMED'].includes(v)) return 'text-green'
      if (['OVERDUE', 'CANCELLED', 'REJECTED', 'FAILED'].includes(v)) return 'text-red'
      if (['PENDING', 'DRAFT', 'PARTIALLYPAID'].includes(v)) return 'text-amber'
      return ''
    },
  }
}
// ============================================================================
//  VAT Report Helpers — v3.39
// ============================================================================

/**
 * ★ محاسبه پایه مالیاتی خالص
 * @param saleBase - پایه فاکتورهای فروش
 * @param returnBase - پایه فاکتورهای برگشتی
 * @returns پایه خالص (فروش - برگشتی)
 */
export function calculateNetTaxBase(saleBase: number, returnBase: number): number {
  return Math.max(0, saleBase - returnBase)
}

/**
 * ★ محاسبه مالیات خالص
 * @param saleVat - مالیات فاکتورهای فروش
 * @param returnVat - مالیات برگشتی‌ها
 * @returns مالیات خالص (فروش - برگشتی)
 */
export function calculateNetVat(saleVat: number, returnVat: number): number {
  return Math.max(0, saleVat - returnVat)
}

/**
 * ★ تفکیک invoiceType
 * @param invoiceType - نوع فاکتور از دیتابیس
 * @returns آیا برگشتی است؟
 */
export function isReturnInvoice(invoiceType: string | undefined): boolean {
  const type = (invoiceType || '').toLowerCase()
  return type === 'sale_return' || type === 'purchase_return' || type === 'return'
}

/**
 * ★ نشان‌دهی VAT برای UI
 * @param invoiceType - نوع فاکتور
 * @param amount - مبلغ
 * @returns مبلغ با علامت صحیح (منفی برای برگشتی)
 */
export function formatVatAmount(invoiceType: string | undefined, amount: number): string {
  const isReturn = isReturnInvoice(invoiceType)
  const displayAmount = Math.abs(amount)
  if (isReturn) {
    return `(${formatNumberFa(displayAmount)})`  // قوسین برای منفی
  }
  return formatNumberFa(displayAmount)
}

/**
 * ★ محاسبه درصد سهم مالیات
 * @param taxAmount - مبلغ مالیات
 * @param totalAmount - کل مبلغ
 * @returns درصد مالیات
 */
export function calculateTaxPercentage(taxAmount: number, totalAmount: number): number {
  if (totalAmount <= 0) return 0
  return (taxAmount / totalAmount) * 100
}