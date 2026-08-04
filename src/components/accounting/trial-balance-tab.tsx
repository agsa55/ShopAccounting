// ============================================================================
// src/components/accounting/trial-balance-tab.tsx — v9.0 ★★★ OFFLINE + MOBILE
// ShopAccounting — Enhanced Trial Balance Tab Component
// ----------------------------------------------------------------------------
// ★★★ v9.0 تغییرات:
//   - افزودن قابلیت آفلاین کامل (محاسبه سمت کلاینت از کش)
//   - ریسپانسیو کامل برای موبایل (کارت به جای جدول)
//   - بنر هشدار آفلاین
//   - حفظ تمام قابلیت‌های v8.4 (PersianDatePicker، Excel، چاپ، گروه‌بندی)
// ★★★ v8.4: استفاده از PersianDatePicker موجود (src/components/ui/persian-date-picker)
//   بدون محدودیت minDate/maxDate — تمام روزها قابل انتخاب هستند.
//   اگر کاربر «از تاریخ» > «تا تاریخ» انتخاب کند، خودکار swap می‌شود.
// ============================================================================

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Loader2, AlertCircle, CheckCircle2, Scale, Download, Printer,
  Calendar, TrendingUp, TrendingDown, WifiOff, FileText,
} from 'lucide-react'
// ★★★ v8.4: استفاده از PersianDatePicker موجود پروژه
import { PersianDatePicker, formatJalaliLong } from '@/components/ui/persian-date-picker'
// ★★★ v9.0: افزودن قابلیت آفلاین
import { getCachedJournalEntries } from '@/lib/offline-db'

// ═══════════════════════════════════════════════════════════════
//  Helper functions
// ═══════════════════════════════════════════════════════════════

function resolveTenantId(
  currentTenant: any,
  storeTenantId?: string | null,
  userTenantId?: string | null
): string {
  if (currentTenant?.id) return currentTenant.id
  if (typeof currentTenant === 'string') return currentTenant
  if (storeTenantId) return storeTenantId.trim()
  if (userTenantId) return userTenantId.trim()
  return ''
}

function formatRial(num: number): string {
  return (num || 0).toLocaleString('fa-IR')
}

