'use client'

// ============================================================================
// src/components/settings/enterprise-tab.tsx
// ShopAccounting — تب قابلیت‌های سازمانی
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Crown, Building2, Database, CalendarDays, Archive,
} from 'lucide-react'

export function EnterpriseTab() {
  const planName = useAppStore((s) => s.planName)
  const features = useMemo(() => getFeaturesByPlanName(planName), [planName])
  const [moidianStatus, setMoidianStatus] = useState<any>(null)

  const loadMoidian = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch('/api/moidian', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) setMoidianStatus(data.data)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (features.canMoidianIntegration) loadMoidian()
  }, [features.canMoidianIntegration, loadMoidian])

  if (!features.canMultiBranch) {
    return (
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="p-6 text-center">
          <Crown className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-2">قابلیت‌های سازمانی</h3>
          <p className="text-xs text-gray-500 mb-4">
            مدیریت شعب، بستن سال مالی، اتصال سامانه مودیان و گزارش تلفیقی فقط در پلن سازمانی در دسترس است
          </p>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => useAppStore.getState().setCurrentView('settings-subscription' as any)}>
            ارتقا به پلن سازمانی
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* مدیریت شعب */}
      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-purple-600" />
            مدیریت شعب
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-1 space-y-2">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            ★ مدیریت کامل شعب (ایجاد، ویرایش، حذف، فعال‌سازی) به منوی اختصاصی «شعب» در نوار کناری منتقل شد. در آن منو می‌توانید:
          </p>
          <ul className="text-[10px] text-gray-600 leading-relaxed pr-3 list-disc space-y-0.5">
            <li>شعبه جدید با کد، آدرس، تلفن و مدیر ایجاد کنید</li>
            <li>شعبه‌های موجود را ویرایش یا حذف کنید</li>
            <li>انبارهای هر شعبه را مشاهده کنید</li>
            <li>فعال/غیرفعال کردن شعبه‌ها</li>
          </ul>
          <Button
            size="sm"
            variant="outline"
            className="border-purple-300 text-purple-600 hover:bg-purple-50 text-[11px] h-7 w-full"
            onClick={() => useAppStore.getState().setCurrentView('branches' as any)}
          >
            <Building2 className="w-3 h-3 ml-1" />
            رفتن به منوی شعب
          </Button>
        </CardContent>
      </Card>

      {/* مدیریت سال مالی */}
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
            مدیریت سال مالی
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-1 space-y-2">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            ★★★ v3.26: مدیریت کامل سال مالی (تعریف، فعال‌سازی، بستن و تاریخچه) به تب اختصاصی منتقل شد. در آن تب می‌توانید:
          </p>
          <ul className="text-[10px] text-gray-600 leading-relaxed pr-3 list-disc space-y-0.5">
            <li>سال مالی جدید با تاریخ شروع/پایان شمسی تعریف کنید</li>
            <li>سال فعال را مشاهده و پیشرفت آن را دنبال کنید</li>
            <li>سال‌های قبلی را فعال یا ویرایش کنید</li>
            <li>سال فعلی را ببندید (با ایجاد خودکار سال جدید)</li>
            <li>تاریخچه کامل سال‌های بسته‌شده را ببینید</li>
          </ul>
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-300 text-emerald-600 hover:bg-emerald-50 text-[11px] h-7 w-full"
            onClick={() => {
              const triggers = document.querySelectorAll('[role="tab"]')
              triggers.forEach((t) => {
                if (t.getAttribute('value') === 'fiscal-year' || t.textContent?.includes('سال مالی')) {
                  ;(t as HTMLElement).click()
                }
              })
            }}
          >
            <CalendarDays className="w-3 h-3 ml-1" />
            رفتن به تب سال مالی
          </Button>
        </CardContent>
      </Card>

      {/* اتصال سامانه مودیان */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-600" />
            اتصال سامانه مودیان
            <Badge className={`text-[9px] ${moidianStatus?.config?.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {moidianStatus?.config?.connected ? 'متصل' : 'غیرفعال'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-1 space-y-2">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            ★ تنظیمات کامل اتصال به سامانه مودیان (کلید API، کلید خصوصی، ارسال فاکتورها) در تب اختصاصی «سامانه مودیان» در دسترس است.
          </p>
          {moidianStatus?.stats && (
            <div className="bg-white rounded p-2 border border-gray-200 text-[10px] space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">فاکتورهای قابل ارسال:</span><span className="font-mono text-blue-600">{moidianStatus.stats.pendingInvoices?.toLocaleString('fa-IR') || '۰'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">فاکتورهای ارسال‌شده:</span><span className="font-mono text-emerald-600">{moidianStatus.stats.sentInvoices?.toLocaleString('fa-IR') || '۰'}</span></div>
              {moidianStatus.config?.fiscalId && (
                <div className="flex justify-between pt-1 border-t border-gray-100"><span className="text-gray-500">شناسه مالیاتی:</span><span className="font-mono text-gray-700" dir="ltr">{moidianStatus.config.fiscalId}</span></div>
              )}
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="border-blue-300 text-blue-600 hover:bg-blue-50 text-[11px] h-7 w-full"
            onClick={() => {
              const triggers = document.querySelectorAll('[role="tab"]')
              triggers.forEach((t) => {
                if (t.getAttribute('value') === 'moidian' || t.textContent?.includes('مودیان')) {
                  ;(t as HTMLElement).click()
                }
              })
            }}
          >
            <Database className="w-3 h-3 ml-1" />
            رفتن به تب سامانه مودیان
          </Button>
        </CardContent>
      </Card>

      {/* گزارش تلفیقی شعب */}
      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5 text-purple-600" />
            گزارش تلفیقی شعب
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-1 space-y-2">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            ★ گزارش تلفیقی شعب (فروش، هزینه، سود به تفکیک شعبه) در منوی «گزارش‌ها» در دسترس است. در آن منو می‌توانید گزارش‌های پیشرفته را مشاهده کنید.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="border-purple-300 text-purple-600 hover:bg-purple-50 text-[11px] h-7 w-full"
            onClick={() => useAppStore.getState().setCurrentView('reports' as any)}
          >
            <Crown className="w-3 h-3 ml-1" />
            مشاهده گزارش‌ها
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}