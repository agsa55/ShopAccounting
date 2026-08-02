// ============================================================================
// src/lib/moidian/index.ts — توابع راهنمای اصلی برای اتصال سامانه مودیان (v9.9)
// ============================================================================
// ★★★ این نسخه اعتبارسنجی کلید خصوصی را کاملاً حذف کرده است.
//   اعتبارسنجی واقعی هنگام استفاده از کلید (signing.ts) انجام می‌شود.
//
// ★★★ v9.9 تغییرات:
//   ★ جلوگیری از ذخیره credentials با کلید fallback در production (امنیت)
//   ★ تعیین داینامیک سال مالی از تاریخ فاکتور (به‌جای hardcoded '1403')
// ============================================================================

import { db } from '@/lib/db'
import { getAccessToken, submitInvoice, queryInvoiceStatus, cancelInvoice, testConnection, type MoidianCredentials, type MoidianToken, type MoidianInvoicePayload } from './client'
import { mapInvoiceToMoidian, validateMoidianPayload } from './invoice-mapper'
import { encrypt, decrypt, isUsingFallbackKey, maskSensitive } from './crypto'

// ─── Typings ──────────────────────────────────────────────────

export interface MoidianSettingsInput {
  fiscalId: string
  economicCode?: string
  clientId: string
  clientSecret: string
  privateKey: string
  environment: 'sandbox' | 'production'
  autoSubmit?: boolean
}

export interface MoidianSettingsOutput {
  id: string
  tenantId: string
  fiscalId: string
  economicCode: string | null
  clientId: string
  environment: 'sandbox' | 'production'
  isInitialized: boolean
  autoSubmit: boolean
  lastSyncAt: Date | null
  totalSubmitted: number
  totalAccepted: number
  totalRejected: number
  hasClientSecret: boolean
  hasPrivateKey: boolean
  hasAccessToken: boolean
  tokenExpiresAt: Date | null
}

// ★ تابع نرمال‌سازی کلید (حذف کاراکترهای مشکل‌ساز)
export function normalizePrivateKey(privateKey: string): string {
  if (!privateKey) return ''
  return privateKey
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/\u200B/g, '')
    .replace(/\uFEFF/g, '')
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
}

// ─── Helper: دریافت تنظیمات به‌صورت decrypted ────────────────

async function getDecryptedCredentials(tenantId: string): Promise<MoidianCredentials | null> {
  try {
    const settings = await db.client.moidianSettings.findUnique({
      where: { tenantId },
    })

    if (!settings || !settings.isInitialized) return null

    return {
      clientId: settings.clientId || '',
      clientSecret: decrypt(settings.clientSecretEnc || ''),
      privateKey: decrypt(settings.privateKeyEnc || ''),
      fiscalId: settings.fiscalId || '',
      environment: (settings.environment as 'sandbox' | 'production') || 'sandbox',
    }
  } catch (err) {
    console.error('[Moidian] getDecryptedCredentials error:', err)
    return null
  }
}

// ─── Helper: دریافت access token با cache ────────────────────

const tokenCache = new Map<string, { token: MoidianToken; expiresAt: Date }>()

async function getValidAccessToken(tenantId: string): Promise<MoidianToken | null> {
  const cached = tokenCache.get(tenantId)
  if (cached && cached.expiresAt > new Date(Date.now() + 60_000)) {
    return cached.token
  }

  try {
    const settings = await db.client.moidianSettings.findUnique({ where: { tenantId } })
    if (settings?.accessTokenEnc && settings.tokenExpiresAt && settings.tokenExpiresAt > new Date(Date.now() + 60_000)) {
      const token: MoidianToken = {
        accessToken: decrypt(settings.accessTokenEnc),
        refreshToken: settings.refreshTokenEnc ? decrypt(settings.refreshTokenEnc) : null,
        expiresAt: settings.tokenExpiresAt,
        tokenType: 'Bearer',
      }
      tokenCache.set(tenantId, { token, expiresAt: settings.tokenExpiresAt })
      return token
    }
  } catch (err) {
    console.warn('[Moidian] Token from DB check failed:', err)
  }

  const creds = await getDecryptedCredentials(tenantId)
  if (!creds) return null

  const token = await getAccessToken(creds)
  if (!token) return null

  tokenCache.set(tenantId, { token, expiresAt: token.expiresAt })

  try {
    await db.client.moidianSettings.update({
      where: { tenantId },
      data: {
        accessTokenEnc: encrypt(token.accessToken),
        refreshTokenEnc: token.refreshToken ? encrypt(token.refreshToken) : null,
        tokenExpiresAt: token.expiresAt,
      },
    })
  } catch (err) {
    console.warn('[Moidian] Failed to persist token:', err)
  }

  return token
}

