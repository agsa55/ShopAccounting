// ============================================================================
// src/app/api/donations/zarinpal/request/route.ts
// ★ ایجاد پرداخت حمایتی با زرین‌پال
// ★ پشتیبانی از Sandbox و Production
// ★ بدون IDPay
// ★ بدون ارسال metadata/details خالی
// ★ رفع خطای: The metadata.mobile must be a string
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIN_DONATION_TOMAN = 10_000
const MAX_DONATION_TOMAN = 100_000_000

// ═══════════════════════════════════════════════════════════════
//  ★ تشخیص حالت سندباکس
// ═══════════════════════════════════════════════════════════════
function isZarinpalSandbox(): boolean {
  return String(process.env.ZARINPAL_SANDBOX || '').toLowerCase() === 'true'
}

// ═══════════════════════════════════════════════════════════════
//  ★ انتخاب Merchant ID
//
// اگر ZARINPAL_SANDBOX=true باشد:
//   1. ZARINPAL_SANDBOX_MERCHANT_ID
//   2. اگر نبود، ZARINPAL_MERCHANT_ID
//
// اگر ZARINPAL_SANDBOX=false باشد:
//   فقط ZARINPAL_MERCHANT_ID
// ═══════════════════════════════════════════════════════════════
function getZarinpalMerchantId(): string | null {
  const sandboxMerchantId = process.env.ZARINPAL_SANDBOX_MERCHANT_ID?.trim()
  const mainMerchantId = process.env.ZARINPAL_MERCHANT_ID?.trim()

  if (isZarinpalSandbox()) {
    return sandboxMerchantId || mainMerchantId || null
  }

  return mainMerchantId || null
}

// ═══════════════════════════════════════════════════════════════
//  ★ ساخت Base URL برای callback
//
// اولویت:
// 1. SITE_URL
// 2. NEXT_PUBLIC_APP_URL
// 3. req.nextUrl.origin
// 4. http://localhost:3000
// ═══════════════════════════════════════════════════════════════
function getPublicBaseUrl(req: NextRequest): string {
  const siteUrl = process.env.SITE_URL?.trim()
  if (siteUrl) return siteUrl.replace(/\/$/, '')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (appUrl) return appUrl.replace(/\/$/, '')

  const origin = req.nextUrl.origin
  if (origin) return origin

  return 'http://localhost:3000'
}

// ═══════════════════════════════════════════════════════════════
//  ★ URLهای زرین‌پال برای Sandbox و Production
// ═══════════════════════════════════════════════════════════════
function getZarinpalUrls(sandbox: boolean) {
  return {
    request: sandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json'
      : 'https://api.zarinpal.com/pg/v4/payment/request.json',

    verify: sandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json'
      : 'https://api.zarinpal.com/pg/v4/payment/verify.json',

    startPay: sandbox
      ? 'https://sandbox.zarinpal.com/pg/StartPay/'
      : 'https://www.zarinpal.com/pg/StartPay/',
  }
}

