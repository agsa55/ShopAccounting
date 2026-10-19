// src/lib/store.ts — Unified Zustand Store (v25.3)
// ============================================================================
// ★ v25.3: اصلاح loadFiscalYears
//   - حذف فیلتر سال‌های آینده (همه سال‌ها نمایش داده می‌شوند)
//   - اصلاح ساختار FiscalYearBounds با فیلدهای from, to, asOf
//   - حفظ fallback هوشمند به سال فعال
// ★ v25.2: افزودن state سراسری سال مالی
//   - fiscalYears
//   - selectedFiscalYearId
//   - fiscalYearBounds
//   - loadFiscalYears()
//   - setSelectedFiscalYearId()
// ============================================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  resolvePlanTier,
  resolvePlanName,
  type PlanTier,
  type PlanName,
  type PlanFeatureSet,
  getPlanFeatures,
  type PlanInfo,
  PLANS,
} from './plan-features';

// ─── AppView type ───────────────────────────────────────────────

export type AppView =
  | 'landing'
  | 'login'
  | 'register'
  | 'dashboard'
  | 'pos'
  | 'products'
  | 'categories'
  | 'customers'
  | 'invoices'
  | 'invoice-detail'
  | 'installments'
  | 'checks'
  | 'accounting'
  | 'journal-entry-detail'
  | 'settings'
  | 'settings-store'
  | 'settings-gateway'
  | 'settings-pos'
  | 'settings-invoice'
  | 'settings-backup'
  | 'settings-subscription'
  | 'settings-employees'
  | 'reports'
  | 'upgrade-plan'
  | 'suppliers'
  | 'purchase-invoices'
  | 'warehouses'
  | 'stock-movements'
  | 'stock-transfer'
  | 'stock-count'
  | 'branches'
  | 'tickets'
  | 'ticket-detail'
  | 'basic-year-end';

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
  currentStock?: number;
  unitLabel?: string;
}

// ─── InstallmentPlanData type ───────────────────────────────────

export interface InstallmentPlanData {
  downPayment: number;
  numberOfInstallments: number;
  interestRate: number;
  installmentPeriod: 'monthly' | 'biweekly' | 'weekly';
  totalWithInterest: number;
  installmentAmount: number;
  remainingAmount: number;
}

// ─── SyncStatus type ────────────────────────────────────────────

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'error' | 'offline';

export interface SyncInfo {
  status: SyncStatus;
  lastSyncAt: string | null;
  pendingCount: number;
  lastError: string | null;
  tenantId: string | null;
  isIsolated: boolean;
  planName: string | null;
}

// ─── Fiscal Year types ──────────────────────────────────────────

export interface FiscalYearOption {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
  isClosed?: boolean;
}

export interface FiscalYearBounds {
  fiscalYearId: string | null;
  fiscalYearName: string | null;
  from: string;
  to: string;
  asOf: string;
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
  selectedJournalEntryId: string | null;

  // Tenant
  tenantId: string | null;
  storeName: string | null;
  currentTenant: any | null;
  planName: string | null;

  // Plan
  planTier: PlanTier;
  planFeatures: PlanFeatureSet;
  resolvedPlanName: PlanName;
  planInfo: PlanInfo;

  // POS State
  cart: CartItem[];
  selectedCustomerId: string | null;
  selectedCustomerName: string | null;
  paymentType: string;
  installmentPlan: InstallmentPlanData | null;

  // Network & Sync
  isOnline: boolean;
  pendingSyncCount: number;
  syncInfo: SyncInfo;

  // Notifications
  notifications: Notification[];

  // Fiscal Year global state
  fiscalYears: FiscalYearOption[];
  selectedFiscalYearId: string | null;
  fiscalYearBounds: FiscalYearBounds | null;
  fiscalYearsLoading: boolean;

  // Hydration
  _hasHydrated: boolean;

  // ─── Actions ─────────────────────────────────────────────────
  setCurrentView: (view: AppView) => void;
  setSelectedPlanId: (id: string | null) => void;
  setSelectedBillingCycle: (cycle: string | null) => void;
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
  setPlanTier: (tier: PlanTier) => void;
  setSyncInfo: (info: Partial<SyncInfo>) => void;
  startSync: () => Promise<void>;