// ─── API: دریافت تنظیمات ─────────────────────────────────────

export async function getMoidianSettings(tenantId: string): Promise<MoidianSettingsOutput | null> {
  try {
    const settings = await db.client.moidianSettings.findUnique({
      where: { tenantId },
    })

    if (!settings) {
      return {
        id: '',
        tenantId,
        fiscalId: '',
        economicCode: null,
        clientId: '',
        environment: 'sandbox',
        isInitialized: false,
        autoSubmit: true,
        lastSyncAt: null,
        totalSubmitted: 0,
        totalAccepted: 0,
        totalRejected: 0,
        hasClientSecret: false,
        hasPrivateKey: false,
        hasAccessToken: false,
        tokenExpiresAt: null,
      }
    }

    return {
      id: settings.id,
      tenantId: settings.tenantId,
      fiscalId: settings.fiscalId || '',
      economicCode: settings.economicCode,
      clientId: settings.clientId || '',
      environment: (settings.environment as 'sandbox' | 'production') || 'sandbox',
      isInitialized: settings.isInitialized,
      autoSubmit: settings.autoSubmit,
      lastSyncAt: settings.lastSyncAt,
      totalSubmitted: settings.totalSubmitted,
      totalAccepted: settings.totalAccepted,
      totalRejected: settings.totalRejected,
      hasClientSecret: !!settings.clientSecretEnc,
      hasPrivateKey: !!settings.privateKeyEnc,
      hasAccessToken: !!settings.accessTokenEnc,
      tokenExpiresAt: settings.tokenExpiresAt,
    }
  } catch (err) {
    console.error('[Moidian] getMoidianSettings error:', err)
    return null
  }
}

// ─── API: ذخیره تنظیمات ──────────────────────────────────────

export async function saveMoidianSettings(
  tenantId: string,
  input: MoidianSettingsInput
): Promise<{ success: boolean; error?: string }> {
  try {
    // ★ v9.9: جلوگیری از ذخیره credentials با کلید fallback در production
    //   در محیط production اگر MOIDIAN_ENCRYPTION_KEY تنظیم نشده باشد،
    //   از ذخیره اطلاعات حساس مالیاتی جلوگیری می‌شود (امنیت).
    if (process.env.NODE_ENV === 'production' && isUsingFallbackKey()) {
      return {
        success: false,
        error: 'کلید رمزنگاری MOIDIAN_ENCRYPTION_KEY تنظیم نشده است. برای امنیت اطلاعات مالیاتی مشتریان، ابتدا یک کلید ۳۲ بایتی (۶۴ کاراکتر hex) در فایل .env تنظیم کنید. (تولید کلید: openssl rand -hex 32)',
      }
    }

    // ★ اعتبارسنجی اولیه
    if (!input.fiscalId || input.fiscalId.length !== 11) {
      return { success: false, error: 'شناسه مالیاتی باید ۱۱ رقم باشد' }
    }
    if (!input.clientId) {
      return { success: false, error: 'شناسه کلاینت (Client ID) الزامی است' }
    }
    if (!input.clientSecret) {
      return { success: false, error: 'رمز کلاینت (Client Secret) الزامی است' }
    }

    // ★★★ فقط طول را چک می‌کنیم — اعتبارسنجی واقعی هنگام استفاده از کلید انجام می‌شود
    if (!input.privateKey || input.privateKey.trim().length < 50) {
      return { success: false, error: 'کلید خصوصی خیلی کوتاه است' }
    }

    // ★ نرمال‌سازی کلید
    const normalizedPrivateKey = normalizePrivateKey(input.privateKey)

    // ★ رمزنگاری credentials
    const clientSecretEnc = encrypt(input.clientSecret)
    const privateKeyEnc = encrypt(normalizedPrivateKey)

    // ★ upsert
    await db.client.moidianSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        fiscalId: input.fiscalId,
        economicCode: input.economicCode || null,
        clientId: input.clientId,
        clientSecretEnc,
        privateKeyEnc,
        environment: input.environment,
        isInitialized: true,
        autoSubmit: input.autoSubmit ?? true,
      },
      update: {
        fiscalId: input.fiscalId,
        economicCode: input.economicCode || null,
        clientId: input.clientId,
        clientSecretEnc,
        privateKeyEnc,
        environment: input.environment,
        isInitialized: true,
        autoSubmit: input.autoSubmit ?? true,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        tokenExpiresAt: null,
      },
    })

    tokenCache.delete(tenantId)

    return { success: true }
  } catch (err: any) {
    console.error('[Moidian] saveMoidianSettings error:', err)
    return { success: false, error: err?.message || 'خطا در ذخیره تنظیمات' }
  }
}

// ─── API: حذف تنظیمات ────────────────────────────────────────

