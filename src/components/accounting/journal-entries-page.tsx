'use client'

// ============================================================================
// src/components/accounting/journal-entries-page.tsx — Accounting Page
// ShopAccounting v29 — با قابلیت آفلاین کامل + ریسپانسیو
// ============================================================================
// ★★★ v29 تغییرات:
//   ✓ تمام تب‌ها به فایل‌های جدا منتقل شدند
//   ✓ TabsList با flex-wrap برای ریسپانسیو
//   ✓ Dialog‌های fullscreen در موبایل
//   ✓ استفاده از IndexedDB به جای localStorage
//   ✓ Optimistic UI برای آفلاین
// ============================================================================

import { useState, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { getFeaturesByPlanName, resolvePlan, type PlanFeatureSet } from '@/lib/plan-features'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BookOpen, WifiOff, FileText, Lock, Crown, Scale,
  Repeat, RefreshCw, CloudOff, CreditCard, Package,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { RecurringJournalsManager } from '@/components/accounting/recurring-journals-manager'
import { RecoverJournalsTab } from '@/components/accounting/recover-journals-tab'

// ★★★ Import تب‌های جداگانه
import { JournalEntriesTab } from './journal-entries-tab'
import { ChecksTab } from './checks-tab'
import { AccountsTab } from './accounts-tab'
import { FixedAssetsTab } from './fixed-assets-tab'
import { TrialBalanceTabV8 } from './trial-balance-tab'
import { LedgerTab } from './ledger-tab'

// ═══════════════════════════════════════════════════════════════
// UpgradeCard — کارت ارتقای inline برای تب‌های قفل‌شده
// ═══════════════════════════════════════════════════════════════

function UpgradeCard({
  feature,
  description,
  onUpgrade,
}: {
  feature: string
  description: string
  onUpgrade: () => void
}) {
  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
      <CardContent className="p-6 sm:p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-amber-600" />
        </div>
        <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-2">{feature}</h3>
        <p className="text-xs sm:text-sm text-gray-600 mb-4 max-w-md mx-auto">{description}</p>
        <Button onClick={onUpgrade} className="bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm">
          <Crown className="w-4 h-4 ml-1" />
          ارتقا به پلن حرفه‌ای
        </Button>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// Main Component — JournalEntriesPage
// ═══════════════════════════════════════════════════════════════

export default function JournalEntriesPage() {
  const { toast } = useToast()
  const isOnline = useAppStore((s) => s.isOnline)
  const planName = useAppStore((s) => s.planName)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const user = useAppStore((s) => s.user)

  const features: PlanFeatureSet = useMemo(() => getFeaturesByPlanName(planName), [planName])
  const plan = useMemo(() => resolvePlan(planName), [planName])
  const isBasicTier = plan.tier === 'basic'
  const isManager = ['Admin', 'Manager', 'Owner', 'admin', 'manager', 'owner'].includes(user?.role || '')

  const [activeTab, setActiveTab] = useState('journals')

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-gray-50 p-2.5 sm:p-3.5 md:p-6" dir="rtl">
      {/* هدر */}
      <div className="mb-3 sm:mb-4">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
          حسابداری
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">مدیریت اسناد حسابداری، ترازنامه، دفتر کل و چک‌ها</p>
      </div>

      {/* بنر آفلاین */}
      {!isOnline && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3">
          <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-800">
            <strong>حالت آفلاین فعال است.</strong> برخی عملیات ممکن است محدود باشند.
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" dir="rtl">
        {/* ═══════════════════════════════════════════════════════
            TabsList — ریسپانسیو با flex-wrap
        ═══════════════════════════════════════════════════════ */}
        <div className="mb-3 sm:mb-4" dir="rtl">
          <TabsList
            dir="rtl"
            className="w-full flex flex-wrap gap-1 sm:gap-1.5 bg-gray-50/80 border border-gray-200 rounded-xl p-1 sm:p-1.5 h-auto"
          >
            <TabsTrigger value="journals" className="flex-shrink-0 min-w-fit gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm hover:bg-gray-100">
              <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">اسناد حسابداری</span>
              <span className="sm:hidden">اسناد</span>
            </TabsTrigger>

            {features.canViewAccounts && (
              <TabsTrigger value="accounts" className="flex-shrink-0 min-w-fit gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm hover:bg-gray-100">
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">چارت حساب‌ها</span>
                <span className="sm:hidden">حساب‌ها</span>
              </TabsTrigger>
            )}

            {features.canTrialBalance && (
              <TabsTrigger value="trial-balance" className="flex-shrink-0 min-w-fit gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm hover:bg-gray-100">
                <Scale className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">تراز آزمایشی</span>
                <span className="sm:hidden">تراز</span>
              </TabsTrigger>
            )}

            {features.canGeneralLedger && (
              <TabsTrigger value="ledger" className="flex-shrink-0 min-w-fit gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm hover:bg-gray-100">
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">دفتر کل</span>
                <span className="sm:hidden">دفتر</span>
              </TabsTrigger>
            )}

            {features.canAccessCredit && (
              <TabsTrigger value="checks" className="flex-shrink-0 min-w-fit gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm hover:bg-gray-100">
                <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">چک‌ها</span>
                <span className="sm:hidden">چک‌ها</span>
              </TabsTrigger>
            )}

            {!isBasicTier && (
              <TabsTrigger value="recurring" className="flex-shrink-0 min-w-fit gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm hover:bg-gray-100">
                <Repeat className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">تکرارشونده</span>
                <span className="sm:hidden">تکراری</span>
              </TabsTrigger>
            )}

            <TabsTrigger value="fixed-assets" className="flex-shrink-0 min-w-fit gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm hover:bg-gray-100">
              <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">دارایی‌های ثابت</span>
              <span className="sm:hidden">دارایی‌ها</span>
            </TabsTrigger>

            {isManager && (
              <TabsTrigger value="recover" className="flex-shrink-0 min-w-fit gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm hover:bg-gray-100">
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">بازیابی اسناد</span>
                <span className="sm:hidden">بازیابی</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* ═══════════════════════════════════════════════════════
            Tab Content: اسناد حسابداری (از فایل جدا)
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="journals">
          <JournalEntriesTab />
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════
            Tab Content: چارت حساب‌ها (از فایل جدا)
        ═══════════════════════════════════════════════════════ */}
        {features.canViewAccounts ? (
          <TabsContent value="accounts">
            <AccountsTab />
          </TabsContent>
        ) : (
          <TabsContent value="accounts">
            <UpgradeCard
              feature="چارت حساب‌ها"
              description="برای مشاهده و مدیریت حساب‌های حسابداری، به پلن حرفه‌ای ارتقا دهید."
              onUpgrade={() => setCurrentView('settings-subscription' as any)}
            />
          </TabsContent>
        )}

        {/* ═══════════════════════════════════════════════════════
            Tab Content: تراز آزمایشی (از فایل جدا)
        ═══════════════════════════════════════════════════════ */}
        {features.canTrialBalance ? (
          <TabsContent value="trial-balance">
            <TrialBalanceTabV8 />
          </TabsContent>
        ) : (
          <TabsContent value="trial-balance">
            <UpgradeCard
              feature="تراز آزمایشی"
              description="برای مشاهده تراز آزمایشی، به پلن حرفه‌ای ارتقا دهید."
              onUpgrade={() => setCurrentView('settings-subscription' as any)}
            />
          </TabsContent>
        )}

        {/* ═══════════════════════════════════════════════════════
            Tab Content: دفتر کل (از فایل جدا)
        ═══════════════════════════════════════════════════════ */}
        {features.canGeneralLedger ? (
          <TabsContent value="ledger">
            <LedgerTab />
          </TabsContent>
        ) : (
          <TabsContent value="ledger">
            <UpgradeCard
              feature="دفتر کل"
              description="برای مشاهده دفتر کل، به پلن حرفه‌ای ارتقا دهید."
              onUpgrade={() => setCurrentView('settings-subscription' as any)}
            />
          </TabsContent>
        )}

        {/* ═══════════════════════════════════════════════════════
            Tab Content: چک‌ها (از فایل جدا)
        ═══════════════════════════════════════════════════════ */}
        {features.canAccessCredit ? (
          <TabsContent value="checks">
            <ChecksTab />
          </TabsContent>
        ) : (
          <TabsContent value="checks">
            <UpgradeCard
              feature="مدیریت چک‌ها"
              description="برای مدیریت چک‌های دریافتنی و پرداختنی، به پلن حرفه‌ای ارتقا دهید."
              onUpgrade={() => setCurrentView('settings-subscription' as any)}
            />
          </TabsContent>
        )}

        {/* ═══════════════════════════════════════════════════════
            Tab Content: اسناد تکرارشونده
        ═══════════════════════════════════════════════════════ */}
        {!isBasicTier && (
          <TabsContent value="recurring">
            {!isOnline && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
                <div className="text-xs text-amber-800">
                  در حالت آفلاین فقط امکان <strong>مشاهده</strong> اسناد تکرارشونده وجود دارد.
                </div>
              </div>
            )}
            <div className="relative">
              <RecurringJournalsManager />
              {!isOnline && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center rounded-lg">
                  <div className="text-center">
                    <CloudOff className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">برای استفاده از این قابلیت، ابتدا به اینترنت متصل شوید</p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {/* ═══════════════════════════════════════════════════════
            Tab Content: دارایی‌های ثابت (از فایل جدا)
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="fixed-assets">
          <FixedAssetsTab />
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════
            Tab Content: بازیابی اسناد (فقط مدیران)
        ═══════════════════════════════════════════════════════ */}
        {isManager && (
          <TabsContent value="recover">
            {!isOnline && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
                <div className="text-xs text-amber-800">
                  بازیابی اسناد نیاز به اتصال به سرور دارد. لطفاً برای استفاده از این قابلیت، به اینترنت متصل شوید.
                </div>
              </div>
            )}
            {isOnline ? (
              <RecoverJournalsTab embedded />
            ) : (
              <Card className="border-dashed border-gray-300">
                <CardContent className="p-8 text-center">
                  <CloudOff className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-sm font-medium text-gray-600 mb-2">بازیابی اسناد در حالت آفلاین غیرفعال است</h3>
                  <p className="text-xs text-gray-400">این قابلیت نیاز به ارتباط با سرور دارد. لطفاً پس از اتصال به اینترنت، مجدداً تلاش کنید.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}