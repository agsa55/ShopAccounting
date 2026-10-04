// ============================================================================
// src/app/api/admin/tenants/[id]/lock/route.ts — v12.0 ★★★
// ShopAccounting — Admin Manual Lock / Unlock with Smart State Management
// ----------------------------------------------------------------------------
// ★ v12.0: بهبود منطق باز کردن قفل برای سازگاری با جریان پرداخت
//   - وقتی ادمین قفل را باز می‌کند، فقط isLocked=false می‌شود.
//   - اگر کاربر هنوز پرداخت نکرده (isPaid=false)، او می‌تواند وارد سیستم شود
//     و به صفحه "به‌روزرسانی" هدایت گردد تا پرداخت کند.
//   - اگر کاربر پرداخت کرده باشد، سیستم کاملاً فعال است.
// ★ v12.0: افزودن متادیتای زمان‌سنجی برای دیباگ
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════════
//  POST: قفل کردن فروشگاه توسط ادمین
// ═══════════════════════════════════════════════════════════════
export async function POST(
  req: NextRequest,
  context: any
) {
  const startTime = Date.now();
  console.log('\n[Lock v12.0] 📥 POST request received');

  try {
    // پشتیبانی از Next.js 14+ Async Params
    const resolvedParams = await Promise.resolve(context.params);
    const tenantId = String(resolvedParams.id || '').trim();

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فروشگاه نامعتبر است' },
        { status: 400 }
      );
    }

    // خواندن بدنه درخواست
    let lockReason = 'قفل شده توسط مدیریت';
    let lockedByAdmin = 'admin'; // پیش‌فرض امن
    
    try {
      const body = await req.json();
      if (body.reason && typeof body.reason === 'string') {
        lockReason = body.reason.trim().slice(0, 200); // محدود کردن طول
      }
      if (body.adminName && typeof body.adminName === 'string') {
        lockedByAdmin = body.adminName.trim().slice(0, 50);
      }
    } catch {
      // اگر بدنه JSON نبود یا خطا داد، از مقادیر پیش‌فرض استفاده می‌کنیم
    }

    console.log(`[Lock v12.0] 🏪 Target Tenant: ${tenantId}`);
    console.log(`[Lock v12.0] 👤 Admin: ${lockedByAdmin}`);
    console.log(`[Lock v12.0] 💬 Reason: ${lockReason}`);

    // ۱. بررسی وجود فروشگاه
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        companyName: true,
        subDomain: true,
        isLocked: true,
        isPaid: true,
        billingCycle: true,
        expiresAt: true,
      },
    });

    if (!tenant) {
      console.warn('[Lock v12.0] ❌ Tenant not found');
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد' },
        { status: 404 }
      );
    }

    // ۲. بررسی وضعیت فعلی
    if (tenant.isLocked) {
      console.warn('[Lock v12.0] ⚠️ Tenant already locked');
      return NextResponse.json(
        { 
          success: false, 
          error: 'این فروشگاه قبلاً قفل شده است',
          data: { currentStatus: 'locked' }
        },
        { status: 400 }
      );
    }

    // ۳. اعمال قفل
    const now = new Date();
    
    const updated = await db.client.tenant.update({
      where: { id: tenantId },
      data: {
        isLocked: true,
        lockedAt: now,
        lockReason: lockReason,
        lockedByAdmin: lockedByAdmin,
        // نکته مهم: ما isPaid را تغییر نمی‌دهیم.
        // حتی اگر کاربر پول داده باشد، ادمین می‌تواند دسترسی را قطع کند.
      },
    });

    const duration = Date.now() - startTime;
    console.log(`[Lock v12.0] ✅ Locked in ${duration}ms | Company: ${updated.companyName}`);

    return NextResponse.json({
      success: true,
      message: 'فروشگاه با موفقیت قفل شد',
      data: {
        id: updated.id,
        companyName: updated.companyName,
        subDomain: updated.subDomain,
        isLocked: updated.isLocked,
        lockedAt: updated.lockedAt?.toISOString(),
        lockReason: updated.lockReason,
        lockedByAdmin: updated.lockedByAdmin,
        previousIsPaid: tenant.isPaid, // اطلاع رسانی به ادمین
        processingTimeMs: duration,
      },
    });

  } catch (error: any) {
    console.error('[Lock v12.0] 💥 Unexpected Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'خطای داخلی سرور در قفل کردن فروشگاه',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
//  DELETE: باز کردن قفل فروشگاه توسط ادمین
// ═══════════════════════════════════════════════════════════════
export async function DELETE(
  req: NextRequest,
  context: any
) {
  const startTime = Date.now();
  console.log('\n[Unlock v12.0] 📥 DELETE request received');

  try {
    const resolvedParams = await Promise.resolve(context.params);
    const tenantId = String(resolvedParams.id || '').trim();

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فروشگاه نامعتبر است' },
        { status: 400 }
      );
    }

    console.log(`[Unlock v12.0] 🏪 Target Tenant: ${tenantId}`);

    // ۱. بررسی وجود فروشگاه
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        companyName: true,
        subDomain: true,
        isLocked: true,
        isPaid: true,
        billingCycle: true,
        expiresAt: true,
        lockReason: true,
        lockedAt: true,
      },
    });

    if (!tenant) {
      console.warn('[Unlock v12.0] ❌ Tenant not found');
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد' },
        { status: 404 }
      );
    }

    // ۲. بررسی وضعیت فعلی
    if (!tenant.isLocked) {
      console.warn('[Unlock v12.0] ⚠️ Tenant is not locked');
      return NextResponse.json(
        { 
          success: false, 
          error: 'این فروشگاه در حال حاضر قفل نیست',
          data: { currentStatus: 'active_or_unpaid' }
        },
        { status: 400 }
      );
    }

    // ۳. باز کردن قفل
    // نکته کلیدی: ما فقط isLocked را false می‌کنیم.
    // اگر کاربر هنوز پرداخت نکرده باشد (isPaid=false)، او اکنون می‌تواند
    // وارد داشبورد شود، اما Middleware احتمالاً او را به صفحه Upgrade می‌برد.
    // این رفتاری صحیح و مورد انتظار است.
    
    const updated = await db.client.tenant.update({
      where: { id: tenantId },
      data: {
        isLocked: false,
        lockedAt: null,
        lockReason: null,
        lockedByAdmin: null,
        // آخرین فعالیت را به روز می‌کنیم تا سیستم غیرفعال تلقی نشود
        lastActivityAt: new Date(), 
      },
    });

    const duration = Date.now() - startTime;
    
    console.log(`[Unlock v12.0] ✅ Unlocked in ${duration}ms | Company: ${updated.companyName}`);
    console.log(`[Unlock v12.0] ℹ️ Payment Status After Unlock: ${updated.isPaid ? 'PAID' : 'UNPAID/TRIAL'}`);

    return NextResponse.json({
      success: true,
      message: 'قفل فروشگاه با موفقیت باز شد',
      data: {
        id: updated.id,
        companyName: updated.companyName,
        subDomain: updated.subDomain,
        isLocked: updated.isLocked,
        isPaid: updated.isPaid,
        billingCycle: updated.billingCycle,
        canAccessSystem: true, // همیشه true بعد از باز کردن قفل
        needsPayment: !updated.isPaid && updated.billingCycle !== 'lifetime',
        processingTimeMs: duration,
      },
    });

  } catch (error: any) {
    console.error('[Unlock v12.0] 💥 Unexpected Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'خطای داخلی سرور در باز کردن قفل فروشگاه',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      },
      { status: 500 }
    );
  }
}