// ============================================================================
// src/lib/report-export.ts — v8.4 ★★★
// ShopAccounting — Export utilities for reports (Excel + Print)
// ----------------------------------------------------------------------------
// ★★★ v8.4: این ماژول توابع کمکی برای خروجی Excel واقعی (.xls) و چاپ PDF
//   را فراهم می‌کند. بدون نیاز به کتابخانه خارجی — با استفاده از HTML table
//   و Excel XML format.
// ============================================================================

// ═══════════════════════════════════════════════════════════════
//  ۱. Excel Export — تولید فایل Excel واقعی (.xls) با HTML table
// ═══════════════════════════════════════════════════════════════

export interface ExcelColumn {
  header: string
  key: string
  /** عرض ستون (پیکسل) — اختیاری */
  width?: number
  /** نوع داده: text, number, currency */
  type?: 'text' | 'number' | 'currency'
  /** align: right, left, center */
  align?: 'right' | 'left' | 'center'
}

export interface ExcelSection {
  /** عنوان بخش (اختیاری — اگر باشد، به‌عنوان ردیف عنوان نمایش داده می‌شود) */
  title?: string
  /** ستون‌های این بخش */
  columns: ExcelColumn[]
  /** داده‌های این بخش */
  rows: any[]
  /** آیا این بخش subtotal دارد؟ */
  subtotalRow?: { label: string; values: Record<string, number> }
}

/**
 * exportToExcel — تولید فایل Excel واقعی با چند بخش
 *
 * @param filename نام فایل (بدون پسوند)
 * @param sections بخش‌های مختلف گزارش
 * @param reportTitle عنوان کلی گزارش (اختیاری)
 * @param reportSubtitle زیرعنوان (مثلاً بازه تاریخ)
 */
