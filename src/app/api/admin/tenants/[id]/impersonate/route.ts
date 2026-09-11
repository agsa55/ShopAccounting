// ============================================================================
// src/app/api/admin/tenants/[id]/impersonate/route.ts — v11.3
// ★ اصلاح کامل ورود ادمین به داشبورد فروشگاه
// ★ استفاده از signTokenPair (همانند ثبت‌نام)
// ★ تنظیم کوکی‌های لازم (توکن + tenant-slug)
// ★ بازگرداندن اطلاعات کاربر و فروشگاه برای ذخیره در کلاینت
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { signTokenPair } from '@/lib/jwt';

export async function POST(
  req: NextRequest,
  context: any
) {
  console.log('\n[Impersonate] 📥 POST request received');
  
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const tenantId = resolvedParams.id;

    if (!tenantId) {
      console.log('[Impersonate] ❌ No tenantId provided');
      return NextResponse.json(
        { success: false, error: 'شناسه فروشگاه نامعتبر است' },
        { status: 400 }
      );
    }

    console.log(`[Impersonate] 🏪 Tenant ID: ${tenantId}`);

    // ─── ۱. بررسی وجود فروشگاه ───
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      console.log('[Impersonate] ❌ Tenant not found');
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد' },
        { status: 404 }
      );
    }

    if (tenant.status === 'deleted') {
      console.log('[Impersonate] ❌ Tenant is deleted');
      return NextResponse.json(
        { success: false, error: 'این فروشگاه حذف شده است' },
        { status: 403 }
      );
    }

    console.log(`[Impersonate] ✅ Tenant found: ${tenant.companyName} (status: ${tenant.status})`);

    // ─── ۲. پیدا کردن کاربر اصلی (اولین کاربر = مالک) ───
    const storeUser = await db.client.storeUser.findFirst({
      where: { 
        tenantId: tenant.id,
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!storeUser) {
      console.log('[Impersonate] ❌ No active user found for tenant');
      return NextResponse.json(
        { success: false, error: 'هیچ کاربر فعالی در این فروشگاه وجود ندارد' },
        { status: 404 }
      );
    }

    console.log(`[Impersonate] 👤 User found: ${storeUser.username} (role: ${storeUser.role})`);

    // ─── ۳. ★ ساخت توکن با signTokenPair (همانند ثبت‌نام) ───
 const tokenPayload = {
  userId: storeUser.id,
  username: storeUser.username,
  role: storeUser.role || 'Admin',
  tenantId: tenant.id,
  userType: 'storeUser' as const,  // ★ رفع خطا با as const
  permissions: ['all'],
  storeName: tenant.companyName,
};

    const tokenPair = signTokenPair(tokenPayload);

    console.log('[Impersonate] 🔑 Token pair generated');
    console.log('[Impersonate] Payload:', JSON.stringify(tokenPayload, null, 2));

    // ─── ۴. ساخت پاسخ ───
    const response = NextResponse.json({ 
      success: true, 
      message: 'ورود موفقیت‌آمیز',
      data: {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        user: {
          id: storeUser.id,
          username: storeUser.username,
          role: storeUser.role,
          tenantId: tenant.id,
          userType: 'storeUser',
          permissions: ['all'],
          storeName: tenant.companyName,
        },
        tenant: {
          id: tenant.id,
          subDomain: tenant.subDomain,
          companyName: tenant.companyName,
          planName: tenant.planName,
          billingCycle: tenant.billingCycle,
          status: tenant.status,
          isPaid: tenant.isPaid,
          expiresAt: tenant.expiresAt?.toISOString() || null,
          trialEndAt: tenant.trialEndAt?.toISOString() || null,
        },
      },
    });

    // ─── ۵. ★ تنظیم کوکی tenant-slug ───
    const isProduction = process.env.NODE_ENV === 'production';
    
    response.cookies.set('tenant-slug', tenant.subDomain, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 روز
    });

    // ─── ۶. ★ تنظیم کوکی توکن (برای احراز هویت در Middleware) ───
    response.cookies.set('token', tokenPair.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60, // ۱ ساعت
    });

    // ─── ۷. تنظیم کوکی Refresh Token ───
    if (tokenPair.refreshToken) {
      response.cookies.set('refreshToken', tokenPair.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // ۷ روز
      });
    }

    console.log(`[Impersonate] ✅ Success! Redirecting to dashboard for: ${tenant.companyName}`);
    console.log(`[Impersonate] 🍪 Cookies set: tenant-slug=${tenant.subDomain}, token=***`);

    return response;
  } catch (error: any) {
    console.error('[Impersonate] ❌ Error:', error.message);
    console.error('[Impersonate] Stack:', error.stack);
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور: ' + error.message },
      { status: 500 }
    );
  }
}