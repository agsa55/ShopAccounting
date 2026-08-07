// ============================================================================
// src/components/settings/payment-gateway-tab.tsx — v11.2 ★★★
// ShopAccounting — Settings: Payment Gateway Tab (درگاه اختصاصی)
// ============================================================================
// ★★★ v11.2: سازگاری کامل با API موجود (v8.8)
//   ✓ استفاده از withTenantAndPermission (بدون نیاز به ارسال token)
//   ✓ مدیریت صحیح apiKey masked (••••••••abcd)
//   ✓ پشتیبانی از دو درگاه مستقل (zarinpal و idpay)
//   ✓ callback URL خودکار (local و production)
//   ✓ لاگ‌های debug برای عیب‌یابی
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  CreditCard,
  Save,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Info,
  ExternalLink,
  Shield,
  Zap,
  Building2,
  Copy,
  Eye,
  EyeOff,
  TestTube2,
  Power,
  PowerOff,
  HelpCircle,
  Wallet,
  Check,
} from 'lucide-react'

type GatewayType = 'zarinpal' | 'idpay'

const GATEWAY_INFO = {
  zarinpal: {
    name: 'زرین‌پال',
    nameEn: 'Zarinpal',
    icon: Zap,
    color: 'blue',
    registerUrl: 'https://next.zarinpal.com/auth/register',
    panelUrl: 'https://next.zarinpal.com/panel/dashboard',
    merchantHelp: 'پنل زرین‌پال > درگاه پرداخت > تنظیمات > مرچنت کد',
    fees: '۱٪ کارمزد هر تراکنش',
  },
  idpay: {
    name: 'ای‌دی‌پی',
    nameEn: 'IDPay',
    icon: Building2,
    color: 'purple',
    registerUrl: 'https://idpay.ir/signup.php',
    panelUrl: 'https://panel.idpay.ir/',
    merchantHelp: 'پنل ای‌دی‌پی > وب سرویس > کلید API',
    fees: '۰.۵٪ تا ۱٪ کارمزد هر تراکنش',
  },
}

