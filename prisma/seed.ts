// ============================================================================
// prisma/seed.ts — Base Data Seeder (v9.9.0 ★★★ BULLETPROOF CLEANUP)
// ============================================================================
// ★★★ v9.9.0: پاکسازی قطعی حساب‌های منسوخ
//   - حذف کامل حساب‌های قدیمی (1900, 1950, 6100, 6200) اگر سندی نداشته باشند
//   - غیرفعال‌سازی و تغییر نام به "[منسوخ]" اگر در اسناد استفاده شده باشند
//   - تضمین وجود حساب‌های جدید استاندارد (2150, 2160, 5160, 5170) با نوع صحیح
//   - آماده‌سازی نهایی برای Production
// ============================================================================

import { db } from '../src/lib/db'
import bcrypt from 'bcryptjs'

// ═══════════════════════════════════════════════════════════════
//  ۱. حساب‌های استاندارد (استاندارد حسابداری ایران)
// ═══════════════════════════════════════════════════════════════
const STANDARD_ACCOUNTS = [
  { code: '1010', name: 'صندوق فروشگاه', type: 'صندوق', level: 1 },
  { code: '1100', name: 'بانک', type: 'بانک', level: 1 },
  { code: '1200', name: 'موجودی کالا', type: 'موجودی', level: 1 },
  { code: '1300', name: 'حساب‌های دریافتنی', type: 'دریافتنی', level: 1 },
  { code: '1310', name: 'بدهکاران تجاری', type: 'دریافتنی', level: 2 },
  { code: '1350', name: 'چک‌های دریافتنی', type: 'دریافتنی', level: 2 },
  { code: '1500', name: 'پیش‌پرداخت‌ها', type: 'دارایی', level: 1 },
  { code: '1400', name: 'تجهیزات و اثاثیه', type: 'دارایی_ثابت', level: 1 },
  { code: '1401', name: 'استهلاک انباشته تجهیزات', type: 'کاهنده_دارایی', level: 2 }, 
  { code: '2000', name: 'حساب‌های پرداختنی', type: 'پرداختنی', level: 1 },
  { code: '2010', name: 'بستانکاران تجاری', type: 'پرداختنی', level: 2 },
  { code: '2050', name: 'چک‌های پرداختنی', type: 'پرداختنی', level: 2 },
  { code: '2100', name: 'وام بانکی', type: 'بدهی', level: 1 },
  { code: '2150', name: 'مالیات پرداختنی', type: 'بدهی', level: 1 },
  { code: '2160', name: 'مالیات بر ارزش افزوده', type: 'بدهی', level: 2 },
  { code: '2200', name: 'پیش‌دریافت‌ها', type: 'بدهی', level: 1 },
  { code: '3000', name: 'سرمایه مالک', type: 'سرمایه', level: 1 },
  { code: '3100', name: 'سود (زیان) انباشته', type: 'سرمایه', level: 1 },
  { code: '3200', name: 'برداشت مالک', type: 'سرمایه', level: 1 },
  { code: '4100', name: 'فروش کالا', type: 'درآمد', level: 1 },
  { code: '4200', name: 'درآمد خدمات', type: 'درآمد', level: 1 },
  { code: '5000', name: 'بهای تمام شده کالای فروش رفته', type: 'بهای_تمام_شده', level: 1 },
  { code: '5100', name: 'هزینه‌های اداری و تشکیلاتی', type: 'هزینه', level: 1 },
  { code: '5105', name: 'هزینه کارمزد درگاه پرداخت', type: 'هزینه', level: 2 },
  { code: '5106', name: 'هزینه کارمزد پلتفرم', type: 'هزینه', level: 2 },
  { code: '5110', name: 'حقوق و دستمزد', type: 'هزینه', level: 2 },
  { code: '5120', name: 'هزینه اجاره', type: 'هزینه', level: 2 },
  { code: '5130', name: 'هزینه انرژی (آب، برق، گاز)', type: 'هزینه', level: 2 },
  { code: '5140', name: 'هزینه تبلیغات و بازاریابی', type: 'هزینه', level: 2 },
  { code: '5150', name: 'هزینه استهلاک', type: 'هزینه', level: 2 },
  { code: '5160', name: 'هزینه تعمیرات و نگهداری', type: 'هزینه', level: 2 },
  { code: '5170', name: 'هزینه خدمات و متفرقه', type: 'هزینه', level: 2 },
  { code: '5200', name: 'هزینه مالیات و عوارض', type: 'هزینه', level: 1 },
] as const

