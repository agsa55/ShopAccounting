// ============================================================================
// src/app/api/demo/recover-verify/route.ts — POST (v9.2.1 ★★★)
// ShopAccounting — Demo Login Recovery (Step 2: Verify OTP + Reset Password)
// ----------------------------------------------------------------------------
// این API مرحله دوم بازیابی ورود دمو است:
//   ۱. دریافت mobile, code, recoverySessionId, newPassword (اختیاری)
//   ۲. تأیید OTP (purpose='demo_recovery')
//   ۳. پیدا کردن کاربر Admin دمو
//   ۴. اگر newPassword ارسال شده → رمز عبور را بازنشانی کن
//   ۵. تولید JWT tokens جدید
//   ۶. بازگشت tokens + tenant + user + subdomain (برای هدایت به داشبورد)
//
// ★ این مسیر عمومی است (نیاز به توکن ندارد)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import {
  validateIranianMobile,
  generateDemoPassword,
  isDemoExpired,
  cleanupDemoTenant,
} from '@/lib/demo-utils'
import { signTokenPair } from '@/lib/jwt'

export async function POST(request: NextRequest) {
  console.log('[Demo Recover Verify] POST /api/demo/recover-verify')

  try {
    const body = await request.json()
    const { mobile, code, recoverySessionId, newPassword } = body

    // ─── ۱. اعتبارسنجی ورودی‌ها ────────────────────────────────────
    if (!mobile || !code || !recoverySessionId) {
      return NextResponse.json(
        { success: false, error: 'شماره موبایل، کد تأیید و شناسه بازیابی الزامی هستند' },
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
    console.log(`[Demo Recover Verify] Mobile: ${normalizedMobile}, SessionId: ${recoverySessionId}`)

    // ─── ۲. یافتن Tenant دمو ────────────────────────────────────────
    const tenant = await db.client.tenant.findUnique({
      where: { id: recoverySessionId },
      include: {
        storeUsers: {
          where: { role: 'Admin' },
          take: 1,
        },
      },
    })

    if (!tenant) {
      console.error('[Demo Recover Verify] Demo session not found:', recoverySessionId)
      return NextResponse.json(
        { success: false, error: 'نشست بازیابی یافت نشد. لطفاً دوباره شروع کنید.' },
        { status: 404 }
      )
    }

    // ★ بررسی status
    if (tenant.status !== 'demo') {
      console.error('[Demo Recover Verify] Invalid tenant status:', tenant.status)
      return NextResponse.json(
        { success: false, error: 'این نشست بازیابی معتبر نیست' },
        { status: 400 }
      )
    }

    // ★ بررسی انقضا
    if (isDemoExpired(tenant)) {
      console.error('[Demo Recover Verify] Demo expired:', recoverySessionId)
      await cleanupDemoTenant(tenant.id)
      return NextResponse.json(
        { success: false, error: 'تست دمو شما منقضی شده است. لطفاً یک تست دمو جدید شروع کنید.' },
        { status: 410 }
      )
    }

    // ★ بررسی تطابق موبایل
    if (tenant.ownerMobile !== normalizedMobile) {
      console.error('[Demo Recover Verify] Mobile mismatch')
      return NextResponse.json(
        { success: false, error: 'شماره موبایل با نشست بازیابی مطابقت ندارد' },
        { status: 400 }
      )
    }

    // ─── ۳. یافتن کد OTP معتبر ─────────────────────────────────────
    const otpRecord = await db.client.otpCode.findFirst({
      where: {
        tenantId: tenant.id,
        mobile: normalizedMobile,
        purpose: 'demo_recovery',
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!otpRecord) {
      console.error('[Demo Recover Verify] No valid OTP found')
      return NextResponse.json(
        { success: false, error: 'کد تأیید معتبر نیست یا منقضی شده است. لطفاً کد جدید درخواست کنید.' },
        { status: 400 }
      )
    }

    // ─── ۴. بررسی تعداد تلاش‌ها ─────────────────────────────────────
    const MAX_ATTEMPTS = 5
    if (otpRecord.attemptCount >= MAX_ATTEMPTS) {
      console.error('[Demo Recover Verify] Max attempts exceeded')
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
      console.warn(`[Demo Recover Verify] Wrong code. Remaining attempts: ${remaining}`)

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
    console.log('[Demo Recover Verify] ✓ OTP verified successfully')

    // ─── ۶. پیدا کردن کاربر Admin ───────────────────────────────────
    if (!tenant.storeUsers || tenant.storeUsers.length === 0) {
      console.error('[Demo Recover Verify] No admin user found')
      return NextResponse.json(
        { success: false, error: 'کاربر مدیر یافت نشد. لطفاً با پشتیبانی تماس بگیرید.' },
        { status: 500 }
      )
    }

    const adminUser = tenant.storeUsers[0]

    // ─── ۷. بازنشانی رمز عبور ──────────────────────────────────────
    // ★ اگر newPassword ارسال شده → از آن استفاده کن
    // ★ در غیر این صورت → رمز عبور تصادفی جدید تولید کن
    const finalPassword = newPassword && newPassword.length >= 4
      ? newPassword
      : generateDemoPassword()

    const hashedPassword = await bcrypt.hash(finalPassword, 10)

    await db.client.storeUser.update({
      where: { id: adminUser.id },
      data: { password: hashedPassword },
    })

    console.log(`[Demo Recover Verify] ✓ Password reset for user: ${adminUser.username}`)

    // ─── ۸. علامت‌گذاری OTP به‌عنوان استفاده شده ───────────────────
    await db.client.otpCode.update({
      where: { id: otpRecord.id },
      data: {
        isUsed: true,
        verifiedAt: new Date(),
      },
    })

    // ─── ۹. تولید JWT tokens ───────────────────────────────────────
    const tokenPair = signTokenPair({
      userId: adminUser.id,
      username: adminUser.username,
      role: 'Admin',
      tenantId: tenant.id,
      userType: 'storeUser',
      permissions: ['all'],
      storeName: tenant.companyName || 'فروشگاه دمو',
    })

    console.log(`[Demo Recover Verify] ✓ JWT tokens generated`)

    // ─── ۱۰. بازگشت نتیجه ──────────────────────────────────────────
    const now = new Date()
    const expiresAt = tenant.expiresAt ? new Date(tenant.expiresAt) : null
    const daysRemaining = expiresAt
      ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0

    console.log(`[Demo Recover Verify] ✅ Recovery completed:`)
    console.log(`   Tenant: ${tenant.id}`)
    console.log(`   Subdomain: ${tenant.subDomain}`)
    console.log(`   Username: ${adminUser.username}`)
    console.log(`   Days remaining: ${daysRemaining}`)

    return NextResponse.json({
      success: true,
      data: {
        token: tokenPair.accessToken,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        user: {
          id: adminUser.id,
          username: adminUser.username,
          role: 'admin',
          mobile: normalizedMobile,
          tenantId: tenant.id,
          userType: 'storeUser',
          permissions: ['all'],
          storeName: tenant.companyName,
          // ★ نمایش رمز عبور جدید به کاربر
          demoPassword: finalPassword,
        },
        tenant: {
          id: tenant.id,
          subDomain: tenant.subDomain,
          companyName: tenant.companyName,
          status: tenant.status,
          isDemo: true,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          daysRemaining,
        },
      },
    })
  } catch (error: any) {
    console.error('[Demo Recover Verify] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در سرور: ' + (error?.message || 'unknown') },
      { status: 500 }
    )
  }
}
