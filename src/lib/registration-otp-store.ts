// ============================================================================
// src/lib/registration-otp-store.ts — In-memory OTP store for registration
// ----------------------------------------------------------------------------
// ★★★ این یک store موقت در memory است برای نگهداری کدهای OTP ثبت‌نام
//   چون در زمان ثبت‌نام، tenant هنوز ایجاد نشده و نمی‌توان از OtpCode جدول استفاده کرد
//
// ★ در production بهتر است از Redis استفاده شود
// ★ در development، این کافی است
// ============================================================================

interface RegistrationOtpEntry {
  code: string
  codeHash: string
  mobile: string
  expiresAt: Date
  attemptCount: number
  verified: boolean
  createdAt: Date
}

// ★★★ v5.1.9: استفاده از globalThis برای حفظ store در Next.js dev mode
//   در dev mode با webpack/HMR، هر API route ممکن است در module context جداگانه اجرا شود
//   که باعث می‌شود Map معمولی بین درخواست‌ها به‌اشتراک گذاشته نشود
//   این الگوی استاندارد Prisma است:
//   https://www.prisma.io/docs/guides/nextjs#best-practice-for-instantiating-prismaclient-in-development
declare global {
  // eslint-disable-next-line no-var
  var __registrationOtpStore: Map<string, RegistrationOtpEntry> | undefined
}

// ★ استفاده از globalThis برای حفظ singleton
const otpStore =
  globalThis.__registrationOtpStore ??
  new Map<string, RegistrationOtpEntry>()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__registrationOtpStore = otpStore
}

// ★★★ v5.1.9: export برای debug در API routes
export { otpStore as debugStore }

// ★ Cleanup خودکار هر ۵ دقیقه (حذف کدهای منقضی)
const CLEANUP_INTERVAL = 5 * 60 * 1000
const OTP_TTL = 2 * 60 * 1000 // ۲ دقیقه
const MAX_ATTEMPTS = 5
const COOLDOWN_MS = 60 * 1000 // ۶۰ ثانیه بین درخواست‌ها

// ★★★ v5.1.9: استفاده از globalThis برای cleanup flag هم
//   تا چند interval در dev mode اجرا نشود
declare global {
  // eslint-disable-next-line no-var
  var __registrationOtpCleanupStarted: boolean | undefined
}

function startCleanup() {
  if (globalThis.__registrationOtpCleanupStarted) return
  globalThis.__registrationOtpCleanupStarted = true
  setInterval(() => {
    const now = new Date()
    for (const [key, entry] of otpStore.entries()) {
      if (entry.expiresAt < now) {
        otpStore.delete(key)
      }
    }
  }, CLEANUP_INTERVAL)
}

/**
 * ذخیره کد OTP برای یک شماره موبایل
 */
export function saveOtp(mobile: string, code: string, codeHash: string): boolean {
  startCleanup()

  const normalizedMobile = normalizeMobile(mobile)
  const existing = otpStore.get(normalizedMobile)

  // ★ Cooldown check
  if (existing && (Date.now() - existing.createdAt.getTime()) < COOLDOWN_MS) {
    return false // cooldown فعال است
  }

  otpStore.set(normalizedMobile, {
    code,
    codeHash,
    mobile: normalizedMobile,
    expiresAt: new Date(Date.now() + OTP_TTL),
    attemptCount: 0,
    verified: false,
    createdAt: new Date(),
  })

  return true
}

/**
 * بررسی کد OTP
 *   - اگر کد درست باشد، verified=true می‌کند و true برمی‌گرداند
 *   - اگر کد غلط باشد، attemptCount را افزایش می‌دهد و false برمی‌گرداند
 *   - اگر attemptCount از MAX_ATTEMPTS بیشتر شود، کد حذف می‌شود
 */
export function verifyOtp(mobile: string, code: string): boolean {
  const normalizedMobile = normalizeMobile(mobile)
  const entry = otpStore.get(normalizedMobile)

  if (!entry) return false
  if (entry.expiresAt < new Date()) {
    otpStore.delete(normalizedMobile)
    return false
  }
  if (entry.verified) return true // قبلاً تأیید شده
  if (entry.attemptCount >= MAX_ATTEMPTS) {
    otpStore.delete(normalizedMobile)
    return false
  }

  entry.attemptCount++

  if (entry.code === code) {
    entry.verified = true
    return true
  }

  return false
}

/**
 * بررسی اینکه آیا شماره موبایل تأیید شده است
 */
export function isVerified(mobile: string): boolean {
  const normalizedMobile = normalizeMobile(mobile)
  const entry = otpStore.get(normalizedMobile)
  return !!(entry && entry.verified)
}

/**
 * حذف کد OTP پس از استفاده
 */
export function clearOtp(mobile: string): void {
  const normalizedMobile = normalizeMobile(mobile)
  otpStore.delete(normalizedMobile)
}

/**
 * نرمال‌سازی شماره موبایل
 */
function normalizeMobile(mobile: string): string {
  let m = (mobile || '').trim()
  if (m.startsWith('+98')) m = '0' + m.substring(3)
  else if (m.startsWith('98') && m.length === 12) m = '0' + m.substring(2)
  else if (m.startsWith('0098')) m = '0' + m.substring(4)
  return m
}

export const REGISTRATION_OTP_CONFIG = {
  OTP_TTL,
  MAX_ATTEMPTS,
  COOLDOWN_MS,
}
