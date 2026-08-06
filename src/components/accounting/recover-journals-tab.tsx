// ============================================================================
// src/components/accounting/recover-journals-tab.tsx — v8.3 ★★★
// ShopAccounting — Recover Missing Journal Entries (Tab Component)
// ----------------------------------------------------------------------------
// ★★★ v8.3: این کامپوننت یک tab مستقل است که می‌تواند در:
//   ۱) صفحه admin/recover-journals/page.tsx (دسترسی مستقیم از sidebar)
//   ۲) صفحه accounting/journal-entries-page.tsx (به‌عنوان یک تب)
//   استفاده شود.
//
// ★ ویژگی‌ها:
//   ✓ نمایش لیست پرداخت‌های موفق بدون سند حسابداری
//   ✓ خلاصه آماری (تعداد، مبلغ کل، کارمزدها)
//   ✓ شبیه‌سازی (Dry Run) قبل از اجرای واقعی
//   ✓ بازیابی انتخابی (فقط پرداخت‌های انتخاب‌شده)
//   ✓ بازیابی گروهی (تمام پرداخت‌های گمشده)
//   ✓ نمایش نتیجه با جزئیات کامل
//   ✓ RTL کامل
//
// ★ دسترسی: فقط مدیران (Admin, Manager, Owner)
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Loader2, AlertCircle, CheckCircle2, XCircle, RefreshCw, PlayCircle,
  AlertTriangle, FileText, Eye,
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
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/80 mb-1">{title}</p>
            <p className="text-lg sm:text-xl font-bold text-white font-mono truncate">{value}</p>
            {subtitle && <p className="text-[10px] text-white/70 mt-1">{subtitle}</p>}
          </div>
          <div className="text-white/80 shrink-0 mr-2">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Recovery Result Modal
// ═══════════════════════════════════════════════════════════════

