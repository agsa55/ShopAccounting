// ============================================================================
// scripts/seed-plans.ts — Seed PlanTier and PlanPrice tables
// ShopAccounting v9.0 — Unified Database
// ============================================================================
// ★★★ v9.0: تغییر ساختار پلن‌ها
//   - حذف پلن ماهانه
//   - فقط دو دوره: سالانه (۳۶۵ روز) + مادام‌العمر (نامحدود)
//   - تغییر نام پلن‌ها:
//       ساده    → پایه
//       حرفه‌ای → پیشرفته
//       سازمانی → حرفه‌ای
//   - نام کد پلن‌ها (name) ثابت می‌ماند تا با کد موجود سازگار باشد:
//       simple       → "پایه"
//       professional → "پیشرفته"
//       enterprise   → "حرفه‌ای"
//   - قیمت‌های جدید (تومان):
//       پایه      سالانه: ۱,۵۹۰,۰۰۰   مادام‌العمر: ۱۶,۰۰۰,۰۰۰
//       پیشرفته   سالانه: ۲,۷۶۰,۰۰۰   مادام‌العمر: ۲۸,۰۰۰,۰۰۰
//       حرفه‌ای   سالانه: ۳,۵۵۰,۰۰۰   مادام‌العمر: ۳۶,۰۰۰,۰۰۰
//
// ★ نحوه اجرا:
//   npx ts-node scripts/seed-plans.ts
//   یا
//   npx prisma db seed
//
// ★ پس از اجرای prisma db push یا migrate
// ============================================================================