export function exportToExcel(
  filename: string,
  sections: ExcelSection[],
  reportTitle?: string,
  reportSubtitle?: string
) {
  // ★ ساخت HTML table با استایل‌های Excel
  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8">
      <!--[if gte mso 9]><xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>گزارش</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
                <x:RightToLeft/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml><![endif]-->
      <style>
        @page { margin: 1cm; size: A4 landscape; }
        body { font-family: Tahoma, Arial, sans-serif; font-size: 11pt; direction: rtl; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #999; padding: 4px 8px; }
        th { background-color: #4c1d95; color: white; font-weight: bold; text-align: center; }
        .report-title { font-size: 16pt; font-weight: bold; color: #4c1d95; text-align: center; margin: 10px 0; }
        .report-subtitle { font-size: 10pt; color: #666; text-align: center; margin-bottom: 15px; }
        .section-title { background-color: #ede9fe; color: #4c1d95; font-weight: bold; font-size: 12pt; padding: 6px 8px; border: 1px solid #999; }
        .section-spacer { height: 15px; }
        .subtotal-row { background-color: #f3e8ff; font-weight: bold; }
        .total-row { background-color: #ddd6fe; font-weight: bold; font-size: 12pt; }
        .number-cell { text-align: left; font-family: 'Courier New', monospace; direction: ltr; }
        .currency-cell { text-align: left; font-family: 'Courier New', monospace; direction: ltr; }
        .text-cell-right { text-align: right; }
        .text-cell-center { text-align: center; }
        .text-cell-left { text-align: left; }
        .positive { color: #059669; }
        .negative { color: #dc2626; }
      </style>
    </head>
    <body>
  `

  // ★ عنوان گزارش
  if (reportTitle) {
    html += `<div class="report-title">${escapeHtml(reportTitle)}</div>`
  }
  if (reportSubtitle) {
    html += `<div class="report-subtitle">${escapeHtml(reportSubtitle)}</div>`
  }

  // ★ هر بخش
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]

    if (i > 0) {
      html += `<div class="section-spacer"></div>`
    }

    if (section.title) {
      html += `<div class="section-title">${escapeHtml(section.title)}</div>`
    }

    html += `<table>`

    // ★ هدر جدول
    html += `<tr>`
    for (const col of section.columns) {
      const widthStyle = col.width ? `width: ${col.width}px;` : ''
      html += `<th style="${widthStyle}">${escapeHtml(col.header)}</th>`
    }
    html += `</tr>`

    // ★ ردیف‌های داده
    for (const row of section.rows) {
      html += `<tr>`
      for (const col of section.columns) {
        const value = row[col.key]
        const isNegative = typeof value === 'number' && value < 0
        const negativeClass = isNegative ? ' negative' : ''
        const positiveClass = (col.type === 'currency' || col.type === 'number') && typeof value === 'number' && value > 0 ? ' positive' : ''

        let cellClass = 'text-cell-right'
        let displayValue = ''

        if (value === null || value === undefined || value === '') {
          displayValue = '—'
          cellClass = 'text-cell-center'
        } else if (col.type === 'currency' && typeof value === 'number') {
          displayValue = formatNumberForExcel(value)
          cellClass = 'currency-cell'
        } else if (col.type === 'number' && typeof value === 'number') {
          displayValue = formatNumberForExcel(value)
          cellClass = 'number-cell'
        } else {
          displayValue = escapeHtml(String(value))
          cellClass = `text-cell-${col.align || 'right'}`
        }

        html += `<td class="${cellClass}${negativeClass}${positiveClass}">${displayValue}</td>`
      }
      html += `</tr>`
    }

    // ★ ردیف subtotal
    if (section.subtotalRow) {
      html += `<tr class="subtotal-row">`
      for (const col of section.columns) {
        const subtotalValue = section.subtotalRow.values[col.key]
        if (subtotalValue !== undefined && typeof subtotalValue === 'number') {
          const isNegative = subtotalValue < 0
          const negativeClass = isNegative ? ' negative' : ''
          html += `<td class="currency-cell${negativeClass}">${formatNumberForExcel(subtotalValue)}</td>`
        } else if (col.key === Object.keys(section.columns)[0]) {
          html += `<td class="text-cell-right">${escapeHtml(section.subtotalRow.label)}</td>`
        } else {
          html += `<td></td>`
        }
      }
      html += `</tr>`
    }

    html += `</table>`
  }

  html += `</body></html>`

  // ★ دانلود فایل
  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.xls`
  a.click()
  URL.revokeObjectURL(url)
}

// ═══════════════════════════════════════════════════════════════
//  ۲. Print to PDF — چاپ با استایل مخصوص PDF
// ═══════════════════════════════════════════════════════════════

/**
 * printReport — باز کردن پنجره چاپ با محتوای گزارش و استایل مخصوص
 *
 * @param title عنوان گزارش
 * @param subtitle زیرعنوان (مثلاً بازه تاریخ)
 * @param contentHtml محتوای HTML گزارش
 */
export function printReport(
  title: string,
  subtitle: string,
  contentHtml: string
) {
  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) {
    alert('لطفاً popup blocker را غیرفعال کنید تا بتوان گزارش را چاپ کرد.')
    return
  }

  const html = `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(title)}</title>
      <style>
        @page { margin: 1.5cm; size: A4; }
        * { box-sizing: border-box; }
        body {
          font-family: Tahoma, 'Segoe UI', Arial, sans-serif;
          font-size: 10pt;
          color: #1f2937;
          line-height: 1.6;
          margin: 0;
          padding: 20px;
          direction: rtl;
        }
        .report-header {
          text-align: center;
          margin-bottom: 25px;
          padding-bottom: 15px;
          border-bottom: 2px solid #4c1d95;
        }
        .report-title {
          font-size: 18pt;
          font-weight: bold;
          color: #4c1d95;
          margin: 0 0 8px 0;
        }
        .report-subtitle {
          font-size: 10pt;
          color: #666;
          margin: 0;
        }
        .report-meta {
          font-size: 9pt;
          color: #999;
          margin-top: 8px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
          font-size: 9pt;
        }
        th, td {
          border: 1px solid #d1d5db;
          padding: 6px 8px;
          text-align: right;
        }
        th {
          background-color: #4c1d95 !important;
          color: white !important;
          font-weight: bold;
          text-align: center;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .section-title {
          background-color: #ede9fe !important;
          color: #4c1d95;
          font-weight: bold;
          font-size: 11pt;
          padding: 8px 12px;
          margin: 20px 0 10px 0;
          border-radius: 4px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .subtotal-row {
          background-color: #f3e8ff !important;
          font-weight: bold;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .total-row {
          background-color: #ddd6fe !important;
          font-weight: bold;
          font-size: 11pt;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .number-cell, .currency-cell {
          text-align: left;
          font-family: 'Courier New', monospace;
          direction: ltr;
        }
        .positive { color: #059669; }
        .negative { color: #dc2626; }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin: 15px 0;
        }
        .kpi-card {
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 10px;
          text-align: center;
        }
        .kpi-card.emerald { background-color: #ecfdf5 !important; border-color: #10b981; }
        .kpi-card.blue { background-color: #eff6ff !important; border-color: #3b82f6; }
        .kpi-card.orange { background-color: #fff7ed !important; border-color: #f97316; }
        .kpi-card.red { background-color: #fef2f2 !important; border-color: #ef4444; }
        .kpi-title { font-size: 8pt; color: #666; margin-bottom: 4px; }
        .kpi-value { font-size: 13pt; font-weight: bold; font-family: 'Courier New', monospace; }
        .kpi-subtitle { font-size: 7pt; color: #999; margin-top: 2px; }
        .summary-box {
          background-color: #f9fafb !important;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 12px;
          margin: 15px 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .footer {
          margin-top: 30px;
          padding-top: 10px;
          border-top: 1px solid #d1d5db;
          text-align: center;
          font-size: 8pt;
          color: #999;
        }
        .print-button {
          background: #4c1d95;
          color: white;
          border: none;
          padding: 10px 20px;
          font-size: 11pt;
          border-radius: 6px;
          cursor: pointer;
          margin: 10px 0;
          font-family: Tahoma;
        }
        .print-button:hover { background: #6d28d9; }
        @media print {
          .print-button { display: none; }
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="report-header">
        <h1 class="report-title">${escapeHtml(title)}</h1>
        <p class="report-subtitle">${escapeHtml(subtitle)}</p>
        <p class="report-meta">تاریخ چاپ: ${new Date().toLocaleDateString('fa-IR')} ${new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</p>
      </div>
      <div style="text-align: center; margin-bottom: 15px;">
        <button class="print-button" onclick="window.print()">🖨️ چاپ / ذخیره به‌عنوان PDF</button>
      </div>
      ${contentHtml}
      <div class="footer">
        این گزارش توسط سیستم ShopAccounting تولید شده است.
      </div>
      <script>
        // ★ خودکار چاپ بعد از ۵۰۰ میلی‌ثانیه
        setTimeout(function() {
          try { window.print() } catch(e) {}
        }, 500)
      </script>
    </body>
    </html>
  `

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

// ═══════════════════════════════════════════════════════════════
//  ۳. Helper functions
// ═══════════════════════════════════════════════════════════════

function escapeHtml(text: string): string {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatNumberForExcel(num: number): string {
  if (num === 0) return '۰'
  // ★ برای Excel، اعداد را با فرمت انگلیسی بگذاریم تا Excel بتواند روی آن‌ها محاسبات انجام دهد
  // ولی برای نمایش فارسی، آن‌ها را در یک cell جداگانه می‌گذاریم
  const isNegative = num < 0
  const absNum = Math.abs(num)
  const formatted = absNum.toLocaleString('en-US')
  return isNegative ? `(${formatted})` : formatted
}

/**
 * formatNumberFa — نمایش عدد با ارقام فارسی (برای نمایش در UI)
 */
export function formatNumberFa(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—'
  return num.toLocaleString('fa-IR')
}

/**
 * formatRialFa — نمایش مبلغ ریالی با ارقام فارسی + واحد
 */
export function formatRialFa(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—'
  return num.toLocaleString('fa-IR') + ' ریال'
}

/**
 * formatPercentFa — نمایش درصد با ارقام فارسی
 */
export function formatPercentFa(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—'
  return num.toFixed(2) + '٪'
}
