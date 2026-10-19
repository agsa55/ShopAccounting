'use client'

// ============================================================================
// src/components/accounting/trial-balance-tab.tsx — v10.3 Persian DatePicker Fixed
// ShopAccounting — Enhanced Trial Balance Tab Component
// ----------------------------------------------------------------------------
// ★★★ v10.3:
//   - بازگشت کامل PersianDatePicker
//   - رفع قفل شدن تاریخ روی ابتدای سال مالی
//   - جلوگیری از double counting در سال مالی جدید
//   - ریست تاریخ فقط هنگام تغییر سال مالی
//   - ارسال dateFrom/dateTo معتبر برای سال مالی انتخابی
//   - حفظ گروه‌بندی، خروجی Excel، چاپ و نمای موبایل
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Scale,
  Download,
  Printer,
  Calendar,
  TrendingUp,
  TrendingDown,
  WifiOff,
} from 'lucide-react'
import { PersianDatePicker, formatJalaliLong } from '@/components/ui/persian-date-picker'
import { getCachedJournalEntries } from '@/lib/offline-db'

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

const NO_FISCAL_YEAR_WARNING =
  'سال مالی انتخابی مشخص نیست. برای گزارش رسمی، یک سال مالی انتخاب کنید یا از نمای همه سنوات استفاده کنید.'

const API_FISCAL_NOT_APPLIED_WARNING =
  'API تراز آزمایشی هنوز fiscalYearId را به‌صورت کامل اعمال نکرده است. برای ایزولاسیون دقیق، فایل /api/reports/trial-balance/route.ts باید اصلاح شود.'

const OFFLINE_TRIAL_WARNING =
  'تراز آزمایشی آفلاین بر اساس آخرین اسناد کش‌شده محاسبه شده است. این محاسبه ممکن است مانده افتتاحیه رسمی سال مالی را به‌دقت محاسبه نکند و فقط برای مشاهده است.'

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

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

function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

/**
 * فقط تاریخ ISO میلادی را نرمال می‌کند:
 * YYYY-MM-DD
 *
 * اگر PersianDatePicker مقدار Date یا ISO با time بدهد، پشتیبانی می‌شود.
 * اگر مقدار غیر ISO بدهد، null برمی‌گرداند تا بی‌صدا به تاریخ اشتباه تبدیل نشود.
 */
