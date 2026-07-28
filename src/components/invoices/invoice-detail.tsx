// ============================================================================
// src/components/invoices/invoice-detail.tsx — v5.1.2 ★★★ Phase 4 (Plan Gating)
// ShopAccounting — Invoice Detail Page (with PDF button)
// ============================================================================
// ★★★ v3.32: 
//   - افزودن دکمه PDF (InvoicePDFButton)
//   - رفع تمام خطاهای TypeScript
//   - پذیرش invoiceId به‌عنوان prop (به‌جای store.selectedInvoiceId)
// ============================================================================

import { useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { mockInvoices, mockInstallmentPlans, mockJournalEntries, mockCustomers } from '@/lib/mock-data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
// ★★★ v3.32: import دکمه PDF
import { InvoicePDFButton } from '@/components/invoices/invoice-pdf-button'

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ArrowRight, Printer, XCircle, User, MapPin, Phone, Wallet, FileText, CreditCard, BookOpen, Calendar, Receipt, CheckCircle2,
  Lock, Crown, AlertTriangle, CalendarDays, RotateCcw,
} from 'lucide-react'

function formatAmount(amount: number | undefined | null): string {
  return (amount || 0).toLocaleString('fa-IR')
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '---'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '---'
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} - ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    Draft: { label: 'پیش‌نویس', className: 'bg-gray-100 text-gray-700 border-gray-200' },
    Confirmed: { label: 'تأیید شده', className: 'bg-sky-100 text-sky-700 border-sky-200' },
    Paid: { label: 'پرداخت شده', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    PartiallyPaid: { label: 'پرداخت جزئی', className: 'bg-orange-100 text-orange-700 border-orange-200' },
    Cancelled: { label: 'لغو شده', className: 'bg-red-100 text-red-700 border-red-200' },
  }
  const cfg = map[status] || map.Draft
  return <Badge className={`${cfg.className} text-[10px] sm:text-xs font-medium`}>{cfg.label}</Badge>
}

