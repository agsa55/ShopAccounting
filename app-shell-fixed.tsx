'use client'

import { useEffect, useMemo } from 'react'
import { useStore, type ViewType } from '@/lib/store'
import {
  LayoutDashboard, ShoppingCart, Package, Grid3x3, Users, FileText, CreditCard, BookOpen, BarChart3, Settings, Bell, LogOut, Store,
} from 'lucide-react'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarInset, SidebarTrigger, SidebarSeparator,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { OfflineIndicator, OfflineBanner } from '@/components/ui/offline-indicator'

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

/* ------------------------------------------------------------------ */
/*  Navigation configuration                                          */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string
  icon: React.ComponentType<{ className?: string }>
  view: ViewType
  permKey: string
}

const navItems: NavItem[] = [
  { label: 'داشبورد', icon: LayoutDashboard, view: 'dashboard', permKey: 'dashboard' },
  { label: 'صندوق فروش', icon: ShoppingCart, view: 'pos', permKey: 'pos' },
  { label: 'محصولات', icon: Package, view: 'products', permKey: 'products' },
  { label: 'دسته‌بندی‌ها', icon: Grid3x3, view: 'categories', permKey: 'categories' },
  { label: 'مشتریان', icon: Users, view: 'customers', permKey: 'customers' },
  { label: 'فاکتورها', icon: FileText, view: 'invoices', permKey: 'invoices' },
  { label: 'اقساط', icon: CreditCard, view: 'installments', permKey: 'installments' },
  { label: 'حسابداری', icon: BookOpen, view: 'accounting', permKey: 'accounting' },
  { label: 'گزارش‌ها', icon: BarChart3, view: 'reports', permKey: 'reports' },
  { label: 'تنظیمات', icon: Settings, view: 'settings', permKey: 'settings' },
]

const MANAGER_ONLY_KEYS = ['settings']

const viewLabels: Record<string, string> = {
  dashboard: 'داشبورد', pos: 'صندوق فروش', products: 'محصولات', categories: 'دسته‌بندی‌ها',
  customers: 'مشتریان', invoices: 'فاکتورها', 'invoice-detail': 'جزئیات فاکتور',
  installments: 'اقساط', accounting: 'حسابداری', 'journal-entry-detail': 'جزئیات سند',
  settings: 'تنظیمات', 'settings-store': 'تنظیمات فروشگاه', 'settings-gateway': 'درگاه پرداخت',
  'settings-pos': 'تنظیمات صندوق', 'settings-invoice': 'تنظیمات فاکتور', 'settings-backup': 'پشتیبان‌گیری',
  'settings-subscription': 'اشتراک', 'settings-employees': 'کارکنان', reports: 'گزارش‌ها',
}

/* ------------------------------------------------------------------ */
/*  Role helpers                                                      */
/* ------------------------------------------------------------------ */

const FULL_ACCESS_ROLES = new Set(['Admin', 'Manager', 'Owner', 'admin', 'manager', 'owner'])

function isFullAccessRole(role: string | undefined): boolean {
  return !!role && FULL_ACCESS_ROLES.has(role)
}

const ROLE_LABELS: Record<string, string> = {
  Admin: 'مدیر سیستم',
  Manager: 'مدیر',
  Owner: 'مالک',
  Cashier: 'صندوق‌دار',
  admin: 'مدیر سیستم',
  manager: 'مدیر',
  owner: 'مالک',
  cashier: 'صندوق‌دار',
}

function getRoleLabel(role: string | undefined): string {
  if (!role) return 'کاربر'
  return ROLE_LABELS[role] || role
}

/* ------------------------------------------------------------------ */
/*  Access control helper                                             */
/* ------------------------------------------------------------------ */

function checkAccess(view: ViewType, role: string | undefined, permissions: string[] | undefined): boolean {
  if (!role) return false
  if (isFullAccessRole(role)) return true
  if (permissions && permissions.includes('all')) return true
  if (MANAGER_ONLY_KEYS.includes(view)) return false
  const navItem = navItems.find((item) => item.view === view)
  if (!navItem) return true
  return (permissions || []).includes(navItem.permKey)
}

/* ------------------------------------------------------------------ */
/*  View renderer                                                     */
/* ------------------------------------------------------------------ */

