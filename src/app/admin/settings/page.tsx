'use client'

// ============================================================================
// src/app/admin/settings/page.tsx
// صفحه تنظیمات پنل ادمین با سیستم تب
// ============================================================================

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Settings2,
  Database,
  FileText,
  Shield,
  Bell,
  Users,
  Zap,
  Clock,
} from 'lucide-react'
import { AdminBackupTab } from './backup-tab'
import { AdminBackupScheduleTab } from './backup-schedule-tab'

const TABS = [
  { id: 'general', label: 'عمومی', icon: Settings2 },
  { id: 'backup', label: 'پشتیبان‌گیری', icon: Database },
  { id: 'backup-schedule', label: 'زمان‌بندی و آرشیو', icon: Clock },
  { id: 'logs', label: 'لاگ‌های سیستم', icon: FileText },
  { id: 'security', label: 'امنیت', icon: Shield },
  { id: 'notifications', label: 'اعلان‌ها', icon: Bell },
  { id: 'roles', label: 'نقش‌ها و دسترسی‌ها', icon: Users },
  { id: 'performance', label: 'عملکرد', icon: Zap },
]

// ═══════════════════════════════════════════════════════════
// محتوای اصلی صفحه (باید داخل Suspense باشد)
// ═══════════════════════════════════════════════════════════
function SettingsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') || 'backup'
  )

  const changeTab = (tabId: string) => {
    setActiveTab(tabId)
    router.push(`/admin/settings?tab=${tabId}`, { scroll: false })
  }

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* ═══════ Header ═══════ */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Settings2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">
                <span className="bg-gradient-to-l from-[#7C7BEB] to-[#5B5AC7] bg-clip-text text-transparent">
                  تنظیمات
                </span>{' '}
                سیستم
              </h1>
              <p className="text-[11px] text-gray-500 mt-0.5">
                مدیریت و پیکربندی سیستم حسابداری رهگشا
              </p>
            </div>
          </div>
        </div>

        {/* ═══════ Tabs ═══════ */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
          <div className="flex overflow-x-auto scrollbar-thin">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id

              return (
                <button
                  key={tab.id}
                  onClick={() => changeTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 ${
                    isActive
                      ? 'text-[#7C7BEB] border-[#7C7BEB] bg-purple-50/50'
                      : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ═══════ Tab Content ═══════ */}
        <div className="min-h-[400px]">
          {activeTab === 'backup' && <AdminBackupTab />}

          {activeTab === 'backup-schedule' && <AdminBackupScheduleTab />}

          {activeTab === 'general' && (
            <PlaceholderTab
              icon={Settings2}
              text="بخش تنظیمات عمومی به زودی اضافه می‌شود"
            />
          )}

          {activeTab === 'logs' && (
            <PlaceholderTab
              icon={FileText}
              text="بخش لاگ‌ها به زودی اضافه می‌شود"
            />
          )}

          {activeTab === 'security' && (
            <PlaceholderTab
              icon={Shield}
              text="بخش امنیت به زودی اضافه می‌شود"
            />
          )}

          {activeTab === 'notifications' && (
            <PlaceholderTab
              icon={Bell}
              text="بخش اعلان‌ها به زودی اضافه می‌شود"
            />
          )}

          {activeTab === 'roles' && (
            <PlaceholderTab
              icon={Users}
              text="بخش نقش‌ها و دسترسی‌ها به زودی اضافه می‌شود"
            />
          )}

          {activeTab === 'performance' && (
            <PlaceholderTab
              icon={Zap}
              text="بخش عملکرد به زودی اضافه می‌شود"
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// کامپوننت placeholder برای تب‌های غیرفعال
// ═══════════════════════════════════════════════════════════
function PlaceholderTab({
  icon: Icon,
  text,
}: {
  icon: any
  text: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <Icon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// صفحه اصلی با Suspense برای useSearchParams
// ═══════════════════════════════════════════════════════════
export default function AdminSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-[#7C7BEB] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">در حال بارگذاری...</p>
          </div>
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  )
}