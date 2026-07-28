// ============================================================================
// src/lib/barcode-generator.ts — Barcode & Product Code Generator (v8.9)
// ============================================================================

/**
 * ★ تولید کد محصول اتوماتیک
 * @param lastProductCount - تعداد محصولات موجود
 * @returns کد محصول جدید (مثلاً PRD-000001)
 */
export function generateProductCode(lastProductCount: number): string {
  const nextNumber = (lastProductCount + 1).toString().padStart(6, '0')
  return `PRD-${nextNumber}`
}

/**
 * ★ محاسبه Check Digit برای EAN-13
 * @param barcode12 - 12 رقم اول
 * @returns رقم کنترلی (1 رقم)
 */
export function calculateEAN13CheckDigit(barcode12: string): string {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(barcode12[i])
    const multiplier = i % 2 === 0 ? 1 : 3
    sum += digit * multiplier
  }
  const checkDigit = (10 - (sum % 10)) % 10
  return checkDigit.toString()
}

/**
 * ★ تولید EAN-13 Barcode یکتا بر اساس timestamp + random
 * @returns رشته EAN-13 معتبر (13 رقم)
 */
export function generateEAN13Barcode(): string {
  // پیشوند شرکت ایرانی (6 رقم)
  const companyPrefix = '629123'

  // 6 رقم از timestamp + random برای یکتایی
  const timestamp = Date.now().toString()
  const timePart = timestamp.slice(-4) // 4 رقم آخر timestamp
  const randomPart = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, '0') // 2 رقم تصادفی

  const productPart = timePart + randomPart // 6 رقم

  // 12 رقم بدون check digit
  const barcode12 = companyPrefix + productPart

  // محاسبه check digit
  const checkDigit = calculateEAN13CheckDigit(barcode12)

  return barcode12 + checkDigit
}

/**
 * ★ اعتبارسنجی بارکد EAN-13
 * @param barcode - رشته بارکد
 * @returns آیا معتبر است
 */
export function validateEAN13(barcode: string): boolean {
  if (!barcode || barcode.length !== 13) return false

  const digits = barcode.split('').map(Number)
  if (digits.some(isNaN)) return false

  let sum = 0
  for (let i = 0; i < 12; i++) {
    const multiplier = i % 2 === 0 ? 1 : 3
    sum += digits[i] * multiplier
  }

  const checkDigit = (10 - (sum % 10)) % 10
  return checkDigit === digits[12]
}

/**
 * ★ تولید بارکد تصادفی ساده (بدون وابستگی به productId)
 * @returns EAN-13 معتبر
 */
export function generateRandomBarcode(): string {
  return generateEAN13Barcode()
}