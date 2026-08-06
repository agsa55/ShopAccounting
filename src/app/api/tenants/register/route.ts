// ============================================================================
// src/app/api/tenants/register/route.ts — POST /api/tenants/register (v9.1)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v9.1 — FIX ریشه‌ای مشکل ثبت‌نام پلن دمو/تستی:
//   ★ قبلاً هیچ شاخه‌ی مستقلی برای دمو وجود نداشت:
//       - planTierName='demo' بی‌صدا به 'simple' تبدیل می‌شد (validTiers check)
//       - billingCycle='trial' بی‌صدا به 'annual' تبدیل می‌شد (validCycles check)
//       - Tenant با status='pending_payment' و expiresAt = +۱ ساعت ساخته می‌شد
//         (این ۱ ساعت فقط برای مهلت تکمیل پرداخت زرین‌پال بود، نه برای دمو)
//       - چون فرانت‌اند مرحله‌ی checkout را برای دمو رد می‌کرد، این وضعیت
//         "منتظر پرداخت ۱ ساعته" هرگز finalize نمی‌شد → بعد از ۱ ساعت منقضی می‌شد
//   ★ حالا: isDemoRequest به‌صراحت قبل از پاک‌سازی مقادیر تشخیص داده می‌شود
//       - tenant.status = 'demo' (هماهنگ با trial-check/route.ts)
//       - tenant.billingCycle = 'trial'
//       - expiresAt = now + 3 روز واقعی
//       - نیازی به PlanPrice نیست (پرداختی برای دمو انجام نمی‌شود)
//       - response شامل isTrial:true است
// ============================================================================
//
// ★★★ v9.0 — تغییر ساختار پلن‌ها:
//   ★ حذف پلن ماهانه — فقط annual (سالانه) و lifetime (مادام‌العمر)
//   ★ default billingCycle: 'annual' (نه 'monthly')
//   ★ fallback billingCycle: 'annual' (نه 'monthly')
//   ★ اگر billingCycle='lifetime' باشد، PlanPrice با durationDays=0 استفاده می‌شود
//   ★ به‌روزرسانی TIER_MAP با نام‌های فارسی جدید
//
// ★★★ v3.29 — افزودن ایجاد خودکار سال مالی برای پلن سازمانی
// ★★★ v3.27 — رفع ریشه‌ای مشکل PlanTier خالی هنگام ثبت‌نام
// ★★★ v3.0 — بسیار ساده‌شده
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseLegacyPlanName } from '@/lib/plan-limits';
import type { BillingCycle } from '@/lib/plan-limits';
import bcrypt from 'bcryptjs';
import { ensurePlanTiersExist } from '@/lib/ensure-plan-tiers';
import { ensureFiscalYearForTenant } from '@/lib/auto-fiscal-year';
import { signTokenPair } from '@/lib/jwt';

// ★★★ v9.0: helper محلی برای تشخیص lifetime
function isLifetimeCycle(cycle: string | null | undefined): boolean {
  if (!cycle) return false
  const lower = String(cycle).toLowerCase().trim()
  return lower === 'lifetime' || lower === 'مادام‌العمر'
}

