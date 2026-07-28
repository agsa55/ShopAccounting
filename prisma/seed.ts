// ============================================================================
// prisma/seed.ts — Base Data Seeder (v9.5.0 ★★★)
// ============================================================================
// ★★★ v9.5.0: تغییرات اساسی
//   - نام پلن‌ها: ساده→پایه، حرفه‌ای→پیشرفته، سازمانی→حرفه‌ای
//   - نام کد: basic → simple (fix برای bug قبلی)
//   - حذف پلن ماهانه — فقط سالانه + مادام‌العمر
//   - قیمت‌های جدید:
//       پایه      سالانه: ۱,۵۹۰,۰۰۰   مادام‌العمر: ۱۶,۰۰۰,۰۰۰
//       پیشرفته   سالانه: ۲,۷۶۰,۰۰۰   مادام‌العمر: ۲۸,۰۰۰,۰۰۰
//       حرفه‌ای   سالانه: ۳,۵۵۰,۰۰۰   مادام‌العمر: ۳۶,۰۰۰,۰۰۰
//   - استفاده از db.client (همان PrismaClient که در lib/db.ts است)
//
// ★ نحوه اجرا:
//   npx prisma db seed
//   یا
//   npx tsx prisma/seed.ts
// ============================================================================

import { db } from '../src/lib/db'

// ═══════════════════════════════════════════════════════════════
//  PlanTiers — ۳ پلن اصلی (v9.0: نام کد simple/professional/enterprise)
// ═══════════════════════════════════════════════════════════════

