// ============================================================================
// src/lib/subscription-utils.ts — Subscription Helper Functions (v9.1 ★★★)
// ShopAccounting — Utilities for renewal, upgrade, and applying payments
// ----------------------------------------------------------------------------
// این فایل شامل تمام منطق تجاری سیستم اشتراک است:
//   - calculateRenewalPrice: محاسبه قیمت تمدید/ارتقا
//   - getOrCreatePlanTier: یافتن/ایجاد PlanTier از روی نام
//   - createPendingSubscription: ایجاد رکورد Subscriptions و SubscriptionPayments
//   - applySubscriptionPayment: اعمال پرداخت موفق روی Tenant + Subscriptions
//
// ★★★ v9.1: FIX — re-export تایپ‌های BillingCycle و SubscriptionStatusResult
//   قبلاً این تایپ‌ها فقط از plan-limits.ts import می‌شدند ولی دوباره export
//   نمی‌شدند. فایل‌هایی مثل checkout/route.ts که می‌نوشتند:
//     import { type BillingCycle } from '@/lib/subscription-utils'
//   با این خطا مواجه می‌شدند:
//     "Module declares 'BillingCycle' locally, but it is not exported"
//   چون import به‌تنهایی یک type را عمومی (قابل import از بیرون) نمی‌کند.
//
// ★★★ v9.0: پشتیبانی از پلن مادام‌العمر (lifetime)
//   - در applySubscriptionPayment: اگر billingCycle='lifetime' است، expiresAt=null
//   - در createPendingSubscription: پشتیبانی از lifetime
//   - در getClientSubscriptionStatus: نمایش وضعیت مادام‌العمر
//   - default billingCycle: 'annual' (نه 'monthly')
//   - fallback billingCycle: 'annual' (نه 'monthly')
// ============================================================================

import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import {
  TIER_FA_INFO,
  getBillingDurationDays,
  isLifetimeCycle,  // ★★★ v9.0: helper جدید از plan-limits
  type BillingCycle,
  type SubscriptionStatusResult,
} from '@/lib/plan-limits'

// ★★★ v9.1: re-export این تایپ‌ها تا فایل‌های دیگر (مثل checkout/route.ts)
//   بتوانند آن‌ها را مستقیماً از subscription-utils.ts هم import کنند
export type { BillingCycle, SubscriptionStatusResult }

// ─── Types ────────────────────────────────────────────────────────────

export interface CheckoutRequest {
  tierName: 'simple' | 'professional' | 'enterprise'
  // ★★★ v9.0: اضافه شدن 'lifetime'
  billingCycle: 'annual' | 'lifetime'
  /** upgrade | renew | new — پیش‌فرض renew */
  action?: 'upgrade' | 'renew' | 'new'
}

export interface CheckoutResult {
  authority: string
  paymentUrl: string
  amount: number
  tierName: string
  billingCycle: BillingCycle
  description: string
  subscriptionPaymentId: string
}

export interface ApplyPaymentResult {
  success: boolean
  tenantId: string
  // ★★★ v9.0: newExpiresAt ممکن است null باشد (برای lifetime)
  newExpiresAt: Date | null
  newTierName: string
  newBillingCycle: BillingCycle
  // ★★★ v9.0: flag جدید برای مشخص کردن پلن مادام‌العمر
  isLifetime?: boolean
  subscriptionId?: string
  error?: string
}

// ─── Plan Tier Resolution ─────────────────────────────────────────────

/**
 * یافتن PlanTier از روی نام (simple/professional/enterprise)
 * اگر وجود نداشت، آن را ایجاد می‌کند (seed lazy)
 *
 * ★★★ توجه: PlanTier در schema فعلی فیلد maxCustomers ندارد، پس فقط فیلدهای موجود را ست می‌کنیم
 */
