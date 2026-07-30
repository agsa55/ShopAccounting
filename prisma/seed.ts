// ============================================================================
// prisma/seed.ts — Base Data Seeder (v9.6.0 ★★★ MERGED & OPTIMIZED)
// ============================================================================
// ★★★ v9.6.0: ادغام هوشمند
//   - حفظ منطق migration و قیمت‌های دقیق شما
//   - اضافه شدن پلن تستی (دمو) ۳ روزه رایگان
//   - اضافه شدن ادمین کل، حساب‌های استاندارد حسابداری و واحدهای اندازه‌گیری
//   - استفاده از db.client برای هماهنگی کامل با معماری پروژه
// ============================================================================

import { db } from '../src/lib/db'
import bcrypt from 'bcryptjs'

// ═══════════════════════════════════════════════════════════════
//  ۱. حساب‌های پیش‌فرض (استاندارد حسابداری ایران)
// ═══════════════════════════════════════════════════════════════
const DEFAULT_ACCOUNTS = [
  { code: '1010', name: 'صندوق فروشگاه', type: 'cash', level: 1 },
  { code: '1100', name: 'بانک', type: 'bank', level: 1 },
  { code: '1200', name: 'موجودی کالا', type: 'inventory', level: 1 },
  { code: '1300', name: 'حساب‌های دریافتنی', type: 'receivable', level: 1 },
  { code: '1310', name: 'بدهکاران تجاری', type: 'receivable', level: 2 },
  { code: '1350', name: 'چک‌های دریافتنی', type: 'receivable', level: 2 },
  { code: '1500', name: 'پیش‌پرداخت‌ها', type: 'asset', level: 1 },
  { code: '1400', name: 'تجهیزات', type: 'asset', level: 1 },
  { code: '1401', name: 'استهلاک انباشته تجهیزات', type: 'contra_asset', level: 2 },
  { code: '2000', name: 'حساب‌های پرداختنی', type: 'payable', level: 1 },
  { code: '2010', name: 'بستانکاران تجاری', type: 'payable', level: 2 },
  { code: '2050', name: 'چک‌های پرداختنی', type: 'payable', level: 2 },
  { code: '2150', name: 'مالیات پرداختنی', type: 'tax', level: 1 },
  { code: '2160', name: 'مالیات بر ارزش افزوده', type: 'tax', level: 2 },
  { code: '2200', name: 'پیش‌دریافت‌ها', type: 'liability', level: 1 },
  { code: '2100', name: 'وام بانکی', type: 'liability', level: 1 },
  { code: '3000', name: 'سرمایه مالک', type: 'equity', level: 1 },
  { code: '3100', name: 'سود انباشته', type: 'equity', level: 1 },
  { code: '3200', name: 'برداشت مالک', type: 'equity', level: 1 },
  { code: '4100', name: 'فروش کالا', type: 'revenue', level: 1 },
  { code: '4200', name: 'درآمد خدمات', type: 'service_revenue', level: 1 },
  { code: '5000', name: 'بهای تمام شده کالای فروش رفته', type: 'cogs', level: 1 },
  { code: '5100', name: 'هزینه‌های اداری', type: 'expense', level: 1 },
  { code: '5105', name: 'هزینه کارمزد درگاه', type: 'expense', level: 2 },
  { code: '5106', name: 'هزینه کارمزد پلتفرم', type: 'expense', level: 2 },
  { code: '5110', name: 'حقوق و دستمزد', type: 'expense', level: 2 },
  { code: '5120', name: 'هزینه اجاره', type: 'expense', level: 2 },
  { code: '5130', name: 'هزینه آب و برق و گاز', type: 'expense', level: 2 },
  { code: '5140', name: 'هزینه تبلیغات', type: 'expense', level: 2 },
  { code: '5150', name: 'هزینه استهلاک', type: 'expense', level: 2 },
  { code: '5200', name: 'هزینه مالیات', type: 'expense', level: 1 },
  { code: '6100', name: 'هزینه تعمیرات', type: 'expense', level: 1 },
  { code: '6200', name: 'هزینه خدمات', type: 'expense', level: 1 },
] as const

