// ============================================================================
// src/lib/plan-limits.ts — Plan Limits, Billing & Subscription Utilities (v9.0)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v9.0 — تغییرات اساسی:
//   ★ حذف پلن ماهانه — فقط annual (سالانه) و lifetime (مادام‌العمر)
//   ★ تغییر نام پلن‌ها:
//       ساده    → پایه
//       حرفه‌ای → پیشرفته
//       سازمانی → حرفه‌ای
//   ★ نام کد پلن‌ها ثابت ماند: simple / professional / enterprise
//   ★ قیمت‌گذاری واقعی (تومان):
//     - پایه:      سالانه ۱,۵۹۰,۰۰۰ / مادام‌العمر ۱۶,۰۰۰,۰۰۰
//     - پیشرفته:   سالانه ۲,۷۶۰,۰۰۰ / مادام‌العمر ۲۸,۰۰۰,۰۰۰
//     - حرفه‌ای:   سالانه ۳,۵۵۰,۰۰۰ / مادام‌العمر ۳۶,۰۰۰,۰۰۰
//   ★ پلن مادام‌العمر → expiresAt=null, daysRemaining=-1, isExpired=false
//
// ★★★ v3.0 — تغییرات قبلی:
//   ★ حذف پلن رایگان (free) — فقط simple, professional, enterprise
//   ★ حذف دوره‌های quarterly و semiannual
//   ★ همه پلن‌ها در بانک مشترک (dbType همیشه 'shared')
//   ★ حذف ارجاعات به tenant-provisioning و db-encrypt
// ============================================================================

// ═══════════════════════════════════════════════════════════════════════
//  ★★★ v9.0: helper تشخیص پلن مادام‌العمر
// ═══════════════════════════════════════════════════════════════════════

/**
 * تشخیص اینکه آیا یک دوره اشتراک مادام‌العمر است یا نه.
 * برای backward compatibility، رشته‌های فارسی «مادام‌العمر» و «مادام‌العمر » هم پذیرفته می‌شوند.
 */
export function isLifetimeCycle(cycle: string | null | undefined): boolean {
  if (!cycle) return false
  const lower = String(cycle).toLowerCase().trim()
  return lower === 'lifetime' || lower === 'مادام‌العمر' || lower === 'مادام‌العمر '
}

// ═══════════════════════════════════════════════════════════════════════
//  تایپ‌ها (Types)
// ═══════════════════════════════════════════════════════════════════════

/** دوره اشتراک — سالانه و مادام‌العمر (v9.0: حذف monthly، اضافه شدن lifetime) */
export type BillingCycle = 'monthly' | 'annual' | 'lifetime';
// ★★★ v9.0: 'monthly' فقط برای backward compatibility باقی مانده است.
//   در کد جدید فقط 'annual' و 'lifetime' استفاده می‌شود.
//   اگر مقدار 'monthly' خوانده شد، باید به 'annual' تبدیل شود.

export interface SubscriptionStatusResult {
  isActive: boolean;
  isTrial: boolean;       // ★ همیشه false در v3.0
  isExpired: boolean;
  daysRemaining: number;  // ★★★ v9.0: -1 یعنی «نامحدود» (مادام‌العمر)
  tierName: string;
  tierNameFa: string;
  billingCycle: BillingCycle;
  expiresAt: Date | null;  // ★★★ v9.0: null برای پلن مادام‌العمر
  planTierId: number | null;
  isIsolated: boolean;    // ★ همیشه false در v3.0
  dbName: string | null;  // ★ همیشه null در v3.0
  // ★★★ v9.0: flag جدید برای مشخص کردن پلن مادام‌العمر
  isLifetime?: boolean;
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

export interface TenantPlanInfo {
  tierName: string;
  tierNameFa: string;
  billingCycle: BillingCycle;
  isTrial: boolean;
  isExpired: boolean;
  isActive: boolean;
  daysRemaining: number;  // ★★★ v9.0: -1 یعنی «نامحدود» (مادام‌العمر)
  maxUsers: number;
  maxProducts: number;
  maxInvoices: number;
  maxCustomers: number;
  dbType: 'shared';
  planTierId: number | null;
  expiresAt: Date | null;  // ★★★ v9.0: null برای پلن مادام‌العمر
  // ★★★ v9.0: flag جدید برای مشخص کردن پلن مادام‌العمر
  isLifetime?: boolean;
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
    maxInvoices: 0, // ★★★ v3.2: 0 = نامحدود
    maxCustomers: 2000,
    dbType: 'shared',
    isTrial: false,
    trialDays: 0,
    features: ['تا ۵ کاربر', 'تا ۲,۰۰۰ محصول', 'فاکتور نامحدود', 'تا ۲,۰۰۰ مشتری', 'حسابداری دوطرفه', 'گزارشات مالی'],
  },
  enterprise: {
    tierName: 'enterprise',
    maxUsers: 0, // ★★★ v3.2: 0 = نامحدود
    maxProducts: 0, // ★★★ v3.2: 0 = نامحدود
    maxInvoices: 0, // ★★★ v3.2: 0 = نامحدود
    maxCustomers: 0, // ★★★ v3.2: 0 = نامحدود
    dbType: 'shared',
    isTrial: false,
    trialDays: 0,
    features: ['کاربر نامحدود', 'محصول نامحدود', 'فاکتور نامحدود', 'مشتری نامحدود', 'تمام امکانات', 'حسابداری شعب', 'اتصال مودیان'],
  },
};