export async function getOrCreatePlanTier(
  tierName: string
): Promise<{ id: number; name: string; nameFa: string } | null> {
  try {
    // ۱. جستجو بر اساس نام
    let planTier = await db.client.planTier.findFirst({
      where: { name: tierName, isActive: true },
    })

    if (planTier) {
      return { id: planTier.id, name: planTier.name, nameFa: planTier.nameFa || planTier.name }
    }

    // ۲. اگر نبود، ایجاد کن
    const info = TIER_FA_INFO[tierName]
    if (!info) {
      console.error('[SubscriptionUtils] Unknown tier name:', tierName)
      return null
    }

    planTier = await db.client.planTier.create({
      data: {
        name: tierName,
        nameFa: info.nameFa,
        description: info.description,
        isActive: true,
        maxUsers: tierName === 'simple' ? 2 : tierName === 'professional' ? 5 : 0,
        maxProducts: tierName === 'simple' ? 200 : tierName === 'professional' ? 2000 : 0,
        maxInvoices: tierName === 'simple' ? 500 : 0,
        dbType: 'shared',
        isTrial: false,
        trialDays: 0,
        sortOrder: tierName === 'simple' ? 1 : tierName === 'professional' ? 2 : 3,
      },
    })

    console.log('[SubscriptionUtils] Created new PlanTier:', planTier.id, tierName)
    return { id: planTier.id, name: planTier.name, nameFa: planTier.nameFa }
  } catch (err: any) {
    console.error('[SubscriptionUtils] getOrCreatePlanTier error:', err?.message)
    return null
  }
}

// ─── Plans Resolution (for Subscriptions.planId FK) ───────────────────

/**
 * یافتن یا ایجاد رکورد Plans برای استفاده به‌عنوان planId در Subscriptions
 * این رکورد فقط برای برقراری FK constraint استفاده می‌شود
 */
export async function getOrCreatePlan(
  tierName: string,
  billingCycle: BillingCycle
): Promise<string | null> {
  try {
    const planName = `${tierName}_${billingCycle}`
    const info = TIER_FA_INFO[tierName]
    if (!info) return null

    // ۱. جستجو بر اساس نام
    let plan = await db.client.plans.findFirst({
      where: { name: planName },
    })

    if (plan) return plan.id

    // ۲. ایجاد
    // ★★★ v9.0: محاسبه قیمت بر اساس billingCycle (annual یا lifetime)
    const price = billingCycle === 'lifetime' ? info.lifetimePrice : info.annualPrice
    const durationDays = getBillingDurationDays(billingCycle)

    // ★★★ v9.0: label مناسب برای نام فارسی
    const cycleLabel = isLifetimeCycle(billingCycle) ? 'مادام‌العمر' : 'سالانه'

    plan = await db.client.plans.create({
      data: {
        id: randomUUID(),
        name: planName,
        nameFa: `${info.nameFa} (${cycleLabel})`,
        price,
        durationDays,
        maxUsers: tierName === 'simple' ? 2 : tierName === 'professional' ? 5 : 0,
        maxProducts: tierName === 'simple' ? 200 : tierName === 'professional' ? 2000 : 100,
        features: info.features?.join('|') || null,
        isActive: true,
        isTrial: false,
        trialDays: 0,
        requiresIsolatedDb: false,
        dbType: 'shared',
        autoDeleteOnExpiry: false,
        tier: tierName === 'simple' ? 'basic' : tierName,
        maxInvoices: tierName === 'simple' ? 500 : 100,
      },
    })

    console.log('[SubscriptionUtils] Created Plans record:', plan.id, planName)
    return plan.id
  } catch (err: any) {
    console.error('[SubscriptionUtils] getOrCreatePlan error:', err?.message)
    return null
  }
}

// ─── Price Calculation ────────────────────────────────────────────────

/**
 * محاسبه مبلغ قابل پرداخت برای تمدید یا ارتقا
 *
 * - renew: مبلغ کامل پلن و دوره انتخابی
 * - upgrade: مبلغ کامل جدید (نسخه اول؛ نسخه‌های بعدی می‌توانند تفاضلی محاسبه کنند)
 * - new: مبلغ کامل
 *
 * ★★★ v9.0: پشتیبانی از lifetime
 */
