// ============================================================================
// src/app/api/admin/payments/[id]/reverse/route.ts (v1.0 ★★★)
// ShopAccounting — Admin ZarinPal Reverse Transaction
// ----------------------------------------------------------------------------
// ★ فقط برای تراکنش‌های موفق زرین‌پال تا ۳۰ دقیقه بعد از پرداخت.
// ★ طبق مستندات زرین‌پال، IP سرور باید در پنل زرین‌پال ثبت شده باشد.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getZarinpalMerchantId, isZarinpalSandbox } from '@/lib/zarinpal/donation-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

function getReverseUrl(sandbox: boolean): string {
  const base = sandbox
    ? 'https://sandbox.zarinpal.com'
    : 'https://payment.zarinpal.com'

  return `${base}/pg/v4/payment/reverse.json`
}

function getTimeWithin30Minutes(payment: any): { ok: boolean; minutesElapsed: number } {
  const candidates = [
    payment.paidAt,
    payment.verifiedAt,
    payment.createdAt,
  ]

  let latest: Date | null = null

  for (const c of candidates) {
    if (!c) continue
    const d = new Date(c)
    if (!Number.isNaN(d.getTime())) {
      if (!latest || d > latest) latest = d
    }
  }

  if (!latest) return { ok: false, minutesElapsed: 9999 }

  const diffMs = Date.now() - latest.getTime()
  const minutesElapsed = Math.floor(diffMs / 60000)

  return {
    ok: minutesElapsed <= 30,
    minutesElapsed,
  }
}

export async function POST(req: NextRequest, context: any) {
  try {
    const resolvedParams = await Promise.resolve(context.params)
    const id = String(resolvedParams?.id || '').trim()

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه تراکنش ارسال نشده است.' },
        { status: 400 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const confirmText = String(body.confirmText || '').trim()

    if (confirmText !== 'REVERSE') {
      return NextResponse.json(
        { success: false, error: 'برای تأیید ریورس، عبارت REVERSE را ارسال کنید.' },
        { status: 400 }
      )
    }

    const payment = await db.client.onlinePayment.findUnique({
      where: { id },
    })

    if (!payment) {
      return NextResponse.json(
        { success: false, error: 'تراکنش یافت نشد.' },
        { status: 404 }
      )
    }

    if (String(payment.gatewayType || '').toLowerCase() !== 'zarinpal') {
      return NextResponse.json(
        { success: false, error: 'ریورس فقط برای تراکنش‌های زرین‌پال ممکن است.' },
        { status: 400 }
      )
    }

    if (!payment.authority) {
      return NextResponse.json(
        { success: false, error: 'Authority این تراکنش ثبت نشده است.' },
        { status: 400 }
      )
    }

    if (payment.status === 'reversed') {
      return NextResponse.json(
        { success: false, error: 'این تراکنش قبلاً برگشت خورده است.' },
        { status: 400 }
      )
    }

if (payment.status !== 'paid') {
  return NextResponse.json(
    { success: false, error: 'فقط تراکنش‌های موفق قابل ریورس هستند.' },
    { status: 400 }
  )
}

    const timing = getTimeWithin30Minutes(payment)

    if (!timing.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `طبق مستندات زرین‌پال، ریورس فقط تا ۳۰ دقیقه بعد از پرداخت ممکن است. زمان گذشته: ${timing.minutesElapsed} دقیقه.`,
        },
        { status: 400 }
      )
    }

    const merchantId = getZarinpalMerchantId()
    const sandbox = isZarinpalSandbox()

    if (!merchantId) {
      return NextResponse.json(
        { success: false, error: 'Merchant ID تنظیم نشده است.' },
        { status: 500 }
      )
    }

    const reverseUrl = getReverseUrl(sandbox)

    const res = await fetchWithTimeout(
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

    const json = await res.json().catch(() => null)

    const code = Number(json?.data?.code)
    const message = json?.data?.message || null
    const errors = json?.errors

    const errorMessage =
      (Array.isArray(errors) ? errors[0]?.message : null) ||
      (errors?.message ? String(errors.message) : null) ||
      (Number.isFinite(code) ? `کد پاسخ زرین‌پال: ${code}` : 'پاسخ نامعتبر از زرین‌پال.')

    const isSuccess = code === 100 || String(message || '').toLowerCase() === 'reversed'

    const now = new Date()

    if (isSuccess) {
      await db.client.onlinePayment.update({
        where: { id },
        data: {
          status: 'reversed',
          settlementStatus: 'reversed',
          reversedAt: now,
          reverseCode: Number.isFinite(code) ? code : null,
          reverseMessage: message ? String(message).slice(0, 500) : 'Reversed',
          netAmount: 0,
          amount: 0,
          description:
            `${payment.description || ''}\n[REVERSED_BY_ADMIN] ${now.toISOString()}`.slice(0, 1000),
        },
      })

      return NextResponse.json({
        success: true,
        message: 'تراکنش با موفقیت برگشت خورد.',
        data: {
          id,
          code,
          message,
          reversedAt: now.toISOString(),
        },
      })
    }

    await db.client.onlinePayment.update({
      where: { id },
      data: {
        reverseCode: Number.isFinite(code) ? code : null,
        reverseMessage: String(errorMessage).slice(0, 500),
      },
    })

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        data: {
          code,
          message,
          errors,
          hint: 'اگر خطای IP گرفتید، IP سرور را در پنل زرین‌پال ثبت کنید.',
        },
      },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('[Admin Payment Reverse] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'خطا در ریورس تراکنش',
      },
      { status: 500 }
    )
  }
}