export async function deleteMoidianSettings(tenantId: string): Promise<{ success: boolean }> {
  try {
    await db.client.moidianSettings.deleteMany({ where: { tenantId } })
    tokenCache.delete(tenantId)
    return { success: true }
  } catch (err) {
    console.error('[Moidian] deleteMoidianSettings error:', err)
    return { success: false }
  }
}

// ─── API: تست اتصال ──────────────────────────────────────────

export async function testMoidianConnection(tenantId: string): Promise<{
  success: boolean
  message: string
  usingFallbackKey: boolean
}> {
  const creds = await getDecryptedCredentials(tenantId)
  if (!creds) {
    return {
      success: false,
      message: 'تنظیمات مودیان یافت نشد. ابتدا credentials را وارد کنید.',
      usingFallbackKey: isUsingFallbackKey(),
    }
  }

  const result = await testConnection(creds)
  return {
    ...result,
    usingFallbackKey: isUsingFallbackKey(),
  }
}

// ─── API: ارسال فاکتور به مودیان ─────────────────────────────

export async function submitInvoiceToMoidian(
  tenantId: string,
  invoiceId: string
): Promise<{
  success: boolean
  referenceId?: string
  status?: string
  error?: string
}> {
  try {
    const creds = await getDecryptedCredentials(tenantId)
    if (!creds) {
      return { success: false, error: 'اتصال مودیان پیکربندی نشده است' }
    }

    const token = await getValidAccessToken(tenantId)
    if (!token) {
      return { success: false, error: 'دریافت access token از مودیان ناموفق بود' }
    }

    const invoice = await db.client.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        items: true,
        customer: true,
      },
    })

    if (!invoice) {
      return { success: false, error: 'فاکتور یافت نشد' }
    }

    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      include: { StoreSettings: { take: 1 } },
    })

    if (!tenant) {
      return { success: false, error: 'اطلاعات فروشگاه یافت نشد' }
    }

    const storeSetting = tenant.StoreSettings?.[0]
    const seller = {
      taxid: creds.fiscalId,
      name: tenant.companyName || storeSetting?.storeName || 'فروشگاه',
      address: tenant.address || storeSetting?.address || undefined,
      phone: tenant.ownerMobile || storeSetting?.phone || undefined,
    }

    // ★ v9.9: تعیین داینامیک سال مالی از تاریخ فاکتور (به‌جای hardcoded '1403')
    //   سال شمسی فاکتور استخراج شده و به mapper ارسال می‌شود تا در سال‌های بعد
    //   (مثلاً ۱۴۰۴) فاکتورها با سال مالی صحیح ارسال شوند و رد نشوند.
    let fiscalYear = '1403'
    try {
      const invoiceDate = new Date(invoice.invoiceDate)
      if (!isNaN(invoiceDate.getTime())) {
        const jy = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric' }).format(invoiceDate)
        fiscalYear = jy.replace(/\D/g, '') || '1403'
      }
    } catch {
      console.warn('[Moidian] Could not derive fiscal year from invoice date, using default 1403')
    }

    const payload = mapInvoiceToMoidian(invoice as any, seller, fiscalYear)

    const validation = validateMoidianPayload(payload)
    if (!validation.valid) {
      const errorMsg = validation.errors.join('، ')
      await db.client.invoice.update({
        where: { id: invoiceId },
        data: {
          moidianStatus: 'FAILED',
          moidianError: errorMsg,
          moidianRetryCount: { increment: 1 },
        },
      })
      return { success: false, error: errorMsg }
    }

    const result = await submitInvoice(creds, token, payload, false)

    if (result.success && result.referenceId) {
      await db.client.invoice.update({
        where: { id: invoiceId },
        data: {
          moidianReferenceId: result.referenceId,
          moidianStatus: 'SUBMITTED',
          moidianSubmittedAt: new Date(),
          moidianError: null,
        },
      })

      await db.client.moidianSettings.update({
        where: { tenantId },
        data: {
          totalSubmitted: { increment: 1 },
          lastSyncAt: new Date(),
        },
      })

      return {
        success: true,
        referenceId: result.referenceId,
        status: 'SUBMITTED',
      }
    } else {
      const errorMsg = result.error?.message || 'خطای ناشناخته'
      await db.client.invoice.update({
        where: { id: invoiceId },
        data: {
          moidianStatus: 'FAILED',
          moidianError: errorMsg,
          moidianRetryCount: { increment: 1 },
        },
      })

      return { success: false, error: errorMsg }
    }
  } catch (err: any) {
    console.error('[Moidian] submitInvoiceToMoidian error:', err)
    return { success: false, error: err?.message || 'خطای داخلی' }
  }
}

// ─── API: استعلام وضعیت فاکتور ───────────────────────────────