// ═══════════════════════════════════════════════════════════════
//  ۲. لیست حساب‌های منسوخ که باید پاکسازی یا جایگزین شوند
// ═══════════════════════════════════════════════════════════════
const LEGACY_CODES_TO_CLEANUP = [
  { oldCode: '1900', newCode: '2150', newName: 'مالیات پرداختنی', newType: 'بدهی' },
  { oldCode: '1950', newCode: '2160', newName: 'مالیات بر ارزش افزوده', newType: 'بدهی' },
  { oldCode: '6100', newCode: '5160', newName: 'هزینه تعمیرات و نگهداری', newType: 'هزینه' },
  { oldCode: '6200', newCode: '5170', newName: 'هزینه خدمات و متفرقه', newType: 'هزینه' },
  { oldCode: '1000', newCode: '1010', newName: 'صندوق فروشگاه', newType: 'صندوق' },
]

// ═══════════════════════════════════════════════════════════════
//  ۳. PlanTiers & PlanPrices (بدون تغییر)
// ═══════════════════════════════════════════════════════════════
const PLAN_TIERS = [
  { name: 'trial', nameFa: 'تستی (دمو)', description: '۳ روز دسترسی رایگان', maxUsers: 2, maxProducts: 100, maxInvoices: 50, isTrial: true, trialDays: 3, dbType: 'shared', isActive: true, sortOrder: 0 },
  { name: 'simple', nameFa: 'پایه', description: 'حسابداری پایه، فروش نقدی', maxUsers: 2, maxProducts: 200, maxInvoices: 500, isTrial: false, trialDays: 0, dbType: 'shared', isActive: true, sortOrder: 1 },
  { name: 'professional', nameFa: 'پیشرفته', description: 'حسابداری دوطرفه کامل', maxUsers: 5, maxProducts: 2000, maxInvoices: 0, isTrial: false, trialDays: 0, dbType: 'shared', isActive: true, sortOrder: 2 },
  { name: 'enterprise', nameFa: 'حرفه‌ای', description: 'تمام موارد پیشرفته + شعب', maxUsers: 0, maxProducts: 0, maxInvoices: 0, isTrial: false, trialDays: 0, dbType: 'shared', isActive: true, sortOrder: 3 },
] as const

const PLAN_PRICES = {
  trial: { trial: { price: 0, durationDays: 3, discountPercent: 0 } },
  simple: { annual: { price: 1_590_000, durationDays: 365, discountPercent: 0 }, lifetime: { price: 16_000_000, durationDays: 0, discountPercent: 0 } },
  professional: { annual: { price: 2_760_000, durationDays: 365, discountPercent: 0 }, lifetime: { price: 28_000_000, durationDays: 0, discountPercent: 0 } },
  enterprise: { annual: { price: 3_550_000, durationDays: 365, discountPercent: 0 }, lifetime: { price: 36_000_000, durationDays: 0, discountPercent: 0 } },
} as const

async function upsertPlanTier(data: typeof PLAN_TIERS[number]) {
  const existing = await db.client.planTier.findUnique({ where: { name: data.name } })
  if (existing) {
    return db.client.planTier.update({ where: { id: existing.id }, data: { nameFa: data.nameFa, description: data.description, maxUsers: data.maxUsers, maxProducts: data.maxProducts, maxInvoices: data.maxInvoices, isTrial: data.isTrial, trialDays: data.trialDays, dbType: data.dbType, isActive: data.isActive, sortOrder: data.sortOrder } })
  }
  return db.client.planTier.create({ data: { ...data } })
}

