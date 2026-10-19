'use client'

// ============================================================================
// src/components/accounting/ledger-tab.tsx — General Ledger Tab
// ShopAccounting v10.0 — Fiscal Year Aware + Standard Opening Balance
// ============================================================================
// ★★★ v10.0:
//   - اتصال به selectedFiscalYearId از useAppStore
//   - ارسال fiscalYearId / allYears به /api/reports/ledger
//   - حذف هدر ناامن x-tenant-id و استفاده از Authorization
//   - نمایش نام سال مالی، بازه سال مالی و warning
//   - ریست فیلتر تاریخ با تغییر سال مالی
//   - clamp تاریخ‌ها داخل بازه سال مالی
//   - پشتیبانی آفلاین از کش اسناد با هشدار مناسب
//   - چاپ مستقل و ایزوله
//   - اسناد synthetic/نمایشی در محاسبه آفلاین لحاظ نمی‌شوند
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { getCachedJournalEntries, getCachedAccounts } from '@/lib/offline-db'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  FileText,
  Printer,
  Loader2,
  WifiOff,
  X,
  BookOpen,
  Calendar,
  TrendingUp,
  AlertCircle,
} from 'lucide-react'
import {
  PersianDatePicker,
  formatJalaliLong,
} from '@/components/ui/persian-date-picker'
import { useToast } from '@/hooks/use-toast'

// ─── Types ────────────────────────────────────────────────────

interface LedgerRow {
  journalEntryId: string
  journalNumber: string
  date: string
  description: string
  lineDescription?: string | null
  debit: number
  credit: number
  balance: number
  balanceLabel?: string
}

interface LedgerData {
  account: {
    id: string
    code: string
    name: string
    type: string
  }
  openingBalance: number
  openingBalanceLabel: string
  totalDebit: number
  totalCredit: number
  closingBalance: number
  closingBalanceLabel: string
  dateRange: {
    from: string | null
    to: string | null
  }
  fiscalYearRange: {
    from: string | null
    to: string | null
  } | null
  rows: LedgerRow[]
}

interface Account {
  id: string
  code: string
  name: string
  type: string
}

interface FiscalYearInfo {
  id: string | null
  name: string | null
  startDate: string | null
  endDate: string | null
  isActive: boolean
  isClosed: boolean
}

// ─── Constants ────────────────────────────────────────────────

const OFFLINE_LEDGER_WARNING =
  'دفتر کل آفلاین بر اساس آخرین اسناد کش‌شده محاسبه شده است. ممکن است مانده افتتاحیه کامل نباشد و فقط برای مشاهده است.'

const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

// ─── Helpers ──────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}

  const token = localStorage.getItem('token')

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function formatRial(num: number): string {
  return (num || 0).toLocaleString('fa-IR')
}

function normalizeStatus(value: any): string {
  return String(value || '')
    .toLowerCase()
    .trim()
}

function isPostedStatus(value: any): boolean {
  const status = normalizeStatus(value)
  return status === 'posted' || status === 'confirmed'
}

function toDateOnly(value: any): string | null {
  if (!value) return null

  const s = String(value).trim()
  if (!s) return null

  if (s.includes('T')) return s.split('T')[0]

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().split('T')[0]
  }

  return null
}

function dateTs(value: any): number {
  const iso = toDateOnly(value)
  if (!iso) return 0

  const [y, m, d] = iso.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return 0
  }

  return new Date(y, m - 1, d).getTime()
}

function printEscapeHtml(value: any): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ═══════════════════════════════════════════════════════════════
// Offline calculation
// ═══════════════════════════════════════════════════════════════

