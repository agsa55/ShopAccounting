// ============================================================================
// src/lib/trial-manager.ts — Trial & Subscription Manager
// ShopAccounting v4.0 — Multi-tenant SaaS Platform
// ============================================================================
// آپدیت شده برای ساختار جدید PlanTier + PlanPrice
// همه توابع به plan-limits.ts دیلیگیت می‌کنند
// ★ سازگار با هر دو schema قدیمی و جدید ★
// ★ v7.1: استفاده از hasNewSchemaFields() بجای select: { planTierId: true }
//         که باعث prisma:error می‌شد ★
// ============================================================================

import {
  hasNewSchemaFields,
  checkSubscriptionStatus,
  checkPlanLimit,
  checkAllLimits,
  enforcePlanLimit,
  getTenantPlanInfo,
  getUpgradeOptions,
  getRenewOptions,
  upgradePlan,
  renewSubscription,
  setInitialPlan,
  parseLegacyPlanName,
  BILLING_CYCLE_LABELS,
  type SubscriptionStatusResult,
  type PlanLimitResult,
  type FullLimitCheck,
  type TenantPlanInfo,
  type UpgradeOption,
  type RenewOption,
  type BillingCycle,
} from './plan-limits';

// ═══════════════════════════════════════════════════════════════════════════════
// Re-export همه چیز از plan-limits
// ═══════════════════════════════════════════════════════════════════════════════
export {
  hasNewSchemaFields,
  checkSubscriptionStatus,
  checkPlanLimit,
  checkAllLimits,
  enforcePlanLimit,
  getTenantPlanInfo,
  getUpgradeOptions,
  getRenewOptions,
  upgradePlan,
  renewSubscription,
  setInitialPlan,
  parseLegacyPlanName,
  BILLING_CYCLE_LABELS,
};

