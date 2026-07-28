// ============================================================================
// src/lib/db-encrypt.ts — STUB (v3.0)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.0 — این فایل به یک stub تبدیل شده:
//   ★ در معماری جدید، دیگه connection string رمزنگاری نمی‌شه
//   ★ همه از همون DATABASE_URL استفاده می‌کنن
//   ★ این stub برای backward compat نگه داشته شده
// ============================================================================

/**
 * ★★★ v3.0: stub — همون ورودی رو برمی‌گردانه
 */
export function encryptConnectionString(plain: string): string {
  return plain
}

/**
 * ★★★ v3.0: stub — همون ورودی رو برمی‌گردانه
 */
export function decryptConnectionString(encrypted: string): string {
  return encrypted
}

/**
 * ★★★ v3.0: stub — نام دیتابیس مشترک رو برمی‌گردانه
 */
export function buildTenantDbName(_tenantId: string): string {
  return 'ShopAccounting'
}

/**
 * ★★★ v3.0: stub — از DATABASE_URL استفاده می‌کنه
 */
export function buildConnectionString(_options: { dbName?: string }): string {
  return process.env.DATABASE_URL || ''
}

/**
 * ★★★ v3.0: stub
 */
export function diagnoseEncryption(_encrypted: string): {
  likelyFormat: string
  partCount: number
  keyLength: number
} {
  return {
    likelyFormat: 'stub',
    partCount: 0,
    keyLength: 0,
  }
}

export default {
  encryptConnectionString,
  decryptConnectionString,
  buildTenantDbName,
  buildConnectionString,
  diagnoseEncryption,
}
