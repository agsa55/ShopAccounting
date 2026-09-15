// ============================================================================
// src/app/api/tenants/register/route.ts — POST /api/tenants/register (v11.1)
// ★ پشتیبانی از startFreeTrial: true برای شروع دوره ۹۰ روزه رایگان
// ★ پشتیبانی از ownerNationalCode و identityVerified (شاهکار)
// ★ جلوگیری از ثبت‌نام تکراری با کد ملی یا شماره موبایل
// ★ tenant واقعی با status=active ساخته می‌شود (نه demo)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseLegacyPlanName } from '@/lib/plan-limits';
import type { BillingCycle } from '@/lib/plan-limits';
import bcrypt from 'bcryptjs';
import { ensurePlanTiersExist } from '@/lib/ensure-plan-tiers';
import { ensureFiscalYearForTenant } from '@/lib/auto-fiscal-year';
import { signTokenPair } from '@/lib/jwt';

function isLifetimeCycle(cycle: string | null | undefined): boolean {
  if (!cycle) return false
  const lower = String(cycle).toLowerCase().trim()
  return lower === 'lifetime' || lower === 'مادام‌العمر'
}

const DEMO_DURATION_DAYS = 3
const FREE_TRIAL_DURATION_DAYS = 90 // ★ دوره رایگان ۹۰ روزه

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  [Tenants/Register] NEW REGISTRATION REQUEST (v11.1)        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    const body = await request.json();
  // ─── بعد (اصلاح شده v11.2) ───
const {
  companyName,
  subDomain,
  ownerMobile,
  ownerEmail,
  ownerNationalCode,  // ★ v11.1: کد ملی
  username,
  password,
  planTierName,
  billingCycle,
  planName,
  startFreeTrial,
  identityVerified,   // ★ v11.1: آیا هویت تأیید شده
} = body;

