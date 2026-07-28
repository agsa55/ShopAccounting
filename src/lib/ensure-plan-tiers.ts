// ============================================================================
// src/lib/ensure-plan-tiers.ts — PlanTiers Auto-Seeder (v3.27 ★★★)
// ============================================================================
// ★★★ این ماژول تضمین می‌کند که PlanTiers و PlanPrices همیشه وجود دارند.
//
// در registration route قبل از ساخت Tenant صدا زده می‌شود:
//   await ensurePlanTiersExist()
//
// اگر PlanTiers وجود داشته باشند، سریع برمی‌گردد (یک query ساده count).
// اگر نباشند، فایل seed.ts را اجرا می‌کند.
//
// این روش تضمین می‌کند که حتی در دیتابیس کاملاً خالی، اولین ثبت‌نام
// بدون مشکل کار کند.
// ============================================================================

import { db } from '@/lib/db'

// ★ داده‌های پایه PlanTiers
const PLAN_TIERS_DATA = [
  {
    name: 'basic',
    nameFa: 'ساده',
    description: 'تک‌دفتری: فقط درآمد/هزینه، سود و زیان ساده، بدون بهای تمام شده خودکار، بدون مدیریت طلب و بدهی پیشرفته.',
    maxUsers: 2,
    maxProducts: 200,
    maxInvoices: 500,
    isTrial: false,
    trialDays: 0,
    dbType: 'shared',
    isActive: true,
    sortOrder: 1,
  },
  {
    name: 'professional',
    nameFa: 'حرفه‌ای',
    description: 'حسابداری دوطرفه کامل، ثبت خودکار بهای تمام شده، مدیریت طلب و بدهی، تراز آزمایشی، دفتر کل و روزنامه.',
    maxUsers: 5,
    maxProducts: 2000,
    maxInvoices: 0,
    isTrial: false,
    trialDays: 0,
    dbType: 'shared',
    isActive: true,
    sortOrder: 2,
  },
  {
    name: 'enterprise',
    nameFa: 'سازمانی',
    description: 'تمام موارد حرفه‌ای + حسابداری شعب و انبارهای متعدد، گزارش‌های تلفیقی، بستن خودکار سال مالی، اتصال به سامانه مودیان.',
    maxUsers: 0,
    maxProducts: 0,
    maxInvoices: 0,
    isTrial: false,
    trialDays: 0,
    dbType: 'shared',
    isActive: true,
    sortOrder: 3,
  },
] as const

// ★ قیمت‌ها برای هر پلن و cycle
const PLAN_PRICES_DATA: Record<
  string,
  { monthly: { price: number; durationDays: number }; annual: { price: number; durationDays: number } }
> = {
  basic: {
    monthly: { price: 390000, durationDays: 30 },
    annual: { price: 1790000, durationDays: 365 },
  },
  professional: {
    monthly: { price: 790000, durationDays: 30 },
    annual: { price: 2190000, durationDays: 365 },
  },
  enterprise: {
    monthly: { price: 1090000, durationDays: 30 },
    annual: { price: 2790000, durationDays: 365 },
  },
}

// ★ کش ساده برای جلوگیری از اجرای مکرر در یک session
let _ensured = false
let _ensuring: Promise<void> | null = null

/**
 * تضمین وجود PlanTiers و PlanPrices.
 *
 * در اولین فراخوانی، چک می‌کند:
 * ۱. اگر PlanTiers >= 3 رکورد دارد، سریع برمی‌گردد
 * ۲. اگر نبود، PlanTiers و PlanPrices را می‌سازد
 *
 * برای فراخوانی‌های بعدی در همان session، از کش استفاده می‌کند.
 *
 * @example
 * ```ts
 * await ensurePlanTiersExist()
 * // حالا مطمئن هستیم PlanTiers وجود دارد
 * const planTier = await db.client.planTier.findFirst({ where: { name: 'enterprise' } })
 * ```
 */
export async function ensurePlanTiersExist(): Promise<void> {
  // ★ اگر قبلاً چک شده، سریع برگردان
  if (_ensured) return

  // ★ اگر در حال اجراست، منتظر بمان
  if (_ensuring) {
    await _ensuring
    return
  }

  _ensuring = _doEnsure()
  try {
    await _ensuring
    _ensured = true
  } finally {
    _ensuring = null
  }
}

