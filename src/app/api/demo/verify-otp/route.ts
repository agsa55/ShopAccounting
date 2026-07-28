// ============================================================================
// src/app/api/demo/verify-otp/route.ts — POST (v9.1 ★★★)
// ShopAccounting — Demo Trial Registration (Step 2: Verify OTP + Activate Demo)
// ----------------------------------------------------------------------------
// این API مرحله دوم ثبت‌نام دمو است:
//   ۱. دریافت mobile, code, demoSessionId
//   ۲. یافتن کد OTP معتبر (purpose='demo', isUsed=false, expiresAt > now)
//   ۳. بررسی کد وارد شده (حداکثر ۵ تلاش)
//   ۴. اگر معتبر:
//      - یافتن PlanTier با name='simple'
//      - ایجاد StoreUser (Admin) با username/password تصادفی
//      - ایجاد UserLookups
//      - به‌روزرسانی Tenant: status='demo', expiresAt=NOW()+3days, planTierId, billingCycle
//      - علامت‌گذاری OTP به‌عنوان isUsed=true
//      - تولید JWT tokens (با signTokenPair)
//      - بازگشت tokens + tenant + user
//
// ★ این مسیر عمومی است (نیاز به توکن ندارد)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import {
  validateIranianMobile,
  generateDemoUsername,
  generateDemoPassword,
  DEMO_DURATION_DAYS,
  isDemoExpired,
  cleanupDemoTenant,
} from '@/lib/demo-utils'
import { signTokenPair } from '@/lib/jwt'