function renderCurrentView(view: ViewType) {
  switch (view) {
    case 'dashboard': return <DashboardPage />
    case 'pos': return <PosPage />
    case 'products': return <ProductsPage />
    case 'categories': return <CategoriesPage />
    case 'customers': return <CustomersPage />
    case 'invoices': return <InvoicesPage />
    case 'invoice-detail': return <InvoiceDetail />
    case 'installments': return <InstallmentsPage />
    case 'accounting': return <JournalEntriesPage />
    case 'journal-entry-detail': return <JournalEntryDetail />
    case 'settings': case 'settings-store': case 'settings-gateway': case 'settings-pos':
    case 'settings-invoice': case 'settings-backup': case 'settings-subscription': case 'settings-employees':
      return <SettingsPage />
    case 'reports': return <ReportsPage />
    default: return <DashboardPage />
  }
}

/* ================================================================== */
/*  AppSidebar                                                        */
/* ================================================================== */

function AppSidebar() {
  const currentView = useStore((s) => s.currentView)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const storeName = useStore((s) => s.storeName)
  const user = useStore((s) => s.user)
  const notifications = useStore((s) => s.notifications)

  const unreadCount = (notifications || []).filter(n => !n.isRead).length

  const visibleNavItems = useMemo(() => {
    if (!user) return []
    if (isFullAccessRole(user.role) || (user.permissions && user.permissions.includes('all'))) return navItems
    const perms = user.permissions || []
    return navItems.filter((item) => {
      if (MANAGER_ONLY_KEYS.includes(item.view)) return false
      return perms.includes('all') || perms.includes(item.permKey)
    })
  }, [user])

  const getBaseView = (view: ViewType): ViewType => {
    if (view.startsWith('settings')) return 'settings'
    if (view === 'invoice-detail') return 'invoices'
    if (view === 'journal-entry-detail') return 'accounting'
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
    <Sidebar side="right" collapsible="icon" className="border-l border-r-0">
      {/* ---- Sidebar Header (store branding) ---- */}
      <SidebarHeader className="p-2 sm:p-3">
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
                <Badge
                  variant="secondary"
                  className="w-fit text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 h-4 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                >
                  پایه
                </Badge>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      {/* ---- Sidebar Navigation ---- */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => {
                const isActive = baseView === item.view
                return (
                  <SidebarMenuItem key={item.view}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setCurrentView(item.view)}
                      tooltip={item.label}
                      className={`gap-2.5 sm:gap-3 h-9 sm:h-10 ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 font-semibold'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <item.icon className={`size-4 ${isActive ? 'text-emerald-600' : ''}`} />
                      <span className="text-xs sm:text-sm">{item.label}</span>
                      {item.view === 'installments' && unreadCount > 0 && (
                        <Badge className="ms-auto bg-orange-500 text-white text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 h-4 min-w-4">
                          {unreadCount}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ---- Sidebar Footer (offline + user info) ---- */}
      <SidebarFooter className="p-2 sm:p-3">
        <SidebarSeparator />
        <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
          <OfflineIndicator className="justify-center" />
        </div>
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

/* ================================================================== */
/*  AppHeader                                                         */
/* ================================================================== */

function AppHeader() {
  const currentView = useStore((s) => s.currentView)
  const storeName = useStore((s) => s.storeName)
  const user = useStore((s) => s.user)
  const notifications = useStore((s) => s.notifications)
  const markNotificationRead = useStore((s) => s.markNotificationRead)
  const logout = useStore((s) => s.logout)

  const unreadCount = (notifications || []).filter(n => !n.isRead).length

  // ✅ FIX: Admin, Manager, Owner هم به تنظیمات دسترسی دارند
  const canAccessSettings = isFullAccessRole(user?.role)

  return (
    <header className="flex h-11 sm:h-12 md:h-14 items-center gap-1.5 sm:gap-2 md:gap-3 border-b bg-white px-2 sm:px-3 md:px-4 shadow-sm sticky top-0 z-10">
      {/* ---- Sidebar toggle (RTL: rotated so chevron points left = "open") ---- */}
      <SidebarTrigger className="-mr-1 shrink-0 rotate-180" />

      {/* ---- Vertical separator (hidden on very small screens) ---- */}
      <Separator orientation="vertical" className="h-4 sm:h-5 md:h-6 hidden xs:block" />

      {/* ---- Breadcrumb ---- */}
      <Breadcrumb className="flex-1 min-w-0 overflow-hidden">
        <BreadcrumbList className="flex-nowrap">
          {/* Tenant name: hidden on mobile to save space */}
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

      {/* ---- Right-side actions ---- */}
      <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 shrink-0">
        {/* Offline indicator: hidden in header on mobile (OfflineBanner covers it) */}
        <div className="hidden sm:block">
          <OfflineIndicator />
        </div>

        {/* ---- Notifications ---- */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative size-8 md:size-9 shrink-0">
              <Bell className="size-3.5 sm:size-4 text-gray-500" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -left-0.5 sm:-top-0.5 sm:-left-0.5 flex size-3.5 sm:size-4 items-center justify-center rounded-full bg-red-500 text-[7px] sm:text-[9px] font-bold text-white leading-none">
                  {unreadCount > 9 ? '+۹' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 sm:w-72 md:w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span className="text-xs sm:text-sm">اعلان‌ها</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0">
                  {unreadCount} خوانده‌نشده
                </Badge>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(notifications || []).length === 0 ? (
              <div className="py-4 sm:py-6 text-center text-xs sm:text-sm text-muted-foreground">
                اعلانی وجود ندارد
              </div>
            ) : (
              (notifications || []).slice(0, 5).map((notification) => (
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

        {/* ---- User menu ---- */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-1 sm:gap-1.5 md:gap-2 px-1.5 sm:px-2 h-8 md:h-9 shrink-0">
              <Avatar className="size-6 md:size-7 border border-emerald-200">
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-[8px] sm:text-[9px] md:text-[10px] font-semibold">
                  {user?.username?.charAt(0) || 'م'}
                </AvatarFallback>
              </Avatar>
              {/* Username text: hidden on mobile/tablet, visible on desktop */}
              <span className="text-xs md:text-sm font-medium hidden md:inline max-w-[80px] lg:max-w-none truncate">
                {user?.username || 'کاربر'}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 sm:w-52 md:w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-1">
                <span className="text-xs sm:text-sm">{user?.username || 'کاربر'}</span>
                {/* ✅ FIX: نمایش نقش صحیح برای همه نقش‌ها */}
                <span className="text-[10px] sm:text-xs font-normal text-muted-foreground">
                  {getRoleLabel(user?.role)} - {user?.username}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {canAccessSettings && (
              <DropdownMenuItem onClick={() => useStore.getState().setCurrentView('settings')}>
                {/* ms-2 = margin-inline-start: correct for RTL (space between icon and text) */}
                <Settings className="size-4 ms-2" />
                تنظیمات
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-600 focus:bg-red-50">
              <LogOut className="size-4 ms-2" />
              خروج از حساب
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

/* ================================================================== */
/*  AppShell (main layout)                                            */
/* ================================================================== */

export default function AppShell() {
  const currentView = useStore((s) => s.currentView)
  const user = useStore((s) => s.user)
  const setCurrentView = useStore((s) => s.setCurrentView)

  /* ---- Permission guard ---- */
  useEffect(() => {
    if (!user) return
    const canAccess = checkAccess(currentView, user.role, user.permissions)
    if (!canAccess) {
      // ✅ FIX: کاربران Admin/Manager/Owner هم به داشبورد هدایت شوند
      const firstView = isFullAccessRole(user.role)
        ? 'dashboard'
        : (user.permissions || []).includes('dashboard')
          ? 'dashboard'
          : (user.permissions || [])[0]
              ? (navItems.find(n => n.permKey === (user.permissions || [])[0])?.view ?? 'dashboard')
              : 'dashboard'
      setCurrentView(firstView as ViewType)
    }
  }, [user, currentView, setCurrentView])

  /* ---- Online / offline & sync-polling ---- */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const updateOnlineStatus = () => { useStore.getState().setOnline(navigator.onLine) }
    updateOnlineStatus()
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    const updatePendingCount = async () => {
      try {
        const { getSyncQueueCount } = await import('@/lib/offline-db')
        const count = await getSyncQueueCount()
        useStore.getState().setPendingSyncCount(count)
      } catch {}
    }
    updatePendingCount()
    const interval = setInterval(updatePendingCount, 10000)
    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
      clearInterval(interval)
    }
  }, [])

  const canViewCurrentPage = checkAccess(currentView, user?.role, user?.permissions)

  const isPosView = currentView === 'pos'

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Full-width offline banner (always visible, mobile-friendly) */}
        <OfflineBanner />
        <AppHeader />
        {isPosView ? (
          /* POS page needs full-height, no padding, no parent ScrollArea
             (it manages its own internal scrolling) */
          <div className="flex-1 min-h-0 overflow-hidden">
            {canViewCurrentPage ? <PosPage /> : <DashboardPage />}
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <main className="p-2 sm:p-3 md:p-4 lg:p-6">
              {canViewCurrentPage ? renderCurrentView(currentView) : renderCurrentView('dashboard')}
            </main>
          </ScrollArea>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