function computeLedgerFromCache(
  entries: any[],
  accounts: Account[],
  accountId: string,
  fromDate: string | null,
  toDate: string | null,
  fiscalYearId: string | null,
  allYears: boolean
): LedgerData | null {
  const account = accounts.find((a) => a.id === accountId)
  if (!account) return null

  const fromTs = fromDate ? dateTs(fromDate) : 0
  const toExclusiveTs = toDate ? dateTs(toDate) + 86400000 : Infinity

  const validEntries = entries
    .filter((entry: any) => {
      if (!entry) return false

      // اسناد نمایشی/ساختگی نباید در دفتر کل واقعی لحاظ شوند
      if (entry.isSynthetic === true) return false
      if (String(entry.id || '').startsWith('je-')) return false

      if (entry.isCancelled === true) return false
      if (normalizeStatus(entry.status) === 'cancelled') return false
      if (!isPostedStatus(entry.status)) return false

      return true
    })
    .sort((a: any, b: any) => dateTs(a.date) - dateTs(b.date))

  let openingBalance = 0

  if (fromDate) {
    for (const entry of validEntries) {
      const entryTs = dateTs(entry.date)
      if (entryTs >= fromTs) continue

      const lines = entry.lines || entry.items || []

      for (const line of lines) {
        if (String(line.accountId || '') === accountId) {
          openingBalance +=
            (Number(line.debit) || 0) - (Number(line.credit) || 0)
        }
      }
    }
  }

  const rows: LedgerRow[] = []
  let totalDebit = 0
  let totalCredit = 0
  let runningBalance = openingBalance

  for (const entry of validEntries) {
    const entryTs = dateTs(entry.date)

    if (entryTs < fromTs) continue
    if (entryTs >= toExclusiveTs) continue

    // فیلتر سال مالی فقط برای حرکات دوره
    if (!allYears && fiscalYearId) {
      if (
        entry.fiscalYearId &&
        String(entry.fiscalYearId) !== String(fiscalYearId)
      ) {
        continue
      }
    }

    const lines = entry.lines || entry.items || []

    for (const line of lines) {
      if (String(line.accountId || '') !== accountId) continue

      const debit = Number(line.debit) || 0
      const credit = Number(line.credit) || 0

      totalDebit += debit
      totalCredit += credit

      runningBalance += debit - credit

      rows.push({
        journalEntryId: entry.id,
        journalNumber: entry.entryNumber || entry.number || '—',
        date: entry.date,
        description: entry.description || '',
        lineDescription: line.description || null,
        debit: Math.round(debit),
        credit: Math.round(credit),
        balance: Math.round(runningBalance),
        balanceLabel:
          Math.abs(runningBalance) < 1
            ? '—'
            : runningBalance > 0
            ? `${Math.round(runningBalance).toLocaleString('fa-IR')} بد`
            : `${Math.abs(Math.round(runningBalance)).toLocaleString('fa-IR')} بس`,
      })
    }
  }

  const closingBalance = openingBalance + totalDebit - totalCredit

  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      type: String(account.type || '').toLowerCase(),
    },
    openingBalance: Math.round(openingBalance),
    openingBalanceLabel:
      Math.abs(openingBalance) < 1
        ? '—'
        : openingBalance > 0
        ? `${Math.round(openingBalance).toLocaleString('fa-IR')} بد`
        : `${Math.abs(Math.round(openingBalance)).toLocaleString('fa-IR')} بس`,
    totalDebit: Math.round(totalDebit),
    totalCredit: Math.round(totalCredit),
    closingBalance: Math.round(closingBalance),
    closingBalanceLabel:
      Math.abs(closingBalance) < 1
        ? '—'
        : closingBalance > 0
        ? `${Math.round(closingBalance).toLocaleString('fa-IR')} بد`
        : `${Math.abs(Math.round(closingBalance)).toLocaleString('fa-IR')} بس`,
    dateRange: {
      from: fromDate,
      to: toDate,
    },
    fiscalYearRange: null,
    rows,
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Component — LedgerTab
// ═══════════════════════════════════════════════════════════════

