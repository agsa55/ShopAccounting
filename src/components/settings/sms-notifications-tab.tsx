'use client'

// ============================================================================
// src/components/settings/sms-notifications-tab.tsx
// ShopAccounting — تب اعلان‌های SMS
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { getTenantIdFromStore } from '@/lib/tenant-utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Bell, MessageSquare, Info, Save, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react'

export function SmsNotificationsTab() {
  const planName = useAppStore((s) => s.planName)
  const currentTenant = useAppStore((s) => s.currentTenant)

  const features = getFeaturesByPlanName(planName || currentTenant?.planName || currentTenant?.planTierName || 'simple')
  const canUseSms = features.canAccessInstallments

  const [settings, setSettings] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [isEnabled, setIsEnabled] = useState(true)
  const [daysBeforeDue, setDaysBeforeDue] = useState(1)
  const [sendOnDueDate, setSendOnDueDate] = useState(true)
  const [daysAfterDue, setDaysAfterDue] = useState(3)
  const [sendHour, setSendHour] = useState(9)
  const [sendMinute, setSendMinute] = useState(30)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('token')
        : null

      const headers: Record<string, string> = token
        ? { Authorization: `Bearer ${token}` }
        : {}

      // ★★★ اصلاح: بارگذاری تنظیمات SMS از API صحیح
      const [settingsRes, logsRes, statsRes] = await Promise.all([
        fetch('/api/sms-settings', { headers }).then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/sms-logs?limit=20', { headers }).then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/sms-stats', { headers }).then(r => r.json()).catch(() => ({ success: false })),
      ])

      if (settingsRes.success && settingsRes.data) {
        setSettings(settingsRes.data)
        setIsEnabled(settingsRes.data.isEnabled ?? true)
        setDaysBeforeDue(settingsRes.data.daysBeforeDue ?? 1)
        setSendOnDueDate(settingsRes.data.sendOnDueDate ?? true)
        setDaysAfterDue(settingsRes.data.daysAfterDue ?? 3)
        setSendHour(settingsRes.data.sendHour ?? 9)
        setSendMinute(settingsRes.data.sendMinute ?? 30)
      }

      if (logsRes.success && Array.isArray(logsRes.data)) {
        setLogs(logsRes.data)
      }

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data)
      }
    } catch (err) {
      console.error('[SmsNotificationsTab] Load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const formatTo12Hour = (hour: number, minute: number): string => {
    const period = hour < 12 ? 'صبح' : hour < 17 ? 'بعدازظهر' : 'شب'
    const h12 = hour % 12 || 12
    const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
    const toFa = (n: number) => String(n).replace(/\d/g, (d) => faDigits[parseInt(d, 10)])
    return `${toFa(h12)}:${minute.toString().padStart(2, '0').replace(/\d/g, (d) => faDigits[parseInt(d, 10)])} ${period}`
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/sms-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          isEnabled,
          daysBeforeDue,
          sendOnDueDate,
          daysAfterDue,
          sendHour,
          sendMinute,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess('تنظیمات با موفقیت ذخیره شد')
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || 'خطا در ذخیره')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setSaving(false)
    }
  }

  const handleTestSend = async () => {
    setError('')
    setSuccess('')
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/cron/installment-reminders?secret=' + process.env.NEXT_PUBLIC_CRON_SECRET, {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data = await res.json()
      if (data.success) {
        setSuccess(`کرون جاب اجرا شد: ${data.data.smsSent} پیامک واقعی، ${data.data.mockSent} پیامک تست`)
        setTimeout(() => setSuccess(''), 5000)
        loadData()
      } else {
        setError(data.error || 'خطا در اجرای کرون جاب')
      }
    } catch (err: any) {
      setError('برای تست کرون جاب، آن را به‌صورت دستی اجرا کنید')
    }
  }

  if (!canUseSms) {
    return (
      <Card className="border-amber-200">
        <CardContent className="p-6 text-center">
          <MessageSquare className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-2">اعلان‌های SMS فقط در پلن حرفه‌ای</h3>
          <p className="text-xs text-gray-500 mb-4">
            برای استفاده از یادآوری خودکار اقساط از طریق SMS، لطفاً به پلن حرفه‌ای ارتقا دهید
          </p>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 space-y-1.5">
              <p className="font-bold">📋 سیستم چطور کار می‌کند؟</p>
              <p>هر روز در ساعت تنظیم‌شده، سیستم به‌طور خودکار اقساط سررسید‌شده را بررسی می‌کند و به مشتریانی که فاکتور قسطی دارند، پیامک یادآوری می‌فرستد.</p>
              <div className="bg-white rounded p-2 border border-blue-100 space-y-1">
                <p className="font-medium text-blue-700">👥 چه کسانی پیامک دریافت می‌کنند؟</p>
                <p>• مشتریانی که <strong>فاکتور قسطی (Installment)</strong> دارند</p>
                <p>• قسط آن‌ها <strong>پرداخت‌نشده</strong> است (pending یا partial)</p>
                <p>• تاریخ سررسید قسط در یکی از این روزها است:</p>
                <p className="pr-3">✓ <strong>۱ روز قبل</strong> از سررسید (یادآوری قبلی)</p>
                <p className="pr-3">✓ <strong>روز سررسید</strong> (یادآوری روز سررسید)</p>
                <p className="pr-3">✓ <strong>۳ روز بعد</strong> از سررسید (یادآوری بعدی)</p>
              </div>
              <p className="text-[10px] text-blue-600">⚠️ فاکتورهای نسیه (Credit) تحت پوشش این سیستم نیستند — فقط اقساط.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-600" />
            اعلان‌های SMS
          </CardTitle>
          <CardDescription className="text-xs">
            یادآوری خودکار اقساط سررسید‌شده برای مشتریان
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <div>
                <p className="text-sm font-medium">فعال‌سازی اعلان SMS</p>
                <p className="text-[10px] text-gray-500">پیامک یادآوری برای اقساط سررسید‌شده ارسال می‌شود</p>
              </div>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          {isEnabled && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">یادآوری قبل از سررسید (روز)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    value={daysBeforeDue}
                    onChange={(e) => setDaysBeforeDue(parseInt(e.target.value) || 0)}
                    className="h-9"
                  />
                  <p className="text-[10px] text-gray-400">چند روز قبل از سررسید پیامک بفرست</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">یادآوری بعد از سررسید (روز)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    value={daysAfterDue}
                    onChange={(e) => setDaysAfterDue(parseInt(e.target.value) || 0)}
                    className="h-9"
                  />
                  <p className="text-[10px] text-gray-400">چند روز بعد از سررسید هم یادآوری کن</p>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">ساعت ارسال پیامک (فرمت ۲۴ ساعته)</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label className="text-[10px] text-gray-500 mb-1 block">ساعت (۰-۲۳)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={sendHour}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 0
                          setSendHour(Math.max(0, Math.min(23, v)))
                        }}
                        className="h-9"
                      />
                    </div>
                    <span className="text-lg font-bold mt-5">:</span>
                    <div className="flex-1">
                      <Label className="text-[10px] text-gray-500 mb-1 block">دقیقه (۰-۵۹)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        value={sendMinute}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 0
                          setSendMinute(Math.max(0, Math.min(59, v)))
                        }}
                        className="h-9"
                      />
                    </div>
                    <div className="mt-5 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-xs font-bold text-emerald-700 min-w-[80px] text-center">
                      {formatTo12Hour(sendHour, sendMinute)}
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    زمان ارسال روزانه پیامک‌ها — فرمت ۲۴ ساعته (۰ تا ۲۳ ساعت، ۰ تا ۵۹ دقیقه)
                  </p>
                  <div className="text-[10px] text-blue-600 bg-blue-50 p-2 rounded border border-blue-100 flex items-start gap-1">
                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">راهنمای ساعت:</p>
                      <p>• ۰ تا ۱۱ = صبح (AM) • ۱۲ تا ۱۶ = بعدازظهر (PM) • ۱۷ تا ۲۳ = شب (PM)</p>
                      <p>• مثال: ۹:۳۰ صبح → ساعت=۹، دقیقه=۳۰</p>
                      <p>• مثال: ۱۴:۰۰ بعدازظهر → ساعت=۱۴، دقیقه=۰</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-xs font-medium">ارسال در روز سررسید</p>
                    <p className="text-[10px] text-gray-500">در روز سررسید هم پیامک بفرست</p>
                  </div>
                  <Switch checked={sendOnDueDate} onCheckedChange={setSendOnDueDate} />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                  size="sm"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  ذخیره تنظیمات
                </Button>
              </div>
            </>
          )}

          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {error}
            </div>
          )}
          {success && (
            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {success}
            </div>
          )}
        </CardContent>
      </Card>

      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">آمار پیامک‌ها</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-gray-50 rounded p-2 text-center">
                <p className="text-[10px] text-gray-500">کل</p>
                <p className="text-base font-bold text-gray-900">{stats.total?.toLocaleString('fa-IR') || '۰'}</p>
              </div>
              <div className="bg-emerald-50 rounded p-2 text-center">
                <p className="text-[10px] text-emerald-600">ارسال شده</p>
                <p className="text-base font-bold text-emerald-700">{stats.sent?.toLocaleString('fa-IR') || '۰'}</p>
              </div>
              <div className="bg-red-50 rounded p-2 text-center">
                <p className="text-[10px] text-red-600">ناموفق</p>
                <p className="text-base font-bold text-red-700">{stats.failed?.toLocaleString('fa-IR') || '۰'}</p>
              </div>
              <div className="bg-amber-50 rounded p-2 text-center">
                <p className="text-[10px] text-amber-600">تست</p>
                <p className="text-base font-bold text-amber-700">{stats.mock?.toLocaleString('fa-IR') || '۰'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            تاریخچه پیامک‌ها (۲۰ اخیر)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400">
              هنوز پیامکی ارسال نشده
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {logs.map((log: any) => (
                <div
                  key={log.id}
                  className={`p-2 rounded border text-xs ${
                    log.status === 'sent'
                      ? 'bg-emerald-50 border-emerald-200'
                      : log.status === 'failed'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono" dir="ltr">{log.recipient}</span>
                    <div className="flex items-center gap-1.5">
                      {log.mockMode && (
                        <Badge className="bg-amber-100 text-amber-700 text-[9px] px-1">تست</Badge>
                      )}
                      <Badge className={
                        log.status === 'sent'
                          ? 'bg-emerald-100 text-emerald-700 text-[9px] px-1'
                          : log.status === 'failed'
                            ? 'bg-red-100 text-red-700 text-[9px] px-1'
                            : 'bg-gray-100 text-gray-700 text-[9px] px-1'
                      }>
                        {log.status === 'sent' ? 'ارسال شد' : log.status === 'failed' ? 'ناموفق' : 'در انتظار'}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-gray-600 text-[10px]">{log.message}</p>
                  <p className="text-gray-400 text-[9px] mt-1">
                    {new Date(log.sentAt).toLocaleString('fa-IR')}
                    {log.errorMessage && ` — ${log.errorMessage}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}