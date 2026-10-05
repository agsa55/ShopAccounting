// ============================================================================
// src/app/api/admin/payments/[id]/inquiry/route.ts (v1.0 ★★★)
// ShopAccounting — Admin ZarinPal Inquiry Status
// ----------------------------------------------------------------------------
// ★ وضعیت واقعی تراکنش را از زرین‌پال استعلام می‌گیرد.
// ★ این متد تراکنش را verify نمی‌کند؛ فقط وضعیت را نشان می‌دهد.
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

function getInquiryUrl(sandbox: boolean): string {
  const base = sandbox
    ? 'https://sandbox.zarinpal.com'
    : 'https://payment.zarinpal.com'

  return `${base}/pg/v4/payment/inquiry.json`
}

function getStatusLabel(status: string | null | undefined): string {
  const s = String(status || '').toUpperCase()

  if (s === 'VERIFIED') return 'تأیید شده'
  if (s === 'PAID') return 'پرداخت شده (هنوز تأیید نشده)'
  if (s === 'IN_BANK') return 'در حال پردازش / در بانک'
  if (s === 'FAILED') return 'ناموفق'
  if (s === 'REVERSED') return 'برگشت خورده'

  return status || 'نامشخص'
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
        { success: false, error: 'استعلام فقط برای تراکنش‌های زرین‌پال ممکن است.' },
        { status: 400 }
      )
    }

    if (!payment.authority) {
      return NextResponse.json(
        { success: false, error: 'Authority این تراکنش ثبت نشده است.' },
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

    const inquiryUrl = getInquiryUrl(sandbox)

    const res = await fetchWithTimeout(
      inquiryUrl,
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

    const data = json?.data || {}
    const errors = json?.errors

    const inquiryStatus = String(data.status || '').toUpperCase() || null
    const inquiryCode = Number.isFinite(Number(data.code)) ? Number(data.code) : null
    const inquiryMessage =
      data.message ||
      (Array.isArray(errors) ? errors[0]?.message : null) ||
      (errors?.message ? String(errors.message) : null) ||
      null

    const now = new Date()

    const updateData: any = {
      inquiryStatus,
      inquiryCode,
      inquiryMessage: inquiryMessage ? String(inquiryMessage).slice(0, 500) : null,
      inquiryAt: now,
    }

    // اگر زرین‌پال گفت برگشت خورده، وضعیت داخلی را هم همسان کن
    if (inquiryStatus === 'REVERSED' && payment.status !== 'reversed') {
      updateData.status = 'reversed'
      updateData.settlementStatus = 'reversed'
      updateData.reversedAt = now
      updateData.reverseMessage = 'REVERSED_BY_ZARINPAL_INQUIRY'
    }

    // اگر هنوز pending بود و زرین‌پال گفت failed
    if (inquiryStatus === 'FAILED' && payment.status === 'pending') {
      updateData.status = 'failed'
      updateData.settlementStatus = 'failed'
    }

    await db.client.onlinePayment.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      message: 'استعلام وضعیت با موفقیت انجام شد.',
      data: {
        id,
        authority: payment.authority,
        inquiryStatus,
        inquiryStatusLabel: getStatusLabel(inquiryStatus),
        inquiryCode,
        inquiryMessage,
        inquiryAt: now.toISOString(),
        internalStatus: updateData.status || payment.status,
      },
    })
  } catch (error: any) {
    console.error('[Admin Payment Inquiry] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'خطا در استعلام وضعیت تراکنش',
      },
      { status: 500 }
    )
  }
}