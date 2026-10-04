// ============================================================================
// src/app/api/donations/zarinpal/callback/route.ts (v12.3 ★★★ - Final Production Ready)
// ShopAccounting — Donation Payment Verification & Database Logging
// ----------------------------------------------------------------------------
// ★ v12.3: افزودن ثبت خودکار در OnlinePayments برای گزارش‌گیری ادمین
//   - اگر پرداخت موفق بود، رکوردی با type='donation' ساخته می‌شود.
//   - tenantId برابر null است چون حمایت عمومی است.
//   - پشتیبانی از Idempotency (جلوگیری از ثبت تکراری).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db' // ★ اضافه کردن import دیتابیس
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
//  ★ خواندن پارامتر به‌صورت case-insensitive
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
//  ★ پاک‌سازی پیام خطا
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
  if (Array.isArray(payload.errors)) return payload.errors[0]?.message
  if (payload.errors?.message) return payload.errors.message
  if (payload.data?.message) return payload.data.message
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

  if (typeof extra.amountToman === 'number' && extra.amountToman > 0) {
    params.set('amountToman', String(extra.amountToman))
  }
  if (typeof extra.amountRial === 'number' && extra.amountRial > 0) {
    params.set('amountRial', String(extra.amountRial))
  }
  if (extra.orderId) params.set('orderId', String(extra.orderId))
  if (extra.refId) params.set('refId', String(extra.refId))
  if (typeof extra.errorCode === 'number') params.set('errorCode', String(extra.errorCode))
  
  const safeMessage = sanitizeMessage(extra.errorMessage)
  if (safeMessage) params.set('errorMessage', safeMessage)

  return NextResponse.redirect(`${base}/?${params.toString()}`, 302)
}

// ═══════════════════════════════════════════════════════════════
//  ★ GET: دریافت بازگشت از زرین‌پال و verify + ذخیره در DB
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
    const authority = getParam(url, ['Authority', 'authority'])
    const statusFromZarinPal = getParam(url, ['Status', 'status'])
    const orderId = url.searchParams.get('orderId')

    let amountRial = parsePositiveInteger(url.searchParams.get('amountRial'))
    const amountTomanFromQuery = parsePositiveInteger(url.searchParams.get('amountToman'))

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

    // بررسی لغو یا خطای اولیه
    if (!authority || statusFromZarinPal !== 'OK') {
      return redirectWithStatus(
        req,
        statusFromZarinPal === 'NOK' ? 'cancelled' : 'failed',
        {
          amountToman,
          amountRial,
          orderId,
          errorMessage: statusFromZarinPal === 'NOK' ? 'پرداخت لغو شد.' : 'پاسخ معتبر نبود.',
        }
      )
    }

    if (!amountRial || amountRial <= 0) {
      return redirectWithStatus(req, 'failed', {
        amountToman,
        orderId,
        errorMessage: 'مبلغ پرداخت نامعتبر است.',
      })
    }

    // ─── فراخوانی Verify ───
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
      console.error('[ZarinPal Donation Callback] Verify fetch error:', err?.message)
      return redirectWithStatus(req, 'failed', {
        amountToman,
        amountRial,
        orderId,
        errorMessage: isTimeout ? 'Timeout در ارتباط با زرین‌پال.' : 'خطای شبکه در تأیید پرداخت.',
      })
    }

    const verifyJson = await verifyRes.json().catch(() => null)

    if (!verifyJson) {
      return redirectWithStatus(req, 'failed', {
        amountToman,
        amountRial,
        orderId,
        errorMessage: 'پاسخ خالی از سرویس تأیید.',
      })
    }

    const code = Number(verifyJson.data?.code)
    const refId = verifyJson.data?.ref_id ? String(verifyJson.data.ref_id) : null

    console.log('[ZarinPal Donation Callback] Verify response:', { code, refId })

    /**
     * کدهای موفق: 100 (جدید), 101 (قبلا تأیید شده), 200 (سایر)
     */
    const isSuccess = code === 100 || code === 101 || code === 200

    if (isSuccess) {
      // ★★ شروع بخش جدید: ذخیره در دیتابیس ★★
      try {
        // بررسی تکراری بودن (Idempotency)
        // اگر رکوردی با همین authority قبلا ثبت شده باشد، دوباره ثبت نمی‌کنیم
        const existing = await db.client.onlinePayment.findFirst({
          where: { authority },
        })

        if (!existing) {
    await db.client.onlinePayment.create({
  data: {
    tenantId: null,
    amount: amountToman!,
    authority,
    refId,
    status: 'paid',
    gatewayType: 'zarinpal',
    description: `[DONATION] حمایت مالی | OrderID: ${orderId || '-'} | RefID: ${refId || '-'}`,
    paidAt: new Date(),
  },
})
          console.log('[ZarinPal Donation Callback] ✅ Saved to OnlinePayments')
        } else {
          console.log('[ZarinPal Donation Callback] ℹ️ Already exists in DB, skipping save')
        }
      } catch (dbErr: any) {
        console.error('[ZarinPal Donation Callback] ❌ DB Save Error:', dbErr?.message)
        // حتی اگر دیتابیس خطا داد، کاربر باید پیام موفقیت ببیند
        // چون پول قطعا به حساب آمده است
      }
      // ★★ پایان بخش جدید ★★

      return redirectWithStatus(req, 'success', {
        amountToman,
        amountRial,
        orderId,
        refId,
      })
    }

    // ─── ناموفق ───
    const errorMessage =
      getErrorMessage(verifyJson) ||
      (Number.isFinite(code) ? `کد پاسخ زرین‌پال: ${code}` : 'تأیید پرداخت ناموفق بود.')

    console.warn('[ZarinPal Donation Callback] Verification failed:', { code, errorMessage })

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
      errorMessage: err?.message || 'خطای غیرمنتظره.',
    })
  }
}