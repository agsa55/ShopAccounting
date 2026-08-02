'use client'

// ============================================================================
// src/components/app-shell.tsx — v9.7.0 ★★★
// ★ v9.6.3: اصلاح دقیق RTL تاریخ هدر + کاهش فاصله بین بخش‌های منوی کناری
// ★ v9.7.0: اتصال هوشمند — جایگزینی navigator.onLine با پینگ واقعی API
//           + نشانگر وضعیت اتصال در هدر + preload هوشمند
// ============================================================================

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useStore, type AppView } from '@/lib/store'
import { resolvePlan, getFeaturesByPlanName } from '@/lib/plan-features'
import { SidebarPlanCard } from '@/components/shared/sidebar-plan-card'

// ★ PWA
import { usePWAInstall } from '@/components/pwa-register'

// ★ v9.7.0: ماژول تشخیص اتصال هوشمند
import {
  startConnectivityMonitor,
  onConnectivityChange,
  isOnline as isApiOnline,
  getConnectivityState,
  type ConnectivityState,
} from '@/lib/connectivity'

import {
  LayoutDashboard, ShoppingCart, Package, Grid3x3, Users, FileText,
  CreditCard, BookOpen, BarChart3, Settings, Bell, LogOut, Store, Clock,
  Warehouse as WarehouseIcon, Building2, Truck, ArrowRightLeft, ClipboardList,
  Ticket as TicketIcon, MessageCircle, Sparkles, RefreshCw, Wifi, WifiOff,
  Download, AlertTriangle, ChevronLeft, Calendar,
} from 'lucide-react'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarRail, SidebarInset, SidebarTrigger,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { OfflineBanner } from '@/components/ui/offline-indicator'
import { OfflineModal } from '@/components/ui/offline-modal'

import { DemoBanner } from '@/components/demo/demo-banner'
import { useDemoStatus } from '@/lib/use-demo-status'

import DashboardPage from '@/components/dashboard/dashboard-page'
import PosPage from '@/components/pos/pos-page'
import ProductsPage from '@/components/products/products-page'
import CategoriesPage from '@/components/products/categories-page'
import CustomersPage from '@/components/customers/customers-page'
import InvoicesPage from '@/components/invoices/invoices-page'
import InvoiceDetail from '@/components/invoices/invoice-detail'
import InstallmentsPage from '@/components/installments/installments-page'
import JournalEntriesPage from '@/components/accounting/journal-entries-page'
import JournalEntryDetail from '@/components/accounting/journal-entry-detail'
import SettingsPage from '@/components/settings/settings-page'
import ReportsPage from '@/components/reports/reports-page'
import { SuppliersPage } from '@/components/suppliers/suppliers-page'
import { WarehousesPage } from '@/components/warehouses/warehouses-page'
import { PurchaseInvoicesPage } from '@/components/purchases/purchase-invoices-page'
import { StockTransferPage } from '@/components/inventory/stock-transfer-page'
import { StockCountPage } from '@/components/inventory/stock-count-page'
import { BranchesPage } from '@/components/branches/branches-page'
import { ContactsPage } from '@/components/contacts/contacts-page'
import { TicketsPage } from '@/components/tickets/tickets-page'
import { TicketDetail } from '@/components/tickets/ticket-detail'
import { useSidebar } from '@/components/ui/sidebar'

/* ══════════════════════════════════════════════════════════════════
   ★ InvoicesHub
   ══════════════════════════════════════════════════════════════════ */

type InvoiceTab = 'sales' | 'purchase'

