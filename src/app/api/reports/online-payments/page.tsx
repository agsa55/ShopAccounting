// ============================================================================
// src/app/reports/online-payments/page.tsx — v8.2 ★★★
// ShopAccounting — Online Payments Report Page
// ----------------------------------------------------------------------------
// ★ گزارش کامل پرداخت‌های آنلاین با تفکیک:
//   - مبلغ فاکتور
//   - کارمزد زرین‌پال
//   - کارمزد پلتفرم
//   - مبلغ خالص واریزی
//   - وضعیت سند حسابداری
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  TrendingUp,
  TrendingDown,
  CreditCard,
  Loader2,
  Search,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
} from 'lucide-react'

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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
}

// ═══════════════════════════════════════════════════════════════
//  Summary Cards
// ═══════════════════════════════════════════════════════════════

function SummaryCard({
  title,
  value,
  icon,
  color,
  subtitle,
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/80 mb-1">{title}</p>
            <p className="text-xl font-bold text-white font-mono">{value}</p>
            {subtitle && <p className="text-[10px] text-white/70 mt-1">{subtitle}</p>}
          </div>
          <div className="text-white/80">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Status Badge
// ═══════════════════════════════════════════════════════════════

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: any; icon?: React.ReactNode }> = {
    paid: { label: 'موفق', variant: 'default', icon: <CheckCircle2 className="w-3 h-3" /> },
    pending: { label: 'در انتظار', variant: 'secondary', icon: <Clock className="w-3 h-3" /> },
    failed: { label: 'ناموفق', variant: 'destructive', icon: <XCircle className="w-3 h-3" /> },
    cancelled: { label: 'لغو شده', variant: 'outline', icon: <XCircle className="w-3 h-3" /> },
  }
  const c = config[status] || config.pending
  return (
    <Badge variant={c.variant} className="gap-1 text-xs">
      {c.icon}
      {c.label}
    </Badge>
  )
}

function SettlementBadge({ status, hasJournal }: { status?: string | null; hasJournal: boolean }) {
  if (!status) {
    return hasJournal ? (
      <Badge variant="default" className="gap-1 text-xs">
        <FileText className="w-3 h-3" />
        سند صادر شده
      </Badge>
    ) : (
      <Badge variant="outline" className="text-xs">—</Badge>
    )
  }
  const config: Record<string, { label: string; variant: any }> = {
    settled: { label: 'تسویه شده', variant: 'default' },
    pending: { label: 'در انتظار تسویه', variant: 'secondary' },
    failed: { label: 'ناموفق', variant: 'destructive' },
    partial: { label: 'تسویه جزیی', variant: 'outline' },
  }
  const c = config[status] || config.pending
  return <Badge variant={c.variant} className="text-xs">{c.label}</Badge>
}

// ═══════════════════════════════════════════════════════════════
//  Main Page Component
// ═══════════════════════════════════════════════════════════════

