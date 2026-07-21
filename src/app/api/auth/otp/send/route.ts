// ============================================================================
// src/app/api/auth/otp/send/route.ts — POST /api/auth/otp/send (v3.37 ★★★)
// ----------------------------------------------------------------------------
// ★★★ v3.37: مهاجرت از SMS.ir به IPPanel
//   - استفاده از src/lib/sms/ippanel.ts
//   - کد OTP ۶ رقمی (به‌جای ۴ رقمی)
//   - متغیر پترن: pass
//   - خط خدماتی: +983000505
//   - API: https://edge.ippanel.com/v1/api/send
//
// ★ نحوه کار:
//   ۱. اگه IPPANEL_API_KEY نباشه → mock mode (کد در کنسول)
//   ۲. اگه IPPANEL_OTP_PATTERN_CODE نباشه → fallback (کد در کنسول)
//   ۳. در غیر این صورت → ارسال از طریق IPPanel
// ============================================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'
import { sendOtpViaIpPanel, generateOtpCode } from '@/lib/sms/ippanel'

// ─── تنظیمات OTP ────────────────────────────────────────────
const OTP_LENGTH = 6                    // ★★★ v3.37: ۶ رقمی (به‌جای ۴)
const OTP_EXPIRY_MINUTES = 2
const COOLDOWN_SECONDS = 60
const RATE_LIMIT_MAX = 3
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000 // ۱۰ دقیقه

// ─── In-memory rate limiting ────────────────────────────────
const otpRequests = new Map<string, { count: number; firstRequestAt: number }>()

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, value] of otpRequests.entries()) {
      if (now - value.firstRequestAt > RATE_LIMIT_WINDOW_MS) {
        otpRequests.delete(key)
      }
    }
  }, 10 * 60 * 1000)
}

// ═══════════════════════════════════════════════════════════════
//  POST /api/auth/otp/send
// ═══════════════════════════════════════════════════════════════
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { mobile, purpose, tenantId } = body

    // ─── اعتبارسنجی ورودی‌ها ─────────────────────────────────
    if (!mobile) {
      return NextResponse.json(
        { success: false, error: 'شماره موبایل الزامی است' },
        { status: 400 }
      )
    }

    if (!/^09[0-9]{9}$/.test(mobile)) {
      return NextResponse.json(
        { success: false, error: 'فرمت شماره موبایل نامعتبر است (مثال: 09121234567)' },
        { status: 400 }
      )
    }

    const otpPurpose = (purpose || 'login').toLowerCase()
    if (!['login', 'register'].includes(otpPurpose)) {
      return NextResponse.json(
        { success: false, error: 'نوع درخواست نامعتبر است' },
        { status: 400 }
      )
    }

    // ─── Rate Limiting ──────────────────────────────────────
    const now = Date.now()
    const record = otpRequests.get(mobile)

    if (record) {
      if (now - record.firstRequestAt > RATE_LIMIT_WINDOW_MS) {
        otpRequests.set(mobile, { count: 1, firstRequestAt: now })
      } else if (record.count >= RATE_LIMIT_MAX) {
        return NextResponse.json(
          {
            success: false,
            error: 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً ۱۰ دقیقه دیگر تلاش کنید'
          },
          { status: 429 }
        )
      } else {
        record.count++
      }
    } else {
      otpRequests.set(mobile, { count: 1, firstRequestAt: now })
    }

    // ─── اتصال به MasterDB ─────────────────────────────────
    const masterDb = db.master

    // ─── تعیین tenantId ─────────────────────────────────────
    let effectiveTenantId = tenantId

    if (!effectiveTenantId) {
      const tenantSlug = request.headers.get('x-tenant-slug')
      if (tenantSlug) {
        const tenant = await masterDb.tenant.findFirst({
          where: { subDomain: tenantSlug, status: 'active' },
          select: { id: true },
        })
        if (tenant) {
          effectiveTenantId = tenant.id
        }
      }
    }

    if (!effectiveTenantId) {
      const firstTenant = await masterDb.tenant.findFirst({
        where: { status: 'active' },
        select: { id: true },
      })
      effectiveTenantId = firstTenant?.id || 'default'
    }

    // ─── Cooldown Check ─────────────────────────────────────
    const recentOtp = await masterDb.otpCode.findFirst({
      where: {
        mobile,
        purpose: otpPurpose,
        isUsed: false,
        expiresAt: { gt: new Date(Date.now() - COOLDOWN_SECONDS * 1000) },
      },
      orderBy: { expiresAt: 'desc' },
    })

    if (recentOtp) {
      return NextResponse.json(
        { success: false, error: 'لطفاً یک دقیقه صبر کنید و سپس دوباره تلاش کنید' },
        { status: 429 }
      )
    }

    // ─── تولید کد OTP (۶ رقمی) ──────────────────────────────
    const code = generateOtpCode(OTP_LENGTH)
    const codeHash = crypto.createHash('sha256').update(code).digest('hex')
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

    // ─── غیرفعال‌سازی OTP های قبلی ──────────────────────────
    await masterDb.otpCode.updateMany({
      where: { mobile, purpose: otpPurpose, isUsed: false },
      data: { isUsed: true },
    })

    // ─── ذخیره OTP در دیتابیس ───────────────────────────────
    await masterDb.otpCode.create({
      data: {
        id: `otp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        tenantId: effectiveTenantId,
        mobile,
        code,
        codeHash,
        purpose: otpPurpose,
        expiresAt,
        isUsed: false,
        attemptCount: 0,
        ip: request.headers.get('x-forwarded-for') || 'unknown',
      },
    })

    // ─── ارسال پیامک از طریق IPPanel ────────────────────────
    const result = await sendOtpViaIpPanel(mobile, code)

    if (!result.success) {
      console.error('[OTP] Failed to send via IPPanel:', result.message)

      // ★★★ پیام خطای واضح برای کاربر
      let userErrorMessage = 'خطا در ارسال پیامک'
      const msg = result.message.toLowerCase()

      if (msg.includes('pattern') || msg.includes('قالب') || msg.includes('code')) {
        userErrorMessage = 'قالب پیامک یافت نشد. لطفاً با پشتیبانی تماس بگیرید'
      } else if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('api key')) {
        userErrorMessage = 'کلید API پیامک نامعتبر است'
      } else if (msg.includes('credit') || msg.includes('اعتبار')) {
        userErrorMessage = 'اعتبار حساب پیامک کافی نیست'
      } else {
        userErrorMessage = 'خطا در ارسال پیامک: ' + result.message
      }

      // ★★★ در محیط development، کد رو در response برمی‌گردونیم
      const isDev = process.env.NODE_ENV !== 'production'

      return NextResponse.json({
        success: false,
        error: userErrorMessage,
        ...(isDev ? { _debugCode: code, _debugMessage: result.message } : {}),
      }, { status: 500 })
    }

    // ─── Response ───────────────────────────────────────────
    const isDevPreview = result.devPreview === true

    const responseData: Record<string, string> = {
      message: isDevPreview
        ? '[حالت تست] کد در پایین صفحه نمایش داده شد'
        : 'کد تایید ۶ رقمی به شماره موبایل شما ارسال شد',
    }

    // ★★★ اگه در حالت dev preview هستیم کد رو برگردون
    if (isDevPreview) {
      responseData._debugCode = code
      responseData._devPreview = 'true'
    }

    return NextResponse.json({
      success: true,
      data: responseData,
    })
  } catch (error) {
    console.error('[OTP Send] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}