function InvoicesHub() {
  const [activeTab, setActiveTab] = useState<InvoiceTab>('sales')

  return (
    <div className="space-y-0" dir="rtl">
      <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
        <button
          onClick={() => setActiveTab('sales')}
          className={`
            relative flex items-center gap-2 px-5 py-3 text-sm font-medium
            transition-colors duration-150 select-none
            ${activeTab === 'sales'
              ? 'text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/60'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }
          `}
        >
          <FileText className="w-4 h-4" />
          فاکتورهای فروش
        </button>

        <button
          onClick={() => setActiveTab('purchase')}
          className={`
            relative flex items-center gap-2 px-5 py-3 text-sm font-medium
            transition-colors duration-150 select-none
            ${activeTab === 'purchase'
              ? 'text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/60'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }
          `}
        >
          <Truck className="w-4 h-4" />
          فاکتورهای خرید
        </button>
      </div>

      <div className="pt-4">
        {activeTab === 'sales'
          ? <InvoicesPage />
          : <PurchaseInvoicesPage />
        }
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   ★ WarehousesHub
   ══════════════════════════════════════════════════════════════════ */

type WarehouseTab = 'warehouses' | 'stock-transfer' | 'stock-count'

function WarehousesHub() {
  const planName = useStore((s) => s.planName)
  const planFeatures = getFeaturesByPlanName(planName)
  const [activeTab, setActiveTab] = useState<WarehouseTab>('warehouses')

  useEffect(() => {
    if (activeTab === 'stock-transfer' && !planFeatures.canStockTransfer) {
      setActiveTab('warehouses')
    }
    if (activeTab === 'stock-count' && !planFeatures.canStockCount) {
      setActiveTab('warehouses')
    }
  }, [activeTab, planFeatures])

  return (
    <div className="space-y-0" dir="rtl">
      <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
        <button
          onClick={() => setActiveTab('warehouses')}
          className={`
            relative flex items-center gap-2 px-5 py-3 text-sm font-medium
            transition-colors duration-150 select-none
            ${activeTab === 'warehouses'
              ? 'text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/60'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }
          `}
        >
          <WarehouseIcon className="w-4 h-4" />
          انبارها
        </button>

        {planFeatures.canStockTransfer && (
          <button
            onClick={() => setActiveTab('stock-transfer')}
            className={`
              relative flex items-center gap-2 px-5 py-3 text-sm font-medium
              transition-colors duration-150 select-none
              ${activeTab === 'stock-transfer'
                ? 'text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/60'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }
            `}
          >
            <ArrowRightLeft className="w-4 h-4" />
            انتقال بین انبارها
          </button>
        )}

        {planFeatures.canStockCount && (
          <button
            onClick={() => setActiveTab('stock-count')}
            className={`
              relative flex items-center gap-2 px-5 py-3 text-sm font-medium
              transition-colors duration-150 select-none
              ${activeTab === 'stock-count'
                ? 'text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/60'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }
            `}
          >
            <ClipboardList className="w-4 h-4" />
            انبار گردانی
          </button>
        )}
      </div>

      <div className="pt-4">
        {activeTab === 'warehouses' && <WarehousesPage />}
        {activeTab === 'stock-transfer' && planFeatures.canStockTransfer && <StockTransferPage />}
        {activeTab === 'stock-count' && planFeatures.canStockCount && <StockCountPage />}
      </div>
    </div>
  )
}

/* ─── Navigation ─────────────────────────────────────────────── */

interface NavItem {
  label: string
  icon: React.ComponentType<{ className?: string }>
  view: AppView
  permKey: string
  requiredFeature?: 'canAccessInstallments' | 'canViewAccounts' | 'canViewJournals' | 'canMultiBranch' | 'canAccessCredit' | 'canStockTransfer' | 'canStockCount'
  disabledInDemo?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'اصلی',
    items: [
      { label: 'داشبورد', icon: LayoutDashboard, view: 'dashboard', permKey: 'dashboard' },
      { label: 'صندوق فروش', icon: ShoppingCart, view: 'pos', permKey: 'pos' },
    ],
  },
  {
    label: 'کالا و انبار',
    items: [
      { label: 'محصولات', icon: Package, view: 'products', permKey: 'products' },
      { label: 'دسته‌بندی‌ها', icon: Grid3x3, view: 'categories', permKey: 'categories' },
      { label: 'انبارها', icon: WarehouseIcon, view: 'warehouses-hub' as any, permKey: 'accounting' },
    ],
  },
  {
    label: 'فروش و خرید',
    items: [
      { label: 'فاکتورها', icon: FileText, view: 'invoices-hub' as any, permKey: 'invoices' },
      { label: 'طرف حساب', icon: Users, view: 'contacts' as any, permKey: 'accounting' },
      { label: 'اقساط', icon: CreditCard, view: 'installments', permKey: 'installments', requiredFeature: 'canAccessInstallments' },
    ],
  },
  {
    label: 'مالی و گزارش',
    items: [
      { label: 'حسابداری', icon: BookOpen, view: 'accounting', permKey: 'accounting', requiredFeature: 'canViewAccounts' },
      { label: 'گزارش‌ها', icon: BarChart3, view: 'reports', permKey: 'reports' },
    ],
  },
  {
    label: 'سیستم',
    items: [
      { label: 'شعب', icon: Building2, view: 'branches' as any, permKey: 'accounting', requiredFeature: 'canMultiBranch' },
      { label: 'تنظیمات', icon: Settings, view: 'settings', permKey: 'settings' },
    ],
  },
  {
    label: 'پشتیبانی',
    items: [
      { label: 'تیکت پشتیبانی', icon: TicketIcon, view: 'tickets', permKey: 'dashboard' },
    ],
  },
]

const navItems: NavItem[] = navGroups.flatMap(g => g.items)
const MANAGER_ONLY_KEYS = ['settings']

const viewLabels: Record<string, string> = {
  dashboard: 'داشبورد',
  pos: 'صندوق فروش',
  products: 'محصولات',
  categories: 'دسته‌بندی‌ها',
  customers: 'مشتریان',
  invoices: 'فاکتورها',
  'invoices-hub': 'فاکتورها',
  'invoice-detail': 'جزئیات فاکتور فروش',
  'purchase-invoices': 'فاکتورها',
  installments: 'اقساط',
  accounting: 'حسابداری',
  'journal-entry-detail': 'جزئیات سند',
  settings: 'تنظیمات',
  'settings-store': 'تنظیمات فروشگاه',
  'settings-gateway': 'درگاه پرداخت',
  'settings-pos': 'تنظیمات صندوق',
  'settings-invoice': 'تنظیمات فاکتور',
  'settings-backup': 'پشتیبان‌گیری',
  'settings-subscription': 'اشتراک',
  'settings-employees': 'کارکنان',
  reports: 'گزارش‌ها',
  'upgrade-plan': 'ارتقای پلن',
  suppliers: 'تامین‌کنندگان',
  'warehouses-hub': 'انبارها',
  warehouses: 'انبارها',
  'stock-transfer': 'انتقال بین انبارها',
  'stock-count': 'انبار گردانی',
  branches: 'شعب',
  contacts: 'طرفین حساب',
  tickets: 'تیکت پشتیبانی',
  'ticket-detail': 'جزئیات تیکت',
}

/* ─── Helpers ────────────────────────────────────────────────── */

const FULL_ACCESS_ROLES = new Set(['Admin', 'Manager', 'Owner', 'admin', 'manager', 'owner'])

function isFullAccessRole(role: string | null | undefined): boolean {
  return !!role && FULL_ACCESS_ROLES.has(role)
}

const ROLE_LABELS: Record<string, string> = {
  Admin: 'مدیر سیستم', Manager: 'مدیر', Owner: 'مالک', Cashier: 'صندوق‌دار',
  admin: 'مدیر سیستم', manager: 'مدیر', owner: 'مالک', cashier: 'صندوق‌دار',
}

function getRoleLabel(role: string | null | undefined): string {
  if (!role) return 'کاربر'
  return ROLE_LABELS[role] || role
}

function checkAccess(
  view: AppView,
  role: string | null | undefined,
  permissions: string[] | null | undefined,
  planFeatures?: any
): boolean {
  if (!role) return false
  if (isFullAccessRole(role)) {
    if (planFeatures) {
      const navItem = navItems.find((item) => item.view === view)
      if (navItem?.requiredFeature && !planFeatures[navItem.requiredFeature]) return false
    }
    return true
  }
  if (permissions && permissions.includes('all')) {
    if (planFeatures) {
      const navItem = navItems.find((item) => item.view === view)
      if (navItem?.requiredFeature && !planFeatures[navItem.requiredFeature]) return false
    }
    return true
  }
  if (MANAGER_ONLY_KEYS.includes(view)) return false
  const navItem = navItems.find((item) => item.view === view)
  if (!navItem) return true
  if (!permissions || !permissions.includes(navItem.permKey)) return false
  if (navItem.requiredFeature && planFeatures && !planFeatures[navItem.requiredFeature]) return false
  return true
}

function renderCurrentView(view: AppView) {
  const viewStr = view as string
  switch (viewStr) {
    case 'dashboard':             return <DashboardPage />
    case 'pos':                   return <PosPage />
    case 'products':              return <ProductsPage />
    case 'categories':            return <CategoriesPage />
    case 'customers':             return <CustomersPage />
    case 'invoices-hub':          return <InvoicesHub />
    case 'invoices':              return <InvoicesHub />
    case 'purchase-invoices':     return <InvoicesHub />
    case 'invoice-detail':        return <InvoiceDetail />
    case 'installments':          return <InstallmentsPage />
    case 'accounting':            return <JournalEntriesPage />
    case 'journal-entry-detail':  return <JournalEntryDetail />
    case 'settings':
    case 'settings-store':
    case 'settings-gateway':
    case 'settings-pos':
    case 'settings-invoice':
    case 'settings-backup':
    case 'settings-subscription':
    case 'settings-employees':    return <SettingsPage />
    case 'reports':               return <ReportsPage />
    case 'upgrade-plan':          return <SettingsPage />
    case 'suppliers':             return <SuppliersPage />
    case 'warehouses-hub':        return <WarehousesHub />
    case 'warehouses':            return <WarehousesHub />
    case 'stock-transfer':        return <WarehousesHub />
    case 'stock-count':           return <WarehousesHub />
    case 'branches':              return <BranchesPage />
    case 'contacts':              return <ContactsPage />
    case 'tickets':               return <TicketsPage />
    case 'ticket-detail':         return <TicketDetail />
    default:                      return <DashboardPage />
  }
}

/* ═══════════════════════════════════════════════════════════════
   ★★★ v9.6.0: SubscriptionBanner — بنر هشدار هوشمند اشتراک
   ═══════════════════════════════════════════════════════════════ */

interface SubscriptionStatus {
  status: 'active' | 'warning' | 'grace_period' | 'read_only' | 'expired'
  daysRemaining: number
  canCreate: boolean
  canRead: boolean
  message: string
  isLifetime?: boolean
}

function SubscriptionBanner() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStatus() {
      try {
        const token = localStorage.getItem('token')
        if (!token) {
          setLoading(false)
          return
        }

        const res = await fetch('/api/subscription/status', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()

        if (data.success && data.data) {
          setStatus(data.data)
        }
      } catch (err) {
        console.warn('[SubscriptionBanner] Fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading || !status || status.status === 'active') return null

  const config = {
    warning: {
      bg: 'bg-yellow-50',
      text: 'text-yellow-900',
      border: 'border-yellow-200',
      icon: '⚠️',
      buttonBg: 'bg-yellow-600 hover:bg-yellow-700',
    },
    grace_period: {
      bg: 'bg-orange-50',
      text: 'text-orange-900',
      border: 'border-orange-200',
      icon: '⏰',
      buttonBg: 'bg-orange-600 hover:bg-orange-700',
    },
    read_only: {
      bg: 'bg-red-50',
      text: 'text-red-900',
      border: 'border-red-300',
      icon: '🔒',
      buttonBg: 'bg-red-600 hover:bg-red-700',
    },
    expired: {
      bg: 'bg-red-100',
      text: 'text-red-900',
      border: 'border-red-400',
      icon: '🚫',
      buttonBg: 'bg-red-600 hover:bg-red-700',
    },
  }[status.status]

  if (!config) return null

  return (
    <div className={`${config.bg} ${config.border} border-b px-3 sm:px-4 py-2.5 sm:py-3`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className={`flex items-start sm:items-center gap-2 ${config.text} text-xs sm:text-sm`}>
          <span className="text-base sm:text-lg shrink-0">{config.icon}</span>
          <div className="flex-1">
            <p className="font-medium leading-relaxed">{status.message}</p>
            {status.status === 'read_only' && (
              <p className="text-[10px] sm:text-xs mt-1 opacity-80">
                شما همچنان می‌توانید گزارشات را مشاهده کرده و خروجی بگیرید.
              </p>
            )}
          </div>
        </div>

        <a
          href="/subscription/renew"
          onClick={(e) => {
            e.preventDefault()
            useStore.getState().setCurrentView('settings-subscription' as AppView)
          }}
          className={`${config.buttonBg} text-white text-[10px] sm:text-xs font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-md transition-colors shrink-0 flex items-center gap-1 shadow-sm`}
        >
          <RefreshCw className="w-3 h-3" />
          تمدید اشتراک
        </a>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   AppSidebar
   ═══════════════════════════════════════════════════════════════ */

function AppSidebar() {
  const { isMobile, setOpenMobile } = useSidebar()
  const currentView = useStore((s) => s.currentView)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const storeName = useStore((s) => s.storeName)
  const user = useStore((s) => s.user)
  const notifications = useStore((s) => s.notifications) ?? []
  const planName = useStore((s) => s.planName)

  const planFeatures = getFeaturesByPlanName(planName || 'simple')

  const { isDemo, status: demoStatus } = useDemoStatus()
  const isDemoActive = isDemo && !demoStatus?.isExpired

  const [daysRemaining, setDaysRemaining] = useState(0)
  const [isExpired, setIsExpired] = useState(false)
  const [realPlanName, setRealPlanName] = useState<string | null>(null)

  useEffect(() => {
    async function checkSubscription() {
      try {
        const token = localStorage.getItem('token')
        if (!token) return

        const res = await fetch('/api/tenants/trial-check', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()

        if (data.success) {
          setDaysRemaining(data.data.daysRemaining)
          setIsExpired(data.data.isExpired)

          if (data.data.planName) {
            setRealPlanName(data.data.planName)
            useStore.getState().setPlanName(data.data.planName)
          } else if (data.data.tierName) {
            setRealPlanName(data.data.tierName)
            useStore.getState().setPlanName(data.data.tierName)
          }

          const { cachePlan } = await import('@/lib/offline-db')
          await cachePlan({
            planName: data.data.planName || data.data.tierName,
            daysRemaining: data.data.daysRemaining,
            isExpired: data.data.isExpired,
            cached_at: Date.now(),
          })
        } else {
          const { getCachedPlan } = await import('@/lib/offline-db')
          const cachedPlan = await getCachedPlan()
          if (cachedPlan?.planName) {
            setRealPlanName(cachedPlan.planName)
            useStore.getState().setPlanName(cachedPlan.planName)
            setDaysRemaining(cachedPlan.daysRemaining || 0)
            setIsExpired(cachedPlan.isExpired || false)
          }
        }
      } catch (err) {
        try {
          const { getCachedPlan } = await import('@/lib/offline-db')
          const cachedPlan = await getCachedPlan()
          if (cachedPlan?.planName) {
            setRealPlanName(cachedPlan.planName)
            useStore.getState().setPlanName(cachedPlan.planName)
            setDaysRemaining(cachedPlan.daysRemaining || 0)
            setIsExpired(cachedPlan.isExpired || false)
          }
        } catch (cacheErr) {
          console.error('[AppSidebar] Error reading cached plan:', cacheErr)
        }
      }
    }

    checkSubscription()
    const interval = setInterval(checkSubscription, 60000)
    return () => clearInterval(interval)
  }, [])

  const effectivePlanName = (realPlanName || planName || 'simple') as string
  const effectiveFeatures = getFeaturesByPlanName(effectivePlanName)
  const unreadCount = notifications.filter(n => !n.isRead).length

  const visibleGroups = useMemo(() => {
    if (!user) return []
    const filterItem = (item: NavItem): boolean => {
      if (item.requiredFeature && !effectiveFeatures[item.requiredFeature]) return false
      if (!isFullAccessRole(user.role) && !(user.permissions && user.permissions.includes('all'))) {
        const perms = user.permissions || []
        if (MANAGER_ONLY_KEYS.includes(item.view)) return false
        if (!perms.includes('all') && !perms.includes(item.permKey)) return false
      }
      return true
    }
    return navGroups
      .map(group => ({ ...group, items: group.items.filter(filterItem) }))
      .filter(group => group.items.length > 0)
  }, [user, effectiveFeatures])

  const getBaseView = (view: AppView): AppView => {
    if (view.startsWith('settings')) return 'settings'
    if (view === 'invoice-detail') return 'invoices-hub' as any
    if (view === 'invoices') return 'invoices-hub' as any
    if (view === 'purchase-invoices') return 'invoices-hub' as any
    if (view === 'journal-entry-detail') return 'accounting'
    if (view === 'ticket-detail') return 'tickets'
    if (view === 'upgrade-plan') return 'upgrade-plan'
    if (view === 'warehouses' || view === 'stock-transfer' || view === 'stock-count') {
      return 'warehouses-hub' as any
    }
    return view
  }

  const baseView = getBaseView(currentView)
  const userDisplayName = user?.username || 'کاربر'
  const userInitials = useMemo(() => {
    const name = user?.username || ''
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return parts[0][0] + parts[1][0]
    return parts[0]?.[0] || 'م'
  }, [user])

  const formatRemainingTime = (days: number) => {
    if (days === -1) return 'مادام‌العمر';
    if (days <= 0) return 'منقضی شده';
    const months = Math.floor(days / 30);
    const remainingDays = days % 30;
    
    const mStr = months > 0 ? `${months.toLocaleString('fa-IR')} ماه` : '';
    const dStr = remainingDays > 0 ? `${remainingDays.toLocaleString('fa-IR')} روز` : '';
    
    if (mStr && dStr) return `${mStr} و ${dStr}`;
    return mStr || dStr;
  };

  const getPlanLabel = (name: string) => {
    if (name === 'trial') return 'دوره آزمایشی';
    if (name === 'simple') return 'پلن پایه';
    if (name === 'professional') return 'پلن پیشرفته';
    if (name === 'enterprise') return 'پلن حرفه‌ای';
    return name;
  };

  return (
    <Sidebar
      side="right"
      collapsible="icon"
      className="border-l border-slate-200 bg-slate-50/95 shadow-sm"
    >
      <SidebarHeader className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="gap-2 sm:gap-3">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
                <Store className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0 overflow-hidden">
                <span className="text-xs sm:text-sm font-semibold truncate text-slate-800">
                  {storeName || 'فروشگاه'}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="mt-1.5 px-1 group-data-[collapsible=icon]:hidden">
          {isDemoActive ? (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-amber-700">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-medium">تست دمو</span>
                </div>
                <span className="text-[10px] text-amber-600">
                  {`${demoStatus?.daysRemaining || 0} روز و ${demoStatus?.hoursRemaining || 0} ساعت`}
                </span>
              </div>
              <a
                href="/subscription/renew"
                className="mt-1.5 w-full text-[10px] py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md transition-colors flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                خرید پلن
              </a>
            </div>
          ) : (
            <div 
              onClick={() => setCurrentView('settings-subscription' as AppView)}
              className="cursor-pointer group p-2.5 bg-white border border-slate-200 rounded-xl hover:shadow-md hover:border-indigo-200 transition-all duration-200"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-800">
                    {getPlanLabel(effectivePlanName)}
                  </span>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${
                  isExpired ? 'bg-red-100 text-red-700' : 
                  daysRemaining <= 7 && daysRemaining > 0 ? 'bg-amber-100 text-amber-700' : 
                  'bg-emerald-100 text-emerald-700'
                }`}>
                  {isExpired ? 'منقضی' : daysRemaining === -1 ? 'دائمی' : 'فعال'}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-600 font-medium">
                  {daysRemaining === -1 ? 'بدون محدودیت زمانی' : 
                   isExpired ? 'لطفاً اشتراک خود را تمدید کنید' :
                   `مانده تا پایان: ${formatRemainingTime(daysRemaining)}`}
                </span>
                <ChevronLeft className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 group-hover:-translate-x-0.5 transition-all" />
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarSeparator className="bg-slate-200" />

      <SidebarContent>
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label} className="py-0 my-0">
            <SidebarGroupLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-3 py-1 mb-0.5 mt-2 first:mt-0 group-data-[collapsible=icon]:hidden">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent className="py-0">
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const isActive = baseView === (item.view as string)
                  const isItemDisabled = isDemo && item.disabledInDemo
                  return (
                    <SidebarMenuItem key={item.view}>
                      <SidebarMenuButton
                        isActive={isActive && !isItemDisabled}
                        onClick={() => {
                          if (isItemDisabled) return
                          setCurrentView(item.view)
                          if (isMobile) {
                            setTimeout(() => setOpenMobile(false), 150)
                          }
                        }}
                        tooltip={item.label}
                        className={`gap-2 sm:gap-2.5 h-8 sm:h-9 ${
                          isItemDisabled
                            ? 'opacity-50 cursor-not-allowed hover:bg-transparent'
                            : isActive
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 font-semibold'
                              : 'hover:bg-slate-100 text-slate-600'
                        }`}
                      >
                        <item.icon className={`size-4 ${isActive && !isItemDisabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span className="text-xs sm:text-sm">{item.label}</span>

                        {isItemDisabled && (
                          <Badge className="ms-auto bg-amber-100 text-amber-700 text-[8px] px-1 py-0 h-4 min-w-4 group-data-[collapsible=icon]:hidden">
                            دمو
                          </Badge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarSeparator className="bg-slate-200" />
        <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center">
          <Avatar className="size-7 sm:size-8 border border-emerald-200 bg-white">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-[10px] sm:text-xs font-semibold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0 overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="text-[11px] sm:text-xs font-medium truncate text-slate-800">{userDisplayName}</span>
            <span className="text-[9px] sm:text-[10px] text-slate-500">{getRoleLabel(user?.role)}</span>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ★ PWAInstallButton — دکمه نصب اپ
   ═══════════════════════════════════════════════════════════════ */

function PWAInstallButton() {
  const { canInstall, isInstalled, install } = usePWAInstall()
  const [installing, setInstalling] = useState(false)
  const [justInstalled, setJustInstalled] = useState(false)

  if (isInstalled || !canInstall) return null

  const handleInstall = async () => {
    setInstalling(true)
    try {
      const accepted = await install()
      if (accepted) {
        setJustInstalled(true)
        setTimeout(() => setJustInstalled(false), 3000)
      }
    } finally {
      setInstalling(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleInstall}
      disabled={installing}
      className={`
        gap-1.5 text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3
        border-emerald-300 text-emerald-700
        hover:bg-emerald-50 hover:border-emerald-400
        transition-all duration-200 shrink-0
        ${installing ? 'opacity-70 cursor-not-allowed' : ''}
        ${justInstalled ? 'border-green-400 text-green-700 bg-green-50' : ''}
      `}
      title="نصب اپلیکیشن روی دستگاه"
    >
      {justInstalled ? (
        <>
          <span className="text-green-600">✓</span>
          <span className="hidden sm:inline">نصب شد</span>
        </>
      ) : (
        <>
          <Download className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${installing ? 'animate-bounce' : ''}`} />
          <span className="hidden sm:inline">نصب اپ</span>
        </>
      )}
    </Button>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ★ SyncIndicator — نشانگر وضعیت همگام‌سازی
   ═══════════════════════════════════════════════════════════════ */
function SyncIndicator() {
  const pendingCount = useStore((s) => s.pendingSyncCount)
  const isOnline = useStore((s) => s.isOnline)

  if (pendingCount === 0 || !isOnline) return null

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5 text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3 border-amber-300 text-amber-700 hover:bg-amber-50 transition-all"
      onClick={async () => {
        const { syncEngine } = await import('@/lib/sync-engine')
        const result = await syncEngine.sync()
        
        if (result.succeeded > 0) {
          useStore.getState().addNotification({
            title: '✅ همگام‌سازی موفق',
            message: `${result.succeeded} تغییر با سرور همگام‌سازی شد`,
            type: 'success',
          })
        }
        if (result.failed > 0) {
          useStore.getState().addNotification({
            title: '⚠️ خطا در همگام‌سازی',
            message: `${result.failed} تغییر همگام‌سازی نشد`,
            type: 'warning',
          })
        }
      }}
    >
      <RefreshCw className="h-3 w-3 animate-spin" />
      <span className="hidden sm:inline">همگام‌سازی</span>
      <span className="bg-amber-600 text-white text-[9px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
        {pendingCount}
      </span>
    </Button>
  )
}

/* ═══════════════════════════════════════════════════════════════
   ★ v9.7.0: ConnectionBadge — نشانگر وضعیت اتصال هوشمند
   ═══════════════════════════════════════════════════════════════
   ★ بر اساس پینگ واقعی /api/health تصمیم می‌گیرد.
   ★ در محیط لوکال بدون اینترنت → "آنلاین" (چون API در دسترس است)
   ★ وقتی سرور واقعاً قطع باشد → "آفلاین"
   ═══════════════════════════════════════════════════════════════ */

function ConnectionBadge() {
  const [state, setState] = useState<ConnectivityState>(getConnectivityState())

  useEffect(() => {
    startConnectivityMonitor()
    const unsub = onConnectivityChange(setState)
    return unsub
  }, [])

  const config = {
    online: {
      label: 'آنلاین',
      dot: 'bg-emerald-500',
      bg: 'bg-emerald-50/80 border-emerald-200',
      text: 'text-emerald-700',
      icon: Wifi,
    },
    degraded: {
      label: 'کند',
      dot: 'bg-amber-500',
      bg: 'bg-amber-50/80 border-amber-200',
      text: 'text-amber-700',
      icon: AlertTriangle,
    },
    offline: {
      label: 'آفلاین',
      dot: 'bg-red-500',
      bg: 'bg-red-50/80 border-red-200',
      text: 'text-red-700',
      icon: WifiOff,
    },
  }[state.status]

  const IconComponent = config.icon

  return (
    <div
      dir="rtl"
      className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg border ${config.bg} transition-colors duration-300`}
      title={
        `سرور: ${state.isApiReachable ? 'متصل' : 'قطع'}` +
        ` | اینترنت: ${state.isInternetAvailable ? 'متصل' : 'قطع'}` +
        ` | زمان پاسخ: ${state.responseTimeMs}ms`
      }
    >
      <IconComponent className={`w-3 h-3 ${config.text} shrink-0`} />
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} ${state.status !== 'online' ? 'animate-pulse' : ''}`} />
      <span className={`text-[10px] font-medium ${config.text} whitespace-nowrap`}>
        {config.label}
      </span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   AppHeader
   ═══════════════════════════════════════════════════════════════ */

function AppHeader() {
  const currentView = useStore((s) => s.currentView)
  const storeName = useStore((s) => s.storeName)
  const user = useStore((s) => s.user)
  const notifications = useStore((s) => s.notifications) ?? []
  const markNotificationRead = useStore((s) => s.markNotificationRead)
  const markAllNotificationsRead = useStore((s) => s.markAllNotificationsRead)

  const unreadCount = notifications.filter(n => !n.isRead).length
  const canAccessSettings = isFullAccessRole(user?.role)

  const handleLogout = async () => {
    try {
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations()
          for (const registration of registrations) {
            await registration.unregister()
          }
        } catch (err) {
          console.warn('[AppHeader] Error unregistering SW:', err)
        }
      }

      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys()
          await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)))
        } catch (err) {
          console.warn('[AppHeader] Error clearing caches:', err)
        }
      }

      const keysToRemove = [
        'token', 'refreshToken', 'user', 'storeName', 'tenant',
        'planName', 'tenant-slug', 'auth-token', 'shop-accounting-store',
      ]
      keysToRemove.forEach((key) => {
        try { localStorage.removeItem(key) } catch (e) {}
      })

      try { sessionStorage.clear() } catch (e) {}

      const cookiesToClear = ['tenant-slug', 'tenant-view', 'auth-token', 'token', 'refreshToken']
      const hostname = window.location.hostname
      cookiesToClear.forEach((name) => {
        try {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax;`
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${hostname}; SameSite=Lax;`
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${hostname}; SameSite=Lax;`
        } catch (e) {}
      })

      useStore.setState({
        user: null,
        isAuthenticated: false,
        token: null,
        refreshToken: null,
        tenantId: null,
        storeName: null,
        currentTenant: null,
        planName: null,
        selectedPlanId: null,
        selectedBillingCycle: null,
        selectedJournalEntryId: null,
        cart: [],
        selectedCustomerId: null,
        selectedCustomerName: null,
        notifications: [],
        pendingSyncCount: 0,
        currentView: 'landing',
      })

      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (err) {}

      setTimeout(() => {
        window.location.href = `/?logout=1&t=${Date.now()}&r=${Math.random().toString(36).substring(7)}`
      }, 300)

    } catch (err) {
      console.error('[AppHeader] Logout error:', err)
      window.location.href = `/?logout=1&t=${Date.now()}`
    }
  }

  return (
    <header className="flex h-11 sm:h-12 md:h-14 items-center gap-1.5 sm:gap-2 md:gap-3 border-b border-slate-200 bg-slate-50/90 backdrop-blur-md px-2 sm:px-3 md:px-4 shadow-sm sticky top-0 z-10">
      <SidebarTrigger className="-mr-1 shrink-0 rotate-180 text-slate-600 hover:bg-slate-200" />
      <Separator orientation="vertical" className="h-4 sm:h-5 md:h-6 hidden xs:block bg-slate-300" />

      <Breadcrumb className="flex-1 min-w-0 overflow-hidden">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="hidden md:inline-block">
            <BreadcrumbPage className="text-[10px] md:text-xs text-slate-500 truncate">
              {storeName || 'فروشگاه'}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:inline-block text-slate-400" />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-[11px] sm:text-xs md:text-sm font-semibold text-slate-800 truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">
              {viewLabels[currentView] || currentView}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 shrink-0">

       {/* ★ نمایش تاریخ شمسی با ترتیب صحیح و اعداد فارسی */}
<div className="hidden sm:flex items-center gap-1.5 bg-white/80 px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm" dir="rtl">
  <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
  <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">
    {(() => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('fa-IR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const parts = formatter.formatToParts(now);
      const weekday = parts.find(p => p.type === 'weekday')?.value || '';
      const day = parts.find(p => p.type === 'day')?.value || '';
      const month = parts.find(p => p.type === 'month')?.value || '';
      const year = parts.find(p => p.type === 'year')?.value || '';
      return `${weekday} ${day} ${month} ${year}`;
    })()}
  </span>
</div>

        {/* ★ v9.7.0: نشانگر وضعیت اتصال هوشمند */}
        <ConnectionBadge />

        <PWAInstallButton />
        <SyncIndicator />
        <OfflineModal />

        {/* ── Notifications ── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative size-8 md:size-9 shrink-0 hover:bg-slate-200 text-slate-600">
              <Bell className="size-3.5 sm:size-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -left-0.5 flex size-3.5 sm:size-4 items-center justify-center rounded-full bg-red-500 text-[7px] sm:text-[9px] font-bold text-white leading-none">
                  {unreadCount > 9 ? '+۹' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 sm:w-72 md:w-80 bg-white border border-slate-200 shadow-lg rounded-lg">
            <DropdownMenuLabel className="flex items-center justify-between text-slate-700">
              <span className="text-xs sm:text-sm font-semibold">اعلان‌ها</span>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllNotificationsRead()}
                  className="text-[10px] text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  خواندن همه
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="py-4 sm:py-6 text-center text-xs sm:text-sm text-slate-500">
                اعلانی وجود ندارد
              </div>
            ) : (
              notifications.slice(0, 5).map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  onClick={() => markNotificationRead(notification.id)}
                  className="flex flex-col items-start gap-1 p-2 sm:p-2.5 md:p-3 cursor-pointer hover:bg-slate-50"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2 w-full">
                    {!notification.isRead && (
                      <div className="size-1.5 sm:size-2 rounded-full bg-emerald-500 shrink-0" />
                    )}
                    <span className="text-[11px] sm:text-xs md:text-sm font-medium flex-1 truncate text-slate-800">
                      {notification.title}
                    </span>
                  </div>
                  <span className="text-[9px] sm:text-[10px] md:text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {notification.message}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── User Menu ── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-1 sm:gap-1.5 md:gap-2 px-1.5 sm:px-2 h-8 md:h-9 shrink-0 hover:bg-slate-200">
              <Avatar className="size-6 md:size-7 border border-emerald-200 bg-white">
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-[8px] sm:text-[9px] md:text-[10px] font-semibold">
                  {user?.username?.charAt(0) || 'م'}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs md:text-sm font-medium hidden md:inline max-w-[80px] lg:max-w-none truncate text-slate-700">
                {user?.username || 'کاربر'}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48 sm:w-52 md:w-56 bg-white border border-slate-200 shadow-lg rounded-lg"
          >
            <DropdownMenuLabel>
              <div className="flex flex-col gap-1">
                <span className="text-xs sm:text-sm font-semibold text-slate-800">{user?.username || 'کاربر'}</span>
                <span className="text-[10px] sm:text-xs font-normal text-slate-500">
                  {getRoleLabel(user?.role)} 
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {canAccessSettings && (
              <DropdownMenuItem
                onClick={() => useStore.getState().setCurrentView('settings')}
                className="text-slate-700 hover:bg-slate-50"
              >
                <Settings className="size-4 ms-2" />
                تنظیمات
              </DropdownMenuItem>
            )}
            {canAccessSettings && (
              <DropdownMenuItem
                onClick={() => useStore.getState().setCurrentView('settings-subscription' as AppView)}
                className="text-slate-700 hover:bg-slate-50"
              >
                <CreditCard className="size-4 ms-2" />
                اشتراک و پلن
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
            >
              <LogOut className="size-4 ms-2" />
              خروج از حساب
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

/* ═══════════════════════════════════════════════════════════════
   AppShell
   ═══════════════════════════════════════════════════════════════ */

export default function AppShell() {
  const currentView = useStore((s) => s.currentView)
  const user = useStore((s) => s.user)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const planName = useStore((s) => s.planName)
  const planFeatures = getFeaturesByPlanName(planName || 'simple')

  // ★ v9.7.0: ref برای جلوگیری از preload تکراری هنگام بازگشت از آفلاین
  const hasPreloadedRef = useRef(false)

  useEffect(() => {
    if (!user) return
    const canAccess = checkAccess(currentView, user.role, user.permissions, planFeatures)
    if (!canAccess) {
      const firstView = isFullAccessRole(user.role)
        ? 'dashboard'
        : (user.permissions || []).includes('dashboard')
          ? 'dashboard'
          : (user.permissions || [])[0]
              ? (navItems.find(n => n.permKey === (user.permissions || [])[0])?.view ?? 'dashboard')
              : 'dashboard'
      setCurrentView(firstView as AppView)
    }
  }, [user, currentView, setCurrentView, planFeatures])

  useEffect(() => {
    if (typeof window === 'undefined') return

    // ── Sync Engine ──────────────────────────────────────────────
    import('@/lib/sync-engine').then(({ syncEngine }) => {
      syncEngine.init()
    })

    // ── Service Worker Listener ──────────────────────────────────
    const listenToSW = async () => {
      if (!('serviceWorker' in navigator)) return
      try {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'TRIGGER_SYNC') {
            import('@/lib/sync-engine').then(({ syncEngine }) => syncEngine.sync())
          }
        })
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('[AppShell] SW controller changed')
        })
      } catch (err) {
        console.warn('[AppShell] SW listener error:', err)
      }
    }

    // ── ★ v9.7.0: اتصال هوشمند — جایگزین navigator.onLine ──────
    // شروع مانیتورینگ (اگر قبلاً شروع نشده، no-op است)
    startConnectivityMonitor()

    // تنظیم اولیه store بر اساس وضعیت واقعی API
    const initialState = getConnectivityState()
    useStore.getState().setOnline(initialState.isApiReachable)

    // گوش دادن به تغییرات connectivity → به‌روزرسانی store
    const unsubConnectivity = onConnectivityChange((state) => {
      useStore.getState().setOnline(state.isApiReachable)

      // ★ v9.7.0: preload هنگام بازگشت از آفلاین (فقط یک‌بار)
      if (state.isApiReachable && !hasPreloadedRef.current) {
        hasPreloadedRef.current = true
        setTimeout(async () => {
          try {
            const { syncEngine } = await import('@/lib/sync-engine')
            await syncEngine.preloadData()
            console.log('[AppShell] ✅ Preload after reconnect completed')
          } catch (err) {
            console.warn('[AppShell] ⚠️ Preload after reconnect failed:', err)
          }
        }, 1500)
      }
    })

    // ── حفظ backward compat: event‌های مرورگر ───────────────────
    // ★ این listener‌ها به‌عنوان سیگنال کمکی نگه داشته شده‌اند.
    //   مقدار نهایی توسط onConnectivityChange تعیین می‌شود (پینگ واقعی API).
    const handleBrowserOnline = () => useStore.getState().setOnline(true)
    const handleBrowserOffline = () => useStore.getState().setOnline(false)

    const initialOnline = navigator.onLine
    useStore.getState().setOnline(initialOnline)

    window.addEventListener('online', handleBrowserOnline)
    window.addEventListener('offline', handleBrowserOffline)

    listenToSW()

    // ── Preload اولیه ────────────────────────────────────────────
    // ★ v9.7.0: بر اساس isApiOnline() به‌جای navigator.onLine
    let preloadTimer: NodeJS.Timeout | null = null
    if (isApiOnline()) {
      hasPreloadedRef.current = true
      preloadTimer = setTimeout(async () => {
        try {
          const { syncEngine } = await import('@/lib/sync-engine')
          await syncEngine.preloadData()
        } catch (err) {
          console.warn('[AppShell] ⚠️ Preload failed:', err)
        }
      }, 2000)
    }

    return () => {
      // ★ v9.7.0: cleanup connectivity listener
      unsubConnectivity()

      window.removeEventListener('online', handleBrowserOnline)
      window.removeEventListener('offline', handleBrowserOffline)
      if (preloadTimer) clearTimeout(preloadTimer)
    }
  }, [])
  
  const canViewCurrentPage = checkAccess(
    currentView,
    user?.role,
    user?.permissions,
    planFeatures
  )
  const isPosView = currentView === 'pos'

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <OfflineBanner />
        <DemoBanner />
        <AppHeader />
        
        <SubscriptionBanner />

        {isPosView ? (
          <div className="flex-1 min-h-0 overflow-hidden bg-white">
            {canViewCurrentPage ? <PosPage /> : <DashboardPage />}
          </div>
        ) : (
          <ScrollArea className="flex-1 bg-white">
            <main className="p-2 sm:p-3 md:p-4 lg:p-6 max-w-full overflow-x-hidden min-h-screen">
              {canViewCurrentPage
                ? renderCurrentView(currentView)
                : renderCurrentView('dashboard')}
            </main>
          </ScrollArea>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}