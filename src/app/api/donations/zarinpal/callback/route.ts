// ============================================================================
// src/app/api/donations/zarinpal/callback/route.ts
// ★ v12.1: بازگشت از زرین‌پال و تأیید نهایی پرداخت حمایتی — مطابق مستندات رسمی
// ★ پشتیبانی از Authority با حرف بزرگ و کوچک
// ★ پشتیبانی از code=100 و code=101 به‌عنوان موفق
// ★ بازگرداندن refId به فرانت‌اند
// ★ استفاده از amountRial ارسالی از request برای جلوگیری از mismatch
// ★ اضافه شدن timeout و پیام‌های خطای دقیق‌تر
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getZarinpalUrls } from '@/lib/zarinpal/tashim'
import {
  getZarinpalMerchantId,
  isZarinpalSandbox,
  getPublicBaseUrl,
} from '@/lib/zarinpal/donation-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ═══════════════════════════════════════════════════════════════
//  ★ fetch با timeout
// ═══════════════════════════════════════════════════════════════
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

// ═══════════════════════════════════════════════════════════════
//  ★ خواندن پارامتر به‌صورت case-insensitive برای نام‌های محدود
// ═══════════════════════════════════════════════════════════════
function getParam(url: URL, names: string[]): string | null {
  for (const name of names) {
    const value = url.searchParams.get(name)
    if (value !== null) return value
  }
  return null
}

// ═══════════════════════════════════════════════════════════════
//  ★ تبدیل امن عدد صحیح مثبت
// ═══════════════════════════════════════════════════════════════
function parsePositiveInteger(value: string | null | undefined): number | null {
  if (!value) return null

  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null

  return n
}