export function LedgerTab() {
  const { toast } = useToast()
  const isOnline = useAppStore((s) => s.isOnline)

  const storeSelectedFiscalYearId = useAppStore(
    (s: any) => s.selectedFiscalYearId
  ) as string | null | undefined

  const selectedFiscalYearId =
    storeSelectedFiscalYearId && storeSelectedFiscalYearId !== 'all'
      ? storeSelectedFiscalYearId
      : null

  const [allYears, setAllYears] = useState(
    storeSelectedFiscalYearId === 'all'
  )

  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')

  const [fromDate, setFromDate] = useState<string | null>(null)
  const [toDate, setToDate] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<LedgerData | null>(null)

  const [fiscalYearInfo, setFiscalYearInfo] =
    useState<FiscalYearInfo | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  useEffect(() => {
    if (storeSelectedFiscalYearId === 'all') {
      setAllYears(true)
    } else if (storeSelectedFiscalYearId) {
      setAllYears(false)
    }
  }, [storeSelectedFiscalYearId])

  // با تغییر سال مالی یا همه سنوات، فیلتر تاریخ ریست شود
  useEffect(() => {
    setFromDate(null)
    setToDate(null)
  }, [selectedFiscalYearId, allYears])

  const clampToFiscalYear = useCallback(
    (iso: string | null): string | null => {
      if (!iso) return null
      if (allYears) return iso

      const start = toDateOnly(fiscalYearInfo?.startDate)
      const end = toDateOnly(fiscalYearInfo?.endDate)

      if (start && iso < start) return start
      if (end && iso > end) return end

      return iso
    },
    [allYears, fiscalYearInfo?.startDate, fiscalYearInfo?.endDate]
  )

  const handleFromDateChange = (iso: string | null) => {
    const next = clampToFiscalYear(iso)

    if (!next) {
      setFromDate(null)
      return
    }

    if (toDate && next > toDate) {
      setToDate(next)
    }

    setFromDate(next)
  }

  const handleToDateChange = (iso: string | null) => {
    const next = clampToFiscalYear(iso)

    if (!next) {
      setToDate(null)
      return
    }

    if (fromDate && next < fromDate) {
      setFromDate(next)
    }

    setToDate(next)
  }

  const loadAccounts = useCallback(async () => {
    try {
      if (!isOnline) {
        const cachedAccounts = await getCachedAccounts()
        setAccounts((cachedAccounts as Account[]) || [])
        return
      }

      const res = await fetch('/api/accounts', {
        headers: getAuthHeaders(),
      })

      if (res.ok) {
        const json = await res.json()
        const list = json?.data?.accounts || json?.data || []
        if (Array.isArray(list)) {
          setAccounts(
            list.map((a: any) => ({
              id: String(a.id || ''),
              code: String(a.code || '—'),
              name: String(a.name || 'نامشخص'),
              type: String(a.type || '').toLowerCase(),
            }))
          )
        }
      }
    } catch (err) {
      console.warn('[LedgerTab] loadAccounts failed, trying cache', err)
      const cachedAccounts = await getCachedAccounts()
      setAccounts((cachedAccounts as Account[]) || [])
    }
  }, [isOnline])

  const fetchReport = useCallback(async () => {
    if (!selectedAccountId) {
      setData(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (!isOnline) {
        const [cachedEntries, cachedAccounts] = await Promise.all([
          getCachedJournalEntries(),
          getCachedAccounts(),
        ])

        const computed = computeLedgerFromCache(
          cachedEntries,
          cachedAccounts as Account[],
          selectedAccountId,
          fromDate,
          toDate,
          selectedFiscalYearId,
          allYears
        )

        setData(computed)
        setFiscalYearInfo(null)
        setWarning(OFFLINE_LEDGER_WARNING)
        return
      }

      const params = new URLSearchParams()
      params.set('accountId', selectedAccountId)

      if (fromDate) params.set('dateFrom', fromDate)
      if (toDate) params.set('dateTo', toDate)

      if (allYears) {
        params.set('allYears', 'true')
      } else if (selectedFiscalYearId) {
        params.set('fiscalYearId', selectedFiscalYearId)
      }

      const res = await fetch(`/api/reports/ledger?${params.toString()}`, {
        headers: getAuthHeaders(),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'خطا در دریافت دفتر کل')
      }

      const responseData: LedgerData = {
        ...json.data,
        rows: Array.isArray(json.data?.rows) ? json.data.rows : [],
      }

      setData(responseData)

      const fy = json.fiscalYear

      if (fy) {
        setFiscalYearInfo({
          id: fy.id || json.fiscalYearId || null,
          name: fy.name || json.fiscalYearName || null,
          startDate: fy.startDate || null,
          endDate: fy.endDate || null,
          isActive: Boolean(fy.isActive),
          isClosed: Boolean(fy.isClosed),
        })
      } else if (json.fiscalYearId) {
        setFiscalYearInfo({
          id: json.fiscalYearId,
          name: json.fiscalYearName || null,
          startDate: null,
          endDate: null,
          isActive: false,
          isClosed: false,
        })
      } else {
        setFiscalYearInfo(null)
      }

      let responseWarning: string | null = json.warning || null

      if (allYears) {
        responseWarning = responseWarning || ALL_YEARS_WARNING
      }

      setWarning(responseWarning)
    } catch (err: any) {
      console.error('[LedgerTab] fetchReport error:', err)
      setError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setLoading(false)
    }
  }, [
    isOnline,
    selectedAccountId,
    selectedFiscalYearId,
    allYears,
    fromDate,
    toDate,
  ])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

  const displayWarning = useMemo(() => {
    if (allYears) return ALL_YEARS_WARNING
    return warning
  }, [allYears, warning])

  // ═══════════════════════════════════════════════════════════
  // Print — isolated window
  // ═══════════════════════════════════════════════════════════

  const handlePrint = () => {
    if (!data || !data.account) {
      toast({
        title: 'خطا',
        description: 'داده‌ای برای چاپ وجود ندارد.',
        variant: 'destructive',
      })
      return
    }

    if (data.rows.length === 0 && data.openingBalance === 0 && data.closingBalance === 0) {
      toast({
        title: 'خطا',
        description: 'سندی برای چاپ وجود ندارد.',
        variant: 'destructive',
      })
      return
    }

    const fiscalText = allYears
      ? 'همه سنوات'
      : fiscalYearInfo?.name
      ? `سال مالی: ${fiscalYearInfo.name}`
      : selectedFiscalYearId
      ? 'سال مالی انتخابی'
      : 'بدون فیلتر سال مالی'

    const rangeFrom = data.dateRange?.from || fromDate
    const rangeTo = data.dateRange?.to || toDate

    const periodText =
      rangeFrom || rangeTo
        ? `از ${rangeFrom ? formatJalaliLong(rangeFrom) : 'ابتدا'} تا ${
            rangeTo ? formatJalaliLong(rangeTo) : 'انتها'
          }`
        : 'کلیه سوابق'

    let rowsHtml = ''

    if (Math.abs(data.openingBalance) >= 1) {
      rowsHtml += `
        <tr style="background:#f3f4f6; font-weight:bold;">
          <td colspan="5" style="border:1px solid #000; padding:8px; text-align:center;">مانده اول دوره</td>
          <td style="border:1px solid #000; padding:8px; text-align:left; font-weight:bold;">
            ${printEscapeHtml(data.openingBalanceLabel)}
          </td>
        </tr>
      `
    }

    data.rows.forEach((row) => {
      rowsHtml += `
        <tr>
          <td style="border:1px solid #000; padding:6px;">${printEscapeHtml(
            formatJalaliLong(row.date)
          )}</td>
          <td style="border:1px solid #000; padding:6px; font-family:monospace;">${printEscapeHtml(
            row.journalNumber
          )}</td>
          <td style="border:1px solid #000; padding:6px;">${printEscapeHtml(
            row.lineDescription || row.description || '—'
          )}</td>
          <td style="border:1px solid #000; padding:6px; text-align:left;">${
            row.debit > 0 ? printEscapeHtml(formatRial(row.debit)) : '—'
          }</td>
          <td style="border:1px solid #000; padding:6px; text-align:left;">${
            row.credit > 0 ? printEscapeHtml(formatRial(row.credit)) : '—'
          }</td>
          <td style="border:1px solid #000; padding:6px; text-align:left; font-weight:bold;">
            ${printEscapeHtml(row.balanceLabel || formatRial(Math.abs(row.balance)))}
          </td>
        </tr>
      `
    })

    rowsHtml += `
      <tr style="background:#e5e7eb; font-weight:bold;">
        <td colspan="3" style="border:1px solid #000; padding:8px; text-align:center;">جمع کل گردش حساب</td>
        <td style="border:1px solid #000; padding:8px; text-align:left;">${printEscapeHtml(
          formatRial(data.totalDebit)
        )}</td>
        <td style="border:1px solid #000; padding:8px; text-align:left;">${printEscapeHtml(
          formatRial(data.totalCredit)
        )}</td>
        <td style="border:1px solid #000; padding:8px; text-align:left;">${printEscapeHtml(
          data.closingBalanceLabel
        )}</td>
      </tr>
    `

    const printContent = `
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>گزارش دفتر کل - ${printEscapeHtml(data.account.name)}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          * { box-sizing: border-box; }
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
          .header h1 { font-size: 20px; margin: 0 0 10px 0; font-weight: bold; }
          .header .account-name { font-size: 16px; font-weight: bold; margin: 5px 0; }
          .header .account-code { color: #555; font-size: 13px; }
          .header .period { font-size: 12px; color: #333; margin-top: 8px; }
          .header .fiscal { font-size: 12px; color: #333; margin-top: 4px; font-weight: bold; }
          .header .warning { font-size: 11px; color: #b45309; margin-top: 6px; font-weight: bold; }
          .header .print-date { font-size: 10px; color: #666; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; page-break-inside: auto; }
          thead { background: #f3f4f6; }
          th { border: 1px solid #000; padding: 8px; text-align: right; font-weight: bold; font-size: 11px; background: #e5e7eb; }
          td { border: 1px solid #000; padding: 6px; font-size: 11px; vertical-align: middle; }
          tr { page-break-inside: avoid; }
          .signatures { margin-top: 60px; display: flex; justify-content: space-between; page-break-inside: avoid; }
          .signature-box { text-align: center; width: 30%; }
          .signature-box .title { font-weight: bold; margin-bottom: 50px; font-size: 12px; }
          .signature-box .line { border-top: 1px solid #000; width: 150px; margin: 0 auto; padding-top: 5px; }
          .footer { margin-top: 30px; text-align: center; font-size: 9px; color: #666; border-top: 1px solid #ccc; padding-top: 10px; }
          .empty-message { text-align: center; padding: 40px; color: #666; font-size: 14px; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>گزارش دفتر کل حساب</h1>
          <div class="account-name">${printEscapeHtml(data.account.name)}</div>
          <div class="account-code">کد حساب: ${printEscapeHtml(data.account.code)}</div>
          <div class="fiscal">${printEscapeHtml(fiscalText)}</div>
          <div class="period">${printEscapeHtml(periodText)}</div>
          ${
            allYears
              ? '<div class="warning">این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است.</div>'
              : ''
          }
          <div class="print-date">تاریخ تهیه گزارش: ${new Date().toLocaleDateString('fa-IR')}</div>
        </div>

        ${
          data.rows.length > 0 || Math.abs(data.openingBalance) >= 1
            ? `
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
        `
            : `
          <div class="empty-message">
            در بازه زمانی انتخاب‌شده تراکنشی وجود ندارد
          </div>
        `
        }

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
          window.onload = function() { setTimeout(function() { window.print(); }, 300); }
          window.onafterprint = function() { setTimeout(function() { window.close(); }, 500); }
        </script>
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank', 'width=900,height=700')

    if (!printWindow) {
      toast({
        title: 'خطا',
        description:
          'مرورگر شما پنجره پاپ‌آپ را مسدود کرده است. لطفاً اجازه پاپ‌آپ را برای این سایت فعال کنید.',
        variant: 'destructive',
      })
      return
    }

    printWindow.document.open()
    printWindow.document.write(printContent)
    printWindow.document.close()
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="space-y-4 p-3 sm:p-6" dir="rtl">
      {!isOnline && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-800">
            <strong>حالت آفلاین فعال است.</strong> دفتر کل بر اساس آخرین داده‌های ذخیره‌شده محاسبه شده است.
          </div>
        </div>
      )}

      {(allYears || displayWarning) && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg border ${
            allYears
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="text-xs">
            {allYears ? (
              <>
                <strong>نمای همه سنوات فعال است.</strong> این گزارش فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.
              </>
            ) : (
              displayWarning
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <Card className="border-gray-200">
        <CardContent className="p-3 sm:p-4">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-end">
              <div className="flex-1">
                <Label className="text-xs text-gray-600 mb-1 block">
                  انتخاب حساب:
                </Label>
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
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                size="sm"
                variant={allYears ? 'default' : 'outline'}
                className={`text-xs h-9 ${
                  allYears
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    : ''
                }`}
                onClick={() => setAllYears((v) => !v)}
              >
                <Calendar className="w-3.5 h-3.5 ml-1" />
                {allYears ? 'همه سنوات' : 'سال مالی انتخابی'}
              </Button>

              {!allYears && fiscalYearInfo?.name && (
                <Badge className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 h-9">
                  {fiscalYearInfo.name}
                </Badge>
              )}

              {selectedAccountId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-9"
                  onClick={handlePrint}
                >
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

                <div className="flex items-end gap-2 flex-wrap">
                  {(fromDate || toDate) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-9"
                      onClick={() => {
                        setFromDate(null)
                        setToDate(null)
                      }}
                    >
                      <X className="w-3.5 h-3.5 ml-1" /> پاک کردن فیلتر
                    </Button>
                  )}

                  {!allYears && fiscalYearInfo?.startDate && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[11px] h-9"
                      onClick={() =>
                        setFromDate(toDateOnly(fiscalYearInfo.startDate))
                      }
                    >
                      از ابتدای سال مالی
                    </Button>
                  )}

                  {!allYears && fiscalYearInfo?.endDate && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[11px] h-9"
                      onClick={() =>
                        setToDate(toDateOnly(fiscalYearInfo.endDate))
                      }
                    >
                      تا پایان سال مالی
                    </Button>
                  )}
                </div>
              </div>
            )}

            {selectedAccount && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-xs text-blue-800">
                  در حال مشاهده دفتر کل حساب{' '}
                  <strong>
                    {selectedAccount.code} — {selectedAccount.name}
                  </strong>
                </span>
              </div>
            )}

            <p className="text-[10px] text-gray-500 leading-5">
              نکته: مانده اول دوره بر اساس تمام حرکات معتبر قبل از تاریخ شروع محاسبه می‌شود. اگر «از تاریخ» خالی باشد، مانده اول دوره صفر در نظر گرفته می‌شود و فقط حرکات بازه انتخابی نمایش داده می‌شود.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {selectedAccountId && data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1 sm:gap-2">
          <div className="relative overflow-hidden rounded-md border border-blue-200 bg-gradient-to-br from-blue-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-[8px] sm:text-[9px] font-medium text-blue-600 truncate">
                مانده اول دوره
              </span>
              <Calendar className="w-2.5 h-2.5 text-blue-400 shrink-0" />
            </div>
            <div
              className={`text-[10px] sm:text-xs font-bold ${
                data.openingBalance >= 0 ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {formatRial(Math.abs(data.openingBalance))}
              <span className="text-[8px] font-normal mr-1">
                {data.openingBalance >= 0 ? 'بدهکار' : 'بستانکار'}
              </span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-md border border-red-200 bg-gradient-to-br from-red-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-[8px] sm:text-[9px] font-medium text-red-600 truncate">
                جمع بدهکار
              </span>
              <TrendingUp className="w-2.5 h-2.5 text-red-400 shrink-0" />
            </div>
            <div className="text-[10px] sm:text-xs font-bold text-red-700">
              {formatRial(data.totalDebit)}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-md border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-[8px] sm:text-[9px] font-medium text-emerald-600 truncate">
                جمع بستانکار
              </span>
              <TrendingUp className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
            </div>
            <div className="text-[10px] sm:text-xs font-bold text-emerald-700">
              {formatRial(data.totalCredit)}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-md border border-purple-200 bg-gradient-to-br from-purple-50 to-white px-2 py-1.5 sm:px-2.5 sm:py-2">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-[8px] sm:text-[9px] font-medium text-purple-600 truncate">
                مانده آخر دوره
              </span>
              <TrendingUp className="w-2.5 h-2.5 text-purple-400 shrink-0" />
            </div>
            <div
              className={`text-[10px] sm:text-xs font-bold ${
                data.closingBalance >= 0 ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {formatRial(Math.abs(data.closingBalance))}
              <span className="text-[8px] font-normal mr-1">
                {data.closingBalance >= 0 ? 'بدهکار' : 'بستانکار'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Loading / Error / Empty */}
      {loading ? (
        <Card className="border-gray-200">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-gray-500">
              در حال بارگذاری دفتر کل...
            </p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800">خطا در بارگذاری گزارش</p>
              <p className="text-xs text-red-700 mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      ) : !selectedAccountId ? (
        <Card className="border-dashed border-gray-300">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <FileText className="w-12 h-12 text-gray-300" />
            <h3 className="text-base font-medium text-gray-600">
              یک حساب را برای مشاهده دفتر کل انتخاب کنید
            </h3>
            <p className="text-xs text-gray-400">
              از لیست بالا یک حساب را انتخاب کنید تا تمام تراکنش‌های آن نمایش داده شود
            </p>
          </CardContent>
        </Card>
      ) : !data || data.rows.length === 0 ? (
        <Card className="border-dashed border-gray-300">
          <CardContent className="p-12 flex flex-col items-center justify-center gap-3">
            <FileText className="w-12 h-12 text-gray-300" />
            <h3 className="text-base font-medium text-gray-600">
              {data && data.openingBalance !== 0
                ? 'در بازه زمانی انتخاب‌شده تراکنشی وجود ندارد، اما مانده اول دوره وجود دارد.'
                : 'تراکنشی برای این حساب در بازه انتخابی ثبت نشده است'}
            </h3>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block">
            <Card className="border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-right text-xs w-28">
                        تاریخ
                      </TableHead>
                      <TableHead className="text-right text-xs w-24">
                        شماره سند
                      </TableHead>
                      <TableHead className="text-right text-xs">
                        شرح
                      </TableHead>
                      <TableHead className="text-right text-xs w-32">
                        بدهکار
                      </TableHead>
                      <TableHead className="text-right text-xs w-32">
                        بستانکار
                      </TableHead>
                      <TableHead className="text-right text-xs w-32">
                        مانده
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Math.abs(data.openingBalance) >= 1 && (
                      <TableRow className="bg-blue-50/50">
                        <TableCell
                          colSpan={5}
                          className="text-xs text-blue-700 font-medium"
                        >
                          مانده اول دوره
                        </TableCell>
                        <TableCell
                          className={`text-xs font-bold ${
                            data.openingBalance >= 0
                              ? 'text-red-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {data.openingBalanceLabel}
                        </TableCell>
                      </TableRow>
                    )}

                    {data.rows.map((row) => (
                      <TableRow
                        key={`${row.journalEntryId}-${row.date}-${row.debit}-${row.credit}`}
                        className="hover:bg-gray-50/50"
                      >
                        <TableCell className="text-xs">
                          {formatJalaliLong(row.date)}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {row.journalNumber}
                        </TableCell>
                        <TableCell className="text-xs max-w-[220px] truncate">
                          {row.lineDescription || row.description || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-red-600">
                          {row.debit > 0 ? formatRial(row.debit) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-emerald-600">
                          {row.credit > 0 ? formatRial(row.credit) : '—'}
                        </TableCell>
                        <TableCell
                          className={`text-xs font-bold ${
                            row.balance >= 0
                              ? 'text-red-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {row.balanceLabel ||
                            `${formatRial(Math.abs(row.balance))} ${
                              row.balance >= 0 ? 'بد' : 'بس'
                            }`}
                        </TableCell>
                      </TableRow>
                    ))}

                    <TableRow className="bg-blue-50 font-bold">
                      <TableCell colSpan={3} className="text-xs text-blue-800">
                        جمع کل
                      </TableCell>
                      <TableCell className="text-xs text-red-700">
                        {formatRial(data.totalDebit)}
                      </TableCell>
                      <TableCell className="text-xs text-emerald-700">
                        {formatRial(data.totalCredit)}
                      </TableCell>
                      <TableCell
                        className={`text-xs ${
                          data.closingBalance >= 0
                            ? 'text-red-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {data.closingBalanceLabel}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-2">
            {Math.abs(data.openingBalance) >= 1 && (
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="p-3">
                  <div className="text-xs font-medium text-blue-800 mb-1">
                    مانده اول دوره
                  </div>
                  <div
                    className={`text-sm font-bold ${
                      data.openingBalance >= 0
                        ? 'text-red-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {data.openingBalanceLabel}
                  </div>
                </CardContent>
              </Card>
            )}

            {data.rows.map((row, idx) => (
              <Card
                key={`${row.journalEntryId}-${idx}`}
                className="border-gray-200"
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-2 flex-wrap gap-1">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-gray-100 text-gray-600 text-[9px] font-mono">
                        {row.journalNumber}
                      </Badge>
                      <span className="text-[10px] text-gray-500">
                        {formatJalaliLong(row.date)}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-bold ${
                        row.balance >= 0
                          ? 'text-red-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {row.balanceLabel ||
                        `${formatRial(Math.abs(row.balance))} ${
                          row.balance >= 0 ? 'بد' : 'بس'
                        }`}
                    </span>
                  </div>

                  <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                    {row.lineDescription || row.description || 'بدون شرح'}
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className={`rounded p-1.5 ${
                        row.debit > 0
                          ? 'bg-red-50 border border-red-100'
                          : 'bg-gray-50 border border-gray-100'
                      }`}
                    >
                      <div className="text-[9px] text-red-600">بدهکار</div>
                      <div
                        className={`text-[11px] font-bold ${
                          row.debit > 0 ? 'text-red-700' : 'text-gray-400'
                        }`}
                      >
                        {row.debit > 0 ? formatRial(row.debit) : '—'}
                      </div>
                    </div>

                    <div
                      className={`rounded p-1.5 ${
                        row.credit > 0
                          ? 'bg-emerald-50 border border-emerald-100'
                          : 'bg-gray-50 border border-gray-100'
                      }`}
                    >
                      <div className="text-[9px] text-emerald-600">
                        بستانکار
                      </div>
                      <div
                        className={`text-[11px] font-bold ${
                          row.credit > 0 ? 'text-emerald-700' : 'text-gray-400'
                        }`}
                      >
                        {row.credit > 0 ? formatRial(row.credit) : '—'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="p-3">
                <div className="text-xs font-bold text-blue-800 mb-2">
                  جمع کل
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-red-100 rounded p-2 text-center">
                    <div className="text-red-600 text-[9px]">بدهکار</div>
                    <div className="font-bold text-red-700">
                      {formatRial(data.totalDebit)}
                    </div>
                  </div>
                  <div className="bg-emerald-100 rounded p-2 text-center">
                    <div className="text-emerald-600 text-[9px]">
                      بستانکار
                    </div>
                    <div className="font-bold text-emerald-700">
                      {formatRial(data.totalCredit)}
                    </div>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-blue-200 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-blue-800 font-medium">
                      مانده آخر دوره
                    </span>
                    <span
                      className={`font-bold ${
                        data.closingBalance >= 0
                          ? 'text-red-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {data.closingBalanceLabel}
                    </span>
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