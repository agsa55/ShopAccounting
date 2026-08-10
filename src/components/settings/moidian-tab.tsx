'use client'

// ============================================================================
// src/components/settings/moidian-tab.tsx — تب سامانه مودیان (نسخه ساده)
// ============================================================================
// ★ v9.5.0: بازطراحی کامل برای سادگی کاربر نهایی
// ★ کاربر فقط کدها را paste می‌کند، هیچ دانش فنی نیاز نیست
// ★ راهنمای گام‌به‌گام با تصویرسازی
// ★ حذف کامل مفهوم "تولید کلید RSA" از UI
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
  ExternalLink, Download, ClipboardPaste, HelpCircle, Info, Sparkles,
  ArrowLeft, ArrowRight, Check, Copy, Eye, EyeOff,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'

// ─── Types ────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────

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

// ─── کامپوننت اصلی ──────────────────────────────────────────

export function MoidianTab() {
  const planName = useAppStore((s) => s.planName)
  
  // State ها
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [showClientSecret, setShowClientSecret] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  const [settings, setSettings] = useState<MoidianSettings | null>(null)
  const [stats, setStats] = useState<MoidianStats | null>(null)
  const [usingFallbackKey, setUsingFallbackKey] = useState(false)

  // فرم
  const [form, setForm] = useState({
    fiscalId: '',
    economicCode: '',
    clientId: '',
    clientSecret: '',
    privateKey: '',
    environment: 'production' as 'sandbox' | 'production',
    autoSubmit: true,
  })

  // ─── Load Data ──────────────────────────────────────────────

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

        if (data.data.settings) {
          setForm((f) => ({
            ...f,
            fiscalId: data.data.settings.fiscalId || '',
            economicCode: data.data.settings.economicCode || '',
            clientId: data.data.settings.clientId || '',
            environment: data.data.settings.environment || 'production',
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

  useEffect(() => {
    if (success || error) {
      const t = setTimeout(() => {
        setSuccess(null)
        setError(null)
      }, 5000)
      return () => clearTimeout(t)
    }
  }, [success, error])

  // ─── Actions ────────────────────────────────────────────────

  const handleSave = async () => {
    // اعتبارسنجی ساده برای کاربر
    if (!form.fiscalId || form.fiscalId.length !== 11) {
      setError('شناسه یکتای حافظه مالیاتی باید دقیقاً ۱۱ رقم باشد')
      return
    }
    if (!form.clientId) {
      setError('شناسه کلاینت را از پنل سامانه مودیان کپی کنید')
      return
    }
    if (!form.clientSecret) {
      setError('رمز کلاینت را از پنل سامانه مودیان کپی کنید')
      return
    }
    if (!form.privateKey || form.privateKey.length < 50) {
      setError('کلید خصوصی را از پنل سامانه مودیان دانلود و اینجا paste کنید')
      return
    }

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
        body: JSON.stringify({ ...form, testConnection: true }),
      })
      const data = await res.json()

      if (data.success) {
        setSuccess('✅ تنظیمات با موفقیت ذخیره شد' + (data.testResult?.success ? ' و اتصال برقرار است' : ''))
        await loadData()
      } else {
        setError(data.error || 'خطا در ذخیره')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!confirm('آیا از حذف تنظیمات مطمئن هستید؟')) return
    setDeleting(true)
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
          environment: 'production', autoSubmit: true,
        })
        await loadData()
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در حذف')
    }
    setDeleting(false)
  }

  // ─── Render ─────────────────────────────────────────────────

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
            ارسال خودکار فاکتورها به سازمان امور مالیاتی
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

      {/* پیام‌ها */}
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

      {/* آمار */}
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

      {/* راهنمای سریع */}
      {!isInitialized && (
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-800">
              <Sparkles className="w-4 h-4" />
              راهنمای سریع راه‌اندازی (۵ دقیقه)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-blue-700 space-y-2">
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shrink-0">۱</span>
              <div>
                <strong>ثبت‌نام در سامانه مودیان:</strong> به سایت{' '}
                <a href="https://my.tax.gov.ir" target="_blank" rel="noopener noreferrer" className="underline font-bold inline-flex items-center gap-1">
                  my.tax.gov.ir
                  <ExternalLink className="w-3 h-3" />
                </a>{' '}
                بروید و با شماره موبایل ثبت‌نام کنید
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shrink-0">۲</span>
              <div>
                <strong>دریافت اطلاعات:</strong> پس از تأیید، این ۴ مورد را از پنل دریافت می‌کنید:
                <ul className="mt-1 space-y-0.5 pr-4">
                  <li>• شناسه یکتای حافظه مالیاتی (۱۱ رقم)</li>
                  <li>• شناسه کلاینت (Client ID)</li>
                  <li>• رمز کلاینت (Client Secret)</li>
                  <li>• کلید خصوصی (فایل PEM برای دانلود)</li>
                </ul>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shrink-0">۳</span>
              <div>
                <strong>وارد کردن در فرم پایین:</strong> اطلاعات را کپی و در فرم زیر paste کنید
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shrink-0">۴</span>
              <div>
                <strong>ذخیره:</strong> دکمه «ذخیره و تست اتصال» را بزنید — تمام! ✅
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* فرم اصلی */}
      <Card className="border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-purple-600" />
            {isInitialized ? 'به‌روزرسانی اطلاعات اتصال' : 'اطلاعات اتصال را وارد کنید'}
          </CardTitle>
          <CardDescription className="text-xs">
            این اطلاعات را از پنل سامانه مودیان کپی کنید. هیچ دانش فنی نیاز نیست.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {/* ─── بخش ۱: اطلاعات اصلی ─── */}
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <h4 className="text-xs font-bold text-purple-800 mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px]">۱</span>
              اطلاعات شناسایی فروشگاه
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">
                  شناسه یکتای حافظه مالیاتی <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={form.fiscalId}
                  onChange={(e) => setForm((f) => ({ ...f, fiscalId: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                  placeholder="مثال: ۱۲۳۴۵۶۷۸۹۰۱"
                  className="mt-1 font-mono text-center tracking-widest"
                  dir="ltr"
                  maxLength={11}
                />
                <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  یک عدد ۱۱ رقمی که از پنل سامانه مودیان دریافت کرده‌اید
                </p>
              </div>

              <div>
                <Label className="text-xs font-bold">کد اقتصادی (اختیاری)</Label>
                <Input
                  value={form.economicCode}
                  onChange={(e) => setForm((f) => ({ ...f, economicCode: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
                  placeholder="۱۲ رقم"
                  className="mt-1 font-mono text-center"
                  dir="ltr"
                  maxLength={12}
                />
              </div>
            </div>
          </div>

          {/* ─── بخش ۲: اطلاعات API ─── */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="text-xs font-bold text-blue-800 mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">۲</span>
              اطلاعات دسترسی API (از پنل مودیان کپی کنید)
            </h4>

            <div className="space-y-3">
              <div>
                <Label className="text-xs font-bold">
                  شناسه کلاینت (Client ID) <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Input
                    value={form.clientId}
                    onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                    placeholder="یک کد طولانی مثل: a1b2c3d4-e5f6-..."
                    className="font-mono pr-9"
                    dir="ltr"
                  />
                  <ClipboardPaste className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold">
                  رمز کلاینت (Client Secret) <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Input
                    type={showClientSecret ? 'text' : 'password'}
                    value={form.clientSecret}
                    onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
                    placeholder={isInitialized && settings?.hasClientSecret ? '••••••••••••••••' : 'رمز طولانی از پنل مودیان'}
                    className="font-mono pr-9"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClientSecret(!showClientSecret)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ─── بخش ۳: کلید خصوصی ─── */}
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
            <h4 className="text-xs font-bold text-amber-800 mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px]">۳</span>
              کلید خصوصی (از پنل مودیان دانلود کنید)
            </h4>

            <div className="mb-2 p-2 bg-amber-100 rounded text-[10px] text-amber-800 flex items-start gap-2">
              <Download className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <strong>چطور کلید خصوصی را بگیرم؟</strong>
                <ol className="mt-1 space-y-0.5 pr-3">
                  <li>۱. در پنل سامانه مودیان، بخش «کلیدهای API» بروید</li>
                  <li>۲. دکمه «دانلود کلید خصوصی» را بزنید</li>
                  <li>۳. فایل PEM را باز کنید و محتوا را کپی کنید</li>
                  <li>۴. در کادر زیر paste کنید</li>
                </ol>
              </div>
            </div>

            <div className="relative">
              <Textarea
                value={form.privateKey}
                onChange={(e) => setForm((f) => ({ ...f, privateKey: e.target.value }))}
                placeholder={
                  isInitialized && settings?.hasPrivateKey
                    ? '•••• کلید خصوصی قبلی ذخیره شده ••••\n(اگر می‌خواهید تغییر دهید، کلید جدید را paste کنید)'
                    : '-----BEGIN PRIVATE KEY-----\nمحتوای فایل PEM را اینجا paste کنید\n-----END PRIVATE KEY-----'
                }
                className="font-mono text-[11px] min-h-[120px]"
                dir="ltr"
                rows={6}
              />
              <button
                type="button"
                onClick={() => setShowPrivateKey(!showPrivateKey)}
                className="absolute left-3 top-3 text-gray-400 hover:text-gray-600"
                title={showPrivateKey ? 'مخفی کردن' : 'نمایش'}
              >
                {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            
            <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              کلید شما به‌صورت رمزنگاری‌شده ذخیره می‌شود و هیچ‌کس به آن دسترسی ندارد
            </p>
          </div>

          {/* ─── بخش ۴: تنظیمات پیشرفته ─── */}
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-gray-600 text-white flex items-center justify-center text-[10px]">۴</span>
              تنظیمات ارسال
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">محیط</Label>
                <Select
                  value={form.environment}
                  onValueChange={(v) => setForm((f) => ({ ...f, environment: v as 'sandbox' | 'production' }))}
                >
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">🧪 محیط تست (برای امتحان)</SelectItem>
                    <SelectItem value="production">🏢 محیط واقعی (برای فاکتورهای واقعی)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                <div>
                  <Label className="text-xs font-bold">ارسال خودکار فاکتورها</Label>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    فاکتورها به‌صورت خودکار ارسال شوند
                  </p>
                </div>
                <Switch
                  checked={form.autoSubmit}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, autoSubmit: v }))}
                />
              </div>
            </div>
          </div>

          {/* دکمه‌ها */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              {saving ? 'در حال ذخیره...' : '💾 ذخیره و تست اتصال'}
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

      {/* وضعیت Scheduler */}
      {isInitialized && (
        <WorkerStatusCard />
      )}
    </div>
  )
}

// ─── کامپوننت وضعیت Worker ──────────────────────────────────

function WorkerStatusCard() {
  const [status, setStatus] = useState<any>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/moidian/worker-status', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        if (data.success) setStatus(data.data)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    loadStatus()
    const interval = setInterval(loadStatus, 30_000)
    return () => clearInterval(interval)
  }, [loadStatus])

  const handleManualSync = async () => {
    setSyncing(true)
    setError(null)
    setSuccess(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/moidian/sync', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await res.json()
      if (data.success) {
        setSuccess(`همگام‌سازی انجام شد: ${formatNumberFa(data.data?.processedInvoices || 0)} فاکتور پردازش شد`)
        await loadStatus()
      } else {
        setError(data.error || 'خطا در همگام‌سازی')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط')
    }
    setSyncing(false)
  }

  if (!status) return null

  return (
    <Card className="border-purple-200 bg-purple-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-purple-800">
          <Activity className="w-4 h-4" />
          موتور پردازش خودکار
        </CardTitle>
        <CardDescription className="text-xs">
          بدون نیاز به هیچ تنظیمی، هر ۵ دقیقه فاکتورها را به‌صورت خودکار ارسال می‌کند
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-white rounded border border-purple-100">
            <span className="text-gray-500 block text-[10px]">وضعیت:</span>
            <span className={`font-bold ${status.isRunning ? 'text-emerald-600' : 'text-red-600'}`}>
              {status.isRunning ? '● فعال' : '○ غیرفعال'}
            </span>
          </div>
          <div className="p-2 bg-white rounded border border-purple-100">
            <span className="text-gray-500 block text-[10px]">آخرین اجرا:</span>
            <span className="font-bold text-gray-700">
              {status.lastRunAt ? formatDateTimeFa(status.lastRunAt) : 'در انتظار اولین اجرا'}
            </span>
          </div>
          <div className="p-2 bg-white rounded border border-purple-100">
            <span className="text-gray-500 block text-[10px]">آخرین نتیجه:</span>
            <span className="font-bold text-gray-700">
              {status.lastRunStats
                ? `${formatNumberFa(status.lastRunStats.processedInvoices)} فاکتور / ${formatNumberFa(status.lastRunStats.errors)} خطا`
                : '—'}
            </span>
          </div>
          <div className="p-2 bg-white rounded border border-purple-100">
            <span className="text-gray-500 block text-[10px]">فاصله چرخه:</span>
            <span className="font-bold text-gray-700">
              {formatNumberFa(Math.round(status.intervalMs / 60000))} دقیقه
            </span>
          </div>
        </div>

        {success && (
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {success}
          </div>
        )}
        {error && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-end pt-2">
          <Button
            onClick={handleManualSync}
            disabled={syncing}
            size="sm"
            variant="outline"
            className="gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50 h-8 text-xs"
          >
            {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {syncing ? 'در حال همگام‌سازی...' : '🔄 اجرای دستی همگام‌سازی'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}