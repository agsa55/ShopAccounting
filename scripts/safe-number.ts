// ============================================================================
// src/lib/safe-number.ts — تبدیل امن اعداد مالی
// ShopAccounting — Centralized Safe Number Utility
// ============================================================================
// این فایل فقط یک بار ساخته می‌شود و همه APIها از آن import می‌کنند.
// اگر در آینده تغییری لازم باشد، فقط این یک فایل را تغییر می‌دهیم.
// ============================================================================

/**
 * تبدیل امن هر نوع ورودی به عدد صحیح (ریال)
 * جلوگیری از باگ ۴۹,۹۹۹,۹۹۹ به جای ۵۰,۰۰۰,۰۰۰
 *
 * @example
 * safeNumber(50000000)           // 50000000
 * safeNumber("50000000")         // 50000000
 * safeNumber("50,000,000")       // 50000000
 * safeNumber(decimalObject)      // 50000000 (Prisma Decimal)
 * safeNumber(null)               // 0
 */
export function safeNumber(value: any): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Math.round(value)
  if (typeof value === 'string') return Math.round(parseFloat(value.replace(/,/g, '')) || 0)
  if (typeof value === 'object' && typeof value.toString === 'function') {
    return Math.round(parseFloat(value.toString()) || 0)
  }
  return Math.round(Number(value) || 0)
}

/**
 * تبدیل امن به عدد با اعشار (برای درصدها و نرخ‌ها)
 */
export function safeDecimal(value: any, decimals: number = 2): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Number(value.toFixed(decimals))
  if (typeof value === 'string') return Number((parseFloat(value.replace(/,/g, '')) || 0).toFixed(decimals))
  if (typeof value === 'object' && typeof value.toString === 'function') {
    return Number((parseFloat(value.toString()) || 0).toFixed(decimals))
  }
  return Number((Number(value) || 0).toFixed(decimals))
}