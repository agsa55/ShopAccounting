// ============================================================================
// src/app/portal/[token]/page.tsx — Customer Portal (v3.36.2 ★★★)
// ShopAccounting — Customer Portal Page
// ----------------------------------------------------------------------------
// ★★★ v3.35: صفحه پورتال مشتری برای مشاهده فاکتورها و پرداخت آنلاین
// ★★★ v3.36.2: پشتیبانی از پرداخت قسط‌به‌قسط
//   - برای فاکتورهای قسطی، جدول اقساط نمایش داده می‌شود
//   - هر قسط دکمه پرداخت آنلاین مستقل دارد
//   - قسط‌های پرداخت‌شده با تیک سبز نمایش داده می‌شوند
//   - قسط‌های سررسیدنشده با قفل خاکستری
//   - قسط‌های سررسیدرسیده با دکمه سبز قابل پرداخت
//   - امکان پرداخت زودهنگام (تا ۷ روز قبل از سررسید)
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Phone, KeyRound, LogOut, Wallet, FileText, CreditCard,
  CheckCircle2, Clock, Lock, AlertCircle, Calendar, ChevronDown, ChevronUp,
} from 'lucide-react'
import { OnlinePaymentButton } from '@/components/invoices/online-payment-button'
import { InstallmentPayButton } from '@/components/portal/installment-pay-button'

interface PortalTokenData {
  portalToken: string
  customer: { id: string; name: string; mobile: string }
  store: { name: string }
}

// ★★★ v3.36.2: تایپ برای InstallmentSchedule
interface InstallmentSchedule {
  id: string
  installmentNumber: number
  amount: number
  dueDate: string
  status: string
  paidAmount: number
  paidAt: string | null
  paymentRef: string | null
  paymentType: string | null
}

// ★★★ v3.36.2: تعیین وضعیت نمایش قسط
// ★★★ v3.36.3: اجازه پرداخت همه اقساط (حتی سررسید‌نشده) — فقط نمایش متفاوت
function getInstallmentDisplayStatus(schedule: InstallmentSchedule): {
  state: 'paid' | 'partial' | 'due' | 'early' | 'future'
  label: string
  color: string
  bgColor: string
  canPay: boolean
  disabledReason?: string
} {
  const status = (schedule.status || '').toLowerCase()
  const dueDate = new Date(schedule.dueDate)
  const now = new Date()
  const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (status === 'paid' || status === 'completed') {
    return {
      state: 'paid',
      label: 'پرداخت‌شده',
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50 border-emerald-200',
      canPay: false,
    }
  }

  if (status === 'partial') {
    return {
      state: 'partial',
      label: 'پرداخت جزیی',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50 border-amber-200',
      canPay: true,
    }
  }

  // ★ pending
  if (daysUntilDue < 0) {
    return {
      state: 'due',
      label: `سررسید گذشته (${Math.abs(daysUntilDue)} روز)`,
      color: 'text-red-700',
      bgColor: 'bg-red-50 border-red-200',
      canPay: true,
    }
  }

  if (daysUntilDue <= 7) {
    return {
      state: 'early',
      label: daysUntilDue === 0 ? 'سررسید امروز' : `${daysUntilDue} روز تا سررسید`,
      color: 'text-orange-700',
      bgColor: 'bg-orange-50 border-orange-200',
      canPay: true,
    }
  }

  // ★★★ v3.36.3: قسط‌های آینده هم قابل پرداخت هستند (پرداخت زودهنگام)
  return {
    state: 'future',
    label: `${daysUntilDue} روز تا سررسید (پرداخت زودهنگام)`,
    color: 'text-sky-700',
    bgColor: 'bg-sky-50 border-sky-200',
    canPay: true, // ★ تغییر از false به true
  }
}

function formatCurrency(n: number): string {
  return Number(n || 0).toLocaleString('fa-IR')
}