async function _doEnsure(): Promise<void> {
  try {
    const count = await db.client.planTier.count()

    if (count >= 3) {
      console.log('[EnsurePlanTiers] ✓ PlanTiers already exists:', count, 'records')
      return
    }

    console.log('[EnsurePlanTiers] ⚠ PlanTiers missing or incomplete. Seeding...')

    // ─── ساخت PlanTiers ────────────────────────────────────
    const tierMap = new Map<string, number>()

    for (const tier of PLAN_TIERS_DATA) {
      const existing = await db.client.planTier.findUnique({ where: { name: tier.name } })

      if (existing) {
        // به‌روزرسانی فیلدها در صورت نیاز
        await db.client.planTier.update({
          where: { id: existing.id },
          data: {
            nameFa: tier.nameFa,
            description: tier.description,
            maxUsers: tier.maxUsers,
            maxProducts: tier.maxProducts,
            maxInvoices: tier.maxInvoices,
            isTrial: tier.isTrial,
            trialDays: tier.trialDays,
            dbType: tier.dbType,
            isActive: tier.isActive,
            sortOrder: tier.sortOrder,
          },
        })
        tierMap.set(tier.name, existing.id)
        console.log(`[EnsurePlanTiers] ✓ Updated PlanTier: ${tier.name}`)
      } else {
        const created = await db.client.planTier.create({ data: { ...tier } })
        tierMap.set(tier.name, created.id)
        console.log(`[EnsurePlanTiers] ✓ Created PlanTier: ${tier.name} (id: ${created.id})`)
      }
    }

    // ─── ساخت PlanPrices ───────────────────────────────────
    for (const [tierName, prices] of Object.entries(PLAN_PRICES_DATA)) {
      const tierId = tierMap.get(tierName)
      if (!tierId) continue

      // monthly
      const existingMonthly = await db.client.planPrice.findFirst({
        where: { planTierId: tierId, billingCycle: 'monthly' },
      })
      if (existingMonthly) {
        await db.client.planPrice.update({
          where: { id: existingMonthly.id },
          data: {
            price: prices.monthly.price,
            durationDays: prices.monthly.durationDays,
            discountPercent: 0,
            isActive: true,
            isPopular: false,
          },
        })
      } else {
        await db.client.planPrice.create({
          data: {
            planTierId: tierId,
            billingCycle: 'monthly',
            price: prices.monthly.price,
            durationDays: prices.monthly.durationDays,
            discountPercent: 0,
            isActive: true,
            isPopular: false,
          },
        })
      }

      // annual (پلن professional/annual = محبوب)
      const isPopular = tierName === 'professional'
      const existingAnnual = await db.client.planPrice.findFirst({
        where: { planTierId: tierId, billingCycle: 'annual' },
      })
      if (existingAnnual) {
        await db.client.planPrice.update({
          where: { id: existingAnnual.id },
          data: {
            price: prices.annual.price,
            durationDays: prices.annual.durationDays,
            discountPercent: Math.round(
              (1 - prices.annual.price / (prices.monthly.price * 12)) * 100,
            ),
            isActive: true,
            isPopular,
          },
        })
      } else {
        await db.client.planPrice.create({
          data: {
            planTierId: tierId,
            billingCycle: 'annual',
            price: prices.annual.price,
            durationDays: prices.annual.durationDays,
            discountPercent: Math.round(
              (1 - prices.annual.price / (prices.monthly.price * 12)) * 100,
            ),
            isActive: true,
            isPopular,
          },
        })
      }
    }

    console.log('[EnsurePlanTiers] ✅ Seed completed successfully')
  } catch (error) {
    console.error('[EnsurePlanTiers] ❌ Error:', error)
    // مهم: خطا را پرتاب نکن — بگذار registration با خطای بعدی (PlanTier not found) برخورد کند
    // که پیام واضح‌تری به کاربر می‌دهد
    _ensured = false
  }
}

/**
 * helper برای گرفتن PlanTier بر اساس نام.
 * ابتدا ensurePlanTiersExist را صدا می‌زند، سپس query می‌کند.
 *
 * @example
 * ```ts
 * const planTier = await getPlanTierByName('enterprise')
 * if (!planTier) {
 *   return NextResponse.json({ error: 'پلن مورد نظر یافت نشد' }, { status: 400 })
 * }
 * ```
 */
export async function getPlanTierByName(name: string) {
  await ensurePlanTiersExist()
  return db.client.planTier.findUnique({
    where: { name },
    include: { prices: true },
  })
}

/**
 * helper برای گرفتن PlanTier و Price بر اساس نام و cycle.
 *
 * @example
 * ```ts
 * const { planTier, planPrice } = await getPlanTierWithPrice('enterprise', 'annual')
 * ```
 */
export async function getPlanTierWithPrice(name: string, billingCycle: 'monthly' | 'annual') {
  await ensurePlanTiersExist()
  const planTier = await db.client.planTier.findUnique({
    where: { name },
    include: {
      prices: { where: { billingCycle } },
    },
  })
  if (!planTier) return { planTier: null, planPrice: null }
  return { planTier, planPrice: planTier.prices[0] || null }
}