export function calculateCheckoutAmount(
  tierName: string,
  billingCycle: BillingCycle,
  _action: 'upgrade' | 'renew' | 'new' = 'renew'
): number {
  const info = TIER_FA_INFO[tierName]
  if (!info) {
    console.error('[SubscriptionUtils] Unknown tier name for pricing:', tierName)
    return 0
  }
  // ★★★ v9.0: lifetime → lifetimePrice، در غیر این صورت → annualPrice
  if (billingCycle === 'lifetime') return info.lifetimePrice
  return info.annualPrice
}

// ─── Create Pending Subscription (for checkout) ───────────────────────

/**
 * ایجاد یک رکورد Subscriptions با status='pending' + SubscriptionPayments مرتبط
 *
 * این رکورد قبل از ارسال به درگاه ایجاد می‌شود تا FK constraint برقرار باشد.
 * پس از verify موفق، status به 'active' تغییر می‌کند و تاریخ endDate به‌روزرسانی می‌شود.
 *
 * ★★★ v9.0: برای lifetime، endDate برابر null (یا یک تاریخ خیلی دور) است
 */
export async function createPendingSubscription(
  tenantId: string,
  tierName: string,
  billingCycle: BillingCycle,
  amount: number,
  authority: string
): Promise<{ subscriptionId: string; paymentId: string } | null> {
  try {
    const planId = await getOrCreatePlan(tierName, billingCycle)
    if (!planId) {
      console.error('[SubscriptionUtils] Failed to get/create plan for:', tierName, billingCycle)
      return null
    }

    const now = new Date()
    const durationDays = getBillingDurationDays(billingCycle)
    // ★★★ v9.0: برای lifetime، endDate برابر null (یا یک تاریخ خیلی دور ۱۰۰ سال بعد)
    //   چون فیلد endDate در DB ممکن است NOT NULL نباشد، یک تاریخ خیلی دور می‌ذاریم
    //   اما در Tenant.expiresAt آن را null می‌کنیم (در applySubscriptionPayment)
    const endDate = isLifetimeCycle(billingCycle) || durationDays === 0
      ? new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000)  // ★ ۱۰۰ سال بعد
      : new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)

    // ★ ۱. ایجاد Subscriptions با status='pending'
    const subscription = await db.client.subscriptions.create({
      data: {
        id: randomUUID(),
        tenantId,
        planId,
        startDate: now,
        endDate,
        status: 'pending',
        autoRenew: false,
      },
    })

    // ★ ۲. ایجاد SubscriptionPayments مرتبط
    const cycleLabel = isLifetimeCycle(billingCycle) ? 'مادام‌العمر' : 'سالانه'
    const paymentMethod = `zarinpal:tier=${tierName},cycle=${billingCycle}`

    const payment = await db.client.subscriptionPayments.create({
      data: {
        id: randomUUID(),
        subscriptionId: subscription.id,
        tenantId,
        amount,
        paymentMethod,
        paymentRef: authority, // ★ authority موقتاً در paymentRef ذخیره می‌شود
        isPaid: false,
        status: 'pending',
      },
    })

    console.log('[SubscriptionUtils] Created pending subscription:', {
      subscriptionId: subscription.id,
      paymentId: payment.id,
      tierName,
      billingCycle,
      amount,
      cycleLabel,
    })

    return { subscriptionId: subscription.id, paymentId: payment.id }
  } catch (err: any) {
    console.error('[SubscriptionUtils] createPendingSubscription error:', err?.message)
    return null
  }
}

// ─── Apply Successful Payment ─────────────────────────────────────────

/**
 * اعمال پرداخت موفق اشتراک روی دیتابیس
 *
 * مراحل:
 *   ۱. یافتن رکورد SubscriptionPayments با authority (در paymentRef)
 *   ۲. خواندن tierName و billingCycle از paymentMethod (با فرمت zarinpal:tier=X,cycle=Y)
 *   ۳. به‌روزرسانی SubscriptionPayments به status=paid + refId
 *   ۴. یافتن یا ایجاد PlanTier
 *   ۵. محاسبه تاریخ انقضای جدید:
 *      - اگر اشتراک قبلی Tenant هنوز فعال است: نقطه شروع = expiresAt قبلی
 *      - در غیر این صورت: نقطه شروع = now
 *   ۶. به‌روزرسانی Tenant: planTierId, billingCycle, expiresAt, planName, status=active
 *   ۷. به‌روزرسانی Subscriptions به status='active' + endDate جدید
 */