// ═══════════════════════════════════════════════════════════════
//  محاسبه تراز آزمایشی از اسناد کش‌شده (برای حالت آفلاین)
// ═══════════════════════════════════════════════════════════════
function calculateTrialBalanceFromCache(
  entries: any[],
  dateFrom: string | null,
  dateTo: string | null,
  includeZero: boolean,
  groupByType: boolean
): any {
  const accountMap = new Map<string, any>()

  const fromDate = dateFrom ? new Date(dateFrom).getTime() : 0
  const toDate = dateTo ? new Date(dateTo).getTime() + 86400000 : Infinity

  for (const entry of entries) {
    // فیلتر اسناد لغوشده
    if (entry.status === 'CANCELLED') continue

    // فیلتر تاریخ
    const entryTime = new Date(entry.date).getTime()
    if (entryTime < fromDate || entryTime > toDate) continue

    const lines = entry.lines || entry.items || []
    for (const line of lines) {
      const key = line.accountId || line.accountCode || line.accountName
      if (!accountMap.has(key)) {
        accountMap.set(key, {
          accountId: line.accountId || key,
          accountCode: line.accountCode || '—',
          accountName: line.accountName || 'نامشخص',
          accountType: line.accountType || 'unknown',
          totalDebit: 0,
          totalCredit: 0,
        })
      }
      const row = accountMap.get(key)
      row.totalDebit += line.debit || 0
      row.totalCredit += line.credit || 0
    }
  }

  // ساخت flatRows
  let flatRows = Array.from(accountMap.values()).map(row => {
    const balance = row.totalDebit - row.totalCredit
    return {
      ...row,
      balance,
      balanceLabel: balance === 0
        ? '—'
        : balance > 0
          ? `${formatRial(balance)} بدهکار`
          : `${formatRial(Math.abs(balance))} بستانکار`,
    }
  })

  // فیلتر حساب‌های صفر
  if (!includeZero) {
    flatRows = flatRows.filter(r => r.totalDebit !== 0 || r.totalCredit !== 0)
  }

  // مرتب‌سازی بر اساس کد
  flatRows.sort((a, b) => a.accountCode.localeCompare(b.accountCode))

  // محاسبه جمع کل
  const grandDebit = flatRows.reduce((s, r) => s + r.totalDebit, 0)
  const grandCredit = flatRows.reduce((s, r) => s + r.totalCredit, 0)
  const difference = Math.abs(grandDebit - grandCredit)
  const isBalanced = difference < 1

  // گروه‌بندی بر اساس نوع
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
    const typeMap = new Map<string, any[]>()
    for (const row of flatRows) {
      const type = row.accountType || 'unknown'
      if (!typeMap.has(type)) typeMap.set(type, [])
      typeMap.get(type)!.push(row)
    }
    groups = Array.from(typeMap.entries()).map(([type, accounts]) => ({
      type,
      typeLabel: typeLabels[type] || type,
      accounts,
      subtotalDebit: accounts.reduce((s, a) => s + a.totalDebit, 0),
      subtotalCredit: accounts.reduce((s, a) => s + a.totalCredit, 0),
    }))
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
//  Main Component
// ═══════════════════════════════════════════════════════════════

export function TrialBalanceTabV8() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  // ★★★ v9.0: وضعیت آفلاین
  const isOnline = useAppStore((s) => s.isOnline)

  // ★ فیلترها (مقدار به‌صورت ISO میلادی یا null)
  const today = new Date().toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState<string | null>(null)
  const [dateTo, setDateTo] = useState<string | null>(today)
  const [includeZero, setIncludeZero] = useState(false)
  const [groupByType, setGroupByType] = useState(true)

  const currentTenant = useAppStore((s) => s.currentTenant)
  const tenantIdFromStore = useAppStore((s) => s.tenantId)
  const userTenantId = useAppStore((s) => s.user?.tenantId)
  const tenantId = resolveTenantId(currentTenant, tenantIdFromStore, userTenantId)

  // ★★★ v8.4: هندلرهای هوشمند — بدون محدودیت روزها، با swap خودکار
  const handleFromDateChange = (iso: string | null) => {
    if (iso && dateTo && iso > dateTo) {
      setDateTo(iso)
    }
    setDateFrom(iso)
  }

  const handleToDateChange = (iso: string | null) => {
    if (iso && dateFrom && iso < dateFrom) {
      setDateFrom(iso)
    }
    setDateTo(iso)
  }

  // ★★★ v9.0: تابع load data با پشتیبانی آفلاین
  const fetchReport = useCallback(async () => {
    if (!tenantId && isOnline) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    // ── حالت آفلاین: محاسبه از کش ─────────────────────────
    if (!isOnline) {
      try {
        const cachedEntries = await getCachedJournalEntries()
        if (cachedEntries.length === 0) {
          setData({
            accountCount: 0,
            flatRows: [],
            groups: [],
            grandDebit: 0,
            grandCredit: 0,
            difference: 0,
            isBalanced: true,
            dateRange: { from: dateFrom, to: dateTo },
          })
        } else {
          const offlineData = calculateTrialBalanceFromCache(
            cachedEntries,
            dateFrom,
            dateTo,
            includeZero,
            groupByType
          )
          setData(offlineData)
        }
      } catch (err: any) {
        setError(err?.message || 'خطا در خواندن داده‌های کش')
      } finally {
        setLoading(false)
      }
      return
    }

    // ── حالت آنلاین: دریافت از سرور ───────────────────────
    try {
      const params = new URLSearchParams()
      if (dateTo) params.set('dateTo', dateTo)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (includeZero) params.set('includeZero', 'true')
      if (!groupByType) params.set('groupByType', 'false')

      const res = await fetch(`/api/reports/trial-balance?${params.toString()}`, {
        headers: { 'x-tenant-id': tenantId },
      })
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      } else {
        setError(json.error || 'خطا در بارگذاری')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setLoading(false)
    }
  }, [tenantId, dateFrom, dateTo, includeZero, groupByType, isOnline])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  // ★ Export to Excel
  const handleExport = () => {
    if (!data) return
    const headers = ['ردیف', 'کد حساب', 'نام حساب', 'نوع', 'بدهکار', 'بستانکار', 'مانده']
    const rows: any[][] = []

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
        rows.push(['', '', `جمع ${g.typeLabel}`, '', g.subtotalDebit, g.subtotalCredit, ''])
      }
    } else {
      for (const acc of data.flatRows) {
        rows.push([
          counter++,
          acc.accountCode,
          acc.accountName,
          '',
          acc.totalDebit,
          acc.totalCredit,
          acc.balanceLabel,
        ])
      }
    }
    rows.push(['', '', 'جمع کل', '', data.grandDebit, data.grandCredit, ''])

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trial-balance-${dateTo || today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="mr-3 text-sm text-gray-600">در حال محاسبه تراز آزمایشی...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertCircle className="w-4 h-4 text-red-600" />
        <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
      </Alert>
    )
  }

  if (!data) return null

  const isEmpty = data.accountCount === 0

  return (
    <div className="p-3 sm:p-6 space-y-4" dir="rtl">
      {/* ★★★ v9.0: بنر هشدار آفلاین */}
      {!isOnline && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-800">
            <strong>حالت آفلاین فعال است.</strong> تراز آزمایشی بر اساس آخرین داده‌های ذخیره‌شده محاسبه شده است. این گزارش فقط برای <strong>مشاهده</strong> است.
          </div>
        </div>
      )}

      {/* ★ Header & Filters */}
      <Card className="border-gray-200">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Scale className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-gray-900">تراز آزمایشی</h3>
            {data.dateRange.from && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Calendar className="w-3 h-3" />
                از {formatJalaliLong(data.dateRange.from)} تا {formatJalaliLong(data.dateRange.to)}
              </Badge>
            )}
            {!data.dateRange.from && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Calendar className="w-3 h-3" />
                تا {formatJalaliLong(data.dateRange.to)} (تمام دوره)
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            {/* ★★★ v8.4: بدون minDate/maxDate — تمام روزها قابل انتخاب */}
            <div>
              <PersianDatePicker
                value={dateFrom}
                onChange={handleFromDateChange}
                placeholder="از تاریخ (اختیاری)"
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
                title={!isOnline ? 'چاپ در حالت آفلاین غیرفعال است' : 'چاپ گزارش'}
              >
                <Printer className="w-3.5 h-3.5 ml-1" />
                چاپ
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

   {/* ★ Summary Card — کوچک و رنگی */}
<Card className={
  data.isBalanced
    ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
    : 'border-red-200 bg-gradient-to-br from-red-50 to-white'
}>
  <CardContent className="p-2.5 sm:p-3">
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
      {/* وضعیت */}
      <div className="flex items-center gap-2">
        {data.isBalanced ? (
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertCircle className="h-4 w-4 text-red-500" />
          </div>
        )}
        <div>
          <p className={`font-bold text-xs sm:text-sm ${data.isBalanced ? 'text-emerald-800' : 'text-red-800'}`}>
            {data.isBalanced ? 'تراز متعادل است ✓' : 'تراز نامتعادل!'}
          </p>
          <p className="text-[10px] text-gray-500">
            {data.isBalanced
              ? 'جمع بدهکار = جمع بستانکار'
              : `اختلاف: ${formatRial(Math.abs(data.difference))} ریال`
            }
          </p>
        </div>
      </div>

      {/* آمار */}
      <div className="flex gap-3 sm:gap-4 text-xs w-full sm:w-auto justify-between sm:justify-end">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 text-center min-w-[70px]">
          <p className="text-[9px] text-blue-600 mb-0.5">حساب‌ها</p>
          <p className="font-mono font-bold text-blue-700 text-xs sm:text-sm">{data.accountCount.toLocaleString('fa-IR')}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 text-center min-w-[70px]">
          <p className="text-[9px] text-red-600 mb-0.5">جمع بدهکار</p>
          <p className="font-mono font-bold text-red-700 text-xs sm:text-sm">{formatRial(data.grandDebit)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 text-center min-w-[70px]">
          <p className="text-[9px] text-emerald-600 mb-0.5">جمع بستانکار</p>
          <p className="font-mono font-bold text-emerald-700 text-xs sm:text-sm">{formatRial(data.grandCredit)}</p>
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
            <p className="text-sm text-gray-500">داده‌ای برای تراز آزمایشی یافت نشد</p>
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
                        {g.type === 'asset' && <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />}
                        {g.type === 'liability' && <TrendingDown className="w-3.5 h-3.5 text-red-600" />}
                        {g.type === 'equity' && <Scale className="w-3.5 h-3.5 text-purple-600" />}
                        {g.type === 'revenue' && <TrendingUp className="w-3.5 h-3.5 text-blue-600" />}
                        {g.type === 'expense' && <TrendingDown className="w-3.5 h-3.5 text-orange-600" />}
                        {g.typeLabel}
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">
                        {g.accounts.length.toLocaleString('fa-IR')} حساب
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {/* ★★★ v9.0: نمای دسکتاپ — جدول */}
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50/50">
                            <TableHead className="text-xs text-right">کد حساب</TableHead>
                            <TableHead className="text-xs text-right">نام حساب</TableHead>
                            <TableHead className="text-xs text-center">بدهکار</TableHead>
                            <TableHead className="text-xs text-center">بستانکار</TableHead>
                            <TableHead className="text-xs text-center">مانده</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.accounts.map((acc: any) => (
                            <TableRow key={acc.accountId} className="hover:bg-emerald-50/40">
                              <TableCell className="text-xs font-mono text-gray-500">{acc.accountCode}</TableCell>
                              <TableCell className="text-xs font-medium text-gray-900">{acc.accountName}</TableCell>
                              <TableCell className="text-xs text-center font-mono text-red-600">
                                {acc.totalDebit > 0 ? formatRial(acc.totalDebit) : '—'}
                              </TableCell>
                              <TableCell className="text-xs text-center font-mono text-emerald-600">
                                {acc.totalCredit > 0 ? formatRial(acc.totalCredit) : '—'}
                              </TableCell>
                              <TableCell className="text-xs text-center font-mono font-bold">
                                {acc.balanceLabel}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-gray-100 font-bold">
                            <TableCell colSpan={2} className="text-xs">جمع {g.typeLabel}</TableCell>
                            <TableCell className="text-xs text-center font-mono text-red-700">
                              {formatRial(g.subtotalDebit)}
                            </TableCell>
                            <TableCell className="text-xs text-center font-mono text-emerald-700">
                              {formatRial(g.subtotalCredit)}
                            </TableCell>
                            <TableCell className="text-xs text-center">—</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    {/* ★★★ v9.0: نمای موبایل — کارت‌ها */}
                    <div className="md:hidden space-y-2 p-3">
                      {g.accounts.map((acc: any) => {
                        const balance = acc.totalDebit - acc.totalCredit
                        return (
                          <div key={acc.accountId} className="border border-gray-200 rounded-lg p-2.5 bg-white">
                            {/* هدر کارت */}
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-gray-900 truncate">{acc.accountName}</div>
                                <div className="text-[10px] text-gray-500 font-mono">{acc.accountCode}</div>
                              </div>
                              {balance !== 0 && (
                                <Badge className={balance > 0 ? 'bg-red-100 text-red-700 text-[9px]' : 'bg-emerald-100 text-emerald-700 text-[9px]'}>
                                  {balance > 0 ? 'بدهکار' : 'بستانکار'}
                                </Badge>
                              )}
                            </div>
                            {/* مبالغ */}
                            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                              <div className="bg-red-50 rounded p-1.5 text-center">
                                <div className="text-red-600">بدهکار</div>
                                <div className="font-bold text-red-700">{acc.totalDebit > 0 ? formatRial(acc.totalDebit) : '—'}</div>
                              </div>
                              <div className="bg-emerald-50 rounded p-1.5 text-center">
                                <div className="text-emerald-600">بستانکار</div>
                                <div className="font-bold text-emerald-700">{acc.totalCredit > 0 ? formatRial(acc.totalCredit) : '—'}</div>
                              </div>
                              <div className={balance >= 0 ? 'bg-gray-50 rounded p-1.5 text-center' : 'bg-blue-50 rounded p-1.5 text-center'}>
                                <div className="text-gray-600">مانده</div>
                                <div className={`font-bold ${balance >= 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                  {balance === 0 ? '—' : formatRial(Math.abs(balance))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      {/* کارت جمع گروه */}
                      <div className="bg-gray-100 rounded-lg p-2.5 border border-gray-300">
                        <div className="text-xs font-bold text-gray-800 mb-1.5">جمع {g.typeLabel}</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-red-100 rounded p-1.5 text-center">
                            <div className="text-red-600 text-[9px]">بدهکار</div>
                            <div className="font-bold text-red-700">{formatRial(g.subtotalDebit)}</div>
                          </div>
                          <div className="bg-emerald-100 rounded p-1.5 text-center">
                            <div className="text-emerald-600 text-[9px]">بستانکار</div>
                            <div className="font-bold text-emerald-700">{formatRial(g.subtotalCredit)}</div>
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
                      <span className="font-mono text-red-700">{formatRial(data.grandDebit)}</span>
                      <span className="font-mono text-emerald-700">{formatRial(data.grandCredit)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-gray-200">
              <CardContent className="p-0">
                {/* ★★★ v9.0: نمای دسکتاپ — جدول */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs text-right">کد حساب</TableHead>
                        <TableHead className="text-xs text-right">نام حساب</TableHead>
                        <TableHead className="text-xs text-center">بدهکار</TableHead>
                        <TableHead className="text-xs text-center">بستانکار</TableHead>
                        <TableHead className="text-xs text-center">مانده</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.flatRows.map((row: any) => (
                        <TableRow key={row.accountId} className="hover:bg-emerald-50/40">
                          <TableCell className="text-xs font-mono text-gray-500">{row.accountCode}</TableCell>
                          <TableCell className="text-xs font-medium text-gray-900">{row.accountName}</TableCell>
                          <TableCell className="text-xs text-center font-mono text-red-600">
                            {row.totalDebit > 0 ? formatRial(row.totalDebit) : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-center font-mono text-emerald-600">
                            {row.totalCredit > 0 ? formatRial(row.totalCredit) : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-center font-mono font-bold">{row.balanceLabel}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-gray-100 font-bold">
                        <TableCell colSpan={2} className="text-xs">جمع کل</TableCell>
                        <TableCell className="text-xs text-center font-mono text-red-700">
                          {formatRial(data.grandDebit)}
                        </TableCell>
                        <TableCell className="text-xs text-center font-mono text-emerald-700">
                          {formatRial(data.grandCredit)}
                        </TableCell>
                        <TableCell className="text-xs text-center">—</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* ★★★ v9.0: نمای موبایل — کارت‌ها */}
                <div className="md:hidden space-y-2 p-3">
                  {data.flatRows.map((row: any) => {
                    const balance = row.totalDebit - row.totalCredit
                    return (
                      <div key={row.accountId} className="border border-gray-200 rounded-lg p-2.5 bg-white">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-900 truncate">{row.accountName}</div>
                            <div className="text-[10px] text-gray-500 font-mono">{row.accountCode}</div>
                          </div>
                          {balance !== 0 && (
                            <Badge className={balance > 0 ? 'bg-red-100 text-red-700 text-[9px]' : 'bg-emerald-100 text-emerald-700 text-[9px]'}>
                              {balance > 0 ? 'بد' : 'بس'}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                          <div className="bg-red-50 rounded p-1.5 text-center">
                            <div className="text-red-600">بدهکار</div>
                            <div className="font-bold text-red-700">{row.totalDebit > 0 ? formatRial(row.totalDebit) : '—'}</div>
                          </div>
                          <div className="bg-emerald-50 rounded p-1.5 text-center">
                            <div className="text-emerald-600">بستانکار</div>
                            <div className="font-bold text-emerald-700">{row.totalCredit > 0 ? formatRial(row.totalCredit) : '—'}</div>
                          </div>
                          <div className={balance >= 0 ? 'bg-gray-50 rounded p-1.5 text-center' : 'bg-blue-50 rounded p-1.5 text-center'}>
                            <div className="text-gray-600">مانده</div>
                            <div className={`font-bold ${balance >= 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                              {balance === 0 ? '—' : formatRial(Math.abs(balance))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {/* کارت جمع کل */}
                  <div className="bg-gradient-to-l from-emerald-100 to-blue-100 rounded-lg p-2.5 border-2 border-gray-300">
                    <div className="text-xs font-bold text-gray-800 mb-1.5">جمع کل</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-red-200 rounded p-1.5 text-center">
                        <div className="text-red-700 text-[9px]">بدهکار</div>
                        <div className="font-bold text-red-800">{formatRial(data.grandDebit)}</div>
                      </div>
                      <div className="bg-emerald-200 rounded p-1.5 text-center">
                        <div className="text-emerald-700 text-[9px]">بستانکار</div>
                        <div className="font-bold text-emerald-800">{formatRial(data.grandCredit)}</div>
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