// src/lib/store.ts — Unified Zustand Store (v25.0)
// ============================================================================
// ★ v25.1: اضافه شدن resolvedPlanName (PlanName واقعی) و planInfo (اطلاعات کامل پلن)
//          حفظ ۴ پلن: رایگان/ساده/حرفه‌ای/سازمانی — رایگان+ساده = سطح قابلیت basic
// ★ v25.0: اضافه شدن planTier محاسبه‌شده + استفاده از plan-features.ts
//          گیتینگ متمرکز قابلیت‌ها بر اساس پلن
// ★ v24.0: اضافه شدن InstallmentPlanType، lastSyncAt، syncStatus
//          پشتیبانی کامل از نسیه و قسطی در POS
// ★ v19.0: اضافه شدن _hasHydrated flag برای رفع مشکل addToCart
// ★ v8.0: اضافه شدن POS state (cart, addToCart, removeFromCart, etc.)
// ★ v7.0: اضافه شدن currentTenant, planName در login()
// ============================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { resolvePlanTier, resolvePlanName, type PlanTier, type PlanName, type PlanFeatureSet, getPlanFeatures, type PlanInfo, PLANS } from './plan-features';

// ─── AppView type ───────────────────────────────────────────────

export type AppView =
  | 'landing' | 'login' | 'register'
  | 'dashboard' | 'pos' | 'products' | 'categories'
  | 'customers' | 'invoices' | 'invoice-detail'
  | 'installments' | 'accounting' | 'journal-entry-detail'
  | 'settings' | 'settings-store' | 'settings-gateway'
  | 'settings-pos' | 'settings-invoice' | 'settings-backup'
  | 'settings-subscription' | 'settings-employees'
  | 'reports' | 'upgrade-plan'
  // ★★★ v6.1: view های جدید
  | 'suppliers'
  | 'purchase-invoices'
  | 'warehouses'
  | 'stock-movements'
   | 'stock-transfer'
  // ★★★ v6.5: انبار گردانی
  | 'stock-count'
  // ★★★ v7.1: شعب
  | 'branches'
  // ★★★ v8.6: تیکت پشتیبانی
  | 'tickets'                         
  | 'ticket-detail'                  


// backward-compatible alias
export type ViewType = AppView;

// ─── Notification type ──────────────────────────────────────────

export interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  type?: 'info' | 'warning' | 'error' | 'success';
  createdAt?: string;
  link?: string;
}

// ─── User type ──────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  role: string;
  tenantId: string;
  storeId?: string;
  storeName?: string;
  permissions?: string[];
  [key: string]: any;
}

// ─── Cart Item type ─────────────────────────────────────────────

export interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  lineTotal: number;
  currentStock?: number;       // ★★★ v24: موجودی فعلی محصول
  unitLabel?: string;          // ★★★ v24: واحد اندازه‌گیری
}

// ─── ★★★ v24: Installment Plan Type ──────────────────────────

export interface InstallmentPlanData {
  downPayment: number;           // پیش‌پرداخت
  numberOfInstallments: number;  // تعداد اقساط
  interestRate: number;          // درصد سود
  installmentPeriod: 'monthly' | 'biweekly' | 'weekly'; // دوره قسط
  totalWithInterest: number;     // مبلغ کل با سود
  installmentAmount: number;     // مبلغ هر قسط
  remainingAmount: number;       // مبلغ باقیمانده (کل - پیش‌پرداخت)
}

// ─── ★★★ v24: Sync Status Type ──────────────────────────────

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'error' | 'offline';

export interface SyncInfo {
  status: SyncStatus;
  lastSyncAt: string | null;
  pendingCount: number;
  lastError: string | null;
  tenantId: string | null;
  isIsolated: boolean;          // آیا پنل پولی (بانک اختصاصی) است
  planName: string | null;      // نام پلن فعلی
}

// ─── App State ──────────────────────────────────────────────────

