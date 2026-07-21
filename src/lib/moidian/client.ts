// ============================================================================
// src/lib/moidian/client.ts — HTTP Client برای سامانه مودیان
// ============================================================================
// ★ این فایل مسئول ارتباط HTTP با API سامانه مودیان است.
//   پشتیبانی از دو محیط:
//     - sandbox:    https://sandbox-api.tax.gov.ir
//     - production: https://api.tax.gov.ir
//
// ★ Endpoints پیاده‌سازی‌شده:
//   - POST /api/v1/auth/token      → دریافت access token با JWT امضاشده
//   - POST /api/v1/invoice/submit  → ارسال فاکتور (نهایی)
//   - POST /api/v1/invoice/draft   → ارسال فاکتور به‌صورت پیش‌نویس
//   - GET  /api/v1/invoice/query/{referenceId}  → استعلام وضعیت فاکتور
//   - POST /api/v1/invoice/cancel/{referenceId} → لغو فاکتور
// ============================================================================

import { signJWT } from './signing'
import { decrypt, maskSensitive } from './crypto'

// ─── Typings ──────────────────────────────────────────────────

export type MoidianEnvironment = 'sandbox' | 'production'

export interface MoidianCredentials {
  clientId: string
  clientSecret: string
  privateKey: string
  fiscalId: string
  environment: MoidianEnvironment
}

export interface MoidianToken {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date
  tokenType: string
}

export interface MoidianInvoicePayload {
  header: {
    taxid: string             // شناسه مالیاتی فروشنده
    fiscalYear: string        // سال مالی (۱۴۰۳)
    invoiceDate: string       // YYYY-MM-DD
    invoiceNumber: string     // شماره فاکتور داخلی
    invoiceType: number       // ۱=فروش، ۲=خرید، ۳=برگشت از فروش
    invoiceSubject: string    // موضوع فاکتور
    paymentType: number       // ۱=نقدی، ۲=اعتباری، ۳=چکی
    buyer?: {
      taxid?: string          // شناسه مالیاتی خریدار (اختیاری برای مصرف‌کننده نهایی)
      name?: string
      address?: string
      phone?: string
    }
    seller: {
      taxid: string
      name: string
      address?: string
      phone?: string
    }
  }
  body: {
    items: Array<{
      description: string
      quantity: number
      unit: string           // 'عدد', 'کیلوگرم', 'لیتر', ...
      unitPrice: number
      discount: number
      taxRate: number        // درصد (۰، ۹، ...)
      taxAmount: number
      totalAmount: number
    }>
    totalDiscount: number
    totalTax: number
    totalAmount: number
  }
}

export interface MoidianSubmitResponse {
  success: boolean
  referenceId?: string      // UUID مودیان
  status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'FAILED' | 'CANCELLED'
  error?: {
    code: string
    message: string
    details?: any
  }
}

export interface MoidianQueryResponse {
  success: boolean
  referenceId?: string
  status?: 'PENDING' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'FAILED'
  invoiceNumber?: string
  taxid?: string
  errorCode?: string
  errorMessage?: string
  error?: any
}

// ─── Endpoints ────────────────────────────────────────────────

const ENDPOINTS = {
  sandbox: {
    baseUrl: 'https://sandbox-api.tax.gov.ir',
    audience: 'sandbox.tax.gov.ir',
  },
  production: {
    baseUrl: 'https://api.tax.gov.ir',
    audience: 'tax.gov.ir',
  },
}

function getBaseUrl(env: MoidianEnvironment): string {
  return ENDPOINTS[env].baseUrl
}

function getAudience(env: MoidianEnvironment): string {
  return ENDPOINTS[env].audience
}

// ─── Authentication ───────────────────────────────────────────

/**
 * دریافت access token از مودیان با JWT امضاشده
 *
 * فرآیند:
 *   ۱. ساخت JWT با private key و client_id
 *   ۲. ارسال به /api/v1/auth/token
 *   ۳. دریافت access_token + refresh_token
 */