// ★★★ v3.0: استفاده از require برای جلوگیری از خطای ts-node module resolution
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require('../src/generated/client')

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 شروع seed پلن‌ها (v9.0)...')

  // ═══════════════════════════════════════════════════════════════
  //  ۱. PlanTier — سه پلن: پایه، پیشرفته، حرفه‌ای
  //     (نام کد: simple / professional / enterprise — ثابت)
  // ═══════════════════════════════════════════════════════════════

  const planTiers = [
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
      description: 'حسابداری دوطرفه کامل، ثبت خودکار بهای تمام شده، مدیریت طلب و بدهی، تراز آزمایشی.',
      maxUsers: 5,
      maxProducts: 2000,
      maxInvoices: 0, // نامحدود
      isTrial: false,
      trialDays: 0,
      dbType: 'shared',
      isActive: true,
      sortOrder: 2,
    },
    {
      name: 'enterprise',
      nameFa: 'حرفه‌ای',
      description: 'تمام موارد پیشرفته + حسابداری شعب، گزارش‌های تلفیقی، بستن سال مالی، اتصال به مودیان.',
      maxUsers: 0, // نامحدود
      maxProducts: 0, // نامحدود
      maxInvoices: 0, // نامحدود
      isTrial: false,
      trialDays: 0,
      dbType: 'shared',
      isActive: true,
      sortOrder: 3,
    },
  ]

  console.log('📝 درج/به‌روزرسانی PlanTier ها...')

  for (const tier of planTiers) {
    const existing = await prisma.planTier.findUnique({
      where: { name: tier.name }
    })

    if (existing) {
      // ★ Update existing
      await prisma.planTier.update({
        where: { name: tier.name },
        data: tier,
      })
      console.log(`  ✓ آپدیت شد: ${tier.nameFa} (${tier.name})`)
    } else {
      // ★ Create new
      await prisma.planTier.create({ data: tier })
      console.log(`  ✓ ایجاد شد: ${tier.nameFa} (${tier.name})`)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  ۲. PlanPrice — برای هر پلن: سالانه + مادام‌العمر
  //     ★★★ v9.0: حذف پلن ماهانه، اضافه شدن پلن مادام‌العمر
  //
  //   قیمت‌ها (تومان):
  //     پایه      سالانه: ۱,۵۹۰,۰۰۰   مادام‌العمر: ۱۶,۰۰۰,۰۰۰
  //     پیشرفته   سالانه: ۲,۷۶۰,۰۰۰   مادام‌العمر: ۲۸,۰۰۰,۰۰۰
  //     حرفه‌ای   سالانه: ۳,۵۵۰,۰۰۰   مادام‌العمر: ۳۶,۰۰۰,۰۰۰
  //
  //   ★ durationDays:
  //     - سالانه: 365 (یک سال شمسی)
  //     - مادام‌العمر: 0 (یعنی بدون انقضا — در کد به‌عنوان نامحدود تفسیر می‌شود)
  // ═══════════════════════════════════════════════════════════════

  const PRICES: Record<string, { annual: number; lifetime: number }> = {
    simple: { annual: 1_590_000, lifetime: 16_000_000 },
    professional: { annual: 2_760_000, lifetime: 28_000_000 },
    enterprise: { annual: 3_550_000, lifetime: 36_000_000 },
  }

  console.log('💰 درج/به‌روزرسانی PlanPrice ها...')

  for (const tier of planTiers) {
    const tierRecord = await prisma.planTier.findUnique({
      where: { name: tier.name }
    })
    if (!tierRecord) continue

    const prices = PRICES[tier.name]

    // ─── سالانه (annual) ─────────────────────────────────────────
    const annualExisting = await prisma.planPrice.findUnique({
      where: {
        planTierId_billingCycle: {
          planTierId: tierRecord.id,
          billingCycle: 'annual',
        }
      }
    })

    if (annualExisting) {
      await prisma.planPrice.update({
        where: { id: annualExisting.id },
        data: {
          durationDays: 365,
          price: prices.annual,
          discountPercent: 0,
          isActive: true,
          isPopular: true, // ★ سالانه به‌عنوان "محبوب‌ترین"
        }
      })
      console.log(`  ✓ ${tier.nameFa} - سالانه: ${prices.annual.toLocaleString('fa-IR')} تومان (آپدیت)`)
    } else {
      await prisma.planPrice.create({
        data: {
          planTierId: tierRecord.id,
          billingCycle: 'annual',
          durationDays: 365,
          price: prices.annual,
          discountPercent: 0,
          isActive: true,
          isPopular: true,
        }
      })
      console.log(`  ✓ ${tier.nameFa} - سالانه: ${prices.annual.toLocaleString('fa-IR')} تومان (ایجاد)`)
    }

    // ─── مادام‌العمر (lifetime) ─────────────────────────────────
    // ★ durationDays = 0 → یعنی بدون انقضا
    const lifetimeExisting = await prisma.planPrice.findUnique({
      where: {
        planTierId_billingCycle: {
          planTierId: tierRecord.id,
          billingCycle: 'lifetime',
        }
      }
    })

    if (lifetimeExisting) {
      await prisma.planPrice.update({
        where: { id: lifetimeExisting.id },
        data: {
          durationDays: 0, // 0 = نامحدود
          price: prices.lifetime,
          discountPercent: 0,
          isActive: true,
          isPopular: false,
        }
      })
      console.log(`  ✓ ${tier.nameFa} - مادام‌العمر: ${prices.lifetime.toLocaleString('fa-IR')} تومان (آپدیت)`)
    } else {
      await prisma.planPrice.create({
        data: {
          planTierId: tierRecord.id,
          billingCycle: 'lifetime',
          durationDays: 0,
          price: prices.lifetime,
          discountPercent: 0,
          isActive: true,
          isPopular: false,
        }
      })
      console.log(`  ✓ ${tier.nameFa} - مادام‌العمر: ${prices.lifetime.toLocaleString('fa-IR')} تومان (ایجاد)`)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  ۳. حذف PlanTier های قدیمی (free, trial)
  // ═══════════════════════════════════════════════════════════════

  console.log('🧹 حذف پلن‌های قدیمی (free, trial)...')

  const oldTiers = await prisma.planTier.findMany({
    where: {
      name: { in: ['free', 'trial'] }
    }
  })

  for (const old of oldTiers) {
    // ★ اول قیمت‌ها رو حذف کن
    await prisma.planPrice.deleteMany({
      where: { planTierId: old.id }
    })
    // ★ بعد خود tier رو
    await prisma.planTier.delete({
      where: { id: old.id }
    })
    console.log(`  ✓ حذف شد: ${old.nameFa} (${old.name})`)
  }

  // ═══════════════════════════════════════════════════════════════
  //  ۴. ★★★ v9.0: غیرفعال‌سازی PlanPrice های ماهانه قدیمی
  //     (به‌جای حذف، غیرفعال می‌کنیم تا تاریخچه تراکنش‌های قدیمی حفظ شود)
  // ═══════════════════════════════════════════════════════════════

  console.log('🧹 غیرفعال‌سازی پلن ماهانه قدیمی (در صورت وجود)...')

  const monthlyPrices = await prisma.planPrice.updateMany({
    where: {
      billingCycle: 'monthly',
    },
    data: {
      isActive: false,
      isPopular: false,
    }
  })
  console.log(`  ✓ ${monthlyPrices.count} رکورد قیمت ماهانه غیرفعال شد`)

  // ═══════════════════════════════════════════════════════════════
  //  ۵. حذف PlanPrice های قدیمی (quarterly, semiannual)
  // ═══════════════════════════════════════════════════════════════

  console.log('🧹 حذف دوره‌های قدیمی (quarterly, semiannual)...')

  const oldPrices = await prisma.planPrice.deleteMany({
    where: {
      billingCycle: { in: ['quarterly', 'semiannual'] }
    }
  })
  console.log(`  ✓ ${oldPrices.count} رکورد قیمت حذف شد`)

  // ═══════════════════════════════════════════════════════════════
  //  ۶. ★★★ v9.0: مهاجرت Tenant های فعلی به پلن سالانه
  //     اگر tenantی هنوز روی billingCycle='monthly' است، آن را به 'annual' تغییر بده
  //     و expiresAt را ۳۶۵ روز از امروز تنظیم کن.
  //     (این کار فقط برای tenant‌های فعال انجام می‌شود)
  // ═══════════════════════════════════════════════════════════════

  console.log('🔄 مهاجرت Tenant های monthly به annual...')

  const monthlyTenants = await prisma.tenant.findMany({
    where: {
      billingCycle: 'monthly',
      status: 'active',
    },
  })

  const now = new Date()
  const yearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)

  for (const t of monthlyTenants) {
    await prisma.tenant.update({
      where: { id: t.id },
      data: {
        billingCycle: 'annual',
        expiresAt: t.expiresAt || yearLater,
      },
    })
    console.log(`  ✓ ${t.companyName} (${t.subDomain}): monthly → annual`)
  }
  console.log(`  ✓ مجموعاً ${monthlyTenants.length} Tenant مهاجرت کردند`)

  // ═══════════════════════════════════════════════════════════════
  //  ۷. خلاصه نهایی
  // ═══════════════════════════════════════════════════════════════

  console.log('\n📊 خلاصه:')
  const allTiers = await prisma.planTier.findMany({
    include: { prices: true },
    orderBy: { sortOrder: 'asc' }
  })

  for (const tier of allTiers) {
    console.log(`\n  ${tier.nameFa} (${tier.name}):`)
    for (const price of tier.prices) {
      const cycleLabel =
        price.billingCycle === 'annual' ? 'سالانه' :
        price.billingCycle === 'lifetime' ? 'مادام‌العمر' :
        price.billingCycle === 'monthly' ? 'ماهانه (غیرفعال)' :
        price.billingCycle
      const durationLabel = price.durationDays === 0 ? 'نامحدود' : `${price.durationDays} روز`
      const statusLabel = price.isActive ? '' : ' [غیرفعال]'
      console.log(`    ${cycleLabel}: ${price.price.toLocaleString('fa-IR')} تومان (${durationLabel})${statusLabel}`)
    }
  }

  console.log('\n✅ seed با موفقیت انجام شد! (v9.0)')
}

main()
  .catch((error) => {
    console.error('❌ خطا در seed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