export default function OnlinePaymentsReportPage() {
  const [payments, setPayments] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ★ فیلترها
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [settlementFilter, setSettlementFilter] = useState<string>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [search, setSearch] = useState('')

  // ★ صفحه‌بندی
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const limit = 20

  const currentTenant = useAppStore((s) => s.currentTenant)
  const tenantIdFromStore = useAppStore((s) => s.tenantId)
  const userTenantId = useAppStore((s) => s.user?.tenantId)

  const tenantId = resolveTenantId(currentTenant, tenantIdFromStore, userTenantId)

  const fetchPayments = useCallback(async () => {
    if (!tenantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        tenantId,
        page: String(page),
        limit: String(limit),
        summary: 'true',
      })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (settlementFilter !== 'all') params.set('settlementStatus', settlementFilter)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/payments/online?${params.toString()}`)
      const data = await res.json()

      if (data.success) {
        setPayments(data.data?.payments || [])
        setSummary(data.data?.summary || null)
        setTotal(data.pagination?.total || 0)
        setTotalPages(data.pagination?.totalPages || 1)
      } else {
        setError(data.error || 'خطا در بارگذاری')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setLoading(false)
    }
  }, [tenantId, page, statusFilter, settlementFilter, startDate, endDate])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  // ★ فیلتر محلی برای جستجو
  const filteredPayments = payments.filter(p => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      p.invoiceNumber?.toLowerCase().includes(s) ||
      p.customerName?.toLowerCase().includes(s) ||
      p.customerMobile?.toLowerCase().includes(s) ||
      p.refId?.toLowerCase().includes(s)
    )
  })

  // ★ Export to CSV
  const handleExport = () => {
    const headers = [
      'تاریخ',
      'فاکتور',
      'مشتری',
      'موبایل',
      'مبلغ فاکتور',
      'کارمزد زرین‌پال',
      'کارمزد پلتفرم',
      'خالص واریزی',
      'کد پیگیری',
      'وضعیت',
      'شماره کارت',
      'سند',
    ]
    const rows = filteredPayments.map(p => [
      formatDate(p.paidAt),
      p.invoiceNumber || '',
      p.customerName || '',
      p.customerMobile || '',
      p.amount,
      p.gatewayFee,
      p.platformCommission,
      p.netSettledAmount,
      p.refId || '',
      p.status,
      p.cardPan || '',
      p.journalEntryId ? 'دارد' : 'ندارد',
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `online-payments-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-7xl">
      {/* ★ Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            گزارش پرداخت‌های آنلاین
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            گزارش کامل پرداخت‌های آنلاین با تفکیک کارمزدهای تسهیم فردایی
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={filteredPayments.length === 0}
          className="text-xs"
        >
          <Download className="w-3.5 h-3.5 ml-1" />
          خروجی Excel
        </Button>
      </div>

      {/* ★ Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            title="مبلغ کل پرداخت‌ها"
            value={`${formatRial(summary.totalAmount)} ریال`}
            subtitle={`${summary.totalPayments} تراکنش`}
            icon={<TrendingUp className="w-8 h-8" />}
            color="bg-gradient-to-br from-emerald-500 to-emerald-600"
          />
          <SummaryCard
            title="کارمزد زرین‌پال"
            value={`${formatRial(summary.totalGatewayFee)} ریال`}
            subtitle={`${summary.totalAmount > 0 ? ((summary.totalGatewayFee / summary.totalAmount) * 100).toFixed(2) : 0}٪`}
            icon={<TrendingDown className="w-8 h-8" />}
            color="bg-gradient-to-br from-red-500 to-red-600"
          />
          <SummaryCard
            title="کارمزد پلتفرم"
            value={`${formatRial(summary.totalPlatformCommission)} ریال`}
            subtitle={`${summary.totalAmount > 0 ? ((summary.totalPlatformCommission / summary.totalAmount) * 100).toFixed(2) : 0}٪`}
            icon={<TrendingDown className="w-8 h-8" />}
            color="bg-gradient-to-br from-orange-500 to-orange-600"
          />
          <SummaryCard
            title="خالص واریزی به فروشگاه‌ها"
            value={`${formatRial(summary.totalNetSettled)} ریال`}
            subtitle={`${summary.totalAmount > 0 ? ((summary.totalNetSettled / summary.totalAmount) * 100).toFixed(2) : 0}٪`}
            icon={<TrendingUp className="w-8 h-8" />}
            color="bg-gradient-to-br from-blue-500 to-blue-600"
          />
        </div>
      )}

      {/* ★ Filters */}
      <Card className="border-gray-200">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-gray-500">وضعیت پرداخت</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="paid">موفق</SelectItem>
                  <SelectItem value="pending">در انتظار</SelectItem>
                  <SelectItem value="failed">ناموفق</SelectItem>
                  <SelectItem value="cancelled">لغو شده</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-gray-500">وضعیت تسویه</Label>
              <Select value={settlementFilter} onValueChange={(v) => { setSettlementFilter(v); setPage(1) }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="settled">تسویه شده</SelectItem>
                  <SelectItem value="pending">در انتظار</SelectItem>
                  <SelectItem value="failed">ناموفق</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-gray-500">از تاریخ</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-gray-500">تا تاریخ</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-gray-500">جستجو</Label>
              <div className="relative">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="فاکتور، مشتری، کد پیگیری..."
                  className="h-8 text-xs pr-7"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ★ Error */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {/* ★ Table */}
      <Card className="border-gray-200">
        <CardHeader className="p-3">
          <CardTitle className="text-sm">
            تراکنش‌ها ({total.toLocaleString('fa-IR')})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <span className="mr-2 text-sm text-gray-600">در حال بارگذاری...</span>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              هیچ پرداخت آنلاینی یافت نشد
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs text-right">تاریخ</TableHead>
                    <TableHead className="text-xs text-right">فاکتور</TableHead>
                    <TableHead className="text-xs text-right">مشتری</TableHead>
                    <TableHead className="text-xs text-right">مبلغ</TableHead>
                    <TableHead className="text-xs text-right text-red-600">کارمزد درگاه</TableHead>
                    <TableHead className="text-xs text-right text-orange-600">کارمزد پلتفرم</TableHead>
                    <TableHead className="text-xs text-right text-emerald-700">خالص واریزی</TableHead>
                    <TableHead className="text-xs text-right">کد پیگیری</TableHead>
                    <TableHead className="text-xs text-right">وضعیت</TableHead>
                    <TableHead className="text-xs text-right">سند</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((p) => (
                    <TableRow key={p.id} className="hover:bg-gray-50">
                      <TableCell className="text-xs text-gray-600 whitespace-nowrap">
                        {formatDate(p.paidAt)}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {p.invoiceNumber || '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium text-gray-700">{p.customerName || 'ناشناس'}</div>
                        {p.customerMobile && (
                          <div className="text-[10px] text-gray-400 font-mono" dir="ltr">{p.customerMobile}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-bold">
                        {formatRial(p.amount)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-red-600">
                        {p.gatewayFee > 0 ? `- ${formatRial(p.gatewayFee)}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-orange-600">
                        {p.platformCommission > 0 ? `- ${formatRial(p.platformCommission)}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-bold text-emerald-700">
                        {formatRial(p.netSettledAmount || p.amount)}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-blue-600" dir="ltr">
                        {p.refId || '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell>
                        <SettlementBadge status={p.settlementStatus} hasJournal={p.hasJournalEntry} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ★ Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-gray-500">
            صفحه {page.toLocaleString('fa-IR')} از {totalPages.toLocaleString('fa-IR')}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="text-xs h-8"
            >
              قبلی
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="text-xs h-8"
            >
              بعدی
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