export async function applySubscriptionPayment(
  authority: string,
  refId: string | number,
  discountPercent: number = 0  // ★★★ v9.3: پارامتر جدید
): Promise<ApplyPaymentResult> {
  console.log('[SubscriptionUtils] applySubscriptionPayment start — authority:', authority)

  try {
    // ─── ۱. یافتن رکورد پرداخت ────────────────────────────────────
    const payment = await db.client.subscriptionPayments.findFirst({
      where: { paymentRef: authority },
    })

    if (!payment) {
      console.error('[SubscriptionUtils] Payment not found for authority:', authority)
      return {
        success: false,
        tenantId: '',
        newExpiresAt: null,
        newTierName: 'simple',
        newBillingCycle: 'annual',  // ★★★ v9.0: default 'annual' (نه 'monthly')
        isLifetime: false,
        error: 'PAYMENT_NOT_FOUND',
      }
    }

    if (payment.isPaid) {
      // ★ قبلاً پرداخت شده — idempotent return
      console.warn('[SubscriptionUtils] Payment already applied:', payment.id)
      const tenant = await db.client.tenant.findUnique({ where: { id: payment.tenantId } })
      // ★★★ v9.0: اگر tenant روی پلن مادام‌العمر است → newExpiresAt = null
      const isLifetime = isLifetimeCycle(tenant?.billingCycle)
      return {
        success: true,
        tenantId: payment.tenantId,
        newExpiresAt: isLifetime ? null : (tenant?.expiresAt ? new Date(tenant.expiresAt) : new Date()),
        newTierName: tenant?.planName || 'simple',
        newBillingCycle: (tenant?.billingCycle as BillingCycle) || 'annual',
        isLifetime,
        subscriptionId: payment.subscriptionId,
      }
    }

    // ─── ۲. خواندن tierName و billingCycle از paymentMethod ────────
    const tierName = extractTierFromPaymentMethod(payment.paymentMethod || '')
    // ★★★ v9.0: extractCycleFromPaymentMethod هم اکنون 'lifetime' را هم پشتیبانی می‌کند
    //   fallback 'annual' (نه 'monthly')
    const billingCycle = extractCycleFromPaymentMethod(payment.paymentMethod || '') || 'annual'

    console.log('[SubscriptionUtils] Parsed:', { tierName, billingCycle, tenantId: payment.tenantId })

    // ─── ۳. یافتن یا ایجاد PlanTier ────────────────────────────────
    const planTier = await getOrCreatePlanTier(tierName)
    if (!planTier) {
      return {
        success: false,
        tenantId: payment.tenantId,
        newExpiresAt: null,
        newTierName: tierName,
        newBillingCycle: billingCycle,
        isLifetime: isLifetimeCycle(billingCycle),
        error: 'PLAN_TIER_CREATION_FAILED',
      }
    }

    // ─── ۴. محاسبه تاریخ انقضای جدید ──────────────────────────────
    const tenant = await db.client.tenant.findUnique({
      where: { id: payment.tenantId },
    })

    if (!tenant) {
      return {
        success: false,
        tenantId: payment.tenantId,
        newExpiresAt: null,
        newTierName: tierName,
        newBillingCycle: billingCycle,
        isLifetime: isLifetimeCycle(billingCycle),
        error: 'TENANT_NOT_FOUND',
      }
    }

    const now = new Date()
    const durationDays = getBillingDurationDays(billingCycle)
    const currentExpiresAt = tenant.expiresAt ? new Date(tenant.expiresAt) : null

    // ★★★ v9.0: اگر پلن مادام‌العمر است → newExpiresAt = null
    const isLifetime = isLifetimeCycle(billingCycle) || durationDays === 0

    let newExpiresAt: Date | null
    if (isLifetime) {
      // ★ مادام‌العمر → بدون انقضا
      newExpiresAt = null
      console.log('[SubscriptionUtils] Lifetime plan → expiresAt = null')
    } else {
      // ★ پلن سالانه → ۳۶۵ روز از نقطه شروع
      //   اگر اشتراک قبلی Tenant هنوز فعال است، تمدید از تاریخ انقضای قبلی
      //   در غیر این صورت، از الان
      const startPoint = currentExpiresAt && currentExpiresAt > now ? currentExpiresAt : now
      newExpiresAt = new Date(startPoint.getTime() + durationDays * 24 * 60 * 60 * 1000)
      console.log('[SubscriptionUtils] Annual plan → expiresAt =', newExpiresAt.toISOString())
    }

    console.log('[SubscriptionUtils] Calculated new expiry:', {
      currentExpiresAt,
      durationDays,
      isLifetime,
      newExpiresAt: newExpiresAt ? newExpiresAt.toISOString() : 'null (lifetime)',
    })

      // ─── ۵. به‌روزرسانی Tenant ─────────────────────────────────────
    // ★★★ v9.3: اضافه شدن isPaid و paidAt برای سازگاری با trial-utils
    //   قبلاً این فیلدها آپدیت نمی‌شدند و isLifetime همیشه false محاسبه می‌شد
    //   که باعث قفل ماندن سیستم پس از پرداخت موفق می‌شد
    await db.client.tenant.update({
      where: { id: payment.tenantId },
      data: {
        planTierId: planTier.id,
        planName: tierName,
        billingCycle,
        expiresAt: newExpiresAt,
        status: 'active',
        // ★★★ v9.3: فیلدهای حیاتی برای تشخیص مادام‌العمر
        isPaid: true,
        paidAt: now,
        discountApplied: discountPercent || 0,
      },
    })

    console.log('[SubscriptionUtils] ✅ Tenant updated with isPaid=true')

    // ─── ۶. به‌روزرسانی SubscriptionPayments ──────────────────────
    await db.client.subscriptionPayments.update({
      where: { id: payment.id },
      data: {
        isPaid: true,
        status: 'paid',
        paidAt: now,
        paymentRef: String(refId), // ★ حالا refId واقعی زرین‌پال را ذخیره می‌کنیم
      },
    })

    // ─── ۷. به‌روزرسانی Subscriptions به status='active' ──────────
    try {
      // ★★★ v9.0: برای lifetime، endDate را هم null (یا تاریخ خیلی دور) می‌کنیم
      const subscriptionEndDate = isLifetime
        ? new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000)  // ★ ۱۰۰ سال بعد
        : newExpiresAt!

      await db.client.subscriptions.update({
        where: { id: payment.subscriptionId },
        data: {
          endDate: subscriptionEndDate,
          status: 'active',
        },
      })
      console.log('[SubscriptionUtils] Subscriptions updated to active:', payment.subscriptionId)
    } catch (subErr: any) {
      console.warn('[SubscriptionUtils] Failed to update Subscriptions status:', subErr?.message)
      // ★ Tenant به‌روزرسانی شده، این خطا نباید کل عملیات را fail کند
    }

    console.log('[SubscriptionUtils] Subscription applied successfully:', {
      tenantId: payment.tenantId,
      newExpiresAt: newExpiresAt ? newExpiresAt.toISOString() : 'null (lifetime)',
      tierName,
      billingCycle,
      isLifetime,
      subscriptionId: payment.subscriptionId,
    })

    return {
      success: true,
      tenantId: payment.tenantId,
      newExpiresAt,
      newTierName: tierName,
      newBillingCycle: billingCycle,
      isLifetime,
      subscriptionId: payment.subscriptionId,
    }
  } catch (error: any) {
    console.error('[SubscriptionUtils] applySubscriptionPayment error:', error)
    return {
      success: false,
      tenantId: '',
      newExpiresAt: null,
      newTierName: 'simple',
      newBillingCycle: 'annual',  // ★★★ v9.0: default 'annual' (نه 'monthly')
      isLifetime: false,
      error: error?.message || 'UNKNOWN_ERROR',
    }
  }
}