// ★ v11.2: alias برای استفاده راحت‌تر در IdentityRegistry
const nationalCode = ownerNationalCode;
    console.log(`[Register] Input: company=${companyName}, subdomain=${subDomain}, planTier=${planTierName}, billing=${billingCycle}, startFreeTrial=${startFreeTrial}`);
    console.log(`[Register] Identity: nationalCode=${ownerNationalCode?.substring(0, 3)}****, identityVerified=${identityVerified}`);

    // ═══════════════════════════════════════════════════════════════
    // ★ v11.1: بررسی الزامی بودن احراز هویت شاهکار
    // ═══════════════════════════════════════════════════════════════
    if (!ownerNationalCode || ownerNationalCode.length !== 10) {
      return NextResponse.json(
        { success: false, error: 'کد ملی الزامی است و باید ۱۰ رقم باشد' },
        { status: 400 }
      );
    }

    if (!identityVerified || identityVerified !== true) {
      console.error('[Register] ❌ identityVerified is not true - rejecting registration');
      return NextResponse.json(
        { success: false, error: 'احراز هویت انجام نشده است. لطفاً فرآیند ثبت‌نام را از ابتدا طی کنید.' },
        { status: 400 }
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ تشخیص نوع درخواست (۳ حالت)
    // ═══════════════════════════════════════════════════════════════
    const isFreeTrialRequest = startFreeTrial === true;
    const isDemoRequest = !isFreeTrialRequest && (
      planTierName === 'demo' ||
      planName === 'demo' ||
      billingCycle === 'trial'
    );

    console.log(`[Register] isFreeTrialRequest = ${isFreeTrialRequest}, isDemoRequest = ${isDemoRequest}`);

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

    // ═══════════════════════════════════════════════════════════════
    // ★ v11.1: بررسی یکتا بودن کد ملی (double-check)
    // ═══════════════════════════════════════════════════════════════
    const existingNationalCode = await db.client.tenant.findFirst({
      where: { 
        ownerNationalCode,
        status: { not: 'deleted' }
      },
    });

    if (existingNationalCode) {
      console.error(`[Register] ❌ National code already registered: ${ownerNationalCode.substring(0, 3)}****`);
      return NextResponse.json(
        { success: false, error: 'این کد ملی قبلاً برای ثبت‌نام استفاده شده است. هر کد ملی فقط یک بار می‌تواند در سیستم ثبت‌نام کند.' },
        { status: 409 }
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ v11.1: بررسی یکتا بودن شماره موبایل (double-check)
    // ═══════════════════════════════════════════════════════════════
    const existingMobile = await db.client.tenant.findFirst({
      where: { 
        ownerMobile,
        status: { not: 'deleted' }
      },
    });

    if (existingMobile) {
      console.error(`[Register] ❌ Mobile already registered: ${ownerMobile.substring(0, 4)}****`);
      return NextResponse.json(
        { success: false, error: 'این شماره موبایل قبلاً ثبت‌نام کرده است. اگر رمز عبور خود را فراموش کرده‌اید، از گزینه "بازیابی رمز عبور" استفاده کنید.' },
        { status: 409 }
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
      effectiveTierName = 'simple';
      effectiveBillingCycle = 'trial' as BillingCycle;
    } else if (isFreeTrialRequest) {
      effectiveTierName = planTierName || 'simple';
      effectiveBillingCycle = 'annual' as BillingCycle;
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

    if (!isDemoRequest && !isFreeTrialRequest) {
      const validCycles: string[] = ['annual', 'lifetime'];
      if (!validCycles.includes(effectiveBillingCycle)) {
        console.warn(`[Register] ⚠ Invalid billingCycle "${effectiveBillingCycle}" → fallback to 'annual'`);
        effectiveBillingCycle = 'annual' as BillingCycle;
      }
    }

    const isLifetime = isLifetimeCycle(effectiveBillingCycle);
    console.log(`[Register] Resolved plan: tier=${effectiveTierName}, cycle=${effectiveBillingCycle}, isLifetime=${isLifetime}, isDemoRequest=${isDemoRequest}, isFreeTrialRequest=${isFreeTrialRequest}`);

    // ═══════════════════════════════════════════════════════════════
    try {
      await ensurePlanTiersExist();
      console.log('[Register] ✓ ensurePlanTiersExist() completed');
    } catch (ensureErr: any) {
      console.warn(`[Register] ⚠ ensurePlanTiersExist warning: ${ensureErr.message}`);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

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
      return NextResponse.json(
        { success: false, error: `پلن "${effectiveTierName}" یافت نشد.` },
        { status: 500 }
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ تعیین status و expiresAt (۳ حالت)
    // ═══════════════════════════════════════════════════════════════
    const now = new Date();
    let expiresAt: Date | null = null;
    let trialStartAt: Date = now;
    let trialEndAt: Date | null = null;
    let isPaid = false;
    let tenantStatus: string;
    let planNameValue: string;

    if (isFreeTrialRequest) {
      // ★★★ حالت جدید: دوره ۹۰ روزه رایگان
      tenantStatus = 'active';
      isPaid = false;
      trialStartAt = now;
      trialEndAt = new Date(now.getTime() + FREE_TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
      planNameValue = effectiveTierName;
      console.log(`[Register] ✅ Free Trial Mode: ${FREE_TRIAL_DURATION_DAYS} days (ends: ${trialEndAt.toISOString()})`);
    } else if (isDemoRequest) {
      // دمو قدیمی (۳ روزه)
      expiresAt = new Date(now.getTime() + DEMO_DURATION_DAYS * 24 * 60 * 60 * 1000);
      trialStartAt = now;
      trialEndAt = expiresAt;
      tenantStatus = 'demo';
      planNameValue = 'demo';
    } else {
      // پلن پولی (مهلت ۱ ساعته برای پرداخت)
      const TEMPORARY_DURATION_HOURS = 1;
      expiresAt = new Date(now.getTime() + TEMPORARY_DURATION_HOURS * 60 * 60 * 1000);
      tenantStatus = 'pending_payment';
      planNameValue = `${effectiveTierName}_${effectiveBillingCycle}`;
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ v11.1: ایجاد tenant با کد ملی و وضعیت احراز هویت
    // ═══════════════════════════════════════════════════════════════
    const tenantId = `tenant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const tenant = await db.client.tenant.create({
      data: {
        id: tenantId,
        subDomain: subDomain.toLowerCase(),
        companyName,
        ownerMobile,
        ownerEmail: ownerEmail || null,
        ownerNationalCode,  // ★ v11.1: کد ملی
        status: tenantStatus,
        planName: planNameValue,
        planTierId: planTier.id,
        billingCycle: effectiveBillingCycle,
        soldAt: now,
        expiresAt: expiresAt,
        // ★ فیلدهای جدید Trial
        trialStartAt: trialStartAt,
        trialEndAt: trialEndAt,
        isPaid: isPaid,
        // ★ v11.1: فیلدهای جدید احراز هویت
        identityVerified: true,
        identityVerifiedAt: now,
        identityAttempts: 0,
      },
    });

    // بعد از tenant.create، این کد را اضافه کنید:


// ═══════════════════════════════════════════════════════════════
// ★ v11.2: ثبت کد ملی در IdentityRegistry
// ═══════════════════════════════════════════════════════════════
try {
  await db.client.identityRegistry.create({
    data: {
      id: `identity-${tenant.id}`,
      nationalCode: nationalCode,       // ← حالا nationalCode تعریف شده
      mobile: ownerMobile,
      tenantId: tenant.id,
      registeredAt: now,
      shahkarVerified: true,
    },
  })
  console.log(`[Register] ✅ IdentityRegistry entry created for ${nationalCode.substring(0, 3)}****`)
} catch (registryErr: any) {
  console.warn(`[Register] ⚠ IdentityRegistry entry failed: ${registryErr.message}`)
  // اگر تکراری بود، یعنی باگ در validate-identity
  if (registryErr.code === 'P2002') {
    await db.client.tenant.delete({ where: { id: tenant.id } })
    return NextResponse.json({
      success: false,
      error: 'این کد ملی قبلاً ثبت شده است. لطفاً از ورود استفاده کنید.',
    }, { status: 409 })
  }
}

    console.log(`[Register] ✅ Tenant created: ${tenant.id} (status=${tenantStatus}, isPaid=${isPaid}, identityVerified=true)`);

    // ═══════════════════════════════════════════════════════════════
    let fiscalYearInfo: any = null;
    try {
      const fyResult = await ensureFiscalYearForTenant(db.client, tenant.id, effectiveTierName);
      if (fyResult.created) {
        fiscalYearInfo = { created: true, name: fyResult.year?.name };
      } else {
        fiscalYearInfo = { created: false, reason: fyResult.reason };
      }
    } catch (fyErr: any) {
      fiscalYearInfo = { created: false, reason: fyErr.message };
    }

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
    } catch {}

    const tokenPair = signTokenPair({
      userId: adminUser.id,
      username,
      role: 'Admin',
      tenantId: tenant.id,
      userType: 'storeUser',
      permissions: ['all'],
      storeName: companyName,
    });

    const elapsedMs = Date.now() - startTime;
    console.log(`╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  [Register] ✅ REGISTRATION COMPLETED in ${elapsedMs}ms`);
    console.log(`║  Tenant: ${tenant.id}`);
    console.log(`║  National Code: ${ownerNationalCode.substring(0, 3)}****${ownerNationalCode.substring(7)}`);
    console.log(`║  Plan: ${effectiveTierName} / ${effectiveBillingCycle}${isFreeTrialRequest ? ' (FREE TRIAL 90 days)' : ''}${isDemoRequest ? ' (DEMO)' : ''}`);
    console.log(`║  Admin User: ${username}`);
    console.log(`║  Identity Verified: ✅`);
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

    const TIER_MAP: Record<string, { name: string; nameFa: string }> = {
      simple:       { name: 'simple',       nameFa: 'پایه' },
      professional: { name: 'professional', nameFa: 'پیشرفته' },
      enterprise:   { name: 'enterprise',   nameFa: 'حرفه‌ای' },
    };
    const tierInfo = TIER_MAP[effectiveTierName] || TIER_MAP.simple;

    return NextResponse.json({
      success: true,
      data: {
        token: tokenPair.accessToken,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
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
          isTrial: isDemoRequest || isFreeTrialRequest,
          isFreeTrial: isFreeTrialRequest,
          status: tenant.status,
          isPaid: isPaid,
          isIsolated: false,
          expiresAt: expiresAt?.toISOString() || null,
          trialEndAt: trialEndAt?.toISOString() || null,
          daysRemaining: isFreeTrialRequest ? FREE_TRIAL_DURATION_DAYS : (isDemoRequest ? DEMO_DURATION_DAYS : 0),
          // ★ v11.1: اطلاعات احراز هویت
          identityVerified: tenant.identityVerified,
          identityVerifiedAt: tenant.identityVerifiedAt?.toISOString() || null,
        },
        fiscalYear: fiscalYearInfo,
      },
    });
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime;
    console.error(`[Register] ❌ UNEXPECTED ERROR after ${elapsedMs}ms: ${error.message}`);
    return NextResponse.json(
      { success: false, error: 'خطا در ثبت‌نام فروشگاه: ' + error.message },
      { status: 500 }
    );
  }
}