export default function CustomerPortalPage() {
  const params = useParams()
  const token = params.token as string

  const [step, setStep] = useState<'login' | 'dashboard'>('login')
  const [mobile, setMobile] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [devCode, setDevCode] = useState('')
  const [portalData, setPortalData] = useState<PortalTokenData | null>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [summary, setSummary] = useState({ totalDebt: 0, invoiceCount: 0 })
  // ★★★ v3.36.2: state برای expand/collapse جدول اقساط هر فاکتور
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set())

  // ★ چک کردن اگر قبلاً وارد شده
  useEffect(() => {
    const savedToken = localStorage.getItem('portal_token')
    if (savedToken) {
      fetch('/api/portal/invoices', {
        headers: { Authorization: `Bearer ${savedToken}` },
      })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            // ★★★ v3.36.3: استخراج نام مشتری و نام فروشگاه از پاسخ API
            //   API ممکن است این فیلدها را در data.data یا data.data.customer/store برگرداند
            const apiData = data.data || {}
            const customerName = apiData.customerName ||
              apiData.customer?.name ||
              apiData.customer?.firstName ||
              ''
            const storeName = apiData.storeName ||
              apiData.store?.name ||
              apiData.store ||
              ''

            setPortalData({
              portalToken: savedToken,
              customer: { id: '', name: customerName, mobile: '' },
              store: { name: storeName },
            })
            setInvoices(apiData.invoices || [])
            setSummary(apiData.summary || { totalDebt: 0, invoiceCount: 0 })
            setStep('dashboard')
          } else {
            localStorage.removeItem('portal_token')
          }
        })
        .catch(() => localStorage.removeItem('portal_token'))
    }
  }, [])

  // ★ ارسال کد OTP
  const handleSendCode = async () => {
    if (!mobile.match(/^09\d{9}$/)) {
      setError('شماره موبایل نامعتبر است (فرمت: 09123456789)')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, mobile, action: 'send' }),
      })
      const data = await res.json()
      if (data.success) {
        // ★★★ v3.39: نمایش کد تست اگر در محیط توسعه هستیم
        if (data.data?._debugCode) {
          setDevCode(data.data._debugCode)
        } else if (data._debugCode) {
          setDevCode(data._debugCode)
        } else {
          setDevCode('')
        }
        alert('کد تأیید ارسال شد')
      } else {
        // ★ اگر خطا داشت ولی کد تست برگرداند (محیط dev)
        if (data._debugCode) {
          setDevCode(data._debugCode)
        } else {
          setError(data.error || 'خطا در ارسال کد')
        }
      }
    } catch {
      setError('خطا در ارتباط با سرور')
    }
    setLoading(false)
  }

  // ★ تأیید کد OTP
  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      setError('کد باید ۶ رقم باشد')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, mobile, code, action: 'verify' }),
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('portal_token', data.data.portalToken)
        setPortalData(data.data)
        setStep('dashboard')
        loadInvoices(data.data.portalToken)
      } else {
        setError(data.error || 'کد نامعتبر')
      }
    } catch {
      setError('خطا در ارتباط با سرور')
    }
    setLoading(false)
  }

  // ★ لود فاکتورها
  // ★★★ v3.36.3: این تابع همچنین portalData را با اطلاعات مشتری و فروشگاه به‌روزرسانی می‌کند
  //   چون API /api/portal/invoices این اطلاعات را برمی‌گرداند (حتی اگر API login برنگرداند)
  const loadInvoices = useCallback(async (pToken: string) => {
    try {
      const res = await fetch('/api/portal/invoices', {
        headers: { Authorization: `Bearer ${pToken}` },
      })
      const data = await res.json()
      if (data.success) {
        const apiData = data.data || {}

        // ★★★ به‌روزرسانی لیست فاکتورها و خلاصه
        setInvoices(apiData.invoices || [])
        setSummary(apiData.summary || { totalDebt: 0, invoiceCount: 0 })

        // ★★★ v3.36.3: به‌روزرسانی portalData با نام مشتری و فروشگاه
        //   اگر API این اطلاعات را برمی‌گرداند، آنها را تنظیم کن
        //   اگر قبلاً تنظیم شده‌اند (از login)، فقط فیلدهای خالی را پر کن
        const customerName = apiData.customerName ||
          apiData.customer?.name ||
          ''
        const customerMobile = apiData.customer?.mobile || ''
        const storeName = apiData.storeName ||
          apiData.store?.name ||
          ''

        if (customerName || storeName) {
          setPortalData((prev) => {
            // ★ اگر قبلاً portalData تنظیم شده، فقط فیلدهای خالی را پر کن
            //   اگر نه، یک portalData جدید بساز
            const prevCustomerName = prev?.customer?.name || ''
            const prevStoreName = prev?.store?.name || ''
            const prevMobile = prev?.customer?.mobile || ''

            return {
              portalToken: pToken,
              customer: {
                id: prev?.customer?.id || '',
                name: prevCustomerName || customerName,
                mobile: prevMobile || customerMobile,
              },
              store: {
                name: prevStoreName || storeName,
              },
            }
          })
        }
      }
    } catch (e) {
      console.error('Load invoices error:', e)
    }
  }, [])

  // ★ خروج
  const handleLogout = () => {
    localStorage.removeItem('portal_token')
    setStep('login')
    setPortalData(null)
    setInvoices([])
    setMobile('')
    setCode('')
  }

  // ★★★ v3.36.2: toggle expand/collapse جدول اقساط
  const toggleInvoiceExpand = (invoiceId: string) => {
    setExpandedInvoices((prev) => {
      const next = new Set(prev)
      if (next.has(invoiceId)) {
        next.delete(invoiceId)
      } else {
        next.add(invoiceId)
      }
      return next
    })
  }

  // ═══════════════════════════════════════════════════════════════
  //  رندر فرم ورود
  // ═══════════════════════════════════════════════════════════════
  if (step === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center p-4" dir="rtl">
        <Card className="w-full max-w-md shadow-xl border-emerald-200">
          <CardHeader className="text-center pb-4">
            <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <Wallet className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-xl text-gray-800">پورتال مشتری</CardTitle>
            <p className="text-xs text-gray-500 mt-1">برای مشاهده فاکتورها و پرداخت آنلاین وارد شوید</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="mobile" className="text-sm mb-1.5 block">شماره موبایل</Label>
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="mobile"
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="09123456789"
                  className="pr-10 text-left font-mono"
                  dir="ltr"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="code" className="text-sm mb-1.5 block">کد تأیید (۶ رقم)</Label>
              <div className="relative">
                <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="------"
                  className="pr-10 text-center font-mono tracking-widest"
                  dir="ltr"
                  disabled={loading}
                />
              </div>
            </div>

            {devCode && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
                <p className="text-[11px] text-amber-700 font-bold mb-1">
                  ⚠️ حالت تست (سرویس پیامک در دسترس نیست)
                </p>
                <p className="text-[10px] text-amber-600 mb-1">کد تأیید شما:</p>
                <p className="text-lg font-bold font-mono text-amber-800 tracking-[0.2em]" dir="ltr">
                  {devCode}
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center text-sm text-red-600">
                {error}
              </div>
            )}

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={code ? handleVerifyCode : handleSendCode}
              disabled={loading || !mobile}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : code ? 'تأیید و ورود' : 'دریافت کد تأیید'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  //  رندر داشبورد مشتری
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* هدر */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-800">{portalData?.store.name || 'فروشگاه'}</h1>
              <p className="text-[10px] text-gray-500">پورتال مشتری</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs">
            <LogOut className="w-3.5 h-3.5 ml-1" />
            خروج
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {/* ★★★ v3.36.3: کارت خوش‌آمد‌گویی با نام کامل مشتری */}
        <Card className="border-emerald-200 bg-gradient-to-l from-emerald-50 via-white to-blue-50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center shrink-0">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gray-500 mb-0.5">خوش آمدید</p>
              <h2 className="text-base font-bold text-gray-800">
                {portalData?.customer.name || 'مشتری گرامی'}
              </h2>
              {portalData?.customer.mobile && (
                <p className="text-[10px] text-gray-500 font-mono" dir="ltr">
                  {portalData.customer.mobile}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* کارت خلاصه بدهی */}
        <Card className="border-emerald-200 bg-gradient-to-l from-emerald-50 to-white">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">مجموع بدهی فعلی</p>
            <p className="text-2xl font-bold text-red-600">
              {summary.totalDebt.toLocaleString('fa-IR')}
              <span className="text-sm font-normal text-gray-500 mr-1">ریال</span>
            </p>
            <div className="mt-2 pt-2 border-t border-emerald-100 flex justify-between text-xs">
              <span className="text-gray-500">تعداد فاکتورهای باز: {summary.invoiceCount.toLocaleString('fa-IR')}</span>
            </div>
          </CardContent>
        </Card>

        {/* لیست فاکتورها */}
        <div className="space-y-3">
          {invoices.length === 0 ? (
            <Card className="border-gray-200">
              <CardContent className="p-8 text-center">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">فاکتور باز وجود ندارد</p>
              </CardContent>
            </Card>
          ) : (
            invoices.map((inv: any) => {
              const remaining = Number(inv.remainingAmount) || 0
              const isInstallment = inv.paymentType === 'installment'
              const schedules: InstallmentSchedule[] = (inv.installmentPlan?.schedules || []) as InstallmentSchedule[]
              // ★ مرتب‌سازی اقساط بر اساس installmentNumber
              const sortedSchedules = [...schedules].sort((a, b) => a.installmentNumber - b.installmentNumber)

              const pendingInstallments = sortedSchedules.filter(
                (s) => {
                  const st = (s.status || '').toLowerCase()
                  return st === 'pending' || st === 'partial'
                }
              )

              // ★ قسط بعدی قابل پرداخت (اولین pending که canPay=true)
              const nextPayableInstallment = pendingInstallments.find((s) => {
                const display = getInstallmentDisplayStatus(s)
                return display.canPay
              })

              const isExpanded = expandedInvoices.has(inv.id)

              return (
                <Card key={inv.id} className="border-gray-200 overflow-hidden">
                  <CardHeader className="bg-gray-50 p-3 pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-800">فاکتور {inv.number}</p>
                        <p className="text-[10px] text-gray-500">
                          {new Date(inv.invoiceDate).toLocaleDateString('fa-IR')}
                        </p>
                      </div>
                      <Badge className={
                        isInstallment ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                      }>
                        {isInstallment ? 'قسطی' : 'نسیه'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 space-y-3">
                    {/* اقلام فاکتور */}
                    {inv.items && inv.items.length > 0 && (
                      <div className="text-xs space-y-1">
                        {inv.items.slice(0, 3).map((item: any, i: number) => (
                          <div key={i} className="flex justify-between text-gray-600">
                            <span>{item.productName}</span>
                            <span className="font-mono">{Number(item.lineTotal).toLocaleString('fa-IR')}</span>
                          </div>
                        ))}
                        {inv.items.length > 3 && (
                          <p className="text-[10px] text-gray-400">و {inv.items.length - 3} مورد دیگر...</p>
                        )}
                      </div>
                    )}

                    {/* مبالغ */}
                    <div className="border-t border-gray-100 pt-2 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">مبلغ کل:</span>
                        <span className="font-mono">{Number(inv.totalAmount).toLocaleString('fa-IR')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">پرداخت‌شده:</span>
                        <span className="font-mono text-emerald-600">{Number(inv.paidAmount).toLocaleString('fa-IR')}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span className="text-gray-700">باقی‌مانده:</span>
                        <span className="font-mono text-red-600">{remaining.toLocaleString('fa-IR')}</span>
                      </div>
                    </div>

                    {/* ═══════════ v3.36.2: جدول اقساط برای فاکتورهای قسطی ═══════════ */}
                    {isInstallment && sortedSchedules.length > 0 && (
                      <div className="border border-purple-100 rounded-lg overflow-hidden">
                        {/* هدر قابل کلیک */}
                        <button
                          type="button"
                          onClick={() => toggleInvoiceExpand(inv.id)}
                          className="w-full flex items-center justify-between p-2 bg-purple-50 hover:bg-purple-100 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-purple-600" />
                            <span className="text-[11px] font-bold text-purple-700">
                              جدول اقساط ({pendingInstallments.length.toLocaleString('fa-IR')} قسط باقی‌مانده از {sortedSchedules.length.toLocaleString('fa-IR')})
                            </span>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-purple-600" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-purple-600" />
                          )}
                        </button>

                        {/* محتوای جدول */}
                        {isExpanded && (
                          <div className="divide-y divide-gray-100">
                            {sortedSchedules.map((inst) => {
                              const display = getInstallmentDisplayStatus(inst)
                              const paidAmount = Number(inst.paidAmount) || 0
                              const remainingInst = Number(inst.amount) - paidAmount
                              const dueDate = new Date(inst.dueDate)

                              return (
                                <div
                                  key={inst.id}
                                  className={`p-2.5 ${display.bgColor} border-l-4`}
                                  style={{
                                    borderLeftColor: display.state === 'paid' ? '#10b981'
                                      : display.state === 'due' ? '#ef4444'
                                      : display.state === 'early' ? '#f97316'
                                      : display.state === 'partial' ? '#f59e0b'
                                      : '#94a3b8'
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    {/* ★ ستون چپ: اطلاعات قسط */}
                                    <div className="flex-1 space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-gray-700">
                                          قسط {inst.installmentNumber.toLocaleString('fa-IR')}
                                        </span>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${display.color} bg-white`}>
                                          {display.label}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                        <Calendar className="w-2.5 h-2.5" />
                                        سررسید: {dueDate.toLocaleDateString('fa-IR')}
                                      </div>
                                      <div className="text-[11px] font-mono text-gray-700">
                                        مبلغ قسط: {formatCurrency(Number(inst.amount))} ریال
                                      </div>
                                      {paidAmount > 0 && (
                                        <div className="text-[10px] text-emerald-600">
                                          پرداخت‌شده: {formatCurrency(paidAmount)} ریال
                                          {inst.paymentRef && (
                                            <span className="text-gray-400 mr-1">({inst.paymentRef})</span>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {/* ★ ستون راست: دکمه پرداخت یا وضعیت */}
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                      {display.state === 'paid' ? (
                                        <div className="flex items-center gap-1 text-emerald-600">
                                          <CheckCircle2 className="w-4 h-4" />
                                          <span className="text-[10px] font-bold">تسویه شد</span>
                                        </div>
                                      ) : display.state === 'partial' ? (
                                        <>
                                          <InstallmentPayButton
                                            invoiceId={inv.id}
                                            installmentId={inst.id}
                                            installmentNumber={inst.installmentNumber}
                                            amount={remainingInst}
                                            dueDate={inst.dueDate}
                                            canPay={true}
                                            variant="default"
                                            size="sm"
                                            label={`پرداخت ${formatCurrency(remainingInst)}`}
                                            className="bg-amber-600 hover:bg-amber-700 text-[10px]"
                                          />
                                        </>
                                      ) : display.canPay ? (
                                        <InstallmentPayButton
                                          invoiceId={inv.id}
                                          installmentId={inst.id}
                                          installmentNumber={inst.installmentNumber}
                                          amount={remainingInst}
                                          dueDate={inst.dueDate}
                                          canPay={true}
                                          variant="default"
                                          size="sm"
                                          label={`پرداخت ${formatCurrency(remainingInst)}`}
                                          className={`text-[10px] ${
                                            display.state === 'due'
                                              ? 'bg-red-600 hover:bg-red-700'
                                              : display.state === 'future'
                                                ? 'bg-sky-600 hover:bg-sky-700'      // ★ v3.36.3: آبی برای پرداخت زودهنگام
                                                : display.state === 'early'
                                                  ? 'bg-orange-600 hover:bg-orange-700'
                                                  : 'bg-emerald-600 hover:bg-emerald-700'
                                          }`}
                                        />
                                      ) : (
                                        <div
                                          className="flex items-center gap-1 text-[10px] text-gray-400 px-2 py-1 rounded bg-white"
                                          title={display.disabledReason}
                                        >
                                          <Lock className="w-3 h-3" />
                                          غیرفعال
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* ★ اگر جدول بسته است، فقط قسط بعدی را نمایش بده */}
                        {!isExpanded && nextPayableInstallment && (
                          <div className="p-2 bg-orange-50 border-t border-orange-100 flex items-center justify-between">
                            <div className="text-[10px] text-orange-700">
                              <Clock className="w-2.5 h-2.5 inline ml-0.5" />
                              قسط بعدی ({nextPayableInstallment.installmentNumber.toLocaleString('fa-IR')}):
                              <span className="font-mono font-bold mr-1">
                                {formatCurrency(Number(nextPayableInstallment.amount))}
                              </span>
                              ریال
                            </div>
                            <InstallmentPayButton
                              invoiceId={inv.id}
                              installmentId={nextPayableInstallment.id}
                              installmentNumber={nextPayableInstallment.installmentNumber}
                              amount={Number(nextPayableInstallment.amount)}
                              dueDate={nextPayableInstallment.dueDate}
                              canPay={true}
                              variant="default"
                              size="sm"
                              label="پرداخت قسط بعدی"
                              className="bg-emerald-600 hover:bg-emerald-700 text-[10px] h-7"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* ★★★ برای فاکتورهای نسیه (غیر قسطی): دکمه پرداخت آنلاین کل باقی‌مانده */}
                    {!isInstallment && remaining > 0 && (
                      <div className="pt-2 border-t border-gray-100">
                        <OnlinePaymentButton
                          invoiceId={inv.id}
                          amount={remaining}
                          variant="default"
                          size="sm"
                          className="w-full bg-emerald-600 hover:bg-emerald-700"
                        />
                      </div>
                    )}

                    {/* ★★★ برای فاکتورهای قسطی که جدول دارند: دیگر دکمه «پرداخت کل» نمی‌گذاریم
                         کاربر باید قسط‌به‌قسط پرداخت کند. */}

                    {/* ★ پیام راهنما برای فاکتور تسویه‌شده */}
                    {remaining <= 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <p className="text-[11px] font-bold text-emerald-700">
                          این فاکتور به طور کامل تسویه شده است
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        {/* ★★★ v3.36.3: راهنمای رنگ‌ها */}
        <Card className="border-gray-200 bg-gray-50">
          <CardContent className="p-3">
            <p className="text-[10px] font-bold text-gray-600 mb-1.5">راهنمای وضعیت اقساط:</p>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-gray-600">پرداخت‌شده</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-gray-600">سررسید گذشته</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                <span className="text-gray-600">نزدیک سررسید (۷ روز)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <span className="text-gray-600">پرداخت جزیی</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                <span className="text-gray-600">سررسید نرسیده (قابل پرداخت زودهنگام)</span>
              </div>
            </div>
            <p className="text-[9px] text-gray-400 mt-2 leading-relaxed">
              💡 می‌توانید هر قسط را به‌صورت جداگانه پرداخت کنید. پرداخت زودهنگام قسط‌های آینده نیز امکان‌پذیر است.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