// ─── اطلاعات فارسی پلن‌ها + قیمت‌گذاری واقعی (v9.0) ──────────────
// ★★★ v9.0: تغییر نام پلن‌ها + قیمت‌های جدید + حذف monthlyPrice واقعی
//   - 'monthlyPrice' فقط برای backward compatibility نگه داشته شده
//   - در کد جدید از 'annualPrice' و 'lifetimePrice' استفاده کنید

export const TIER_FA_INFO: Record<string, {
  nameFa: string;
  description: string;
  monthlyPrice: number;   // ★★★ v9.0: فقط برای backward compat — دیگر استفاده نمی‌شود
  annualPrice: number;
  lifetimePrice: number;  // ★★★ v9.0: جدید — قیمت مادام‌العمر
  features?: string[];
}> = {
  simple: {
    nameFa: 'پایه',          // ★★★ v9.0: «ساده» → «پایه»
    description: 'مناسب فروشگاه‌های کوچک — تا ۲ کاربر و ۲۰۰ محصول',
    monthlyPrice: 1590000,   // ★★★ v9.0: برابر با annualPrice (برای backward compat)
    annualPrice: 1590000,    // ★★★ v9.0: ۱,۵۹۰,۰۰۰ (قبلاً ۱,۷۹۰,۰۰۰)
    lifetimePrice: 16000000, // ★★★ v9.0: ۱۶,۰۰۰,۰۰۰
    features: ['تا ۲ کاربر', '۲۰۰ محصول', '۵۰۰ فاکتور', 'داشبورد مالی'],
  },
  professional: {
    nameFa: 'پیشرفته',       // ★★★ v9.0: «حرفه‌ای» → «پیشرفته»
    description: 'فروشگاه‌های متوسط — تا ۵ کاربر و ۲۰۰۰ محصول',
    monthlyPrice: 2760000,   // ★★★ v9.0: برابر با annualPrice
    annualPrice: 2760000,    // ★★★ v9.0: ۲,۷۶۰,۰۰۰ (قبلاً ۲,۱۹۰,۰۰۰)
    lifetimePrice: 28000000, // ★★★ v9.0: ۲۸,۰۰۰,۰۰۰
    features: ['تا ۵ کاربر', '۲۰۰۰ محصول', '۵۰۰۰ فاکتور', 'حسابداری دوطرفه', 'گزارشات مالی'],
  },
  enterprise: {
    nameFa: 'حرفه‌ای',        // ★★★ v9.0: «سازمانی» → «حرفه‌ای»
    description: 'کسب‌وکارهای بزرگ و سازمان‌ها',
    monthlyPrice: 3550000,   // ★★★ v9.0: برابر با annualPrice
    annualPrice: 3550000,    // ★★★ v9.0: ۳,۵۵۰,۰۰۰ (قبلاً ۲,۷۹۰,۰۰۰)
    lifetimePrice: 36000000, // ★★★ v9.0: ۳۶,۰۰۰,۰۰۰
    features: ['کاربر نامحدود', 'محصول نامحدود', 'فاکتور نامحدود', 'حسابداری شعب', 'اتصال مودیان'],
  },
};