  addToCart: (item: CartItem) => void;
  removeFromCart: (productId: string) => void;
  updateCartItemQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  setCustomer: (customerId: string | null, customerName?: string | null) => void;
  setPaymentType: (type: string) => void;
  setInstallmentPlan: (plan: InstallmentPlanData | null) => void;

  addNotification: (notification: Omit<Notification, 'id' | 'isRead'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  removeNotification: (id: string) => void;

  // Fiscal Year actions
  loadFiscalYears: () => Promise<void>;
  setSelectedFiscalYearId: (id: string | null) => void;

  setHasHydrated: (state: boolean) => void;
}

// ─── Helper — محاسبه planState ──────────────────────────────────

function computePlanState(planName: string | null) {
  const resolvedName = resolvePlanName(planName);
  const tier = resolvePlanTier(planName);
  const features = getPlanFeatures(tier);
  const planInfo = PLANS[resolvedName];

  return {
    planTier: tier,
    planFeatures: features,
    resolvedPlanName: resolvedName,
    planInfo,
  };
}

// ─── Fiscal Year helpers ────────────────────────────────────────

function formatDateISOLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateOnly(value: any): string | null {
  if (!value) return null;

  try {
    if (value instanceof Date) {
      return formatDateISOLocal(value);
    }

    if (typeof value === 'number') {
      return formatDateISOLocal(new Date(value));
    }

    const str = String(value).trim();
    if (!str) return null;

    return str.slice(0, 10);
  } catch {
    return null;
  }
}

function computeFiscalYearBounds(fy: FiscalYearOption | null): FiscalYearBounds | null {
  if (!fy) return null;

  const from = normalizeDateOnly(fy.startDate);
  const end = normalizeDateOnly(fy.endDate);

  if (!from || !end) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = new Date(`${from}T00:00:00`);
  const endDate = new Date(`${end}T23:59:59.999`);

  // ★ v25.5:
  // برای سال مالی، بازه گزارش باید کل سال مالی باشد، نه فقط تا امروز.
  // اگر سال مالی در آینده شروع می‌شود، asOf روی تاریخ شروع می‌ماند.
  // اگر سال مالی تمام شده، asOf روی تاریخ پایان می‌ماند.
  // اگر سال مالی جاری است، asOf روی امروز است.
  let asOfDate: Date;

  if (today < startDate) {
    asOfDate = startDate;
  } else if (today > endDate) {
    asOfDate = endDate;
  } else {
    asOfDate = today;
  }

  const to = end;
  const asOf = formatDateISOLocal(asOfDate);

  return {
    fiscalYearId: fy.id,
    fiscalYearName: fy.name,
    from,
    to,
    asOf,
  };
}
// ─── ★★★ تابع کمکی پاک‌سازی کامل مرورگر ★★★ ──────────────────

function clearBrowserStorage(): void {
  if (typeof window === 'undefined') return;

  try {
    // ★ پاک کردن localStorage
    const keysToRemove = [
      'token',
      'refreshToken',
      'user',
      'storeName',
      'tenant',
      'planName',
      'tenant-slug',
      'auth-token',
      'shop-accounting-store', // ★★★ کل Zustand persist store
    ];

    keysToRemove.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {}
    });

    // ★ پاک کردن sessionStorage
    try {
      sessionStorage.clear();
    } catch {}

    // ★ پاک کردن تمام کوکی‌ها
    const cookiesToClear = [
      'tenant-slug',
      'tenant-view',
      'auth-token',
      'token',
      'refreshToken',
    ];

    const hostname = window.location.hostname;

    cookiesToClear.forEach((name) => {
      // بدون domain
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      // با domain
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${hostname};`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${hostname};`;
    });

    console.log('[Store] ✅ Browser storage cleared');
  } catch (err) {
    console.warn('[Store] ⚠️ Error clearing storage:', err);
  }
}

// ─── State پاک بعد از logout ────────────────────────────────────

