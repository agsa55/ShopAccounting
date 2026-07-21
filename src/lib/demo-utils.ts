// ============================================================================
// src/lib/demo-utils.ts — Demo Trial Utilities (v9.1 ★★★)
// ShopAccounting — 3-Day Demo Trial System
// ----------------------------------------------------------------------------
// این فایل شامل توابع کمکی برای سیستم تست دمو ۳ روزه است:
//   - generateDemoSubdomain: تولید زیردامنه یکتا برای دمو
//   - generateDemoUsername: تولید نام کاربری برای دمو
//   - generateDemoPassword: تولید رمز عبور تصادفی برای دمو
//   - generateOtpCode: تولید کد ۶ رقمی OTP
//   - isDemoTenant: تشخیص tenant دمو
//   - isDemoExpired: آیا دمو منقضی شده؟
//   - cleanupDemoTenant: حذف کامل tenant دمو و تمام داده‌های مرتبط
//   - getDemoDaysRemaining: محاسبه روزهای باقی‌مانده دمو
//
// ★★★ نکات مهم:
//   - tenant دمو با status='demo' مشخص می‌شود
//   - tenant در حال ثبت دمو با status='demo_pending' مشخص می‌شود
//   - مدت دمو: ۳ روز (DEMO_DURATION_DAYS = 3)
//   - مدت اعتبار OTP دمو: ۱۰ دقیقه (DEMO_OTP_EXPIRY_MINUTES = 10)
//   - مدت انتظار تکمیل دمو: ۳۰ دقیقه (DEMO_PENDING_TIMEOUT_MINUTES = 30)
//   - زیردامنه دمو با پیشوند demo- شروع می‌شود
// ============================================================================

import { db } from '@/lib/db'

// ─── Constants ──────────────────────────────────────────────────────────

/** مدت تست دمو به روز — ۳ روز */
export const DEMO_DURATION_DAYS = 3

/** مدت اعتبار کد OTP دمو به دقیقه — ۱۰ دقیقه */
export const DEMO_OTP_EXPIRY_MINUTES = 10

/** مدت انتظار تکمیل ثبت‌نام دمو به دقیقه — ۳۰ دقیقه */
export const DEMO_PENDING_TIMEOUT_MINUTES = 30

/** پیشوند زیردامنه دمو */
export const DEMO_SUBDOMAIN_PREFIX = 'demo-'

/** پیشوند نام کاربری دمو */
export const DEMO_USERNAME_PREFIX = 'demo_'

// ─── Types ──────────────────────────────────────────────────────────────

export interface DemoTenantInfo {
  isDemo: boolean
  isExpired: boolean
  daysRemaining: number  // -1 یعنی نامحدود / یا منقضی شده
  hoursRemaining: number
  expiresAt: Date | null
  startedAt: Date | null
}

// ─── Generators ─────────────────────────────────────────────────────────

/**
 * تولید زیردامنه یکتا برای دمو
 * فرمت: demo-{mobile-last-8-digits}-{random-3-chars}
 * مثال: demo-12345678-abc
 */
export function generateDemoSubdomain(mobile: string): string {
  // ★ حذف کاراکترهای غیر عددی
  const digits = mobile.replace(/\D/g, '')
  // ★ ۸ رقم آخر موبایل
  const lastDigits = digits.slice(-8)
  // ★ ۳ کاراکتر تصادفی
  const random = Math.random().toString(36).substring(2, 5).toLowerCase()
  return `${DEMO_SUBDOMAIN_PREFIX}${lastDigits}-${random}`
}

/**
 * تولید نام کاربری برای دمو
 * فرمت: demo_{mobile-last-4-digits}_{random-4-chars}
 * مثال: demo_5678_abcd
 */
export function generateDemoUsername(mobile: string): string {
  const digits = mobile.replace(/\D/g, '')
  const lastDigits = digits.slice(-4)
  const random = Math.random().toString(36).substring(2, 6).toLowerCase()
  return `${DEMO_USERNAME_PREFIX}${lastDigits}_${random}`
}

/**
 * تولید رمز عبور تصادفی برای دمو
 * ۸ کاراکتر شامل حروف و اعداد
 */
export function generateDemoPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let password = ''
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

/**
 * تولید کد ۶ رقمی OTP
 */
export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/**
 * تولید نام فروشگاه برای دمو
 * فرمت: فروشگاه دمو - {mobile}
 */