export type {
  SubscriptionStatusResult,
  PlanLimitResult,
  FullLimitCheck,
  TenantPlanInfo,
  UpgradeOption,
  RenewOption,
  BillingCycle,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions — سطح بالاتر
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * بررسی انقضای اشتراک
 */
export async function isSubscriptionActive(tenantId: string): Promise<boolean> {
  const status = await checkSubscriptionStatus(tenantId);
  return status.isActive;
}

/**
 * بررسی منقضی شدن اشتراک
 */
export async function isSubscriptionExpired(tenantId: string): Promise<boolean> {
  const status = await checkSubscriptionStatus(tenantId);
  return status.isExpired;
}

/**
 * آیا tenant دوره آزمایشی دارد؟
 */
export async function isTrialTenant(tenantId: string): Promise<boolean> {
  const status = await checkSubscriptionStatus(tenantId);
  return status.isTrial;
}

/**
 * تعداد روزهای باقیمانده
 */
export async function getDaysRemaining(tenantId: string): Promise<number> {
  const status = await checkSubscriptionStatus(tenantId);
  return status.daysRemaining;
}

/**
 * آیا به سقف کاربر رسیده؟
 */
export async function hasReachedUserLimit(tenantId: string): Promise<boolean> {
  const result = await checkPlanLimit(tenantId, 'users');
  return !result.allowed;
}

/**
 * آیا به سقف محصول رسیده؟
 */
export async function hasReachedProductLimit(tenantId: string): Promise<boolean> {
  const result = await checkPlanLimit(tenantId, 'products');
  return !result.allowed;
}

/**
 * آیا به سقف فاکتور رسیده؟
 */
export async function hasReachedInvoiceLimit(tenantId: string): Promise<boolean> {
  const result = await checkPlanLimit(tenantId, 'invoices');
  return !result.allowed;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Usage Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * اطلاعات مصرف کاربران
 */
export async function getUserUsage(tenantId: string) {
  return checkPlanLimit(tenantId, 'users');
}

/**
 * اطلاعات مصرف محصولات
 */
export async function getProductUsage(tenantId: string) {
  return checkPlanLimit(tenantId, 'products');
}

/**
 * اطلاعات مصرف فاکتورها
 */
export async function getInvoiceUsage(tenantId: string) {
  return checkPlanLimit(tenantId, 'invoices');
}

/**
 * درصد مصرف هر منبع
 */
export async function getUsagePercentages(tenantId: string) {
  const [users, products, invoices] = await Promise.all([
    checkPlanLimit(tenantId, 'users'),
    checkPlanLimit(tenantId, 'products'),
    checkPlanLimit(tenantId, 'invoices'),
  ]);

  return {
    users: users.max > 0 ? Math.round((users.current / users.max) * 100) : 0,
    products: products.max > 0 ? Math.round((products.current / products.max) * 100) : 0,
    invoices: invoices.max > 0 ? Math.round((invoices.current / invoices.max) * 100) : 0,
    details: { users, products, invoices },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Warning Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * هشدار دوره آزمایشی — اگر ۳ روز یا کمتر باقی‌مانده
 */
export async function getTrialWarning(tenantId: string): Promise<{
  showWarning: boolean;
  message: string;
  daysRemaining: number;
} | null> {
  const status = await checkSubscriptionStatus(tenantId);

  if (!status.isTrial) return null;
  if (status.isExpired) return null;

  if (status.daysRemaining <= 3) {
    return {
      showWarning: true,
      message: `دوره آزمایشی شما ${status.daysRemaining} روز دیگر تمام می‌شود. لطفاً پلن خود را ارتقا دهید.`,
      daysRemaining: status.daysRemaining,
    };
  }

  return null;
}

/**
 * اعمال محدودیت دوره آزمایشی — بلاک عملیات اگر منقضی شده
 */
export async function enforceTrialLimit(tenantId: string): Promise<{
  allowed: boolean;
  error?: string;
  isTrial?: boolean;
  daysRemaining?: number;
}> {
  const status = await checkSubscriptionStatus(tenantId);

  if (status.isExpired) {
    return {
      allowed: false,
      error: status.isTrial
        ? 'دوره آزمایشی شما منقضی شده است. لطفاً پلن خود را ارتقا دهید.'
        : 'اشتراک شما منقضی شده است. لطفاً اشتراک خود را تمدید کنید.',
      isTrial: status.isTrial,
      daysRemaining: status.daysRemaining,
    };
  }

  return { allowed: true, isTrial: status.isTrial, daysRemaining: status.daysRemaining };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Backward Compatibility — سازگاری با کدهای قدیمی
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * بررسی انقضای اشتراک — نسخه سازگار با tenant-isolation قدیمی
 *
 * این تابع همان کار checkSubscriptionStatus را انجام می‌دهد ولی
 * خروجی آن با فرمت قدیمی (isActive, isTrial, daysRemaining, planName, message)
 * سازگار است تا کدهایی مثل tenant-isolation.ts بدون تغییر کار کنند.
 */
export async function checkSubscriptionExpiry(tenantId: string): Promise<{
  isActive: boolean;
  isTrial: boolean;
  daysRemaining: number;
  planName: string;
  planTierName: string;
  planTierNameFa: string;
  billingCycle: string;
  message: string;
}> {
  const status = await checkSubscriptionStatus(tenantId);

  return {
    isActive: status.isActive,
    isTrial: status.isTrial,
    daysRemaining: status.daysRemaining,
    planName: status.planTierName,          // backward compatible alias
    planTierName: status.planTierName,
    planTierNameFa: status.planTierNameFa,
    billingCycle: status.billingCycle,
    message: status.messageFa,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Admin Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * آمار کلی پلن‌ها — برای پنل ادمین
 * ★ سازگار با هر دو schema ★
 * ★ v7.1: استفاده از hasNewSchemaFields() بجای select: { planTierId: true } ★
 */
export async function getPlanStatistics() {
  try {
    const { db } = await import('./db');

    // ★ استفاده از hasNewSchemaFields() بجای کوئری مستقیم ★
    // این روش هیچ prisma:error تولید نمی‌کند
    const isNewSchema = await hasNewSchemaFields();

    if (!isNewSchema) {
      // Schema قدیمی: آمار از planName
      const tenants = await db.master.tenant.findMany({
        select: { planName: true, status: true, soldAt: true },
      });

      const activeTenants = tenants.filter(
        (t) => t.status === 'active'
      );

      return {
        totalTenants: tenants.length,
        activeTenants: activeTenants.length,
        expiredTenants: 0, // در schema قدیمی نمی‌توان دقیقاً محاسبه کرد
        tiers: [
          { id: 1, name: 'free', nameFa: 'رایگان', tenantCount: tenants.filter(t => t.planName?.startsWith('trial') || t.planName?.startsWith('free')).length, maxUsers: 1, maxProducts: 50, maxInvoices: 100 },
          { id: 2, name: 'simple', nameFa: 'ساده', tenantCount: tenants.filter(t => t.planName?.startsWith('simple')).length, maxUsers: 3, maxProducts: 500, maxInvoices: 1000 },
          { id: 3, name: 'professional', nameFa: 'حرفه‌ای', tenantCount: tenants.filter(t => t.planName?.startsWith('professional')).length, maxUsers: 10, maxProducts: 5000, maxInvoices: 10000 },
          { id: 4, name: 'enterprise', nameFa: 'سازمانی', tenantCount: tenants.filter(t => t.planName?.startsWith('enterprise') || t.planName?.startsWith('full_purchase')).length, maxUsers: 999, maxProducts: 99999, maxInvoices: 99999 },
        ],
        billingCycles: {
          monthly: tenants.filter(t => !t.planName?.includes('_') || t.planName?.endsWith('_monthly')).length,
          quarterly: tenants.filter(t => t.planName?.endsWith('_quarterly')).length,
          semiannual: tenants.filter(t => t.planName?.endsWith('_semiannual')).length,
          annual: tenants.filter(t => t.planName?.endsWith('_annual')).length,
        },
      };
    }

    // Schema جدید
    const tenants = await db.master.tenant.findMany({
      select: { planTierId: true, billingCycle: true, status: true, expiresAt: true } as any,
    });

    const tiers = await (db.master as any).planTier.findMany({
      where: { isActive: true },
      include: { _count: { select: { tenants: true } } },
    });

    const now = new Date();
    const activeTenants = tenants.filter(
      (t: any) => t.status === 'active' && t.expiresAt && new Date(t.expiresAt) > now
    );

    return {
      totalTenants: tenants.length,
      activeTenants: activeTenants.length,
      expiredTenants: tenants.filter(
        (t: any) => t.expiresAt && new Date(t.expiresAt) <= now
      ).length,
      tiers: tiers.map((tier: any) => ({
        id: tier.id,
        name: tier.name,
        nameFa: tier.nameFa,
        tenantCount: tier._count.tenants,
        maxUsers: tier.maxUsers,
        maxProducts: tier.maxProducts,
        maxInvoices: tier.maxInvoices,
      })),
      billingCycles: {
        monthly: tenants.filter((t: any) => t.billingCycle === 'monthly').length,
        quarterly: tenants.filter((t: any) => t.billingCycle === 'quarterly').length,
        semiannual: tenants.filter((t: any) => t.billingCycle === 'semiannual').length,
        annual: tenants.filter((t: any) => t.billingCycle === 'annual').length,
      },
    };
  } catch (error: any) {
    console.error('[TrialManager] getPlanStatistics error:', error.message);
    return null;
  }
}
