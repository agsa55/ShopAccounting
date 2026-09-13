// ============================================================================
// src/components/accounting/ledger-tab-v8.tsx — v8.4 ★★★
// ShopAccounting — Enhanced General Ledger Tab Component
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Loader2, AlertCircle, BookOpen, Download, Printer,
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
//  Source Type Labels
// ═══════════════════════════════════════════════════════════════

const SOURCE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  manual:          { label: 'دستی',              color: 'bg-gray-100 text-gray-700' },
  invoice:         { label: 'فاکتور فروش',        color: 'bg-emerald-100 text-emerald-700' },
  online_payment:  { label: 'پرداخت آنلاین',       color: 'bg-blue-100 text-blue-700' },
  purchase:        { label: 'فاکتور خرید',        color: 'bg-amber-100 text-amber-700' },
  check:           { label: 'چک',                 color: 'bg-purple-100 text-purple-700' },
  adjustment:      { label: 'تعدیل',              color: 'bg-cyan-100 text-cyan-700' },
  recurring:       { label: 'تکرارشونده',          color: 'bg-pink-100 text-pink-700' },
}

function getSourceBadge(sourceType?: string) {
  if (!sourceType) return null
  const config = SOURCE_TYPE_LABELS[sourceType] || { label: sourceType, color: 'bg-gray-100 text-gray-700' }
  return (
    <Badge variant="outline" className={`text-[9px] ${config.color}`}>
      {config.label}
    </Badge>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════

export function LedgerTabV8() {
  const [loading, setLoading] = useState(false)
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [accounts, setAccounts] = useState<any[]>([])

  // ★ فیلترها (مقدار به‌صورت ISO میلادی یا null)
  const today = new Date().toISOString().slice(0, 10)
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string | null>(null)
  const [dateTo, setDateTo] = useState<string | null>(today)

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

  // ★ لود لیست حساب‌ها
  useEffect(() => {
    if (!tenantId) {
      setAccountsLoading(false)
      return
    }
    setAccountsLoading(true)
    fetch(`/api/accounts?tenantId=${tenantId}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          const list = json.data?.accounts || json.data || []
          setAccounts(list.sort((a: any, b: any) => (a.code || '').localeCompare(b.code || '')))
        }
      })
      .catch(err => console.error('[Ledger] Accounts load error:', err))
      .finally(() => setAccountsLoading(false))
  }, [tenantId])

  // ★ لود دفتر کل
  const fetchLedger = useCallback(async () => {
    if (!tenantId || !selectedAccountId) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        accountId: selectedAccountId,
      })
      if (dateTo) params.set('dateTo', dateTo)
      if (dateFrom) params.set('dateFrom', dateFrom)

      const res = await fetch(`/api/reports/ledger?${params.toString()}`, {
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
  }, [tenantId, selectedAccountId, dateFrom, dateTo])

  useEffect(() => {
    fetchLedger()
  }, [fetchLedger])

  // ★ Export to Excel
  const handleExport = () => {
    if (!data) return
    const headers = ['ردیف', 'تاریخ', 'شماره سند', 'شرح', 'بدهکار', 'بستانکار', 'مانده']
    const rows: any[][] = []

    if (data.openingBalance !== 0) {
      rows.push(['', '', '', 'مانده ابتدای دوره', '', '', data.openingBalanceLabel])
    }

    data.rows.forEach((r: any, i: number) => {
      rows.push([
        i + 1,
        formatJalaliLong(r.date),
        r.journalNumber,
        r.lineDescription || r.description,
        r.debit,
        r.credit,
        r.balanceLabel,
      ])
    })

    rows.push(['', '', '', 'جمع دوره', data.totalDebit, data.totalCredit, ''])
    rows.push(['', '', '', 'مانده پایان دوره', '', '', data.closingBalanceLabel])

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ledger-${data.account.code}-${dateTo || today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════

  if (accountsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="mr-3 text-sm text-gray-600">در حال بارگذاری لیست حساب‌ها...</span>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-6 space-y-4" dir="rtl">
      {/* ★ Header & Filters */}
      <Card className="border-gray-200">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-gray-900">دفتر کل</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="col-span-1 sm:col-span-2">
              <Label className="text-xs text-gray-600 mb-1 block">انتخاب حساب</Label>
              <Select
                value={selectedAccountId}
                onValueChange={setSelectedAccountId}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="یک حساب انتخاب کنید..." />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {accounts.map((acc: any) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      <span className="font-mono text-[10px] ml-2 text-gray-500">{acc.code}</span>
                      {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          </div>

          {data && (
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={loading}
                className="text-xs"
              >
                <Download className="w-3.5 h-3.5 ml-1" />
                خروجی Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                disabled={loading}
                className="text-xs"
              >
                <Printer className="w-3.5 h-3.5 ml-1" />
                چاپ
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ★ Error */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {/* ★ No account selected */}
      {!selectedAccountId && !error && (
        <Card className="border-gray-200">
          <CardContent className="py-16 text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">یک حساب انتخاب کنید تا دفتر کل آن نمایش داده شود</p>
          </CardContent>
        </Card>
      )}

      {/* ★ Loading */}
      {loading && selectedAccountId && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <span className="mr-3 text-sm text-gray-600">در حال محاسبه دفتر کل...</span>
        </div>
      )}

      {/* ★ Data Display */}
      {data && !loading && (
        <>
          {/* ★ Account Info Card */}
          <Card className="border-emerald-200 bg-emerald-50/30">
            <CardContent className="p-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      <span className="font-mono text-emerald-600 ml-2">{data.account.code}</span>
                      {data.account.name}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      نوع: {data.account.type || '—'}
                      {data.dateRange.from && (
                        <span className="mr-3">
                          بازه: {formatJalaliLong(data.dateRange.from)} تا {formatJalaliLong(data.dateRange.to)}
                        </span>
                      )}
                      {!data.dateRange.from && (
                        <span className="mr-3">
                          بازه: تا {formatJalaliLong(data.dateRange.to)} (تمام دوره)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 text-xs">
                  <div className="text-center">
                    <p className="text-gray-500 mb-0.5">مانده ابتدای دوره</p>
                    <p className="font-mono font-bold text-blue-700">{data.openingBalanceLabel}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 mb-0.5">جمع بدهکار</p>
                    <p className="font-mono font-bold text-red-600">{formatRial(data.totalDebit)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500 mb-0.5">جمع بستانکار</p>
                    <p className="font-mono font-bold text-emerald-600">{formatRial(data.totalCredit)}</p>
                  </div>
                  <div className="text-center bg-emerald-100 -m-1 p-1 rounded">
                    <p className="text-emerald-700 mb-0.5">مانده پایان دوره</p>
                    <p className="font-mono font-bold text-emerald-800">{data.closingBalanceLabel}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ★ Ledger Table */}
          {data.rows.length === 0 ? (
            <Card className="border-gray-200">
              <CardContent className="py-16 text-center">
                <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-500">
                  {data.openingBalance !== 0
                    ? 'در این بازه، حرکتی برای این حساب ثبت نشده است'
                    : 'هیچ حرکتی برای این حساب ثبت نشده است'
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-gray-200">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs text-right whitespace-nowrap">تاریخ</TableHead>
                        <TableHead className="text-xs text-right">شماره سند</TableHead>
                        <TableHead className="text-xs text-right">شرح</TableHead>
                        <TableHead className="text-xs text-center">مبدأ</TableHead>
                        <TableHead className="text-xs text-center">بدهکار</TableHead>
                        <TableHead className="text-xs text-center">بستانکار</TableHead>
                        <TableHead className="text-xs text-center">مانده</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* ردیف مانده ابتدای دوره */}
                      {data.openingBalance !== 0 && (
                        <TableRow className="bg-blue-50/50 font-medium">
                          <TableCell colSpan={3} className="text-xs text-blue-700 italic">
                            مانده ابتدای دوره
                          </TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-xs text-center font-mono font-bold text-blue-700">
                            {data.openingBalanceLabel}
                          </TableCell>
                        </TableRow>
                      )}

                      {/* ردیف‌های حرکت‌ها */}
                      {data.rows.map((r: any, i: number) => (
                        <TableRow key={i} className="hover:bg-emerald-50/40">
                          <TableCell className="text-xs text-gray-600 whitespace-nowrap">
                            {formatJalaliLong(r.date)}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-blue-600">
                            {r.journalNumber || '—'}
                          </TableCell>
                          <TableCell className="text-xs text-gray-700">
                            <div className="font-medium">{r.lineDescription || r.description || '—'}</div>
                            {r.description && r.lineDescription && r.description !== r.lineDescription && (
                              <div className="text-[9px] text-gray-400 mt-0.5">{r.description}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{getSourceBadge(r.sourceType)}</TableCell>
                          <TableCell className="text-xs text-center font-mono text-red-600">
                            {r.debit > 0 ? formatRial(r.debit) : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-center font-mono text-emerald-600">
                            {r.credit > 0 ? formatRial(r.credit) : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-center font-mono font-bold">
                            {r.balanceLabel}
                          </TableCell>
                        </TableRow>
                      ))}

                      {/* ردیف جمع کل */}
                      <TableRow className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <TableCell colSpan={4} className="text-xs">جمع دوره</TableCell>
                        <TableCell className="text-xs text-center font-mono text-red-700">
                          {formatRial(data.totalDebit)}
                        </TableCell>
                        <TableCell className="text-xs text-center font-mono text-emerald-700">
                          {formatRial(data.totalCredit)}
                        </TableCell>
                        <TableCell className="text-xs text-center">—</TableCell>
                      </TableRow>

                      {/* ردیف مانده پایان دوره */}
                      <TableRow className="bg-gradient-to-l from-emerald-100 to-blue-100 font-bold">
                        <TableCell colSpan={6} className="text-xs text-gray-900">مانده پایان دوره</TableCell>
                        <TableCell className="text-xs text-center font-mono text-emerald-800">
                          {data.closingBalanceLabel}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

export default LedgerTabV8
