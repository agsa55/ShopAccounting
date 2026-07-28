// ============================================================================
// src/lib/moidian/crypto.ts — رمزنگاری AES-256-GCM برای credentials حساس
// ============================================================================
// ★★★ این نسخه bug مربوط به base64 concatenation را رفع می‌کند.
//   در نسخه قبلی، cipher.update و cipher.final هر کدام base64 تولید می‌کردند
//   و concat کردن آن‌ها base64 خراب می‌ساخت. در این نسخه از Buffer خام
//   استفاده می‌کنیم و فقط در پایان به base64 تبدیل می‌کنیم.
// ============================================================================

import crypto from 'crypto'

// ★ کلید رمزنگاری — باید در .env با مقدار ۳۲ بایت (۶۴ hex chars) تنظیم شود
const ENCRYPTION_KEY_HEX = process.env.MOIDIAN_ENCRYPTION_KEY || ''
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX, 'hex')

// ★ اگر کلید تنظیم نشده، یک کلید توسعه می‌سازیم (فقط برای dev/test)
const FALLBACK_KEY = crypto.scryptSync('shopaccounting-dev-key', 'salt', 32)
const ACTIVE_KEY = ENCRYPTION_KEY.length === 32 ? ENCRYPTION_KEY : FALLBACK_KEY

if (process.env.NODE_ENV === 'production' && ENCRYPTION_KEY.length !== 32) {
  console.error('★★★ MOIDIAN_ENCRYPTION_KEY in production is not set or invalid (must be 32 bytes hex)')
  console.error('★★★ Using FALLBACK key is unsafe for production!')
}

/**
 * رمزنگاری متن با AES-256-GCM
 * @returns base64 encoded: IV (12 bytes) | AuthTag (16 bytes) | Ciphertext
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return ''

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', ACTIVE_KEY, iv)

  // ★★★ روش صحیح: از Buffer خام استفاده می‌کنیم، نه base64 string
  //   در نسخه قبلی، concat کردن دو base64 string باعث خراب شدن داده می‌شد
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  // ★ ترکیب: iv | authTag | ciphertext (همه به‌صورت base64 در انتها)
  const combined = Buffer.concat([iv, authTag, encrypted])
  return combined.toString('base64')
}

/**
 * رمزگشایی متن با AES-256-GCM
 */
export function decrypt(encryptedBase64: string): string {
  if (!encryptedBase64) return ''

  try {
    const combined = Buffer.from(encryptedBase64, 'base64')

    // ★ جدا کردن: IV (12) | AuthTag (16) | Ciphertext
    const iv = combined.subarray(0, 12)
    const authTag = combined.subarray(12, 28)
    const ciphertext = combined.subarray(28)

    const decipher = crypto.createDecipheriv('aes-256-gcm', ACTIVE_KEY, iv)
    decipher.setAuthTag(authTag)

    // ★★★ روش صحیح: از Buffer خام استفاده می‌کنیم
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])

    return decrypted.toString('utf8')
  } catch (err) {
    console.error('[Moidian Crypto] Decrypt failed:', err)
    return ''
  }
}

/**
 * بررسی اینکه آیا کلید رمزنگاری production تنظیم شده یا از fallback استفاده می‌کنیم
 */
export function isUsingFallbackKey(): boolean {
  return ENCRYPTION_KEY.length !== 32
}

/**
 * ماسک کردن اطلاعات حساس برای لاگ (نمایش فقط ۴ کاراکتر اول و آخر)
 */
export function maskSensitive(value: string): string {
  if (!value || value.length < 12) return '***'
  return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
}