export function generateDemoCompanyName(mobile: string): string {
  return `فروشگاه دمو - ${mobile}`
}

// ─── Detection ──────────────────────────────────────────────────────────

/**
 * تشخیص اینکه آیا tenant یک دمو فعال است یا خیر
 */
export function isDemoTenant(tenant: { status?: string } | null | undefined): boolean {
  if (!tenant) return false
  return tenant.status === 'demo' || tenant.status === 'demo_pending'
}

/**
 * آیا tenant دمو منقضی شده است؟
 */
export function isDemoExpired(tenant: { status?: string; expiresAt?: Date | string | null } | null | undefined): boolean {
  if (!tenant) return false
  if (!isDemoTenant(tenant)) return false
  if (!tenant.expiresAt) return false
  const expiresAt = typeof tenant.expiresAt === 'string' ? new Date(tenant.expiresAt) : tenant.expiresAt
  return expiresAt < new Date()
}

/**
 * محاسبه اطلاعات دمو (روزهای باقی‌مانده و ...)
 */
export function getDemoInfo(tenant: { status?: string; expiresAt?: Date | string | null; soldAt?: Date | string | null } | null | undefined): DemoTenantInfo {
  if (!tenant || !isDemoTenant(tenant)) {
    return {
      isDemo: false,
      isExpired: false,
      daysRemaining: 0,
      hoursRemaining: 0,
      expiresAt: null,
      startedAt: null,
    }
  }

  const now = new Date()
  const expiresAt = tenant.expiresAt
    ? (typeof tenant.expiresAt === 'string' ? new Date(tenant.expiresAt) : tenant.expiresAt)
    : null
  const startedAt = tenant.soldAt
    ? (typeof tenant.soldAt === 'string' ? new Date(tenant.soldAt) : tenant.soldAt)
    : null

  if (!expiresAt) {
    return {
      isDemo: true,
      isExpired: false,
      daysRemaining: DEMO_DURATION_DAYS,
      hoursRemaining: DEMO_DURATION_DAYS * 24,
      expiresAt: null,
      startedAt,
    }
  }

  const isExpired = expiresAt < now
  const diffMs = expiresAt.getTime() - now.getTime()
  const diffHours = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)))
  const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))

  return {
    isDemo: true,
    isExpired,
    daysRemaining: isExpired ? 0 : diffDays,
    hoursRemaining: isExpired ? 0 : diffHours,
    expiresAt,
    startedAt,
  }
}

// ─── Cleanup ────────────────────────────────────────────────────────────

/**
 * حذف کامل tenant دمو و تمام داده‌های مرتبط
 *
 * این تابع تمام جداول مرتبط با tenant را پاک می‌کند:
 *   - SubscriptionPayments, Subscriptions
 *   - UserLookups, StoreUser
 *   - FiscalYear, AuditLogs
 *   - OtpCode
 *   - خود Tenant
 *
 * ★★★ این عملیات غیرقابل بازگشت است!
 */
