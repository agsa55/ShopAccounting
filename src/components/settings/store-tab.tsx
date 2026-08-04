'use client'

// ============================================================================
// src/components/settings/store-tab.tsx
// ShopAccounting — تب تنظیمات فروشگاه
// ============================================================================

import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { getTenantIdFromStore } from '@/lib/tenant-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Store, Globe, Copy, ExternalLink, Save, Loader2, CheckCircle2,
  Upload, Printer,
} from 'lucide-react'

export function StoreSettingsTab() {
  const currentTenant = useAppStore((s) => s.currentTenant)
  const tenantId = useAppStore((s) => s.tenantId)
  const user = useAppStore((s) => s.user)
  const [storeName, setStoreName] = useState('فروشگاه نمونه')
  const [address, setAddress] = useState('تهران، خیابان ولیعصر، پلاک ۱۲')
  const [phone, setPhone] = useState('02112345678')
  const [registrationNumber, setRegistrationNumber] = useState('12345')
  const [defaultTaxRate, setDefaultTaxRate] = useState('9')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  // ★★★ v3.20: تنظیمات چاپ خودکار
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false)
  // ★★★ v3.36.7: اضافه شدن گزینه 58mm برای چاپ خودکار
  const [autoPrintTemplate, setAutoPrintTemplate] = useState<'58mm' | '8cm' | 'a4'>('8cm')
  const [autoPrintPaymentTypes, setAutoPrintPaymentTypes] = useState<string[]>(['cash', 'card', 'credit', 'installment'])
  // ★★★ v3.17.1: state برای tenant data از API
  const [tenantData, setTenantData] = useState<any>(null)

  // ★★★ v3.17.1: دریافت subDomain از چند منبع
  const getSubDomain = (): string => {
    if (currentTenant?.subDomain) return currentTenant.subDomain
    if (typeof window !== 'undefined') {
      const path = window.location.pathname
      const match = path.match(/^\/([^\/]+)/)
      if (match && match[1]) {
        const candidate = match[1]
        if (!['api', 'login', 'register', '_next', 'favicon.ico'].includes(candidate)) {
          return candidate
        }
      }
    }
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('tenant')
      if (stored) {
        try {
          const t = JSON.parse(stored)
          if (t?.subDomain) return t.subDomain
        } catch {}
      }
    }
    if (tenantData?.subDomain) return tenantData.subDomain
    return ''
  }

  const subDomain = getSubDomain()
  const isLocalDev = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  )
  const fullDomain = subDomain
    ? (isLocalDev ? `${window.location.host}/${subDomain}` : `${subDomain}.shopaccounting.ir`)
    : ''
  const fullUrl = subDomain
    ? (isLocalDev ? `${window.location.origin}/${subDomain}` : `https://${subDomain}.shopaccounting.ir`)
    : ''

  useEffect(() => {
    const tid = tenantId || getTenantIdFromStore()
    if (!tid) return

    const printSettings = localStorage.getItem('auto-print-settings')
    if (printSettings) {
      try {
        const ps = JSON.parse(printSettings)
        setAutoPrintEnabled(ps.enabled || false)
        setAutoPrintTemplate(ps.template || '8cm')
        setAutoPrintPaymentTypes(ps.paymentTypes || ['cash', 'card', 'credit', 'installment'])
      } catch {}
    }

    fetch(`/api/tenants/trial-check`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) setTenantData(data.data)
      })
      .catch(() => {})

    fetch(`/api/store-settings?tenantId=${tid}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          const s = data.data.settings || data.data
          if (s.storeName) setStoreName(s.storeName)
          if (s.address) setAddress(s.address)
          if (s.phone) setPhone(s.phone)
          if (s.registrationNumber) setRegistrationNumber(s.registrationNumber)
          if (s.defaultTaxRate !== undefined && s.defaultTaxRate !== null) {
            setDefaultTaxRate(String(s.defaultTaxRate))
          }
          if (s.storeName) {
            try {
              useAppStore.setState((state) => ({ storeName: s.storeName }))
            } catch {}
          }
        }
      })
      .catch(() => {})
  }, [tenantId, currentTenant, user])

  const handleSave = async () => {
    setSaving(true)
    try {
      const tid = tenantId || getTenantIdFromStore()
      if (!tid) {
        alert('خطا: شناسه فروشگاه در دسترس نیست')
        setSaving(false)
        return
      }
      localStorage.setItem('auto-print-settings', JSON.stringify({
        enabled: autoPrintEnabled,
        template: autoPrintTemplate,
        paymentTypes: autoPrintPaymentTypes,
      }))

      const res = await fetch('/api/store-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tid,
          storeName,
          address,
          phone,
          registrationNumber,
          defaultTaxRate: parseFloat(defaultTaxRate) || 0,
        }),
      })
      const data = await res.json()
      if (data.success) {
        try {
          useAppStore.setState((state) => ({ storeName: storeName }))
        } catch {}
        alert(data.message || 'تنظیمات با موفقیت ذخیره شد')
        try {
          const verifyRes = await fetch(`/api/store-settings?tenantId=${tid}`)
          const verifyData = await verifyRes.json()
          if (verifyData.success && verifyData.data) {
            const s = verifyData.data.settings || verifyData.data
            if (s.storeName) setStoreName(s.storeName)
            if (s.address) setAddress(s.address)
            if (s.phone) setPhone(s.phone)
            if (s.registrationNumber) setRegistrationNumber(s.registrationNumber)
            if (s.defaultTaxRate !== undefined && s.defaultTaxRate !== null) {
              setDefaultTaxRate(String(s.defaultTaxRate))
            }
          }
        } catch (verifyErr) {
          console.warn('[StoreSettings] Verify failed (non-blocking):', verifyErr)
        }
      } else {
        alert(data.error || 'خطا در ذخیره تنظیمات')
      }
    } catch (err: any) {
      console.error('[StoreSettings] Save error:', err)
      alert('خطا در ارتباط با سرور: ' + (err?.message || 'نامشخص'))
    }
    setSaving(false)
  }

  const handleCopyDomain = () => {
    if (!fullUrl) return
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      const textArea = document.createElement('textarea')
      textArea.value = fullUrl
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleOpenDomain = () => {
    if (!fullUrl) return
    window.open(fullUrl, '_blank')
  }

  return (
    <Card className="border-gray-200">
      <CardHeader className="p-2.5 sm:p-3 pb-1">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Store className="w-4 h-4 text-emerald-600" />
          اطلاعات فروشگاه
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2.5 sm:p-3 pt-2 space-y-2">
        {subDomain && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
            <Globe className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-gray-500">آدرس اختصاصی فروشگاه</p>
              <p className="text-xs font-bold text-emerald-700 truncate" dir="ltr">{fullDomain}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-500 hover:text-emerald-600 shrink-0"
              onClick={handleCopyDomain}
              title="کپی آدرس"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-500 hover:text-emerald-600 shrink-0"
              onClick={handleOpenDomain}
              title="باز کردن در تب جدید"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div>
            <Label htmlFor="storeName" className="text-[11px] text-gray-600 mb-0.5 block">نام فروشگاه</Label>
            <Input id="storeName" value={storeName} onChange={(e) => setStoreName(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label htmlFor="phone" className="text-[11px] text-gray-600 mb-0.5 block">شماره تماس</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="h-8 text-xs" />
          </div>
          <div>
            <Label htmlFor="regNumber" className="text-[11px] text-gray-600 mb-0.5 block">شماره ثبت</Label>
            <Input id="regNumber" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} dir="ltr" className="h-8 text-xs" />
          </div>
        </div>

        <div>
          <Label htmlFor="address" className="text-[11px] text-gray-600 mb-0.5 block">آدرس</Label>
          <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} rows={1} className="text-xs min-h-[32px]" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
          <div>
            <Label htmlFor="taxRate" className="text-[11px] text-gray-600 mb-0.5 block">درصد مالیات پیش‌فرض</Label>
            <Input id="taxRate" type="number" value={defaultTaxRate} onChange={(e) => setDefaultTaxRate(e.target.value)} dir="ltr" className="h-8 text-xs" />
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5 ml-1" />ذخیره تنظیمات</>}
          </Button>
        </div>

        <Separator className="my-1" />

        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-blue-600" />
                <p className="text-[11px] font-bold text-blue-800">چاپ خودکار فاکتور</p>
              </div>
              <Switch checked={autoPrintEnabled} onCheckedChange={setAutoPrintEnabled} />
            </div>
            {autoPrintEnabled && (
              <div className="space-y-2 pt-1 border-t border-blue-100">
                <div>
                  <Label className="text-[10px] text-gray-600 mb-0.5 block">قالب چاپ</Label>
                  <div className="flex gap-1">
                    <button
                      className={`flex-1 py-1 text-[10px] rounded border ${autoPrintTemplate === '58mm' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
                      onClick={() => setAutoPrintTemplate('58mm')}
                    >
                      ۵ سانتی
                    </button>
                    <button
                      className={`flex-1 py-1 text-[10px] rounded border ${autoPrintTemplate === '8cm' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
                      onClick={() => setAutoPrintTemplate('8cm')}
                    >
                      ۸ سانتی
                    </button>
                    <button
                      className={`flex-1 py-1 text-[10px] rounded border ${autoPrintTemplate === 'a4' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
                      onClick={() => setAutoPrintTemplate('a4')}
                    >
                      A4
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] text-gray-600 mb-0.5 block">چاپ برای کدام نوع پرداخت؟</Label>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { key: 'cash', label: 'نقدی' },
                      { key: 'card', label: 'کارتخوان' },
                      { key: 'credit', label: 'نسیه' },
                      { key: 'installment', label: 'قسطی' },
                    ].map((pt) => (
                      <label key={pt.key} className={`flex items-center gap-1 p-1 rounded border cursor-pointer text-[10px] ${autoPrintPaymentTypes.includes(pt.key) ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-500'}`}>
                        <input
                          type="checkbox"
                          checked={autoPrintPaymentTypes.includes(pt.key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAutoPrintPaymentTypes([...autoPrintPaymentTypes, pt.key])
                            } else {
                              setAutoPrintPaymentTypes(autoPrintPaymentTypes.filter((k) => k !== pt.key))
                            }
                          }}
                          className="w-3 h-3"
                        />
                        {pt.label}
                      </label>
                    ))}
                  </div>
                </div>
                <p className="text-[9px] text-blue-600">
                  با فعال کردن این گزینه، به محض ثبت فاکتور، فاکتور با قالب انتخاب‌شده چاپ می‌شود.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator className="my-1" />

        <div className="flex items-center gap-2 border border-dashed border-gray-200 rounded-lg p-2 hover:border-emerald-300 transition-colors cursor-pointer">
          <Upload className="w-5 h-5 text-gray-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-600">آپلود لوگوی فروشگاه</p>
            <p className="text-[9px] text-gray-400">PNG, JPG تا ۲ مگابایت</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}