function normalizeDateOnly(value: any): string | null {
  if (!value) return null

  if (value instanceof Date) {
    const iso = value.toISOString()
    return iso.slice(0, 10)
  }

  const raw = String(value).trim()
  if (!raw) return null

  const latin = toLatinDigits(raw)

  // 2026-10-17
  if (/^\d{4}-\d{2}-\d{2}$/.test(latin)) {
    return latin
  }

  // 2026-1-7
  const loose = latin.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (loose) {
    const [, y, m, d] = loose
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // اگر مقدار ISO نبود، null برگردان.
  return null
}

function isIsoDate(value?: string | null): boolean {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function inferAccountType(
  code?: string | null,
  name?: string | null,
  type?: string | null
): string {
  const explicitType = String(type || '').toLowerCase().trim()
  if (explicitType && explicitType !== 'unknown') return explicitType

  const c = String(code || '').trim()

  if (c.startsWith('1')) return 'asset'
  if (c.startsWith('2')) return 'liability'
  if (c.startsWith('3')) return 'equity'
  if (c.startsWith('4')) return 'revenue'
  if (c.startsWith('5')) return 'expense'

  const n = String(name || '')

  if (
    n.includes('فروش') ||
    n.includes('درآمد') ||
    n.includes('income') ||
    n.includes('revenue')
  ) {
    return 'revenue'
  }

  if (
    n.includes('هزینه') ||
    n.includes('بهای') ||
    n.includes('expense') ||
    n.includes('cogs')
  ) {
    return 'expense'
  }

  if (
    n.includes('صندوق') ||
    n.includes('بانک') ||
    n.includes('موجودی') ||
    n.includes('دریافتنی') ||
    n.includes('asset')
  ) {
    return 'asset'
  }

  if (
    n.includes('پرداختنی') ||
    n.includes('بدهی') ||
    n.includes('liability')
  ) {
    return 'liability'
  }

  if (
    n.includes('سرمایه') ||
    n.includes(' Equity') ||
    n.includes('equity')
  ) {
    return 'equity'
  }

  return 'unknown'
}

interface FiscalYearInfo {
  id: string | null
  name: string | null
  startDate: string | null
  endDate: string | null
  isActive: boolean
  isClosed: boolean
}

// ═══════════════════════════════════════════════════════════════
// Offline calculation from cached journal entries
// ═══════════════════════════════════════════════════════════════

function calculateTrialBalanceFromCache(
  entries: any[],
  dateFrom: string | null,
  dateTo: string | null,
  includeZero: boolean,
  groupByType: boolean
): any {
  const accountMap = new Map<string, any>()

  const fromDateTs = dateFrom ? new Date(dateFrom).getTime() : 0
  const toDateTs = dateTo ? new Date(dateTo).getTime() + 86400000 : Infinity

  for (const entry of entries) {
    const status = String(entry.status || '').toUpperCase()
    if (status === 'CANCELLED') continue

    const entryTime = new Date(entry.date).getTime()
    if (Number.isNaN(entryTime)) continue

    if (entryTime < fromDateTs || entryTime >= toDateTs) continue

    const lines = entry.lines || entry.items || []

    for (const line of lines) {
      const key = line.accountId || line.accountCode || line.accountName
      if (!key) continue

      if (!accountMap.has(key)) {
        accountMap.set(key, {
          accountId: line.accountId || key,
          accountCode: line.accountCode || '—',
          accountName: line.accountName || 'نامشخص',
          accountType: inferAccountType(
            line.accountCode,
            line.accountName,
            line.accountType
          ),
          totalDebit: 0,
          totalCredit: 0,
        })
      }

      const row = accountMap.get(key)
      row.totalDebit += Number(line.debit || 0)
      row.totalCredit += Number(line.credit || 0)
    }
  }

  let flatRows = Array.from(accountMap.values()).map((row) => {
    const balance = row.totalDebit - row.totalCredit

    return {
      ...row,
      balance,
      balanceLabel:
        balance === 0
          ? '—'
          : balance > 0
          ? `${formatRial(balance)} بدهکار`
          : `${formatRial(Math.abs(balance))} بستانکار`,
    }
  })

  if (!includeZero) {
    flatRows = flatRows.filter(
      (r) => r.totalDebit !== 0 || r.totalCredit !== 0
    )
  }

  flatRows.sort((a, b) =>
    String(a.accountCode || '').localeCompare(String(b.accountCode || ''), undefined, {
      numeric: true,
    })
  )

  const grandDebit = flatRows.reduce((s, r) => s + r.totalDebit, 0)
  const grandCredit = flatRows.reduce((s, r) => s + r.totalCredit, 0)
  const difference = Math.abs(grandDebit - grandCredit)
  const isBalanced = difference < 1

  let groups: any[] = []

  if (groupByType) {
    const typeLabels: Record<string, string> = {
      asset: 'دارایی‌ها',
      liability: 'بدهی‌ها',
      equity: 'حقوق صاحبان سهام',
      revenue: 'درآمدها',
      expense: 'هزینه‌ها',
      cogs: 'بهای تمام شده',
      unknown: 'سایر',
    }

    const typeOrder: Record<string, number> = {
      asset: 1,
      liability: 2,
      equity: 3,
      revenue: 4,
      cogs: 5,
      expense: 6,
      unknown: 99,
    }

    const typeMap = new Map<string, any[]>()

    for (const row of flatRows) {
      const type = row.accountType || 'unknown'
      if (!typeMap.has(type)) typeMap.set(type, [])
      typeMap.get(type)!.push(row)
    }

    groups = Array.from(typeMap.entries())
      .map(([type, accounts]) => ({
        type,
        typeLabel: typeLabels[type] || type,
        accounts,
        subtotalDebit: accounts.reduce((s, a) => s + a.totalDebit, 0),
        subtotalCredit: accounts.reduce((s, a) => s + a.totalCredit, 0),
      }))
      .sort(
        (a, b) =>
          (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99)
      )
  }

  return {
    accountCount: flatRows.length,
    flatRows,
    groups,
    grandDebit,
    grandCredit,
    difference,
    isBalanced,
    dateRange: {
      from: dateFrom,
      to: dateTo,
    },
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function TrialBalanceTabV8() {
  const isOnline = useAppStore((s) => s.isOnline)

  const storeSelectedFiscalYearId = useAppStore(
    (s: any) => s.selectedFiscalYearId
  ) as string | null | undefined

  const selectedFiscalYearId =
    storeSelectedFiscalYearId && storeSelectedFiscalYearId !== 'all'
      ? storeSelectedFiscalYearId
      : null

  const fiscalYearBounds = useAppStore((s: any) => s.fiscalYearBounds) as any

  const [allYears, setAllYears] = useState(
    storeSelectedFiscalYearId === 'all'
  )

  // همگام‌سازی با فیلتر هدر
  useEffect(() => {
    if (storeSelectedFiscalYearId === 'all') {
      setAllYears(true)
    } else if (storeSelectedFiscalYearId) {
      setAllYears(false)
    }
  }, [storeSelectedFiscalYearId])

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)

  const [fiscalYearInfo, setFiscalYearInfo] =
    useState<FiscalYearInfo | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const [dateFrom, setDateFrom] = useState<string | null>(null)
  const [dateTo, setDateTo] = useState<string | null>(null)
  const [includeZero, setIncludeZero] = useState(false)
  const [groupByType, setGroupByType] = useState(true)

  // ★ فقط یک‌بار برای هر سال مالی بازه پیش‌فرض ست شود
  const initializedForRef = useRef<string | null | undefined>(undefined)

  const handleFromDateChange = (value: string | null) => {
    const next = normalizeDateOnly(value)

    if (value && !next) {
      console.warn('[TrialBalance] invalid from date from picker:', value)
      setDateFrom(null)
      return
    }

    setDateFrom(next)

    if (
      next &&
      dateTo &&
      isIsoDate(next) &&
      isIsoDate(dateTo) &&
      next > dateTo
    ) {
      setDateTo(next)
    }
  }

  const handleToDateChange = (value: string | null) => {
    const next = normalizeDateOnly(value)

    if (value && !next) {
      console.warn('[TrialBalance] invalid to date from picker:', value)
      setDateTo(null)
      return
    }

    setDateTo(next)

    if (
      next &&
      dateFrom &&
      isIsoDate(next) &&
      isIsoDate(dateFrom) &&
      next < dateFrom
    ) {
      setDateFrom(next)
    }
  }

  // ★ ریست تاریخ فقط هنگام تغییر سال مالی یا رسیدن bounds معتبر برای اولین بار
  useEffect(() => {
    if (allYears) {
      if (initializedForRef.current !== 'all') {
        setDateFrom(null)
        setDateTo(null)
        initializedForRef.current = 'all'
      }
      return
    }

    const fyKey = selectedFiscalYearId || null
    const from = normalizeDateOnly(fiscalYearBounds?.from)
    const to = normalizeDateOnly(fiscalYearBounds?.to)
    const hasValidRange = !!from && !!to && isIsoDate(from) && isIsoDate(to)

    // اگر برای همین سال مالی قبلاً initialize شده، تاریخ کاربر را خراب نکن
    if (initializedForRef.current === fyKey) return

    // اگر bounds هنوز آماده نشده، صبر کن
    if (!hasValidRange) return

    setDateFrom(from)
    setDateTo(to)
    initializedForRef.current = fyKey
  }, [
    selectedFiscalYearId,
    allYears,
    fiscalYearBounds?.from,
    fiscalYearBounds?.to,
  ])

    const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)

    const boundsFrom = normalizeDateOnly(fiscalYearBounds?.from)
    const boundsTo = normalizeDateOnly(fiscalYearBounds?.to)

    let effectiveDateFrom = isIsoDate(dateFrom) ? dateFrom : null
    let effectiveDateTo = isIsoDate(dateTo) ? dateTo : null

    // ★ v10.5 production-safe:
    // دیتاپیکرها در UI آزاد می‌مانند؛ فقط درخواست API برای سال مالی انتخابی
    // داخل بازه همان سال مالی ارسال می‌شود.
    if (!allYears && selectedFiscalYearId) {
      if (!effectiveDateFrom) effectiveDateFrom = boundsFrom
      if (!effectiveDateTo) effectiveDateTo = boundsTo

      if (
        boundsFrom &&
        isIsoDate(boundsFrom) &&
        effectiveDateFrom &&
        effectiveDateFrom < boundsFrom
      ) {
        effectiveDateFrom = boundsFrom
      }

      if (
        boundsTo &&
        isIsoDate(boundsTo) &&
        effectiveDateTo &&
        effectiveDateTo > boundsTo
      ) {
        effectiveDateTo = boundsTo
      }

      if (!effectiveDateFrom || !effectiveDateTo) {
        setLoading(false)
        setError(
          'بازه تاریخ سال مالی هنوز آماده نشده است. لطفاً روی «بازه کامل سال مالی» کلیک کنید یا صفحه را رفرش کنید.'
        )
        return
      }

      if (effectiveDateFrom > effectiveDateTo) {
        effectiveDateFrom = boundsFrom
        effectiveDateTo = boundsTo
      }
    }

    // ─── حالت آفلاین ─────────────────────────────────────────
    if (!isOnline) {
      try {
        const cachedEntries = await getCachedJournalEntries()

        const scopedCachedEntries =
          !allYears && selectedFiscalYearId
            ? cachedEntries.filter((entry: any) => {
                if (!entry?.fiscalYearId) return true
                return entry.fiscalYearId === selectedFiscalYearId
              })
            : cachedEntries

        if (scopedCachedEntries.length === 0) {
          setData({
            accountCount: 0,
            flatRows: [],
            groups: [],
            grandDebit: 0,
            grandCredit: 0,
            difference: 0,
            isBalanced: true,
            dateRange: {
              from: effectiveDateFrom,
              to: effectiveDateTo,
            },
            fiscalYearId: selectedFiscalYearId,
            fiscalYearName: fiscalYearInfo?.name || null,
            warning: OFFLINE_TRIAL_WARNING,
          })
        } else {
          const offlineData = calculateTrialBalanceFromCache(
            scopedCachedEntries,
            effectiveDateFrom,
            effectiveDateTo,
            includeZero,
            groupByType
          )

          setData({
            ...offlineData,
            fiscalYearId: selectedFiscalYearId,
            fiscalYearName: fiscalYearInfo?.name || null,
            warning: OFFLINE_TRIAL_WARNING,
          })
        }
      } catch (err: any) {
        setError(err?.message || 'خطا در خواندن داده‌های کش')
      } finally {
        setLoading(false)
      }

      return
    }

    // ─── حالت آنلاین ─────────────────────────────────────────
    try {
      const params = new URLSearchParams()

      if (effectiveDateFrom) params.set('dateFrom', effectiveDateFrom)
      if (effectiveDateTo) params.set('dateTo', effectiveDateTo)
      if (includeZero) params.set('includeZero', 'true')
      if (!groupByType) params.set('groupByType', 'false')

      if (allYears) {
        params.set('allYears', 'true')
      } else if (selectedFiscalYearId) {
        params.set('fiscalYearId', selectedFiscalYearId)
      }

      const res = await fetch(
        `/api/reports/trial-balance?${params.toString()}`,
        {
          headers: getAuthHeaders(),
        }
      )

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'خطا در بارگذاری تراز آزمایشی')
      }

      const responseData = json.data || json

      const fy =
        json.fiscalYear ||
        responseData.fiscalYear ||
        null

      const responseFiscalYearId =
        json.fiscalYearId ||
        fy?.id ||
        (allYears ? null : selectedFiscalYearId) ||
        null

      const responseFiscalYearName =
        json.fiscalYearName ||
        fy?.name ||
        null

      let responseWarning: string | null =
        json.warning ||
        responseData.warning ||
        null

      if (allYears) {
        responseWarning = responseWarning || ALL_YEARS_WARNING
      } else if (!responseFiscalYearId) {
        responseWarning = responseWarning || NO_FISCAL_YEAR_WARNING
      } else if (!fy && selectedFiscalYearId) {
        responseWarning = responseWarning || API_FISCAL_NOT_APPLIED_WARNING
      }

      if (fy) {
        setFiscalYearInfo({
          id: fy.id || responseFiscalYearId || null,
          name: fy.name || responseFiscalYearName || null,
          startDate: fy.startDate || null,
          endDate: fy.endDate || null,
          isActive: Boolean(fy.isActive),
          isClosed: Boolean(fy.isClosed),
        })
      } else if (responseFiscalYearId) {
        setFiscalYearInfo({
          id: responseFiscalYearId,
          name: responseFiscalYearName,
          startDate: null,
          endDate: null,
          isActive: false,
          isClosed: false,
        })
      } else {
        setFiscalYearInfo(null)
      }

      setWarning(responseWarning)

      setData({
        ...responseData,
        fiscalYearId: responseFiscalYearId,
        fiscalYearName: responseFiscalYearName,
        warning: responseWarning,
        dateRange: responseData.dateRange || {
          from: effectiveDateFrom,
          to: effectiveDateTo,
        },
      })


    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setLoading(false)
    }
  }, [
    isOnline,
    selectedFiscalYearId,
    allYears,
    dateFrom,
    dateTo,
    includeZero,
    groupByType,
    fiscalYearBounds?.from,
    fiscalYearBounds?.to,
    fiscalYearInfo?.name,
  ])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleExport = () => {
    if (!data) return

    const headers = [
      'ردیف',
      'کد حساب',
      'نام حساب',
      'نوع',
      'بدهکار',
      'بستانکار',
      'مانده',
    ]

    const rows: any[][] = []

    const fiscalTitle = allYears
      ? 'همه سنوات'
      : fiscalYearInfo?.name ||
        data.fiscalYearName ||
        selectedFiscalYearId ||
        'بدون سال مالی'

    rows.push(['تراز آزمایشی', fiscalTitle, '', '', '', '', ''])
    rows.push([
      'بازه',
      data.dateRange?.from ? formatJalaliLong(data.dateRange.from) : 'ابتدای دوره',
      'تا',
      data.dateRange?.to ? formatJalaliLong(data.dateRange.to) : 'امروز',
      '',
      '',
      '',
    ])
    rows.push(['', '', '', '', '', '', ''])

    let counter = 1

    if (groupByType && data.groups) {
      for (const g of data.groups) {
        rows.push(['', '', g.typeLabel, '', '', '', ''])

        for (const acc of g.accounts) {
          rows.push([
            counter++,
            acc.accountCode,
            acc.accountName,
            g.typeLabel,
            acc.totalDebit,
            acc.totalCredit,
            acc.balanceLabel,
          ])
        }

        rows.push([
          '',
          '',
          `جمع ${g.typeLabel}`,
          '',
          g.subtotalDebit,
          g.subtotalCredit,
          '',
        ])
      }
    } else {
      for (const acc of data.flatRows) {
        rows.push([
          counter++,
          acc.accountCode,
          acc.accountName,
          acc.accountType || '',
          acc.totalDebit,
          acc.totalCredit,
          acc.balanceLabel,
        ])
      }
    }

    rows.push(['', '', 'جمع کل', '', data.grandDebit, data.grandCredit, ''])

    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${c ?? ''}"`).join(','))
      .join('\n')

    const blob = new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8',
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url

    const safeFiscal = String(fiscalTitle)
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 40)

    a.download = `trial-balance-${safeFiscal}-${data.dateRange?.to || today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="mr-3 text-sm text-gray-600">
          در حال محاسبه تراز آزمایشی...
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertCircle className="w-4 h-4 text-red-600" />
        <AlertDescription className="text-red-700 text-sm">
          {error}
        </AlertDescription>
      </Alert>
    )
  }

  if (!data) return null

  const isEmpty = data.accountCount === 0
  const displayWarning = warning || data.warning || null

  const fiscalFrom = normalizeDateOnly(
    fiscalYearBounds?.from || fiscalYearInfo?.startDate
  )
  const fiscalTo = normalizeDateOnly(
    fiscalYearBounds?.to || fiscalYearInfo?.endDate
  )

  return (
    <div className="p-3 sm:p-6 space-y-4" dir="rtl">
      {!isOnline && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-800">
            <strong>حالت آفلاین فعال است.</strong> تراز آزمایشی بر اساس آخرین
            داده‌های ذخیره‌شده محاسبه شده است. این گزارش فقط برای{' '}
            <strong>مشاهده</strong> است.
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
                <strong>نمای همه سنوات فعال است.</strong> این گزارش فقط برای
                بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.
              </>
            ) : (
              displayWarning
            )}
          </div>
        </div>
      )}

      {/* ★ Header & Filters */}
      <Card className="border-gray-200">
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Scale className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-gray-900">
                تراز آزمایشی
              </h3>

              {!allYears && fiscalYearInfo?.name && (
                <Badge className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700">
                  {fiscalYearInfo.name}
                </Badge>
              )}

              {allYears && (
                <Badge className="text-[10px] border-indigo-200 bg-indigo-50 text-indigo-700">
                  همه سنوات
                </Badge>
              )}
            </div>

            <Button
              size="sm"
              variant={allYears ? 'default' : 'outline'}
              className={`text-xs h-8 ${
                allYears
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : ''
              }`}
              onClick={() => setAllYears((v) => !v)}
            >
              <Calendar className="w-3.5 h-3.5 ml-1" />
              {allYears ? 'همه سنوات' : 'سال مالی انتخابی'}
            </Button>
          </div>

          {data.dateRange?.from && (
            <Badge variant="outline" className="text-[10px] gap-1 mb-3">
              <Calendar className="w-3 h-3" />
              از {formatJalaliLong(data.dateRange.from)} تا{' '}
              {formatJalaliLong(data.dateRange.to)}
            </Badge>
          )}

          {!data.dateRange?.from && data.dateRange?.to && (
            <Badge variant="outline" className="text-[10px] gap-1 mb-3">
              <Calendar className="w-3 h-3" />
              تا {formatJalaliLong(data.dateRange.to)} (تمام دوره)
            </Badge>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                                 <div>
              <PersianDatePicker
                value={dateFrom}
                onChange={handleFromDateChange}
                placeholder="از تاریخ"
                label="از تاریخ"
              />
            </div>

                      <div>
              <PersianDatePicker
                value={dateTo}
                onChange={handleToDateChange}
                placeholder="تا تاریخ"
                label="تا تاریخ"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-gray-600">گزینه‌ها</Label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={includeZero}
                    onCheckedChange={(v) => setIncludeZero(!!v)}
                  />
                  حساب‌های صفر
                </label>

                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={groupByType}
                    onCheckedChange={(v) => setGroupByType(!!v)}
                  />
                  گروه‌بندی
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={isEmpty}
                className="text-xs flex-1"
              >
                <Download className="w-3.5 h-3.5 ml-1" />
                Excel
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                disabled={isEmpty || !isOnline}
                className="text-xs flex-1"
                title={
                  !isOnline
                    ? 'چاپ در حالت آفلاین غیرفعال است'
                    : 'چاپ گزارش'
                }
              >
                <Printer className="w-3.5 h-3.5 ml-1" />
                چاپ
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {!allYears && (
              <Button
                size="sm"
                variant="outline"
                className="text-[11px] h-7 bg-emerald-50 border-emerald-200 text-emerald-700"
                onClick={() => {
                  if (fiscalFrom && fiscalTo && isIsoDate(fiscalFrom) && isIsoDate(fiscalTo)) {
                    setDateFrom(fiscalFrom)
                    setDateTo(fiscalTo)
                    initializedForRef.current = selectedFiscalYearId || null
                  }
                }}
              >
                بازه کامل سال مالی
              </Button>
            )}

            {!allYears && fiscalFrom && (
              <Button
                size="sm"
                variant="outline"
                className="text-[11px] h-7"
                onClick={() => {
                  if (isIsoDate(fiscalFrom)) {
                    setDateFrom(fiscalFrom)
                  }
                }}
              >
                از ابتدای سال مالی
              </Button>
            )}

            {!allYears && fiscalTo && (
              <Button
                size="sm"
                variant="outline"
                className="text-[11px] h-7"
                onClick={() => {
                  if (isIsoDate(fiscalTo)) {
                    setDateTo(fiscalTo)
                  }
                }}
              >
                تا پایان سال مالی
              </Button>
            )}

            {allYears && (
              <Button
                size="sm"
                variant="outline"
                className="text-[11px] h-7"
                onClick={() => {
                  setDateFrom(null)
                  setDateTo(null)
                }}
              >
                همه دوره‌ها
              </Button>
            )}
          </div>

          <p className="text-[10px] text-gray-500 mt-2 leading-5">
            نکته: برای سال مالی انتخابی، «از تاریخ» نباید خالی باشد؛ اگر خالی
            باشد گزارش تجمعی محاسبه شده و مانده سنوات قبل را هم شامل می‌شود.
            برای تراز رسمی سال مالی، از دکمه «بازه کامل سال مالی» استفاده کنید.
          </p>
        </CardContent>
      </Card>

      {/* ★ Summary Card */}
      <Card
        className={
          data.isBalanced
            ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
            : 'border-red-200 bg-gradient-to-br from-red-50 to-white'
        }
      >
        <CardContent className="p-2.5 sm:p-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              {data.isBalanced ? (
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </div>
              )}

              <div>
                <p
                  className={`font-bold text-xs sm:text-sm ${
                    data.isBalanced ? 'text-emerald-800' : 'text-red-800'
                  }`}
                >
                  {data.isBalanced
                    ? 'تراز متعادل است ✓'
                    : 'تراز نامتعادل!'}
                </p>
                <p className="text-[10px] text-gray-500">
                  {data.isBalanced
                    ? 'جمع بدهکار = جمع بستانکار'
                    : `اختلاف: ${formatRial(
                        Math.abs(data.difference)
                      )} ریال`}
                </p>
              </div>
            </div>

            <div className="flex gap-3 sm:gap-4 text-xs w-full sm:w-auto justify-between sm:justify-end">
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 text-center min-w-[70px]">
                <p className="text-[9px] text-blue-600 mb-0.5">حساب‌ها</p>
                <p className="font-mono font-bold text-blue-700 text-xs sm:text-sm">
                  {data.accountCount.toLocaleString('fa-IR')}
                </p>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 text-center min-w-[70px]">
                <p className="text-[9px] text-red-600 mb-0.5">جمع بدهکار</p>
                <p className="font-mono font-bold text-red-700 text-xs sm:text-sm">
                  {formatRial(data.grandDebit)}
                </p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 text-center min-w-[70px]">
                <p className="text-[9px] text-emerald-600 mb-0.5">
                  جمع بستانکار
                </p>
                <p className="font-mono font-bold text-emerald-700 text-xs sm:text-sm">
                  {formatRial(data.grandCredit)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ★ Empty state */}
      {isEmpty ? (
        <Card className="border-gray-200">
          <CardContent className="py-16 text-center">
            <Scale className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">
              داده‌ای برای تراز آزمایشی یافت نشد
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              پس از ثبت اسناد حسابداری، تراز آزمایشی نمایش داده می‌شود
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ★ Grouped View */}
          {groupByType && data.groups && data.groups.length > 0 ? (
            <div className="space-y-3">
              {data.groups.map((g: any) => (
                <Card key={g.type} className="border-gray-200">
                  <CardHeader className="p-2.5 bg-gray-50 border-b">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-xs font-bold text-gray-700 flex items-center gap-2">
                        {g.type === 'asset' && (
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        {g.type === 'liability' && (
                          <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                        )}
                        {g.type === 'equity' && (
                          <Scale className="w-3.5 h-3.5 text-purple-600" />
                        )}
                        {g.type === 'revenue' && (
                          <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                        )}
                        {g.type === 'expense' && (
                          <TrendingDown className="w-3.5 h-3.5 text-orange-600" />
                        )}
                        {g.typeLabel}
                      </CardTitle>

                      <Badge variant="outline" className="text-[10px]">
                        {g.accounts.length.toLocaleString('fa-IR')} حساب
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    {/* Desktop Table */}
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50/50">
                            <TableHead className="text-xs text-right">
                              کد حساب
                            </TableHead>
                            <TableHead className="text-xs text-right">
                              نام حساب
                            </TableHead>
                            <TableHead className="text-xs text-center">
                              بدهکار
                            </TableHead>
                            <TableHead className="text-xs text-center">
                              بستانکار
                            </TableHead>
                            <TableHead className="text-xs text-center">
                              مانده
                            </TableHead>
                          </TableRow>
                        </TableHeader>

                        <TableBody>
                          {g.accounts.map((acc: any) => (
                            <TableRow
                              key={acc.accountId}
                              className="hover:bg-emerald-50/40"
                            >
                              <TableCell className="text-xs font-mono text-gray-500">
                                {acc.accountCode}
                              </TableCell>
                              <TableCell className="text-xs font-medium text-gray-900">
                                {acc.accountName}
                              </TableCell>
                              <TableCell className="text-xs text-center font-mono text-red-600">
                                {acc.totalDebit > 0
                                  ? formatRial(acc.totalDebit)
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-xs text-center font-mono text-emerald-600">
                                {acc.totalCredit > 0
                                  ? formatRial(acc.totalCredit)
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-xs text-center font-mono font-bold">
                                {acc.balanceLabel}
                              </TableCell>
                            </TableRow>
                          ))}

                          <TableRow className="bg-gray-100 font-bold">
                            <TableCell colSpan={2} className="text-xs">
                              جمع {g.typeLabel}
                            </TableCell>
                            <TableCell className="text-xs text-center font-mono text-red-700">
                              {formatRial(g.subtotalDebit)}
                            </TableCell>
                            <TableCell className="text-xs text-center font-mono text-emerald-700">
                              {formatRial(g.subtotalCredit)}
                            </TableCell>
                            <TableCell className="text-xs text-center">
                              —
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-2 p-3">
                      {g.accounts.map((acc: any) => {
                        const balance = acc.totalDebit - acc.totalCredit

                        return (
                          <div
                            key={acc.accountId}
                            className="border border-gray-200 rounded-lg p-2.5 bg-white"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-gray-900 truncate">
                                  {acc.accountName}
                                </div>
                                <div className="text-[10px] text-gray-500 font-mono">
                                  {acc.accountCode}
                                </div>
                              </div>

                              {balance !== 0 && (
                                <Badge
                                  className={
                                    balance > 0
                                      ? 'bg-red-100 text-red-700 text-[9px]'
                                      : 'bg-emerald-100 text-emerald-700 text-[9px]'
                                  }
                                >
                                  {balance > 0 ? 'بدهکار' : 'بستانکار'}
                                </Badge>
                              )}
                            </div>

                            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                              <div className="bg-red-50 rounded p-1.5 text-center">
                                <div className="text-red-600">بدهکار</div>
                                <div className="font-bold text-red-700">
                                  {acc.totalDebit > 0
                                    ? formatRial(acc.totalDebit)
                                    : '—'}
                                </div>
                              </div>

                              <div className="bg-emerald-50 rounded p-1.5 text-center">
                                <div className="text-emerald-600">
                                  بستانکار
                                </div>
                                <div className="font-bold text-emerald-700">
                                  {acc.totalCredit > 0
                                    ? formatRial(acc.totalCredit)
                                    : '—'}
                                </div>
                              </div>

                              <div
                                className={
                                  balance >= 0
                                    ? 'bg-gray-50 rounded p-1.5 text-center'
                                    : 'bg-blue-50 rounded p-1.5 text-center'
                                }
                              >
                                <div className="text-gray-600">مانده</div>
                                <div
                                  className={`font-bold ${
                                    balance >= 0
                                      ? 'text-red-700'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  {balance === 0
                                    ? '—'
                                    : formatRial(Math.abs(balance))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      <div className="bg-gray-100 rounded-lg p-2.5 border border-gray-300">
                        <div className="text-xs font-bold text-gray-800 mb-1.5">
                          جمع {g.typeLabel}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-red-100 rounded p-1.5 text-center">
                            <div className="text-red-600 text-[9px]">
                              بدهکار
                            </div>
                            <div className="font-bold text-red-700">
                              {formatRial(g.subtotalDebit)}
                            </div>
                          </div>

                          <div className="bg-emerald-100 rounded p-1.5 text-center">
                            <div className="text-emerald-600 text-[9px]">
                              بستانکار
                            </div>
                            <div className="font-bold text-emerald-700">
                              {formatRial(g.subtotalCredit)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Card className="border-2 border-gray-300 bg-gradient-to-l from-emerald-50 to-blue-50">
                <CardContent className="p-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-sm font-bold gap-3">
                    <span className="text-gray-900">جمع کل تراز</span>

                    <div className="flex gap-4 sm:gap-6 w-full sm:w-auto justify-between sm:justify-end">
                      <span className="font-mono text-red-700">
                        {formatRial(data.grandDebit)}
                      </span>
                      <span className="font-mono text-emerald-700">
                        {formatRial(data.grandCredit)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-gray-200">
              <CardContent className="p-0">
                {/* Desktop Table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs text-right">
                          کد حساب
                        </TableHead>
                        <TableHead className="text-xs text-right">
                          نام حساب
                        </TableHead>
                        <TableHead className="text-xs text-center">
                          بدهکار
                        </TableHead>
                        <TableHead className="text-xs text-center">
                          بستانکار
                        </TableHead>
                        <TableHead className="text-xs text-center">
                          مانده
                        </TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {data.flatRows.map((row: any) => (
                        <TableRow
                          key={row.accountId}
                          className="hover:bg-emerald-50/40"
                        >
                          <TableCell className="text-xs font-mono text-gray-500">
                            {row.accountCode}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-gray-900">
                            {row.accountName}
                          </TableCell>
                          <TableCell className="text-xs text-center font-mono text-red-600">
                            {row.totalDebit > 0
                              ? formatRial(row.totalDebit)
                              : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-center font-mono text-emerald-600">
                            {row.totalCredit > 0
                              ? formatRial(row.totalCredit)
                              : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-center font-mono font-bold">
                            {row.balanceLabel}
                          </TableCell>
                        </TableRow>
                      ))}

                      <TableRow className="bg-gray-100 font-bold">
                        <TableCell colSpan={2} className="text-xs">
                          جمع کل
                        </TableCell>
                        <TableCell className="text-xs text-center font-mono text-red-700">
                          {formatRial(data.grandDebit)}
                        </TableCell>
                        <TableCell className="text-xs text-center font-mono text-emerald-700">
                          {formatRial(data.grandCredit)}
                        </TableCell>
                        <TableCell className="text-xs text-center">
                          —
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-2 p-3">
                  {data.flatRows.map((row: any) => {
                    const balance = row.totalDebit - row.totalCredit

                    return (
                      <div
                        key={row.accountId}
                        className="border border-gray-200 rounded-lg p-2.5 bg-white"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-900 truncate">
                              {row.accountName}
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono">
                              {row.accountCode}
                            </div>
                          </div>

                          {balance !== 0 && (
                            <Badge
                              className={
                                balance > 0
                                  ? 'bg-red-100 text-red-700 text-[9px]'
                                  : 'bg-emerald-100 text-emerald-700 text-[9px]'
                              }
                            >
                              {balance > 0 ? 'بد' : 'بس'}
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                          <div className="bg-red-50 rounded p-1.5 text-center">
                            <div className="text-red-600">بدهکار</div>
                            <div className="font-bold text-red-700">
                              {row.totalDebit > 0
                                ? formatRial(row.totalDebit)
                                : '—'}
                            </div>
                          </div>

                          <div className="bg-emerald-50 rounded p-1.5 text-center">
                            <div className="text-emerald-600">
                              بستانکار
                            </div>
                            <div className="font-bold text-emerald-700">
                              {row.totalCredit > 0
                                ? formatRial(row.totalCredit)
                                : '—'}
                            </div>
                          </div>

                          <div
                            className={
                              balance >= 0
                                ? 'bg-gray-50 rounded p-1.5 text-center'
                                : 'bg-blue-50 rounded p-1.5 text-center'
                            }
                          >
                            <div className="text-gray-600">مانده</div>
                            <div
                              className={`font-bold ${
                                balance >= 0
                                  ? 'text-red-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {balance === 0
                                ? '—'
                                : formatRial(Math.abs(balance))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  <div className="bg-gradient-to-l from-emerald-100 to-blue-100 rounded-lg p-2.5 border-2 border-gray-300">
                    <div className="text-xs font-bold text-gray-800 mb-1.5">
                      جمع کل
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-red-200 rounded p-1.5 text-center">
                        <div className="text-red-700 text-[9px]">بدهکار</div>
                        <div className="font-bold text-red-800">
                          {formatRial(data.grandDebit)}
                        </div>
                      </div>

                      <div className="bg-emerald-200 rounded p-1.5 text-center">
                        <div className="text-emerald-700 text-[9px]">
                          بستانکار
                        </div>
                        <div className="font-bold text-emerald-800">
                          {formatRial(data.grandCredit)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

export default TrialBalanceTabV8