// ★★★ برای backward compat (کدهایی که price می‌خوان، annualPrice رو میدیم — v9.0)
export const TIER_FA_INFO_COMPAT: Record<string, { nameFa: string; description: string; price: number; features?: string[] }> = {
  simple: { nameFa: 'پایه', description: TIER_FA_INFO.simple.description, price: TIER_FA_INFO.simple.annualPrice, features: TIER_FA_INFO.simple.features },
  professional: { nameFa: 'پیشرفته', description: TIER_FA_INFO.professional.description, price: TIER_FA_INFO.professional.annualPrice, features: TIER_FA_INFO.professional.features },
  enterprise: { nameFa: 'حرفه‌ای', description: TIER_FA_INFO.enterprise.description, price: TIER_FA_INFO.enterprise.annualPrice, features: TIER_FA_INFO.enterprise.features },
};

// ★ تخفیف دوره‌ها نسبت به ۱۰ سال اشتراک سالانه (v9.0)
//   - annual: تخفیف ندارد (قیمت پایه)
//   - lifetime: تخفیف نسبت به ۱۰ سال اشتراک سالانه
//   - monthly: برابر با annual (به‌خاطر حذف monthly در v9.0)
export const CYCLE_DISCOUNT: Record<BillingCycle, number> = {
  monthly: 0,
  annual: 0, // در قیمت‌گذاری واقعی، تخفیف در خود قیمت سالانه لحاظ شده
  lifetime: 0, // ★★★ v9.0: تخفیف مادام‌العمر در خود قیمت لحاظ شده
};

// ─── Billing Cycle Labels (v9.0) ──────────────────────────────────

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: 'سالانه',  // ★★★ v9.0: backward compat — monthly دیگر استفاده نمی‌شود
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

/**
 * تبدیل نام قدیمی پلن به فرمت جدید
 * ★★★ v9.0: تبدیل monthly → annual، پشتیبانی از lifetime
 * ★★★ v3.0: رایگان به ساده مپ می‌شه
 */
