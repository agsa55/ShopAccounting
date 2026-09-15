'use client'

// ============================================================================
// src/components/accounting/ledger-tab.tsx — General Ledger Tab
// ShopAccounting v9.4 — چاپ کاملاً ایزوله با پنجره مستقل
// ============================================================================
// ★★★ v9.4:
//   - چاپ در یک پنجره کاملاً جدید و مستقل (بدون هیچ وابستگی به Layout)
//   - HTML خالص با استایل‌های inline برای تضمین نمایش صحیح در همه مرورگرها
//   - سربرگ رسمی + جدول استاندارد A4 + محل امضای سه‌گانه
//   - رفع باگ یک روز عقب افتادن تاریخ
//   - پشتیبانی کامل از حالت آفلاین
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { getCachedJournalEntries, getCachedAccounts } from '@/lib/offline-db'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  FileText, Printer, Loader2, WifiOff, X, BookOpen,
  Calendar, TrendingUp,
} from 'lucide-react'
import { PersianDatePicker, formatJalaliLong } from '@/components/ui/persian-date-picker'
import { useToast } from '@/hooks/use-toast'

// ─── Types ────────────────────────────────────────────────────

interface LedgerRow {
  entryId: string
  number: string
  date: string
  description: string
  lineDescription?: string
  debit: number
  credit: number
  balance: number
}

interface Account {
  id: string
  code: string
  name: string
  type: string
}

// ─── Helpers ──────────────────────────────────────────────────

function formatRial(num: number): string {
  return (num || 0).toLocaleString('fa-IR')
}

// ★★★ رفع باگ یک روز عقب افتادن تاریخ (Timezone Safe)
const getLocalDateTs = (dateStr: string | null | undefined): number => {
  if (!dateStr) return 0
  const dateOnly = dateStr.split('T')[0]
  const [year, month, day] = dateOnly.split('-').map(Number)
  return new Date(year, month - 1, day).getTime()
}

// ═══════════════════════════════════════════════════════════════
// Main Component — LedgerTab
// ═══════════════════════════════════════════════════════════════

