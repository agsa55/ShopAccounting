// ============================================================================
// src/app/api/admin/payments/[id]/reverse/route.ts (v1.1 ★★★ Hardened)
// ShopAccounting — Admin ZarinPal Reverse Transaction
// ----------------------------------------------------------------------------
// ★ فقط برای تراکنش‌های موفق زرین‌پال تا ۳۰ دقیقه بعد از پرداخت.
// ★ عبارت تأیید فارسی «بازگشت» یا انگلیسی REVERSE پذیرفته می‌شود.
// ★ از ریورس پرداخت فاکتور مشتری، تراکنش تسویه‌شده و محیط ناهمسان جلوگیری می‌کند.
// ★ در صورت timeout، وضعیت را در حالت reversing نگه می‌دارد تا مغایرت ایجاد نشود.
// ★ نکته امنیتی: این route باید توسط middleware/session ادمین محافظت شود.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getZarinpalMerchantId, isZarinpalSandbox } from '@/lib/zarinpal/donation-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ReverseContext = {
  params: Promise<{ id: string }>
}

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
//  آدرس reverse زرین‌پال
// ═══════════════════════════════════════════════════════════════
function getReverseUrl(sandbox: boolean): string {
  const base = sandbox
    ? 'https://sandbox.zarinpal.com'
    : 'https://payment.zarinpal.com'

  return `${base}/pg/v4/payment/reverse.json`
}

// ═══════════════════════════════════════════════════════════════
//  متن امن
// ═══════════════════════════════════════════════════════════════
function safeText(value: unknown, max = 500): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

// ═══════════════════════════════════════════════════════════════
//  استخراج پیام خطا از پاسخ زرین‌پال
// ═══════════════════════════════════════════════════════════════
function extractErrorMessage(payload: any): string | null {
  if (!payload) return null

  if (Array.isArray(payload.errors)) {
    const first = payload.errors[0]
    return safeText(first?.message || first?.code || first, 300) || null
  }

  if (payload.errors && typeof payload.errors === 'object') {
    if (payload.errors.message) return safeText(payload.errors.message, 300)
    if (payload.errors.code) return safeText(payload.errors.code, 300)

    const firstKey = Object.keys(payload.errors)[0]
    const firstValue = payload.errors[firstKey]

    if (Array.isArray(firstValue)) return safeText(firstValue[0], 300)
    if (typeof firstValue === 'string') return safeText(firstValue, 300)
  }

  if (payload.data?.message) return safeText(payload.data.message, 300)

  return null
}

// ═══════════════════════════════════════════════════════════════
//  تشخیص خطای IP / -62
// ═══════════════════════════════════════════════════════════════
function isIpRelatedError(code: number | null, message: string | null): boolean {
  if (code === -62) return true

  const text = String(message || '').toLowerCase()

  return /ip|سرور|مجاز|permission|denied|not allowed|-62/.test(text)
}

// ═══════════════════════════════════════════════════════════════
//  محاسبه زمان گذشته از پرداخت
// ═══════════════════════════════════════════════════════════════
function getTimeWithin30Minutes(payment: any): {
  ok: boolean
  minutesElapsed: number
} {
  const candidates = [
    payment.paidAt,
    payment.verifiedAt,
    payment.createdAt,
  ]

  let latest: Date | null = null

  for (const candidate of candidates) {
    if (!candidate) continue

    const d = new Date(candidate)

    if (!Number.isNaN(d.getTime())) {
      if (!latest || d > latest) latest = d
    }
  }

  if (!latest) return { ok: false, minutesElapsed: 9999 }

  const diffMs = Date.now() - latest.getTime()
  const minutesElapsed = Math.max(0, Math.floor(diffMs / 60000))

  return {
    ok: minutesElapsed <= 30,
    minutesElapsed,
  }
}

