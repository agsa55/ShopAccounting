'use client'

// ============================================================================
// src/components/settings/moidian-tab.tsx — تب تنظیمات اتصال سامانه مودیان
// ============================================================================
// ★ این کامپوننت در صفحه تنظیمات (settings-page.tsx) به‌عنوان یک تب نمایش داده می‌شود.
// ★ قابلیت‌ها:
//   - نمایش وضعیت اتصال فعلی
//   - فرم ورود credentials (clientId, clientSecret, privateKey, fiscalId, ...)
//   - دکمه تست اتصال
//   - دکمه ذخیره / حذف تنظیمات
//   - نمایش آمار فاکتورهای ارسال‌شده
//   - تنظیم autoSubmit (ارسال خودکار فاکتورهای جدید)
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Loader2, AlertCircle, CheckCircle2, XCircle, Building2, KeyRound,
  ShieldCheck, Activity, Send, Trash2, RefreshCw, FileText, Crown,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'

interface MoidianSettings {
  id: string
  tenantId: string
  fiscalId: string
  economicCode: string | null
  clientId: string
  environment: 'sandbox' | 'production'
  isInitialized: boolean
  autoSubmit: boolean
  lastSyncAt: string | null
  totalSubmitted: number
  totalAccepted: number
  totalRejected: number
  hasClientSecret: boolean
  hasPrivateKey: boolean
  hasAccessToken: boolean
  tokenExpiresAt: string | null
}

interface MoidianStats {
  pending: number
  submitted: number
  accepted: number
  rejected: number
  failed: number
  cancelled: number
  total: number
}

function formatNumberFa(num: number): string {
  return (num || 0).toLocaleString('fa-IR')
}

function formatDateTimeFa(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fa-IR')
  } catch {
    return iso
  }
}