// ═══════════════════════════════════════════════════════════════
//  ۲. PlanTiers — شامل پلن تستی + ۳ پلن اصلی
// ═══════════════════════════════════════════════════════════════
const PLAN_TIERS = [
  {
    name: 'trial',
    nameFa: 'تستی (دمو)',
    description: '۳ روز دسترسی رایگان به تمام امکانات پلن پیشرفته برای ارزیابی سیستم.',
    maxUsers: 2,
    maxProducts: 100,
    maxInvoices: 50,
    isTrial: true,
    trialDays: 3,
    dbType: 'shared',
    isActive: true,
    sortOrder: 0,
  },
  {
    name: 'simple',
    nameFa: 'پایه',
    description: 'حسابداری پایه، فروش نقدی، مناسب خرده‌فروش‌های کوچک.',
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
    description: 'حسابداری دوطرفه کامل، ثبت خودکار بهای تمام شده، تراز آزمایشی، دفتر کل.',
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
    description: 'تمام موارد پیشرفته + حسابداری شعب و انبارهای متعدد، گزارش‌های تلفیقی، سامانه مودیان.',
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
//  ۳. PlanPrices — قیمت‌های دقیق شما + پلن تستی رایگان
// ═══════════════════════════════════════════════════════════════
const PLAN_PRICES = {
  trial: {
    trial: { price: 0, durationDays: 3, discountPercent: 0 },
  },
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
//  Helper Functions
// ═══════════════════════════════════════════════════════════════
async function upsertPlanTier(data: typeof PLAN_TIERS[number]) {
  const existing = await db.client.planTier.findUnique({ where: { name: data.name } })
  if (existing) {
    return db.client.planTier.update({
      where: { id: existing.id },
      data: {
        nameFa: data.nameFa, description: data.description, maxUsers: data.maxUsers,
        maxProducts: data.maxProducts, maxInvoices: data.maxInvoices, isTrial: data.isTrial,
        trialDays: data.trialDays, dbType: data.dbType, isActive: data.isActive, sortOrder: data.sortOrder,
      },
    })
  }
  return db.client.planTier.create({ data: { ...data } })
}

async function upsertPlanPrice(planTierId: number, billingCycle: string, price: number, durationDays: number, discountPercent: number, isPopular: boolean) {
  const existing = await db.client.planPrice.findFirst({ where: { planTierId, billingCycle } })
  if (existing) {
    return db.client.planPrice.update({
      where: { id: existing.id },
      data: { price, durationDays, discountPercent, isActive: true, isPopular },
    })
  }
  return db.client.planPrice.create({
    data: { planTierId, billingCycle, price, durationDays, discountPercent, isActive: true, isPopular },
  })
}

// ═══════════════════════════════════════════════════════════════
//  Main Execution
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('🌱 شروع seed داده‌های پایه (v9.6.0 Merged)...')
  console.log('━'.repeat(60))

  // ─── ۰. ساخت ادمین کل ───────────────────────────────────────
  console.log('\n👤 ۰. بررسی/ساخت کاربر ادمین کل...')
  const hashedPassword = await bcrypt.hash('Admin@123456', 10)
  await db.client.adminUser.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password: hashedPassword, role: 'SuperAdmin', isActive: true },
  })
  console.log('   ✓ ادمین کل آماده است (رمز: Admin@123456)')

  // ─── ۱. PlanTiers ────────────────────────────────────────────
  console.log('\n📦 ۱. ساخت/به‌روزرسانی PlanTiers...')
  const tierMap = new Map<string, number>()
  for (const tier of PLAN_TIERS) {
    const created = await upsertPlanTier(tier)
    tierMap.set(tier.name, created.id)
    console.log(`   ✓ PlanTier: ${tier.name.padEnd(12)} → ${tier.nameFa}`)
  }

  // ★★★ Migration: انتقال پلن قدیمی 'basic' به 'simple'
  const oldBasic = await db.client.planTier.findUnique({ where: { name: 'basic' } })
  if (oldBasic) {
    await db.client.planPrice.updateMany({ where: { planTierId: oldBasic.id }, data: { planTierId: tierMap.get('simple')! } })
    await db.client.tenant.updateMany({ where: { planName: 'basic' }, data: { planName: 'simple' } })
    await db.client.planTier.delete({ where: { id: oldBasic.id } })
    console.log('   ✓ ریکد قدیمی "basic" به "simple" منتقل و حذف شد.')
  }

  // ─── ۲. PlanPrices ───────────────────────────────────────────
  console.log('\n💰 ۲. ساخت/به‌روزرسانی PlanPrices...')
  for (const tierName of Object.keys(PLAN_PRICES) as Array<keyof typeof PLAN_PRICES>) {
    const tierId = tierMap.get(tierName)
    if (!tierId) continue

    const prices = PLAN_PRICES[tierName]
    for (const [cycle, data] of Object.entries(prices)) {
      const isPopular = tierName === POPULAR_PLAN && cycle === POPULAR_CYCLE
      await upsertPlanPrice(tierId, cycle, data.price, data.durationDays, data.discountPercent, isPopular)
      
      const cycleFa = cycle === 'annual' ? 'سالانه' : cycle === 'lifetime' ? 'مادام‌العمر' : 'تستی'
      const priceFa = data.price === 0 ? 'رایگان' : `${data.price.toLocaleString('fa-IR')} تومان`
      console.log(`   ✓ ${tierName.padEnd(12)} / ${cycleFa.padEnd(10)}: ${priceFa}${isPopular ? ' ★ محبوب' : ''}`)
    }
  }

  // ─── ۳. پاکسازی داده‌های منسوخ ───────────────────────────────
  console.log('\n🧹 ۳. پاکسازی پلن‌های منسوخ...')
  const monthlyResult = await db.client.planPrice.updateMany({
    where: { billingCycle: { in: ['monthly', 'quarterly', 'semiannual'] } },
    data: { isActive: false, isPopular: false },
  })
  console.log(`   ✓ ${monthlyResult.count} رکورد دوره‌ای منسوخ غیرفعال شد.`)

  // حذف پلن‌های قدیمی free (ما trial را نگه می‌داریم چون درخواست کردید)
  const oldFreeTiers = await db.client.planTier.findMany({ where: { name: 'free' } })
  for (const old of oldFreeTiers) {
    await db.client.planPrice.deleteMany({ where: { planTierId: old.id } })
    await db.client.planTier.delete({ where: { id: old.id } })
  }
  if (oldFreeTiers.length > 0) console.log('   ✓ پلن‌های "free" قدیمی حذف شدند.')

  // ─── ۴. فروشگاه تستی و داده‌های پایه ─────────────────────────
  console.log('\n🏪 ۴. ساخت فروشگاه تستی و داده‌های پایه...')
  const testTenant = await db.client.tenant.upsert({
    where: { subDomain: 'test-shop' },
    update: {},
    create: {
      id: 'tenant-test-001',
      subDomain: 'test-shop',
      companyName: 'فروشگاه تستی نمونه',
      planName: 'trial',
      billingCycle: 'trial',
      status: 'active',
      ownerName: 'مدیر تستی',
      ownerMobile: '09120000000',
    },
  })
  console.log('   ✓ فروشگاه تستی (test-shop) با پلن دمو ساخته شد.')

    // ★ ساخت کاربر Owner برای فروشگاه تستی (برای ورود به پنل)
  const storeUserPassword = await bcrypt.hash('Test@123456', 10);
  await db.client.storeUser.upsert({
    where: { username_tenantId: { username: 'owner', tenantId: testTenant.id } },
    update: {},
    create: {
      username: 'owner',
      password: storeUserPassword,
      role: 'Owner',
      tenantId: testTenant.id,
      isActive: true,
    },
  });
  console.log('   ✓ کاربر Owner برای فروشگاه تستی ساخته شد (رمز: Test@123456)');
  // درج حساب‌های استاندارد
  let createdAccounts = 0
  for (const acc of DEFAULT_ACCOUNTS) {
    try {
      await db.client.account.upsert({
        where: { code_tenantId: { code: acc.code, tenantId: testTenant.id } },
        update: {},
        create: { code: acc.code, name: acc.name, type: acc.type, level: acc.level, tenantId: testTenant.id, isActive: true },
      })
      createdAccounts++
    } catch (e) { /* نادیده گرفتن خطای تکراری */ }
  }
  console.log(`   ✓ ${createdAccounts} حساب استاندارد حسابداری ثبت شد.`)

  // درج واحدها
  const units = [
    { name: 'عدد', nameFa: 'عدد', symbol: 'pcs', isDefault: true },
    { name: 'کیلوگرم', nameFa: 'کیلوگرم', symbol: 'kg', isDefault: false },
    { name: 'متر', nameFa: 'متر', symbol: 'm', isDefault: false },
    { name: 'لیتر', nameFa: 'لیتر', symbol: 'L', isDefault: false },
  ]
  for (const u of units) {
    try {
      await db.client.unit.create({ data: { ...u, tenantId: testTenant.id } })
    } catch (e) { /* نادیده گرفتن خطای تکراری */ }
  }
  console.log('   ✓ واحدهای اندازه‌گیری پیش‌فرض ثبت شدند.')

  // ─── ۵. خلاصه ────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(60))
  console.log('✅ Seed با موفقیت کامل شد! (v9.6.0)')
  console.log('   💡 اکنون می‌توانید با کاربر admin / Admin@123456 وارد پنل شوید.')
  await db.client.$disconnect()
}

main().catch((e) => {
  console.error('❌ خطا در seed:', e)
  process.exit(1)
})