export interface AppState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  refreshToken: string | null;

  // Navigation
  currentView: AppView;
  selectedPlanId: string | null;
  selectedBillingCycle: string | null;

  // ★★★ v28: Navigation — انتخاب سند حسابداری برای صفحه جزئیات ★★★
  selectedJournalEntryId: string | null;

  // Tenant
  tenantId: string | null;
  storeName: string | null;
  currentTenant: any | null;
  planName: string | null;

  // ★★★ v25: Plan Tier — محاسبه‌شده از planName ★★★
  planTier: PlanTier;
  planFeatures: PlanFeatureSet;

  // ★★★ v25.1: Plan Name واقعی — ۴ پلن: free/simple/professional/enterprise ★★★
  resolvedPlanName: PlanName;       // نام واقعی پلن (free/simple/professional/enterprise)
  planInfo: PlanInfo;               // اطلاعات کامل پلن (قیمت، محدودیت‌ها و غیره)

  // ★★★ POS State ★★★
  cart: CartItem[];
  selectedCustomerId: string | null;
  selectedCustomerName: string | null;
  paymentType: string;

  // ★★★ v24: Installment/Credit data ★★★
  installmentPlan: InstallmentPlanData | null;

  // Network & Sync
  isOnline: boolean;
  pendingSyncCount: number;

  // ★★★ v24: Sync Info — وضعیت همگام‌سازی بر اساس پنل ★★★
  syncInfo: SyncInfo;

  // Notifications
  notifications: Notification[];

  // ★★★ v19: Hydration state ★★★
  _hasHydrated: boolean;

  // ─── Actions ──────────────────────────────────────────────────
  setCurrentView: (view: AppView) => void;
  setSelectedPlanId: (id: string | null) => void;
  setSelectedBillingCycle: (cycle: string | null) => void;
  // ★★★ v28: setter for selectedJournalEntryId ★★★
  setSelectedJournalEntryId: (id: string | null) => void;
  login: (user: User, token: string, refreshToken?: string, tenant?: any) => void;
  logout: () => void;
  setUser: (user: User) => void;
  setToken: (token: string | null) => void;
  setTenantId: (tenantId: string | null) => void;
  setStoreName: (storeName: string | null) => void;
  setCurrentTenant: (tenant: any) => void;
  setPlanName: (planName: string | null) => void;
  setOnline: (online: boolean) => void;
  setPendingSyncCount: (count: number) => void;

  // ★★★ v25: Plan actions ★★★
  setPlanTier: (tier: PlanTier) => void;

  // ★★★ v24: Sync actions ★★★
  setSyncInfo: (info: Partial<SyncInfo>) => void;
  startSync: () => Promise<void>;

  // ★★★ POS Actions ★★★
  addToCart: (item: CartItem) => void;
  removeFromCart: (productId: string) => void;
  updateCartItemQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  setCustomer: (customerId: string | null, customerName?: string | null) => void;
  setPaymentType: (type: string) => void;

  // ★★★ v24: Installment/Credit actions ★★★
  setInstallmentPlan: (plan: InstallmentPlanData | null) => void;

  // Notification actions
  addNotification: (notification: Omit<Notification, 'id' | 'isRead'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  removeNotification: (id: string) => void;

  // ★★★ v19: Hydration action ★★★
  setHasHydrated: (state: boolean) => void;
}

// ─── ★★★ v25: Helper — محاسبه planTier و features ★★★ ──────

function computePlanState(planName: string | null) {
  const resolvedName = resolvePlanName(planName)
  const tier = resolvePlanTier(planName)
  const features = getPlanFeatures(tier)
  const planInfo = PLANS[resolvedName]
  return { planTier: tier, planFeatures: features, resolvedPlanName: resolvedName, planInfo }
}

// ─── Store ──────────────────────────────────────────────────────