// ═══════════════════════════════════════════════════════════════
//  ★ پاک‌سازی پیام خطا برای ارسال در URL
// ═══════════════════════════════════════════════════════════════
function sanitizeMessage(message?: string | null): string | undefined {
  if (!message) return undefined

  return String(message)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

// ═══════════════════════════════════════════════════════════════
//  ★ استخراج پیام خطا از پاسخ زرین‌پال
// ═══════════════════════════════════════════════════════════════
function getErrorMessage(payload: any): string | undefined {
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
//  ★ ریدایرکت به لندینگ با وضعیت پرداخت
// ═══════════════════════════════════════════════════════════════
function redirectWithStatus(
  req: NextRequest,
  status: 'success' | 'failed' | 'cancelled',
  extra: {
    amountToman?: number | null
    amountRial?: number | null
    orderId?: string | null
    refId?: string | null
    errorCode?: number | null
    errorMessage?: string | null
  } = {}
) {
  const base = getPublicBaseUrl(req)
  const params = new URLSearchParams()

  params.set('donation', status)

  if (
    typeof extra.amountToman === 'number' &&
    Number.isFinite(extra.amountToman) &&
    extra.amountToman > 0
  ) {
    params.set('amountToman', String(extra.amountToman))
  }

  if (
    typeof extra.amountRial === 'number' &&
    Number.isFinite(extra.amountRial) &&
    extra.amountRial > 0
  ) {
    params.set('amountRial', String(extra.amountRial))
  }

  if (extra.orderId) {
    params.set('orderId', String(extra.orderId))
  }

  if (extra.refId) {
    params.set('refId', String(extra.refId))
  }

  if (
    typeof extra.errorCode === 'number' &&
    Number.isFinite(extra.errorCode)
  ) {
    params.set('errorCode', String(extra.errorCode))
  }

  const safeMessage = sanitizeMessage(extra.errorMessage)
  if (safeMessage) {
    params.set('errorMessage', safeMessage)
  }

  return NextResponse.redirect(`${base}/?${params.toString()}`, 302)
}

// ═══════════════════════════════════════════════════════════════
//  ★ GET: دریافت بازگشت از زرین‌پال و verify
// ═══════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const sandbox = isZarinpalSandbox()
    const urls = getZarinpalUrls(sandbox)
    const merchantId = getZarinpalMerchantId()

    if (!merchantId) {
      console.error('[ZarinPal Donation Callback] Merchant ID is missing')
      return redirectWithStatus(req, 'failed', {
        errorMessage: 'پیکربندی درگاه پرداخت کامل نیست.',
      })
    }

    const url = req.nextUrl

    // ★ مهم: زرین‌پال معمولاً Authority را با A بزرگ می‌فرستد
    const authority = getParam(url, ['Authority', 'authority'])

    // ★ Status هم ممکن است با S بزرگ بیاید
    const statusFromZarinPal = getParam(url, ['Status', 'status'])

    const orderId = url.searchParams.get('orderId')

    // ★ اول amountRial را می‌خوانیم چون دقیق‌تر است
    let amountRial = parsePositiveInteger(url.searchParams.get('amountRial'))

    const amountTomanFromQuery = parsePositiveInteger(
      url.searchParams.get('amountToman')
    )

    // اگر amountRial نبود، از amountToman محاسبه کن
    if (!amountRial && amountTomanFromQuery) {
      amountRial = amountTomanFromQuery * 10
    }

    const amountToman = amountRial ? Math.round(amountRial / 10) : null

    console.log('[ZarinPal Donation Callback] Received:', {
      sandbox,
      authority,
      statusFromZarinPal,
      orderId,
      amountToman,
      amountRial,
    })

    // اگر کاربر پرداخت را لغو کرد یا Status_OK نبود
    if (!authority || statusFromZarinPal !== 'OK') {
      return redirectWithStatus(
        req,
        statusFromZarinPal === 'NOK' ? 'cancelled' : 'failed',
        {
          amountToman,
          amountRial,
          orderId,
          errorMessage:
            statusFromZarinPal === 'NOK'
              ? 'پرداخت لغو شد.'
              : 'پاسخ معتبر از درگاه پرداخت دریافت نشد.',
        }
      )
    }

    if (!amountRial || !Number.isSafeInteger(amountRial) || amountRial <= 0) {
      return redirectWithStatus(req, 'failed', {
        amountToman,
        orderId,
        errorMessage: 'مبلغ پرداخت قابل اعتبارسنجی نیست.',
      })
    }

    let verifyRes: Response
    try {
      verifyRes = await fetchWithTimeout(
        urls.verify,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            merchant_id: merchantId,
            authority,
            amount: amountRial,
          }),
          cache: 'no-store',
        },
        15000
      )
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError'

      console.error('[ZarinPal Donation Callback] Verify fetch error:', {
        isTimeout,
        message: err?.message,
      })

      return redirectWithStatus(req, 'failed', {
        amountToman,
        amountRial,
        orderId,
        errorMessage: isTimeout
          ? 'ارتباط با زرین‌پال برای تأیید پرداخت به timeout خورد.'
          : 'خطا در ارتباط با سرویس تأیید پرداخت.',
      })
    }

    const verifyJson = await verifyRes.json().catch(() => null)

    if (!verifyJson) {
      console.error('[ZarinPal Donation Callback] Empty verify response:', {
        status: verifyRes.status,
      })

      return redirectWithStatus(req, 'failed', {
        amountToman,
        amountRial,
        orderId,
        errorMessage: 'پاسخ نامعتبر از سرویس تأیید پرداخت دریافت شد.',
      })
    }

    const code = Number(verifyJson.data?.code)
    const refId = verifyJson.data?.ref_id ? String(verifyJson.data.ref_id) : null

    console.log('[ZarinPal Donation Callback] Verify response:', {
      code,
      refId,
      authority,
      amountToman,
      amountRial,
      httpStatus: verifyRes.status,
    })

    /**
     * کدهای موفق زرین‌پال:
     * 100 = تأیید موفق
     * 101 = قبلاً تأیید شده و همچنان موفق محسوب می‌شود
     * 200 = در برخی پاسخ‌ها/نسخه‌ها به‌عنوان موفق دیده می‌شود
     */
    const isSuccess = code === 100 || code === 101 || code === 200

    if (isSuccess) {
      return redirectWithStatus(req, 'success', {
        amountToman,
        amountRial,
        orderId,
        refId,
      })
    }

    const errorMessage =
      getErrorMessage(verifyJson) ||
      (Number.isFinite(code) ? `کد پاسخ زرین‌پال: ${code}` : 'تأیید پرداخت ناموفق بود.')

    console.warn('[ZarinPal Donation Callback] Verification failed:', {
      code,
      errorMessage,
      httpStatus: verifyRes.status,
      verifyJson,
    })

    return redirectWithStatus(req, 'failed', {
      amountToman,
      amountRial,
      orderId,
      errorCode: Number.isFinite(code) ? code : undefined,
      errorMessage,
    })
  } catch (err: any) {
    console.error('[ZarinPal Donation Callback] Unexpected error:', err)

    return redirectWithStatus(req, 'failed', {
      errorMessage: err?.message || 'خطای غیرمنتظره در تأیید پرداخت.',
    })
  }
}