export async function cleanupDemoTenant(tenantId: string): Promise<{ success: boolean; deletedRecords: number; error?: string }> {
  console.log('[DemoUtils] cleanupDemoTenant start — tenantId:', tenantId)
  let deletedRecords = 0

  try {
    // ★ ۱. بررسی اینکه Tenant واقعاً دمو است (یا pending) — نباید tenant فعال را حذف کنیم
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true, subDomain: true, companyName: true, expiresAt: true },
    })

    if (!tenant) {
      console.warn('[DemoUtils] Tenant not found:', tenantId)
      return { success: false, deletedRecords: 0, error: 'TENANT_NOT_FOUND' }
    }

    // ★ فقط tenant های دمو یا demo_pending را حذف کن
    if (tenant.status !== 'demo' && tenant.status !== 'demo_pending') {
      console.warn('[DemoUtils] Tenant is not a demo, refusing to delete:', tenantId, 'status:', tenant.status)
      return { success: false, deletedRecords: 0, error: 'NOT_A_DEMO_TENANT' }
    }

    console.log('[DemoUtils] Cleaning up demo tenant:', {
      id: tenant.id,
      subDomain: tenant.subDomain,
      companyName: tenant.companyName,
      status: tenant.status,
    })

    // ★ ۲. حذف به ترتیب (به دلیل FK constraints)
    //   تمام جداول مرتبط با tenantId

    const tablesToDelete = [
      { name: 'subscriptionPayments', model: 'subscriptionPayments' },
      { name: 'subscriptions', model: 'subscriptions' },
      { name: 'userLookups', model: 'userLookups' },
      { name: 'storeUser', model: 'storeUser' },
      { name: 'fiscalYear', model: 'fiscalYear' },
      { name: 'auditLogs', model: 'auditLogs' },
      { name: 'otpCode', model: 'otpCode' },
    ]

    for (const { name, model } of tablesToDelete) {
      try {
        const r = await (db.client as any)[model].deleteMany({ where: { tenantId } })
        deletedRecords += r.count || 0
        if (r.count > 0) {
          console.log(`[DemoUtils] ✓ Deleted ${r.count} records from ${name}`)
        }
      } catch (err: any) {
        console.warn(`[DemoUtils] ${name} delete error:`, err?.message)
      }
    }

    // ★ ۳. حذف خود Tenant
    try {
      await db.client.tenant.delete({ where: { id: tenantId } })
      deletedRecords += 1
      console.log('[DemoUtils] ✓ Tenant deleted:', tenantId)
    } catch (err: any) {
      console.error('[DemoUtils] Tenant delete error:', err?.message)
      return { success: false, deletedRecords, error: err?.message }
    }

    console.log('[DemoUtils] ✅ Demo tenant cleaned up successfully:', {
      tenantId,
      subDomain: tenant.subDomain,
      deletedRecords,
    })

    return { success: true, deletedRecords }
  } catch (error: any) {
    console.error('[DemoUtils] cleanupDemoTenant error:', error)
    return { success: false, deletedRecords, error: error?.message }
  }
}

/**
 * پیدا کردن و حذف تمام tenant های دمو منقضی شده
 *
 * این تابع باید توسط cron job به‌صورت دوره‌ای صدا زده شود.
 * همچنین tenant های demo_pending که بیش از ۳۰ دقیقه طول کشیده‌اند را هم حذف می‌کند.
 */
export async function cleanupExpiredDemoTenants(): Promise<{ success: boolean; deletedCount: number; details: Array<{ tenantId: string; subDomain: string; reason: string }> }> {
  console.log('[DemoUtils] cleanupExpiredDemoTenants start')
  const now = new Date()
  const pendingTimeout = new Date(now.getTime() - DEMO_PENDING_TIMEOUT_MINUTES * 60 * 1000)
  const details: Array<{ tenantId: string; subDomain: string; reason: string }> = []

  try {
    // ★ ۱. پیدا کردن tenant های demo منقضی شده
    const expiredDemos = await db.client.tenant.findMany({
      where: {
        status: 'demo',
        expiresAt: { lt: now },
      },
      select: { id: true, subDomain: true, companyName: true, expiresAt: true },
    })

    console.log(`[DemoUtils] Found ${expiredDemos.length} expired demo tenants`)

    // ★ ۲. پیدا کردن tenant های demo_pending که بیش از ۳۰ دقیقه طول کشیده‌اند
    const expiredPending = await db.client.tenant.findMany({
      where: {
        status: 'demo_pending',
        createdAt: { lt: pendingTimeout },
      },
      select: { id: true, subDomain: true, companyName: true, createdAt: true },
    })

    console.log(`[DemoUtils] Found ${expiredPending.length} expired demo_pending tenants`)

    // ★ ۳. حذف تک‌تک
    let deletedCount = 0

    for (const t of expiredDemos) {
      const result = await cleanupDemoTenant(t.id)
      if (result.success) {
        deletedCount++
        details.push({ tenantId: t.id, subDomain: t.subDomain, reason: 'demo_expired' })
      } else {
        console.error(`[DemoUtils] Failed to delete expired demo ${t.id}:`, result.error)
      }
    }

    for (const t of expiredPending) {
      const result = await cleanupDemoTenant(t.id)
      if (result.success) {
        deletedCount++
        details.push({ tenantId: t.id, subDomain: t.subDomain, reason: 'demo_pending_timeout' })
      } else {
        console.error(`[DemoUtils] Failed to delete expired demo_pending ${t.id}:`, result.error)
      }
    }

    console.log(`[DemoUtils] ✅ Cleaned up ${deletedCount} demo tenants`)

    return { success: true, deletedCount, details }
  } catch (error: any) {
    console.error('[DemoUtils] cleanupExpiredDemoTenants error:', error)
    return { success: false, deletedCount: 0, details }
  }
}

