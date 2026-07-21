// ============================================================================
// src/app/api/tenants/upgrade-plan/route.ts — POST /api/tenants/upgrade-plan (v3.0)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.0 — بسیار ساده‌شده:
//   ★ حذف کامل provisioning دیتابیس اختصاصی
//   ★ فقط بروزرسانی planTierId و expiresAt
//   ★ حذف full_purchase
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, isFullAccessRole } from '@/lib/jwt';
import { upgradePlan } from '@/lib/plan-limits';
import type { BillingCycle } from '@/lib/plan-limits';

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز.', errorCode: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    if (!isFullAccessRole(user.role)) {
      return NextResponse.json(
        { success: false, error: 'شما مجوز ارتقای پلن را ندارید.', errorCode: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const tenantId = user.tenantId;
    const body = await request.json();
    const { planName, billingCycle } = body;

    if (!planName) {
      return NextResponse.json(
        { success: false, error: 'نام پلن الزامی است.' },
        { status: 400 }
      );
    }

    // ★ اعتبارسنجی پلن
    const validTiers = ['simple', 'professional', 'enterprise'];
    if (!validTiers.includes(planName)) {
      return NextResponse.json(
        { success: false, error: 'پلن انتخابی نامعتبر است. پلن‌های معتبر: ساده، حرفه‌ای، سازمانی' },
        { status: 400 }
      );
    }

    const cycle = (billingCycle as BillingCycle) || 'monthly';
    if (!['monthly', 'annual'].includes(cycle)) {
      return NextResponse.json(
        { success: false, error: 'دوره صورت‌حساب نامعتبر است. مقادیر مجاز: monthly, annual' },
        { status: 400 }
      );
    }

    // ─── اطلاعات فعلی ─────────────────────────────────────
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, companyName: true, status: true, planName: true, planTierId: true },
    });

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'فروشگاه یافت نشد.' }, { status: 404 });
    }

    // ─── بررسی: آیا همین پلن رو داره؟ ───
    if (tenant.planTierId) {
      const currentPlanTier = await db.client.planTier.findUnique({
        where: { id: tenant.planTierId },
      });
      if (currentPlanTier?.name === planName) {
        return NextResponse.json({ success: false, error: 'شما این پلن را دارید.' }, { status: 409 });
      }
    }

    // ─── ارتقای پلن ───
    const result = await upgradePlan(tenantId, planName, cycle);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'خطا در ارتقای پلن' },
        { status: 500 }
      );
    }

    // ─── Audit Log ───
    try {
      await db.client.auditLogs.create({
        data: {
          id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          tenantId,
          userId: user.userId,
          action: 'tenant.upgrade_plan',
          entityType: 'Tenant',
          entityId: tenantId,
          details: JSON.stringify({
            toPlan: planName,
            billingCycle: cycle,
          }),
        },
      });
    } catch (auditErr: any) {
      console.warn('[UpgradePlan] Audit log failed:', auditErr.message);
    }

    // ─── دریافت اطلاعات جدید ───
    const updatedTenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      include: { planTier: true },
    });

    const expiresAt = updatedTenant?.expiresAt;

    return NextResponse.json({
      success: true,
      message: 'پلن با موفقیت ارتقا یافت!',
      data: {
        planName,
        planNameFa: updatedTenant?.planTier?.nameFa || planName,
        billingCycle: cycle,
        endDate: expiresAt,
        isIsolated: false,
      },
    });
  } catch (error: any) {
    console.error('[UpgradePlan] Error:', error.message);
    return NextResponse.json({ success: false, error: 'خطای داخلی سرور.' }, { status: 500 });
  }
}