export async function queryInvoiceStatusInMoidian(
  tenantId: string,
  referenceId: string
): Promise<{
  success: boolean
  status?: string
  error?: string
}> {
  try {
    const creds = await getDecryptedCredentials(tenantId)
    if (!creds) return { success: false, error: 'اتصال مودیان پیکربندی نشده است' }

    const token = await getValidAccessToken(tenantId)
    if (!token) return { success: false, error: 'دریافت access token ناموفق بود' }

    const result = await queryInvoiceStatus(creds, token, referenceId)

    if (result.success && result.status) {
      const updateData: any = {
        moidianStatus: result.status,
      }

      if (result.status === 'ACCEPTED') {
        updateData.moidianAcceptedAt = new Date()
        await db.client.moidianSettings.update({
          where: { tenantId },
          data: { totalAccepted: { increment: 1 } },
        })
      } else if (result.status === 'REJECTED') {
        updateData.moidianError = result.errorMessage || 'رد شد توسط مودیان'
        await db.client.moidianSettings.update({
          where: { tenantId },
          data: { totalRejected: { increment: 1 } },
        })
      }

      await db.client.invoice.updateMany({
        where: { tenantId, moidianReferenceId: referenceId },
        data: updateData,
      })

      return { success: true, status: result.status }
    } else {
      return { success: false, error: result.errorMessage || 'استعلام ناموفق بود' }
    }
  } catch (err: any) {
    console.error('[Moidian] queryInvoiceStatusInMoidian error:', err)
    return { success: false, error: err?.message || 'خطای داخلی' }
  }
}

// ─── API: لغو فاکتور ─────────────────────────────────────────

export async function cancelInvoiceInMoidian(
  tenantId: string,
  referenceId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const creds = await getDecryptedCredentials(tenantId)
    if (!creds) return { success: false, error: 'اتصال مودیان پیکربندی نشده است' }

    const token = await getValidAccessToken(tenantId)
    if (!token) return { success: false, error: 'دریافت access token ناموفق بود' }

    const result = await cancelInvoice(creds, token, referenceId, reason)

    if (result.success) {
      await db.client.invoice.updateMany({
        where: { tenantId, moidianReferenceId: referenceId },
        data: { moidianStatus: 'CANCELLED' },
      })
      return { success: true }
    } else {
      return { success: false, error: result.error?.message || 'لغو ناموفق بود' }
    }
  } catch (err: any) {
    console.error('[Moidian] cancelInvoiceInMoidian error:', err)
    return { success: false, error: err?.message || 'خطای داخلی' }
  }
}

// ─── API: آمار فاکتورهای مودیان ──────────────────────────────

export async function getMoidianStats(tenantId: string): Promise<{
  pending: number
  submitted: number
  accepted: number
  rejected: number
  failed: number
  cancelled: number
  total: number
}> {
  try {
    const where = { tenantId }
    const [
      pending,
      submitted,
      accepted,
      rejected,
      failed,
      cancelled,
      total,
    ] = await Promise.all([
      db.client.invoice.count({ where: { ...where, moidianStatus: 'PENDING' } }),
      db.client.invoice.count({ where: { ...where, moidianStatus: 'SUBMITTED' } }),
      db.client.invoice.count({ where: { ...where, moidianStatus: 'ACCEPTED' } }),
      db.client.invoice.count({ where: { ...where, moidianStatus: 'REJECTED' } }),
      db.client.invoice.count({ where: { ...where, moidianStatus: 'FAILED' } }),
      db.client.invoice.count({ where: { ...where, moidianStatus: 'CANCELLED' } }),
      db.client.invoice.count({ where: { ...where, moidianStatus: { not: null } } }),
    ])

    return { pending, submitted, accepted, rejected, failed, cancelled, total }
  } catch (err) {
    console.error('[Moidian] getMoidianStats error:', err)
    return { pending: 0, submitted: 0, accepted: 0, rejected: 0, failed: 0, cancelled: 0, total: 0 }
  }
}

// ─── API: ارسال خودکار فاکتور (hook از POST /api/invoices) ────

export async function autoSubmitInvoiceIfNeeded(
  tenantId: string,
  invoiceId: string
): Promise<void> {
  try {
    const settings = await db.client.moidianSettings.findUnique({
      where: { tenantId },
    })

    if (!settings || !settings.isInitialized || !settings.autoSubmit) {
      return
    }

    await submitInvoiceToMoidian(tenantId, invoiceId)
  } catch (err) {
    console.error('[Moidian] autoSubmitInvoiceIfNeeded error (non-blocking):', err)
  }
}

// ★ خروجی برای استفاده خارجی
export { maskSensitive, isUsingFallbackKey }
export type { MoidianCredentials, MoidianToken, MoidianInvoicePayload }