// ═══════════════════════════════════════════════════════════════
//  ★ ساخت Order ID یکتا
// ═══════════════════════════════════════════════════════════════
function generateOrderId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
  } catch {}

  return `donation_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// ═══════════════════════════════════════════════════════════════
//  ★ استخراج پیام خطا از پاسخ زرین‌پال
// ═══════════════════════════════════════════════════════════════
function getZarinpalErrorMessage(payload: any): string | undefined {
  if (!payload) return undefined

  if (Array.isArray(payload.errors)) {
    return payload.errors[0]?.message
  }

  if (payload.errors?.message) {
    return payload.errors.message
  }

  if (payload.data?.message) {
    return payload.data.message
  }

  return undefined
}

// ═══════════════════════════════════════════════════════════════
//  ★ POST: ایجاد پرداخت حمایتی
// ═══════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const sandbox = isZarinpalSandbox()
    const urls = getZarinpalUrls(sandbox)
    const merchantId = getZarinpalMerchantId()

    if (!merchantId) {
      return NextResponse.json(
        {
          success: false,
          error: sandbox
            ? 'ZARINPAL_SANDBOX_MERCHANT_ID یا ZARINPAL_MERCHANT_ID تنظیم نشده است. برای تست سندباکس، ZARINPAL_SANDBOX_MERCHANT_ID را در env قرار دهید.'
            : 'ZARINPAL_MERCHANT_ID تنظیم نشده است. لطفاً کد مرچنت واقعی زرین‌پال را در env قرار دهید.',
        },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => ({}))

    const amountToman = Number(body.amountToman)
    const description =
      String(body.description || 'حمایت از توسعه رهگشا')
        .trim()
        .slice(0, 120) || 'حمایت از توسعه رهگشا'

    if (!Number.isFinite(amountToman) || amountToman <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'مبلغ پرداخت نامعتبر است.',
        },
        { status: 400 }
      )
    }

    if (amountToman < MIN_DONATION_TOMAN) {
      return NextResponse.json(
        {
          success: false,
          error: `حداقل مبلغ حمایت ${MIN_DONATION_TOMAN.toLocaleString('fa-IR')} تومان است.`,
        },
        { status: 400 }
      )
    }

    if (amountToman > MAX_DONATION_TOMAN) {
      return NextResponse.json(
        {
          success: false,
          error: `حداکثر مبلغ حمایت مجاز ${MAX_DONATION_TOMAN.toLocaleString('fa-IR')} تومان است.`,
        },
        { status: 400 }
      )
    }

    // زرین‌پال مبلغ را به ریال می‌گیرد
    const amountRial = Math.round(amountToman * 10)

    const baseUrl = getPublicBaseUrl(req)
    const orderId = generateOrderId()

    const callbackUrl =
      `${baseUrl}/api/donations/zarinpal/callback` +
      `?amountToman=${amountToman}` +
      `&orderId=${encodeURIComponent(orderId)}`

    // ═══════════════════════════════════════════════════════════
    // ★ مهم‌ترین تغییر برای رفع خطا:
    // metadata و details ارسال نمی‌شوند.
    // بنابراین خطای metadata.mobile must be a string رفع می‌شود.
    // ═══════════════════════════════════════════════════════════
    const payload = {
      merchant_id: merchantId,
      amount: amountRial,
      currency: 'IRR',
      callback_url: callbackUrl,
      description,
    }

    console.log('[ZarinPal Donation Request] Sending request:', {
      sandbox,
      amountToman,
      amountRial,
      callbackUrl,
      orderId,
    })

    const zarinpalRes = await fetch(urls.request, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })

    const zarinpalJson = await zarinpalRes.json().catch(() => null)
    const zarinpalErrorMessage = getZarinpalErrorMessage(zarinpalJson)

    // اگر زرین‌پال خطای validation یا API داد
    if (!zarinpalRes.ok) {
      console.error('[ZarinPal Donation Request] ZarinPal validation/API error:', {
        status: zarinpalRes.status,
        json: zarinpalJson,
      })

      return NextResponse.json(
        {
          success: false,
          error: zarinpalErrorMessage || 'زرین‌پال درخواست پرداخت را نپذیرفت.',
          zarinpalStatus: zarinpalRes.status,
          zarinpalResponse: zarinpalJson,
        },
        { status: 400 }
      )
    }

    if (!zarinpalJson) {
      console.error('[ZarinPal Donation Request] Empty response from ZarinPal')

      return NextResponse.json(
        {
          success: false,
          error: 'پاسخ نامعتبر از سرویس زرین‌پال دریافت شد.',
        },
        { status: 502 }
      )
    }

    const code = zarinpalJson.data?.code
    const authority = zarinpalJson.data?.authority

    // 100 = موفق
    // 101 = تکراری / قبلاً ایجاد شده
    if ((code === 100 || code === 101) && authority) {
      const paymentUrl = `${urls.startPay}${authority}`

      console.log('[ZarinPal Donation Request] Success:', {
        authority,
        paymentUrl,
        refId: zarinpalJson.data?.ref_id,
      })

      return NextResponse.json({
        success: true,
        data: {
          authority,
          url: paymentUrl,
          amountToman,
          amountRial,
          orderId,
          sandbox,
        },
      })
    }

    console.warn('[ZarinPal Donation Request] Failed:', zarinpalJson)

    return NextResponse.json(
      {
        success: false,
        error: zarinpalErrorMessage || 'ایجاد پرداخت در زرین‌پال ناموفق بود.',
        code,
      },
      { status: 400 }
    )
  } catch (err: any) {
    console.error('[ZarinPal Donation Request] Unexpected error:', err)

    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'خطای غیرمنتظره در ایجاد پرداخت.',
      },
      { status: 500 }
    )
  }
}