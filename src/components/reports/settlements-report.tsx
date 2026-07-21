// ============================================================================
// src/components/reports/settlements-report.tsx — v8.6 ★★★
// ShopAccounting — Settlements Report Component
// ----------------------------------------------------------------------------
// ★★★ v8.6: این کامپوننت گزارش تسویه‌های پرداخت آنلاین را نمایش می‌دهد.
//
// ★ ویژگی‌ها:
//   ✓ فیلتر بر اساس وضعیت (pending, settled, delayed, failed)
//   ✓ فیلتر بازه تاریخ با PersianDatePicker
//   ✓ کارت‌های خلاصه (مجموع، تسویه‌شده، در انتظار، تأخیر، ناموفق)
//   ✓ جدول با جزئیات هر پرداخت
//   ✓ خروجی Excel و PDF
//   ✓ دکمه «همگام‌سازی دستی» برای اجرای cron
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Loader2, AlertCircle, CheckCircle2, XCircle, Clock, RefreshCw,
  Download, Printer, FileSpreadsheet, TrendingUp, TrendingDown,
} from 'lucide-react'
import { PersianDatePicker, formatJalaliLong } from '@/components/ui/persian-date-picker'
import { exportToExcel, printReport } from '@/lib/report-export'

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

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
}

// ═══════════════════════════════════════════════════════════════
//  Status Badge
// ═══════════════════════════════════════════════════════════════

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  settled: { label: 'تسویه‌شده', color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  pending: { label: 'در انتظار', color: 'bg-blue-100 text-blue-700', icon: <Clock className="w-3 h-3" /> },
  delayed: { label: 'تأخیر', color: 'bg-amber-100 text-amber-700', icon: <AlertCircle className="w-3 h-3" /> },
  failed: { label: 'ناموفق', color: 'bg-red-100 text-red-700', icon: <XCircle className="w-3 h-3" /> },
  partial: { label: 'جزئی', color: 'bg-purple-100 text-purple-700', icon: <Clock className="w-3 h-3" /> },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${config.color}`}>
      {config.icon}
      {config.label}
    </Badge>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Summary Card
// ═══════════════════════════════════════════════════════════════

function SummaryCard({
  title, value, icon, color, subtitle,
}: {
  title: string
  value: string
  icon: React.ReactNode
  color: string
  subtitle?: string
}) {
  return (
    <Card className={`${color} border-0`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/80 mb-1">{title}</p>
            <p className="text-lg sm:text-xl font-bold text-white font-mono truncate">{value}</p>
            {subtitle && <p className="text-[10px] text-white/70 mt-1">{subtitle}</p>}
          </div>
          <div className="text-white/80 shrink-0">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════

export function SettlementsReport({ tier }: { tier: any }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)

  // ★ فیلترها
  const today = new Date().toISOString().slice(0, 10)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string | null>(null)
  const [dateTo, setDateTo] = useState<string | null>(today)

  const currentTenant = useAppStore((s) => s.currentTenant)
  const tenantIdFromStore = useAppStore((s) => s.tenantId)
  const userTenantId = useAppStore((s) => s.user?.tenantId)
  const tenantId = resolveTenantId(currentTenant, tenantIdFromStore, userTenantId)

 const fetchReport = useCallback(async () => {
  if (!tenantId) {
    setLoading(false)
    setError('شناسه فروشگاه یافت نشد')
    return
  }
  setLoading(true)
  setError(null)
  try {
    const params = new URLSearchParams({ summary: 'true' })
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)

    const res = await fetch(`/api/payments/online/settlements?${params.toString()}`, {
      headers: { 'x-tenant-id': tenantId },
    })
    const json = await res.json()
    if (json.success && json.data) {
      setData(json.data)
    } else {
      setError(json.error || 'خطا در بارگذاری')
      setData(null)
    }
  } catch (err: any) {
    setError(err?.message || 'خطا در ارتباط با سرور')
    setData(null)
  } finally {
    setLoading(false)
  }
}, [tenantId, statusFilter, dateFrom, dateTo])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  // ★ همگام‌سازی دستی (فراخوانی cron)
  const handleManualSync = async () => {
    const cronSecret = prompt('برای اجرای دستی، CRON_SECRET را وارد کنید:')
    if (!cronSecret) return

    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/cron/settlement-sync?secret=${encodeURIComponent(cronSecret)}`, {
        method: 'GET',
      })
      const json = await res.json()
      if (json.success) {
        setSyncResult(json.data)
        // ★ بارگذاری مجدد گزارش
        await fetchReport()
      } else {
        setError(json.error || 'خطا در همگام‌سازی')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setSyncing(false)
    }
  }

  // ★ Export to Excel
  const handleExportExcel = () => {
    if (!data || !data.payments || data.payments.length === 0) return
      const rows = data.payments.map((p: any) => ({
    amount: p.amount || 0,
    gatewayFee: -(p.gatewayFee || 0),
    platformCommission: -(p.platformCommission || 0),
    netSettledAmount: p.netSettledAmount || 0,
  }))

    const section = {
      title: 'گزارش تسویه‌های پرداخت آنلاین',
      columns: [
        { header: 'تاریخ پرداخت', key: 'paidAt', type: 'text' as const, align: 'center' as const },
        { header: 'فاکتور', key: 'invoiceNumber', type: 'text' as const, align: 'center' as const },
        { header: 'مشتری', key: 'customerName', type: 'text' as const, align: 'right' as const },
        { header: 'مبلغ (ریال)', key: 'amount', type: 'currency' as const, align: 'left' as const },
        { header: 'کارمزد درگاه', key: 'gatewayFee', type: 'currency' as const, align: 'left' as const },
        { header: 'کارمزد پلتفرم', key: 'platformCommission', type: 'currency' as const, align: 'left' as const },
        { header: 'خالص واریزی', key: 'netSettledAmount', type: 'currency' as const, align: 'left' as const },
        { header: 'کد پیگیری', key: 'refId', type: 'text' as const, align: 'center' as const },
        { header: 'وضعیت', key: 'statusLabel', type: 'text' as const, align: 'center' as const },
        { header: 'تاریخ تسویه', key: 'settlementDate', type: 'text' as const, align: 'center' as const },
        { header: 'سن (روز)', key: 'settlementAgeDays', type: 'number' as const, align: 'center' as const },
      ],
      rows: data.payments.map((p: any) => ({
        ...p,
        paidAt: p.paidAt ? formatJalaliLong(p.paidAt) : '—',
        settlementDate: p.settlementDate ? formatJalaliLong(p.settlementDate) : '—',
        statusLabel: STATUS_CONFIG[p.settlementStatus]?.label || p.settlementStatus,
        gatewayFee: -p.gatewayFee,
        platformCommission: -p.platformCommission,
      })),
      subtotalRow: undefined,
    }

    exportToExcel(
      `settlements-${dateTo || today}`,
      [section],
      'گزارش تسویه‌های پرداخت آنلاین',
      `بازه: ${dateFrom ? formatJalaliLong(dateFrom) : 'ابتدا'} تا ${formatJalaliLong(dateTo || today)}`
    )
  }

  // ★ Print PDF
  const handlePrintPDF = () => {
    if (!data || !data.payments || data.payments.length === 0) return

    const title = 'گزارش تسویه‌های پرداخت آنلاین'
    const subtitle = `بازه: ${dateFrom ? formatJalaliLong(dateFrom) : 'ابتدا'} تا ${formatJalaliLong(dateTo || today)}`

    let content = ''

    // ★ خلاصه
    if (data.summary) {
      content += `<div class="kpi-grid">`
      content += `<div class="kpi-card emerald">
        <div class="kpi-title">کل پرداخت‌ها</div>
        <div class="kpi-value">${data.summary.total.toLocaleString('fa-IR')}</div>
        <div class="kpi-subtitle">${formatRial(data.summary.totalAmount)} ریال</div>
      </div>`
      content += `<div class="kpi-card emerald">
        <div class="kpi-title">تسویه‌شده</div>
        <div class="kpi-value">${data.summary.settled.toLocaleString('fa-IR')}</div>
        <div class="kpi-subtitle">${formatRial(data.summary.settledAmount)} ریال</div>
      </div>`
      content += `<div class="kpi-card blue">
        <div class="kpi-title">در انتظار</div>
        <div class="kpi-value">${data.summary.pending.toLocaleString('fa-IR')}</div>
        <div class="kpi-subtitle">${formatRial(data.summary.pendingAmount)} ریال</div>
      </div>`
      content += `<div class="kpi-card red">
        <div class="kpi-title">ناموفق/تأخیر</div>
        <div class="kpi-value">${(data.summary.failed + data.summary.delayed).toLocaleString('fa-IR')}</div>
        <div class="kpi-subtitle">نیازمند بررسی</div>
      </div>`
      content += `</div>`
    }

    // ★ جدول
    content += `<div class="section-title">جزئیات تسویه‌ها</div>`
    content += `<table>
      <tr>
        <th>تاریخ</th>
        <th>فاکتور</th>
        <th>مشتری</th>
        <th>مبلغ</th>
        <th>خالص واریزی</th>
        <th>کد پیگیری</th>
        <th>وضعیت</th>
        <th>سن (روز)</th>
      </tr>
    `
    for (const p of data.payments) {
      const statusLabel = STATUS_CONFIG[p.settlementStatus]?.label || p.settlementStatus
      const statusColor = STATUS_CONFIG[p.settlementStatus]?.color || ''
      content += `<tr>
        <td style="text-align: center; font-size: 8pt;">${p.paidAt ? formatJalaliLong(p.paidAt) : '—'}</td>
        <td style="text-align: center; font-family: monospace;">${p.invoiceNumber || '—'}</td>
        <td>${p.customerName || 'ناشناس'}</td>
        <td class="currency-cell">${formatRial(p.amount)}</td>
        <td class="currency-cell positive">${formatRial(p.netSettledAmount)}</td>
        <td style="text-align: center; font-family: monospace; font-size: 8pt;" dir="ltr">${p.refId || '—'}</td>
        <td style="text-align: center;"><span style="padding: 2px 6px; border-radius: 3px; font-size: 8pt; ${statusColor}">${statusLabel}</span></td>
        <td style="text-align: center;">${p.settlementAgeDays !== null ? p.settlementAgeDays.toLocaleString('fa-IR') : '—'}</td>
      </tr>`
    }
    content += `</table>`

    printReport(title, subtitle, content)
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="mr-3 text-sm text-gray-600">در حال بارگذاری گزارش تسویه‌ها...</span>
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

  const payments = data?.payments || []
  const summary = data?.summary

  return (
    <div className="space-y-4" dir="rtl">
      {/* ★ Filters */}
      <Card className="border-gray-200">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <PersianDatePicker
                value={dateFrom}
                onChange={setDateFrom}
                placeholder="از تاریخ (اختیاری)"
                label="از تاریخ"
                maxDate={dateTo || undefined}
              />
            </div>
            <div>
              <PersianDatePicker
                value={dateTo}
                onChange={setDateTo}
                placeholder="تا تاریخ"
                label="تا تاریخ"
                minDate={dateFrom || undefined}
              />
            </div>
            <div>
              <p style={{ fontSize: 10, color: '#a78bfa', marginBottom: 3, fontWeight: 500 }}>وضعیت تسویه</p>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="settled">تسویه‌شده</SelectItem>
                  <SelectItem value="pending">در انتظار</SelectItem>
                  <SelectItem value="delayed">تأخیر</SelectItem>
                  <SelectItem value="failed">ناموفق</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                disabled={payments.length === 0}
                className="text-xs flex-1 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-700"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 ml-1" />
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrintPDF}
                disabled={payments.length === 0}
                className="text-xs flex-1 bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700"
              >
                <Printer className="w-3.5 h-3.5 ml-1" />
                PDF
              </Button>
            </div>
          </div>

          {/* ★ دکمه همگام‌سازی دستی */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-[10px] text-gray-500">
              آخرین به‌روزرسانی: {new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSync}
              disabled={syncing}
              className="text-xs bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-700"
            >
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 ml-1" />}
              {syncing ? 'در حال همگام‌سازی...' : 'همگام‌سازی دستی'}
            </Button>
          </div>

          {/* ★ نتیجه همگام‌سازی */}
          {syncResult && (
            <Alert className="mt-3 border-emerald-200 bg-emerald-50">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <AlertDescription className="text-emerald-800 text-xs">
                همگام‌سازی کامل شد — بررسی: {syncResult.totalChecked?.toLocaleString('fa-IR')} •
                تسویه‌شده: {syncResult.settled?.toLocaleString('fa-IR')} •
                تأخیر: {syncResult.delayed?.toLocaleString('fa-IR')} •
                ناموفق: {syncResult.failed?.toLocaleString('fa-IR')}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ★ Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            title="کل پرداخت‌ها"
            value={summary.total.toLocaleString('fa-IR')}
            subtitle={`${formatRial(summary.totalAmount)} ریال`}
            icon={<TrendingUp className="w-8 h-8" />}
            color="bg-gradient-to-br from-blue-500 to-blue-600"
          />
          <SummaryCard
            title="تسویه‌شده"
            value={summary.settled.toLocaleString('fa-IR')}
            subtitle={`${formatRial(summary.settledAmount)} ریال`}
            icon={<CheckCircle2 className="w-8 h-8" />}
            color="bg-gradient-to-br from-emerald-500 to-emerald-600"
          />
          <SummaryCard
            title="در انتظار"
            value={summary.pending.toLocaleString('fa-IR')}
            subtitle={`${formatRial(summary.pendingAmount)} ریال`}
            icon={<Clock className="w-8 h-8" />}
            color="bg-gradient-to-br from-amber-500 to-orange-600"
          />
          <SummaryCard
            title="ناموفق/تأخیر"
            value={(summary.failed + summary.delayed).toLocaleString('fa-IR')}
            subtitle="نیازمند بررسی"
            icon={<TrendingDown className="w-8 h-8" />}
            color="bg-gradient-to-br from-red-500 to-red-600"
          />
        </div>
      )}

      {/* ★ Table */}
      <Card className="border-gray-200">
        <CardHeader className="p-3 border-b bg-gray-50">
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-emerald-600" />
            جزئیات تسویه‌ها
            <Badge variant="outline" className="text-[10px]">
              {payments.length.toLocaleString('fa-IR')} تراکنش
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">هیچ تراکنشی یافت نشد</p>
              <p className="text-[10px] text-gray-400 mt-1">
                با تغییر فیلترها می‌توانید نتایج دیگری ببینید
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs text-right whitespace-nowrap">تاریخ پرداخت</TableHead>
                    <TableHead className="text-xs text-right">فاکتور</TableHead>
                    <TableHead className="text-xs text-right">مشتری</TableHead>
                    <TableHead className="text-xs text-center">مبلغ</TableHead>
                    <TableHead className="text-xs text-center">خالص واریزی</TableHead>
                    <TableHead className="text-xs text-center">کد پیگیری</TableHead>
                    <TableHead className="text-xs text-center">وضعیت</TableHead>
                    <TableHead className="text-xs text-center">سن</TableHead>
                    <TableHead className="text-xs text-center">تاریخ تسویه</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p: any) => (
                    <TableRow key={p.id} className="hover:bg-emerald-50/40">
                      <TableCell className="text-xs text-gray-600 whitespace-nowrap">
                        {formatDateTime(p.paidAt)}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {p.invoiceNumber || '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{p.customerName || 'ناشناس'}</div>
                        {p.customerMobile && (
                          <div className="text-[9px] text-gray-400 font-mono" dir="ltr">{p.customerMobile}</div>
                        )}
                           <TableCell>{formatRial(p.amount)}</TableCell>
    <TableCell>{formatRial(p.netSettledAmount)}</TableCell>
                      </TableCell>
                      <TableCell className="text-xs text-center font-mono font-bold">
                        {formatRial(p.amount)}
                      </TableCell>
                      <TableCell className="text-xs text-center font-mono font-bold text-emerald-700">
                        {formatRial(p.netSettledAmount)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-blue-600 text-center" dir="ltr">
                        {p.refId || '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge status={p.settlementStatus} />
                      </TableCell>
                      <TableCell className="text-xs text-center font-mono">
                        {p.settlementAgeDays !== null ? p.settlementAgeDays.toLocaleString('fa-IR') + ' روز' : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-center text-gray-600 whitespace-nowrap">
                        {p.settlementDate ? formatJalaliLong(p.settlementDate) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default SettlementsReport