// ★★★ v9.1: مدت زمان دموی رایگان — باید با DemoCleanup و use-demo-status.ts هماهنگ باشد
const DEMO_DURATION_DAYS = 3

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  [Tenants/Register] NEW REGISTRATION REQUEST (v9.1)          ║');
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

    // ═══════════════════════════════════════════════════════════════
    // ★★★ v9.1: تشخیص درخواست دمو — باید قبل از پاک‌سازی/اعتبارسنجی
    //   تیر و سایکل انجام شود، وگرنه 'demo'/'trial' بی‌صدا پاک می‌شوند
    // ═══════════════════════════════════════════════════════════════
    const isDemoRequest =
      planTierName === 'demo' ||
      planName === 'demo' ||
      billingCycle === 'trial'

    console.log(`[Register] isDemoRequest = ${isDemoRequest}`);

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
    let effectiveTierName: string;
    let effectiveBillingCycle: BillingCycle;

    if (isDemoRequest) {
      // ★★★ v9.1: دمو همیشه از امکانات پلن پایه (simple) استفاده می‌کند
      //   ولی billingCycle آن 'trial' می‌ماند تا در trial-check/route.ts
      //   و app-shell.tsx به‌عنوان دمو شناسایی شود (نه annual/lifetime)
      effectiveTierName = 'simple';
      effectiveBillingCycle = 'trial' as BillingCycle;
    } else if (planTierName) {
      effectiveTierName = planTierName;
      const requestedCycle = (billingCycle as string) || 'annual'
      effectiveBillingCycle = (requestedCycle === 'monthly' ? 'annual' : requestedCycle) as BillingCycle;
    } else if (planName) {
      const parsed = parseLegacyPlanName(planName);
      effectiveTierName = parsed.tierName;
      effectiveBillingCycle = (parsed.billingCycle === 'monthly' ? 'annual' : parsed.billingCycle) as BillingCycle;
    } else {
      effectiveTierName = 'simple';
      effectiveBillingCycle = 'annual' as BillingCycle;
    }

    const validTiers = ['simple', 'professional', 'enterprise'];
    if (!validTiers.includes(effectiveTierName)) {
      effectiveTierName = 'simple';
    }

    // ★★★ v9.1: 'trial' فقط برای درخواست‌های دمو مجاز است — برای غیر-دمو
    //   همچنان فقط annual/lifetime معتبرند
    if (!isDemoRequest) {
      const validCycles: string[] = ['annual', 'lifetime'];
      if (!validCycles.includes(effectiveBillingCycle)) {
        console.warn(`[Register] ⚠ Invalid billingCycle "${effectiveBillingCycle}" → fallback to 'annual'`);
        effectiveBillingCycle = 'annual' as BillingCycle;
      }
    }

    const isLifetime = isLifetimeCycle(effectiveBillingCycle);
    console.log(`[Register] Resolved plan: tier=${effectiveTierName}, cycle=${effectiveBillingCycle}, isLifetime=${isLifetime}, isDemoRequest=${isDemoRequest}`);

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

    // ═══════════════════════════════════════════════════════════════
    // ★★★ v9.1: قیمت پلن — فقط برای درخواست‌های غیر-دمو لازم است
    //   دمو رایگان است و هیچ‌وقت به Zarinpal checkout نمی‌رود
    // ═══════════════════════════════════════════════════════════════
    let price: any = null;
    if (!isDemoRequest) {
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
    } else {
      console.log(`[Register] ℹ️ Demo request — skipping PlanPrice lookup (رایگان)`);
    }

    // ═══════════════════════════════════════════════════════════════
    // ★★★ v9.1: تعیین status و expiresAt — شاخه‌ی جدا برای دمو
    // ═══════════════════════════════════════════════════════════════
    const now = new Date();
    let expiresAt: Date;
    let tenantStatus: string;

    if (isDemoRequest) {
      // ★★★ v9.1: دمو — ۳ روز کامل، فعال بلافاصله (بدون نیاز به پرداخت)
      expiresAt = new Date(now.getTime() + DEMO_DURATION_DAYS * 24 * 60 * 60 * 1000);
      tenantStatus = 'demo';
    } else {
      // ★ پلن‌های پولی — اعتبار موقت ۱ ساعته تا تکمیل پرداخت زرین‌پال
      //   پس از پرداخت موفق، applySubscriptionPayment آن را به مدت واقعی پلن به‌روزرسانی می‌کند
      const TEMPORARY_DURATION_HOURS = 1;
      expiresAt = new Date(now.getTime() + TEMPORARY_DURATION_HOURS * 60 * 60 * 1000);
      tenantStatus = 'pending_payment';
    }

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
        status: tenantStatus,
        // ★★★ v9.1: برای دمو planName ثابت 'demo' است (نه simple_trial)
        //   تا با PLAN_INFO['demo'] در register-form.tsx و بقیه‌ی جاها هماهنگ باشد
        planName: isDemoRequest ? 'demo' : `${effectiveTierName}_${effectiveBillingCycle}`,
        planTierId: planTier.id,
        billingCycle: effectiveBillingCycle,
        soldAt: now,
        expiresAt,
      },
    });

    console.log(`[Register] ✅ Tenant created: ${tenant.id} (planTierId=${planTier.id}, status=${tenantStatus}, isDemo=${isDemoRequest})`);

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
    console.log(`║  Plan: ${effectiveTierName} / ${effectiveBillingCycle}${isLifetime ? ' (LIFETIME)' : ''}${isDemoRequest ? ' (DEMO)' : ''}`);
    console.log(`║  PlanTier: ${planTier.name} (id=${planTier.id})`);
    console.log(`║  Admin User: ${username} (${adminUser.id})`);
    if (fiscalYearInfo?.created) {
      console.log(`║  Fiscal Year: ${fiscalYearInfo.name} (auto-created)`);
    }
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

    // ★★★ v9.0: TIER_MAP با نام‌های فارسی جدید
    const TIER_MAP: Record<string, { name: string; nameFa: string }> = {
      simple:        { name: 'simple',       nameFa: 'پایه' },
      professional:  { name: 'professional', nameFa: 'پیشرفته' },
      enterprise:    { name: 'enterprise',   nameFa: 'حرفه‌ای' },
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
          isLifetime,
          // ★★★ v9.1: اصلاح شد — قبلاً همیشه false بود، حالا واقعی است
          isTrial: isDemoRequest,
          status: tenant.status,
          isIsolated: false,
          expiresAt: expiresAt.toISOString(),
        },
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