const CLEAN_STATE = {
  user: null,
  isAuthenticated: false,
  token: null,
  refreshToken: null,
  tenantId: null,
  storeName: null,
  currentTenant: null,
  planName: null,
  ...computePlanState(null),
  currentView: 'landing' as AppView,
  selectedPlanId: null,
  selectedBillingCycle: null,
  selectedJournalEntryId: null,
  notifications: [],
  pendingSyncCount: 0,
  cart: [],
  selectedCustomerId: null,
  selectedCustomerName: null,
  paymentType: 'Cash',
  installmentPlan: null,

  fiscalYears: [],
  selectedFiscalYearId: null,
  fiscalYearBounds: null,
  fiscalYearsLoading: false,

  syncInfo: {
    status: 'synced' as SyncStatus,
    lastSyncAt: null,
    pendingCount: 0,
    lastError: null,
    tenantId: null,
    isIsolated: false,
    planName: null,
  },
};

// ─── Store ──────────────────────────────────────────────────────

const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // ── Defaults ──
      user: null,
      isAuthenticated: false,
      token: null,
      refreshToken: null,
      currentView: 'landing',
      selectedPlanId: null,
      selectedBillingCycle: null,
      selectedJournalEntryId: null,
      tenantId: null,
      storeName: null,
      currentTenant: null,
      planName: null,
      ...computePlanState(null),
      cart: [],
      selectedCustomerId: null,
      selectedCustomerName: null,
      paymentType: 'Cash',
      installmentPlan: null,
      isOnline: true,
      pendingSyncCount: 0,
      syncInfo: {
        status: 'synced',
        lastSyncAt: null,
        pendingCount: 0,
        lastError: null,
        tenantId: null,
        isIsolated: false,
        planName: null,
      },
      notifications: [],

      fiscalYears: [],
      selectedFiscalYearId: null,
      fiscalYearBounds: null,
      fiscalYearsLoading: false,

      _hasHydrated: false,

      // ── Navigation ─
      setCurrentView: (view) => set({ currentView: view }),
      setSelectedPlanId: (id) => set({ selectedPlanId: id }),
      setSelectedBillingCycle: (cycle) => set({ selectedBillingCycle: cycle }),
      setSelectedJournalEntryId: (id) => set({ selectedJournalEntryId: id }),

      // ── Auth: login ──
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
          ...computePlanState(tenant?.planName || tenant?.planTierName || null),
          syncInfo: {
            status: 'synced',
            lastSyncAt: new Date().toISOString(),
            pendingCount: 0,
            lastError: null,
            tenantId: user.tenantId || null,
            isIsolated: tenant?.isIsolated || false,
            planName: tenant?.planName || tenant?.planTierName || null,
          },

          // ★ با لاگین، state سال مالی قبلی پاک شود تا از فروشگاه/کاربر قبلی نماند
          fiscalYears: [],
          selectedFiscalYearId: null,
          fiscalYearBounds: null,
          fiscalYearsLoading: false,
        }),

      // ★★★★★ ── Auth: logout — اصلاح‌شده با ریدایرکت ★★★★★
      // ★★★ تابع logout — ریدایرکت با پارامتر ?logout=1
      logout: () => {
        console.log('[Store] 🚪 Logging out...');

        // ۱. پاک کردن Zustand state
        set(CLEAN_STATE);

        // ۲. پاک کردن browser storage
        clearBrowserStorage();

        if (typeof window !== 'undefined') {
          // ۳. Call logout API برای پاک کردن کوکی‌های server-side
          fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
          }).catch(() => {
            /* ignore */
          });

          // ۴. ★★★ ریدایرکت با پارامتر logout=1
          // middleware این پارامتر را می‌بیند و کوکی‌ها را پاک می‌کند
          setTimeout(() => {
            window.location.replace('/?logout=1');
          }, 100);
        }
      },

      // ── Setters ──
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setTenantId: (tenantId) => set({ tenantId }),
      setStoreName: (storeName) => set({ storeName }),
      setCurrentTenant: (tenant) => set({ currentTenant: tenant }),

      setPlanName: (planName) =>
        set({
          planName,
          ...computePlanState(planName),
        }),

      setPlanTier: (tier) =>
        set({
          planTier: tier,
          planFeatures: getPlanFeatures(tier),
        }),

      // ── Fiscal Year global actions ──
      setSelectedFiscalYearId: (id) =>
        set((state) => {
          const fy = state.fiscalYears.find((f) => f.id === id) || null;

          return {
            selectedFiscalYearId: fy?.id || null,
            fiscalYearBounds: computeFiscalYearBounds(fy),
          };
        }),

      // ── Fiscal Year: loadFiscalYears (v25.3) ──
      loadFiscalYears: async () => {
        const state = get();
        const tenantId = state.tenantId || state.user?.tenantId;

        if (!tenantId) {
          set({
            fiscalYears: [],
            selectedFiscalYearId: null,
            fiscalYearBounds: null,
            fiscalYearsLoading: false,
          });
          return;
        }

        set({ fiscalYearsLoading: true });

        try {
          const headers: Record<string, string> = {
            'x-tenant-id': tenantId,
          };

          if (state.token) {
            headers.Authorization = `Bearer ${state.token}`;
          }

          const res = await fetch(
            `/api/fiscal-years?tenantId=${encodeURIComponent(tenantId)}`,
            {
              headers,
              credentials: 'include',
            }
          );

          const json = await res.json();

          // استخراج لیست سال‌ها از response
          const list: any[] = Array.isArray(json?.data)
            ? json.data
            : Array.isArray(json?.data?.fiscalYears)
            ? json.data.fiscalYears
            : Array.isArray(json?.data?.years)
            ? json.data.years
            : Array.isArray(json?.fiscalYears)
            ? json.fiscalYears
            : [];

          // نرمال‌سازی سال‌ها
          const normalized: FiscalYearOption[] = list
            .map((fy: any) => ({
              id: String(fy.id || ''),
              name: String(fy.name || fy.label || 'سال مالی'),
              startDate: String(fy.startDate || fy.startAt || fy.from || ''),
              endDate: String(fy.endDate || fy.endAt || fy.to || ''),
              isActive: Boolean(fy.isActive),
              isClosed: Boolean(fy.isClosed),
            }))
            .filter((fy) => fy.id && fy.startDate && fy.endDate);

          // ★ v25.3: مرتب‌سازی بدون فیلتر (همه سال‌ها نمایش داده می‌شوند)
          const sorted = normalized.sort((a, b) => {
            const aTime = new Date(a.startDate).getTime();
            const bTime = new Date(b.startDate).getTime();
            return bTime - aTime;
          });

          const currentSelectedId = state.selectedFiscalYearId;

          // ★ v11.1: بررسی اعتبار سال انتخاب‌شده فعلی
   // ★ v25.6: سال مالی بسته هم برای گزارش‌گیری معتبر است.
// فقط باید در لیست سال‌ها وجود داشته باشد؛ شرط isActive/isClosed حذف شد.
const selectedStillValid =
  currentSelectedId &&
  sorted.some((fy) => fy.id === currentSelectedId);
          // پیدا کردن سال فعال
          const activeYear = sorted.find((fy) => fy.isActive && !fy.isClosed);

          // انتخاب سال: اولویت با سال انتخاب‌شده معتبر، سپس سال فعال، سپس اولین سال
          let selected: FiscalYearOption | null = null;

          if (selectedStillValid) {
            // سال انتخاب‌شده هنوز معتبر است
            selected = sorted.find((fy) => fy.id === currentSelectedId) || null;
            console.log(
              '[Store] ✅ Keeping current fiscal year selection:',
              selected?.name
            );
          } else if (activeYear) {
            // سال انتخاب‌شده نامعتبر شد یا وجود ندارد → fallback به سال فعال
            selected = activeYear;
            console.log(
              '[Store] 🔄 Auto-selecting active fiscal year:',
              selected.name
            );
       } else {
  // ★ v25.4: اگر سال فعالی وجود ندارد، سال بسته‌شده را انتخاب نکن.
  // این حالت باید ویزارد راه‌اندازی سال جدید را فعال کند.
  selected = null;
  console.log(
    '[Store] ⚠️ No active fiscal year found; leaving selection empty to force renewal setup'
  );
}

          // ★ v25.3: محاسبه bounds با ساختار صحیح FiscalYearBounds
          const bounds: FiscalYearBounds | null = selected
            ? computeFiscalYearBounds(selected)
            : null;

          set({
            fiscalYears: sorted,
            selectedFiscalYearId: selected?.id || null,
            fiscalYearBounds: bounds,
            fiscalYearsLoading: false,
          });

          console.log('[Store] 📊 Fiscal years loaded:', {
            total: sorted.length,
            active: activeYear?.name || 'none',
            selected: selected?.name || 'none',
          });
        } catch (err) {
          console.error('[Store] loadFiscalYears error:', err);

          set({
            fiscalYearsLoading: false,
          });
        }
      },

      // ── Network ──
      setOnline: (online) =>
        set((state) => ({
          isOnline: online,
          syncInfo: {
            ...state.syncInfo,
            status: online
              ? state.syncInfo.pendingCount > 0
                ? 'pending'
                : 'synced'
              : 'offline',
          },
        })),

      setPendingSyncCount: (count) =>
        set((state) => ({
          pendingSyncCount: count,
          syncInfo: {
            ...state.syncInfo,
            pendingCount: count,
            status:
              count > 0
                ? 'pending'
                : state.syncInfo.status === 'offline'
                ? 'offline'
                : 'synced',
          },
        })),

      // ── Sync ──
      setSyncInfo: (info) =>
        set((state) => ({
          syncInfo: { ...state.syncInfo, ...info },
        })),

      startSync: async () => {
        const state = get();

        if (!state.isOnline) {
          set((s) => ({
            syncInfo: {
              ...s.syncInfo,
              status: 'offline',
              lastError: 'اتصال اینترنت برقرار نیست',
            },
          }));
          return;
        }

        if (state.syncInfo.status === 'syncing') return;

        set((s) => ({
          syncInfo: { ...s.syncInfo, status: 'syncing', lastError: null },
        }));

        try {
          const tenantId = state.tenantId || state.user?.tenantId;

          if (!tenantId) {
            set((s) => ({
              syncInfo: {
                ...s.syncInfo,
                status: 'error',
                lastError: 'شناسه فروشگاه نامشخص',
              },
            }));
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

      // ── POS ──
      addToCart: (item) =>
        set((state) => {
          const existingIndex = state.cart.findIndex(
            (c) => c.productId === item.productId
          );

          if (existingIndex >= 0) {
            const updated = [...state.cart];
            const existing = updated[existingIndex];
            const newQuantity = existing.quantity + item.quantity;
            const maxStock = item.currentStock ?? existing.currentStock ?? Infinity;

            if (newQuantity > maxStock) return state;

            updated[existingIndex] = {
              ...existing,
              quantity: newQuantity,
              lineTotal: Math.round(
                newQuantity * existing.unitPrice * (1 + existing.taxRate / 100)
              ),
            };

            return { cart: updated };
          }

          return { cart: [...state.cart, item] };
        }),

      removeFromCart: (productId) =>
        set((state) => ({
          cart: state.cart.filter((c) => c.productId !== productId),
        })),

      updateCartItemQuantity: (productId, quantity) =>
        set((state) => ({
          cart: state.cart.map((c) =>
            c.productId === productId
              ? {
                  ...c,
                  quantity,
                  lineTotal: Math.round(
                    quantity * c.unitPrice * (1 + c.taxRate / 100)
                  ),
                }
              : c
          ),
        })),

      clearCart: () =>
        set({
          cart: [],
          selectedCustomerId: null,
          selectedCustomerName: null,
          paymentType: 'Cash',
          installmentPlan: null,
        }),

      setCustomer: (customerId, customerName) =>
        set({
          selectedCustomerId: customerId,
          selectedCustomerName: customerName || null,
        }),

      setPaymentType: (type) => set({ paymentType: type }),
      setInstallmentPlan: (plan) => set({ installmentPlan: plan }),

      // ── Notifications ──
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
          notifications: state.notifications.map((n) => ({
            ...n,
            isRead: true,
          })),
        })),

      clearNotifications: () => set({ notifications: [] }),

      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      // ── Hydration ──
      setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),
    }),

    {
      name: 'shop-accounting-store',
      version: 10, // ★ v10: افزودن selectedFiscalYearId
      storage: createJSONStorage(() => sessionStorage),

      migrate: (persistedState: any, version: number) => {
        const s = { ...persistedState } as any;

        if (version < 2) {
          delete s.currentView;
        }

        if (version < 3) {
          if (!s.notifications) s.notifications = [];
          if (s.pendingSyncCount === undefined) s.pendingSyncCount = 0;
        }

        if (version < 4) {
          if (!s.selectedBillingCycle) s.selectedBillingCycle = null;
        }

        if (version < 5) {
          if (!s.cart) s.cart = [];
          if (!s.selectedCustomerId) s.selectedCustomerId = null;
          if (!s.selectedCustomerName) s.selectedCustomerName = null;
          if (!s.paymentType) s.paymentType = 'Cash';
        }

        if (version < 6) {
          s._hasHydrated = false;
        }

        if (version < 7) {
          if (!s.syncInfo) {
            s.syncInfo = {
              status: 'synced',
              lastSyncAt: null,
              pendingCount: 0,
              lastError: null,
              tenantId: s.tenantId || null,
              isIsolated: false,
              planName: s.planName || null,
            };
          }

          if (!s.installmentPlan) s.installmentPlan = null;
        }

        if (version < 8) {
          const planState = computePlanState(s.planName || null);
          s.planTier = planState.planTier;
          s.planFeatures = planState.planFeatures;
          s.resolvedPlanName = planState.resolvedPlanName;
          s.planInfo = planState.planInfo;
        }

        if (version < 9) {
          // ★ v9: انتقال به sessionStorage - state را پاک می‌کنیم
          // چون نمی‌خواهیم state قبلی از localStorage با تب جدید ترکیب شود
          console.log('[Store] 🔄 Migrating to sessionStorage (v9)');

          // پاک کردن localStorage قدیمی
          try {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('shop-accounting-store');
            }
          } catch {
            /* ignore */
          }

          // state خالی برگردان
          return {
            selectedFiscalYearId: null,
          } as AppState;
        }

        if (version < 10) {
          if (s.selectedFiscalYearId === undefined) {
            s.selectedFiscalYearId = null;
          }
        }

        return s as AppState;
      },

      // ★ فقط فیلدهای ضروری persist میشن — token و user ذخیره نمیشن (امنیت)
      partialize: (state) => ({
        selectedPlanId: state.selectedPlanId,
        selectedBillingCycle: state.selectedBillingCycle,
        tenantId: state.tenantId,
        storeName: state.storeName,
        planName: state.planName,
        selectedFiscalYearId: state.selectedFiscalYearId,
        notifications: state.notifications,
        syncInfo: {
          ...state.syncInfo,
          status: 'synced' as SyncStatus,
        },
      }),

      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[Store] Hydration error:', error);
        }

        if (state) {
          const planState = computePlanState(state.planName);
          state.planTier = planState.planTier;
          state.planFeatures = planState.planFeatures;
          state.resolvedPlanName = planState.resolvedPlanName;
          state.planInfo = planState.planInfo;
          state.setHasHydrated(true);
        }
      },
    }
  )
);