// ─── SMS Helper ─────────────────────────────────────────────────────────

/**
 * ارسال کد OTP دمو از طریق IPPanel
 *
 * ★★★ v9.1.4: بازنویسی کامل بر اساس فایل اصلی src/lib/sms/ippanel.ts
 *   - استفاده از ساختار صحیح request body (Originator, Recipient, Values)
 *   - استفاده از AccessKey scheme
 *   - retry در صورت خطای 502/503/504
 *   - timeout ۱۵ ثانیه
 *
 * ★ در صورت تنظیم نشدن IPPANEL_API_KEY، کد در کنسول چاپ می‌شود (mock mode)
 */
export async function sendDemoOtpSms(mobile: string, code: string): Promise<{ success: boolean; mockMode: boolean; devCode?: string; error?: string }> {
  const apiKey = process.env.IPPANEL_API_KEY
  const fromNumber = process.env.IPPANEL_FROM_NUMBER || '3000505'
  const patternCode = process.env.IPPANEL_OTP_PATTERN_CODE
  // ★★★ v9.1.4: استفاده از IPPANEL_OTP_PARAM_NAME (نه PATTERN_VAR)
  const paramName = process.env.IPPANEL_OTP_PARAM_NAME || process.env.IPPANEL_OTP_PATTERN_VAR || 'pass'

  // ★★★ v9.1.4: متغیر کنترل صریح mock mode (اختیاری)
  const forceMockMode = process.env.DEMO_MOCK_SMS === 'true'

  // ★ محیط development — بدون ارسال واقعی SMS
  if (!apiKey || apiKey === 'test' || apiKey === '...' || forceMockMode) {
    const reason = !apiKey ? 'IPPANEL_API_KEY not set'
      : apiKey === 'test' ? 'IPPANEL_API_KEY = test'
      : apiKey === '...' ? 'IPPANEL_API_KEY = placeholder'
      : 'DEMO_MOCK_SMS=true'
    console.log(`\n🔐 [DEMO OTP] Mock mode (${reason})`)
    console.log(`🔐 [DEMO OTP] Mobile: ${mobile} | Code: ${code}\n`)
    return { success: true, mockMode: true, devCode: code }
  }

  // ★★★ v9.1.4: بررسی pattern_code
  if (!patternCode) {
    console.error('[DemoUtils] IPPANEL_OTP_PATTERN_CODE not set in env')
    console.log(`\n🔐 [DEMO OTP] Fallback to mock (no pattern code) | Mobile: ${mobile} | Code: ${code}\n`)
    return { success: true, mockMode: true, devCode: code }
  }

  // ★★★ v9.1.4: نرمال‌سازی شماره موبایل (مطابق فایل اصلی)
  const normalizedMobile = normalizeIranianMobileSafe(mobile)
  if (!normalizedMobile) {
    console.error('[DemoUtils] Invalid mobile number:', mobile)
    return { success: false, mockMode: false, error: 'INVALID_MOBILE' }
  }

  console.log('[DemoUtils] Sending OTP via IPPanel:', {
    mobile: normalizedMobile,
    fromNumber: fromNumber,
    patternCode: patternCode,
    paramName: paramName,
  })

  try {
    // ★★★ v9.1.4: ساخت request body مطابق فایل اصلی ippanel.ts
    //   - Originator (با O بزرگ)
    //   - Recipient (تکی، نه آرایه)
    //   - Values (نه input)
    const requestBody = {
      Originator: fromNumber,
      pattern_code: patternCode,
      Recipient: normalizedMobile,
      Values: {
        [paramName]: code,
      },
    }

    console.log('[DemoUtils] Request Body:', JSON.stringify(requestBody))

    // ★★★ v9.1.4: fetch با timeout ۱۵ ثانیه (مطابق فایل اصلی)
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

    // ★★★ v9.1.4: ارسال با retry (مطابق فایل اصلی)
    let response: Response | null = null
    let lastError = ''

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[DemoUtils] Attempt ${attempt} — sending to ${ENDPOINT} ...`)
        const res = await fetchWithTimeout(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // ★★★ v9.1.4: AccessKey scheme (مطابق فایل اصلی)
            'Authorization': `AccessKey ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        })

        // ★ retry در خطاهای 502/503/504
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          console.warn(`[DemoUtils] ⚠️ Got ${res.status}, attempt ${attempt}`)
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
        console.error(`[DemoUtils] Network error attempt ${attempt}:`, err.message)
        lastError = err.message
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 2000))
        }
      }
    }

    // ★ اگر همه تلاش‌ها fail شدند
    if (!response) {
      console.error('[DemoUtils] ❌ All attempts failed:', lastError)
      console.log(`\n🔐 [DEMO OTP] Fallback to mock (server unavailable) | Mobile: ${mobile} | Code: ${code}\n`)
      return { success: true, mockMode: true, devCode: code, error: lastError }
    }

    // ★ خواندن پاسخ
    const responseText = await response.text()
    console.log('[DemoUtils] Response status:', response.status)
    console.log('[DemoUtils] Response body:', responseText)

    let data: any = null
    try {
      data = JSON.parse(responseText)
    } catch {
      console.error('[DemoUtils] JSON parse error, raw response:', responseText.substring(0, 500))
      console.log(`\n🔐 [DEMO OTP] Fallback to mock (invalid response) | Mobile: ${mobile} | Code: ${code}\n`)
      return { success: true, mockMode: true, devCode: code, error: 'INVALID_RESPONSE' }
    }

    // ★★★ v9.1.4: بررسی موفقیت (مطابق فایل اصلی)
    //   IPPanel برمی‌گرداند: { status: 'OK', data: { bulk_id: ... } }
    if (response.ok && (data.status === 'OK' || data.status === 'ok' || data.code === 'OK')) {
      console.log(`[DemoUtils] ✓ OTP sent to ${normalizedMobile}, bulk_id: ${data.data?.bulk_id}`)
      return { success: true, mockMode: false }
    }

    // ★ خطا
    console.error('[DemoUtils] IPPanel API error:', JSON.stringify(data))
    let errorMessage = 'خطای IPPanel'
    if (data.message) errorMessage = data.message
    else if (data.error) errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)

    // ★★★ fallback به mock mode تا کاربر بتواند ادامه دهد
    console.log(`\n🔐 [DEMO OTP] Fallback to mock (API error: ${errorMessage}) | Mobile: ${mobile} | Code: ${code}\n`)
    return { success: true, mockMode: true, devCode: code, error: errorMessage }
  } catch (err: any) {
    console.error('[DemoUtils] Unexpected error:', err?.message)
    // ★★★ fallback به mock mode
    console.log(`\n🔐 [DEMO OTP] Fallback to mock (unexpected error) | Mobile: ${mobile} | Code: ${code}\n`)
    return { success: true, mockMode: true, devCode: code, error: err?.message }
  }
}