function getPaymentTypeBadge(paymentType: string) {
  const map: Record<string, { label: string; className: string }> = {
    Cash: { label: 'نقدی', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    Credit: { label: 'نسیه', className: 'bg-yellow-50 text-yellow-700 border-yellow-300' },
    Installment: { label: 'قسطی', className: 'bg-purple-50 text-purple-700 border-purple-200' },
    Card: { label: 'کارتی', className: 'bg-sky-50 text-sky-700 border-sky-200' },
    Mixed: { label: 'ترکیبی', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  }
  const cfg = map[paymentType] || map.Cash
  return <Badge variant="outline" className={`${cfg.className} text-[10px] sm:text-xs`}>{cfg.label}</Badge>
}

function getInstallmentStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    Paid: { label: 'پرداخت شده', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    Pending: { label: 'در انتظار', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    Overdue: { label: 'سررسید گذشته', className: 'bg-red-100 text-red-700 border-red-200' },
  }
  const cfg = map[status] || map.Pending
  return <Badge className={`${cfg.className} text-[10px] sm:text-xs`}>{cfg.label}</Badge>
}

// ★★★ v3.32: پذیرش invoiceId به‌عنوان prop
interface InvoiceDetailProps {
  invoiceId?: string
}

export default function InvoiceDetail({ invoiceId }: InvoiceDetailProps = {}) {
  const store = useAppStore()
  const router = useRouter()

  // ★★★ v5.1.2: Plan-based feature gating
  const planName = useAppStore((s) => s.planName)
  const currentTenant = useAppStore((s) => s.currentTenant)
  const planFeatures = getFeaturesByPlanName(planName || currentTenant?.planName || currentTenant?.planTierName || 'simple') as any

  const invoice = useMemo(() => {
    // ★ استفاده از prop یا از store (با fallback)
    const id = invoiceId || store.selectedInvoiceId || store.selectedInvoice?.id
    if (!id) return null
    return mockInvoices.find((inv: any) => inv.id === id) || null
  }, [invoiceId, store.selectedInvoiceId, store.selectedInvoice])

  const customer = useMemo(() => {
    if (!invoice?.customerId) return null
    return mockCustomers.find((c: any) => c.id === invoice.customerId) || null
  }, [invoice])

  const installmentPlan = useMemo(() => {
    if (!invoice) return null
    return mockInstallmentPlans.find((p: any) => p.invoiceId === invoice.id) || null
  }, [invoice])

  const journalEntry = useMemo(() => {
    if (!invoice) return null
    return mockJournalEntries.find((je: any) => je.referenceType === 'Invoice' && je.referenceId === invoice.id) || null
  }, [invoice])

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex items-center justify-center p-4" dir="rtl">
        <div className="text-center">
          <FileText className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 text-sm sm:text-base">فاکتور یافت نشد</p>
          <Button onClick={() => store.setCurrentView('invoices')} className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm h-9">
            بازگشت به لیست فاکتورها
          </Button>
        </div>
      </div>
    )
  }

  // ★★★ v3.32: safe accessors با fallback
  const subTotal = Number(invoice.subTotal) || 0
  const discountAmount = Number(invoice.discountAmount) || 0
  const taxAmount = Number(invoice.taxAmount) || 0
  const totalAmount = Number(invoice.totalAmount) || 0
  const paidAmount = Number(invoice.paidAmount) || 0
  const remainingAmount = Number(invoice.remainingAmount) || 0
  const invoiceItems = (invoice as any).items || []
  const invoicePayments = (invoice as any).payments || []
  const invoiceDescription = (invoice as any).description || ''
  const installments = (installmentPlan as any)?.installments || []
  const paidCount = Number((installmentPlan as any)?.paidCount) || 0
  const numberOfInstallments = Number((installmentPlan as any)?.numberOfInstallments) || 0

  return (
    <div className="min-h-screen bg-gray-50/50" dir="rtl">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-5 md:py-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6">
          {/* Top row: back button + title */}
          <div className="flex items-start gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => store.setCurrentView('invoices')}
              className="h-8 w-8 sm:h-9 sm:w-9 hover:bg-emerald-50 shrink-0 mt-0.5"
            >
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h1 className="text-sm sm:text-lg md:text-xl lg:text-2xl font-bold text-gray-900">فاکتور {(invoice as any).number}</h1>
                {getStatusBadge((invoice as any).status)}
                {getPaymentTypeBadge((invoice as any).paymentType)}
              </div>
              <p className="text-[10px] sm:text-xs md:text-sm text-gray-500 mt-1">
                {formatDate((invoice as any).invoiceDate)}
                {(invoice as any).cashierName && (
                  <span className="hidden sm:inline"> • صادرکننده: {(invoice as any).cashierName}</span>
                )}
              </p>
            </div>
          </div>

          {/* Bottom row: action buttons */}
          <div className="flex items-center gap-2 flex-wrap sm:justify-end">
            {/* ★★★ v3.32: دکمه PDF */}
            <InvoicePDFButton
              invoiceId={(invoice as any).id}
              invoiceNumber={(invoice as any).number}
              variant="outline"
              size="sm"
              className="gap-1.5 text-[11px] sm:text-xs md:text-sm h-8 sm:h-9"
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-[11px] sm:text-xs md:text-sm h-8 sm:h-9"
              onClick={() => alert('چاپ فاکتور')}
            >
              <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              چاپ
            </Button>
            {(invoice as any).status !== 'Paid' && (invoice as any).status !== 'Cancelled' && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 hover:bg-red-50 text-[11px] sm:text-xs md:text-sm h-8 sm:h-9"
                onClick={() => alert('لغو فاکتور')}
              >
                <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                لغو
              </Button>
            )}
            {/* ★★★ v8.7: دکمه ثبت برگشتی فروش */}
            {(invoice as any).invoiceType !== "service" && (invoice as any).invoiceType !== "sale_return" && (invoice as any).status !== "Cancelled" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-amber-600 hover:text-amber-700 border-amber-200 hover:border-amber-300 hover:bg-amber-50 text-[11px] sm:text-xs md:text-sm h-8 sm:h-9"
                onClick={() => {
                  alert("برای ثبت برگشتی، به لیست فاکتورها بروید و روی آیکون برگشت (RotateCcw) کلیک کنید");
                }}
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ثبت برگشتی
              </Button>
            )}
          </div>
        </div>

        {/* ★★★ v5.1.2 (Phase 4): هشدار پلن برای فاکتورهای نسیه/قسطی ★★★ */}
        {(() => {
          const pt = ((invoice as any).paymentType || '').toLowerCase()
          const isCredit = pt === 'credit'
          const isInstallment = pt === 'installment'
          const showCreditWarning = isCredit && !planFeatures.canAccessCredit
          const showInstallmentWarning = isInstallment && !planFeatures.canAccessInstallments

          if (!showCreditWarning && !showInstallmentWarning) return null

          const remaining = (Number((invoice as any).totalAmount) || 0) - (Number((invoice as any).paidAmount) || 0)
          const colorClass = showCreditWarning ? 'amber' : 'orange'
          const titleText = showCreditWarning ? 'این فاکتور نسیه است' : 'این فاکتور قسطی است'
          const messageText = showCreditWarning
            ? 'ثبت پرداخت نسیه فقط در پلن حرفه‌ای و سازمانی در دسترس است.'
            : 'مدیریت اقساط و ثبت پرداخت حضوری فقط در پلن حرفه‌ای و سازمانی در دسترس است.'

          return (
            <div className={`mb-4 sm:mb-6 p-3 sm:p-4 rounded-lg border-2 bg-${colorClass}-50 border-${colorClass}-200`}>
              <div className="flex items-start gap-2 sm:gap-3">
                <AlertTriangle className={`w-5 h-5 text-${colorClass}-600 shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm sm:text-base font-bold text-${colorClass}-800 mb-1`}>
                    {titleText}
                  </h3>
                  <p className={`text-xs sm:text-sm text-${colorClass}-700 mb-2`}>
                    {messageText}
                    {remaining > 0 && (
                      <span className="block mt-1">
                        باقیمانده: <strong>{remaining.toLocaleString('fa-IR')} تومان</strong>
                      </span>
                    )}
                  </p>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8 text-xs sm:text-sm"
                    onClick={() => router.push('/subscription/renew')}
                  >
                    <Crown className="w-3.5 h-3.5" />
                    ارتقا به پلن حرفه‌ای
                  </Button>
                </div>
              </div>
            </div>
          )
        })()}
        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-3 sm:space-y-4 md:space-y-6 order-2 lg:order-1">
            {/* Invoice Items Table */}
            <Card className="border-gray-200">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-5 md:px-6 pt-3 sm:pt-4 md:pt-6">
                <CardTitle className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-1.5 sm:gap-2">
                  <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                  اقلام فاکتور
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Mobile card view */}
                <div className="sm:hidden">
                  {invoiceItems.map((item: any, idx: number) => (
                    <div
                      key={item.id || idx}
                      className="border-b border-gray-100 last:border-b-0 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-900 truncate">{item.productName}</p>
                        </div>
                        <span className="text-xs font-bold text-gray-900 shrink-0">
                          {formatAmount(item.lineTotal)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        <span>{(item.quantity || 0).toLocaleString('fa-IR')} عدد</span>
                        <span>× {formatAmount(item.unitPrice)}</span>
                        {item.discount > 0 && (
                          <span className="text-red-500">-{(item.discount || 0).toLocaleString('fa-IR')}٪</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table view */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                        <TableHead className="text-[10px] sm:text-xs font-semibold text-gray-600 w-10 sm:w-12 whitespace-nowrap">ردیف</TableHead>
                        <TableHead className="text-[10px] sm:text-xs font-semibold text-gray-600 whitespace-nowrap">نام محصول</TableHead>
                        <TableHead className="text-[10px] sm:text-xs font-semibold text-gray-600 text-center whitespace-nowrap">تعداد</TableHead>
                        <TableHead className="text-[10px] sm:text-xs font-semibold text-gray-600 text-left whitespace-nowrap hidden md:table-cell">قیمت واحد</TableHead>
                        <TableHead className="text-[10px] sm:text-xs font-semibold text-gray-600 text-center whitespace-nowrap hidden lg:table-cell">تخفیف</TableHead>
                        <TableHead className="text-[10px] sm:text-xs font-semibold text-gray-600 text-center whitespace-nowrap hidden lg:table-cell">مالیات</TableHead>
                        <TableHead className="text-[10px] sm:text-xs font-semibold text-gray-600 text-left whitespace-nowrap">جمع کل</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceItems.map((item: any, idx: number) => (
                        <TableRow key={item.id || idx}>
                          <TableCell className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap">{idx + 1}</TableCell>
                          <TableCell className="text-xs sm:text-sm font-medium text-gray-900 whitespace-nowrap max-w-35 md:max-w-none truncate">{item.productName}</TableCell>
                          <TableCell className="text-xs sm:text-sm text-gray-700 text-center whitespace-nowrap">{(item.quantity || 0).toLocaleString('fa-IR')}</TableCell>
                          <TableCell className="text-xs sm:text-sm text-gray-700 text-left whitespace-nowrap hidden md:table-cell">{formatAmount(item.unitPrice)}</TableCell>
                          <TableCell className="text-xs sm:text-sm text-gray-600 text-center whitespace-nowrap hidden lg:table-cell">
                            {item.discount > 0 ? `${(item.discount || 0).toLocaleString('fa-IR')}٪` : '---'}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm text-gray-600 text-center whitespace-nowrap hidden lg:table-cell">{(item.taxRate || 0).toLocaleString('fa-IR')}٪</TableCell>
                          <TableCell className="text-xs sm:text-sm font-medium text-gray-900 text-left whitespace-nowrap">{formatAmount(item.lineTotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Totals */}
            <Card className="border-gray-200">
              <CardContent className="p-3 sm:p-4 md:p-6">
                <div className="max-w-xs sm:max-w-sm md:max-w-md mr-auto space-y-2 sm:space-y-3">
                  <div className="flex justify-between text-[11px] sm:text-sm">
                    <span className="text-gray-600">جمع کل</span>
                    <span className="text-gray-900">{formatAmount(subTotal)} تومان</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-[11px] sm:text-sm">
                      <span className="text-gray-600">تخفیف</span>
                      <span className="text-red-600">- {formatAmount(discountAmount)} تومان</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[11px] sm:text-sm">
                    <span className="text-gray-600">مالیات</span>
                    <span className="text-gray-900">{formatAmount(taxAmount)} تومان</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-xs sm:text-sm md:text-base font-bold">
                    <span className="text-gray-900">مبلغ نهایی</span>
                    <span className="text-emerald-700">{formatAmount(totalAmount)} تومان</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-[11px] sm:text-sm">
                    <span className="text-gray-600">پرداخت شده</span>
                    <span className="text-emerald-600 font-medium">{formatAmount(paidAmount)} تومان</span>
                  </div>
                  <div className="flex justify-between text-[11px] sm:text-sm">
                    <span className="text-gray-600">مانده</span>
                    <span className={`font-bold ${remainingAmount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {remainingAmount > 0 ? `${formatAmount(remainingAmount)} تومان` : '---'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Installment Plan */}
            {installmentPlan && installments.length > 0 && (
              <Card className="border-purple-200 bg-purple-50/30">
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-5 md:px-6 pt-3 sm:pt-4 md:pt-6">
                  <CardTitle className="text-xs sm:text-sm font-semibold text-purple-800 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 shrink-0" />
                    طرح قسطی
                    <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] sm:text-xs">
                      {numberOfInstallments.toLocaleString('fa-IR')} قسط
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Mobile card view */}
                  <div className="sm:hidden">
                    {installments.map((inst: any) => (
                      <div
                        key={inst.id}
                        className="border-b border-purple-100 last:border-b-0 px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-medium text-purple-900">
                            قسط {(inst.installmentNumber || inst.number || 0).toLocaleString('fa-IR')}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900">
                              {formatAmount(inst.amount)}
                            </span>
                            {getInstallmentStatusBadge(inst.status)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-gray-500">
                          <span>سررسید: {formatDate(inst.dueDate)}</span>
                          {(inst.paidAmount || 0) > 0 && (
                            <span>پرداخت: {formatAmount(inst.paidAmount)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop table view */}
                  <div className="hidden sm:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-purple-50/80 hover:bg-purple-50/80">
                          <TableHead className="text-[10px] sm:text-xs font-semibold text-purple-700 whitespace-nowrap">قسط</TableHead>
                          <TableHead className="text-[10px] sm:text-xs font-semibold text-purple-700 whitespace-nowrap hidden md:table-cell">سررسید</TableHead>
                          <TableHead className="text-[10px] sm:text-xs font-semibold text-purple-700 text-left whitespace-nowrap">مبلغ</TableHead>
                          <TableHead className="text-[10px] sm:text-xs font-semibold text-purple-700 whitespace-nowrap">وضعیت</TableHead>
                          <TableHead className="text-[10px] sm:text-xs font-semibold text-purple-700 text-left whitespace-nowrap hidden lg:table-cell">پرداخت شده</TableHead>
                          <TableHead className="text-[10px] sm:text-xs font-semibold text-purple-700 whitespace-nowrap hidden lg:table-cell">تاریخ پرداخت</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {installments.map((inst: any) => (
                          <TableRow key={inst.id}>
                            <TableCell className="text-xs sm:text-sm font-medium text-purple-900 whitespace-nowrap">{(inst.installmentNumber || inst.number || 0).toLocaleString('fa-IR')}</TableCell>
                            <TableCell className="text-xs sm:text-sm text-gray-700 whitespace-nowrap hidden md:table-cell">{formatDate(inst.dueDate)}</TableCell>
                            <TableCell className="text-xs sm:text-sm text-gray-900 text-left whitespace-nowrap">{formatAmount(inst.amount)}</TableCell>
                            <TableCell className="whitespace-nowrap">{getInstallmentStatusBadge(inst.status)}</TableCell>
                            <TableCell className="text-xs sm:text-sm text-left whitespace-nowrap hidden lg:table-cell">{(inst.paidAmount || 0) > 0 ? formatAmount(inst.paidAmount) : '---'}</TableCell>
                            <TableCell className="text-xs sm:text-sm text-gray-600 whitespace-nowrap hidden lg:table-cell">{inst.paidAt ? formatDate(inst.paidAt) : '---'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {numberOfInstallments > 0 && (
                    <div className="px-3 sm:px-4 py-2.5 sm:py-3">
                      <div className="flex items-center justify-between text-[10px] sm:text-xs mb-2">
                        <span className="text-purple-700">
                          {paidCount.toLocaleString('fa-IR')} از {numberOfInstallments.toLocaleString('fa-IR')} قسط پرداخت شده
                        </span>
                        <span className="text-purple-700 font-semibold">
                          {Math.round((paidCount / numberOfInstallments) * 100).toLocaleString('fa-IR')}٪
                        </span>
                      </div>
                      <div className="h-1.5 sm:h-2 bg-purple-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-600 rounded-full transition-all"
                          style={{ width: `${(paidCount / numberOfInstallments) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-3 sm:space-y-4 md:space-y-6 order-1 lg:order-2">
            {/* Customer Info */}
            <Card className="border-gray-200">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-5 md:px-6 pt-3 sm:pt-4 md:pt-6">
                <CardTitle className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-1.5 sm:gap-2">
                  <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                  اطلاعات مشتری
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-5 md:px-6 pb-3 sm:pb-4 md:pb-6 space-y-2 sm:space-y-3">
                {(invoice as any).customerName ? (
                  <>
                    <div className="flex items-center gap-2 sm:gap-2.5">
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">{(invoice as any).customerName}</p>
                        {customer && <p className="text-[10px] sm:text-xs text-gray-500">{(customer as any).code}</p>}
                      </div>
                    </div>
                    {customer?.mobile && (
                      <div className="flex items-center gap-2 text-[11px] sm:text-sm text-gray-600">
                        <Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 shrink-0" />
                        <span dir="ltr">{customer.mobile}</span>
                      </div>
                    )}
                    {customer?.address && (
                      <div className="flex items-start gap-2 text-[11px] sm:text-sm text-gray-600">
                        <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 mt-0.5 shrink-0" />
                        <span className="wrap-break-word leading-relaxed">{customer.address}</span>
                      </div>
                    )}
                    {customer && (
                      <>
                        <Separator />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                          <div className="flex items-center justify-between sm:flex-col sm:items-start gap-1">
                            <span className="text-[10px] sm:text-xs text-gray-500">موجودی حساب</span>
                            <span className={`text-[11px] sm:text-sm font-semibold ${((customer as any).currentBalance || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                              {((customer as any).currentBalance || 0) > 0 ? `${formatAmount((customer as any).currentBalance)} بدهی` : 'تسویه'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between sm:flex-col sm:items-start gap-1">
                            <span className="text-[10px] sm:text-xs text-gray-500">سقف اعتبار</span>
                            <span className="text-[11px] sm:text-sm text-gray-700">{formatAmount((customer as any).creditLimit)} تومان</span>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="text-center py-3 sm:py-4">
                    <User className="w-6 h-6 sm:w-8 sm:h-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-[11px] sm:text-sm text-gray-400">فروش عمومی (بدون مشتری)</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payments */}
            <Card className="border-gray-200">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-5 md:px-6 pt-3 sm:pt-4 md:pt-6">
                <CardTitle className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-1.5 sm:gap-2">
                  <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                  پرداخت‌ها
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-5 md:px-6 pb-3 sm:pb-4 md:pb-6">
                {invoicePayments.length === 0 ? (
                  <div className="text-center py-3 sm:py-4">
                    <CreditCard className="w-6 h-6 sm:w-8 sm:h-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-[11px] sm:text-sm text-gray-400">هنوز پرداختی ثبت نشده</p>
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {invoicePayments.map((payment: any) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-2 sm:p-2.5 md:p-3 bg-emerald-50 rounded-lg border border-emerald-100"
                      >
                        <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600 shrink-0" />
                            <span className="text-[10px] sm:text-xs font-medium text-emerald-700">
                              {payment.paymentType === 'Cash' ? 'نقدی' : payment.paymentType === 'Card' ? 'کارتی' : payment.paymentType}
                            </span>
                          </div>
                          <p className="text-[10px] sm:text-xs text-gray-500">{formatDate(payment.paidAt)}</p>
                          {payment.reference && (
                            <p className="text-[10px] sm:text-xs text-gray-400 truncate">مرجع: {payment.reference}</p>
                          )}
                        </div>
                        <span className="text-[11px] sm:text-sm font-bold text-emerald-700 shrink-0 mr-2">
                          {formatAmount(payment.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Journal Entry Reference */}
            {journalEntry && (
              <Card className="border-gray-200">
                <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-5 md:px-6 pt-3 sm:pt-4 md:pt-6">
                  <CardTitle className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center gap-1.5 sm:gap-2">
                    <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                    سند حسابداری
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-5 md:px-6 pb-3 sm:pb-4 md:pb-6">
                  <button
                    onClick={() => {
                      store.setSelectedJournalEntryId((journalEntry as any).id)
                      store.setCurrentView('journal-entry-detail')
                    }}
                    className="w-full flex items-center justify-between p-2 sm:p-2.5 md:p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                      <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                      <div className="text-right min-w-0 flex-1">
                        <p className="text-[11px] sm:text-sm font-semibold text-gray-900 truncate">{(journalEntry as any).number}</p>
                        <p className="text-[10px] sm:text-xs text-gray-500 truncate">{(journalEntry as any).description}</p>
                      </div>
                    </div>
                    <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 shrink-0" />
                  </button>
                  <div className="mt-2 sm:mt-3 grid grid-cols-2 gap-2 text-[10px] sm:text-xs">
                    <div className="bg-gray-50 rounded p-1.5 sm:p-2 text-center">
                      <p className="text-gray-500">بدهکار</p>
                      <p className="font-semibold text-gray-700">{formatAmount((journalEntry as any).totalDebit)}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-1.5 sm:p-2 text-center">
                      <p className="text-gray-500">بستانکار</p>
                      <p className="font-semibold text-gray-700">{formatAmount((journalEntry as any).totalCredit)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Description */}
            {invoiceDescription && (
              <Card className="border-gray-200">
                <CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-gray-500 mb-1">توضیحات</p>
                  <p className="text-[11px] sm:text-sm text-gray-700 wrap-break-word leading-relaxed">{invoiceDescription}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