export function LedgerTab() {
  const { toast } = useToast()
  const isOnline = useAppStore((s) => s.isOnline)

  const [entries, setEntries] = useState<any[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [fromDate, setFromDate] = useState<string | null>(null)
  const [toDate, setToDate] = useState<string | null>(null)

  // ═══════════════════════════════════════════════════════════
  // Load Data
  // ═══════════════════════════════════════════════════════════

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (!isOnline) {
        const [cachedEntries, cachedAccounts] = await Promise.all([
          getCachedJournalEntries(),
          getCachedAccounts(),
        ])
        setEntries(cachedEntries)
        setAccounts(cachedAccounts as Account[])
        setLoading(false)
        return
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const [entriesRes, accountsRes] = await Promise.all([
        fetch('/api/journal-entries?limit=9999', {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        }),
        fetch('/api/accounts', {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        }),
      ])

      if (entriesRes.ok) {
        const data = await entriesRes.json()
        if (data.success && data.data) {
          const list = data.data.journalEntries || data.data.entries || data.data || []
          setEntries(Array.isArray(list) ? list : [])
        }
      }

      if (accountsRes.ok) {
        const data = await accountsRes.json()
        if (data.success && data.data) {
          const accList = data.data.accounts || data.data || []
          setAccounts(Array.isArray(accList) ? accList : [])
        }
      }
    } catch (error) {
      console.warn('[LedgerTab] Fetch failed, using cache')
      const [cachedEntries, cachedAccounts] = await Promise.all([
        getCachedJournalEntries(),
        getCachedAccounts(),
      ])
      setEntries(cachedEntries)
      setAccounts(cachedAccounts as Account[])
    } finally {
      setLoading(false)
    }
  }, [isOnline])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ═══════════════════════════════════════════════════════════
  // هندلرهای تاریخ
  // ═══════════════════════════════════════════════════════════
  const handleFromDateChange = (iso: string | null) => {
    if (iso && toDate && getLocalDateTs(iso) > getLocalDateTs(toDate)) setToDate(iso)
    setFromDate(iso)
  }

  const handleToDateChange = (iso: string | null) => {
    if (iso && fromDate && getLocalDateTs(iso) < getLocalDateTs(fromDate)) setFromDate(iso)
    setToDate(iso)
  }

  // ═══════════════════════════════════════════════════════════
  // محاسبات
  // ═══════════════════════════════════════════════════════════

  const ledgerRows = useMemo(() => {
    if (!selectedAccountId) return []
    const rows: Omit<LedgerRow, 'balance'>[] = []

    for (const entry of entries) {
      if (entry.status === 'CANCELLED') continue
      const lines = entry.lines || entry.items || []
      for (const line of lines) {
        if (line.accountId === selectedAccountId) {
          rows.push({
            entryId: entry.id,
            number: entry.entryNumber || entry.number || '—',
            date: entry.date,
            description: entry.description,
            lineDescription: line.description,
            debit: line.debit || 0,
            credit: line.credit || 0,
          })
        }
      }
    }

    rows.sort((a, b) => getLocalDateTs(a.date) - getLocalDateTs(b.date))

    let runningBalance = 0
    return rows.map(row => {
      runningBalance += row.debit - row.credit
      return { ...row, balance: runningBalance }
    })
  }, [entries, selectedAccountId])

  const filteredLedgerRows = useMemo(() => {
    if (!fromDate && !toDate) return ledgerRows
    const fromDateTs = fromDate ? getLocalDateTs(fromDate) : 0
    const toDateTs = toDate ? getLocalDateTs(toDate) + 86400000 : Infinity

    return ledgerRows.filter(row => {
      const rowDateTs = getLocalDateTs(row.date)
      return rowDateTs >= fromDateTs && rowDateTs <= toDateTs
    })
  }, [ledgerRows, fromDate, toDate])

  const openingBalance = useMemo(() => {
    if (!fromDate) return 0
    const fromDateTs = getLocalDateTs(fromDate)
    return ledgerRows
      .filter(r => getLocalDateTs(r.date) < fromDateTs)
      .reduce((s, r) => s + (r.debit - r.credit), 0)
  }, [ledgerRows, fromDate])

  const closingBalance = filteredLedgerRows.length > 0
    ? filteredLedgerRows[filteredLedgerRows.length - 1].balance
    : openingBalance

  const selectedAccount = accounts.find(a => a.id === selectedAccountId)

  // ═══════════════════════════════════════════════════════════
  // ★★★ v9.4: چاپ در پنجره مستقل (۱۰۰٪ ایزوله)
  // ═══════════════════════════════════════════════════════════
  const handlePrint = () => {
    if (!selectedAccount) return

    // محاسبه جمع‌ها
    const totalDebit = filteredLedgerRows.reduce((s, r) => s + r.debit, 0)
    const totalCredit = filteredLedgerRows.reduce((s, r) => s + r.credit, 0)
    const periodText = fromDate || toDate
      ? `از ${fromDate ? formatJalaliLong(fromDate) : 'ابتدا'} تا ${toDate ? formatJalaliLong(toDate) : 'انتها'}`
      : 'کلیه سوابق'

    // ساخت ردیف‌های جدول
    let rowsHtml = ''

    // مانده اول دوره (در صورت وجود فیلتر تاریخ)
    if (openingBalance !== 0 && (fromDate || toDate)) {
      rowsHtml += `
        <tr style="background:#f3f4f6; font-weight:bold;">
          <td colspan="5" style="border:1px solid #000; padding:8px; text-align:center;">مانده اول دوره</td>
          <td style="border:1px solid #000; padding:8px; text-align:center;">
            ${formatRial(Math.abs(openingBalance))} ${openingBalance >= 0 ? 'بدهکار' : 'بستانکار'}
          </td>
        </tr>
      `
    }

    // ردیف‌های تراکنش
    filteredLedgerRows.forEach(row => {
      rowsHtml += `
        <tr>
          <td style="border:1px solid #000; padding:6px;">${formatJalaliLong(row.date)}</td>
          <td style="border:1px solid #000; padding:6px; font-family:monospace;">${row.number}</td>
          <td style="border:1px solid #000; padding:6px;">${row.lineDescription || row.description || '—'}</td>
          <td style="border:1px solid #000; padding:6px; text-align:left;">${row.debit > 0 ? formatRial(row.debit) : '—'}</td>
          <td style="border:1px solid #000; padding:6px; text-align:left;">${row.credit > 0 ? formatRial(row.credit) : '—'}</td>
          <td style="border:1px solid #000; padding:6px; text-align:left; font-weight:bold;">
            ${formatRial(Math.abs(row.balance))} ${row.balance >= 0 ? 'بد' : 'بس'}
          </td>
        </tr>
      `
    })

    // ردیف جمع کل
    rowsHtml += `
      <tr style="background:#e5e7eb; font-weight:bold;">
        <td colspan="3" style="border:1px solid #000; padding:8px; text-align:center;">جمع کل گردش حساب</td>
        <td style="border:1px solid #000; padding:8px; text-align:left;">${formatRial(totalDebit)}</td>
        <td style="border:1px solid #000; padding:8px; text-align:left;">${formatRial(totalCredit)}</td>
        <td style="border:1px solid #000; padding:8px; text-align:left;">
          ${formatRial(Math.abs(closingBalance))} ${closingBalance >= 0 ? 'بد' : 'بس'}
        </td>
      </tr>
    `

    // HTML کامل گزارش
    const printContent = `
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>گزارش دفتر کل - ${selectedAccount.name}</title>
        <style>
          @page {
            size: A4;
            margin: 15mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: Tahoma, Arial, sans-serif;
            font-size: 12px;
            color: #000;
            direction: rtl;
            margin: 0;
            padding: 0;
            background: #fff;
          }
          .header {
            text-align: center;
            border-bottom: 3px double #000;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .header h1 {
            font-size: 20px;
            margin: 0 0 10px 0;
            font-weight: bold;
          }
          .header .account-name {
            font-size: 16px;
            font-weight: bold;
            margin: 5px 0;
          }
          .header .account-code {
            color: #555;
            font-size: 13px;
          }
          .header .period {
            font-size: 12px;
            color: #333;
            margin-top: 8px;
          }
          .header .print-date {
            font-size: 10px;
            color: #666;
            margin-top: 5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            page-break-inside: auto;
          }
          thead {
            background: #f3f4f6;
          }
          th {
            border: 1px solid #000;
            padding: 8px;
            text-align: right;
            font-weight: bold;
            font-size: 11px;
            background: #e5e7eb;
          }
          td {
            border: 1px solid #000;
            padding: 6px;
            font-size: 11px;
            vertical-align: middle;
          }
          tr {
            page-break-inside: avoid;
          }
          .signatures {
            margin-top: 60px;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
          }
          .signature-box {
            text-align: center;
            width: 30%;
          }
          .signature-box .title {
            font-weight: bold;
            margin-bottom: 50px;
            font-size: 12px;
          }
          .signature-box .line {
            border-top: 1px solid #000;
            width: 150px;
            margin: 0 auto;
            padding-top: 5px;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 9px;
            color: #666;
            border-top: 1px solid #ccc;
            padding-top: 10px;
          }
          .empty-message {
            text-align: center;
            padding: 40px;
            color: #666;
            font-size: 14px;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>گزارش دفتر کل حساب</h1>
          <div class="account-name">${selectedAccount.name}</div>
          <div class="account-code">کد حساب: ${selectedAccount.code}</div>
          <div class="period">${periodText}</div>
          <div class="print-date">تاریخ تهیه گزارش: ${new Date().toLocaleDateString('fa-IR')}</div>
        </div>

        ${filteredLedgerRows.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th style="width:13%;">تاریخ</th>
                <th style="width:12%;">شماره سند</th>
                <th>شرح</th>
                <th style="width:13%;">بدهکار (ریال)</th>
                <th style="width:13%;">بستانکار (ریال)</th>
                <th style="width:13%;">مانده (ریال)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        ` : `
          <div class="empty-message">
            در بازه زمانی انتخاب‌شده تراکنشی وجود ندارد
          </div>
        `}

        <div class="signatures">
          <div class="signature-box">
            <div class="title">تهیه کننده</div>
            <div class="line"></div>
          </div>
          <div class="signature-box">
            <div class="title">تایید کننده</div>
            <div class="line"></div>
          </div>
          <div class="signature-box">
            <div class="title">مدیر مالی</div>
            <div class="line"></div>
          </div>
        </div>

        <div class="footer">
          سیستم حسابداری فروشگاه — گزارش تولید شده در ${new Date().toLocaleString('fa-IR')}
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          }
          window.onafterprint = function() {
            setTimeout(function() {
              window.close();
            }, 500);
          }
        </script>
      </body>
      </html>
    `

    // باز کردن پنجره جدید
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) {
      toast({
        title: 'خطا',
        description: 'مرورگر شما پنجره پاپ‌آپ را مسدود کرده است. لطفاً اجازه پاپ‌آپ را برای این سایت فعال کنید.',
        variant: 'destructive',
      })
      return
    }

    // نوشتن HTML در پنجره جدید
    printWindow.document.open()
    printWindow.document.write(printContent)
    printWindow.document.close()
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="space-y-4 p-3 sm:p-6" dir="rtl">
      {/* بنر آفلاین */}
      {!isOnline && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-800">
            <strong>حالت آفلاین فعال است.</strong> دفتر کل بر اساس آخرین داده‌های ذخیره‌شده محاسبه شده است.
          </div>
        </div>
      )}

      {/* Toolbar */}
      <Card className="border-gray-200">
        <CardContent className="p-3 sm:p-4">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-end">
              <div className="flex-1">
                <Label className="text-xs text-gray-600 mb-1 block">انتخاب حساب:</Label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => {
                    setSelectedAccountId(e.target.value)
                    setFromDate(null)
                    setToDate(null)
                  }}
                  className="w-full text-xs h-9 border border-gray-200 rounded px-2 bg-white"
                >
                  <option value="">— انتخاب کنید —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>
              {selectedAccountId && (
                <Button size="sm" variant="outline" className="text-xs h-9" onClick={handlePrint}>
                  <Printer className="w-3.5 h-3.5 ml-1" /> چاپ گزارش
                </Button>
              )}
            </div>

            {selectedAccountId && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                <div>
                  <PersianDatePicker
                    value={fromDate}
                    onChange={handleFromDateChange}
                    placeholder="از تاریخ (اختیاری)"
                    label="از تاریخ"
                  />
                </div>
                <div>
                  <PersianDatePicker
                    value={toDate}
                    onChange={handleToDateChange}
                    placeholder="تا تاریخ (اختیاری)"
                    label="تا تاریخ"
                  />
                </div>
                <div className="flex items-end">
                  {(fromDate || toDate) && (
                    <Button size="sm" variant="ghost" className="text-xs h-9 w-full"
                      onClick={() => { setFromDate(null); setToDate(null) }}
                    >
                      <X className="w-3.5 h-3.5 ml-1" /> پاک کردن فیلتر
                    </Button>
                  )}
                </div>
              </div>
            )}

            {selectedAccount && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-xs text-blue-800">
                  در حال مشاهده دفتر کل حساب <strong>{selectedAccount.code} — {selectedAccount.name}</strong>
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* کارت‌های مانده */}
      {selectedAccountId && filteredLedgerRows.length > 0 && (
        <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
          <div className="relative overflow-hidden rounded-md border border-blue-200 bg-gradient-to-br from-blue-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-[8px] sm:text-[9px] font-medium text-blue-600 truncate">مانده اول دوره</span>
              <Calendar className="w-2.5 h-2.5 text-blue-400 shrink-0" />
            </div>
            <div className={`text-[10px] sm:text-xs font-bold ${openingBalance >= 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              {formatRial(Math.abs(openingBalance))}
              <span className="text-[8px] font-normal mr-1">{openingBalance >= 0 ? 'بدهکار' : 'بستانکار'}</span>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-md border border-purple-200 bg-gradient-to-br from-purple-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-[8px] sm:text-[9px] font-medium text-purple-600 truncate">مانده آخر دوره</span>
              <TrendingUp className="w-2.5 h-2.5 text-purple-400 shrink-0" />
            </div>
            <div className={`text-[10px] sm:text-xs font-bold ${closingBalance >= 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              {formatRial(Math.abs(closingBalance))}
              <span className="text-[8px] font-normal mr-1">{closingBalance >= 0 ? 'بدهکار' : 'بستانکار'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Loading / Empty */}
      {loading ? (
        <Card className="border-gray-200">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-gray-500">در حال بارگذاری دفتر کل...</p>
          </CardContent>
        </Card>
      ) : !selectedAccountId ? (
        <Card className="border-dashed border-gray-300">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <FileText className="w-12 h-12 text-gray-300" />
            <h3 className="text-base font-medium text-gray-600">یک حساب را برای مشاهده دفتر کل انتخاب کنید</h3>
            <p className="text-xs text-gray-400">از لیست بالا یک حساب را انتخاب کنید تا تمام تراکنش‌های آن نمایش داده شود</p>
          </CardContent>
        </Card>
      ) : filteredLedgerRows.length === 0 ? (
        <Card className="border-dashed border-gray-300">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <FileText className="w-12 h-12 text-gray-300" />
            <h3 className="text-base font-medium text-gray-600">
              {ledgerRows.length === 0
                ? 'تراکنشی برای این حساب ثبت نشده است'
                : 'در بازه زمانی انتخاب‌شده تراکنشی وجود ندارد'}
            </h3>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* جدول دسکتاپ */}
          <div className="hidden lg:block">
            <Card className="border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-right text-xs w-28">تاریخ</TableHead>
                      <TableHead className="text-right text-xs w-24">شماره سند</TableHead>
                      <TableHead className="text-right text-xs">شرح</TableHead>
                      <TableHead className="text-right text-xs w-32">بدهکار</TableHead>
                      <TableHead className="text-right text-xs w-32">بستانکار</TableHead>
                      <TableHead className="text-right text-xs w-32">مانده</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openingBalance !== 0 && (fromDate || toDate) && (
                      <TableRow className="bg-blue-50/50">
                        <TableCell colSpan={5} className="text-xs text-blue-700 font-medium">مانده اول دوره</TableCell>
                        <TableCell className={`text-xs font-bold ${openingBalance >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {formatRial(Math.abs(openingBalance))} {openingBalance >= 0 ? 'بد' : 'بس'}
                        </TableCell>
                      </TableRow>
                    )}

                    {filteredLedgerRows.map((row) => (
                      <TableRow key={`${row.entryId}-${row.date}`} className="hover:bg-gray-50/50">
                        <TableCell className="text-xs">{formatJalaliLong(row.date)}</TableCell>
                        <TableCell className="text-xs font-mono">{row.number}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">
                          {row.lineDescription || row.description || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-red-600">
                          {row.debit > 0 ? formatRial(row.debit) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-emerald-600">
                          {row.credit > 0 ? formatRial(row.credit) : '—'}
                        </TableCell>
                        <TableCell className={`text-xs font-bold ${row.balance >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {formatRial(Math.abs(row.balance))} {row.balance >= 0 ? 'بد' : 'بس'}
                        </TableCell>
                      </TableRow>
                    ))}

                    <TableRow className="bg-blue-50 font-bold">
                      <TableCell colSpan={3} className="text-xs text-blue-800">جمع کل</TableCell>
                      <TableCell className="text-xs text-red-700">
                        {formatRial(filteredLedgerRows.reduce((s, r) => s + r.debit, 0))}
                      </TableCell>
                      <TableCell className="text-xs text-emerald-700">
                        {formatRial(filteredLedgerRows.reduce((s, r) => s + r.credit, 0))}
                      </TableCell>
                      <TableCell className={`text-xs ${closingBalance >= 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {formatRial(Math.abs(closingBalance))} {closingBalance >= 0 ? 'بد' : 'بس'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>

          {/* کارت‌های موبایل */}
          <div className="lg:hidden space-y-2">
            {openingBalance !== 0 && (fromDate || toDate) && (
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="p-3">
                  <div className="text-xs font-medium text-blue-800 mb-1">مانده اول دوره</div>
                  <div className={`text-sm font-bold ${openingBalance >= 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {formatRial(Math.abs(openingBalance))} {openingBalance >= 0 ? 'بدهکار' : 'بستانکار'}
                  </div>
                </CardContent>
              </Card>
            )}

            {filteredLedgerRows.map((row, idx) => (
              <Card key={`${row.entryId}-${idx}`} className="border-gray-200">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-2 flex-wrap gap-1">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-gray-100 text-gray-600 text-[9px] font-mono">{row.number}</Badge>
                      <span className="text-[10px] text-gray-500">{formatJalaliLong(row.date)}</span>
                    </div>
                    <span className={`text-xs font-bold ${row.balance >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatRial(Math.abs(row.balance))} {row.balance >= 0 ? 'بد' : 'بس'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                    {row.lineDescription || row.description || 'بدون شرح'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`rounded p-1.5 ${row.debit > 0 ? 'bg-red-50 border border-red-100' : 'bg-gray-50 border border-gray-100'}`}>
                      <div className="text-[9px] text-red-600">بدهکار</div>
                      <div className={`text-[11px] font-bold ${row.debit > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                        {row.debit > 0 ? formatRial(row.debit) : '—'}
                      </div>
                    </div>
                    <div className={`rounded p-1.5 ${row.credit > 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-gray-50 border border-gray-100'}`}>
                      <div className="text-[9px] text-emerald-600">بستانکار</div>
                      <div className={`text-[11px] font-bold ${row.credit > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                        {row.credit > 0 ? formatRial(row.credit) : '—'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="p-3">
                <div className="text-xs font-bold text-blue-800 mb-2">جمع کل</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-red-100 rounded p-2 text-center">
                    <div className="text-red-600 text-[9px]">بدهکار</div>
                    <div className="font-bold text-red-700">
                      {formatRial(filteredLedgerRows.reduce((s, r) => s + r.debit, 0))}
                    </div>
                  </div>
                  <div className="bg-emerald-100 rounded p-2 text-center">
                    <div className="text-emerald-600 text-[9px]">بستانکار</div>
                    <div className="font-bold text-emerald-700">
                      {formatRial(filteredLedgerRows.reduce((s, r) => s + r.credit, 0))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

export default LedgerTab