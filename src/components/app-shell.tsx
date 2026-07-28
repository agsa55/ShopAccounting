'use client'

// ============================================================================
// src/components/app-shell.tsx — v8.8.10
// ★ PWA Install Button + دکمه نصب در هدر
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { useStore, type AppView } from '@/lib/store'
import { resolvePlan, getFeaturesByPlanName } from '@/lib/plan-features'
import { SidebarPlanCard } from '@/components/shared/sidebar-plan-card'

// ★ PWA
import { usePWAInstall } from '@/components/pwa-register'

import {
  LayoutDashboard, ShoppingCart, Package, Grid3x3, Users, FileText,
  CreditCard, BookOpen, BarChart3, Settings, Bell, LogOut, Store, Clock,
  Warehouse as WarehouseIcon, Building2, Truck, ArrowRightLeft, ClipboardList,
  Ticket as TicketIcon, MessageCircle, Sparkles, RefreshCw, Wifi, WifiOff,
  Download, // ★ آیکون نصب PWA
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

function isFullAccessRole(role: string | undefined): boolean {
  return !!role && FULL_ACCESS_ROLES.has(role)
}

const ROLE_LABELS: Record<string, string> = {
  Admin: 'مدیر سیستم', Manager: 'مدیر', Owner: 'مالک', Cashier: 'صندوق‌دار',
  admin: 'مدیر سیستم', manager: 'مدیر', owner: 'مالک', cashier: 'صندوق‌دار',
}

function getRoleLabel(role: string | undefined): string {
  if (!role) return 'کاربر'
  return ROLE_LABELS[role] || role
}

function checkAccess(
  view: AppView,
  role: string | undefined,
  permissions: string[] | undefined,
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

  const planFeatures = getFeaturesByPlanName(planName)

  const { isDemo, status: demoStatus } = useDemoStatus()
  const isDemoActive = isDemo && !demoStatus?.isExpired

  const [daysRemaining, setDaysRemaining] = useState(0)
  const [isExpired, setIsExpired] = useState(false)
  const [realPlanName, setRealPlanName] = useState<string>('')

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
          console.warn('[AppSidebar] trial-check failed with success:false')
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
        console.warn('[AppSidebar] Fetch error, using cached plan:', err)
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

  const effectivePlanName = realPlanName || planName
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

  return (
    <Sidebar
      side="right"
      collapsible="icon"
      className="border-l-2 border-gray-200 bg-gradient-to-b from-gray-50 to-white shadow-lg"
    >
      <SidebarHeader className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="gap-2 sm:gap-3">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
                <Store className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0 overflow-hidden">
                <span className="text-xs sm:text-sm font-semibold truncate">
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
            <div className="space-y-1.5">
              <SidebarPlanCard onClick={() => setCurrentView('settings-subscription' as AppView)} />
              <a
                href="/subscription/renew"
                className="w-full text-[10px] py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md transition-colors flex items-center justify-center gap-1 font-medium"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                تمدید / ارتقا اشتراک
              </a>

              {isDemo && demoStatus?.isExpired ? (
                <p className="text-[9px] text-red-600 text-center font-medium">
                  دوره آزمایشی پایان یافت — اشتراک تهیه کنید
                </p>
              ) : (
                <>
                  {!isExpired && daysRemaining > 0 && daysRemaining !== -1 && (
                    <p className="text-[9px] text-gray-500 text-center flex items-center justify-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {daysRemaining > 30
                        ? `${Math.floor(daysRemaining / 30)} ماه و ${daysRemaining % 30} روز`
                        : `${daysRemaining} روز`}
                      {' '}تا پایان اشتراک
                    </p>
                  )}
                  {daysRemaining === -1 && (
                    <p className="text-[9px] text-emerald-600 text-center font-medium flex items-center justify-center gap-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      اشتراک مادام‌العمر
                    </p>
                  )}
                  {isExpired && (
                    <p className="text-[9px] text-red-600 text-center font-medium">
                      اشتراک منقضی شده — تمدید کنید
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-3 py-0.5 group-data-[collapsible=icon]:hidden">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
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
                              : 'hover:bg-gray-100'
                        }`}
                      >
                        <item.icon className={`size-4 ${isActive && !isItemDisabled ? 'text-emerald-600' : ''}`} />
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
        <SidebarSeparator />
        <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center">
          <Avatar className="size-7 sm:size-8 border border-emerald-200">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-[10px] sm:text-xs font-semibold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0 overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="text-[11px] sm:text-xs font-medium truncate">{userDisplayName}</span>
            <span className="text-[9px] sm:text-[10px] text-muted-foreground">{getRoleLabel(user?.role)}</span>
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

  // اگر نصب شده یا قابل نصب نیست، نمایش نده
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
      console.log('[AppHeader] 🚪 Starting logout process...')

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
    <header className="flex h-11 sm:h-12 md:h-14 items-center gap-1.5 sm:gap-2 md:gap-3 border-b bg-white px-2 sm:px-3 md:px-4 shadow-sm sticky top-0 z-10">
      <SidebarTrigger className="-mr-1 shrink-0 rotate-180" />
      <Separator orientation="vertical" className="h-4 sm:h-5 md:h-6 hidden xs:block" />

      <Breadcrumb className="flex-1 min-w-0 overflow-hidden">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="hidden md:inline-block">
            <BreadcrumbPage className="text-[10px] md:text-xs text-muted-foreground truncate">
              {storeName || 'فروشگاه'}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:inline-block" />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-[11px] sm:text-xs md:text-sm font-medium truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">
              {viewLabels[currentView] || currentView}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 shrink-0">

        {/* ★ دکمه نصب PWA */}
        <PWAInstallButton />

        <OfflineModal />

        {/* ── Notifications ── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative size-8 md:size-9 shrink-0">
              <Bell className="size-3.5 sm:size-4 text-gray-500" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -left-0.5 flex size-3.5 sm:size-4 items-center justify-center rounded-full bg-red-500 text-[7px] sm:text-[9px] font-bold text-white leading-none">
                  {unreadCount > 9 ? '+۹' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 sm:w-72 md:w-80 bg-white border border-gray-200 shadow-lg rounded-lg">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span className="text-xs sm:text-sm">اعلان‌ها</span>
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
              <div className="py-4 sm:py-6 text-center text-xs sm:text-sm text-muted-foreground">
                اعلانی وجود ندارد
              </div>
            ) : (
              notifications.slice(0, 5).map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  onClick={() => markNotificationRead(notification.id)}
                  className="flex flex-col items-start gap-1 p-2 sm:p-2.5 md:p-3 cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2 w-full">
                    {!notification.isRead && (
                      <div className="size-1.5 sm:size-2 rounded-full bg-emerald-500 shrink-0" />
                    )}
                    <span className="text-[11px] sm:text-xs md:text-sm font-medium flex-1 truncate">
                      {notification.title}
                    </span>
                  </div>
                  <span className="text-[9px] sm:text-[10px] md:text-xs text-muted-foreground line-clamp-2 leading-relaxed">
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
            <Button variant="ghost" className="gap-1 sm:gap-1.5 md:gap-2 px-1.5 sm:px-2 h-8 md:h-9 shrink-0">
              <Avatar className="size-6 md:size-7 border border-emerald-200">
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-[8px] sm:text-[9px] md:text-[10px] font-semibold">
                  {user?.username?.charAt(0) || 'م'}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs md:text-sm font-medium hidden md:inline max-w-[80px] lg:max-w-none truncate">
                {user?.username || 'کاربر'}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48 sm:w-52 md:w-56 bg-white border border-gray-200 shadow-lg rounded-lg"
            style={{ backgroundColor: 'white' }}
          >
            <DropdownMenuLabel>
              <div className="flex flex-col gap-1">
                <span className="text-xs sm:text-sm">{user?.username || 'کاربر'}</span>
                <span className="text-[10px] sm:text-xs font-normal text-muted-foreground">
                  {getRoleLabel(user?.role)} - {user?.username}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {canAccessSettings && (
              <DropdownMenuItem
                onClick={() => useStore.getState().setCurrentView('settings')}
              >
                <Settings className="size-4 ms-2" />
                تنظیمات
              </DropdownMenuItem>
            )}
            {canAccessSettings && (
              <DropdownMenuItem
                onClick={() => useStore.getState().setCurrentView('settings-subscription' as AppView)}
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
  const planFeatures = getFeaturesByPlanName(planName)

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

  // ★ Service Worker + Online/Offline + Sync
  useEffect(() => {
    if (typeof window === 'undefined') return

    let syncInterval: NodeJS.Timeout | null = null
    let domContentLoadedListener: (() => void) | null = null

    const triggerSync = async () => {
      try {
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
            message: `${result.failed} تغییر همگام‌سازی نشد — مجدداً تلاش می‌شود`,
            type: 'warning',
          })
        }

        const { getSyncQueueCount } = await import('@/lib/offline-db')
        const count = await getSyncQueueCount()
        useStore.getState().setPendingSyncCount(count)
      } catch (err) {
        console.error('[AppShell] triggerSync error:', err)
      }
    }

    const handleOnline = () => {
      useStore.getState().setOnline(true)
      useStore.getState().addNotification({
        title: '🌐 اتصال برقرار شد',
        message: 'در حال همگام‌سازی تغییرات...',
        type: 'info',
      })
      triggerSync()

      if (syncInterval) clearInterval(syncInterval)
      syncInterval = setInterval(async () => {
        const count = useStore.getState().pendingSyncCount
        if (count > 0) {
          await triggerSync()
        } else {
          if (syncInterval) clearInterval(syncInterval)
        }
      }, 30000)
    }

    const handleOffline = () => {
      useStore.getState().setOnline(false)
      if (syncInterval) clearInterval(syncInterval)
      useStore.getState().addNotification({
        title: '📡 اتصال قطع شد',
        message: 'تغییرات شما ذخیره و پس از اتصال همگام‌سازی می‌شوند',
        type: 'warning',
      })
    }

       // ★ ثبت Service Worker — از pwa-register.tsx مجزا است
    // ★ این فقط برای sync پیام‌رسانی است، ثبت اصلی در PWARegister انجام می‌شود
    const listenToSW = async () => {
      if (!('serviceWorker' in navigator)) return
      try {
        // ★ فقط listen می‌کنیم، ثبت نمی‌کنیم (PWARegister انجام می‌دهد)
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'TRIGGER_SYNC') {
            console.log('[AppShell] TRIGGER_SYNC from SW')
            triggerSync()
          }
          if (event.data?.type === 'SW_UPDATED') {
            console.log('[AppShell] SW updated, new version available')
          }
        })

        // ★ فیکس: controllerchange دیگر reload نمی‌کند
        // در dev این رویداد مدام فایر می‌شد (چون Turbopack فایل‌ها رو rebuild می‌کنه)
        // و اگر reload() اینجا بود → حلقه بی‌نهایت
        // الان فقط log می‌کنیم — reload فقط در production و با تأیید کاربر انجام میشه
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('[AppShell] SW controller changed (new version active) — no auto-reload in dev')
        })

      } catch (err) {
        console.warn('[AppShell] SW listener error:', err)
      }
    }
    const initialOnline = navigator.onLine
    useStore.getState().setOnline(initialOnline)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    listenToSW()

    const updatePendingCount = async () => {
      try {
        const { getSyncQueueCount } = await import('@/lib/offline-db')
        const count = await getSyncQueueCount()
        useStore.getState().setPendingSyncCount(count)
      } catch { /* ignore */ }
    }

    updatePendingCount()
    const countInterval = setInterval(updatePendingCount, 10000)

    let preloadTimer: NodeJS.Timeout | null = null
    if (initialOnline) {
      preloadTimer = setTimeout(async () => {
        try {
          const { syncEngine } = await import('@/lib/sync-engine')
          await syncEngine.preloadData()
          console.log('[AppShell] ✅ Preload data completed')
        } catch (err) {
          console.warn('[AppShell] ⚠️ Preload failed:', err)
        }
      }, 2000)
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(countInterval)
      if (syncInterval) clearInterval(syncInterval)
      if (preloadTimer) clearTimeout(preloadTimer)
      if (domContentLoadedListener) {
        document.removeEventListener('DOMContentLoaded', domContentLoadedListener)
      }
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

        {isPosView ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            {canViewCurrentPage ? <PosPage /> : <DashboardPage />}
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <main className="p-2 sm:p-3 md:p-4 lg:p-6 max-w-full overflow-x-hidden">
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