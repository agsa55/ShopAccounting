// ============================================================================
// src/app/api/tenants/register/route.ts — POST /api/tenants/register (v10.0)
// ★ پشتیبانی از startFreeTrial: true برای شروع دوره ۹۰ روزه رایگان
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
  console.log('║  [Tenants/Register] NEW REGISTRATION REQUEST (v10.0)        ║');
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
      startFreeTrial,  // ★ پارامتر جدید
    } = body;

    console.log(`[Register] Input: company=${companyName}, subdomain=${subDomain}, planTier=${planTierName}, billing=${billingCycle}, startFreeTrial=${startFreeTrial}`);

    // ═══════════════════════════════════════════════════════════════
    // ★ تشخیص نوع درخواست (۳ حالت)
    // ═══════════════════════════════════════════════════════════════
    const isFreeTrialRequest = startFreeTrial === true; // ★ حالت جدید: ثبت‌نام با دوره ۹۰ روزه رایگان
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
      // دمو قدیمی (فقط برای backward compatibility)
      effectiveTierName = 'simple';
      effectiveBillingCycle = 'trial' as BillingCycle;
    } else if (isFreeTrialRequest) {
      // ★ حالت جدید: tenant واقعی با پلن انتخابی + دوره ۹۰ روزه رایگان
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
      planNameValue = effectiveTierName; // فقط نام پلن (نه demo)
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
    const tenantId = `tenant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const tenant = await db.client.tenant.create({
      data: {
        id: tenantId,
        subDomain: subDomain.toLowerCase(),
        companyName,
        ownerMobile,
        ownerEmail: ownerEmail || null,
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
      },
    });

    console.log(`[Register] ✅ Tenant created: ${tenant.id} (status=${tenantStatus}, isPaid=${isPaid})`);

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
    console.log(`║  Plan: ${effectiveTierName} / ${effectiveBillingCycle}${isFreeTrialRequest ? ' (FREE TRIAL 90 days)' : ''}${isDemoRequest ? ' (DEMO)' : ''}`);
    console.log(`║  Admin User: ${username}`);
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