// ─── Helpers for parsing metadata from paymentMethod field ────────────

/**
 * از آنجا که در schema فعلی SubscriptionPayments فیلد metadata نداریم،
 * tierName و billingCycle را در paymentMethod با فرمت زیر ذخیره می‌کنیم:
 *   "zarinpal:tier=simple,cycle=monthly"
 */
export function buildPaymentMethodMetadata(tierName: string, billingCycle: BillingCycle): string {
  return `zarinpal:tier=${tierName},cycle=${billingCycle}`
}

export function extractTierFromPaymentMethod(paymentMethod: string): string {
  const match = paymentMethod.match(/tier=([a-z]+)/i)
  return match ? match[1].toLowerCase() : 'simple'
}

export function extractCycleFromPaymentMethod(paymentMethod: string): BillingCycle | null {
  // ★★★ v9.0: اضافه شدن 'lifetime' به الگو
  const match = paymentMethod.match(/cycle=(monthly|annual|lifetime)/i)
  if (!match) return null
  const cycle = match[1].toLowerCase() as BillingCycle
  // ★★★ v9.0: تبدیل 'monthly' قدیمی به 'annual'
  if (cycle === 'monthly') return 'annual'
  return cycle
}

// ─── Subscription Status for Client ───────────────────────────────────

export interface ClientSubscriptionStatus {
  isActive: boolean
  isExpired: boolean
  // ★★★ v9.0: -1 یعنی «نامحدود» (مادام‌العمر)
  daysRemaining: number
  tierName: string
  tierNameFa: string
  billingCycle: BillingCycle
  expiresAt: string | null  // ★★★ v9.0: null برای پلن مادام‌العمر
  startDate: string | null
  // ★ اطلاعات نمایشی
  // ★★★ v9.0: فقط annualPrice و lifetimePrice (monthlyPrice حذف شد)
  annualPrice: number
  lifetimePrice: number
  // ★ گزینه‌های تمدید/ارتقا
  canUpgrade: boolean
  nextTierName: string | null
  nextTierNameFa: string | null
  // ★★★ v9.0: flag جدید برای مشخص کردن پلن مادام‌العمر
  isLifetime?: boolean
  // ★★★ v9.0: backward compat — monthlyPrice = annualPrice
  monthlyPrice?: number
}

