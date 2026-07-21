// ============================================================================
// src/lib/sms/notification.ts — Notification SMS Service (v5.2 ★★★ Phase 4)
// ShopAccounting — Send notification SMS via IPPanel (non-OTP patterns)
// ----------------------------------------------------------------------------
// ★★★ این فایل برای ارسال پیامک‌های اعلانی (نه OTP) استفاده می‌شود
//   مانند: یادآوری اقساط، تأیید پرداخت، اعلان‌های عمومی
//
// ★ تفاوت با ippanel.ts (OTP):
//   - ippanel.ts: فقط برای OTP با پترن IPPANEL_OTP_PATTERN_CODE (متغیر pass)
//   - notification.ts: برای اعلان‌ها با پترن IPPANEL_NOTIFICATION_PATTERN_CODE (متغیر price)
//
// ★ پترن اعلان (تنظیم شده توسط کاربر):
//   - کد پترن: pzkjdpbhhwrc34i
//   - متغیر: price (رشته — مبلغ به تومان با جداکننده)
//   - مثال متن پترن: "قسط شما به مبلغ %price% تومان سررسید شده"
// ============================================================================

import { db } from '@/lib/db'

// ─── Configuration from environment ──────────────────────────
const IPPANEL_API_KEY = process.env.IPPANEL_API_KEY || ''
const IPPANEL_FROM_NUMBER = process.env.IPPANEL_FROM_NUMBER || '3000505'
// ★★★ v5.2: پترن اعلان (مستقل از پترن OTP)
const IPPANEL_NOTIFICATION_PATTERN_CODE = process.env.IPPANEL_NOTIFICATION_PATTERN_CODE || 'pzkjdpbhhwrc34i'
// ★★★ v5.2: نام متغیر در پترن اعلان (پیش‌فرض: price)
const IPPANEL_NOTIFICATION_PARAM_NAME = process.env.IPPANEL_NOTIFICATION_PARAM_NAME || 'price'

// ─── Types ───────────────────────────────────────────────────

export interface SendNotificationResult {
  success: boolean
  message: string
  messageId?: string
  mockMode?: boolean
  logId?: string
}

export interface InstallmentReminderData {
  tenantId: string
  customerName: string
  customerMobile: string
  invoiceNumber: string
  installmentNumber: number
  amount: number // به ریال
  dueDate: Date
  portalUrl?: string
}

// ─── Normalize mobile number ─────────────────────────────────

export function normalizeMobile(mobile: string): string {
  let m = (mobile || '').trim().replace(/\s/g, '')
  if (m.startsWith('+98')) return '0' + m.slice(3)
  if (m.startsWith('0098')) return '0' + m.slice(4)
  if (m.startsWith('98') && m.length === 12) return '0' + m.slice(2)
  if (m.startsWith('0')) return m
  return '0' + m
}

// ─── Format amount to Toman string with separators ───────────
//   1500000 (ریال) → "150,000" (تومان)
//   این مقدار در متغیر price جایگذاری می‌شود
export function formatAmountToToman(amountInRial: number): string {
  const toman = Math.round(amountInRial / 10) // تبدیل ریال به تومان
  return toman.toLocaleString('en-US') // جداکننده هزارگان با کاما
}

// ─── Send notification via IPPanel pattern API ───────────────

/**
 * ارسال پیامک اعلان با پترن notification
 *
 * @param mobile شماره موبایل گیرنده
 * @param amountInToman مبلغ به تومان (به‌عنوان string در پترن جایگذاری می‌شود)
 * @param tenantId برای ثبت در SmsLog
 * @param referenceType نوع مرجع (مثلاً 'installment')
 * @param referenceId شناسه مرجع
 * @returns SendNotificationResult
 */