const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Auth defaults
      user: null,
      isAuthenticated: false,
      token: null,
      refreshToken: null,

      // Navigation defaults
      currentView: 'landing',
      selectedPlanId: null,
      selectedBillingCycle: null,
      // ★★★ v28: default selectedJournalEntryId ★★★
      selectedJournalEntryId: null,

      // Tenant defaults
      tenantId: null,
      storeName: null,
      currentTenant: null,
      planName: null,

      // ★★★ v25: Plan defaults — محاسبه‌شده ★★★
      ...computePlanState(null),

      // ★★★ POS defaults ★★★
      cart: [],
      selectedCustomerId: null,
      selectedCustomerName: null,
      paymentType: 'Cash',

      // ★★★ v24: Installment plan default ★★★
      installmentPlan: null,

      // Network defaults
      isOnline: true,
      pendingSyncCount: 0,

      // ★★★ v24: Sync Info defaults ★★★
      syncInfo: {
        status: 'synced',
        lastSyncAt: null,
        pendingCount: 0,
        lastError: null,
        tenantId: null,
        isIsolated: false,
        planName: null,
      },

      // Notifications defaults
      notifications: [],

      // ★★★ v19: Hydration state ★★★
      _hasHydrated: false,

      // ─── Navigation actions ───────────────────────────────────
      setCurrentView: (view) => set({ currentView: view }),
      setSelectedPlanId: (id) => set({ selectedPlanId: id }),
      setSelectedBillingCycle: (cycle) => set({ selectedBillingCycle: cycle }),
      // ★★★ v28: setter for selectedJournalEntryId ★★★
      setSelectedJournalEntryId: (id: string | null) => set({ selectedJournalEntryId: id }),

      // ─── Auth actions ─────────────────────────────────────────
      login: (user, token, refreshToken, tenant) =>
        set({
          user,
          isAuthenticated: true,
          token,
          refreshToken: refreshToken || null,
          tenantId: user.tenantId || null,
          storeName: user.storeName || null,
          currentTenant: tenant || null,
          planName: tenant?.planName || tenant?.planTierName || null,
          // ★★★ v25: محاسبه planTier هنگام لاگین ★★★
          ...computePlanState(tenant?.planName || tenant?.planTierName || null),
          // ★★★ v24: بروزرسانی syncInfo بر اساس پنل ★★★
          syncInfo: {
            status: 'synced',
            lastSyncAt: new Date().toISOString(),
            pendingCount: 0,
            lastError: null,
            tenantId: user.tenantId || null,
            isIsolated: tenant?.isIsolated || false,
            planName: tenant?.planName || tenant?.planTierName || null,
          },
        }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          token: null,
          refreshToken: null,
          tenantId: null,
          storeName: null,
          currentTenant: null,
          planName: null,
          // ★★★ v25: ریست plan state ★★★
          ...computePlanState(null),
          selectedPlanId: null,
          selectedBillingCycle: null,
          // ★★★ v28: پاک کردن selectedJournalEntryId در logout ★★★
          selectedJournalEntryId: null,
          notifications: [],
          pendingSyncCount: 0,
          // ★★★ پاک کردن POS state ★★★
          cart: [],
          selectedCustomerId: null,
          selectedCustomerName: null,
          paymentType: 'Cash',
          installmentPlan: null,
          // ★★★ پاک کردن syncInfo ★★★
          syncInfo: {
            status: 'synced',
            lastSyncAt: null,
            pendingCount: 0,
            lastError: null,
            tenantId: null,
            isIsolated: false,
            planName: null,
          },
        }),

      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setTenantId: (tenantId) => set({ tenantId }),
      setStoreName: (storeName) => set({ storeName }),
      setCurrentTenant: (tenant) => set({ currentTenant: tenant }),

      // ★★★ v25: setPlanName حالا planTier رو هم بروز می‌کنه ★★★
      setPlanName: (planName) => set({
        planName,
        ...computePlanState(planName),
      }),

      // ★★★ v25: setPlanTier مستقیم ★★★
      setPlanTier: (tier) => set({
        planTier: tier,
        planFeatures: getPlanFeatures(tier),
      }),

      // ─── Network actions ──────────────────────────────────────
      setOnline: (online) => set((state) => ({
        isOnline: online,
        syncInfo: {
          ...state.syncInfo,
          status: online ? (state.syncInfo.pendingCount > 0 ? 'pending' : 'synced') : 'offline',
        },
      })),
      setPendingSyncCount: (count) => set((state) => ({
        pendingSyncCount: count,
        syncInfo: {
          ...state.syncInfo,
          pendingCount: count,
          status: count > 0 ? 'pending' : state.syncInfo.status === 'offline' ? 'offline' : 'synced',
        },
      })),

      // ─── ★★★ v24: Sync actions ★★★ ───────────────────────────
      setSyncInfo: (info) => set((state) => ({
        syncInfo: { ...state.syncInfo, ...info },
      })),

      startSync: async () => {
        const state = get();
        if (!state.isOnline) {
          set((s) => ({ syncInfo: { ...s.syncInfo, status: 'offline', lastError: 'اتصال اینترنت برقرار نیست' } }));
          return;
        }
        if (state.syncInfo.status === 'syncing') return; // جلوگیری از سینک همزمان

        set((s) => ({ syncInfo: { ...s.syncInfo, status: 'syncing', lastError: null } }));

        try {
          const tenantId = state.tenantId || state.user?.tenantId;
          if (!tenantId) {
            set((s) => ({ syncInfo: { ...s.syncInfo, status: 'error', lastError: 'شناسه فروشگاه نامشخص' } }));
            return;
          }

          const res = await fetch('/api/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${state.token}`,
            },
            body: JSON.stringify({
              tenantId,
              lastSyncAt: state.syncInfo.lastSyncAt,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            set((s) => ({
              syncInfo: {
                ...s.syncInfo,
                status: 'synced',
                lastSyncAt: new Date().toISOString(),
                pendingCount: 0,
                lastError: null,
              },
              pendingSyncCount: 0,
            }));
          } else {
            const errorData = await res.json().catch(() => ({}));
            set((s) => ({
              syncInfo: {
                ...s.syncInfo,
                status: 'error',
                lastError: errorData.error || 'خطا در همگام‌سازی',
              },
            }));
          }
        } catch (error: any) {
          set((s) => ({
            syncInfo: {
              ...s.syncInfo,
              status: 'error',
              lastError: error?.message || 'خطای شبکه',
            },
          }));
        }
      },

      // ─── ★★★ POS Actions ★★★ ───────────────────────────────

      addToCart: (item) => set((state) => {
        const existingIndex = state.cart.findIndex(c => c.productId === item.productId)

        if (existingIndex >= 0) {
          const updated = [...state.cart]
          const existing = updated[existingIndex]
          const newQuantity = existing.quantity + item.quantity

          const maxStock = item.currentStock ?? existing.currentStock ?? Infinity
          if (newQuantity > maxStock) {
            return state
          }

          const newLineTotal = Math.round(
            newQuantity * existing.unitPrice * (1 + existing.taxRate / 100)
          )
          updated[existingIndex] = {
            ...existing,
            quantity: newQuantity,
            lineTotal: newLineTotal,
          }
          return { cart: updated }
        }

        return { cart: [...state.cart, item] }
      }),

      removeFromCart: (productId) => set((state) => ({
        cart: state.cart.filter(c => c.productId !== productId),
      })),

      updateCartItemQuantity: (productId, quantity) => set((state) => {
        const updated = state.cart.map(c => {
          if (c.productId === productId) {
            const newLineTotal = Math.round(
              quantity * c.unitPrice * (1 + c.taxRate / 100)
            )
            return { ...c, quantity, lineTotal: newLineTotal }
          }
          return c
        })
        return { cart: updated }
      }),

      clearCart: () => set({
        cart: [],
        selectedCustomerId: null,
        selectedCustomerName: null,
        paymentType: 'Cash',
        installmentPlan: null,
      }),

      setCustomer: (customerId, customerName) => set({
        selectedCustomerId: customerId,
        selectedCustomerName: customerName || null,
      }),

      setPaymentType: (type) => set({ paymentType: type }),

      // ─── ★★★ v24: Installment/Credit actions ★★★ ──────────────
      setInstallmentPlan: (plan) => set({ installmentPlan: plan }),

      // ─── Notification actions ─────────────────────────────────
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            {
              ...notification,
              id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              isRead: false,
              createdAt: new Date().toISOString(),
            },
            ...state.notifications,
          ].slice(0, 50),
        })),

      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n
          ),
        })),

      markAllNotificationsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        })),

      clearNotifications: () => set({ notifications: [] }),

      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      // ★★★ v19: Hydration action ★★★
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'shop-accounting-store',
      // ★ v25 — اضافه شدن planTier و planFeatures
      version: 8,
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          const newState = { ...persistedState }
          delete newState.currentView
          return newState as AppState
        }
        if (version < 3) {
          const newState = { ...persistedState }
          if (!newState.notifications) newState.notifications = []
          if (newState.pendingSyncCount === undefined) newState.pendingSyncCount = 0
          return newState as AppState
        }
        if (version < 4) {
          const newState = { ...persistedState }
          if (!newState.selectedBillingCycle) newState.selectedBillingCycle = null
          return newState as AppState
        }
        if (version < 5) {
          const newState = { ...persistedState }
          if (!newState.cart) newState.cart = []
          if (!newState.selectedCustomerId) newState.selectedCustomerId = null
          if (!newState.selectedCustomerName) newState.selectedCustomerName = null
          if (!newState.paymentType) newState.paymentType = 'Cash'
          return newState as AppState
        }
        if (version < 6) {
          const newState = { ...persistedState }
          newState._hasHydrated = false
          return newState as AppState
        }
        if (version < 7) {
          const newState = { ...persistedState }
          if (!newState.syncInfo) {
            newState.syncInfo = {
              status: 'synced',
              lastSyncAt: null,
              pendingCount: 0,
              lastError: null,
              tenantId: newState.tenantId || null,
              isIsolated: false,
              planName: newState.planName || null,
            }
          }
          if (!newState.installmentPlan) {
            newState.installmentPlan = null
          }
          return newState as AppState
        }
        // ★★★ v25: version 8 migration — اضافه شدن planTier ★★★
        if (version < 8) {
          const newState = { ...persistedState }
          const planState = computePlanState(newState.planName || null)
          newState.planTier = planState.planTier
          newState.planFeatures = planState.planFeatures
          // ★★★ v25.1: اضافه شدن resolvedPlanName و planInfo ★★★
          newState.resolvedPlanName = planState.resolvedPlanName
          newState.planInfo = planState.planInfo
          return newState as AppState
        }
        return persistedState as AppState
      },
      // ★ فقط فیلدهای غیر حساس ذخیره بشن — cart ذخیره نمیشه (حجیم)
      partialize: (state) => ({
        selectedPlanId: state.selectedPlanId,
        selectedBillingCycle: state.selectedBillingCycle,
        tenantId: state.tenantId,
        storeName: state.storeName,
        planName: state.planName,
        // ★★★ v25: planTier و planFeatures و resolvedPlanName و planInfo از planName محاسبه میشن، ذخیره نمیشن
        notifications: state.notifications,
        syncInfo: {
          ...state.syncInfo,
          status: 'synced',
        },
      }),
      // ★★★ v19: بعد از hydration، _hasHydrated = true ★★★
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error('[Store] Hydration error:', error)
          }
          if (state) {
            // ★★★ v25: محاسبه planTier بعد از hydration ★★★
            const planState = computePlanState(state.planName)
            state.planTier = planState.planTier
            state.planFeatures = planState.planFeatures
            // ★★★ v25.1: محاسبه resolvedPlanName و planInfo ★★★
            state.resolvedPlanName = planState.resolvedPlanName
            state.planInfo = planState.planInfo

            state.setHasHydrated(true)
          }
        }
      },
    }
  )
);

