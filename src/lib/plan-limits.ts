// ============================================================================
// src/lib/plan-limits.ts — Plan Limits, Billing & Subscription Utilities (v9.6.0)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v9.6.0 — تغییرات جدید:
//   ★ اضافه شدن منطق ۳ مرحله‌ای انقضا: هشدار (۷ روز قبل)، دوره مهلت (۷ روز بعد)، فقط خواندنی (بعد از آن)
//   ★ اضافه شدن فیلدهای status, canCreate, canRead, message برای کنترل دقیق‌تر دسترسی
//
// ★★★ v9.0 — تغییرات اساسی قبلی:
//   ★ حذف پلن ماهانه — فقط annual (سالانه) و lifetime (مادام‌العمر)
//   ★ تغییر نام پلن‌ها: ساده → پایه، حرفه‌ای → پیشرفته، سازمانی → حرفه‌ای
//   ★ نام کد پلن‌ها ثابت ماند: simple / professional / enterprise
//   ★ قیمت‌گذاری واقعی (تومان)
//   ★ پلن مادام‌العمر → expiresAt=null, daysRemaining=-1, isExpired=false
// ============================================================================

// ═══════════════════════════════════════════════════════════════════════
//  ★★★ v9.0: helper تشخیص پلن مادام‌العمر
// ═══════════════════════════════════════════════════════════════════════

export function isLifetimeCycle(cycle: string | null | undefined): boolean {
  if (!cycle) return false
  const lower = String(cycle).toLowerCase().trim()
  return lower === 'lifetime' || lower === 'مادام‌العمر' || lower === 'مادام‌العمر '
}

// ═══════════════════════════════════════════════════════════════════════
//  تایپ‌ها (Types)
// ═══════════════════════════════════════════════════════════════════════

export type BillingCycle = 'monthly' | 'annual' | 'lifetime';

// ★★★ v9.6.0: اضافه شدن فیلدهای کنترل دسترسی و وضعیت
export type SubscriptionStatusType = 'active' | 'warning' | 'grace_period' | 'read_only' | 'expired';

export interface SubscriptionStatusResult {
  isActive: boolean;
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number;
  tierName: string;
  tierNameFa: string;
  billingCycle: BillingCycle;
  expiresAt: Date | null;
  planTierId: number | null;
  isIsolated: boolean;
  dbName: string | null;
  isLifetime?: boolean;
  // ★★★ v9.6.0: فیلدهای جدید برای کنترل هوشمند دسترسی
  status: SubscriptionStatusType;
  canCreate: boolean;
  canRead: boolean;
  message: string;
}

export interface PlanLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  resourceName: string;
  resourceNameFa: string;
  remaining: number;
  percentUsed: number;
}

export interface FullLimitCheck {
  users: PlanLimitResult;
  products: PlanLimitResult;
  invoices: PlanLimitResult;
  customers: PlanLimitResult;
  subscription: SubscriptionStatusResult;
  overallAllowed: boolean;
}

// ★★★ v9.6.0: اضافه شدن فیلدهای جدید به TenantPlanInfo
export interface TenantPlanInfo {
  tierName: string;
  tierNameFa: string;
  billingCycle: BillingCycle;
  isTrial: boolean;
  isExpired: boolean;
  isActive: boolean;
  daysRemaining: number;
  maxUsers: number;
  maxProducts: number;
  maxInvoices: number;
  maxCustomers: number;
  dbType: 'shared';
  planTierId: number | null;
  expiresAt: Date | null;
  isLifetime?: boolean;
  status: SubscriptionStatusType;
  canCreate: boolean;
  canRead: boolean;
  message: string;
}

export interface UpgradeOption {
  tierName: string;
  tierNameFa: string;
  billingCycle: BillingCycle;
  price: number;
  durationDays: number;
  features: string[];
}