export async function POST(request: NextRequest) {
  console.log('[Demo Verify] POST /api/demo/verify-otp')

  try {
    const body = await request.json()
    const { mobile, code, demoSessionId } = body

    // ─── ۱. اعتبارسنجی ورودی‌ها ────────────────────────────────────
    if (!mobile || !code || !demoSessionId) {
      return NextResponse.json(
        { success: false, error: 'شماره موبایل، کد تأیید و شناسه نشوز الزامی هستند' },
        { status: 400 }
      )
    }

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { success: false, error: 'کد تأیید باید ۶ رقم باشد' },
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
    console.log(`[Demo Verify] Mobile: ${normalizedMobile}, SessionId: ${demoSessionId}`)

    // ─── ۲. یافتن Tenant موقت ───────────────────────────────────────
    const tenant = await db.client.tenant.findUnique({
      where: { id: demoSessionId },
    })

    if (!tenant) {
      console.error('[Demo Verify] Demo session not found:', demoSessionId)
      return NextResponse.json(
        { success: false, error: 'نشست دمو یافت نشد. لطفاً دوباره شروع کنید.' },
        { status: 404 }
      )
    }

    // ★ بررسی status
    if (tenant.status !== 'demo_pending') {
      console.error('[Demo Verify] Invalid tenant status:', tenant.status)
      return NextResponse.json(
        { success: false, error: 'این نشست دمو معتبر نیست (قبلاً استفاده شده یا منقضی شده)' },
        { status: 400 }
      )
    }

    // ★ بررسی انقضای tenant موقت
    if (isDemoExpired(tenant)) {
      console.error('[Demo Verify] Demo session expired:', demoSessionId)
      // ★ حذف tenant موقت منقضی شده
      await cleanupDemoTenant(tenant.id)
      return NextResponse.json(
        { success: false, error: 'مدت زمان وارد کردن کد به پایان رسیده است. لطفاً دوباره شروع کنید.' },
        { status: 410 }
      )
    }

    // ★ بررسی تطابق موبایل
    if (tenant.ownerMobile !== normalizedMobile) {
      console.error('[Demo Verify] Mobile mismatch')
      return NextResponse.json(
        { success: false, error: 'شماره موبایل با نشست دمو مطابقت ندارد' },
        { status: 400 }
      )
    }

    // ─── ۳. یافتن کد OTP معتبر ─────────────────────────────────────
    const otpRecord = await db.client.otpCode.findFirst({
      where: {
        tenantId: tenant.id,
        mobile: normalizedMobile,
        purpose: 'demo',
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!otpRecord) {
      console.error('[Demo Verify] No valid OTP found')
      return NextResponse.json(
        { success: false, error: 'کد تأیید معتبر نیست یا منقضی شده است. لطفاً کد جدید درخواست کنید.' },
        { status: 400 }
      )
    }

    // ─── ۴. بررسی تعداد تلاش‌ها ─────────────────────────────────────
    const MAX_ATTEMPTS = 5
    if (otpRecord.attemptCount >= MAX_ATTEMPTS) {
      console.error('[Demo Verify] Max attempts exceeded')
      // ★ علامت‌گذاری به‌عنوان used برای جلوگیری از استفاده مجدد
      await db.client.otpCode.update({
        where: { id: otpRecord.id },
        data: { isUsed: true },
      })
      return NextResponse.json(
        { success: false, error: 'تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً کد جدید درخواست کنید.' },
        { status: 429 }
      )
    }

    // ─── ۵. بررسی کد وارد شده ──────────────────────────────────────
    if (otpRecord.code !== code) {
      // ★ افزایش تعداد تلاش‌ها
      await db.client.otpCode.update({
        where: { id: otpRecord.id },
        data: { attemptCount: { increment: 1 } },
      })

      const remaining = MAX_ATTEMPTS - (otpRecord.attemptCount + 1)
      console.warn(`[Demo Verify] Wrong code. Remaining attempts: ${remaining}`)

      return NextResponse.json(
        {
          success: false,
          error: `کد تأیید اشتباه است. ${remaining} تلاش باقی‌مانده.`,
          data: { remainingAttempts: remaining },
        },
        { status: 400 }
      )
    }

    // ★ کد درست است!
    console.log('[Demo Verify] ✓ OTP verified successfully')

    // ─── ۶. یافتن PlanTier با name='simple' ─────────────────────────
    let planTier: any = null
    try {
      planTier = await db.client.planTier.findFirst({
        where: { name: 'simple', isActive: true },
      })
      console.log(`[Demo Verify] PlanTier: ${planTier ? `id=${planTier.id}` : 'NOT FOUND'}`)
    } catch (err: any) {
      console.warn(`[Demo Verify] PlanTier lookup failed: ${err.message}`)
    }

    if (!planTier) {
      console.error('[Demo Verify] PlanTier "simple" not found')
      return NextResponse.json(
        { success: false, error: 'پلن پایه در سیستم یافت نشد. لطفاً با پشتیبانی تماس بگیرید.' },
        { status: 500 }
      )
    }

    // ─── ۷. ایجاد StoreUser (Admin) ─────────────────────────────────
    const username = generateDemoUsername(normalizedMobile)
    const password = generateDemoPassword()
    const hashedPassword = await bcrypt.hash(password, 10)

    // ★ بررسی یکتا بودن username (در صورت تکرار، تلاش مجدد)
    let finalUsername = username
    for (let i = 0; i < 3; i++) {
      const existingUser = await db.client.storeUser.findFirst({
        where: { username: finalUsername },
      })
      if (!existingUser) break
      finalUsername = `${username}${i + 1}`
    }

    const adminUser = await db.client.storeUser.create({
      data: {
        username: finalUsername,
        password: hashedPassword,
        mobile: normalizedMobile,
        role: 'Admin',
        isActive: true,
        tenantId: tenant.id,
        storeName: tenant.companyName,
      },
    })

    console.log(`[Demo Verify] ✓ Admin user created: ${finalUsername} (id: ${adminUser.id})`)

    // ─── ۸. ایجاد UserLookups ───────────────────────────────────────
    try {
      await db.client.userLookups.create({
        data: {
          id: `lookup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          username: finalUsername,
          tenantId: tenant.id,
          userType: 'storeUser',
          isActive: true,
        },
      })
      console.log('[Demo Verify] ✓ UserLookup created')
    } catch (lookupError: any) {
      console.warn('[Demo Verify] UserLookup create skipped:', lookupError.message)
    }

    // ─── ۹. به‌روزرسانی Tenant به status='demo' ─────────────────────
    const now = new Date()
    const demoExpiresAt = new Date(now.getTime() + DEMO_DURATION_DAYS * 24 * 60 * 60 * 1000)

    await db.client.tenant.update({
      where: { id: tenant.id },
      data: {
        // ★ فعال‌سازی دمو
        status: 'demo',
        // ★ مدت دمو = ۳ روز از الان
        expiresAt: demoExpiresAt,
        soldAt: now,
        // ★ اطلاعات پلن
        planName: 'simple',
        planTierId: planTier.id,
        billingCycle: 'annual', // ★ از پلن سالانه استفاده می‌کنیم ولی مدت ۳ روز است
      },
    })

    console.log(`[Demo Verify] ✓ Tenant activated as demo (expires at ${demoExpiresAt.toISOString()})`)

    // ─── ۱۰. علامت‌گذاری OTP به‌عنوان استفاده شده ───────────────────
    await db.client.otpCode.update({
      where: { id: otpRecord.id },
      data: {
        isUsed: true,
        verifiedAt: now,
      },
    })

    // ─── ۱۱. تولید JWT tokens ──────────────────────────────────────
    const tokenPair = signTokenPair({
      userId: adminUser.id,
      username: finalUsername,
      role: 'Admin',
      tenantId: tenant.id,
      userType: 'storeUser',
      permissions: ['all'],
      storeName: tenant.companyName || 'فروشگاه دمو',
    })

    console.log(`[Demo Verify] ✓ JWT tokens generated (expires in ${tokenPair.expiresIn}s)`)

    // ─── ۱۲. بازگشت نتیجه ──────────────────────────────────────────
    console.log(`[Demo Verify] ✅ Demo activated successfully:`)
    console.log(`   Tenant: ${tenant.id}`)
    console.log(`   Subdomain: ${tenant.subDomain}`)
    console.log(`   Username: ${finalUsername}`)
    console.log(`   Demo expires at: ${demoExpiresAt.toISOString()}`)
    console.log(`   Days remaining: ${DEMO_DURATION_DAYS}`)

    return NextResponse.json({
      success: true,
      data: {
        token: tokenPair.accessToken,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        user: {
          id: adminUser.id,
          username: finalUsername,
          role: 'admin',
          mobile: normalizedMobile,
          tenantId: tenant.id,
          userType: 'storeUser',
          permissions: ['all'],
          storeName: tenant.companyName,
          // ★ نمایش رمز عبور دمو به کاربر (تا بتواند بعداً وارد شود)
          demoPassword: password,
        },
        tenant: {
          id: tenant.id,
          subDomain: tenant.subDomain,
          companyName: tenant.companyName,
          planTierId: planTier.id,
          planTierName: planTier.name,
          planTierNameFa: planTier.nameFa || 'پایه',
          billingCycle: 'annual',
          isDemo: true,
          isTrial: false,
          status: 'demo',
          isIsolated: false,
          expiresAt: demoExpiresAt.toISOString(),
          daysRemaining: DEMO_DURATION_DAYS,
        },
      },
    })
  } catch (error: any) {
    console.error('[Demo Verify] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در سرور: ' + (error?.message || 'unknown') },
      { status: 500 }
    )
  }
}
