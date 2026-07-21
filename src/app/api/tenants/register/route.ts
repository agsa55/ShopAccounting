// ============================================================================
// src/app/api/tenants/register/route.ts — POST /api/tenants/register (v9.0)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v9.0 — تغییر ساختار پلن‌ها:
//   ★ حذف پلن ماهانه — فقط annual (سالانه) و lifetime (مادام‌العمر)
//   ★ default billingCycle: 'annual' (نه 'monthly')
//   ★ fallback billingCycle: 'annual' (نه 'monthly')
//   ★ اگر billingCycle='lifetime' باشد، PlanPrice با durationDays=0 استفاده می‌شود
//   ★ برای lifetime، expiresAt موقت هم همان منطق ۱ ساعته را دارد
//     (پس از پرداخت موفق، applySubscriptionPayment در subscription-utils.ts
//      باید expiresAt را null کند — این باید در آن فایل اصلاح شود)
//   ★ به‌روزرسانی TIER_MAP با نام‌های فارسی جدید:
//       simple       → «پایه»    (قبلاً «ساده»)
//       professional → «پیشرفته» (قبلاً «حرفه‌ای»)
//       enterprise   → «حرفه‌ای» (قبلاً «سازمانی»)
//
// ★★★ v3.29 — افزودن ایجاد خودکار سال مالی برای پلن سازمانی:
//   ★ import ensureFiscalYearForTenant از auto-fiscal-year.ts
//   ★ پس از ساخت Tenant، اگر پلن enterprise باشد، سال مالی خودکار ساخته می‌شود
//   ★ پلن professional: اختیاری (سال مالی ساخته نمی‌شود)
//   ★ پلن simple: نیازی به سال مالی نیست
//
// ★★★ v3.27 — رفع ریشه‌ای مشکل PlanTier خالی هنگام ثبت‌نام:
//   ★ فراخوانی ensurePlanTiersExist() قبل از جستجوی PlanTier
//   ★ اگر باز هم PlanTier پیدا نشد، خطای واضح می‌دهد
//
// ★★★ v3.0 — بسیار ساده‌شده:
//   ★ حذف کامل provisioning دیتابیس اختصاصی
//   ★ همه کاربرها و tenant ها در بانک مشترک ShopAccounting
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseLegacyPlanName } from '@/lib/plan-limits';
import type { BillingCycle } from '@/lib/plan-limits';
import bcrypt from 'bcryptjs';
import { ensurePlanTiersExist } from '@/lib/ensure-plan-tiers';
// ★★★ v3.29: helper ایجاد خودکار سال مالی
import { ensureFiscalYearForTenant } from '@/lib/auto-fiscal-year';
// ★★★ v5.1.10: استفاده از JWT واقعی به‌جای توکن جعلی
import { signTokenPair } from '@/lib/jwt';