function RecoveryResultModal({
  results,
  onClose,
}: {
  results: any
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <Card className="w-full max-w-4xl max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              نتیجه بازیابی اسناد
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>بستن</Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 overflow-y-auto max-h-[60vh]">
          {/* خلاصه */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-gray-50 rounded p-2 text-center">
              <div className="text-xs text-gray-500">کل پردازش‌شده</div>
              <div className="text-lg font-bold text-gray-900">{results.totalProcessed.toLocaleString('fa-IR')}</div>
            </div>
            <div className="bg-emerald-50 rounded p-2 text-center">
              <div className="text-xs text-emerald-600">موفق</div>
              <div className="text-lg font-bold text-emerald-700">{results.successCount.toLocaleString('fa-IR')}</div>
            </div>
            <div className="bg-red-50 rounded p-2 text-center">
              <div className="text-xs text-red-600">خطا</div>
              <div className="text-lg font-bold text-red-700">{results.failedCount.toLocaleString('fa-IR')}</div>
            </div>
            <div className="bg-amber-50 rounded p-2 text-center">
              <div className="text-xs text-amber-600">رد شده</div>
              <div className="text-lg font-bold text-amber-700">{results.skippedCount.toLocaleString('fa-IR')}</div>
            </div>
          </div>

          {/* جدول نتایج */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-xs text-right">فاکتور</TableHead>
                  <TableHead className="text-xs text-right">مبلغ</TableHead>
                  <TableHead className="text-xs text-right">وضعیت</TableHead>
                  <TableHead className="text-xs text-right">شماره سند</TableHead>
                  <TableHead className="text-xs text-right">توضیحات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.results.map((r: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-mono">{r.invoiceNumber || '—'}</TableCell>
                    <TableCell className="text-xs font-mono">{formatRial(r.amount)}</TableCell>
                    <TableCell>
                      {r.status === 'success' && (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1">
                          <CheckCircle2 className="w-3 h-3" /> موفق
                        </Badge>
                      )}
                      {r.status === 'failed' && (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="w-3 h-3" /> خطا
                        </Badge>
                      )}
                      {r.status === 'skipped' && (
                        <Badge variant="secondary" className="gap-1">
                          <AlertCircle className="w-3 h-3" /> رد شد
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-blue-600">
                      {r.journalNumber || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-gray-600">
                      {r.error || r.reason || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Main Component — RecoverJournalsTab
// ═══════════════════════════════════════════════════════════════

interface RecoverJournalsTabProps {
  /** اگر true باشد، هدر و container اصلی نمایش داده نمی‌شود (برای استفاده در تب) */
  embedded?: boolean
}

export function RecoverJournalsTab({ embedded = false }: RecoverJournalsTabProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missingData, setMissingData] = useState<any>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [recovering, setRecovering] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<any>(null)
  const [recoveryResult, setRecoveryResult] = useState<any>(null)
  const [showResultModal, setShowResultModal] = useState(false)

  const currentTenant = useAppStore((s) => s.currentTenant)
  const tenantIdFromStore = useAppStore((s) => s.tenantId)
  const userTenantId = useAppStore((s) => s.user?.tenantId)

  const tenantId = resolveTenantId(currentTenant, tenantIdFromStore, userTenantId)

   const fetchMissing = useCallback(async () => {
    if (!tenantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      // ★★★ اصلاح ۱: حذف tenantId از URL (Middleware خودش مدیریت می‌کند)
      const res = await fetch('/api/payments/online/missing-journals')
      
      // ★★★ اصلاح ۲: جلوگیری از خطای Unexpected token '<' با بررسی وضعیت پاسخ
      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`خطای سرور (${res.status}): مسیر API ممکن است اشتباه باشد یا دسترسی ندارید.`)
      }
      
      const data = await res.json()
      if (data.success) {
        setMissingData(data.data)
        setSelectedIds(new Set(data.data.payments.map((p: any) => p.id)))
      } else {
        setError(data.error || 'خطا در بارگذاری')
      }
    } catch (err: any) {
      console.error('[RecoverJournals] Fetch error:', err)
      setError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setLoading(false)
    }
  }, [tenantId])
  useEffect(() => {
    fetchMissing()
  }, [fetchMissing])

  // ★ انتخاب/لغو انتخاب همه
  const toggleSelectAll = () => {
    if (!missingData) return
    if (selectedIds.size === missingData.payments.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(missingData.payments.map((p: any) => p.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  // ★ شبیه‌سازی (Dry Run)
  const handleDryRun = async () => {
    setRecovering(true)
    setError(null)
    setDryRunResult(null)
    try {
      const res = await fetch('/api/payments/online/recover-journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // ★★★ حذف tenantId از body (Middleware مدیریت می‌کند)
          paymentIds: Array.from(selectedIds),
          dryRun: true,
        }),
      })
      
      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`خطای سرور (${res.status}) در شبیه‌سازی`)
      }

      const data = await res.json()
      if (data.success) {
        setDryRunResult(data.data)
      } else {
        setError(data.error || 'خطا در شبیه‌سازی')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setRecovering(false)
    }
  }

  // ★ بازیابی واقعی
   const handleRecover = async () => {
    if (!confirm(`آیا از بازیابی ${selectedIds.size.toLocaleString('fa-IR')} سند مطمئن هستید؟`)) {
      return
    }
    setRecovering(true)
    setError(null)
    setRecoveryResult(null)
    try {
      const res = await fetch('/api/payments/online/recover-journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // ★★★ حذف tenantId از body
          paymentIds: Array.from(selectedIds),
          dryRun: false,
        }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`خطای سرور (${res.status}) در بازیابی`)
      }

      const data = await res.json()
      if (data.success) {
        setRecoveryResult(data.data)
        setShowResultModal(true)
        await fetchMissing()
      } else {
        setError(data.error || 'خطا در بازیابی')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setRecovering(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════

  const content = (
    <div className="space-y-4" dir="rtl">
      {/* ★ Alert راهنما */}
          {/* ★ Alert راهنمای کاربرپسند و حرفه‌ای */}
      <Alert className="border-blue-200 bg-blue-50/80">
        <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <AlertDescription className="text-blue-900 text-sm leading-6">
          <strong className="block text-base mb-1.5 text-blue-800">💡 این ابزار چه کاری انجام می‌دهد؟</strong>
          <ul className="list-disc list-inside space-y-1.5 mr-1 text-blue-800/90">
            <li>
              <strong>شناسایی هوشمند:</strong> پرداخت‌های آنلاین موفقی که به هر دلیلی (مثل قطعی شبکه) سند حسابداری برایشان صادر نشده است را پیدا می‌کند.
            </li>
            <li>
              <strong>کاملاً امن و قابل بررسی:</strong> پیشنهاد می‌شود ابتدا دکمه <span className="font-bold bg-blue-100 px-1.5 py-0.5 rounded text-blue-700">شبیه‌سازی</span> را بزنید. با این کار، سیستم بدون ثبت نهایی، به شما نشان می‌دهد که چه اسنادی قرار است صادر شوند.
            </li>
            <li>
              <strong>صدور خودکار و استاندارد:</strong> پس از تأیید، با زدن دکمه «بازیابی»، اسناد حسابداری مربوطه به‌صورت خودکار، با رعایت اصول بدهکار/بستانکار و با شماره‌گذاری صحیح صادر می‌شوند.
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* ★ Error */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {/* ★ Loading */}
      {loading && (
        <Card className="border-gray-200">
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <span className="mr-3 text-sm text-gray-600">در حال بارگذاری...</span>
          </CardContent>
        </Card>
      )}

      {/* ★ Summary Cards */}
      {!loading && missingData && missingData.missingCount > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              title="تعداد پرداخت‌های گمشده"
              value={missingData.missingCount.toLocaleString('fa-IR')}
              subtitle="نیازمند سند حسابداری"
              icon={<AlertTriangle className="w-8 h-8" />}
              color="bg-gradient-to-br from-amber-500 to-orange-600"
            />
            <SummaryCard
              title="مبلغ کل"
              value={`${formatRial(missingData.totalAmount)} ریال`}
              subtitle="مبلغ پرداخت‌شده توسط مشتریان"
              icon={<FileText className="w-8 h-8" />}
              color="bg-gradient-to-br from-blue-500 to-blue-600"
            />
           <SummaryCard
  title="کارمزد درگاه پرداخت"
  value={`${formatRial(missingData.totalGatewayFee)} ریال`}
  subtitle="هزینه کسر شده توسط درگاه"
  icon={<FileText className="w-8 h-8" />}
  color="bg-gradient-to-br from-red-500 to-red-600"
/>
            <SummaryCard
              title="خالص واریزی"
              value={`${formatRial(missingData.totalNetSettled)} ریال`}
              subtitle="مبلغ واریزی به فروشگاه‌ها"
              icon={<CheckCircle2 className="w-8 h-8" />}
              color="bg-gradient-to-br from-emerald-500 to-emerald-600"
            />
          </div>

          {/* ★ Actions */}
          <Card className="border-gray-200">
            <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm text-gray-600">
                <span className="font-bold text-emerald-600">{selectedIds.size.toLocaleString('fa-IR')}</span>
                {' '}پرداخت انتخاب شده است
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDryRun}
                  disabled={recovering || selectedIds.size === 0}
                  className="text-xs"
                >
                  {recovering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                  شبیه‌سازی
                </Button>
                <Button
                  size="sm"
                  onClick={handleRecover}
                  disabled={recovering || selectedIds.size === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                >
                  {recovering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                  بازیابی {selectedIds.size.toLocaleString('fa-IR')} سند
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ★ Dry Run Result */}
          {dryRunResult && (
            <Alert className="border-emerald-200 bg-emerald-50">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <AlertDescription className="text-emerald-800 text-sm">
                <strong>نتیجه شبیه‌سازی:</strong> {dryRunResult.totalProcessed.toLocaleString('fa-IR')} پرداخت پردازش خواهند شد.
                پس از تأیید، {dryRunResult.totalProcessed.toLocaleString('fa-IR')} سند حسابداری ۴ ردیفی صادر خواهد شد.
              </AlertDescription>
            </Alert>
          )}

          {/* ★ Table */}
          <Card className="border-gray-200">
            <CardHeader className="p-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">لیست پرداخت‌های گمشده</CardTitle>
                <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="text-xs">
                  {selectedIds.size === missingData.payments.length ? 'لغو همه' : 'انتخاب همه'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-12"></TableHead>
                      <TableHead className="text-xs text-right">تاریخ پرداخت</TableHead>
                      <TableHead className="text-xs text-right">فاکتور</TableHead>
                      <TableHead className="text-xs text-right">مشتری</TableHead>
                      <TableHead className="text-xs text-right">مبلغ</TableHead>
                      <TableHead className="text-xs text-right">کارمزد درگاه</TableHead>
                      <TableHead className="text-xs text-right">خالص واریزی</TableHead>
                      <TableHead className="text-xs text-right">کد پیگیری</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {missingData.payments.map((p: any) => (
                      <TableRow
                        key={p.id}
                        className={`cursor-pointer hover:bg-gray-50 ${selectedIds.has(p.id) ? 'bg-emerald-50/50' : ''}`}
                        onClick={() => toggleSelect(p.id)}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(p.id)}
                            onCheckedChange={() => toggleSelect(p.id)}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-gray-600 whitespace-nowrap">
                          {formatDate(p.paidAt)}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {p.invoiceNumber || '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.customerName || 'ناشناس'}
                        </TableCell>
                        <TableCell className="text-xs font-mono font-bold">
                          {formatRial(p.amount)}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-red-600">
                          {p.gatewayFee > 0 ? `- ${formatRial(p.gatewayFee)}` : '—'}
                        </TableCell>
                        <TableCell className="text-xs font-mono font-bold text-emerald-700">
                          {formatRial(p.netSettledAmount || p.amount)}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-blue-600" dir="ltr">
                          {p.refId || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ★ No missing */}
      {!loading && missingData && missingData.missingCount === 0 && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-emerald-500" />
            <h3 className="text-lg font-bold text-emerald-800 mb-2">همه چیز عالی است!</h3>
            <p className="text-sm text-emerald-700">
              هیچ پرداخت آنلاینی بدون سند حسابداری وجود ندارد. تمام پرداخت‌های موفق سند دارند.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ★ Result Modal */}
      {showResultModal && recoveryResult && (
        <RecoveryResultModal
          results={recoveryResult}
          onClose={() => {
            setShowResultModal(false)
            setRecoveryResult(null)
            setDryRunResult(null)
          }}
        />
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════
  //  اگر embedded=true است، فقط محتوا را برگردان (برای استفاده در تب)
  //  در غیر این صورت، هدر و container را هم اضافه کن (برای صفحه مستقل)
  // ═══════════════════════════════════════════════════════════════

  if (embedded) {
    return content
  }

  return (
    <div className="container mx-auto p-4 max-w-7xl" dir="rtl">
      {/* ★ Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-emerald-600" />
              ابزار بازیابی اسناد حسابداری
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              صدور سند حسابداری برای پرداخت‌های آنلاینی که سند صادر نشده است
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMissing}
            disabled={loading}
            className="text-xs"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            به‌روزرسانی
          </Button>
        </div>
      </div>

      {content}
    </div>
  )
}

export default RecoverJournalsTab