export interface RenewOption {
  tierName: string;
  tierNameFa: string;
  billingCycle: BillingCycle;
  price: number;
  durationDays: number;
  discount: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  ثابت‌ها (Constants) — ۳ پلن بدون رایگان
// ═══════════════════════════════════════════════════════════════════════

export interface PlanLimitDef {
  tierName: string;
  maxUsers: number;
  maxProducts: number;
  maxInvoices: number;
  maxCustomers: number;
  dbType: 'shared';
  isTrial: boolean;
  trialDays: number;
  features: string[];
}

export const PLAN_LIMITS: Record<string, PlanLimitDef> = {
  simple: {
    tierName: 'simple',
    maxUsers: 2,
    maxProducts: 200,
    maxInvoices: 500,
    maxCustomers: 200,
    dbType: 'shared',
    isTrial: false,
    trialDays: 0,
    features: ['تا ۲ کاربر', 'تا ۲۰۰ محصول', 'تا ۵۰۰ فاکتور', 'تا ۲۰۰ مشتری', 'داشبورد مالی'],
  },
  professional: {
    tierName: 'professional',
    maxUsers: 5,
    maxProducts: 2000,
    maxInvoices: 0,
    maxCustomers: 2000,
    dbType: 'shared',
    isTrial: false,
    trialDays: 0,
    features: ['تا ۵ کاربر', 'تا ۲,۰۰۰ محصول', 'فاکتور نامحدود', 'تا ۲,۰۰۰ مشتری', 'حسابداری دوطرفه', 'گزارشات مالی'],
  },
  enterprise: {
    tierName: 'enterprise',
    maxUsers: 0,
    maxProducts: 0,
    maxInvoices: 0,
    maxCustomers: 0,
    dbType: 'shared',
    isTrial: false,
    trialDays: 0,
    features: ['کاربر نامحدود', 'محصول نامحدود', 'فاکتور نامحدود', 'مشتری نامحدود', 'تمام امکانات', 'حسابداری شعب', 'اتصال مودیان'],
  },
};

export const TIER_FA_INFO: Record<string, {
  nameFa: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  lifetimePrice: number;
  features?: string[];
}> = {
  simple: {
    nameFa: 'پایه',
    description: 'مناسب فروشگاه‌های کوچک — تا ۲ کاربر و ۲۰۰ محصول',
    monthlyPrice: 1590000,
    annualPrice: 1590000,
    lifetimePrice: 16000000,
    features: ['تا ۲ کاربر', '۲۰۰ محصول', '۵۰۰ فاکتور', 'داشبورد مالی'],
  },
  professional: {
    nameFa: 'پیشرفته',
    description: 'فروشگاه‌های متوسط — تا ۵ کاربر و ۲۰۰۰ محصول',
    monthlyPrice: 2760000,
    annualPrice: 2760000,
    lifetimePrice: 28000000,
    features: ['تا ۵ کاربر', '۲۰۰۰ محصول', '۵۰۰۰ فاکتور', 'حسابداری دوطرفه', 'گزارشات مالی'],
  },
  enterprise: {
    nameFa: 'حرفه‌ای',
    description: 'کسب‌وکارهای بزرگ و سازمان‌ها',
    monthlyPrice: 3550000,
    annualPrice: 3550000,
    lifetimePrice: 36000000,
    features: ['کاربر نامحدود', 'محصول نامحدود', 'فاکتور نامحدود', 'حسابداری شعب', 'اتصال مودیان'],
  },
};

export const TIER_FA_INFO_COMPAT: Record<string, { nameFa: string; description: string; price: number; features?: string[] }> = {
  simple: { nameFa: 'پایه', description: TIER_FA_INFO.simple.description, price: TIER_FA_INFO.simple.annualPrice, features: TIER_FA_INFO.simple.features },
  professional: { nameFa: 'پیشرفته', description: TIER_FA_INFO.professional.description, price: TIER_FA_INFO.professional.annualPrice, features: TIER_FA_INFO.professional.features },
  enterprise: { nameFa: 'حرفه‌ای', description: TIER_FA_INFO.enterprise.description, price: TIER_FA_INFO.enterprise.annualPrice, features: TIER_FA_INFO.enterprise.features },
};

export const CYCLE_DISCOUNT: Record<BillingCycle, number> = {
  monthly: 0,
  annual: 0,
  lifetime: 0,
};

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: 'سالانه',
  annual: 'سالانه',
  lifetime: 'مادام‌العمر',
};

