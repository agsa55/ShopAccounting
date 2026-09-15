// ============================================================================
// src/app/api/admin/tenants/[id]/lock/route.ts — v11.4
// ★ API قفل و باز کردن قفل فروشگاه توسط ادمین
// ★ POST: قفل کردن (با دلیل و نام ادمین)
// ★ DELETE: باز کردن قفل
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ─── POST: قفل کردن فروشگاه ───
export async function POST(
  req: NextRequest,
  context: any
) {
  console.log('\n[Lock] 📥 POST request received');
  
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const tenantId = resolvedParams.id;

    if (!tenantId) {
      console.log('[Lock] ❌ No tenantId provided');
      return NextResponse.json(
        { success: false, error: 'شناسه فروشگاه نامعتبر است' },
        { status: 400 }
      );
    }

    console.log(`[Lock] 🏪 Tenant ID: ${tenantId}`);

    // خواندن دلیل قفل و نام ادمین از بدنه درخواست
    let lockReason = 'قفل شده توسط مدیریت';
    let lockedByAdmin = 'admin';
    try {
      const body = await req.json();
      if (body.reason) lockReason = body.reason;
      if (body.adminName) lockedByAdmin = body.adminName;
    } catch {
      // اگر بدنه‌ای نبود، از مقادیر پیش‌فرض استفاده کن
    }

    // بررسی وجود فروشگاه
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      console.log('[Lock] ❌ Tenant not found');
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد' },
        { status: 404 }
      );
    }

    if (tenant.isLocked) {
      console.log('[Lock] ⚠️ Tenant already locked');
      return NextResponse.json(
        { success: false, error: 'این فروشگاه قبلاً قفل شده است' },
        { status: 400 }
      );
    }

    // قفل کردن فروشگاه
    const updated = await db.client.tenant.update({
      where: { id: tenantId },
      data: {
        isLocked: true,
        lockedAt: new Date(),
        lockReason: lockReason,
        lockedByAdmin: lockedByAdmin,
      },
    });

    console.log(`[Lock] 🔒 Tenant locked: ${tenantId}`);
    console.log(`[Lock]    Company: ${tenant.companyName}`);
    console.log(`[Lock]    Reason: ${lockReason}`);
    console.log(`[Lock]    By: ${lockedByAdmin}`);

    return NextResponse.json({
      success: true,
      message: 'فروشگاه با موفقیت قفل شد',
      data: {
        id: updated.id,
        companyName: updated.companyName,
        isLocked: updated.isLocked,
        lockedAt: updated.lockedAt,
        lockReason: updated.lockReason,
        lockedByAdmin: updated.lockedByAdmin,
      },
    });
  } catch (error: any) {
    console.error('[Lock] ❌ Error:', error.message);
    console.error('[Lock] Stack:', error.stack);
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور: ' + error.message },
      { status: 500 }
    );
  }
}

// ─── DELETE: باز کردن قفل فروشگاه ───
export async function DELETE(
  req: NextRequest,
  context: any
) {
  console.log('\n[Unlock] 📥 DELETE request received');
  
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const tenantId = resolvedParams.id;

    if (!tenantId) {
      console.log('[Unlock] ❌ No tenantId provided');
      return NextResponse.json(
        { success: false, error: 'شناسه فروشگاه نامعتبر است' },
        { status: 400 }
      );
    }

    console.log(`[Unlock] 🏪 Tenant ID: ${tenantId}`);

    // بررسی وجود فروشگاه
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      console.log('[Unlock] ❌ Tenant not found');
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد' },
        { status: 404 }
      );
    }

    if (!tenant.isLocked) {
      console.log('[Unlock] ⚠️ Tenant is not locked');
      return NextResponse.json(
        { success: false, error: 'این فروشگاه قفل نیست' },
        { status: 400 }
      );
    }

    // باز کردن قفل فروشگاه
    const updated = await db.client.tenant.update({
      where: { id: tenantId },
      data: {
        isLocked: false,
        lockedAt: null,
        lockReason: null,
        lockedByAdmin: null,
      },
    });

    console.log(`[Unlock] 🔓 Tenant unlocked: ${tenantId}`);
    console.log(`[Unlock]    Company: ${tenant.companyName}`);

    return NextResponse.json({
      success: true,
      message: 'قفل فروشگاه با موفقیت باز شد',
      data: {
        id: updated.id,
        companyName: updated.companyName,
        isLocked: updated.isLocked,
      },
    });
  } catch (error: any) {
    console.error('[Unlock] ❌ Error:', error.message);
    console.error('[Unlock] Stack:', error.stack);
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور: ' + error.message },
      { status: 500 }
    );
  }
}