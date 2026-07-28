// ============================================================================
// src/app/api/tenants/register-otp/verify/route.ts — POST (v5.1.5 ★★★ Phase 4)
// ShopAccounting — Verify OTP for Registration
// ----------------------------------------------------------------------------
// Body:
//   { mobile: "09123456789", code: "123456" }
//
// Response:
//   { success: true, message: "کد تأیید شد", data: { verifiedToken: "..." } }
//   { success: false, error: "..." }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { verifyOtp, isVerified, REGISTRATION_OTP_CONFIG, debugStore } from '@/lib/registration-otp-store'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { mobile, code } = body

    if (!mobile || !code) {
      return NextResponse.json(
        { success: false, error: 'شماره موبایل و کد الزامی است' },
        { status: 400 }
      )
    }

    // ★ نرمال‌سازی
    let normalizedMobile = (mobile || '').trim()
    if (normalizedMobile.startsWith('+98')) normalizedMobile = '0' + normalizedMobile.substring(3)
    else if (normalizedMobile.startsWith('98') && normalizedMobile.length === 12) normalizedMobile = '0' + normalizedMobile.substring(2)
    else if (normalizedMobile.startsWith('0098')) normalizedMobile = '0' + normalizedMobile.substring(4)

    // ★★★ v5.1.9: debug logging برای عیب‌یابی
    console.log('[RegisterOTP Verify] Request:', {
      rawMobile: mobile,
      normalizedMobile,
      code,
      codeLength: String(code).length,
      storeSize: debugStore.size,
      storeKeys: Array.from(debugStore.keys()),
    })

    // ★ تأیید کد
    const isValid = verifyOtp(normalizedMobile, String(code))

    console.log('[RegisterOTP Verify] Result:', {
      isValid,
      isVerified: isVerified(normalizedMobile),
    })

    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'کد تأیید نامعتبر است یا منقضی شده',
        },
        { status: 400 }
      )
    }

    // ★ تولید verified token (برای ارسال به API ثبت‌نام)
    const verifiedToken = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'shopaccounting-secret-key')
      .update(`${normalizedMobile}:${code}:${Date.now()}`)
      .digest('hex')

    // ★ ذخیره verifiedToken برای بررسی در API ثبت‌نام
    //   برای ساده‌سازی، موبایل تأیید شده را در store نگه می‌داریم
    //   و verifiedToken را در response برمی‌گردانیم
    //   API ثبت‌نام می‌تواند isVerified(mobile) را چک کند

    console.log(`[RegisterOTP] Verified: ${normalizedMobile}`)

    return NextResponse.json({
      success: true,
      message: 'شماره موبایل تأیید شد',
      data: {
        mobile: normalizedMobile,
        verifiedToken,
      },
    })
  } catch (error: any) {
    console.error('[RegisterOTP Verify] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}
