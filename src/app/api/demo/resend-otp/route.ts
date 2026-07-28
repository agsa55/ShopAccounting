// ============================================================================
// src/app/api/demo/resend-otp/route.ts — POST (v9.1 ★★★)
// ShopAccounting — Demo Trial: Resend OTP
// ----------------------------------------------------------------------------
// این API کد OTP جدید برای نشست دمو ارسال می‌کند.
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

// ★ Cooldown برای جلوگیری از abuse: ۶۰ ثانیه بین هر درخواست
const RESEND_COOLDOWN_SECONDS = 60

export async function POST(request: NextRequest) {
  console.log('[Demo Resend] POST /api/demo/resend-otp')

  try {
    const body = await request.json()
    const { mobile, demoSessionId } = body

    // ─── ۱. اعتبارسنجی ورودی‌ها ────────────────────────────────────
    if (!mobile || !demoSessionId) {
      return NextResponse.json(
        { success: false, error: 'شماره موبایل و شناسه نشوز الزامی هستند' },
        { status: 400 }
      )
    }

    const mobileValidation = validateIranianMobile(mobile)
    if (!mobileValidation.valid || !mobileValidation.normalized) {
      return NextResponse.json(
        { success: false, error: mobileValidation.error || 'شماره موبایل نامعتبر است' },
        { status: 400 }
      )
    }

    const normalizedMobile = mobileValidation.normalized

    // ─── ۲. یافتن Tenant موقت ───────────────────────────────────────
    const tenant = await db.client.tenant.findUnique({
      where: { id: demoSessionId },
    })

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'نشست دمو یافت نشد. لطفاً دوباره شروع کنید.' },
        { status: 404 }
      )
    }

    if (tenant.status !== 'demo_pending') {
      return NextResponse.json(
        { success: false, error: 'این نشست دمو معتبر نیست' },
        { status: 400 }
      )
    }

    if (isDemoExpired(tenant)) {
      await cleanupDemoTenant(tenant.id)
      return NextResponse.json(
        { success: false, error: 'مدت زمان وارد کردن کد به پایان رسیده است. لطفاً دوباره شروع کنید.' },
        { status: 410 }
      )
    }

    if (tenant.ownerMobile !== normalizedMobile) {
      return NextResponse.json(
        { success: false, error: 'شماره موبایل با نشست دمو مطابقت ندارد' },
        { status: 400 }
      )
    }

    // ─── ۳. بررسی cooldown ──────────────────────────────────────────
    // ★ پیدا کردن آخرین OTP ارسال شده برای این tenant
    const lastOtp = await db.client.otpCode.findFirst({
      where: {
        tenantId: tenant.id,
        purpose: 'demo',
      },
      orderBy: { createdAt: 'desc' },
    })

    if (lastOtp) {
      const secondsSinceLast = (Date.now() - lastOtp.createdAt.getTime()) / 1000
      if (secondsSinceLast < RESEND_COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLast)
        return NextResponse.json(
          {
            success: false,
            error: `لطفاً ${remainingSeconds} ثانیه دیگر صبر کنید و دوباره تلاش کنید.`,
            data: { cooldownRemaining: remainingSeconds },
          },
          { status: 429 }
        )
      }
    }

    // ─── ۴. علامت‌گذاری OTP قبلی به‌عنوان used ───────────────────────
    if (lastOtp && !lastOtp.isUsed) {
      await db.client.otpCode.update({
        where: { id: lastOtp.id },
        data: { isUsed: true },
      })
    }

    // ─── ۵. تولید و ذخیره کد OTP جدید ──────────────────────────────
    const newCode = generateOtpCode()
    const now = new Date()
    const otpExpiryDate = new Date(now.getTime() + DEMO_OTP_EXPIRY_MINUTES * 60 * 1000)

    await db.client.otpCode.create({
      data: {
        id: `otp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        tenantId: tenant.id,
        mobile: normalizedMobile,
        code: newCode,
        purpose: 'demo',
        isUsed: false,
        attemptCount: 0,
        expiresAt: otpExpiryDate,
      },
    })

    // ─── ۶. ارسال SMS ───────────────────────────────────────────────
    const smsResult = await sendDemoOtpSms(normalizedMobile, newCode)

    if (!smsResult.success) {
      console.error('[Demo Resend] SMS send failed:', smsResult.error)
      return NextResponse.json(
        { success: false, error: 'خطا در ارسال کد تأیید. لطفاً دوباره تلاش کنید.' },
        { status: 500 }
      )
    }

    console.log(`[Demo Resend] ✓ OTP resent to ${normalizedMobile}`)

    return NextResponse.json({
      success: true,
      data: {
        mobile: normalizedMobile,
        mockMode: smsResult.mockMode,
        devCode: smsResult.mockMode ? smsResult.devCode : undefined,
        expiresIn: DEMO_OTP_EXPIRY_MINUTES * 60,
        cooldownSeconds: RESEND_COOLDOWN_SECONDS,
      },
    })
  } catch (error: any) {
    console.error('[Demo Resend] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در سرور: ' + (error?.message || 'unknown') },
      { status: 500 }
    )
  }
}