export function parseLegacyPlanName(planName: string): ParsedPlanName {
  // ★★★ v9.0: default 'annual' (نه 'monthly')
  if (!planName) return { tierName: 'simple', billingCycle: 'annual' };

  const lower = planName.toLowerCase();

  // ★ رایگان/trial → simple / annual
  if (lower === 'trial' || lower === 'free') {
    return { tierName: 'simple', billingCycle: 'annual' };
  }

  // ★ فرمت قدیمی: simple_monthly, professional_annual, etc
  if (planName.includes('_')) {
    const parts = planName.split('_');
    const tierName = parts[0];
    const cycle = parts[1] as string;
    const validTiers = ['simple', 'professional', 'enterprise'];
    // ★★★ v9.0: اضافه شدن 'lifetime' به دوره‌های معتبر
    const validCycles: BillingCycle[] = ['monthly', 'annual', 'lifetime'];

    // ★ قبول کردن دوره‌های قدیمی و تبدیل به نزدیک‌ترین
    //   v9.0: quarterly/semiannual → annual (نه monthly)
    if (cycle === 'quarterly' || cycle === 'semiannual') {
      return { tierName: validTiers.includes(tierName) ? tierName : 'simple', billingCycle: 'annual' };
    }

    // ★★★ v9.0: تبدیل monthly → annual (چون monthly دیگر پشتیبانی نمی‌شود)
    if (cycle === 'monthly') {
      return { tierName: validTiers.includes(tierName) ? tierName : 'simple', billingCycle: 'annual' };
    }

    if (validTiers.includes(tierName) && validCycles.includes(cycle as BillingCycle)) {
      return { tierName, billingCycle: cycle as BillingCycle };
    }
  }

  // ★ نام ساده پلن
  const validTiers = ['simple', 'professional', 'enterprise'];
  if (validTiers.includes(lower)) {
    // ★★★ v9.0: default 'annual' (نه 'monthly')
    return { tierName: lower, billingCycle: 'annual' };
  }

  // ★ فارسی — v9.0: نام‌های جدید و قدیمی
  if (lower.includes('پایه') || lower.includes('ساده')) return { tierName: 'simple', billingCycle: 'annual' };
  if (lower.includes('پیشرفته')) return { tierName: 'professional', billingCycle: 'annual' };
  // ★★★ v9.0: «حرفه‌ای» در نسخه جدید به enterprise اشاره دارد
  if (lower.includes('حرفه')) return { tierName: 'enterprise', billingCycle: 'annual' };
  if (lower.includes('سازمانی')) return { tierName: 'enterprise', billingCycle: 'annual' };

  // ★★★ v9.0: تشخیص lifetime از نام پلن
  if (lower.includes('lifetime') || lower.includes('مادام‌العمر')) {
    // تشخیص tier از نام
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

/** ★ در v3.0 همیشه false — دیگه دیتابیس اختصاصی نداریم */
export function planNeedsIsolation(_tierName: string): boolean {
  return false;
}

/**
 * تعداد روزهای یک دوره اشتراک
 * ★★★ v9.0: lifetime → 0 (یعنی «نامحدود» — باید در کد به‌عنوان نامحدود تفسیر شود)
 */
export function getBillingDurationDays(cycle: BillingCycle): number {
  switch (cycle) {
    case 'monthly': return 365;  // ★★★ v9.0: backward compat — monthly دیگر استفاده نمی‌شود، برابر annual
    case 'annual': return 365;
    case 'lifetime': return 0;   // ★★★ v9.0: 0 = نامحدود / بدون انقضا
    default: return 365;
  }
}

/** ★★★ v9.0: دریافت قیمت بر اساس پلن و دوره (پشتیبانی از lifetime) */
export function getPlanPrice(tierName: string, cycle: BillingCycle): number {
  const info = TIER_FA_INFO[tierName];
  if (!info) return 0;
  // ★★★ v9.0: lifetime → lifetimePrice، annual/monthly → annualPrice
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
//  بررسی وضعیت اشتراک (Subscription Status)
// ═══════════════════════════════════════════════════════════════════════

export async function checkSubscriptionStatus(tenantId: string): Promise<SubscriptionStatusResult> {
  const defaultResult: SubscriptionStatusResult = {
    isActive: true,
    isTrial: false,
    isExpired: false,
    // ★★★ v9.0: default -1 (نامحدود) برای حالت fallback — در عمل باید از tenant بخوانیم
    daysRemaining: -1,
    tierName: 'simple',
    tierNameFa: 'پایه',  // ★★★ v9.0: «ساده» → «پایه»
    billingCycle: 'annual',  // ★★★ v9.0: default 'annual' (نه 'monthly')
    expiresAt: null,
    planTierId: null,
    isIsolated: false,
    dbName: null,
    isLifetime: false,
  };

  try {
    const { db } = await import('@/lib/db');
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) return defaultResult;

    // ★★★ v9.0: تشخیص پلن مادام‌العمر
    const tenantBillingCycle = (tenant.billingCycle as BillingCycle) || 'annual'
    const isLifetime = isLifetimeCycle(tenantBillingCycle)

    let tierName = 'simple';
    let billingCycle: BillingCycle = tenantBillingCycle;
    let planTierId: number | null = null;
    let tierNameFa = 'پایه';  // ★★★ v9.0: default «پایه»

    // ★ اگر schema جدید فعال باشه، اطلاعات رو از PlanTier بخون
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
      // ★★★ v9.0: اگر tenant.billingCycle از نوع monthly است، به annual تبدیل کن
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
        isExpired: false,  // ★ مادام‌العمر هرگز منقضی نمی‌شود
        daysRemaining: -1, // ★ -1 = نامحدود
        tierName,
        tierNameFa,
        billingCycle: 'lifetime',
        expiresAt: null,   // ★ null برای مادام‌العمر
        planTierId,
        isIsolated: false,
        dbName: null,
        isLifetime: true,
      };
    }

    // ★★★ برای پلن‌های سالانه — منطق قبلی
    const now = new Date();
    const expiresAt = tenant.expiresAt ? new Date(tenant.expiresAt) : null;
    const isExpired = expiresAt ? expiresAt < now : false;
    const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 999;

    return {
      isActive: !isExpired,
      isTrial: false, // ★ همیشه false در v3.0
      isExpired,
      daysRemaining,
      tierName,
      tierNameFa,
      billingCycle,
      expiresAt,
      planTierId,
      isIsolated: false, // ★ همیشه false در v3.0
      dbName: null,      // ★ همیشه null در v3.0
      isLifetime: false,
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
        const tenantDb = db.client; // ★ در v3.0 همون client

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

    // ★★★ v3.2: اگه limit === 0 یعنی نامحدود — همیشه allowed
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
//  دریافت اطلاعات پلن Tenant
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
    // ★★★ v9.0: flag جدید برای مشخص کردن پلن مادام‌العمر
    isLifetime: status.isLifetime || false,
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
    // ★★★ v9.0: فقط annual و lifetime (نه monthly)
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

    // ★★★ v9.0: اگر tenant روی پلن مادام‌العمر است → فقط گزینه‌های ارتقا (نه تمدید)
    if (status.isLifetime) {
      // ★ مادام‌العمر نیاز به تمدید ندارد — گزینه خالی برگردان
      return [];
    }

    // ★★★ v9.0: فقط annual و lifetime (نه monthly)
    const cycles: BillingCycle[] = ['annual', 'lifetime'];

    for (const cycle of cycles) {
      const durationDays = getBillingDurationDays(cycle);
      const price = getPlanPrice(status.tierName, cycle);
      // ★★★ v9.0: محاسبه تخفیف نسبت به ۱۰ سال اشتراک سالانه (برای lifetime)
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
//  ارتقا پلن (Upgrade Plan) — ساده‌شده در v3.0
// ═══════════════════════════════════════════════════════════════════════

export async function upgradePlan(
  tenantId: string,
  newTierName: string,
  newBillingCycle: BillingCycle
): Promise<{ success: boolean; error?: string }> {
  try {
    const { db } = await import('@/lib/db');

    let planTierId: number | null = null;
    let durationDays = 365;  // ★★★ v9.0: default 365 (نه 30)

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

    // ★★★ v9.0: اگر پلن مادام‌العمر است → expiresAt = null
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
      expiresAt,  // ★★★ v9.0: null برای lifetime
    };

    if (planTierId) {
      updateData.planTierId = planTierId;
      updateData.billingCycle = newBillingCycle;
    }

    await db.client.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    // ★★★ v3.0: دیگه نیاز به provisioning نیست
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
  billingCycle: BillingCycle = 'annual'  // ★★★ v9.0: default 'annual' (نه 'monthly')
): Promise<{ success: boolean; error?: string }> {
  try {
    const { db } = await import('@/lib/db');

    let planTierId: number | null = null;
    let durationDays = 365;  // ★★★ v9.0: default 365 (نه 30)

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

    // ★★★ v9.0: اگر پلن مادام‌العمر است → expiresAt = null
    const now = new Date();
    const isLifetime = isLifetimeCycle(billingCycle) || durationDays === 0;
    const expiresAt = isLifetime ? null : new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const updateData: any = {
      planName: `${tierName}_${billingCycle}`,
      soldAt: now,
      expiresAt,  // ★★★ v9.0: null برای lifetime
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

  // Fallback: داده‌های محلی
  let id = 1;
  for (const [name, limit] of Object.entries(PLAN_LIMITS)) {
    const faInfo = TIER_FA_INFO[name];
    // ★★★ v9.0: فقط annual و lifetime (نه monthly)
    const cycles: BillingCycle[] = ['annual', 'lifetime'];

    const prices = cycles.map((cycle) => {
      const durationDays = getBillingDurationDays(cycle);
      const price = getPlanPrice(name, cycle);
      // ★★★ v9.0: تخفیف مادام‌العمر نسبت به ۱۰ سال اشتراک سالانه
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
      price: faInfo.annualPrice,  // ★★★ v9.0: price پیش‌فرض = annualPrice
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
//  ★ در v3.0 همیشه true (رایگان حذف شد)
// ═══════════════════════════════════════════════════════════════════════

export function isPaidPlan(planName: string | null | undefined): boolean {
  if (!planName) return true; // ★ پیش‌فرض: پولی
  const paidPlans = ['simple', 'professional', 'enterprise'];
  return paidPlans.includes(planName.toLowerCase()) || planName.toLowerCase().includes('simple') || planName.toLowerCase().includes('professional') || planName.toLowerCase().includes('enterprise');
}
