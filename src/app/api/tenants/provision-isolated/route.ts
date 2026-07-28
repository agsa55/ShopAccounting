/**
 * API Route: Provision Isolated Database
 *
 * ارتقای فروشگاه به دیتابیس اختصاصی
 * فقط مدیران سیستم (SuperAdmin) یا خود فروشگاه (Owner/Manager) اجازه دارند
 *
 * POST /api/tenants/provision-isolated
 *
 * مراحل:
 *   1. احراز هویت و مجوز
 *   2. بررسی وضعیت فعلی فروشگاه
 *   3. ایجاد دیتابیس اختصاصی
 *   4. اعمال Prisma Schema
 *   5. انتقال داده‌ها
 *   6. رمزگذاری connection string
 *   7. بروزرسانی MasterDB
 *   8. بازنشانی cache
 *
 * فایل: src/app/api/tenants/provision-isolated/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/jwt';
import { provisionIsolatedTenant } from '@/lib/tenant-provisioning';

export async function POST(request: NextRequest) {
  try {
    // ─── ۱. احراز هویت ─────────────────────────────────────
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز.', errorCode: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // ─── ۲. فقط Owner و Manager مجاز هستند ────────────────────
    const fullAccessRoles = new Set(['Admin', 'Manager', 'Owner', 'admin', 'manager', 'owner']);
    if (!fullAccessRoles.has(user.role)) {
      return NextResponse.json(
        { success: false, error: 'شما مجوز ارتقای دیتابیس را ندارید.', errorCode: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const tenantId = user.tenantId;

    // ─── ۳. بررسی وضعیت فعلی ─────────────────────────────
    const tenant = await db.master.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        companyName: true,
        status: true,
        isIsolated: true,
        dbName: true,
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد.' },
        { status: 404 }
      );
    }

    if (tenant.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'فروشگاه فعال نیست. ابتدا حساب خود را تأیید کنید.' },
        { status: 400 }
      );
    }

    if (tenant.isIsolated) {
      return NextResponse.json(
        {
          success: false,
          error: 'این فروشگاه قبلاً دیتابیس اختصاصی دارد.',
          data: { dbName: tenant.dbName },
        },
        { status: 409 }
      );
    }

    // ─── ۴. بررسی پلن اشتراک ─────────────────────────────
    const subscription = await db.master.subscription.findFirst({
      where: {
        tenantId,
        status: 'active',
        endDate: { gt: new Date() },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return NextResponse.json(
        { success: false, error: 'اشتراک فعال یافت نشد.' },
        { status: 400 }
      );
    }

    // فقط پلن‌های professional و enterprise دیتابیس اختصاصی دارند
    const isolatedPlans = ['professional', 'enterprise', 'premium'];
    if (!isolatedPlans.includes(subscription.plan.name.toLowerCase())) {
      return NextResponse.json(
        {
          success: false,
          error: 'پلن فعلی شما از دیتابیس اختصاصی پشتیبانی نمی‌کند. لطفاً ابتدا پلن خود را ارتقا دهید.',
          data: {
            currentPlan: subscription.plan.name,
            requiredPlans: isolatedPlans,
          },
        },
        { status: 400 }
      );
    }

    // ─── ۵. اجرای Provisioning ─────────────────────────────
    console.log(`[ProvisionIsolated] Starting for tenant: ${tenantId} (${tenant.companyName})`);

    const result = await provisionIsolatedTenant(tenantId);

    // ─── ۶. ثبت AuditLog ─────────────────────────────────────
    await db.master.auditLog.create({
      data: {
        id: require('crypto').randomUUID(),
        tenantId,
        userId: user.userId,
        action: result.success ? 'tenant.provisioned' : 'tenant.provision_failed',
        entityType: 'Tenant',
        entityId: tenantId,
        details: JSON.stringify({
          databaseName: result.databaseName,
          success: result.success,
          steps: result.steps.map(s => ({
            name: s.name,
            status: s.status,
            duration: s.duration,
            message: s.message,
          })),
          error: result.error,
        }),
      },
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'خطا در ایجاد دیتابیس اختصاصی.',
          details: result.steps,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'دیتابیس اختصاصی با موفقیت ایجاد شد!',
      data: {
        databaseName: result.databaseName,
        steps: result.steps,
      },
    });
  } catch (error: any) {
    console.error('[ProvisionIsolated] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور.' },
      { status: 500 }
    );
  }
}