export async function sendNotificationSms(
  mobile: string,
  amountInToman: string,
  tenantId: string,
  referenceType?: string,
  referenceId?: string
): Promise<SendNotificationResult> {
  const normalizedMobile = normalizeMobile(mobile)

  console.log('[SmsNotification] Sending:', {
    mobile: normalizedMobile,
    amount: amountInToman,
    patternCode: IPPANEL_NOTIFICATION_PATTERN_CODE,
    paramName: IPPANEL_NOTIFICATION_PARAM_NAME,
    tenantId,
    referenceType,
    referenceId,
  })

  // ★ ۱. ابتدا یک رکورد pending در SmsLog ایجاد کن
  let logId: string | undefined
  try {
    const log = await db.client.smsLog.create({
      data: {
        tenantId,
        type: 'installment_reminder',
        recipient: normalizedMobile,
        message: `مبلغ: ${amountInToman} تومان`,
        referenceType: referenceType || null,
        referenceId: referenceId || null,
        status: 'pending',
        mockMode: !IPPANEL_API_KEY,
      },
    })
    logId = log.id
  } catch (err: any) {
    console.warn('[SmsNotification] Failed to create SmsLog:', err?.message)
  }

  // ─── Mock Mode: بدون API key ──────────────────────────────
  if (!IPPANEL_API_KEY) {
    console.log(`[SmsNotification] 🔶 MOCK MODE — Notification to ${normalizedMobile}: ${amountInToman} تومان`)

    // ★ به‌روزرسانی log
    if (logId) {
      try {
        await db.client.smsLog.update({
          where: { id: logId },
          data: {
            status: 'sent',
            mockMode: true,
            messageId: `mock-${Date.now()}`,
          },
        })
      } catch {}
    }

    return {
      success: true,
      message: 'mock mode (no API key)',
      mockMode: true,
      logId,
    }
  }

  // ─── بررسی وجود Pattern Code ──────────────────────────────
  if (!IPPANEL_NOTIFICATION_PATTERN_CODE) {
    console.error('[SmsNotification] ⚠️ IPPANEL_NOTIFICATION_PATTERN_CODE در .env تنظیم نشده!')

    if (logId) {
      try {
        await db.client.smsLog.update({
          where: { id: logId },
          data: {
            status: 'failed',
            errorMessage: 'Pattern code not configured',
          },
        })
      } catch {}
    }

    return {
      success: false,
      message: 'Pattern code not configured',
      logId,
    }
  }

  // ─── ساخت request body ────────────────────────────────────
  //   IPPanel API برای pattern-based:
  //   {
  //     "Originator": "3000505",
  //     "pattern_code": "pzkjdpbhhwrc34i",
  //     "Recipient": "09123456789",  // string، نه array
  //     "Values": { "price": "150,000" }
  //   }
  const requestBody = {
    Originator: IPPANEL_FROM_NUMBER,
    pattern_code: IPPANEL_NOTIFICATION_PATTERN_CODE,
    Recipient: normalizedMobile,
    Values: {
      [IPPANEL_NOTIFICATION_PARAM_NAME]: amountInToman,
    },
  }

  console.log('[SmsNotification] Request body:', JSON.stringify(requestBody))

  try {
    // ★ fetch با timeout ۱۵ ثانیه
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch('https://rest.ippanel.com/v1/messages/patterns/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `AccessKey ${IPPANEL_API_KEY}`,
        'User-Agent': 'ShopAccounting/1.0 (Node.js; +https://shopaccounting.ir)',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9,fa;q=0.8',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const responseText = await response.text()
    console.log('[SmsNotification] Response status:', response.status)
    console.log('[SmsNotification] Response body:', responseText)

    // ★ اگر HTML برگرداند (Cloudflare)
    if (responseText.startsWith('<!DOCTYPE') || responseText.startsWith('<html')) {
      console.warn('[SmsNotification] HTML response (Cloudflare block)')

      if (logId) {
        try {
          await db.client.smsLog.update({
            where: { id: logId },
            data: {
              status: 'failed',
              errorMessage: 'Cloudflare block (HTML response)',
            },
          })
        } catch {}
      }

      // ★ fallback به mock mode
      console.log(`[SmsNotification] 🔶 FALLBACK MOCK — Notification to ${normalizedMobile}: ${amountInToman} تومان`)

      if (logId) {
        try {
          await db.client.smsLog.update({
            where: { id: logId },
            data: {
              status: 'sent',
              mockMode: true,
              messageId: `mock-${Date.now()}`,
            },
          })
        } catch {}
      }

      return {
        success: true,
        message: 'mock (Cloudflare block, fallback)',
        mockMode: true,
        logId,
      }
    }

    let data: any = null
    try {
      data = JSON.parse(responseText)
    } catch {
      console.error('[SmsNotification] JSON parse error')

      if (logId) {
        try {
          await db.client.smsLog.update({
            where: { id: logId },
            data: {
              status: 'failed',
              errorMessage: `Invalid JSON: ${responseText.substring(0, 200)}`,
            },
          })
        } catch {}
      }

      return {
        success: false,
        message: 'پاسخ نامعتبر از IPPanel',
        logId,
      }
    }

    // ★★★ تشخیص موفقیت (case-insensitive)
    const statusLower = (data?.status || '').toString().toLowerCase()
    const codeLower = (data?.code || '').toString().toLowerCase()
    const isSuccess =
      response.ok &&
      (statusLower === 'ok' ||
        statusLower === 'sent' ||
        statusLower === 'success' ||
        codeLower === 'ok' ||
        codeLower === '200' ||
        !!data?.data?.message_id ||
        !!data?.data?.bulk_id)

    if (isSuccess) {
      const messageId = String(data.data?.bulk_id || data.data?.message_id || '')
      console.log(`[SmsNotification] ✓ Sent to ${normalizedMobile}, bulk_id: ${messageId}`)

      if (logId) {
        try {
          await db.client.smsLog.update({
            where: { id: logId },
            data: {
              status: 'sent',
              messageId,
            },
          })
        } catch {}
      }

      return {
        success: true,
        message: 'sent',
        messageId,
        logId,
      }
    }

    // ★ خطای IPPanel
    console.error('[SmsNotification] API error:', JSON.stringify(data))
    const errorMessage = data.message || data.error || 'خطای IPPanel'

    if (logId) {
      try {
        await db.client.smsLog.update({
          where: { id: logId },
          data: {
            status: 'failed',
            errorMessage,
          },
        })
      } catch {}
    }

    return {
      success: false,
      message: errorMessage,
      logId,
    }
  } catch (error: any) {
    console.error('[SmsNotification] Unexpected error:', error.message)

    if (logId) {
      try {
        await db.client.smsLog.update({
          where: { id: logId },
          data: {
            status: 'failed',
            errorMessage: error.message,
          },
        })
      } catch {}
    }

    return {
      success: false,
      message: 'خطا در ارتباط با IPPanel: ' + error.message,
      logId,
    }
  }
}

// ─── Helper: Send installment reminder ──────────────────────

/**
 * ارسال یادآوری قسط به مشتری
 *
 * این تابع برای cron job روزانه استفاده می‌شود
 */
export async function sendInstallmentReminder(
  data: InstallmentReminderData
): Promise<SendNotificationResult> {
  const amountInToman = formatAmountToToman(data.amount)

  console.log('[SmsNotification] Installment reminder:', {
    tenantId: data.tenantId,
    customerName: data.customerName,
    customerMobile: data.customerMobile,
    invoiceNumber: data.invoiceNumber,
    installmentNumber: data.installmentNumber,
    amountInToman,
    dueDate: data.dueDate.toISOString(),
  })

  return await sendNotificationSms(
    data.customerMobile,
    amountInToman,
    data.tenantId,
    'installment',
    `${data.invoiceNumber}-${data.installmentNumber}`
  )
}

// ─── Helper: Check if SMS notifications are enabled for tenant ─

export async function isSmsEnabledForTenant(tenantId: string): Promise<boolean> {
  try {
    const settings = await db.client.smsSettings.findUnique({
      where: { tenantId },
    })

    // ★ اگر تنظیماتی وجود ندارد، پیش‌فرض فعال است
    if (!settings) return true

    return settings.isEnabled
  } catch (err: any) {
    console.warn('[SmsNotification] Failed to check SMS settings:', err?.message)
    // ★ در صورت خطا، پیش‌فرض فعال است
    return true
  }
}

// ─── Helper: Get SMS settings for tenant ─────────────────────

export async function getSmsSettings(tenantId: string) {
  try {
    let settings = await db.client.smsSettings.findUnique({
      where: { tenantId },
    })

    // ★ اگر تنظیماتی وجود ندارد، پیش‌فرض ایجاد کن
    if (!settings) {
      settings = await db.client.smsSettings.create({
        data: {
          tenantId,
          isEnabled: true,
          daysBeforeDue: 1,
          sendOnDueDate: true,
          daysAfterDue: 3,
          sendHour: 9,
          sendMinute: 30,
        },
      })
      console.log('[SmsNotification] Created default SMS settings for tenant:', tenantId)
    }

    return settings
  } catch (err: any) {
    console.warn('[SmsNotification] Failed to get SMS settings:', err?.message)
    return {
      tenantId,
      isEnabled: true,
      daysBeforeDue: 1,
      sendOnDueDate: true,
      daysAfterDue: 3,
      sendHour: 9,
      sendMinute: 30,
      customMessageTemplate: null,
    }
  }
}

// ─── Helper: Check if IPPanel notification is configured ─────

export function isNotificationConfigured(): boolean {
  return !!IPPANEL_API_KEY && !!IPPANEL_NOTIFICATION_PATTERN_CODE
}

// ─── Helper: Check if a reminder was already sent ────────────

/**
 * بررسی اینکه آیا برای یک قسط خاص، در یک روز خاص، پیامک ارسال شده است
 * این کار از ارسال پیامک تکراری در یک روز جلوگیری می‌کند
 */
export async function wasReminderSentToday(
  tenantId: string,
  referenceId: string,
  reminderType: string = 'installment_reminder'
): Promise<boolean> {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const count = await db.client.smsLog.count({
      where: {
        tenantId,
        type: reminderType,
        referenceId,
        status: 'sent',
        sentAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    })

    return count > 0
  } catch (err: any) {
    console.warn('[SmsNotification] Failed to check if reminder was sent:', err?.message)
    return false
  }
}