// ★★★ v9.1.4: تابع کمکی نرمال‌سازی موبایل (مطابق فایل اصلی ippanel.ts)
function normalizeIranianMobileSafe(mobile: string): string | null {
  try {
    let m = (mobile || '').trim().replace(/\s/g, '')
    if (m.startsWith('+98')) return '0' + m.slice(3)
    if (m.startsWith('0098')) return '0' + m.slice(4)
    if (m.startsWith('98')) return '0' + m.slice(2)
    if (m.startsWith('0')) return m
    return '0' + m
  } catch {
    return null
  }
}

// ─── Validation ─────────────────────────────────────────────────────────

/**
 * اعتبارسنجی شماره موبایل ایرانی
 * فرمت‌های معتبر: 09123456789, +989123456789, 989123456789
 */
export function validateIranianMobile(mobile: string): { valid: boolean; normalized?: string; error?: string } {
  if (!mobile) {
    return { valid: false, error: 'شماره موبایل الزامی است' }
  }

  // ★ حذف فاصله و کاراکترهای اضافی
  const cleaned = mobile.replace(/[\s\-()]/g, '')

  // ★ الگوهای معتبر
  const patterns = [
    /^09\d{9}$/,        // 09123456789
    /^\+989\d{9}$/,     // +989123456789
    /^989\d{9}$/,       // 989123456789
    /^00989\d{9}$/,     // 00989123456789
  ]

  for (const pattern of patterns) {
    if (pattern.test(cleaned)) {
      // ★ نرمال‌سازی به فرمت 09123456789
      let normalized = cleaned.replace(/^(\+98|98|0098)/, '0')
      return { valid: true, normalized }
    }
  }

  return { valid: false, error: 'فرمت شماره موبایل نامعتبر است (مثال: 09123456789)' }
}
