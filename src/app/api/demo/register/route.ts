// ============================================================================
// src/app/api/demo/register/route.ts — POST (v9.1 ★★★)
// ShopAccounting — Demo Trial Registration (Step 1: Send OTP)
// ----------------------------------------------------------------------------
// این API مرحله اول ثبت‌نام دمو است:
//   ۱. اعتبارسنجی شماره موبایل
//   ۲. بررسی اینکه آیا این شماره قبلاً دمو فعال داشته (هنوز منقضی نشده)
//   ۳. اگر دمو فعال دارد → خطا (نمی‌تواند دوباره دمو بزند)
//   ۴. اگر دمو قبلی منقضی شده → حذف خودکار + ادامه
//   ۵. ایجاد Tenant با status='demo_pending' (موقت)
//   ۶. تولید کد OTP و ذخیره در OtpCode (purpose='demo')
//   ۷. ارسال کد از طریق SMS (IPPanel)
//   ۸. بازگشت demoSessionId (که tenantId موقت است)
//
// ★ این مسیر عمومی است (نیاز به توکن ندارد)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  validateIranianMobile,
  generateOtpCode,
  generateDemoSubdomain,
  generateDemoCompanyName,
  sendDemoOtpSms,
  isDemoExpired,
  cleanupDemoTenant,
  DEMO_OTP_EXPIRY_MINUTES,
} from '@/lib/demo-utils'

export async function POST(request: NextRequest) {
  console.log('[Demo Register] POST /api/demo/register')

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
    console.log(`[Demo Register] Mobile: ${normalizedMobile}`)

    // ─── ۲. بررسی دمو فعال قبلی برای این شماره ─────────────────────
    // ★ پیدا کردن tenant های دمو با این شماره موبایل (ownerMobile)
    const existingDemos = await db.client.tenant.findMany({
      where: {
        ownerMobile: normalizedMobile,
        status: { in: ['demo', 'demo_pending'] },
      },
      select: {
        id: true,
        subDomain: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    console.log(`[Demo Register] Found ${existingDemos.length} existing demo(s) for this mobile`)

    for (const existing of existingDemos) {
      // ★ اگر دمو فعال است (هنوز منقضی نشده) → خطا
      if (existing.status === 'demo' && !isDemoExpired(existing)) {
        console.log(`[Demo Register] Active demo exists: ${existing.id}`)
        return NextResponse.json(
          {
            success: false,
            error: 'شما قبلاً تست دمو را شروع کرده‌اید و هنوز مدت آن به پایان نرسیده است. لطفاً پس از پایان مدت دمو، دوباره تلاش کنید یا یکی از پلن‌ها را خریداری کنید.',
            errorCode: 'ACTIVE_DEMO_EXISTS',
            data: {
              existingDemoSubdomain: existing.subDomain,
              expiresAt: existing.expiresAt,
            },
          },
          { status: 409 }
        )
      }

      // ★ اگر دمو منقضی شده یا demo_pending قدیمی → حذف کن
      console.log(`[Demo Register] Cleaning up old demo: ${existing.id} (status: ${existing.status})`)
      await cleanupDemoTenant(existing.id)
    }

    // ─── ۳. بررسی یکتا بودن زیردامنه ────────────────────────────────
    // ★ تولید زیردامنه و بررسی یکتا بودن (حداکثر ۵ تلاش)
    let subdomain = ''
    let subdomainUnique = false
    for (let i = 0; i < 5; i++) {
      subdomain = generateDemoSubdomain(normalizedMobile)
      const existing = await db.client.tenant.findFirst({
        where: { subDomain: subdomain },
        select: { id: true },
      })
      if (!existing) {
        subdomainUnique = true
        break
      }
    }

    if (!subdomainUnique) {
      console.error('[Demo Register] Could not generate unique subdomain after 5 attempts')
      return NextResponse.json(
        { success: false, error: 'خطا در تولید زیردامنه. لطفاً دوباره تلاش کنید.' },
        { status: 500 }
      )
    }

    // ─── ۴. ایجاد Tenant موقت (demo_pending) ────────────────────────
    const tenantId = `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = new Date()
    // ★ مدت اعتبار tenant موقت = مدت OTP (۱۰ دقیقه)
    //   پس از تأیید OTP، این مدت به ۳ روز افزایش می‌یابد
    const otpExpiry = new Date(now.getTime() + DEMO_OTP_EXPIRY_MINUTES * 60 * 1000)

    const tenant = await db.client.tenant.create({
      data: {
        id: tenantId,
        subDomain: subdomain,  // ★★★ fix: مپ متغیر subdomain به فیلد subDomain
        companyName: generateDemoCompanyName(normalizedMobile),
        ownerMobile: normalizedMobile,
        // ★ status='demo_pending' تا زمان تأیید OTP
        status: 'demo_pending',
        planName: 'simple',
        // ★ expiresAt موقت = زمان انقضای OTP
        expiresAt: otpExpiry,
        soldAt: now,
      },
    })

    console.log(`[Demo Register] ✓ Demo pending tenant created: ${tenant.id} (subdomain: ${subdomain})`)

    // ─── ۵. تولید و ذخیره کد OTP ────────────────────────────────────
    const otpCode = generateOtpCode()
    const otpExpiryDate = new Date(now.getTime() + DEMO_OTP_EXPIRY_MINUTES * 60 * 1000)

    // ★ ذخیره OTP در جدول OtpCode
    //   purpose='demo' برای تشخیص از OTP های دیگر
    await db.client.otpCode.create({
      data: {
        id: `otp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        tenantId: tenant.id,
        mobile: normalizedMobile,
        code: otpCode,
        purpose: 'demo',
        isUsed: false,
        attemptCount: 0,
        expiresAt: otpExpiryDate,
      },
    })

    console.log(`[Demo Register] ✓ OTP code generated and stored (expires at ${otpExpiryDate.toISOString()})`)

    // ─── ۶. ارسال SMS ───────────────────────────────────────────────
    const smsResult = await sendDemoOtpSms(normalizedMobile, otpCode)

    if (!smsResult.success) {
      console.error('[Demo Register] SMS send failed:', smsResult.error)
      // ★ حتی اگر SMS ارسال نشد، tenant را حذف می‌کنیم
      await cleanupDemoTenant(tenant.id)
      return NextResponse.json(
        { success: false, error: 'خطا در ارسال کد تأیید. لطفاً دوباره تلاش کنید.' },
        { status: 500 }
      )
    }

    // ─── ۷. بازگشت نتیجه ────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        demoSessionId: tenant.id,
        mobile: normalizedMobile,
        subdomain,
        mockMode: smsResult.mockMode,
        // ★ در محیط development، کد را برمی‌گردانیم برای نمایش
        devCode: smsResult.mockMode ? smsResult.devCode : undefined,
        expiresIn: DEMO_OTP_EXPIRY_MINUTES * 60, // ثانیه
      },
    })
  } catch (error: any) {
    console.error('[Demo Register] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در سرور: ' + (error?.message || 'unknown') },
      { status: 500 }
    )
  }
}
