// ============================================================================
// src/components/settings/payment-gateway-tab.tsx — v8.2 ★★★
// ShopAccounting — Settings: Payment Gateway Tab (تسهیم فردایی)
// ----------------------------------------------------------------------------
// ★★★ v10.1 اصلاحات:
//   ✓ حذف tenantId از query parameters (استفاده از middleware)
//   ✓ رفع خطای Unknown argument `tenantId`
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  CreditCard,
  Save,
  CheckCircle2,
  Loader2,
  Info,
  Calculator,
  TrendingUp,
  TrendingDown,
  ExternalLink,
} from 'lucide-react'

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <Card className="border-gray-200">
      <CardHeader className="p-2.5 sm:p-3 cursor-pointer" onClick={onToggle}>
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600" />
            {title}
          </span>
          <span className="text-xs text-gray-400">{open ? '▲' : '▼'}</span>
        </CardTitle>
      </CardHeader>
      {open && <CardContent className="p-2.5 sm:p-3 pt-0">{children}</CardContent>}
    </Card>
  )
}

function TashimCalculator({
  platformRate,
  gatewayRate,
}: {
  platformRate: number
  gatewayRate: number
}) {
  const [sampleAmount, setSampleAmount] = useState('1000000')

  const amount = parseInt(sampleAmount.replace(/\D/g, '')) || 0
  const platformFee = Math.round((amount * platformRate) / 100)
  const gatewayFee = Math.round((amount * gatewayRate) / 100)
  const netToMerchant = Math.max(0, amount - platformFee - gatewayFee)

  return (
    <div className="bg-gradient-to-l from-blue-50 to-emerald-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Calculator className="w-4 h-4 text-blue-600" />
        <h4 className="text-sm font-bold text-gray-700">ماشین حساب تسهیم (نمونه)</h4>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sampleAmount" className="text-xs">مبلغ فاکتور نمونه (ریال)</Label>
        <Input
          id="sampleAmount"
          value={sampleAmount}
          onChange={(e) => setSampleAmount(e.target.value)}
          className="font-mono text-left"
          dir="ltr"
          placeholder="1000000"
        />
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
          <span className="text-gray-600">مبلغ پرداختی مشتری:</span>
          <span className="font-mono font-bold text-gray-900">{formatRial(amount)}</span>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
          <span className="flex items-center gap-1 text-red-600">
            <TrendingDown className="w-3 h-3" />
            کارمزد درگاه زرین‌پال ({gatewayRate}٪):
          </span>
          <span className="font-mono text-red-600">- {formatRial(gatewayFee)}</span>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
          <span className="flex items-center gap-1 text-orange-600">
            <TrendingDown className="w-3 h-3" />
            کارمزد پلتفرم ({platformRate}٪):
          </span>
          <span className="font-mono text-orange-600">- {formatRial(platformFee)}</span>
        </div>
        <div className="flex justify-between items-center py-2 bg-emerald-100 rounded px-2">
          <span className="flex items-center gap-1 font-bold text-emerald-700">
            <TrendingUp className="w-4 h-4" />
            خالص واریزی به حساب شما:
          </span>
          <span className="font-mono font-bold text-emerald-700">{formatRial(netToMerchant)}</span>
        </div>
      </div>

      <p className="text-[10px] text-gray-500 leading-relaxed">
        ※ این محاسبه تخمینی است. کارمزد واقعی زرین‌پال پس از پرداخت، از پاسخ verify استخراج شده و
        مبلغ دقیق خالص واریزی در گزارش پرداخت‌های آنلاین نمایش داده می‌شود.
      </p>
    </div>
  )
}