async function upsertPlanPrice(planTierId: number, billingCycle: string, price: number, durationDays: number, discountPercent: number, isPopular: boolean) {
  const existing = await db.client.planPrice.findFirst({ where: { planTierId, billingCycle } })
  if (existing) {
    return db.client.planPrice.update({ where: { id: existing.id }, data: { price, durationDays, discountPercent, isActive: true, isPopular } })
  }
  return db.client.planPrice.create({ data: { planTierId, billingCycle, price, durationDays, discountPercent, isActive: true, isPopular } })
}

// ═══════════════════════════════════════════════════════════════
//  Main Execution
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('🌱 شروع seed داده‌های پایه (v9.9.0 Bulletproof Cleanup)...')
  console.log('━'.repeat(60))

  // ۰. ادمین کل
  const hashedPassword = await bcrypt.hash('Admin@123456', 10)
  await db.client.adminUser.upsert({
    where: { username: 'admin' },
    update: { role: 'SuperAdmin', isActive: true },
    create: { username: 'admin', password: hashedPassword, role: 'SuperAdmin', isActive: true },
  })

  // ۱. PlanTiers & Prices
  const tierMap = new Map<string, number>()
  for (const tier of PLAN_TIERS) {
    const created = await upsertPlanTier(tier)
    tierMap.set(tier.name, created.id)
  }
  for (const tierName of Object.keys(PLAN_PRICES) as Array<keyof typeof PLAN_PRICES>) {
    const tierId = tierMap.get(tierName)
    if (!tierId) continue
    for (const [cycle, data] of Object.entries(PLAN_PRICES[tierName])) {
      const isPopular = tierName === 'professional' && cycle === 'annual'
      await upsertPlanPrice(tierId, cycle, data.price, data.durationDays, data.discountPercent, isPopular)
    }
  }

  // پاکسازی پلن‌های منسوخ
  await db.client.planPrice.updateMany({ where: { billingCycle: { in: ['monthly', 'quarterly', 'semiannual'] } }, data: { isActive: false, isPopular: false } })
  const oldFreeTiers = await db.client.planTier.findMany({ where: { name: 'free' } })
  for (const old of oldFreeTiers) {
    await db.client.planPrice.deleteMany({ where: { planTierId: old.id } })
    await db.client.planTier.delete({ where: { id: old.id } })
  }

  // ۲. فروشگاه تستی
  const testTenant = await db.client.tenant.upsert({
    where: { subDomain: 'test-shop' },
    update: { planName: 'trial', billingCycle: 'trial', status: 'active' },
    create: { id: 'tenant-test-001', subDomain: 'test-shop', companyName: 'فروشگاه تستی نمونه', planName: 'trial', billingCycle: 'trial', status: 'active', ownerName: 'مدیر تستی', ownerMobile: '09120000000' },
  })
  const storeUserPassword = await bcrypt.hash('Test@123456', 10)
  await db.client.storeUser.upsert({
    where: { username_tenantId: { username: 'owner', tenantId: testTenant.id } },
    update: { role: 'Owner', isActive: true },
    create: { username: 'owner', password: storeUserPassword, role: 'Owner', tenantId: testTenant.id, isActive: true },
  })

  const units = [
    { name: 'عدد', nameFa: 'عدد', symbol: 'pcs', isDefault: true },
    { name: 'کیلوگرم', nameFa: 'کیلوگرم', symbol: 'kg', isDefault: false },
    { name: 'متر', nameFa: 'متر', symbol: 'm', isDefault: false },
    { name: 'لیتر', nameFa: 'لیتر', symbol: 'L', isDefault: false },
  ]
  for (const u of units) {
    const existingUnit = await db.client.unit.findFirst({ where: { symbol: u.symbol, tenantId: testTenant.id } })
    if (existingUnit) {
      await db.client.unit.update({ where: { id: existingUnit.id }, data: { name: u.name, nameFa: u.nameFa, isDefault: u.isDefault } })
    } else {
      await db.client.unit.create({ data: { ...u, tenantId: testTenant.id } }).catch(() => {})
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  ۳. پاکسازی قطعی حساب‌های منسوخ و ایجاد حساب‌های استاندارد
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📒 ۳. پاکسازی حساب‌های منسوخ و به‌روزرسانی حساب‌های استاندارد...')
  const allTenants = await db.client.tenant.findMany({ select: { id: true, companyName: true, subDomain: true, planName: true } })
  
  let totalCleaned = 0
  let totalCreated = 0
  let totalUpdated = 0

  for (const tenant of allTenants) {
    let cleanedInTenant = 0
    let createdInTenant = 0
    let updatedInTenant = 0

    // الف) پاکسازی حساب‌های قدیمی
    for (const legacy of LEGACY_CODES_TO_CLEANUP) {
      const oldAcc = await db.client.account.findFirst({ where: { code: legacy.oldCode, tenantId: tenant.id } })
      if (oldAcc) {
        // بررسی آیا این حساب در هیچ سندی استفاده شده است؟
        const usageCount = await db.client.journalEntryLine.count({ where: { accountId: oldAcc.id } })
        
        if (usageCount === 0) {
          // اگر استفاده نشده، کاملاً حذف کن تا لیست شلوغ نشود
          await db.client.account.delete({ where: { id: oldAcc.id } })
          cleanedInTenant++
        } else {
          // اگر استفاده شده، نام آن را تغییر بده و غیرفعال کن تا تاریخچه خراب نشود
          await db.client.account.update({
            where: { id: oldAcc.id },
            data: {
              code: `${legacy.oldCode}_DEPRECATED`,
              name: `⛔ [منسوخ] ${oldAcc.name}`,
              isActive: false,
            }
          })
          cleanedInTenant++
        }
      }
    }

    // ب) ایجاد یا به‌روزرسانی حساب‌های استاندارد جدید
    for (const acc of STANDARD_ACCOUNTS) {
      const existing = await db.client.account.findFirst({ where: { code: acc.code, tenantId: tenant.id } })
      if (existing) {
        if (existing.type !== acc.type || existing.name !== acc.name || existing.level !== acc.level) {
          await db.client.account.update({
            where: { id: existing.id },
            data: { type: acc.type, name: acc.name, level: acc.level, isActive: true },
          })
          updatedInTenant++
        }
      } else {
        await db.client.account.create({
          data: { code: acc.code, name: acc.name, type: acc.type, level: acc.level, tenantId: tenant.id, isActive: true },
        })
        createdInTenant++
      }
    }

    if (cleanedInTenant > 0 || createdInTenant > 0 || updatedInTenant > 0) {
      console.log(`   🏪 ${tenant.companyName.padEnd(25)} (${tenant.planName.padEnd(12)}) → 🗑️${cleanedInTenant} پاکسازی، +${createdInTenant} جدید، ~${updatedInTenant} به‌روز`)
    }
    
    totalCleaned += cleanedInTenant
    totalCreated += createdInTenant
    totalUpdated += updatedInTenant
  }

  // ─── ۴. خلاصه نهایی ─────────────────────────────────────────
  console.log('\n' + '━'.repeat(60))
  console.log('✅ Seed با موفقیت کامل شد! (v9.9.0)')
  console.log(`   🗑️ حساب‌های منسوخ پاکسازی/غیرفعال شده: ${totalCleaned}`)
  console.log(`   ➕ حساب‌های جدید ایجادشده: ${totalCreated}`)
  console.log(`   ✏️ حساب‌های به‌روزرسانی‌شده: ${totalUpdated}`)
  console.log('\n   ⚠️ مهم: لطاًً مرورگر خود را با Ctrl + F5 (Hard Refresh) رفرش کنید.')
  console.log('   💡 حساب‌های ۱۹۰۰ و ۱۹۵۰ اگر سندی نداشتند حذف، وگرنه به "[منسوخ]" تغییر نام یافتند.')
  console.log('   💡 حساب‌های ۲۱۵۰ و ۲۱۶۰ اکنون با نوع "بدهی" فعال هستند.')
  
  await db.client.$disconnect()
}

main().catch((e) => {
  console.error('❌ خطا در seed:', e)
  process.exit(1)
})