export function PaymentGatewayTab() {
  const [selectedGateway, setSelectedGateway] = useState<GatewayType>('zarinpal')
  const [showApiKey, setShowApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(true)

  // ─── فیلدهای زرین‌پال ─────────────────────────────────────
  const [zarinpalMerchantId, setZarinpalMerchantId] = useState('')
  const [zarinpalSandbox, setZarinpalSandbox] = useState(false)
  const [zarinpalBankIban, setZarinpalBankIban] = useState('')
  const [zarinpalBankName, setZarinpalBankName] = useState('')
  const [zarinpalActive, setZarinpalActive] = useState(false)
  const [zarinpalId, setZarinpalId] = useState<string | null>(null)
  const [zarinpalApiKeyExists, setZarinpalApiKeyExists] = useState(false) // ★★★ v11.2

  // ─── فیلدهای ای‌دی‌پی ──────────────────────────────────────
  const [idpayMerchantId, setIdpayMerchantId] = useState('')
  const [idpayApiKey, setIdpayApiKey] = useState('')
  const [idpaySandbox, setIdpaySandbox] = useState(false)
  const [idpayBankIban, setIdpayBankIban] = useState('')
  const [idpayBankName, setIdpayBankName] = useState('')
  const [idpayActive, setIdpayActive] = useState(false)
  const [idpayId, setIdpayId] = useState<string | null>(null)
  const [idpayApiKeyExists, setIdpayApiKeyExists] = useState(false) // ★★★ v11.2

  // ─── دریافت Callback URL (سازگار با local و production) ──
  const getCallbackUrl = (): string => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/api/payments/online/verify`
    }
    return process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/online/verify`
      : 'http://localhost:3000/api/payments/online/verify'
  }

  // ─── لود تنظیمات فعلی ────────────────────────────────────
  useEffect(() => {
    const loadGateways = async () => {
      try {
        console.log('[PaymentGatewayTab] 📥 Loading gateways...')
        
        const res = await fetch('/api/payment-gateway')
        console.log('[PaymentGatewayTab] 📥 Response status:', res.status)
        
        const data = await res.json()
        console.log('[PaymentGatewayTab] 📥 Response data:', data)

        if (data.success && Array.isArray(data.data)) {
          console.log('[PaymentGatewayTab] ✅ Loaded', data.data.length, 'gateway(s)')

          data.data.forEach((gw: any) => {
            console.log('[PaymentGatewayTab] Processing:', {
              type: gw.type,
              merchantId: gw.merchantId?.substring(0, 8) + '...',
              isActive: gw.isActive,
              sandbox: gw.sandbox,
              apiKeySet: gw.apiKeySet,
            })

            if (gw.type === 'zarinpal') {
              setZarinpalMerchantId(gw.merchantId || '')
              setZarinpalSandbox(gw.sandbox || false)
              setZarinpalBankIban(gw.bankIban || '')
              setZarinpalBankName(gw.bankName || '')
              setZarinpalActive(gw.isActive || false)
              setZarinpalId(gw.id || null)
              setZarinpalApiKeyExists(gw.apiKeySet || false)
              if (gw.isActive) setSelectedGateway('zarinpal')
            } else if (gw.type === 'idpay') {
              setIdpayMerchantId(gw.merchantId || '')
              // ★★★ v11.2: فیلد apiKey را خالی نگه دار (masked است)
              setIdpayApiKey('')
              setIdpaySandbox(gw.sandbox || false)
              setIdpayBankIban(gw.bankIban || '')
              setIdpayBankName(gw.bankName || '')
              setIdpayActive(gw.isActive || false)
              setIdpayId(gw.id || null)
              setIdpayApiKeyExists(gw.apiKeySet || false)
              if (gw.isActive) setSelectedGateway('idpay')
            }
          })
        }
      } catch (err: any) {
        console.error('[PaymentGatewayTab] ❌ Load error:', err)
        setError('خطا در بارگذاری تنظیمات درگاه')
      } finally {
        setLoading(false)
      }
    }

    loadGateways()
  }, [])

  // ─── اعتبارسنجی ───────────────────────────────────────────
  const validateIban = (iban: string): string | null => {
    if (!iban || !iban.trim()) return null
    const cleaned = iban.replace(/\s/g, '').toUpperCase()
    if (!/^IR\d{24}$/.test(cleaned)) {
      return 'فرمت شبا نامعتبر است. مثال: IR820570012880011411111111'
    }
    return null
  }

  const validateCurrentForm = (): string | null => {
    if (selectedGateway === 'zarinpal') {
      if (!zarinpalMerchantId.trim()) return 'کد مرچنت زرین‌پال الزامی است'
      const ibanErr = validateIban(zarinpalBankIban)
      if (ibanErr) return ibanErr
    } else {
      if (!idpayMerchantId.trim()) return 'شناسه پذیرنده ای‌دی‌پی الزامی است'
      // ★★★ v11.2: اگر apiKey قبلاً تنظیم شده و فیلد خالی است، مشکلی نیست
      if (!idpayApiKey.trim() && !idpayApiKeyExists) {
        return 'کلید API ای‌دی‌پی الزامی است'
      }
      const ibanErr = validateIban(idpayBankIban)
      if (ibanErr) return ibanErr
    }
    return null
  }

  // ─── ذخیره تنظیمات ────────────────────────────────────────
  const handleSave = async () => {
    setError(null)
    setSuccessMessage(null)

    const validationError = validateCurrentForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    try {
      const isZarinpal = selectedGateway === 'zarinpal'
      
      // ★★★ v11.2: فقط اگر کاربر مقدار جدیدی وارد کرده، apiKey را بفرست
      let apiKeyToSend: string | undefined = undefined
      if (isZarinpal) {
        // زرین‌پال نیازی به apiKey ندارد
        apiKeyToSend = undefined
      } else {
        // ای‌دی‌پی
        if (idpayApiKey.trim() && !idpayApiKey.startsWith('••••')) {
          apiKeyToSend = idpayApiKey.trim()
        }
        // اگر خالی بود و قبلاً تنظیم شده بود، undefined بفرست (API مقدار قبلی را حفظ می‌کند)
      }

      const payload = {
        type: selectedGateway,
        name: isZarinpal ? 'درگاه زرین‌پال' : 'درگاه ای‌دی‌پی',
        merchantId: isZarinpal ? zarinpalMerchantId.trim() : idpayMerchantId.trim(),
        apiKey: apiKeyToSend,
        sandbox: isZarinpal ? zarinpalSandbox : idpaySandbox,
        bankIban: (isZarinpal ? zarinpalBankIban : idpayBankIban).replace(/\s/g, '').toUpperCase() || undefined,
        bankName: (isZarinpal ? zarinpalBankName : idpayBankName).trim() || undefined,
        isActive: true,
        callbackUrl: getCallbackUrl(),  // ★★★ v11.2: ارسال callback URL از client
      }

      console.log('[PaymentGatewayTab] 💾 Saving:', {
        type: payload.type,
        merchantId: payload.merchantId.substring(0, 8) + '...',
        hasApiKey: !!payload.apiKey,
        sandbox: payload.sandbox,
        callbackUrl: payload.callbackUrl,
      })

      const res = await fetch('/api/payment-gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      console.log('[PaymentGatewayTab] 💾 Save response:', data)

      if (data.success) {
        setSuccessMessage(
          `✅ درگاه ${GATEWAY_INFO[selectedGateway].name} با موفقیت ذخیره و فعال شد.`
        )
        setSaved(true)
        setTimeout(() => setSaved(false), 4000)

        // به‌روزرسانی state ها
        if (isZarinpal) {
          setZarinpalActive(true)
          setZarinpalId(data.data?.id || zarinpalId)
          setIdpayActive(false)  // فقط یکی فعال
        } else {
          setIdpayActive(true)
          setIdpayId(data.data?.id || idpayId)
          setIdpayApiKeyExists(true)  // حالا API Key تنظیم شده
          setIdpayApiKey('')  // فیلد را پاک کن (دیگر masked نیست)
          setZarinpalActive(false)  // فقط یکی فعال
        }
      } else {
        setError(data.error || 'خطا در ذخیره تنظیمات')
      }
    } catch (err: any) {
      console.error('[PaymentGatewayTab] ❌ Save error:', err)
      setError('خطا در ارتباط با سرور')
    }
    setSaving(false)
  }

  // ─── غیرفعال‌سازی درگاه ───────────────────────────────────
  const handleDeactivate = async () => {
    if (!confirm(`آیا از غیرفعال‌سازی درگاه ${GATEWAY_INFO[selectedGateway].name} مطمئن هستید؟`)) {
      return
    }

    setError(null)
    setSuccessMessage(null)
    setSaving(true)

    try {
      const res = await fetch(`/api/payment-gateway?type=${selectedGateway}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (data.success) {
        setSuccessMessage(`درگاه ${GATEWAY_INFO[selectedGateway].name} با موفقیت غیرفعال شد.`)
        if (selectedGateway === 'zarinpal') setZarinpalActive(false)
        else setIdpayActive(false)
      } else {
        setError(data.error || 'خطا در غیرفعال‌سازی')
      }
    } catch (err: any) {
      console.error('[PaymentGatewayTab] Deactivate error:', err)
      setError('خطا در ارتباط با سرور')
    }
    setSaving(false)
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setSuccessMessage(`${label} کپی شد`)
    setTimeout(() => setSuccessMessage(null), 2000)
  }

  const gatewayInfo = GATEWAY_INFO[selectedGateway]
  const GatewayIcon = gatewayInfo.icon
  const isActive = selectedGateway === 'zarinpal' ? zarinpalActive : idpayActive
  const callbackUrl = getCallbackUrl()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        <span className="mr-2 text-sm text-gray-600">در حال بارگذاری تنظیمات درگاه...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      {successMessage && (
        <Alert className="border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <AlertDescription className="text-emerald-800 text-xs">{successMessage}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <AlertDescription className="text-red-700 text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* هدر */}
      <div className="bg-gradient-to-l from-blue-50 via-white to-purple-50 border border-gray-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-1">درگاه پرداخت اختصاصی</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              برای دریافت پرداخت آنلاین از مشتریان، باید در یکی از پنل‌های زیر ثبت‌نام کنید و کد مرچنت دریافتی را وارد نمایید.
              می‌توانید هر دو درگاه را تنظیم کنید، اما فقط یکی در هر زمان فعال خواهد بود.
            </p>
          </div>
        </div>
      </div>

      {/* انتخاب درگاه */}
      <Card className="border-gray-200">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-600" />
            انتخاب درگاه پرداخت
          </CardTitle>
          <CardDescription className="text-xs">
            یکی از درگاه‌ها را برای ویرایش انتخاب کنید. هر دو معتبر و دارای مجوز هستند.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* زرین‌پال */}
            <button
              type="button"
              onClick={() => setSelectedGateway('zarinpal')}
              className={`relative p-4 rounded-xl border-2 text-right transition-all ${
                selectedGateway === 'zarinpal'
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              {zarinpalActive && (
                <div className="absolute top-2 left-2">
                  <Badge className="bg-emerald-100 text-emerald-700 text-[9px]" variant="outline">
                    <CheckCircle2 className="w-3 h-3 ml-0.5" />
                    فعال
                  </Badge>
                </div>
              )}
              {zarinpalMerchantId && !zarinpalActive && (
                <div className="absolute top-2 left-2">
                  <Badge className="bg-gray-100 text-gray-700 text-[9px]" variant="outline">
                    <Check className="w-3 h-3 ml-0.5" />
                    تنظیم شده
                  </Badge>
                </div>
              )}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">زرین‌پال</h4>
                  <p className="text-[10px] text-gray-500">Zarinpal</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-600 mb-2">
                محبوب‌ترین درگاه پرداخت ایران
              </p>
              <div className="text-[10px] text-blue-700 bg-blue-100 rounded px-2 py-1 inline-block">
                {GATEWAY_INFO.zarinpal.fees}
              </div>
            </button>

            {/* ای‌دی‌پی */}
            <button
              type="button"
              onClick={() => setSelectedGateway('idpay')}
              className={`relative p-4 rounded-xl border-2 text-right transition-all ${
                selectedGateway === 'idpay'
                  ? 'border-purple-500 bg-purple-50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              {idpayActive && (
                <div className="absolute top-2 left-2">
                  <Badge className="bg-emerald-100 text-emerald-700 text-[9px]" variant="outline">
                    <CheckCircle2 className="w-3 h-3 ml-0.5" />
                    فعال
                  </Badge>
                </div>
              )}
              {idpayMerchantId && !idpayActive && (
                <div className="absolute top-2 left-2">
                  <Badge className="bg-gray-100 text-gray-700 text-[9px]" variant="outline">
                    <Check className="w-3 h-3 ml-0.5" />
                    تنظیم شده
                  </Badge>
                </div>
              )}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">ای‌دی‌پی</h4>
                  <p className="text-[10px] text-gray-500">IDPay</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-600 mb-2">
                درگاه پرداخت سریع با API ساده
              </p>
              <div className="text-[10px] text-purple-700 bg-purple-100 rounded px-2 py-1 inline-block">
                {GATEWAY_INFO.idpay.fees}
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* راهنما */}
      <Card className="border-gray-200">
        <button type="button" onClick={() => setShowGuide(!showGuide)} className="w-full">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600" />
                راهنمای ثبت‌نام و تنظیم
              </span>
              <span className="text-xs text-gray-400">{showGuide ? '▲' : '▼'}</span>
            </CardTitle>
          </CardHeader>
        </button>

        {showGuide && (
          <CardContent className="p-4 pt-2 space-y-3">
            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">۱</div>
              <div className="flex-1">
                <p className="text-xs font-bold text-blue-900 mb-1">ثبت‌نام در پنل {gatewayInfo.name}</p>
                <p className="text-[11px] text-blue-700 mb-2">
                  در پنل {gatewayInfo.name} با اطلاعات فروشگاه خود ثبت‌نام و احراز هویت شوید.
                </p>
                <a href={gatewayInfo.registerUrl} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                  ثبت‌نام در {gatewayInfo.name} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">۲</div>
              <div className="flex-1">
                <p className="text-xs font-bold text-emerald-900 mb-1">دریافت کد مرچنت {selectedGateway === 'idpay' ? 'و کلید API' : ''}</p>
                <p className="text-[11px] text-emerald-700 mb-2">
                  مسیر دریافت: <span className="font-mono bg-emerald-100 px-2 py-0.5 rounded">{gatewayInfo.merchantHelp}</span>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="w-6 h-6 bg-amber-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">۳</div>
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-900 mb-1">آدرس بازگشت (Callback URL)</p>
                <p className="text-[11px] text-amber-700 mb-2">
                  💡 <strong>نیازی به ثبت در پنل نیست.</strong> سیستم ما به صورت خودکار این آدرس را در هر درخواست به درگاه ارسال می‌کند.
                </p>
                <p className="text-[10px] text-amber-800 mb-1.5">آدرس فعلی شما:</p>
                <div className="flex items-center gap-2 bg-white border border-amber-300 rounded px-2 py-1.5">
                  <code className="text-[10px] text-amber-900 font-mono flex-1 break-all" dir="ltr">
                    {callbackUrl}
                  </code>
                  <button type="button" onClick={() => copyToClipboard(callbackUrl, 'آدرس بازگشت')}
                          className="shrink-0 text-amber-600 hover:text-amber-800" title="کپی">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-amber-600 mt-1.5">
                  این آدرس خودکار بر اساس محیط (local یا production) تنظیم می‌شود.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">۴</div>
              <div className="flex-1">
                <p className="text-xs font-bold text-purple-900 mb-1">وارد کردن اطلاعات در فرم زیر</p>
                <p className="text-[11px] text-purple-700">
                  کد مرچنت {selectedGateway === 'idpay' ? 'و کلید API ' : ''}دریافتی را وارد کرده و دکمه «ذخیره و فعال‌سازی» را بزنید.
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* فرم تنظیمات */}
      <Card className={`border-2 ${isActive ? 'border-emerald-300' : 'border-gray-200'}`}>
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <GatewayIcon className={`w-4 h-4 text-${gatewayInfo.color}-600`} />
              تنظیمات درگاه {gatewayInfo.name}
            </CardTitle>
            {isActive ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
                <Power className="w-3 h-3 ml-1" /> فعال
              </Badge>
            ) : (
              <Badge variant="outline" className="text-gray-500">
                <PowerOff className="w-3 h-3 ml-1" /> غیرفعال
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-2 space-y-4">
          {/* زرین‌پال */}
          {selectedGateway === 'zarinpal' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">
                  کد مرچنت (Merchant ID) <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={zarinpalMerchantId}
                  onChange={(e) => setZarinpalMerchantId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="font-mono text-left"
                  dir="ltr"
                />
                <p className="text-[10px] text-gray-500">کد ۳۶ کاراکتری دریافتی از پنل زرین‌پال</p>
              </div>

              <div className="flex items-center justify-between p-3 bg-sky-50 border border-sky-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <TestTube2 className="w-4 h-4 text-sky-600" />
                  <div>
                    <p className="text-xs font-bold text-sky-900">حالت تست (Sandbox)</p>
                    <p className="text-[10px] text-sky-700">در این حالت پرداخت واقعی انجام نمی‌شود</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={zarinpalSandbox}
                         onChange={(e) => setZarinpalSandbox(e.target.checked)}
                         className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                </label>
              </div>
            </>
          )}

          {/* ای‌دی‌پی */}
          {selectedGateway === 'idpay' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">
                  شناسه پذیرنده (Merchant ID) <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={idpayMerchantId}
                  onChange={(e) => setIdpayMerchantId(e.target.value)}
                  placeholder="مثلاً: 123456"
                  className="font-mono text-left"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">
                  کلید API (X-API-KEY) <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={idpayApiKey}
                    onChange={(e) => setIdpayApiKey(e.target.value)}
                    placeholder={idpayApiKeyExists ? '•••••••• تنظیم شده •••••••• (برای تغییر، کلید جدید را وارد کنید)' : 'کلید API خود را وارد کنید'}
                    className={`font-mono text-left pl-10 ${idpayApiKeyExists && !idpayApiKey ? 'bg-emerald-50 border-emerald-200' : ''}`}
                    dir="ltr"
                  />
                  <button type="button" onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {idpayApiKeyExists && !idpayApiKey && (
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                    <CheckCircle2 className="w-3 h-3" />
                    کلید API قبلاً تنظیم شده است. برای تغییر، کلید جدید را وارد کنید.
                  </div>
                )}
                {!idpayApiKeyExists && (
                  <p className="text-[10px] text-gray-500">کلید API دریافتی از پنل ای‌دی‌پی</p>
                )}
              </div>

              <div className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <TestTube2 className="w-4 h-4 text-purple-600" />
                  <div>
                    <p className="text-xs font-bold text-purple-900">حالت تست (Sandbox)</p>
                    <p className="text-[10px] text-purple-700">در این حالت پرداخت واقعی انجام نمی‌شود</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={idpaySandbox}
                         onChange={(e) => setIdpaySandbox(e.target.checked)}
                         className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
            </>
          )}

          {/* اطلاعات بانکی */}
          <div className="pt-3 border-t border-gray-200">
            <h4 className="text-xs font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-600" />
              اطلاعات حساب بانکی (اختیاری - برای نمایش در رسید)
            </h4>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">شماره شبا</Label>
                <Input
                  value={selectedGateway === 'zarinpal' ? zarinpalBankIban : idpayBankIban}
                  onChange={(e) => {
                    if (selectedGateway === 'zarinpal') setZarinpalBankIban(e.target.value)
                    else setIdpayBankIban(e.target.value)
                  }}
                  placeholder="IR820570012880011411111111"
                  className="font-mono text-left"
                  dir="ltr"
                  maxLength={26}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">نام بانک</Label>
                <Input
                  value={selectedGateway === 'zarinpal' ? zarinpalBankName : idpayBankName}
                  onChange={(e) => {
                    if (selectedGateway === 'zarinpal') setZarinpalBankName(e.target.value)
                    else setIdpayBankName(e.target.value)
                  }}
                  placeholder="مثلاً: بانک ملت"
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>

          {/* دکمه‌ها */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-200">
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? (
                <><Loader2 className="w-4 h-4 ml-1 animate-spin" /> در حال ذخیره...</>
              ) : saved ? (
                <><CheckCircle2 className="w-4 h-4 ml-1" /> ذخیره شد ✓</>
              ) : (
                <><Save className="w-4 h-4 ml-1" /> ذخیره و فعال‌سازی</>
              )}
            </Button>

            {isActive && (
              <Button variant="outline" onClick={handleDeactivate} disabled={saving}
                      className="text-red-600 border-red-300 hover:bg-red-50">
                <PowerOff className="w-4 h-4 ml-1" /> غیرفعال‌سازی
              </Button>
            )}

            <a href={gatewayInfo.panelUrl} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 px-3 py-2 text-xs text-gray-700 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
              <ExternalLink className="w-3 h-3" />
              ورود به پنل {gatewayInfo.name}
            </a>
          </div>

          {isActive && (
            <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2">
              <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-800">
                <p className="font-bold mb-1">✓ درگاه فعال است</p>
                <p className="text-[11px] leading-relaxed">
                  مشتریان می‌توانند از پورتال یا فاکتور، پرداخت آنلاین انجام دهند.
                  مبلغ مستقیماً به حساب شما واریز می‌شود.
                </p>
              </div>
            </div>
          )}

          {((selectedGateway === 'zarinpal' && zarinpalSandbox) ||
            (selectedGateway === 'idpay' && idpaySandbox)) && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <TestTube2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800">
                <p className="font-bold mb-1">⚠️ حالت تست فعال است</p>
                <p className="text-[11px] leading-relaxed">
                  در این حالت هیچ پرداخت واقعی انجام نمی‌شود. پس از تست، حالت تست را غیرفعال و ذخیره کنید.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* نکات مهم */}
      <Card className="border-gray-200 bg-gray-50">
        <CardContent className="p-4 space-y-2">
          <h4 className="text-xs font-bold text-gray-900 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600" />
            نکات مهم
          </h4>
          <ul className="text-[11px] text-gray-700 space-y-1.5 pr-4">
            <li className="flex items-start gap-1.5">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>می‌توانید هر دو درگاه را تنظیم کنید، اما فقط یکی فعال می‌شود</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>فعال کردن یک درگاه، به‌صورت خودکار دیگری را غیرفعال می‌کند</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>اسناد حسابداری به‌صورت خودکار برای هر پرداخت صادر می‌شود</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-emerald-600 mt-0.5">✓</span>
              <span>کارمزد درگاه به‌عنوان هزینه ثبت می‌شود</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-blue-600 mt-0.5">ℹ</span>
              <span>آدرس بازگشت خودکار بر اساس محیط (local یا production) تنظیم می‌شود</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-blue-600 mt-0.5">ℹ</span>
              <span>برای production، متغیر <code className="bg-gray-200 px-1 rounded">NEXT_PUBLIC_APP_URL</code> را در <code className="bg-gray-200 px-1 rounded">.env</code> تنظیم کنید</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

export default PaymentGatewayTab