const PLAN_TIERS = [
  {
    name: 'simple',
    nameFa: 'پایه',
    description: 'حسابداری پایه، فقط فروش نقدی، مناسب خرده‌فروش‌های کوچک.',
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
    nameFa: 'پیشرفته',
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
    nameFa: 'حرفه‌ای',
    description: 'تمام موارد پیشرفته + حسابداری شعب و انبارهای متعدد، گزارش‌های تلفیقی، بستن خودکار سال مالی، اتصال به سامانه مودیان.',
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

// ═══════════════════════════════════════════════════════════════
//  PlanPrices — v9.0: فقط سالانه + مادام‌العمر
// ═══════════════════════════════════════════════════════════════

const PLAN_PRICES = {
  simple: {
    annual: { price: 1_590_000, durationDays: 365, discountPercent: 0 },
    lifetime: { price: 16_000_000, durationDays: 0, discountPercent: 0 },
  },
  professional: {
    annual: { price: 2_760_000, durationDays: 365, discountPercent: 0 },
    lifetime: { price: 28_000_000, durationDays: 0, discountPercent: 0 },
  },
  enterprise: {
    annual: { price: 3_550_000, durationDays: 365, discountPercent: 0 },
    lifetime: { price: 36_000_000, durationDays: 0, discountPercent: 0 },
  },
} as const

const POPULAR_PLAN = 'professional'
const POPULAR_CYCLE = 'annual'

// ═══════════════════════════════════════════════════════════════
//  Helper: upsert
// ═══════════════════════════════════════════════════════════════

async function upsertPlanTier(data: typeof PLAN_TIERS[number]) {
  const existing = await db.client.planTier.findUnique({ where: { name: data.name } })

  if (existing) {
    return db.client.planTier.update({
      where: { id: existing.id },
      data: {
        nameFa: data.nameFa,
        description: data.description,
        maxUsers: data.maxUsers,
        maxProducts: data.maxProducts,
        maxInvoices: data.maxInvoices,
        isTrial: data.isTrial,
        trialDays: data.trialDays,
        dbType: data.dbType,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
    })
  }

  return db.client.planTier.create({ data: { ...data } })
}

async function upsertPlanPrice(
  planTierId: number,
  billingCycle: string,
  price: number,
  durationDays: number,
  discountPercent: number,
  isPopular: boolean,
) {
  const existing = await db.client.planPrice.findFirst({
    where: { planTierId, billingCycle },
  })

  if (existing) {
    return db.client.planPrice.update({
      where: { id: existing.id },
      data: { price, durationDays, discountPercent, isActive: true, isPopular },
    })
  }

  return db.client.planPrice.create({
    data: {
      planTierId,
      billingCycle,
      price,
      durationDays,
      discountPercent,
      isActive: true,
      isPopular,
    },
  })
}

// ═══════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('🌱 شروع seed داده‌های پایه (v9.5.0)...')
  console.log('━'.repeat(50))

  // ─── ۱. PlanTiers ────────────────────────────────────────────
  console.log('\n📦 ۱. ساخت PlanTiers...')
  const tierMap = new Map<string, number>()

  for (const tier of PLAN_TIERS) {
    const created = await upsertPlanTier(tier)
    tierMap.set(tier.name, created.id)
    console.log(`   ✓ PlanTier: ${tier.name} (id: ${created.id}) — ${tier.nameFa}`)
  }

  // ★★★ v9.5.0: رفع نام کد قدیمی 'basic' → 'simple'
  const oldBasic = await db.client.planTier.findUnique({ where: { name: 'basic' } })
  if (oldBasic) {
    // ★ ابتدا قیمت‌های آن را به simple منتقل کن
    await db.client.planPrice.updateMany({
      where: { planTierId: oldBasic.id },
      data: { planTierId: tierMap.get('simple')! },
    })
    // ★ سپس tenant های آن را به simple منتقل کن
    await db.client.tenant.updateMany({
      where: { planTierId: oldBasic.id },
      data: { planTierId: tierMap.get('simple')! },
    })
    // ★ حذف tier قدیمی
    await db.client.planTier.delete({ where: { id: oldBasic.id } })
    console.log(`   ✓ ریکد قدیمی 'basic' → 'simple' منتقل و حذف شد`)
  }

  // ─── ۲. PlanPrices ───────────────────────────────────────────
  console.log('\n💰 ۲. ساخت PlanPrices...')

  for (const tierName of Object.keys(PLAN_PRICES) as Array<keyof typeof PLAN_PRICES>) {
    const tierId = tierMap.get(tierName)
    if (!tierId) {
      console.warn(`   ⚠ PlanTier یافت نشد: ${tierName}`)
      continue
    }

    const prices = PLAN_PRICES[tierName]

    // annual
    const isPopularAnnual = tierName === POPULAR_PLAN && 'annual' === POPULAR_CYCLE
    await upsertPlanPrice(tierId, 'annual', prices.annual.price, prices.annual.durationDays, prices.annual.discountPercent, isPopularAnnual)
    console.log(`   ✓ ${tierName}/annual: ${prices.annual.price.toLocaleString('fa-IR')} تومان (${prices.annual.durationDays} روز)${isPopularAnnual ? ' ★ محبوب' : ''}`)

    // lifetime
    await upsertPlanPrice(tierId, 'lifetime', prices.lifetime.price, prices.lifetime.durationDays, prices.lifetime.discountPercent, false)
    console.log(`   ✓ ${tierName}/lifetime: ${prices.lifetime.price.toLocaleString('fa-IR')} تومان (${prices.lifetime.durationDays === 0 ? 'نامحدود' : `${prices.lifetime.durationDays} روز`})`)
  }

  // ─── ۳. غیرفعال‌سازی پلن ماهانه قدیمی ─────────────────────────
  console.log('\n🧹 غیرفعال‌سازی پلن ماهانه قدیمی...')
  const monthlyResult = await db.client.planPrice.updateMany({
    where: { billingCycle: 'monthly' },
    data: { isActive: false, isPopular: false },
  })
  console.log(`   ✓ ${monthlyResult.count} رکورد ماهانه غیرفعال شد`)

  // ─── ۴. حذف پلن‌های قدیمی (free, trial, quarterly, semiannual) ─
  console.log('\n🧹 حذف پلن‌های قدیمی...')
  await db.client.planPrice.deleteMany({ where: { billingCycle: { in: ['quarterly', 'semiannual'] } } })

  const oldTiers = await db.client.planTier.findMany({ where: { name: { in: ['free', 'trial'] } } })
  for (const old of oldTiers) {
    await db.client.planPrice.deleteMany({ where: { planTierId: old.id } })
    await db.client.planTier.delete({ where: { id: old.id } })
    console.log(`   ✓ حذف شد: ${old.nameFa} (${old.name})`)
  }

  // ─── ۵. خلاصه ────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(50))
  console.log('📊 خلاصه نهایی:')

  const tiers = await db.client.planTier.findMany({
    include: { prices: { where: { isActive: true } } },
    orderBy: { sortOrder: 'asc' },
  })

  for (const t of tiers) {
    console.log(`   • ${t.name.padEnd(15)} → ${t.nameFa} (${t.prices.length} قیمت فعال)`)
    for (const p of t.prices) {
      const cycle = p.billingCycle === 'annual' ? 'سالانه' : p.billingCycle === 'lifetime' ? 'مادام‌العمر' : p.billingCycle
      console.log(`     - ${cycle}: ${p.price.toLocaleString('fa-IR')} ت${p.isPopular ? ' ★' : ''}`)
    }
  }

  console.log('\n✅ Seed با موفقیت کامل شد! (v9.5.0)')
  await db.client.$disconnect()
}

main().catch((e) => {
  console.error('❌ خطا در seed:', e)
  process.exit(1)
})
