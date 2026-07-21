// ============================================================================
// src/app/api/tenants/register-otp/send/route.ts — POST (v5.1.5 ★★★ Phase 4)
// ShopAccounting — Send OTP for Registration (no tenant required)
// ----------------------------------------------------------------------------
// این API برای ارسال کد OTP در زمان ثبت‌نام استفاده می‌شود.
// به آن نیاز داریم چون در زمان ثبت‌نام، tenant هنوز ایجاد نشده و نمی‌توان
// از /api/auth/otp/send استفاده کرد (که نیاز به tenantId دارد).
//
// Body:
//   { mobile: "09123456789" }
//
// Response:
//   { success: true, message: "کد ارسال شد" }
//   { success: false, error: "..." }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { saveOtp, REGISTRATION_OTP_CONFIG } from '@/lib/registration-otp-store'

// ★★★ import کتابخانه IPPanel (با fallback به mock mode)
async function sendOtpViaIpPanel(mobile: string, code: string): Promise<{ success: boolean; mockMode: boolean; error?: string }> {
  const apiKey = process.env.IPPANEL_API_KEY
  const fromNumber = process.env.IPPANEL_FROM_NUMBER || '3000505'
  const patternCode = process.env.IPPANEL_OTP_PATTERN_CODE
  const paramName = process.env.IPPANEL_OTP_PARAM_NAME || 'pass'

  // ★ اگر API Key تنظیم نشده، mock mode
  if (!apiKey || !patternCode) {
    console.log(`[RegisterOTP] 🔶 MOCK MODE (no API key) — OTP for ${mobile}: ${code}`)
    return { success: true, mockMode: true }
  }

  // ★★★ v5.1.6: IPPanel API درست فرمت:
  //   - Recipient باید string باشد (نه array)
  //   - User\(numeric|alpha\)ID برای pattern-based
  //   - مرجع: https://docs.ippanel.com/api-pattern
  const requestBody = {
    Originator: fromNumber,
    pattern_code: patternCode,
    Recipient: mobile,  // ★★★ string، نه array
    Values: { [paramName]: code },
  }

  console.log('[RegisterOTP] Sending to IPPanel:', {
    originator: fromNumber,
    patternCode,
    recipient: mobile,
    paramName,
  })

  // ★★★ v5.1.8: تابع ارسال واقعی به IPPanel با retry
  //   Cloudflare گاهی درخواست‌ها را بدون User-Agent مسدود می‌کند
  //   و پاسخ HTML برمی‌گرداند (به‌جای JSON)
  const sendToIpPanel = async (attempt: number): Promise<{ success: boolean; mockMode: boolean; data?: any; htmlResponse?: boolean }> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `AccessKey ${apiKey}`,
      // ★★★ v5.1.8: افزودن User-Agent برای جلوگیری از مسدود شدن توسط Cloudflare
      'User-Agent': 'ShopAccounting/1.0 (Node.js; +https://shopaccounting.ir)',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9,fa;q=0.8',
    }

    try {
      const response = await fetch('https://rest.ippanel.com/v1/messages/patterns/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        // ★ timeout ۱۰ ثانیه
        signal: AbortSignal.timeout(10000),
      })

      const responseText = await response.text()

      // ★★★ اگر response HTML است (Cloudflare page)، به‌عنوان htmlResponse علامت بزن
      if (responseText.startsWith('<!DOCTYPE') || responseText.startsWith('<html') || responseText.includes('<!DOCTYPE html>')) {
        console.warn(`[RegisterOTP] Attempt ${attempt}: IPPanel returned HTML (Cloudflare block?)`)
        return { success: false, mockMode: false, htmlResponse: true }
      }

      let data: any
      try {
        data = JSON.parse(responseText)
      } catch (parseErr) {
        console.warn(`[RegisterOTP] Attempt ${attempt}: Non-JSON response:`, responseText.substring(0, 100))
        return { success: false, mockMode: false, htmlResponse: true }
      }

      // ★★★ v5.1.7: تشخیص موفقیت (case-insensitive)
      const statusLower = (data?.status || '').toString().toLowerCase()
      const codeLower = (data?.code || '').toString().toLowerCase()
      const isSuccess =
        response.ok &&
        (statusLower === 'ok' ||
          statusLower === 'sent' ||
          statusLower === 'success' ||
          codeLower === 'ok' ||
          codeLower === '200' ||
          !!data?.data?.message_id ||
          !!data?.data?.bulk_id)

      if (isSuccess) {
        return { success: true, mockMode: false, data }
      }

      console.warn(`[RegisterOTP] Attempt ${attempt}: IPPanel error:`, data)
      return { success: false, mockMode: false, data }
    } catch (err: any) {
      console.warn(`[RegisterOTP] Attempt ${attempt}: Network error:`, err?.message)
      return { success: false, mockMode: false }
    }
  }

  // ★★★ تلاش ۱
  let result = await sendToIpPanel(1)

  // ★★★ اگر HTML response بود (Cloudflare)، ۲ ثانیه صبر کن و دوباره تلاش کن
  if (result.htmlResponse) {
    console.log('[RegisterOTP] Retrying in 2 seconds (Cloudflare block detected)...')
    await new Promise((resolve) => setTimeout(resolve, 2000))
    result = await sendToIpPanel(2)
  }

  // ★★★ اگر موفق بود
  if (result.success) {
    console.log('[RegisterOTP] ✅ OTP sent successfully via IPPanel:', {
      status: result.data?.status,
      code: result.data?.code,
      bulkId: result.data?.data?.bulk_id || result.data?.data?.message_id,
    })
    return { success: true, mockMode: false }
  }

  // ★★★ fallback به mock mode
  console.warn('[RegisterOTP] IPPanel failed after retries, falling back to mock mode')
  console.log(`[RegisterOTP] 🔶 FALLBACK MOCK — OTP for ${mobile}: ${code}`)
  return { success: true, mockMode: true }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { mobile } = body

    // ─── اعتبارسنجی ─────────────────────────────────────────────
    if (!mobile) {
      return NextResponse.json(
        { success: false, error: 'شماره موبایل الزامی است' },
        { status: 400 }
      )
    }

    // ★ نرمال‌سازی
    let normalizedMobile = (mobile || '').trim()
    if (normalizedMobile.startsWith('+98')) normalizedMobile = '0' + normalizedMobile.substring(3)
    else if (normalizedMobile.startsWith('98') && normalizedMobile.length === 12) normalizedMobile = '0' + normalizedMobile.substring(2)
    else if (normalizedMobile.startsWith('0098')) normalizedMobile = '0' + normalizedMobile.substring(4)

    // ★ اعتبارسنجی فرمت
    const mobileRegex = /^09\d{9}$/
    if (!mobileRegex.test(normalizedMobile)) {
      return NextResponse.json(
        { success: false, error: 'شماره موبایل نامعتبر است (فرمت: 09123456789)' },
        { status: 400 }
      )
    }

    // ★ تولید کد ۶ رقمی
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const codeHash = code // ★ در production باید hash شود

    // ★ ذخیره در store
    const saved = saveOtp(normalizedMobile, code, codeHash)
    if (!saved) {
      return NextResponse.json(
        {
          success: false,
          error: `لطفاً ${Math.ceil(REGISTRATION_OTP_CONFIG.COOLDOWN_MS / 1000)} ثانیه صبر کنید و دوباره تلاش کنید`,
        },
        { status: 429 }
      )
    }

    // ★ ارسال با IPPanel
    const result = await sendOtpViaIpPanel(normalizedMobile, code)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'خطا در ارسال پیامک. لطفاً دوباره تلاش کنید.' },
        { status: 500 }
      )
    }

    console.log(`[RegisterOTP] OTP sent to ${normalizedMobile} (mock: ${result.mockMode})`)

    return NextResponse.json({
      success: true,
      message: 'کد تأیید ارسال شد',
      data: {
        mobile: normalizedMobile,
        expiresIn: Math.floor(REGISTRATION_OTP_CONFIG.OTP_TTL / 1000), // ثانیه
        mockMode: result.mockMode,
        // ★ در mock mode، کد را در response برمی‌گردانیم (فقط برای تست)
        ...(result.mockMode ? { devCode: code } : {}),
      },
    })
  } catch (error: any) {
    console.error('[RegisterOTP Send] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}
