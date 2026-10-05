// ============================================================================
// src/app/api/donations/zarinpal/callback/route.ts (v13.0 ★★★)
// ShopAccounting — Donation Payment Verification & Financial Logging
// ----------------------------------------------------------------------------
// ★ v13.0: ذخیره مبلغ ناخالص، کارمزد، مبلغ خالص تسویه، نوع تراکنش، وضعیت سندباکس
// ★ v13.0: ذخیره cardPan و cardHash از پاسخ verify زرین‌پال
// ★ v13.0: پشتیبانی از code=100, code=101, code=200
// ★ v13.0: جلوگیری از ثبت تکراری با Idempotency
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getZarinpalUrls } from '@/lib/zarinpal/tashim'
import {
  getZarinpalMerchantId,
  isZarinpalSandbox,
  getPublicBaseUrl,
} from '@/lib/zarinpal/donation-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ═══════════════════════════════════════════════════════════════
//  fetch با timeout
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
//  خواندن پارامتر case-insensitive
// ═══════════════════════════════════════════════════════════════
function getParam(url: URL, names: string[]): string | null {
  for (const name of names) {
    const value = url.searchParams.get(name)
    if (value !== null) return value
  }
  return null
}

// ═══════════════════════════════════════════════════════════════
//  تبدیل امن عدد صحیح مثبت
// ═══════════════════════════════════════════════════════════════
function parsePositiveInteger(value: string | null | undefined): number | null {
  if (!value) return null

  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null

  return n
}

// ═══════════════════════════════════════════════════════════════
//  تبدیل امن عدد صحیح غیرمنفی برای کارمزد
// ═══════════════════════════════════════════════════════════════
function parseNonNegativeInteger(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n)
}

// ═══════════════════════════════════════════════════════════════
//  پاک‌سازی پیام خطا
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
//  استخراج پیام خطا از پاسخ زرین‌پال
// ═══════════════════════════════════════════════════════════════
function getErrorMessage(payload: any): string | undefined {
  if (!payload) return undefined
  if (Array.isArray(payload.errors)) return payload.errors[0]?.message
  if (payload.errors?.message) return payload.errors.message
  if (payload.data?.message) return payload.data.message
  return undefined
}

// ═══════════════════════════════════════════════════════════════
//  محاسبه مالی: ناخالص، کارمزد، خالص
//  ★ همه مقادیر ورودی ریال هستند و خروجی تومان است.
// ═══════════════════════════════════════════════════════════════
function computeFinancials(params: {
  amountRial: number
  feeRial: number
  feeType?: string | null
}) {
  const { amountRial, feeRial, feeType } = params

  const normalizedFeeType = String(feeType || '').toLowerCase().trim()

  // ★ اگر کارمزد با پذیرنده باشد، از مبلغ تسویه کسر می‌شود.
  //   اگر کارمزد با خریدار باشد، معمولاً مبلغ دریافتی پذیرنده همان مبلغ کل است.
  const deductFeeFromSettlement =
    !normalizedFeeType ||
    normalizedFeeType === 'merchant' ||
    normalizedFeeType === 'پذیرنده'

  const netAmountRial = deductFeeFromSettlement
    ? Math.max(0, amountRial - feeRial)
    : amountRial

  return {
    grossAmountToman: Math.round(amountRial / 10),
    feeToman: Math.round(feeRial / 10),
    netAmountToman: Math.round(netAmountRial / 10),
    deductFeeFromSettlement,
  }
}