// ═══════════════════════════════════════════════════════════════════════
//  توابع پایه (Basic Utilities)
// ═══════════════════════════════════════════════════════════════════════

export interface ParsedPlanName {
  tierName: string;
  billingCycle: BillingCycle;
}

export function parseLegacyPlanName(planName: string): ParsedPlanName {
  if (!planName) return { tierName: 'simple', billingCycle: 'annual' };

  const lower = planName.toLowerCase();

  if (lower === 'trial' || lower === 'free') {
    return { tierName: 'simple', billingCycle: 'annual' };
  }

  if (planName.includes('_')) {
    const parts = planName.split('_');
    const tierName = parts[0];
    const cycle = parts[1] as string;
    const validTiers = ['simple', 'professional', 'enterprise'];
    const validCycles: BillingCycle[] = ['monthly', 'annual', 'lifetime'];

    if (cycle === 'quarterly' || cycle === 'semiannual') {
      return { tierName: validTiers.includes(tierName) ? tierName : 'simple', billingCycle: 'annual' };
    }

    if (cycle === 'monthly') {
      return { tierName: validTiers.includes(tierName) ? tierName : 'simple', billingCycle: 'annual' };
    }

    if (validTiers.includes(tierName) && validCycles.includes(cycle as BillingCycle)) {
      return { tierName, billingCycle: cycle as BillingCycle };
    }
  }

  const validTiers = ['simple', 'professional', 'enterprise'];
  if (validTiers.includes(lower)) {
    return { tierName: lower, billingCycle: 'annual' };
  }

  if (lower.includes('پایه') || lower.includes('ساده')) return { tierName: 'simple', billingCycle: 'annual' };
  if (lower.includes('پیشرفته')) return { tierName: 'professional', billingCycle: 'annual' };
  if (lower.includes('حرفه')) return { tierName: 'enterprise', billingCycle: 'annual' };
  if (lower.includes('سازمانی')) return { tierName: 'enterprise', billingCycle: 'annual' };

  if (lower.includes('lifetime') || lower.includes('مادام‌العمر')) {
    let tier = 'simple';
    if (lower.includes('professional') || lower.includes('پیشرفته')) tier = 'professional';
    else if (lower.includes('enterprise') || lower.includes('حرفه') || lower.includes('سازمانی')) tier = 'enterprise';
    return { tierName: tier, billingCycle: 'lifetime' };
  }

  console.warn(`[PlanLimits] Unknown plan name: ${planName} — defaulting to simple/annual`);
  return { tierName: 'simple', billingCycle: 'annual' };
}

export function getPlanLimits(tierName: string): PlanLimitDef {
  return PLAN_LIMITS[tierName] || PLAN_LIMITS.simple;
}

export function planNeedsIsolation(_tierName: string): boolean {
  return false;
}

export function getBillingDurationDays(cycle: BillingCycle): number {
  switch (cycle) {
    case 'monthly': return 365;
    case 'annual': return 365;
    case 'lifetime': return 0;
    default: return 365;
  }
}

export function getPlanPrice(tierName: string, cycle: BillingCycle): number {
  const info = TIER_FA_INFO[tierName];
  if (!info) return 0;
  if (cycle === 'lifetime') return info.lifetimePrice;
  return info.annualPrice;
}

// ═══════════════════════════════════════════════════════════════════════
//  Schema Detection
// ═══════════════════════════════════════════════════════════════════════

let _hasNewSchemaFields: boolean | null = null;

export async function hasNewSchemaFields(): Promise<boolean> {
  if (_hasNewSchemaFields !== null) return _hasNewSchemaFields;

  try {
    const { db } = await import('@/lib/db');
    const result = await db.client.planTier.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    _hasNewSchemaFields = !!result;
  } catch {
    _hasNewSchemaFields = false;
  }

  console.log(`[PlanLimits] ${_hasNewSchemaFields ? '✅' : '❌'} New schema detected — planTierId field ${_hasNewSchemaFields ? 'exists' : 'missing'}`);
  return _hasNewSchemaFields;
}

export function hasNewSchemaFieldsSync(): boolean {
  return _hasNewSchemaFields === true;
}