// ═══════════════════════════════════════════════════════════════
//  ★★★ v5.1.11: تابع حذف Tenant ناموفق (cleanupFailedRegistration)
//    این تابع وقتی صدا زده می‌شود که کاربر پرداخت را لغو کند یا خطا بدهد
//    و Tenant هنوز در حالت 'pending_payment' باشد
// ═══════════════════════════════════════════════════════════════

export async function cleanupFailedRegistration(tenantId: string): Promise<{ success: boolean; deletedRecords: number }> {
  console.log('[SubscriptionUtils] cleanupFailedRegistration start — tenantId:', tenantId)
  let deletedRecords = 0

  try {
    // ★ ۱. بررسی اینکه Tenant در حالت pending_payment است (نه active)
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true, subDomain: true, companyName: true },
    })

    if (!tenant) {
      console.warn('[SubscriptionUtils] Tenant not found:', tenantId)
      return { success: false, deletedRecords: 0 }
    }

    // ★ اگر Tenant فعال است، نباید حذف شود!
    if (tenant.status === 'active') {
      console.warn('[SubscriptionUtils] Tenant is active, not deleting:', tenantId)
      return { success: false, deletedRecords: 0 }
    }

    console.log('[SubscriptionUtils] Cleaning up pending Tenant:', {
      id: tenant.id,
      subDomain: tenant.subDomain,
      companyName: tenant.companyName,
      status: tenant.status,
    })

    // ★ ۲. حذف به ترتیب (به دلیل FK constraints)
    //   فقط جداولی که در زمان ثبت‌نام ایجاد می‌شوند

    try {
      const r = await db.client.subscriptionPayments.deleteMany({ where: { tenantId } })
      deletedRecords += r.count || 0
    } catch (err: any) {
      console.warn('[SubscriptionUtils] SubscriptionPayments delete error:', err?.message)
    }

    try {
      const r = await db.client.subscriptions.deleteMany({ where: { tenantId } })
      deletedRecords += r.count || 0
    } catch (err: any) {
      console.warn('[SubscriptionUtils] Subscriptions delete error:', err?.message)
    }

    try {
      const r = await db.client.userLookups.deleteMany({ where: { tenantId } })
      deletedRecords += r.count || 0
    } catch (err: any) {
      console.warn('[SubscriptionUtils] UserLookups delete error:', err?.message)
    }

    try {
      const r = await db.client.storeUser.deleteMany({ where: { tenantId } })
      deletedRecords += r.count || 0
    } catch (err: any) {
      console.warn('[SubscriptionUtils] StoreUser delete error:', err?.message)
    }

    // ★ ممکن است fiscal year هم ایجاد شده باشد (برای enterprise)
    try {
      const r = await db.client.fiscalYear.deleteMany({ where: { tenantId } })
      deletedRecords += r.count || 0
    } catch (err: any) {
      // ★ این جدول ممکن است وجود نداشته باشد در schema قدیمی
    }

    try {
      const r = await db.client.auditLogs.deleteMany({ where: { tenantId } })
      deletedRecords += r.count || 0
    } catch (err: any) {
      console.warn('[SubscriptionUtils] AuditLogs delete error:', err?.message)
    }

    // ★ ۳. حذف خود Tenant
    try {
      await db.client.tenant.delete({ where: { id: tenantId } })
      deletedRecords += 1
    } catch (err: any) {
      console.error('[SubscriptionUtils] Tenant delete error:', err?.message)
      return { success: false, deletedRecords }
    }

    console.log('[SubscriptionUtils] ✅ Tenant cleaned up successfully:', {
      tenantId,
      subDomain: tenant.subDomain,
      deletedRecords,
    })

    return { success: true, deletedRecords }
  } catch (error: any) {
    console.error('[SubscriptionUtils] cleanupFailedRegistration error:', error)
    return { success: false, deletedRecords }
  }
}

