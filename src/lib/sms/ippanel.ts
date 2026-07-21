// ============================================================================
// src/lib/sms/ippanel.ts — IPPanel SMS Service (v3.38)
// ----------------------------------------------------------------------------
// ★ ارسال پیامک OTP از طریق IPPanel (rest.ippanel.com)
// ★ API: https://rest.ippanel.com/v1/messages/patterns/send
// ★ روش: pattern-based (با متغیر "pass" برای کد OTP)
// ============================================================================

// ─── Configuration from environment ──────────────────────────
const IPPANEL_API_KEY = process.env.IPPANEL_API_KEY || ''
const IPPANEL_FROM_NUMBER = process.env.IPPANEL_FROM_NUMBER || '3000505'
const IPPANEL_OTP_PATTERN_CODE = process.env.IPPANEL_OTP_PATTERN_CODE || ''
const IPPANEL_OTP_PARAM_NAME = process.env.IPPANEL_OTP_PARAM_NAME || 'pass'

// ─── Types ───────────────────────────────────────────────────
export interface SendOtpResult {
  success: boolean
  message: string
  devPreview?: boolean
  messageId?: string
}

// ─── Normalize mobile number ─────────────────────────────────
export function normalizeMobile(mobile: string): string {
  let m = mobile.trim().replace(/\s/g, '')
  if (m.startsWith('+98')) return '0' + m.slice(3)
  if (m.startsWith('0098')) return '0' + m.slice(4)
  if (m.startsWith('98')) return '0' + m.slice(2)
  if (m.startsWith('0')) return m
  return '0' + m
}

// ─── Generate 6-digit OTP ────────────────────────────────────
export function generateOtpCode(length: number = 6): string {
  const digits = '0123456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * 10)]
  }
  return code
}

// ─── Send OTP via IPPanel pattern API ────────────────────────
export async function sendOtpViaIpPanel(
  mobile: string,
  code: string
): Promise<SendOtpResult> {
  // ─── Mock Mode: بدون API key کد رو لاگ می‌کنه ───
  if (!IPPANEL_API_KEY) {
    console.log(`[IPPanel Mock Mode] کد تایید برای ${mobile}: ${code}`)
    return { success: true, message: 'mock', devPreview: true }
  }

  // ─── بررسی وجود Pattern Code ───
  if (!IPPANEL_OTP_PATTERN_CODE) {
    console.error('[IPPanel] ⚠️ IPPANEL_OTP_PATTERN_CODE در .env تنظیم نشده!')
    console.log(`[IPPanel Fallback] کد تایید برای ${mobile}: ${code}`)
    return {
      success: true,
      message: 'fallback (no pattern code)',
      devPreview: true,
    }
  }

  // ─── نرمال‌سازی شماره موبایل ───
  const normalizedMobile = normalizeMobile(mobile)

  console.log('[IPPanel] Sending OTP:', {
    mobile: normalizedMobile,
    fromNumber: IPPANEL_FROM_NUMBER,
    patternCode: IPPANEL_OTP_PATTERN_CODE,
    paramName: IPPANEL_OTP_PARAM_NAME,
  })

  try {
    // ─── ساخت request body ───
    const requestBody = {
      Originator: IPPANEL_FROM_NUMBER,
      pattern_code: IPPANEL_OTP_PATTERN_CODE,
      Recipient: normalizedMobile,
      Values: {
        [IPPANEL_OTP_PARAM_NAME]: code,
      },
    }

    console.log('[IPPanel] Request Body:', JSON.stringify(requestBody))

    // ─── fetch با timeout ───
    const fetchWithTimeout = async (
      url: string,
      options: RequestInit,
      timeoutMs: number = 15000
    ): Promise<Response> => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(url, { ...options, signal: controller.signal })
        return res
      } finally {
        clearTimeout(timeoutId)
      }
    }

    const ENDPOINT = 'https://rest.ippanel.com/v1/messages/patterns/send'

    // ─── ارسال با retry ───
    let response: Response | null = null
    let lastError = ''

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[IPPanel] Attempt ${attempt} — sending to ${ENDPOINT} ...`)
        const res = await fetchWithTimeout(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `AccessKey ${IPPANEL_API_KEY}`,
          },
          body: JSON.stringify(requestBody),
        })

        if (res.status === 502 || res.status === 503 || res.status === 504) {
          console.warn(`[IPPanel] ⚠️ Got ${res.status}, attempt ${attempt}`)
          lastError = `HTTP ${res.status}`
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 2000))
            continue
          }
          break
        }

        response = res
        break
      } catch (err: any) {
        console.error(`[IPPanel] Network error attempt ${attempt}:`, err.message)
        lastError = err.message
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 2000))
        }
      }
    }

    // ─── اگر همه تلاش‌ها fail شدند ───
    if (!response) {
      console.error('[IPPanel] ❌ All attempts failed:', lastError)
      console.log(`[IPPanel Mock] کد تایید برای ${mobile}: ${code}`)
      return {
        success: true,
        message: 'mock (server unavailable)',
        devPreview: true,
      }
    }

    // ─── خواندن پاسخ ───
    const responseText = await response.text()
    console.log('[IPPanel] Response status:', response.status)
    console.log('[IPPanel] Response body:', responseText)

    let data: any = null
    try {
      data = JSON.parse(responseText)
    } catch {
      console.error('[IPPanel] JSON parse error, raw response:', responseText.substring(0, 500))
      return {
        success: false,
        message: `پاسخ نامعتبر از IPPanel: ${responseText.substring(0, 200)}`,
      }
    }

    // ─── بررسی موفقیت ───
    if (response.ok && (data.status === 'OK' || data.status === 'ok' || data.code === 'OK')) {
      console.log(`[IPPanel] ✓ OTP sent to ${normalizedMobile}, bulk_id: ${data.data?.bulk_id}`)
      return {
        success: true,
        message: 'sent',
        messageId: String(data.data?.bulk_id || ''),
      }
    }

    // ─── خطا ───
    console.error('[IPPanel] API error:', JSON.stringify(data))
    let errorMessage = 'خطای IPPanel'
    if (data.message) errorMessage = data.message
    else if (data.error) errorMessage = data.error

    return { success: false, message: errorMessage }

  } catch (error: any) {
    console.error('[IPPanel] Unexpected error:', error.message)
    return {
      success: false,
      message: 'خطا در ارتباط با IPPanel: ' + error.message,
    }
  }
}

// ─── Helper: check if IPPanel is configured ──────────────────
export function isIpPanelConfigured(): boolean {
  return !!IPPANEL_API_KEY && !!IPPANEL_OTP_PATTERN_CODE
}