// ═══════════════════════════════════════════════════════════════════════
//  بررسی وضعیت اشتراک (Subscription Status) — ★★★ v9.6.0 به‌روز شده
// ═══════════════════════════════════════════════════════════════════════

export async function checkSubscriptionStatus(tenantId: string): Promise<SubscriptionStatusResult> {
  const defaultResult: SubscriptionStatusResult = {
    isActive: true,
    isTrial: false,
    isExpired: false,
    daysRemaining: -1,
    tierName: 'simple',
    tierNameFa: 'پایه',
    billingCycle: 'annual',
    expiresAt: null,
    planTierId: null,
    isIsolated: false,
    dbName: null,
    isLifetime: false,
    // ★★★ v9.6.0 defaults
    status: 'active',
    canCreate: true,
    canRead: true,
    message: 'اشتراک فعال است.',
  };

  try {
    const { db } = await import('@/lib/db');
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) return defaultResult;

    const tenantBillingCycle = (tenant.billingCycle as BillingCycle) || 'annual'
    const isLifetime = isLifetimeCycle(tenantBillingCycle)

    let tierName = 'simple';
    let billingCycle: BillingCycle = tenantBillingCycle;
    let planTierId: number | null = null;
    let tierNameFa = 'پایه';

    if (tenant.planTierId) {
      planTierId = tenant.planTierId;
      try {
        const planTier = await db.client.planTier.findUnique({
          where: { id: planTierId },
        });
        if (planTier) {
          tierName = planTier.name;
          tierNameFa = planTier.nameFa || TIER_FA_INFO[planTier.name]?.nameFa || planTier.name;
        }
      } catch { /* ignore */ }
      if (billingCycle === 'monthly') {
        billingCycle = 'annual';
      }
    } else if (tenant.planName) {
      const parsed = parseLegacyPlanName(tenant.planName);
      tierName = parsed.tierName;
      billingCycle = parsed.billingCycle;
      tierNameFa = TIER_FA_INFO[tierName]?.nameFa || tierName;
    }

    // ★★★ v9.0: اگر پلن مادام‌العمر است → بدون انقضا
    if (isLifetime || isLifetimeCycle(billingCycle)) {
      return {
        isActive: tenant.status !== 'suspended',
        isTrial: false,
        isExpired: false,
        daysRemaining: -1,
        tierName,
        tierNameFa,
        billingCycle: 'lifetime',
        expiresAt: null,
        planTierId,
        isIsolated: false,
        dbName: null,
        isLifetime: true,
        status: 'active',
        canCreate: true,
        canRead: true,
        message: 'اشتراک مادام‌العمر فعال است.',
      };
    }

    // ★★★ v9.6.0: منطق ۳ مرحله‌ای انقضا
    const now = new Date();
    const expiresAt = tenant.expiresAt ? new Date(tenant.expiresAt) : null;
    
    if (!expiresAt) {
        return { ...defaultResult, tierName, tierNameFa, billingCycle, planTierId };
    }

    const diffTime = expiresAt.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const isExpired = daysRemaining <= 0;

    let status: SubscriptionStatusType = 'active';
    let canCreate = true;
    let canRead = true;
    let message = 'اشتراک فعال است.';

    if (daysRemaining > 0 && daysRemaining <= 7) {
      status = 'warning';
      message = `اشتراک شما ${daysRemaining} روز دیگر منقضی می‌شود. لطفاً برای تمدید اقدام کنید.`;
    } else if (daysRemaining <= 0 && daysRemaining >= -7) {
      status = 'grace_period';
      message = `اشتراک شما منقضی شده است. شما ${Math.abs(daysRemaining)} روز فرصت دارید برای تمدید و حفظ دسترسی کامل.`;
    } else if (daysRemaining < -7) {
      status = 'read_only';
      canCreate = false;
      message = 'اشتراک شما منقضی شده است. شما در حالت فقط خواندنی هستید. برای ثبت اطلاعات جدید، لطفاً اشتراک خود را تمدید کنید.';
    }

    return {
      isActive: status === 'active' || status === 'warning' || status === 'grace_period',
      isTrial: false,
      isExpired,
      daysRemaining,
      tierName,
      tierNameFa,
      billingCycle,
      expiresAt,
      planTierId,
      isIsolated: false,
      dbName: null,
      isLifetime: false,
      status,
      canCreate,
      canRead,
      message,
    };
  } catch (error: any) {
    console.warn('[PlanLimits] checkSubscriptionStatus error:', error.message);
    return defaultResult;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  بررسی محدودیت (Plan Limit Check)
// ═══════════════════════════════════════════════════════════════════════

export async function checkPlanLimit(
  tenantId: string,
  resourceType: 'users' | 'products' | 'invoices' | 'customers',
  currentCount?: number
): Promise<PlanLimitResult> {
  const defaults: Record<string, PlanLimitResult> = {
    users:     { allowed: true, current: 0, limit: 2,     resourceName: 'users',     resourceNameFa: 'کاربران',    remaining: 2,     percentUsed: 0 },
    products:  { allowed: true, current: 0, limit: 200,   resourceName: 'products',  resourceNameFa: 'محصولات',    remaining: 200,   percentUsed: 0 },
    invoices:  { allowed: true, current: 0, limit: 500,   resourceName: 'invoices',  resourceNameFa: 'فاکتورها',   remaining: 500,   percentUsed: 0 },
    customers: { allowed: true, current: 0, limit: 200,   resourceName: 'customers', resourceNameFa: 'مشتریان',    remaining: 200,   percentUsed: 0 },
  };

  try {
    const status = await checkSubscriptionStatus(tenantId);

    let maxUsers = PLAN_LIMITS[status.tierName]?.maxUsers ?? PLAN_LIMITS.simple.maxUsers;
    let maxProducts = PLAN_LIMITS[status.tierName]?.maxProducts ?? PLAN_LIMITS.simple.maxProducts;
    let maxInvoices = PLAN_LIMITS[status.tierName]?.maxInvoices ?? PLAN_LIMITS.simple.maxInvoices;
    let maxCustomers = PLAN_LIMITS[status.tierName]?.maxCustomers ?? PLAN_LIMITS.simple.maxCustomers;

    if (status.planTierId) {
      try {
        const { db } = await import('@/lib/db');
        const planTier = await db.client.planTier.findUnique({
          where: { id: status.planTierId },
        });
        if (planTier) {
          if (planTier.maxUsers != null) maxUsers = planTier.maxUsers;
          if (planTier.maxProducts != null) maxProducts = planTier.maxProducts;
          if (planTier.maxInvoices != null) maxInvoices = planTier.maxInvoices;
        }
      } catch { /* fallback to hardcoded */ }
    }

    const limitMap: Record<string, number> = {
      users: maxUsers,
      products: maxProducts,
      invoices: maxInvoices,
      customers: maxCustomers,
    };

    const limit = limitMap[resourceType];
    let current = currentCount ?? 0;

    if (currentCount === undefined) {
      try {
        const { db } = await import('@/lib/db');
        const tenantDb = db.client;

        if (resourceType === 'users') {
          current = await tenantDb.storeUser.count({ where: { tenantId, isActive: true } });
        } else if (resourceType === 'products') {
          current = await tenantDb.product.count({ where: { tenantId, isActive: true } });
        } else if (resourceType === 'invoices') {
          current = await tenantDb.invoice.count({ where: { tenantId } });
        } else if (resourceType === 'customers') {
          current = await tenantDb.customer.count({ where: { tenantId, isBlacklisted: false } });
        }
      } catch { /* ignore — استفاده از 0 */ }
    }

    const remaining = limit > 0 ? Math.max(0, limit - current) : 999999;
    const percentUsed = limit > 0 ? Math.round((current / limit) * 100) : 0;

    return {
      allowed: limit === 0 ? true : current < limit,
      current,
      limit,
      resourceName: resourceType,
      resourceNameFa: defaults[resourceType].resourceNameFa,
      remaining,
      percentUsed,
    };
  } catch (error: any) {
    console.warn('[PlanLimits] checkPlanLimit error:', error.message);
    return defaults[resourceType] || defaults.products;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  بررسی همه محدودیت‌ها (Full Limit Check)
// ═══════════════════════════════════════════════════════════════════════

export async function checkAllLimits(tenantId: string): Promise<FullLimitCheck> {
  const [users, products, invoices, customers, subscription] = await Promise.all([
    checkPlanLimit(tenantId, 'users'),
    checkPlanLimit(tenantId, 'products'),
    checkPlanLimit(tenantId, 'invoices'),
    checkPlanLimit(tenantId, 'customers'),
    checkSubscriptionStatus(tenantId),
  ]);

  return {
    users,
    products,
    invoices,
    customers,
    subscription,
    overallAllowed: subscription.isActive && users.allowed && products.allowed && invoices.allowed && customers.allowed,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  اعمال محدودیت (Enforce Plan Limit)
// ═══════════════════════════════════════════════════════════════════════

export async function enforcePlanLimit(
  tenantId: string,
  resourceType: 'users' | 'products' | 'invoices' | 'customers',
  currentCount?: number
): Promise<{ allowed: boolean; limit: number; current: number; message?: string }> {
  const result = await checkPlanLimit(tenantId, resourceType, currentCount);

  if (!result.allowed) {
    return {
      allowed: false,
      limit: result.limit,
      current: result.current,
      message: `سقف ${result.resourceNameFa} (${result.limit}) تکمیل شده است. لطفاً پلن خود را ارتقا دهید.`,
    };
  }

  return {
    allowed: true,
    limit: result.limit,
    current: result.current,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  دریافت اطلاعات پلن Tenant — ★★★ v9.6.0 به‌روز شده
// ═══════════════════════════════════════════════════════════════════════

export async function getTenantPlanInfo(tenantId: string): Promise<TenantPlanInfo> {
  const status = await checkSubscriptionStatus(tenantId);
  const limits = getPlanLimits(status.tierName);

  return {
    tierName: status.tierName,
    tierNameFa: status.tierNameFa,
    billingCycle: status.billingCycle,
    isTrial: false,
    isExpired: status.isExpired,
    isActive: status.isActive,
    daysRemaining: status.daysRemaining,
    maxUsers: limits.maxUsers,
    maxProducts: limits.maxProducts,
    maxInvoices: limits.maxInvoices,
    maxCustomers: limits.maxCustomers,
    dbType: 'shared',
    planTierId: status.planTierId,
    expiresAt: status.expiresAt,
    isLifetime: status.isLifetime || false,
    // ★★★ v9.6.0: فیلدهای جدید
    status: status.status,
    canCreate: status.canCreate,
    canRead: status.canRead,
    message: status.message,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  گزینه‌های ارتقا (Upgrade Options)
// ═══════════════════════════════════════════════════════════════════════

export async function getUpgradeOptions(tenantId: string): Promise<UpgradeOption[]> {
  try {
    const status = await checkSubscriptionStatus(tenantId);
    const currentTierIndex = ['simple', 'professional', 'enterprise'].indexOf(status.tierName);
    const options: UpgradeOption[] = [];

    const tiers = ['simple', 'professional', 'enterprise'];
    const cycles: BillingCycle[] = ['annual', 'lifetime'];

    for (let i = currentTierIndex + 1; i < tiers.length; i++) {
      const tierName = tiers[i];
      const limits = getPlanLimits(tierName);
      const faInfo = TIER_FA_INFO[tierName];

      for (const cycle of cycles) {
        const durationDays = getBillingDurationDays(cycle);
        const price = getPlanPrice(tierName, cycle);

        options.push({
          tierName,
          tierNameFa: faInfo.nameFa,
          billingCycle: cycle,
          price,
          durationDays,
          features: limits.features,
        });
      }
    }

    return options;
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  گزینه‌های تمدید (Renew Options)
// ═══════════════════════════════════════════════════════════════════════

export async function getRenewOptions(tenantId: string): Promise<RenewOption[]> {
  try {
    const status = await checkSubscriptionStatus(tenantId);
    const faInfo = TIER_FA_INFO[status.tierName];
    const options: RenewOption[] = [];

    if (status.isLifetime) {
      return [];
    }

    const cycles: BillingCycle[] = ['annual', 'lifetime'];

    for (const cycle of cycles) {
      const durationDays = getBillingDurationDays(cycle);
      const price = getPlanPrice(status.tierName, cycle);
      const tenYearAnnual = faInfo.annualPrice * 10;
      const discount = cycle === 'lifetime' && tenYearAnnual > 0
        ? Math.round((1 - price / tenYearAnnual) * 100)
        : 0;

      options.push({
        tierName: status.tierName,
        tierNameFa: faInfo.nameFa,
        billingCycle: cycle,
        price,
        durationDays,
        discount,
      });
    }

    return options;
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  ارتقا پلن (Upgrade Plan)
// ═══════════════════════════════════════════════════════════════════════

export async function upgradePlan(
  tenantId: string,
  newTierName: string,
  newBillingCycle: BillingCycle
): Promise<{ success: boolean; error?: string }> {
  try {
    const { db } = await import('@/lib/db');

    let planTierId: number | null = null;
    let durationDays = 365;

    try {
      const planTier = await db.client.planTier.findFirst({
        where: { name: newTierName, isActive: true },
      });
      if (planTier) {
        planTierId = planTier.id;

        try {
          const price = await db.client.planPrice.findUnique({
            where: {
              planTierId_billingCycle: {
                planTierId: planTier.id,
                billingCycle: newBillingCycle,
              },
            },
          });
          if (price) durationDays = price.durationDays;
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    const now = new Date();
    const isLifetime = isLifetimeCycle(newBillingCycle) || durationDays === 0;
    const expiresAt = isLifetime ? null : new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    console.log('[PlanLimits] upgradePlan:', {
      tenantId,
      newTierName,
      newBillingCycle,
      durationDays,
      isLifetime,
      expiresAt: expiresAt ? expiresAt.toISOString() : 'null (lifetime)',
    });

    const updateData: any = {
      planName: `${newTierName}_${newBillingCycle}`,
      soldAt: now,
      expiresAt,
    };

    if (planTierId) {
      updateData.planTierId = planTierId;
      updateData.billingCycle = newBillingCycle;
    }

    await db.client.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    return { success: true };
  } catch (error: any) {
    console.error('[PlanLimits] upgradePlan error:', error.message);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  تمدید اشتراک (Renew Subscription)
// ═══════════════════════════════════════════════════════════════════════

export async function renewSubscription(
  tenantId: string,
  billingCycle: BillingCycle
): Promise<{ success: boolean; error?: string }> {
  try {
    const { db } = await import('@/lib/db');
    const tenant = await db.client.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant) return { success: false, error: 'فروشگاه یافت نشد' };

    let tierName = 'simple';
    if (tenant.planTierId) {
      try {
        const planTier = await db.client.planTier.findUnique({
          where: { id: tenant.planTierId },
        });
        if (planTier) tierName = planTier.name;
      } catch { /* ignore */ }
    } else if (tenant.planName) {
      tierName = parseLegacyPlanName(tenant.planName).tierName;
    }

    return upgradePlan(tenantId, tierName, billingCycle);
  } catch (error: any) {
    console.error('[PlanLimits] renewSubscription error:', error.message);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  تنظیم پلن اولیه (Set Initial Plan)
// ═══════════════════════════════════════════════════════════════════════

export async function setInitialPlan(
  tenantId: string,
  tierName: string,
  billingCycle: BillingCycle = 'annual'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { db } = await import('@/lib/db');

    let planTierId: number | null = null;
    let durationDays = 365;

    try {
      const planTier = await db.client.planTier.findFirst({
        where: { name: tierName, isActive: true },
      });
      if (planTier) {
        planTierId = planTier.id;

        try {
          const price = await db.client.planPrice.findUnique({
            where: {
              planTierId_billingCycle: {
                planTierId: planTier.id,
                billingCycle,
              },
            },
          });
          if (price) durationDays = price.durationDays;
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    const now = new Date();
    const isLifetime = isLifetimeCycle(billingCycle) || durationDays === 0;
    const expiresAt = isLifetime ? null : new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const updateData: any = {
      planName: `${tierName}_${billingCycle}`,
      soldAt: now,
      expiresAt,
    };

    if (planTierId) {
      updateData.planTierId = planTierId;
      updateData.billingCycle = billingCycle;
    }

    await db.client.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    return { success: true };
  } catch (error: any) {
    console.error('[PlanLimits] setInitialPlan error:', error.message);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  دریافت پلن‌ها با قیمت‌ها (Get All Plans With Prices)
// ═══════════════════════════════════════════════════════════════════════

export interface PlanWithPrices {
  id: number;
  name: string;
  nameFa: string;
  description: string;
  price: number;
  dbType: string;
  isTrial: boolean;
  trialDays: number;
  maxUsers: number;
  maxProducts: number;
  maxInvoices: number;
  isActive: boolean;
  prices: {
    billingCycle: BillingCycle;
    price: number;
    durationDays: number;
    discount: number;
  }[];
}

export async function getAllPlansWithPrices(dbClient?: any): Promise<PlanWithPrices[]> {
  const results: PlanWithPrices[] = [];

  if (dbClient) {
    try {
      const tiers = await dbClient.planTier.findMany({
        where: { isActive: true },
        include: { prices: true },
        orderBy: { id: 'asc' },
      });

      if (tiers && tiers.length > 0) {
        for (const tier of tiers) {
          const limitInfo = PLAN_LIMITS[tier.name] || PLAN_LIMITS.simple;
          const faInfo = TIER_FA_INFO[tier.name] || { nameFa: tier.nameFa || tier.name, description: '', monthlyPrice: 0, annualPrice: 0 };

          const prices = (tier.prices || []).map((p: any) => ({
            billingCycle: p.billingCycle as BillingCycle,
            price: p.price || 0,
            durationDays: p.durationDays || getBillingDurationDays(p.billingCycle as BillingCycle),
            discount: p.discount || 0,
          }));

          results.push({
            id: tier.id,
            name: tier.name,
            nameFa: tier.nameFa || faInfo.nameFa,
            description: tier.description || faInfo.description,
            price: faInfo.monthlyPrice,
            dbType: 'shared',
            isTrial: false,
            trialDays: 0,
            maxUsers: tier.maxUsers || limitInfo.maxUsers,
            maxProducts: tier.maxProducts || limitInfo.maxProducts,
            maxInvoices: tier.maxInvoices || limitInfo.maxInvoices,
            isActive: tier.isActive ?? true,
            prices,
          });
        }
        return results;
      }
    } catch (err: any) {
      console.warn('[PlanLimits] Failed to load from DB, using defaults:', err.message);
    }
  }

  let id = 1;
  for (const [name, limit] of Object.entries(PLAN_LIMITS)) {
    const faInfo = TIER_FA_INFO[name];
    const cycles: BillingCycle[] = ['annual', 'lifetime'];

    const prices = cycles.map((cycle) => {
      const durationDays = getBillingDurationDays(cycle);
      const price = getPlanPrice(name, cycle);
      const tenYearAnnual = faInfo.annualPrice * 10;
      const discount = cycle === 'lifetime' && tenYearAnnual > 0
        ? Math.round((1 - price / tenYearAnnual) * 100)
        : 0;
      return { billingCycle: cycle, price, durationDays, discount };
    });

    results.push({
      id: id++,
      name,
      nameFa: faInfo.nameFa,
      description: faInfo.description,
      price: faInfo.annualPrice,
      dbType: 'shared',
      isTrial: false,
      trialDays: 0,
      maxUsers: limit.maxUsers,
      maxProducts: limit.maxProducts,
      maxInvoices: limit.maxInvoices,
      isActive: true,
      prices,
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
//  تابع کمکی: آیا پلن پولی است؟
// ═══════════════════════════════════════════════════════════════════════

export function isPaidPlan(planName: string | null | undefined): boolean {
  if (!planName) return true;
  const paidPlans = ['simple', 'professional', 'enterprise'];
  return paidPlans.includes(planName.toLowerCase()) || planName.toLowerCase().includes('simple') || planName.toLowerCase().includes('professional') || planName.toLowerCase().includes('enterprise');
}