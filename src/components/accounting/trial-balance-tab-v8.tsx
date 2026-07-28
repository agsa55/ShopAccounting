// ============================================================================
// src/components/accounting/trial-balance-tab-v8.tsx — v8.4 ★★★
// ShopAccounting — Enhanced Trial Balance Tab Component
// ----------------------------------------------------------------------------
// ★★★ v8.4: استفاده از PersianDatePicker موجود (src/components/ui/persian-date-picker)
//   بدون محدودیت minDate/maxDate — تمام روزها قابل انتخاب هستند.
//   اگر کاربر «از تاریخ» > «تا تاریخ» انتخاب کند، خودکار swap می‌شود.
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
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
  Calendar, TrendingUp, TrendingDown,
} from 'lucide-react'
// ★★★ v8.4: استفاده از PersianDatePicker موجود پروژه
import { PersianDatePicker, formatJalaliLong } from '@/components/ui/persian-date-picker'

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
//  Main Component
// ═══════════════════════════════════════════════════════════════

export function TrialBalanceTabV8() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)

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
      // اگر «از تاریخ» بعد از «تا تاریخ» انتخاب شد، «تا تاریخ» را همان روز قرار بده
      setDateTo(iso)
    }
    setDateFrom(iso)
  }

  const handleToDateChange = (iso: string | null) => {
    if (iso && dateFrom && iso < dateFrom) {
      // اگر «تا تاریخ» قبل از «از تاریخ» انتخاب شد، «از تاریخ» را همان روز قرار بده
      setDateFrom(iso)
    }
    setDateTo(iso)
  }

  const fetchReport = useCallback(async () => {
    if (!tenantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
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
  }, [tenantId, dateFrom, dateTo, includeZero, groupByType])

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
      {/* ★ Header & Filters */}
      <Card className="border-gray-200">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-3">
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
                disabled={isEmpty}
                className="text-xs flex-1"
              >
                <Printer className="w-3.5 h-3.5 ml-1" />
                چاپ
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ★ Summary Card */}
      <Card className={
        data.isBalanced
          ? 'border-emerald-200 bg-emerald-50/50'
          : 'border-red-200 bg-red-50/50'
      }>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            {data.isBalanced ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            ) : (
              <AlertCircle className="h-6 w-6 text-red-500" />
            )}
            <div>
              <p className="font-semibold text-sm">
                {data.isBalanced ? 'تراز متعادل است' : 'تراز نامتعادل!'}
              </p>
              <p className="text-xs text-gray-600">
                {data.isBalanced
                  ? 'مجموع بدهکار با مجموع بستانکار برابر است'
                  : `اختلاف: ${formatRial(Math.abs(data.difference))} ریال`
                }
              </p>
            </div>
          </div>
          <div className="flex gap-6 text-sm">
            <div className="text-center">
              <p className="text-gray-500 text-xs">حساب‌ها</p>
              <p className="font-mono font-semibold">{data.accountCount.toLocaleString('fa-IR')}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-xs">جمع بدهکار</p>
              <p className="font-mono font-semibold text-red-600">{formatRial(data.grandDebit)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500 text-xs">جمع بستانکار</p>
              <p className="font-mono font-semibold text-emerald-600">{formatRial(data.grandCredit)}</p>
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
                    <div className="flex items-center justify-between">
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
                  </CardContent>
                </Card>
              ))}

              <Card className="border-2 border-gray-300 bg-gradient-to-l from-emerald-50 to-blue-50">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between text-sm font-bold">
                    <span className="text-gray-900">جمع کل تراز</span>
                    <div className="flex gap-6">
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
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

export default TrialBalanceTabV8