export async function getAccessToken(creds: MoidianCredentials): Promise<MoidianToken | null> {
  const baseUrl = getBaseUrl(creds.environment)
  const audience = getAudience(creds.environment)

  // ★ ساخت JWT امزاشده با private key
  const jwt = signJWT(creds.privateKey, creds.clientId, audience)

  try {
    const response = await fetch(`${baseUrl}/api/v1/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        client_assertion: jwt,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[Moidian Auth] Failed:', response.status, errText)
      return null
    }

    const data = await response.json()

    if (!data.access_token) {
      console.error('[Moidian Auth] No access_token in response:', data)
      return null
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      tokenType: data.token_type || 'Bearer',
    }
  } catch (err: any) {
    console.error('[Moidian Auth] Network error:', err?.message)
    return null
  }
}

// ─── Invoice Submission ──────────────────────────────────────

/**
 * ارسال فاکتور به مودیان
 *
 * @param creds - credentials مودیان
 * @param token - access token معتبر
 * @param payload - فاکتور به فرمت مودیان
 * @param asDraft - اگر true باشد، فاکتور به‌صورت پیش‌نویس ارسال می‌شود
 */
export async function submitInvoice(
  creds: MoidianCredentials,
  token: MoidianToken,
  payload: MoidianInvoicePayload,
  asDraft: boolean = false
): Promise<MoidianSubmitResponse> {
  const baseUrl = getBaseUrl(creds.environment)
  const endpoint = asDraft ? '/api/v1/invoice/draft' : '/api/v1/invoice/submit'

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'taxid': creds.fiscalId,
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (response.ok && data.referenceId) {
      return {
        success: true,
        referenceId: data.referenceId,
        status: 'PENDING',
      }
    }

    return {
      success: false,
      error: {
        code: data.error?.code || `HTTP_${response.status}`,
        message: data.error?.message || data.message || 'خطای ناشناخته در ارسال فاکتور',
        details: data.error?.details,
      },
    }
  } catch (err: any) {
    console.error('[Moidian Submit] Network error:', err?.message)
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: `خطای شبکه: ${err?.message}`,
      },
    }
  }
}

// ─── Query Invoice Status ────────────────────────────────────

/**
 * استعلام وضعیت فاکتور بر اساس reference ID
 */
export async function queryInvoiceStatus(
  creds: MoidianCredentials,
  token: MoidianToken,
  referenceId: string
): Promise<MoidianQueryResponse> {
  const baseUrl = getBaseUrl(creds.environment)

  try {
    const response = await fetch(`${baseUrl}/api/v1/invoice/query/${referenceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Accept': 'application/json',
        'taxid': creds.fiscalId,
      },
    })

    const data = await response.json()

    if (response.ok) {
      return {
        success: true,
        referenceId: data.referenceId,
        status: data.status,
        invoiceNumber: data.invoiceNumber,
        taxid: data.taxid,
        errorCode: data.errorCode,
        errorMessage: data.errorMessage,
      }
    }

    return {
      success: false,
      referenceId,
      error: data,
    }
  } catch (err: any) {
    console.error('[Moidian Query] Network error:', err?.message)
    return {
      success: false,
      referenceId,
      error: { message: `خطای شبکه: ${err?.message}` },
    }
  }
}

// ─── Cancel Invoice ──────────────────────────────────────────

/**
 * لغو فاکتور در مودیان (در صورت رد شدن یا اشتباه)
 */
export async function cancelInvoice(
  creds: MoidianCredentials,
  token: MoidianToken,
  referenceId: string,
  reason: string = 'CANCELLED_BY_SELLER'
): Promise<MoidianSubmitResponse> {
  const baseUrl = getBaseUrl(creds.environment)

  try {
    const response = await fetch(`${baseUrl}/api/v1/invoice/cancel/${referenceId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'taxid': creds.fiscalId,
      },
      body: JSON.stringify({ reason }),
    })

    const data = await response.json()

    if (response.ok) {
      return {
        success: true,
        referenceId: data.referenceId || referenceId,
        status: 'CANCELLED',
      }
    }

    return {
      success: false,
      error: {
        code: data.error?.code || `HTTP_${response.status}`,
        message: data.error?.message || 'خطا در لغو فاکتور',
      },
    }
  } catch (err: any) {
    console.error('[Moidian Cancel] Network error:', err?.message)
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: `خطای شبکه: ${err?.message}`,
      },
    }
  }
}

// ─── Test Connection ─────────────────────────────────────────

/**
 * تست اتصال به مودیان — فقط access token می‌گیرد و برمی‌گرداند
 * این تابع برای دکمه «تست اتصال» در تنظیمات استفاده می‌شود.
 */
export async function testConnection(creds: MoidianCredentials): Promise<{
  success: boolean
  message: string
  tokenExpiresAt?: Date
}> {
  const token = await getAccessToken(creds)
  if (token) {
    return {
      success: true,
      message: `اتصال برقرار است. شناسه کلاینت: ${maskSensitive(creds.clientId)}`,
      tokenExpiresAt: token.expiresAt,
    }
  }
  return {
    success: false,
    message: 'اتصال برقرار نشد. لطفاً credentials را بررسی کنید.',
  }
}