export function MoidianTab() {
  const planName = useAppStore((s) => s.planName)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [settings, setSettings] = useState<MoidianSettings | null>(null)
  const [stats, setStats] = useState<MoidianStats | null>(null)
  const [usingFallbackKey, setUsingFallbackKey] = useState(false)

  // ★ فرم ورود credentials
  const [form, setForm] = useState({
    fiscalId: '',
    economicCode: '',
    clientId: '',
    clientSecret: '',
    privateKey: '',
    environment: 'sandbox' as 'sandbox' | 'production',
    autoSubmit: true,
  })

  // ★ load initial data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/moidian', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await res.json()
      if (data.success) {
        setSettings(data.data.settings)
        setStats(data.data.stats)
        setUsingFallbackKey(data.data.usingFallbackEncryptionKey || false)

        // ★ pre-fill form با اطلاعات موجود
        if (data.data.settings) {
          setForm((f) => ({
            ...f,
            fiscalId: data.data.settings.fiscalId || '',
            economicCode: data.data.settings.economicCode || '',
            clientId: data.data.settings.clientId || '',
            environment: data.data.settings.environment || 'sandbox',
            autoSubmit: data.data.settings.autoSubmit ?? true,
          }))
        }
      } else {
        setError(data.error || 'خطا در بارگذاری اطلاعات')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ★ clear success/error after 5 sec
  useEffect(() => {
    if (success || error) {
      const t = setTimeout(() => {
        setSuccess(null)
        setError(null)
      }, 5000)
      return () => clearTimeout(t)
    }
  }, [success, error])

  // ★ save settings
  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/moidian/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...form,
          testConnection: true, // ★ بعد از ذخیره، اتصال را تست کن
        }),
      })
      const data = await res.json()

      if (data.success) {
        setSuccess('تنظیمات با موفقیت ذخیره شد' + (data.testResult?.success ? ' و اتصال برقرار است ✓' : ' اما اتصال ناموفق بود'))
        await loadData() // ★ reload
      } else {
        setError(data.error || 'خطا در ذخیره')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    }
    setSaving(false)
  }

  // ★ test connection
  const handleTest = async () => {
    setTesting(true)
    setError(null)
    setSuccess(null)
    try {
      // ★ اول ذخیره می‌کنیم بعد تست
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/moidian/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...form, testConnection: true }),
      })
      const data = await res.json()

      if (data.success && data.testResult?.success) {
        setSuccess('اتصال برقرار است ✓')
      } else {
        setError(data.testResult?.message || data.error || 'اتصال برقرار نشد')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    }
    setTesting(false)
  }

  // ★ delete settings
  const handleDelete = async () => {
    if (!confirm('آیا از حذف تنظیمات مودیان مطمئن هستید؟ این عمل قابل بازگشت نیست.')) return

    setDeleting(true)
    setError(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/moidian/setup', {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await res.json()

      if (data.success) {
        setSuccess('تنظیمات حذف شد')
        setForm({
          fiscalId: '', economicCode: '', clientId: '',
          clientSecret: '', privateKey: '',
          environment: 'sandbox', autoSubmit: true,
        })
        await loadData()
      } else {
        setError(data.error || 'خطا در حذف')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    }
    setDeleting(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        <span className="mr-2 text-sm text-gray-500">در حال بارگذاری...</span>
      </div>
    )
  }

  const isInitialized = settings?.isInitialized

  return (
    <div className="space-y-4" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-purple-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-base sm:text-lg font-bold text-gray-900">اتصال سامانه مودیان مالیاتی</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            ارسال خودکار فاکتورهای فروش به سامانه مالیاتی الکترونیکی
          </p>
        </div>
        {isInitialized ? (
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
            <CheckCircle2 className="w-3 h-3 ml-1" />
            متصل
          </Badge>
        ) : (
          <Badge className="bg-gray-100 text-gray-700 border-gray-200">
            <XCircle className="w-3 h-3 ml-1" />
            قطع
          </Badge>
        )}
      </div>

      {/* هشدار fallback key */}
      {usingFallbackKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            <p className="font-bold mb-1">هشدار امنیتی</p>
            <p>کلید رمزنگاری production تنظیم نشده و از کلید fallback استفاده می‌شود. برای محیط production حتماً متغیر <code className="bg-amber-100 px-1 rounded">MOIDIAN_ENCRYPTION_KEY</code> را در فایل <code className="bg-amber-100 px-1 rounded">.env</code> تنظیم کنید.</p>
          </div>
        </div>
      )}

      {/* پیام موفقیت/خطا */}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-xs text-emerald-700 flex-1">{success}</p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-xs text-red-700 flex-1">{error}</p>
        </div>
      )}

      {/* آمار فاکتورهای مودیان */}
      {isInitialized && stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <Card className="border-gray-200">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-gray-500">کل ارسالی</p>
              <p className="text-base font-bold text-gray-800">{formatNumberFa(stats.total)}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-emerald-50/30">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-gray-500">پذیرفته‌شده</p>
              <p className="text-base font-bold text-emerald-700">{formatNumberFa(stats.accepted)}</p>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50/30">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-gray-500">در انتظار</p>
              <p className="text-base font-bold text-blue-700">{formatNumberFa(stats.submitted)}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/30">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-gray-500">صف</p>
              <p className="text-base font-bold text-amber-700">{formatNumberFa(stats.pending)}</p>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50/30">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-gray-500">رد شده</p>
              <p className="text-base font-bold text-red-700">{formatNumberFa(stats.rejected + stats.failed)}</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 bg-gray-50/30">
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-gray-500">لغو شده</p>
              <p className="text-base font-bold text-gray-700">{formatNumberFa(stats.cancelled)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* فرم تنظیمات */}
      <Card className="border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-purple-600" />
            {isInitialized ? 'به‌روزرسانی credentials' : 'پیکربندی اتصال'}
          </CardTitle>
          <CardDescription className="text-xs">
            برای دریافت credentials، به سامانه مودیان (tax.gov.ir) مراجعه کرده و درخواست کلید API بدهید.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* انتخاب محیط */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">محیط</Label>
              <Select
                value={form.environment}
                onValueChange={(v) => setForm((f) => ({ ...f, environment: v as 'sandbox' | 'production' }))}
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">محیط تست (Sandbox)</SelectItem>
                  <SelectItem value="production">محیط تولید (Production)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-400 mt-1">
                محیط تست برای توسعه؛ محیط تولید برای فاکتورهای واقعی
              </p>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <Label className="text-xs">ارسال خودکار فاکتورها</Label>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  فاکتورهای جدید به‌صورت خودکار به مودیان ارسال شوند
                </p>
              </div>
              <Switch
                checked={form.autoSubmit}
                onCheckedChange={(v) => setForm((f) => ({ ...f, autoSubmit: v }))}
              />
            </div>
          </div>

          {/* fiscalId و economicCode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">شناسه مالیاتی فروشنده <span className="text-red-500">*</span></Label>
              <Input
                value={form.fiscalId}
                onChange={(e) => setForm((f) => ({ ...f, fiscalId: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                placeholder="۱۱ رقم"
                className="mt-1 font-mono"
                dir="ltr"
                maxLength={11}
              />
              <p className="text-[10px] text-gray-400 mt-1">شناسه مالیاتی ۱۱ رقمی فروشگاه</p>
            </div>
            <div>
              <Label className="text-xs">کد اقتصادی (اختیاری)</Label>
              <Input
                value={form.economicCode}
                onChange={(e) => setForm((f) => ({ ...f, economicCode: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
                placeholder="۱۲ رقم"
                className="mt-1 font-mono"
                dir="ltr"
                maxLength={12}
              />
              <p className="text-[10px] text-gray-400 mt-1">کد اقتصادی ۱۲ رقمی</p>
            </div>
          </div>

          {/* clientId */}
          <div>
            <Label className="text-xs">شناسه کلاینت (Client ID) <span className="text-red-500">*</span></Label>
            <Input
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
              placeholder="UUID از پنل مودیان"
              className="mt-1 font-mono"
              dir="ltr"
            />
          </div>

          {/* clientSecret */}
          <div>
            <Label className="text-xs">
              رمز کلاینت (Client Secret) {isInitialized && !form.clientSecret ? ' (در صورت تغییر وارد کنید)' : ' *'}
            </Label>
            <Input
              type="password"
              value={form.clientSecret}
              onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
              placeholder={isInitialized && settings?.hasClientSecret ? '••••••••••••••••' : 'رمز از پنل مودیان'}
              className="mt-1 font-mono"
              dir="ltr"
            />
          </div>

          {/* privateKey */}
          <div>
            <Label className="text-xs">
              کلید خصوصی (Private Key PEM) {isInitialized && !form.privateKey ? ' (در صورت تغییر وارد کنید)' : ' *'}
            </Label>
            <Textarea
              value={form.privateKey}
              onChange={(e) => setForm((f) => ({ ...f, privateKey: e.target.value }))}
              placeholder={isInitialized && settings?.hasPrivateKey ? '•••• کلید خصوصی قبلی ذخیره شده ••••' : `-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----`}
              className="mt-1 font-mono text-[10px]"
              dir="ltr"
              rows={5}
            />
            <p className="text-[10px] text-gray-400 mt-1">
              کلید خصوصی RSA به فرمت PKCS#8 PEM — از پنل مودیان دانلود کنید
            </p>
          </div>

          {/* دکمه‌ها */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              {saving ? 'در حال ذخیره...' : 'ذخیره و تست اتصال'}
            </Button>

            <Button
              onClick={handleTest}
              disabled={testing || !isInitialized}
              variant="outline"
              className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
              تست اتصال
            </Button>

            {isInitialized && (
              <Button
                onClick={handleDelete}
                disabled={deleting}
                variant="outline"
                className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50 mr-auto"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                حذف تنظیمات
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* اطلاعات آخرین همگام‌سازی */}
      {isInitialized && settings?.lastSyncAt && (
        <Card className="border-gray-200 bg-gray-50/30">
          <CardContent className="p-3 text-xs text-gray-600">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span>آخرین همگام‌سازی موفق: <strong>{formatDateTimeFa(settings.lastSyncAt)}</strong></span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadData}>
                <RefreshCw className="w-3 h-3 ml-1" />
                به‌روزرسانی
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* راهنمای راه‌اندازی */}
      {!isInitialized && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-800">
              <FileText className="w-4 h-4" />
              راهنمای راه‌اندازی
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-blue-700 space-y-2">
            <p><strong>گام ۱:</strong> به سامانه <a href="https://www.tax.gov.ir" target="_blank" rel="noopener noreferrer" className="underline">tax.gov.ir</a> مراجعه کنید و درخواست ثبت‌نام سامانه مودیان ثبت کنید.</p>
            <p><strong>گام ۲:</strong> پس از تأیید، شناسه مالیاتی، کد اقتصادی، Client ID و Client Secret دریافت می‌کنید.</p>
            <p><strong>گام ۳:</strong> یک جفت کلید RSA (۲۰۴۸ بیت) تولید کنید و کلید عمومی را در پنل مودیان ثبت کنید. کلید خصوصی را اینجا وارد کنید.</p>
            <p><strong>گام ۴:</strong> همه اطلاعات را در فرم بالا وارد کرده و دکمه «ذخیره و تست اتصال» را بزنید.</p>
            <p><strong>گام ۵:</strong> اگر تست موفق بود، از این پس فاکتورهای جدید خودکار به مودیان ارسال می‌شوند (در صورت فعال بودن «ارسال خودکار»).</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
