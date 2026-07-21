/**
 * API Route: Verify OTP
 *
 * تأیید کد OTP برای فعال‌سازی حساب فروشگاه
 *
 * POST /api/tenants/verify-otp
 *
 * فایل: src/app/api/tenants/verify-otp/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mobile, code, purpose } = body;

    if (!mobile || !code) {
      return NextResponse.json(
        { success: false, error: 'شماره موبایل و کد تأیید الزامی است.' },
        { status: 400 }
      );
    }

    // ۱. جستجوی OTP معتبر
    const otp = await db.master.otpCode.findFirst({
      where: {
        mobile,
        code,
        purpose: purpose || 'registration',
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      return NextResponse.json(
        { success: false, error: 'کد تأیید نامعتبر یا منقضی شده است.' },
        { status: 400 }
      );
    }

    // ۲. علامت‌گذاری OTP به عنوان استفاده شده
    await db.master.otpCode.update({
      where: { id: otp.id },
      data: { isUsed: true },
    });

    // ۳. فعال‌سازی Tenant
    await db.master.tenant.update({
      where: { id: otp.tenantId },
      data: { status: 'active' },
    });

    // ۴. فعال‌سازی PortalUser
    await db.master.portalUser.updateMany({
      where: { tenantId: otp.tenantId },
      data: { isActive: true },
    });

    // ۵. فعال‌سازی UserLookup
    await db.master.userLookup.updateMany({
      where: { tenantId: otp.tenantId },
      data: { isActive: true },
    });

    // ۶. فعال‌سازی StoreUser
    const sharedDb = await db.forTenant(otp.tenantId);
    await sharedDb.storeUser.updateMany({
      where: { tenantId: otp.tenantId },
      data: { isActive: true },
    });

    // ۷. ثبت AuditLog
    await db.master.auditLog.create({
      data: {
        id: require('crypto').randomUUID(),
        tenantId: otp.tenantId,
        action: 'tenant.verified',
        entityType: 'Tenant',
        entityId: otp.tenantId,
        details: JSON.stringify({ mobile, purpose: purpose || 'registration' }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'حساب شما با موفقیت فعال شد. اکنون می‌توانید وارد شوید.',
      data: {
        tenantId: otp.tenantId,
      },
    });
  } catch (error: any) {
    console.error('[VerifyOTP] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'خطا در تأیید کد.' },
      { status: 500 }
    );
  }
}