function RecentPaymentsPreview() {
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // ★★★ حذف tenantId از URL
    fetch('/api/payments/online?limit=5&status=paid&summary=false')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data?.payments) {
          setPayments(data.data.payments)
        }
      })
      .catch(err => console.error('[RecentPayments] Error:', err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
        <span className="mr-2 text-xs text-gray-500">در حال بارگذاری...</span>
      </div>
    )
  }

  if (payments.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-gray-400">
        هنوز پرداخت آنلاینی ثبت نشده است
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {payments.map(p => (
        <div key={p.id} className="flex items-center justify-between text-xs py-2 border-b border-gray-100 last:border-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <div>
              <div className="font-medium text-gray-700">
                فاکتور {p.invoiceNumber || '—'}
              </div>
              <div className="text-[10px] text-gray-400">
                {p.customerName || 'مشتری ناشناس'} • {p.paidAt ? new Date(p.paidAt).toLocaleDateString('fa-IR') : '—'}
              </div>
            </div>
          </div>
          <div className="text-left">
            <div className="font-mono font-bold text-gray-900">
              {formatRial(p.netSettledAmount || p.amount)}
            </div>
            <div className="text-[10px] text-gray-400">
              از {formatRial(p.amount)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function formatRial(num: number): string {
  return num.toLocaleString('fa-IR') + ' ریال'
}

export function PaymentGatewayTab() {
  const [guideOpen, setGuideOpen] = useState(true)
  const [calcOpen, setCalcOpen] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)
  const [bankIban, setBankIban] = useState('')
  const [bankName, setBankName] = useState('')
  const [platformRate, setPlatformRate] = useState(1.0)
  const [gatewayRate, setGatewayRate] = useState(1.5)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  // ★ لود تنظیمات فعلی — بدون tenantId
  useEffect(() => {
    fetch('/api/store-settings')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          const s = data.data.settings || data.data
          if (s.bankIban) setBankIban(s.bankIban)
          if (s.bankName) setBankName(s.bankName)
          if (s.platformCommissionRate !== undefined) setPlatformRate(Number(s.platformCommissionRate) || 1.0)
          if (s.gatewayFeeRate !== undefined) setGatewayRate(Number(s.gatewayFeeRate) || 1.5)
        }
      })
      .catch(err => {
        console.error('[PaymentGatewayTab] Load error:', err)
        setError('خطا در بارگذاری تنظیمات')
      })
      .finally(() => setLoading(false))
  }, [])

  const validateIban = (iban: string): string | null => {
    const cleaned = iban.replace(/\s/g, '').toUpperCase()
    if (!cleaned) return 'شماره شبا الزامی است'
    if (!/^IR\d{24}$/.test(cleaned)) {
      return 'فرمت شبا نامعتبر است. مثال درست: IR820570012880011411111111'
    }
    return null
  }

  const handleIbanChange = (value: string) => {
    setBankIban(value)
    setValidationError(validateIban(value))
  }

  const handleSave = async () => {
    setError(null)
    setValidationError(null)

    const ibanError = validateIban(bankIban)
    if (ibanError) {
      setValidationError(ibanError)
      return
    }

    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/store-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankIban: bankIban.replace(/\s/g, '').toUpperCase(),
          bankName: bankName.trim() || undefined,
          platformCommissionRate: platformRate,
          gatewayFeeRate: gatewayRate,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        setError(data.error || 'خطا در ذخیره')
      }
    } catch (err) {
      console.error('[PaymentGatewayTab] Save error:', err)
      setError('خطا در ارتباط با سرور')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        <span className="mr-2 text-sm text-gray-600">در حال بارگذاری...</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <CollapsibleSection title="راهنمای تسهیم فردایی زرین‌پال" open={guideOpen} onToggle={() => setGuideOpen(!guideOpen)}>
        <div className="text-sm text-gray-600 pr-2 space-y-3">
          <p>
            درگاه پرداخت این سامانه از طریق <strong>تسهیم فردایی زرین‌پال</strong> فعالیت می‌کند.
            این روش به چندین طرف اجازه می‌دهد سهم خود را از هر پرداخت به‌صورت خودکار دریافت کنند.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <p className="font-bold text-blue-800 mb-2">نحوه تسهیم مبلغ:</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700">
              <li>مشتری مبلغ <strong>کامل فاکتور</strong> را به زرین‌پال پرداخت می‌کند</li>
              <li>زرین‌پال کارمزد خود را (~{gatewayRate}٪) کسر می‌کند</li>
              <li>سهم پلتفرم ShopAccounting ({platformRate}٪) به حساب پلتفرم واریز می‌شود</li>
              <li>مبلغ باقی‌مانده (خالص) به <strong>شبای شما</strong> واریز می‌شود</li>
            </ol>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded p-3">
            <p className="font-bold text-amber-800 mb-1">★ نکته مهم حسابداری:</p>
            <p className="text-amber-700">
              درآمد فروش شما همیشه <strong>مبلغ کامل فاکتور</strong> ثبت می‌شود.
              کارمزدها به‌عنوان <strong>هزینه</strong> در سود و زیان ظاهر می‌شوند، نه کسر از درآمد.
              این روش با استانداردهای حسابداری و سامانه مودیان سازگار است.
            </p>
          </div>

          <div className="text-xs text-gray-500 space-y-1">
            <p>✓ نیازی به دریافت درگاه اختصاصی یا مرچنت کد نیست</p>
            <p>✓ سند حسابداری به‌صورت خودکار با ۴ ردیف صادر می‌شود</p>
            <p>✓ گزارش پرداخت‌های آنلاین با تفکیک کارمزدها قابل مشاهده است</p>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="ماشین حساب تسهیم (نمونه محاسبه)" open={calcOpen} onToggle={() => setCalcOpen(!calcOpen)}>
        <TashimCalculator platformRate={platformRate} gatewayRate={gatewayRate} />
      </CollapsibleSection>

      <Card className="border-gray-200">
        <CardHeader className="p-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            تنظیمات حساب واریز
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3 pt-0">
          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-700 text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 flex items-start gap-2">
            <CreditCard className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">درگاه اشتراکی زرین‌پال با تسهیم فردایی</p>
              <p className="mt-1">
                مشتریان شما پس از کلیک روی «پرداخت آنلاین»، به درگاه زرین‌پال هدایت می‌شوند.
                مبلغ کامل فاکتور توسط مشتری پرداخت شده و خالص مبلغ (پس از کسر کارمزدها) به شبا شما واریز می‌گردد.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bankIban" className="text-xs">
              شماره شبا (الزامی)
            </Label>
            <Input
              id="bankIban"
              value={bankIban}
              onChange={(e) => handleIbanChange(e.target.value)}
              placeholder="IR820570012880011411111111"
              className={`font-mono ${validationError ? 'border-red-500' : ''}`}
              dir="ltr"
              maxLength={26}
            />
            {validationError ? (
              <p className="text-[10px] text-red-500">{validationError}</p>
            ) : (
              <p className="text-[10px] text-gray-400">فرمت صحیح: IR و سپس ۲۴ رقم</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bankName" className="text-xs">
              نام بانک (اختیاری)
            </Label>
            <Input
              id="bankName"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="مثلاً: بانک ملت"
              className="h-8 text-xs"
            />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="platformRate" className="text-xs">
                کارمزد پلتفرم (٪)
              </Label>
              <Input
                id="platformRate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={platformRate}
                onChange={(e) => setPlatformRate(Number(e.target.value) || 0)}
                className="h-8 text-xs"
                disabled
              />
              <p className="text-[10px] text-gray-400">تنظیم شده توسط پلتفرم</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gatewayRate" className="text-xs">
                کارمزد زرین‌پال (٪)
              </Label>
              <Input
                id="gatewayRate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={gatewayRate}
                onChange={(e) => setGatewayRate(Number(e.target.value) || 0)}
                className="h-8 text-xs"
                disabled
              />
              <p className="text-[10px] text-gray-400">تخمینی — مقدار واقعی از verify</p>
            </div>
          </div>

          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
            onClick={handleSave}
            disabled={saving || !!validationError}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-4 h-4 ml-1" />
            ) : (
              <Save className="w-4 h-4 ml-1" />
            )}
            {saving ? 'در حال ذخیره...' : saved ? 'ذخیره شد ✓' : 'ذخیره'}
          </Button>
        </CardContent>
      </Card>

      <CollapsibleSection
        title="آخرین پرداخت‌های آنلاین"
        open={recentOpen}
        onToggle={() => setRecentOpen(!recentOpen)}
      >
        <RecentPaymentsPreview />
        {recentOpen && (
          <div className="mt-3 text-center">
            <a
              href="/reports/online-payments"
              className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
            >
              مشاهده گزارش کامل
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}