// ═══════════════════════════════════════════════════════════════
//  POST: بازگشت تراکنش
// ═══════════════════════════════════════════════════════════════
export async function POST(req: NextRequest, context: ReverseContext) {
  let paymentLocked = false
  let lockedPaymentId: string | null = null

  try {
    const { id } = await context.params
    const paymentId = String(id || '').trim()

    if (!paymentId) {
      return NextResponse.json(
        { success: false, error: 'شناسه تراکنش ارسال نشده است.' },
        { status: 400 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const confirmText = String(body?.confirmText || '').trim()
    const normalizedConfirmText = confirmText.toLowerCase()

    if (!['reverse', 'بازگشت'].includes(normalizedConfirmText)) {
      return NextResponse.json(
        {
          success: false,
          error: 'برای تأیید بازگشت تراکنش، عبارت «بازگشت» را ارسال کنید.',
        },
        { status: 400 }
      )
    }

    const payment = (await db.client.onlinePayment.findUnique({
      where: { id: paymentId },
    })) as any

    if (!payment) {
      return NextResponse.json(
        { success: false, error: 'تراکنش یافت نشد.' },
        { status: 404 }
      )
    }

    // ★ پرداخت فاکتور مشتری از پنل درآمد پلتفرم قابل بازگشت نیست
    if (payment.invoiceId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'این تراکنش مربوط به فاکتور مشتری است و از پنل درآمد پلتفرم قابل بازگشت نیست.',
        },
        { status: 400 }
      )
    }

    if (String(payment.gatewayType || '').toLowerCase() !== 'zarinpal') {
      return NextResponse.json(
        {
          success: false,
          error: 'بازگشت فقط برای تراکنش‌های زرین‌پال ممکن است.',
        },
        { status: 400 }
      )
    }

    if (!payment.authority) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authority این تراکنش ثبت نشده است.',
        },
        { status: 400 }
      )
    }

    if (payment.status === 'reversed') {
      return NextResponse.json(
        {
          success: false,
          error: 'این تراکنش قبلاً برگشت خورده است.',
        },
        { status: 400 }
      )
    }

    // ★ اگر استعلام قبلی گفته REVERSED ولی وضعیت محلی هنوز paid است، همسان کن
    if (
      payment.status === 'paid' &&
      (payment.inquiryStatus === 'REVERSED' ||
        payment.settlementStatus === 'reversed')
    ) {
      const now = new Date()

      try {
        await db.client.onlinePayment.update({
          where: { id: paymentId },
          data: {
            status: 'reversed',
            settlementStatus: 'reversed',
            reversedAt: payment.reversedAt || now,
            reverseMessage:
              payment.reverseMessage || 'REVERSED_BY_ZARINPAL_INQUIRY',
            amount: 0,
            netAmount: 0,
            fee: 0,
          } as any,
        })
      } catch (syncErr: any) {
        console.error(
          '[Admin Payment Reverse] Sync already-reversed error:',
          syncErr
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: 'این تراکنش قبلاً در زرین‌پال برگشت خورده است.',
          data: {
            alreadyReversed: true,
          },
        },
        { status: 400 }
      )
    }

    if (payment.status !== 'paid') {
      return NextResponse.json(
        {
          success: false,
          error: 'فقط تراکنش‌های موفق قابل بازگشت هستند.',
        },
        { status: 400 }
      )
    }

    // ★ تراکنش تسویه‌شده معمولاً قابل reverse آنی نیست
    if (payment.settlementStatus === 'settled') {
      return NextResponse.json(
        {
          success: false,
          error: 'این تراکنش تسویه شده است و قابل بازگشت آنی نیست.',
        },
        { status: 400 }
      )
    }

    const timing = getTimeWithin30Minutes(payment)

    if (!timing.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `طبق مستندات زرین‌پال، بازگشت فقط تا ۳۰ دقیقه بعد از پرداخت ممکن است. زمان گذشته: ${timing.minutesElapsed} دقیقه.`,
        },
        { status: 400 }
      )
    }

    const merchantId = getZarinpalMerchantId()
    const sandbox = isZarinpalSandbox()

    if (!merchantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Merchant ID تنظیم نشده است.',
        },
        { status: 500 }
      )
    }

    // ★ جلوگیری از ارسال تراکنش واقعی به sandbox یا برعکس
    if (Boolean(payment.isSandbox) !== sandbox) {
      return NextResponse.json(
        {
          success: false,
          error: payment.isSandbox
            ? 'این تراکنش تستی ثبت شده اما درگاه روی محیط عملیاتی تنظیم است.'
            : 'این تراکنش عملیاتی ثبت شده اما درگاه روی محیط تستی تنظیم است.',
        },
        { status: 400 }
      )
    }

    // ═══════════════════════════════════════════════════════════
    //  قفل اتمی برای جلوگیری از double reverse
    // ═══════════════════════════════════════════════════════════
    const affected = await db.client.$executeRaw`
      UPDATE "OnlinePayments"
      SET "status" = 'reversing', "updatedAt" = NOW()
      WHERE "id" = ${paymentId}
        AND "status" = 'paid'
        AND "gatewayType" = 'zarinpal'
        AND "authority" IS NOT NULL
        AND "invoiceId" IS NULL
    `

    paymentLocked = Number(affected) > 0
    lockedPaymentId = paymentLocked ? paymentId : null

    if (!paymentLocked) {
      return NextResponse.json(
        {
          success: false,
          error: 'این تراکنش در حال پردازش است یا دیگر قابل بازگشت نیست.',
        },
        { status: 409 }
      )
    }

    const reverseUrl = getReverseUrl(sandbox)

    let res: Response

    try {
      res = await fetchWithTimeout(
        reverseUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            merchant_id: merchantId,
            authority: payment.authority,
          }),
          cache: 'no-store',
        },
        15000
      )
    } catch (fetchErr: any) {
      const isTimeout = fetchErr?.name === 'AbortError'

      // ★ اگر خطای شبکه قطعی بود، قفل را باز کن
      // ★ اگر timeout بود، وضعیت را reversing نگه دار چون ممکن است در زرین‌پال موفق شده باشد
      if (!isTimeout) {
        try {
          await db.client.onlinePayment.update({
            where: { id: paymentId },
            data: {
              status: 'paid',
              reverseCode: null,
              reverseMessage: 'NETWORK_ERROR',
            } as any,
          })
        } catch (unlockErr: any) {
          console.error(
            '[Admin Payment Reverse] Unlock after network error failed:',
            unlockErr
          )
        }

        paymentLocked = false
      } else {
        try {
          await db.client.onlinePayment.update({
            where: { id: paymentId },
            data: {
              reverseCode: null,
              reverseMessage: 'TIMEOUT_UNKNOWN_STATUS',
            } as any,
          })
        } catch (markErr: any) {
          console.error(
            '[Admin Payment Reverse] Mark timeout failed:',
            markErr
          )
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: isTimeout
            ? 'Time out در ارتباط با زرین‌پال. وضعیت تراکنش نامشخص است؛ لطفاً ابتدا از استعلام وضعیت استفاده کنید.'
            : 'خطای شبکه در ارسال درخواست بازگشت تراکنش.',
          data: {
            hint: isTimeout
              ? 'در حالت timeout، قبل از تلاش مجدد وضعیت را با استعلام بررسی کنید.'
              : undefined,
          },
        },
        { status: isTimeout ? 504 : 502 }
      )
    }

    const json = await res.json().catch(() => null)

    const rawCode = Number(json?.data?.code)
    const code = Number.isFinite(rawCode) ? rawCode : null
    const message = json?.data?.message ? String(json.data.message) : null

    const errorMessage =
      extractErrorMessage(json) ||
      (code !== null ? `کد پاسخ زرین‌پال: ${code}` : 'پاسخ نامعتبر از زرین‌پال.')

    const isSuccess =
      code === 100 || String(message || '').toLowerCase() === 'reversed'

    const now = new Date()

    const originalGross = Number(payment.grossAmount || payment.amount || 0)
    const originalFee = Number(payment.fee || 0)
    const originalNet = Number(payment.netAmount || payment.amount || 0)

    const appendedDescription = safeText(
      `${payment.description || ''} [REVERSED_BY_ADMIN] ${now.toISOString()} | originalGross=${originalGross} | originalFee=${originalFee} | originalNet=${originalNet}`,
      1000
    )

    // ═══════════════════════════════════════════════════════════
    //  موفق
    // ═══════════════════════════════════════════════════════════
    if (isSuccess) {
      let dbWarning: string | null = null

      try {
        await db.client.onlinePayment.update({
          where: { id: paymentId },
          data: {
            status: 'reversed',
            settlementStatus: 'reversed',
            reversedAt: now,
            reverseCode: code,
            reverseMessage: message ? safeText(message, 500) : 'Reversed',
            amount: 0,
            netAmount: 0,
            fee: 0,
            description: appendedDescription,
          } as any,
        })
      } catch (dbErr: any) {
        dbWarning = dbErr?.message || 'خطای ثبت محلی ریورس'
        console.error(
          '[Admin Payment Reverse] DB update failed after successful ZarinPal reverse:',
          dbErr
        )
      }

      // ★ اگر تراکنش اشتراکی بود، رکورد مرتبط در SubscriptionPayments را هم همسان کن
      if (payment.type === 'subscription_update' && payment.gatewayId) {
        try {
          await db.client.$executeRaw`
            UPDATE "SubscriptionPayments"
            SET "status" = 'reversed',
                "isPaid" = false,
                "paidAt" = NULL
            WHERE "id" = ${payment.gatewayId}
          `
        } catch (subErr: any) {
          console.warn(
            '[Admin Payment Reverse] Failed to rollback SubscriptionPayment:',
            subErr?.message
          )
        }
      }

      paymentLocked = false

      return NextResponse.json({
        success: true,
        message: dbWarning
          ? 'بازگشت در زرین‌پال موفق بود، اما ثبت محلی با خطا مواجه شد. لطفاً وضعیت را دستی بررسی کنید.'
          : 'تراکنش با موفقیت برگشت خورد.',
        data: {
          id: paymentId,
          code,
          message,
          reversedAt: now.toISOString(),
          authority: payment.authority,
          dbWarning,
        },
      })
    }

    // ═══════════════════════════════════════════════════════════
    //  ناموفق
    // ═══════════════════════════════════════════════════════════
    try {
      await db.client.onlinePayment.update({
        where: { id: paymentId },
        data: {
          status: 'paid',
          reverseCode: code,
          reverseMessage: safeText(errorMessage, 500),
        } as any,
      })
    } catch (updateErr: any) {
      console.error(
        '[Admin Payment Reverse] Failed to record reverse error:',
        updateErr
      )
    }

    paymentLocked = false

    const ipError = isIpRelatedError(code, errorMessage)

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        data: {
          code,
          message,
          errors: json?.errors,
          hint: ipError
            ? 'برای بازگشت تراکنش، IP سرور باید در پنل زرین‌پال ← تنظیمات درگاه ثبت شده باشد. در غیر این صورت خطای -62 دریافت می‌کنید.'
            : undefined,
        },
      },
      { status: 400 }
    )
  } catch (error: any) {
    // ★ اگر در هر مرحله‌ای بعد از قفل، خطای غیرمنتظره رخ داد، قفل را باز کن
    if (paymentLocked && lockedPaymentId) {
      try {
        await db.client.onlinePayment.update({
          where: { id: lockedPaymentId },
          data: { status: 'paid' } as any,
        })
      } catch (unlockErr: any) {
        console.error(
          '[Admin Payment Reverse] Unlock in catch failed:',
          unlockErr
        )
      }
    }

    console.error('[Admin Payment Reverse] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'خطا در بازگشت تراکنش',
      },
      { status: 500 }
    )
  }
}