// ═══════════════════════════════════════════════════════════════
//  ریدایرکت به لندینگ با وضعیت پرداخت
// ═══════════════════════════════════════════════════════════════
function redirectWithStatus(
  req: NextRequest,
  status: 'success' | 'failed' | 'cancelled',
  extra: {
    amountToman?: number | null
    amountRial?: number | null
    netAmountToman?: number | null
    feeToman?: number | null
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

  if (typeof extra.netAmountToman === 'number' && extra.netAmountToman >= 0) {
    params.set('netAmountToman', String(extra.netAmountToman))
  }

  if (typeof extra.feeToman === 'number' && extra.feeToman >= 0) {
    params.set('feeToman', String(extra.feeToman))
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
//  GET: دریافت بازگشت از زرین‌پال و verify + ذخیره کامل مالی
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

    const grossAmountToman = amountRial ? Math.round(amountRial / 10) : null

    console.log('[ZarinPal Donation Callback] Received:', {
      sandbox,
      authority,
      statusFromZarinPal,
      orderId,
      grossAmountToman,
      amountRial,
    })

    // بررسی لغو یا خطای اولیه
    if (!authority || statusFromZarinPal !== 'OK') {
      return redirectWithStatus(
        req,
        statusFromZarinPal === 'NOK' ? 'cancelled' : 'failed',
        {
          amountToman: grossAmountToman,
          amountRial,
          orderId,
          errorMessage:
            statusFromZarinPal === 'NOK'
              ? 'پرداخت لغو شد.'
              : 'پاسخ معتبر از درگاه پرداخت دریافت نشد.',
        }
      )
    }

    if (!amountRial || amountRial <= 0) {
      return redirectWithStatus(req, 'failed', {
        amountToman: grossAmountToman,
        orderId,
        errorMessage: 'مبلغ پرداخت نامعتبر است.',
      })
    }

    const donorName = url.searchParams.get('donorName')
const donorMobile = url.searchParams.get('donorMobile')
const donorEmail = url.searchParams.get('donorEmail')
const donorNote = url.searchParams.get('donorNote')
const autoVerifyParam = url.searchParams.get('autoVerify')

const autoVerify =
  autoVerifyParam === 'true'
    ? true
    : autoVerifyParam === 'false'
      ? false
      : null

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
        amountToman: grossAmountToman,
        amountRial,
        orderId,
        errorMessage: isTimeout
          ? 'Timeout در ارتباط با زرین‌پال.'
          : 'خطای شبکه در تأیید پرداخت.',
      })
    }

    const verifyJson = await verifyRes.json().catch(() => null)

    if (!verifyJson) {
      return redirectWithStatus(req, 'failed', {
        amountToman: grossAmountToman,
        amountRial,
        orderId,
        errorMessage: 'پاسخ خالی از سرویس تأیید دریافت شد.',
      })
    }

    const code = Number(verifyJson.data?.code)
    const refId = verifyJson.data?.ref_id ? String(verifyJson.data.ref_id) : null

    // ★ فیلدهای مالی و کارت از پاسخ verify
    const feeRial = parseNonNegativeInteger(verifyJson.data?.fee)
    const feeType = verifyJson.data?.fee_type ? String(verifyJson.data.fee_type) : null
    const cardPan = verifyJson.data?.card_pan ? String(verifyJson.data.card_pan) : null
    const cardHash = verifyJson.data?.card_hash ? String(verifyJson.data.card_hash) : null

    const financials = computeFinancials({
      amountRial,
      feeRial,
      feeType,
    })

    console.log('[ZarinPal Donation Callback] Verify response:', {
      code,
      refId,
      feeRial,
      feeType,
      cardPan,
      hasCardHash: Boolean(cardHash),
      grossAmountToman: financials.grossAmountToman,
      feeToman: financials.feeToman,
      netAmountToman: financials.netAmountToman,
    })

    /**
     * کدهای موفق:
     * 100 = موفق
     * 101 = قبلاً verify شده و همچنان موفق
     * 200 = در برخی حالت‌ها موفق
     */
    const isSuccess = code === 100 || code === 101 || code === 200

    if (isSuccess) {
      const now = new Date()

      const paymentData = {
        tenantId: null,
        type: 'donation',
        isSandbox: sandbox,

        // ★ amount برای سازگاری قدیمی = مبلغ خالص دریافتی
        amount: financials.netAmountToman,

        grossAmount: financials.grossAmountToman,
        netAmount: financials.netAmountToman,
        fee: financials.feeToman,
        feeType,

        cardPan,
        cardHash,

        authority,
        refId,

        status: 'paid',
        gatewayType: 'zarinpal',

        description:
          `[DONATION] حمایت مالی | ` +
          `OrderID: ${orderId || '-'} | ` +
          `RefID: ${refId || '-'} | ` +
          `Gross: ${financials.grossAmountToman} Toman | ` +
          `Fee: ${financials.feeToman} Toman | ` +
          `Net: ${financials.netAmountToman} Toman`,

        paidAt: now,
        verifiedAt: now,

        settlementStatus: 'pending',

        verifyCode: code,
verifyMessage: String(verifyJson.data?.message || '').slice(0, 500) || null,
autoVerify,

payerName: donorName ? String(donorName).slice(0, 255) : null,
payerMobile: donorMobile ? String(donorMobile).slice(0, 20) : null,
payerEmail: donorEmail ? String(donorEmail).slice(0, 255) : null,
payerNote: donorNote ? String(donorNote).slice(0, 1000) : null,
      }

      try {
        const existing = await db.client.onlinePayment.findFirst({
          where: { authority },
        })

        if (existing) {
          await db.client.onlinePayment.update({
            where: { id: existing.id },
            data: paymentData,
          })
          console.log('[ZarinPal Donation Callback] ✅ Existing OnlinePayment updated')
        } else {
          await db.client.onlinePayment.create({
            data: paymentData,
          })
          console.log('[ZarinPal Donation Callback] ✅ New OnlinePayment created')
        }
      } catch (dbErr: any) {
        console.error('[ZarinPal Donation Callback] ❌ DB Save Error:', dbErr?.message)
        // حتی اگر دیتابیس خطا داد، کاربر باید پیام موفقیت ببیند
      }

      return redirectWithStatus(req, 'success', {
        amountToman: financials.grossAmountToman,
        netAmountToman: financials.netAmountToman,
        feeToman: financials.feeToman,
        amountRial,
        orderId,
        refId,
      })
    }

    // ─── ناموفق ───
    const errorMessage =
      getErrorMessage(verifyJson) ||
      (Number.isFinite(code) ? `کد پاسخ زرین‌پال: ${code}` : 'تأیید پرداخت ناموفق بود.')

    console.warn('[ZarinPal Donation Callback] Verification failed:', {
      code,
      errorMessage,
    })

    // ★ حتی در حالت ناموفق هم اگر رکوردی وجود دارد، وضعیت را更新 کن
    try {
      const existing = await db.client.onlinePayment.findFirst({
        where: { authority },
      })

      const failedData = {
        tenantId: null,
        type: 'donation',
        isSandbox: sandbox,
        amount: financials.grossAmountToman,
        grossAmount: financials.grossAmountToman,
        netAmount: 0,
        fee: 0,
        feeType,
        cardPan,
        cardHash,
        authority,
        refId,
        status: 'failed',
        gatewayType: 'zarinpal',
        description:
          `[DONATION_FAILED] حمایت مالی ناموفق | Code: ${code} | ${errorMessage}`,
        verifiedAt: new Date(),
        settlementStatus: 'failed',
verifyCode: Number.isFinite(code) ? code : null,
verifyMessage: String(errorMessage || '').slice(0, 500),
autoVerify,

payerName: donorName ? String(donorName).slice(0, 255) : null,
payerMobile: donorMobile ? String(donorMobile).slice(0, 20) : null,
payerEmail: donorEmail ? String(donorEmail).slice(0, 255) : null,
payerNote: donorNote ? String(donorNote).slice(0, 1000) : null,

      }

      if (existing) {
        await db.client.onlinePayment.update({
          where: { id: existing.id },
          data: failedData,
        })
      } else {
        await db.client.onlinePayment.create({
          data: failedData,
        })
      }
    } catch (dbErr: any) {
      console.warn('[ZarinPal Donation Callback] Failed-record DB error:', dbErr?.message)
    }

    return redirectWithStatus(req, 'failed', {
      amountToman: financials.grossAmountToman,
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