// ★★★ v9.0: helper محلی برای تشخیص lifetime
function isLifetimeCycle(cycle: string | null | undefined): boolean {
  if (!cycle) return false
  const lower = String(cycle).toLowerCase().trim()
  return lower === 'lifetime' || lower === 'مادام‌العمر'
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  [Tenants/Register] NEW REGISTRATION REQUEST (v9.0)          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    const body = await request.json();
    const {
      companyName,
      subDomain,
      ownerMobile,
      ownerEmail,
      username,
      password,
      planTierName,
      billingCycle,
      planName,
    } = body;

    console.log(`[Register] Input: company=${companyName}, subdomain=${subDomain}, planTier=${planTierName}, billing=${billingCycle}`);

    // ─── اعتبارسنجی فیلدهای الزامی ───
    if (!companyName || !subDomain || !ownerMobile || !username || !password) {
      return NextResponse.json(
        { success: false, error: 'فیلدهای الزامی را پر کنید' },
        { status: 400 }
      );
    }

    if (subDomain.length < 3) {
      return NextResponse.json(
        { success: false, error: 'زیردامنه باید حداقل ۳ کاراکتر باشد' },
        { status: 400 }
      );
    }

    // ─── بررسی عدم تکرار زیردامنه ───
    const existing = await db.client.tenant.findFirst({
      where: { subDomain: subDomain.toLowerCase() },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'این زیردامنه قبلاً ثبت شده است' },
        { status: 409 }
      );
    }

    // ─── بررسی عدم تکرار نام کاربری ───
    const existingUser = await db.client.storeUser.findFirst({
      where: { username },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'این نام کاربری قبلاً استفاده شده است' },
        { status: 409 }
      );
    }

    // ─── تعیین پلن ───
    // ★★★ v9.0: default billingCycle از 'monthly' به 'annual' تغییر کرد
    let effectiveTierName: string;
    let effectiveBillingCycle: BillingCycle;

    if (planTierName) {
      effectiveTierName = planTierName;
      // ★★★ v9.0: اگر billingCycle ارسال نشده یا 'monthly' است → 'annual' استفاده کن
      const requestedCycle = (billingCycle as string) || 'annual'
      // ★ backward compatibility: اگر 'monthly' ارسال شده → 'annual' استفاده کن
      effectiveBillingCycle = (requestedCycle === 'monthly' ? 'annual' : requestedCycle) as BillingCycle;
    } else if (planName) {
      const parsed = parseLegacyPlanName(planName);
      effectiveTierName = parsed.tierName;
      // ★★★ v9.0: اگر parseLegacyPlanName 'monthly' برگرداند → 'annual' استفاده کن
      effectiveBillingCycle = (parsed.billingCycle === 'monthly' ? 'annual' : parsed.billingCycle) as BillingCycle;
    } else {
      effectiveTierName = 'simple';
      // ★★★ v9.0: default 'annual' (نه 'monthly')
      effectiveBillingCycle = 'annual' as BillingCycle;
    }

    const validTiers = ['simple', 'professional', 'enterprise'];
    if (!validTiers.includes(effectiveTierName)) {
      effectiveTierName = 'simple';
    }

    // ★★★ v9.0: اعتبارسنجی billingCycle — فقط 'annual' و 'lifetime' مجاز هستند
    const validCycles: string[] = ['annual', 'lifetime'];
    if (!validCycles.includes(effectiveBillingCycle)) {
      console.warn(`[Register] ⚠ Invalid billingCycle "${effectiveBillingCycle}" → fallback to 'annual'`);
      effectiveBillingCycle = 'annual' as BillingCycle;
    }

    const isLifetime = isLifetimeCycle(effectiveBillingCycle);
    console.log(`[Register] Resolved plan: tier=${effectiveTierName}, cycle=${effectiveBillingCycle}, isLifetime=${isLifetime}`);

    // ═══════════════════════════════════════════════════════════════
    // ★★★ v3.27: تضمین وجود PlanTiers قبل از جستجو
    // ═══════════════════════════════════════════════════════════════
    try {
      await ensurePlanTiersExist();
      console.log('[Register] ✓ ensurePlanTiersExist() completed');
    } catch (ensureErr: any) {
      console.warn(`[Register] ⚠ ensurePlanTiersExist warning: ${ensureErr.message}`);
    }

    // ─── هش کردن رمز عبور ───
    const hashedPassword = await bcrypt.hash(password, 10);

    // ─── جستجوی PlanTier ───
    let planTier: any = null;
    try {
      planTier = await db.client.planTier.findFirst({
        where: { name: effectiveTierName, isActive: true },
      });
      console.log(`[Register] PlanTier: ${planTier ? `id=${planTier.id}, name=${planTier.name}` : 'NOT FOUND'}`);
    } catch (err: any) {
      console.warn(`[Register] PlanTier lookup failed: ${err.message}`);
    }

    // ★★★ v3.27: اگر PlanTier پیدا نشد، خطای واضح بده
    if (!planTier) {
      console.error(`[Register] ❌ CRITICAL: PlanTier "${effectiveTierName}" not found after ensure!`);
      return NextResponse.json(
        {
          success: false,
          error: `پلن "${effectiveTierName}" در سیستم یافت نشد. لطفاً با پشتیبانی تماس بگیرید یا دوباره تلاش کنید.`,
        },
        { status: 500 }
      );
    }

    // ─── تعیین مدت اشتراک ───
    // ★★★ v5.1.5: اعتبار موقت ۱ ساعته برای پرداخت
    //   پس از پرداخت موفق، applySubscriptionPayment آن را به مدت واقعی پلن به‌روزرسانی می‌کند
    //   ★★★ v9.0: برای lifetime هم همین منطق موقت ۱ ساعته استفاده می‌شود
    //   (applySubscriptionPayment در subscription-utils.ts باید برای lifetime،
    //    expiresAt را null کند — این باید در آن فایل اصلاح شود)
    const now = new Date();
    const TEMPORARY_DURATION_HOURS = 1; // ۱ ساعت برای تکمیل پرداخت
    const expiresAt = new Date(now.getTime() + TEMPORARY_DURATION_HOURS * 60 * 60 * 1000);

    // ★ قیمت پلن (برای ارسال به checkout)
    let price: any = null;
    try {
      price = await db.client.planPrice.findUnique({
        where: {
          planTierId_billingCycle: {
            planTierId: planTier.id,
            billingCycle: effectiveBillingCycle,
          },
        },
      });
    } catch { /* ignore */ }

    if (!price || !price.isActive) {
      // ★★★ v9.0: fallback از 'monthly' به 'annual' تغییر کرد
      console.warn(`[Register] ⚠ PlanPrice not found for ${effectiveTierName}/${effectiveBillingCycle}, falling back to 'annual'`);
      try {
        price = await db.client.planPrice.findUnique({
          where: {
            planTierId_billingCycle: {
              planTierId: planTier.id,
              billingCycle: 'annual',
            },
          },
        });
        // ★★★ v9.0: اگر fallback به annual پیدا شد، effectiveBillingCycle را هم آپدیت کن
        if (price && price.isActive) {
          effectiveBillingCycle = 'annual' as BillingCycle;
          console.log(`[Register] ✓ Fallback to 'annual' successful`);
        }
      } catch { /* ignore */ }
    }

    if (!price || !price.isActive) {
      console.error(`[Register] ❌ CRITICAL: No active PlanPrice found for tier "${effectiveTierName}"`);
      return NextResponse.json(
        {
          success: false,
          error: `قیمت پلن "${effectiveTierName}" در سیستم یافت نشد. لطفاً با پشتیبانی تماس بگیرید.`,
        },
        { status: 500 }
      );
    }

    console.log(`[Register] ✓ PlanPrice: ${price.price} تومان (${price.billingCycle}, ${price.durationDays} روز)`);

    // ═══════════════════════════════════════════════════════════════
    // ★★★ v3.0: مرحله ۱: ایجاد Tenant در بانک مشترک ───
    // ═══════════════════════════════════════════════════════════════
    const tenantId = `tenant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const tenant = await db.client.tenant.create({
      data: {
        id: tenantId,
        subDomain: subDomain.toLowerCase(),
        companyName,
        ownerMobile,
        ownerEmail: ownerEmail || null,
        // ★★★ v5.1.11: status='pending_payment' به‌جای 'active'
        //   Tenant تا زمان پرداخت موفق، در حالت pending است
        //   اگر پرداخت لغو یا ناموفق باشد، Tenant حذف می‌شود
        status: 'pending_payment',
        planName: `${effectiveTierName}_${effectiveBillingCycle}`,
        planTierId: planTier.id,
        billingCycle: effectiveBillingCycle,
        soldAt: now,
        expiresAt,
      },
    });

    console.log(`[Register] ✅ Tenant created: ${tenant.id} (planTierId=${planTier.id})`);

    // ═══════════════════════════════════════════════════════════════
    // ★★★ v3.29: ایجاد خودکار سال مالی برای پلن سازمانی ───
    // ═══════════════════════════════════════════════════════════════
    let fiscalYearInfo: any = null;
    try {
      const fyResult = await ensureFiscalYearForTenant(db.client, tenant.id, effectiveTierName);
      if (fyResult.created) {
        console.log(`[Register] ✅ Auto fiscal year created: ${fyResult.year?.name}`);
        fiscalYearInfo = {
          created: true,
          name: fyResult.year?.name,
          startDate: fyResult.year?.startDate,
          endDate: fyResult.year?.endDate,
        };
      } else {
        console.log(`[Register] ℹ️ Fiscal year not auto-created: ${fyResult.reason}`);
        fiscalYearInfo = { created: false, reason: fyResult.reason };
      }
    } catch (fyErr: any) {
      console.warn(`[Register] ⚠ Fiscal year creation warning: ${fyErr.message}`);
      fiscalYearInfo = { created: false, reason: fyErr.message };
    }

    // ═══════════════════════════════════════════════════════════════
    // ★★★ v3.0: مرحله ۲: ایجاد کاربر Admin ───
    // ═══════════════════════════════════════════════════════════════
    const adminUser = await db.client.storeUser.create({
      data: {
        username,
        password: hashedPassword,
        mobile: ownerMobile,
        role: 'Admin',
        isActive: true,
        tenantId: tenant.id,
      },
    });

    console.log(`[Register] ✅ Admin user created: ${adminUser.username} (id: ${adminUser.id})`);

    // ─── ثبت در UserLookups ───
    try {
      await db.client.userLookups.create({
        data: {
          id: `lookup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          username,
          tenantId: tenant.id,
          userType: 'storeUser',
          isActive: true,
        },
      });
      console.log(`[Register] ✅ UserLookup created`);
    } catch (lookupError: any) {
      console.warn(`[Register] UserLookup create skipped: ${lookupError.message}`);
    }

    // ─── تولید توکن JWT واقعی ───
    // ★★★ v5.1.10: استفاده از signTokenPair به‌جای توکن جعلی
    //   این کار ضروری است چون withTenantIsolation در checkout یک JWT معتبر می‌خواهد
    const tokenPair = signTokenPair({
      userId: adminUser.id,
      username,
      role: 'Admin',
      tenantId: tenant.id,
      userType: 'storeUser',
      permissions: ['all'],
      storeName: companyName,
    });
    const accessToken = tokenPair.accessToken;
    const refreshToken = tokenPair.refreshToken;

    console.log(`[Register] ✅ JWT tokens generated (expires in ${tokenPair.expiresIn}s)`);

    const elapsedMs = Date.now() - startTime;
    console.log(`╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  [Register] ✅ REGISTRATION COMPLETED in ${elapsedMs}ms               ║`);
    console.log(`║  Tenant: ${tenant.id}`);
    console.log(`║  Plan: ${effectiveTierName} / ${effectiveBillingCycle}${isLifetime ? ' (LIFETIME)' : ''}`);
    console.log(`║  PlanTier: ${planTier.name} (id=${planTier.id})`);
    console.log(`║  Admin User: ${username} (${adminUser.id})`);
    if (fiscalYearInfo?.created) {
      console.log(`║  Fiscal Year: ${fiscalYearInfo.name} (auto-created)`);
    }
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

    // ★★★ v9.0: TIER_MAP با نام‌های فارسی جدید
    const TIER_MAP: Record<string, { name: string; nameFa: string }> = {
      simple:        { name: 'simple',       nameFa: 'پایه' },       // ★ v9.0: «ساده» → «پایه»
      professional:  { name: 'professional', nameFa: 'پیشرفته' },   // ★ v9.0: «حرفه‌ای» → «پیشرفته»
      enterprise:    { name: 'enterprise',   nameFa: 'حرفه‌ای' },   // ★ v9.0: «سازمانی» → «حرفه‌ای»
    };
    const tierInfo = TIER_MAP[effectiveTierName] || TIER_MAP.simple;

    return NextResponse.json({
      success: true,
      data: {
        token: accessToken,
        accessToken,
        refreshToken,
        user: {
          id: adminUser.id,
          username,
          role: 'admin',
          mobile: ownerMobile,
          tenantId: tenant.id,
          userType: 'storeUser',
          permissions: ['all'],
          storeName: companyName,
        },
        tenant: {
          id: tenant.id,
          subDomain: tenant.subDomain,
          companyName: tenant.companyName,
          planTierId: planTier.id,
          planTierName: planTier.name,
          planTierNameFa: planTier.nameFa || tierInfo.nameFa,
          billingCycle: effectiveBillingCycle,
          isLifetime, // ★★★ v9.0: flag جدید برای مشخص کردن پلن مادام‌العمر
          isTrial: false,
          status: tenant.status,
          isIsolated: false,
          expiresAt: expiresAt.toISOString(),
        },
        // ★★★ v3.29: اطلاعات سال مالی خودکار
        fiscalYear: fiscalYearInfo,
      },
    });
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime;
    console.error(`╔══════════════════════════════════════════════════════════════╗`);
    console.error(`║  [Register] ❌ UNEXPECTED ERROR after ${elapsedMs}ms`);
    console.error(`║  Message: ${error.message}`);
    console.error(`╚══════════════════════════════════════════════════════════════╝\n`);
    return NextResponse.json(
      { success: false, error: 'خطا در ثبت‌نام فروشگاه: ' + error.message },
      { status: 500 }
    );
  }
}