export const useStore = useAppStore;
export { useAppStore };

// ★★★ v25.2: اکسپوز useStore به window برای تست در کنسول مرورگر ★★★
// این کار فقط در حالت غیر production انجام میشه
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as any).useStore = useAppStore;
  (window as any).store = useAppStore;
  (window as any).appStore = useAppStore;

  // ★ هلپرهای کاربردی برای تست
  (window as any).setPlan = (plan: string) => {
    console.log(`%c[ShopAccounting] تغییر پلن به: ${plan}`, 'color:#10b981;font-weight:bold');
    useAppStore.getState().setPlanName(plan);
  };

  (window as any).getPlan = () => {
    const state = useAppStore.getState();
    console.table({
      planName: state.planName,
      resolvedPlanName: state.resolvedPlanName,
      planTier: state.planTier,
      isPaid: state.planInfo?.isPaid,
      isIsolated: state.planInfo?.isIsolated,
      label: state.planInfo?.label,
    });
    return state;
  };

  console.log(
    '%c[ShopAccounting] Store در دسترس است\n' +
    '★ useStore.getState() — مشاهده state\n' +
    '★ setPlan("professional") — تغییر به حرفه‌ای\n' +
    '★ setPlan("free") — تغییر به رایگان\n' +
    '★ setPlan("simple") — تغییر به ساده\n' +
    '★ setPlan("enterprise") — تغییر به سازمانی\n' +
    '★ getPlan() — مشاهده اطلاعات پلن فعلی',
    'color:#3b82f6;font-weight:bold'
  );
}

// ─── Initialize Auth ────────────────────────────────────────────

export async function initializeAuth(): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  if (!token) {
    const state = useAppStore.getState();
    if (state.isAuthenticated) {
      useAppStore.setState({ isAuthenticated: false, user: null, token: null, refreshToken: null });
    }
    return;
  }

  try {
    const res = await fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.user) {
        useAppStore.getState().login(data.user, token);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
    } else {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const refreshRes = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            if (refreshData.success && refreshData.data) {
              const newAccessToken = refreshData.data.accessToken || refreshData.data.token;
              const refreshedUser = refreshData.data.user;

              if (newAccessToken && refreshedUser) {
                useAppStore.getState().login(refreshedUser, newAccessToken);
                localStorage.setItem('token', newAccessToken);
                localStorage.setItem('user', JSON.stringify(refreshedUser));
                return;
              }
            }
          }
        } catch {}
      }

      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      localStorage.removeItem('storeName');
      localStorage.removeItem('tenant');
      localStorage.removeItem('planName');
      useAppStore.setState({ isAuthenticated: false, user: null, token: null, refreshToken: null });
    }
  } catch {
    // خطای شبکه — تغییر state نمیدیم
  }
}

export default useAppStore;

