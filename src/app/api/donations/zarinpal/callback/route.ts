// ============================================================================
// src/app/api/donations/zarinpal/callback/route.ts
// ★ بازگشت از زرین‌پال و تأیید نهایی پرداخت حمایتی
// ★ پشتیبانی از Sandbox و Production
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

function redirectWithStatus(
  req: NextRequest,
  status: 'success' | 'failed' | 'cancelled',
  amountToman?: number
) {
  const base = getPublicBaseUrl(req)
  const params = new URLSearchParams()

  params.set('donation', status)

  if (typeof amountToman === 'number' && Number.isFinite(amountToman) && amountToman > 0) {
    params.set('amountToman', String(amountToman))
  }

  return NextResponse.redirect(`${base}/?${params.toString()}`)
}

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

export async function GET(req: NextRequest) {
  try {
    const sandbox = isZarinpalSandbox()
    const urls = getZarinpalUrls(sandbox)
    const merchantId = getZarinpalMerchantId()

    if (!merchantId) {
      console.error('[ZarinPal Donation Callback] Merchant ID is missing')
      return redirectWithStatus(req, 'failed')
    }

    const url = req.nextUrl

    const authority = url.searchParams.get('authority')
    const statusFromZarinPal =
      url.searchParams.get('Status') || url.searchParams.get('status')

    const amountTomanParam = url.searchParams.get('amountToman')
    const amountToman = Number(amountTomanParam)

    console.log('[ZarinPal Donation Callback] Received:', {
      sandbox,
      authority,
      statusFromZarinPal,
      amountToman,
    })

    // اگر کاربر پرداخت را لغو کرد یا Status_OK نبود
    if (!authority || statusFromZarinPal !== 'OK') {
      return redirectWithStatus(
        req,
        statusFromZarinPal === 'NOK' ? 'cancelled' : 'failed',
        Number.isFinite(amountToman) ? amountToman : undefined
      )
    }

    if (!Number.isFinite(amountToman) || amountToman <= 0) {
      return redirectWithStatus(req, 'failed')
    }

    // زرین‌پال مبلغ را به ریال می‌گیرد
    const amountRial = Math.round(amountToman * 10)

    const verifyRes = await fetch(urls.verify, {
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
    })

    const verifyJson = await verifyRes.json().catch(() => null)

    if (!verifyRes.ok || !verifyJson) {
      console.error('[ZarinPal Donation Callback] Verify HTTP error:', {
        status: verifyRes.status,
        json: verifyJson,
      })

      return redirectWithStatus(req, 'failed', amountToman)
    }

    const code = verifyJson.data?.code
    const refId = verifyJson.data?.ref_id

    console.log('[ZarinPal Donation Callback] Verify response:', {
      code,
      refId,
      authority,
      amountToman,
      amountRial,
    })

    /**
     * کدهای موفق زرین‌پال:
     * 100 = تأیید موفق
     * 101 = قبلاً تأیید شده
     * 200 = در برخی پاسخ‌ها به‌عنوان موفق در نظر گرفته می‌شود
     */
    if (code === 100 || code === 101 || code === 200) {
      return redirectWithStatus(req, 'success', amountToman)
    }

    const errorMessage = getErrorMessage(verifyJson)

    console.warn('[ZarinPal Donation Callback] Verification failed:', {
      code,
      errorMessage,
      verifyJson,
    })

    return redirectWithStatus(req, 'failed', amountToman)
  } catch (err) {
    console.error('[ZarinPal Donation Callback] Unexpected error:', err)
    return redirectWithStatus(req, 'failed')
  }
}