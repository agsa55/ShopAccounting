/**
 * API Route: Get Current Tenant Info
 *
 * دریافت اطلاعات فروشگاه فعلی کاربر
 *
 * GET /api/tenants/current
 *
 * فایل: src/app/api/tenants/current/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest } from '@/lib/jwt';

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز.' },
        { status: 401 }
      );
    }

    // دریافت اطلاعات Tenant از MasterDB
    const tenant = await db.master.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        id: true,
        subDomain: true,
        companyName: true,
        planName: true,
        status: true,
        isIsolated: true,
        dbName: true,
        ownerName: true,
        ownerMobile: true,
        ownerEmail: true,
        address: true,
        logoUrl: true,
        createdAt: true,
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد.' },
        { status: 404 }
      );
    }

    // دریافت اطلاعات اشتراک
    const subscription = await db.master.subscription.findFirst({
      where: {
        tenantId: user.tenantId,
        status: 'active',
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    // دریافت تنظیمات فروشگاه
    const sharedDb = await db.forTenant(user.tenantId);
    const settings = await sharedDb.storeSetting.findFirst({
      where: { tenantId: user.tenantId },
    });

    // تعداد کاربران
    const userCount = await sharedDb.storeUser.count({
      where: { tenantId: user.tenantId, isActive: true },
    });

    // تعداد محصولات
    const productCount = await sharedDb.product.count({
      where: { tenantId: user.tenantId, isActive: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        tenant,
        subscription: subscription
          ? {
              planName: subscription.plan.name,
              planNameFa: subscription.plan.nameFa,
              startDate: subscription.startDate,
              endDate: subscription.endDate,
              autoRenew: subscription.autoRenew,
              maxUsers: subscription.plan.maxUsers,
              maxProducts: subscription.plan.maxProducts,
            }
          : null,
        settings,
        stats: {
          activeUsers: userCount,
          activeProducts: productCount,
        },
        database: {
          isIsolated: tenant.isIsolated,
          dbName: tenant.dbName,
          type: tenant.isIsolated ? 'اختصاصی' : 'مشترک',
        },
      },
    });
  } catch (error: any) {
    console.error('[CurrentTenant] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'خطا در دریافت اطلاعات فروشگاه.' },
      { status: 500 }
    );
  }
}