/**
 * تبدیل SubscriptionStatusResult از plan-limits.ts به فرمت مناسب برای کلاینت
 *
 * ★★★ v9.0: پشتیبانی از پلن مادام‌العمر
 */
export async function getClientSubscriptionStatus(
  tenantId: string,
  serverStatus?: SubscriptionStatusResult
): Promise<ClientSubscriptionStatus> {
  const status = serverStatus || await (async () => {
    const { checkSubscriptionStatus } = await import('@/lib/plan-limits')
    return checkSubscriptionStatus(tenantId)
  })()

  const info = TIER_FA_INFO[status.tierName]
  const tierOrder = ['simple', 'professional', 'enterprise']
  const currentIdx = tierOrder.indexOf(status.tierName)
  const nextTierName = currentIdx >= 0 && currentIdx < tierOrder.length - 1 ? tierOrder[currentIdx + 1] : null
  const nextInfo = nextTierName ? TIER_FA_INFO[nextTierName] : null

  // ★★★ v9.0: isLifetime از status می‌آید
  const isLifetime = status.isLifetime || isLifetimeCycle(status.billingCycle)

  return {
    isActive: status.isActive,
    isExpired: status.isExpired,
    daysRemaining: status.daysRemaining,  // ★ -1 برای lifetime
    tierName: status.tierName,
    tierNameFa: status.tierNameFa,
    billingCycle: status.billingCycle,
    expiresAt: status.expiresAt ? status.expiresAt.toISOString() : null,  // ★ null برای lifetime
    startDate: null,
    annualPrice: info?.annualPrice ?? 0,
    lifetimePrice: info?.lifetimePrice ?? 0,
    // ★★★ v9.0: backward compat — monthlyPrice = annualPrice
    monthlyPrice: info?.annualPrice ?? 0,
    canUpgrade: nextTierName !== null,
    nextTierName,
    nextTierNameFa: nextInfo?.nameFa || null,
    isLifetime,
  }
}
