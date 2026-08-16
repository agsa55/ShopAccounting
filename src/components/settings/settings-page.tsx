'use client'

// ============================================================================
// src/components/settings/settings-page.tsx (v10.2 ★★★ — Cleaned Up)
// ShopAccounting — صفحه تنظیمات با ساختار ماژولار (بدون کارت ویزارد)
// ============================================================================
// ★★★ v10.2 تغییرات:
//   ✓ حذف کارت ویزارد راه‌اندازی از بالای صفحه (مدیریت در تب راه‌اندازی انجام می‌شود)
//   ✓ حذف کامپوننت‌ها و ایمپورت‌های بدون استفاده (SetupStatusBadges, SetupWizard, Card, Button, etc.)
//   ✓ سبک‌تر و تمیزتر شدن کد اصلی و تمرکز کامل روی تب‌ها
//
// ★★★ v10.3 تغییرات (v9.1 plan-features):
//   ✓ تغییر شرط تب "اعلان SMS" از canAccessInstallments به canAccessSmsNotifications
//   ✓ تب "درگاه پرداخت" فقط برای پلن‌هایی که canOnlinePayment = true دارند نمایش داده می‌شود
//   ✓ تب "کارتخوان" فقط برای پلن‌هایی که canMultiCashRegister = true دارند نمایش داده می‌شود
// ============================================================================

import { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { useDemoStatus } from '@/lib/use-demo-status'

// ★ UI Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

// ★ Icons
import {
  Store, CreditCard, Monitor, FileText, Database, Crown, Users, Wallet,
  Lock, Sparkles, Bell, Building2, CalendarDays, Archive,
} from 'lucide-react'

// ★ تب‌های جداگانه (هر کدام در فایل مستقل)
import { StoreSettingsTab } from './store-tab'
import { InvoiceTemplateTab } from './invoice-tab'
import { BackupTab } from './backup-tab'
import { SubscriptionTab } from './subscription-tab'
import { EmployeesTab } from './employees-tab'
import { EnterpriseTab } from './enterprise-tab'
import { FiscalYearTab } from './fiscal-year-tab'
import { SmsNotificationsTab } from './sms-notifications-tab'
import { InitialBalanceTab } from './initial-balance-tab'
import { MoidianTab } from './moidian-tab'
import { PosDevicesTab } from './pos-devices-tab'
import { PaymentGatewayTab } from './payment-gateway-tab'
import { BasicYearEndPage } from './basic-year-end-page'  // ★ v12.0: بستن حساب پلن پایه
// ============================================================================
// DemoDisabledSection — پیام غیرفعال در حالت دمو
// ============================================================================
function DemoDisabledSection({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
        <Lock className="w-8 h-8 text-amber-600" />
      </div>
      <h3 className="text-base font-bold text-gray-900 mb-2">این بخش در حالت تست دمو غیرفعال است</h3>
      <p className="text-sm text-gray-600 text-center max-w-md leading-relaxed mb-4">{message}</p>
      <Badge className="bg-amber-100 text-amber-700 text-xs">
        <Sparkles className="w-3 h-3 ml-1" />
        تست دمو ۳ روزه
      </Badge>
    </div>
  )
}

// ============================================================================
// SettingsPage — کامپوننت اصلی صفحه تنظیمات
// ============================================================================
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('store')

  // ★★★ Plan-based tab visibility
  const planName = useAppStore((s) => s.planName)
  const currentTenant = useAppStore((s) => s.currentTenant)
  const { isDemo } = useDemoStatus()
  const [refreshKey, setRefreshKey] = useState(0)

  // ★★★ لود planName واقعی از API
  const [realPlanName, setRealPlanName] = useState<string>('')

  useEffect(() => {
    fetch('/api/tenants/trial-check')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          if (data.data.planName) setRealPlanName(data.data.planName)
          else if (data.data.tierName) setRealPlanName(data.data.tierName)
        }
      })
      .catch(() => {})
  }, [])

  // ★ تشخیص tier فعلی
  const currentTier: 'simple' | 'professional' | 'enterprise' = (() => {
    const name = (realPlanName || planName || currentTenant?.planName || currentTenant?.planTierName || 'simple').toLowerCase().trim()
    if (name === 'professional' || name === 'standard' || name.includes('حرفه')) return 'professional'
    if (name === 'enterprise' || name === 'organization' || name.includes('سازمانی') || name.includes('پیشرفته')) return 'enterprise'
    return 'simple'
  })()

  const features = getFeaturesByPlanName(currentTier)
  const isEnterprise = currentTier === 'enterprise'

  // ★ اگر activeTab فعلی دیگر در دسترس نیست، به تب پیش‌فرض برگردان
  useEffect(() => {
    const visibleTabs = ['store', 'invoice', 'backup', 'subscription', 'employees', 'initial-balance']
    // ★★★ v10.3: تغییر شرط تب SMS از canAccessInstallments به canAccessSmsNotifications
    //   - پلن پایه: canAccessSmsNotifications = false → تب SMS مخفی
    //   - پلن پیشرفته: canAccessSmsNotifications = false → تب SMS مخفی
    //   - پلن حرفه‌ای: canAccessSmsNotifications = true → تب SMS نمایش داده می‌شود
    if (features.canAccessSmsNotifications) visibleTabs.push('sms')
    // ★★★ تب درگاه پرداخت فقط برای پلن‌های دارای canOnlinePayment
    //   - پلن پایه: canOnlinePayment = false → مخفی
    //   - پلن پیشرفته: canOnlinePayment = false → مخفی (تغییر v9.1)
    //   - پلن حرفه‌ای: canOnlinePayment = true → نمایش
    if (features.canOnlinePayment) visibleTabs.push('gateway')
    // ★★★ تب کارتخوان برای پلن‌های دارای canMultiCashRegister
    //   - پلن پایه: canMultiCashRegister = false → مخفی
    //   - پلن پیشرفته: canMultiCashRegister = true → نمایش (تغییر v9.1)
    //   - پلن حرفه‌ای: canMultiCashRegister = true → نمایش
    if (features.canMultiCashRegister) visibleTabs.push('pos')
    if (features.canMoidianIntegration) visibleTabs.push('moidian')
    if (isEnterprise) visibleTabs.push('enterprise')
    if (features.canFiscalYearManagement) visibleTabs.push('fiscal-year')
    // ★ v12.0: تب بستن حساب فقط برای پلن پایه (simple)
    if (currentTier === 'simple') visibleTabs.push('basic-year-end')

    const disabledInDemoTabs = ['backup', 'subscription', 'initial-balance']
    if (isDemo && disabledInDemoTabs.includes(activeTab)) {
      setActiveTab('store')
      return
    }

    if (!visibleTabs.includes(activeTab)) {
      setActiveTab('store')
    }
  }, [activeTab, features, isEnterprise, isDemo])

  // ★ کلاس مشترک برای همه تب‌ها
  const tabClass = "flex-shrink-0 min-w-fit gap-1.5 px-2.5 sm:px-3 py-2 text-[11px] sm:text-sm font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm hover:bg-gray-100"
  const tabClassEmerald = `${tabClass} data-[state=active]:text-emerald-700`
  const tabClassPurple = `${tabClass} data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 hover:bg-purple-100`

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-gray-50 p-2.5 sm:p-3.5 md:p-6" dir="rtl">
      {/* هدر */}
      <div className="mb-2 sm:mb-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">تنظیمات</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">مدیریت تنظیمات فروشگاه و حساب کاربری</p>
      </div>

      {/* ★★★ تب‌ها با ساختار دو ردیفی (flex-wrap) */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" dir="rtl">
        <div className="mb-2 sm:mb-3" dir="rtl">
          <TabsList
            dir="rtl"
            className="w-full flex flex-wrap gap-1.5 bg-gray-50/80 border border-gray-200 rounded-xl p-1.5 h-auto"
          >
            {/* ═══ ردیف ۱: تنظیمات پایه ═══ */}
            <TabsTrigger value="store" className={tabClassEmerald}>
              <Store className="w-4 h-4" />
              <span className="hidden sm:inline">فروشگاه</span>
            </TabsTrigger>

            {/* ★★★ v10.3: تب درگاه پرداخت — فقط برای پلن حرفه‌ای (canOnlinePayment) */}
            {features.canOnlinePayment && (
              <TabsTrigger value="gateway" className={tabClassEmerald}>
                <CreditCard className="w-4 h-4" />
                <span className="hidden sm:inline">درگاه پرداخت</span>
              </TabsTrigger>
            )}

            {/* ★★★ v10.3: تب کارتخوان — برای پلن پیشرفته و حرفه‌ای (canMultiCashRegister) */}
            {features.canMultiCashRegister && (
              <TabsTrigger value="pos" className={tabClassEmerald}>
                <Monitor className="w-4 h-4" />
                <span className="hidden sm:inline">کارتخوان</span>
              </TabsTrigger>
            )}

            <TabsTrigger value="invoice" className={tabClassEmerald}>
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">قالب فاکتور</span>
            </TabsTrigger>

            <TabsTrigger
              value="backup"
              disabled={isDemo}
              title={isDemo ? 'این بخش در حالت تست دمو غیرفعال است' : ''}
              className={`${tabClassEmerald} ${isDemo ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Database className="w-4 h-4" />
              <span className="hidden sm:inline">پشتیبان‌گیری</span>
              {isDemo && <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md font-bold">دمو</span>}
            </TabsTrigger>

           
            {/* ═══ ردیف ۲: تنظیمات پیشرفته ═══ */}
            <TabsTrigger value="employees" className={tabClassEmerald}>
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">کاربران</span>
            </TabsTrigger>

            {/* ★★★ v10.3: تغییر شرط تب SMS از canAccessInstallments به canAccessSmsNotifications */}
            {/* قبلاً: features.canAccessInstallments (پلن پیشرفته و حرفه‌ای دسترسی داشتند) */}
            {/* حالا: features.canAccessSmsNotifications (فقط پلن حرفه‌ای) */}
            {features.canAccessSmsNotifications && (
              <TabsTrigger value="sms" className={tabClassEmerald}>
                <Bell className="w-4 h-4" />
                <span className="hidden sm:inline">اعلان SMS</span>
              </TabsTrigger>
            )}

            {features.canMoidianIntegration && (
              <TabsTrigger value="moidian" className={tabClassPurple}>
                <Building2 className="w-4 h-4" />
                <span className="hidden sm:inline">مودیان</span>
              </TabsTrigger>
            )}

            {isEnterprise && (
              <TabsTrigger value="enterprise" className={tabClassPurple}>
                <Crown className="w-4 h-4" />
                <span className="hidden sm:inline">سازمانی</span>
              </TabsTrigger>
            )}

                       {features.canFiscalYearManagement && (
              <TabsTrigger value="fiscal-year" className={tabClassEmerald}>
                <CalendarDays className="w-4 h-4" />
                <span className="hidden sm:inline">سال مالی</span>
              </TabsTrigger>
            )}

            {/* ★ v12.0: تب بستن حساب — فقط برای پلن پایه */}
            {currentTier === 'simple' && (
              <TabsTrigger value="basic-year-end" className={tabClassPurple}>
                <Archive className="w-4 h-4" />
                <span className="hidden sm:inline">بستن حساب</span>
                <span className="text-[8px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md font-bold mr-1">
                  پایه
                </span>
              </TabsTrigger>
            )}

            <TabsTrigger
              value="initial-balance"
              disabled={isDemo}
              title={isDemo ? 'این بخش در حالت تست دمو غیرفعال است' : ''}
              className={`${tabClassEmerald} ${isDemo ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline">راه‌اندازی</span>
              {isDemo && <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md font-bold">دمو</span>}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ═══ محتوای تب‌ها ═══ */}
        <TabsContent value="store"><StoreSettingsTab /></TabsContent>

        {/* ★★★ v10.3: محتوای تب درگاه پرداخت — فقط برای پلن حرفه‌ای */}
        {features.canOnlinePayment && (
          <TabsContent value="gateway"><PaymentGatewayTab /></TabsContent>
        )}

        {/* ★★★ v10.3: محتوای تب کارتخوان — برای پلن پیشرفته و حرفه‌ای */}
        {features.canMultiCashRegister && (
          <TabsContent value="pos"><PosDevicesTab /></TabsContent>
        )}

        <TabsContent value="invoice"><InvoiceTemplateTab /></TabsContent>

        <TabsContent value="backup">
          {isDemo ? <DemoDisabledSection message="بخش پشتیبان‌گیری در حالت تست دمو غیرفعال است. برای استفاده از این بخش، لطفاً یکی از پلن‌ها را خریداری کنید." /> : <BackupTab />}
        </TabsContent>

        <TabsContent value="subscription">
          {isDemo ? <DemoDisabledSection message="بخش مدیریت اشتراک در حالت تست دمو غیرفعال است. برای خرید پلن، لطفاً پس از پایان مدت دمو اقدام کنید." /> : <SubscriptionTab />}
        </TabsContent>

        <TabsContent value="employees">
          <EmployeesTab />
        </TabsContent>

        {/* ★★★ v10.3: تغییر شرط تب SMS از canAccessInstallments به canAccessSmsNotifications */}
        {/* قبلاً: features.canAccessInstallments → پلن پیشرفته و حرفه‌ای دسترسی داشتند */}
        {/* حالا: features.canAccessSmsNotifications → فقط پلن حرفه‌ای */}
        {features.canAccessSmsNotifications && (
          <TabsContent value="sms"><SmsNotificationsTab /></TabsContent>
        )}

        {features.canMoidianIntegration && (
          <TabsContent value="moidian"><MoidianTab /></TabsContent>
        )}

        {isEnterprise && (
          <TabsContent value="enterprise"><EnterpriseTab /></TabsContent>
        )}

            {features.canFiscalYearManagement && (
          <TabsContent value="fiscal-year"><FiscalYearTab /></TabsContent>
        )}

        {/* ★ v12.0: محتوای تب بستن حساب — فقط برای پلن پایه */}
        {currentTier === 'simple' && (
          <TabsContent value="basic-year-end">
            <BasicYearEndPage />
          </TabsContent>
        )}

        <TabsContent value="initial-balance" className="w-full mt-2 outline-none">
          {isDemo ? (
            <DemoDisabledSection message="بخش راه‌اندازی اولیه (سند افتتاحیه) در حالت تست دمو غیرفعال است. در پلن‌های پولی می‌توانید موجودی اولیه فروشگاه خود را تنظیم کنید." />
          ) : (
            <InitialBalanceTab key={refreshKey} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}