export const useStore = useAppStore;
export { useAppStore };

// ─── Dev helpers ────────────────────────────────────────────────

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as any).useStore = useAppStore;
  (window as any).store = useAppStore;
  (window as any).appStore = useAppStore;

  (window as any).setPlan = (plan: string) => {
    console.log(
      `%c[ShopAccounting] تغییر پلن به: ${plan}`,
      'color:#10b981;font-weight:bold'
    );
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
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  if (!token) {
    const state = useAppStore.getState();

    if (state.isAuthenticated) {
      useAppStore.setState({
        isAuthenticated: false,
        user: null,
        token: null,
        refreshToken: null,
      });
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
      // تلاش برای refresh
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
              const newToken =
                refreshData.data.accessToken || refreshData.data.token;
              const refreshedUser = refreshData.data.user;

              if (newToken && refreshedUser) {
                useAppStore.getState().login(refreshedUser, newToken);
                localStorage.setItem('token', newToken);
                localStorage.setItem('user', JSON.stringify(refreshedUser));
                return;
              }
            }
          }
        } catch {
          /* ignore */
        }
      }

      // پاک کردن همه چیز
      clearBrowserStorage();

      useAppStore.setState({
        isAuthenticated: false,
        user: null,
        token: null,
        refreshToken: null,
      });
    }
  } catch {
    // خطای شبکه — state تغییر نمیده
  }
}

export default useAppStore;