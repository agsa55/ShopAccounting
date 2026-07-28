// ============================================================================
// src/app/api/demo/recover/route.ts — POST (v9.2.1 ★★★)
// ShopAccounting — Demo Login Recovery (Step 1: Send OTP)
// ----------------------------------------------------------------------------
// این API برای کاربرانی است که نام کاربری/رمز عبور دمو خود را فراموش کرده‌اند.
//
// مراحل:
//   ۱. دریافت موبایل
//   ۲. جستجوی tenant دمو با این موبایل
//   ۳. اگر دمو فعال دارد → ارسال OTP برای بازیابی
//   ۴. اگر دمو منقضی شده → خطا (باید دمو جدید بزند)
//   ۵. اگر دمو ندارد → خطا
//
// ★ این مسیر عمومی است (نیاز به توکن ندارد)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  validateIranianMobile,
  generateOtpCode,
  sendDemoOtpSms,
  isDemoExpired,
  cleanupDemoTenant,
  DEMO_OTP_EXPIRY_MINUTES,
} from '@/lib/demo-utils'

export async function POST(request: NextRequest) {
  console.log('[Demo Recover] POST /api/demo/recover')

  try {
    const body = await request.json()
    const { mobile } = body

    // ─── ۱. اعتبارسنجی موبایل ─────────────────────────────────────
    const mobileValidation = validateIranianMobile(mobile)
    if (!mobileValidation.valid || !mobileValidation.normalized) {
      return NextResponse.json(
        { success: false, error: mobileValidation.error || 'شماره موبایل نامعتبر است' },
        { status: 400 }
      )
    }

    const normalizedMobile = mobileValidation.normalized
    console.log(`[Demo Recover] Mobile: ${normalizedMobile}`)

    // ─── ۲. جستجوی tenant دمو فعال با این موبایل ────────────────────
    const demoTenant = await db.client.tenant.findFirst({
      where: {
        ownerMobile: normalizedMobile,
        status: 'demo',  // ★ فقط دموهای فعال (نه demo_pending)
      },
      include: {
        storeUsers: {
          where: { role: 'Admin' },
          select: { id: true, username: true, mobile: true },
          take: 1,
        },
      },
    })

    if (!demoTenant) {
      console.log(`[Demo Recover] No active demo found for ${normalizedMobile}`)
      return NextResponse.json(
        {
          success: false,
          error: 'هیچ تست دموی فعالی برای این شماره موبایل یافت نشد. ممکن است دمو شما منقضی شده باشد. لطفاً یک تست دمو جدید شروع کنید.',
          errorCode: 'NO_ACTIVE_DEMO',
        },
        { status: 404 }
      )
    }

    // ★ بررسی انقضا
    if (isDemoExpired(demoTenant)) {
      console.log(`[Demo Recover] Demo expired for ${normalizedMobile}, cleaning up...`)
      await cleanupDemoTenant(demoTenant.id)
      return NextResponse.json(
        {
          success: false,
          error: 'تست دمو شما منقضی شده است. لطفاً یک تست دمو جدید شروع کنید.',
          errorCode: 'DEMO_EXPIRED',
        },
        { status: 410 }
      )
    }

    // ★ بررسی وجود کاربر Admin
    if (!demoTenant.storeUsers || demoTenant.storeUsers.length === 0) {
      console.error(`[Demo Recover] No admin user found for demo tenant ${demoTenant.id}`)
      return NextResponse.json(
        { success: false, error: 'کاربر مدیر برای این دمو یافت نشد. لطفاً با پشتیبانی تماس بگیرید.' },
        { status: 500 }
      )
    }

    const adminUser = demoTenant.storeUsers[0]
    console.log(`[Demo Recover] ✓ Found active demo: ${demoTenant.subDomain} (user: ${adminUser.username})`)

    // ─── ۳. تولید و ذخیره کد OTP ────────────────────────────────────
    const otpCode = generateOtpCode()
    const now = new Date()
    const otpExpiryDate = new Date(now.getTime() + DEMO_OTP_EXPIRY_MINUTES * 60 * 1000)

    await db.client.otpCode.create({
      data: {
        id: `otp-recover-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        tenantId: demoTenant.id,
        mobile: normalizedMobile,
        code: otpCode,
        purpose: 'demo_recovery',  // ★ purpose متفاوت برای تشخیص
        isUsed: false,
        attemptCount: 0,
        expiresAt: otpExpiryDate,
      },
    })

    console.log(`[Demo Recover] ✓ OTP code generated (expires at ${otpExpiryDate.toISOString()})`)

    // ─── ۴. ارسال SMS ───────────────────────────────────────────────
    const smsResult = await sendDemoOtpSms(normalizedMobile, otpCode)

    if (!smsResult.success) {
      console.error('[Demo Recover] SMS send failed:', smsResult.error)
      return NextResponse.json(
        { success: false, error: 'خطا در ارسال کد تأیید. لطفاً دوباره تلاش کنید.' },
        { status: 500 }
      )
    }

    // ─── ۵. بازگشت نتیجه ────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        recoverySessionId: demoTenant.id,  // ★ برای مرحله بعد
        mobile: normalizedMobile,
        subdomain: demoTenant.subDomain,
        mockMode: smsResult.mockMode,
        devCode: smsResult.mockMode ? smsResult.devCode : undefined,
        expiresIn: DEMO_OTP_EXPIRY_MINUTES * 60,
      },
    })
  } catch (error: any) {
    console.error('[Demo Recover] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در سرور: ' + (error?.message || 'unknown') },
      { status: 500 }
    )
  }
}
