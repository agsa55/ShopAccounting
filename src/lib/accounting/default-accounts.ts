// ============================================================================
// src/lib/accounting/default-accounts.ts — Default Chart of Accounts (v8.2 ★★★)
// ----------------------------------------------------------------------------
// ★ این ماژول چارت حساب‌های پیش‌فرض را برای هر tenant اطمینان می‌دهد.
// ★ شامل دو حساب هزینه‌ی جدید برای کارمزدهای تسهیم فردایی:
//     • 5105 — هزینه کارمزد درگاه پرداخت آنلاین (زرین‌پال)
//     • 5106 — هزینه کارمزد پلتفرم ShopAccounting
// ★ این تابع idempotent است — اجرای چندباره آن هیچ اشکالی ندارد.
// ============================================================================

import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  تعریف حساب‌های پیش‌فرض سیستم
// ═══════════════════════════════════════════════════════════════

export interface DefaultAccount {
  code: string
  name: string
  type: string          // cash | bank | receivable | inventory | revenue | tax | cogs | expense | commission
  level: number
  isSystemAccount: boolean
}

export const DEFAULT_ACCOUNTS: DefaultAccount[] = [
  // ─── دارایی‌های جاری ─────────────────────────────────────────
  { code: '1100', name: 'صندوق', type: 'cash', level: 2, isSystemAccount: true },
  { code: '1110', name: 'بانک', type: 'bank', level: 2, isSystemAccount: true },
  { code: '1200', name: 'حساب‌های دریافتنی (مشتریان)', type: 'receivable', level: 2, isSystemAccount: true },
  { code: '1300', name: 'موجودی کالا', type: 'inventory', level: 2, isSystemAccount: true },

  // ─── بدهی‌های جاری ──────────────────────────────────────────
  { code: '2100', name: 'حساب‌های پرداختنی (تامین‌کنندگان)', type: 'payable', level: 2, isSystemAccount: true },

  // ─── درآمدها ────────────────────────────────────────────────
  { code: '4100', name: 'درآمد فروش', type: 'revenue', level: 2, isSystemAccount: true },

  // ─── مالیات ────────────────────────────────────────────────
  { code: '1900', name: 'مالیات پرداختنی', type: 'tax', level: 2, isSystemAccount: true },
  { code: '1950', name: 'مالیات بر ارزش افزوده (فروش)', type: 'tax', level: 3, isSystemAccount: true },

  // ─── بهای تمام شده ──────────────────────────────────────────
  { code: '5100', name: 'بهای تمام شده کالای فروش رفته', type: 'cogs', level: 2, isSystemAccount: true },

  // ─── هزینه‌های عملیاتی ─────────────────────────────────────
  // ★★★ v8.2: حساب‌های جدید برای کارمزدهای تسهیم فردایی ★★★
  { code: '5105', name: 'هزینه کارمزد درگاه پرداخت آنلاین (زرین‌پال)', type: 'expense', level: 2, isSystemAccount: true },
  { code: '5106', name: 'هزینه کارمزد پلتفرم ShopAccounting', type: 'expense', level: 2, isSystemAccount: true },
]

// ═══════════════════════════════════════════════════════════════
//  کدهای حساب‌های استاندارد (برای استفاده در سایر ماژول‌ها)
// ═══════════════════════════════════════════════════════════════

export const ACCOUNT_CODES = {
  CASH: '1100',           // صندوق
  BANK: '1110',           // بانک
  RECEIVABLE: '1200',     // حساب‌های دریافتنی
  INVENTORY: '1300',      // موجودی کالا
  PAYABLE: '2100',        // حساب‌های پرداختنی
  SALES_REVENUE: '4100',  // درآمد فروش
  TAX_PAYABLE: '1900',    // مالیات پرداختنی
  TAX_VAT: '1950',        // مالیات بر ارزش افزوده
  COGS: '5100',           // بهای تمام شده
  GATEWAY_FEE: '5105',    // ★★★ هزینه کارمزد درگاه پرداخت آنلاین
  PLATFORM_FEE: '5106',   // ★★★ هزینه کارمزد پلتفرم
} as const

// ═══════════════════════════════════════════════════════════════
//  ensureDefaultAccounts — اطمینان از وجود حساب‌های پیش‌فرض
// ═══════════════════════════════════════════════════════════════

export async function ensureDefaultAccounts(tenantId: string): Promise<{
  success: boolean
  created: number
  existing: number
  accountIds: Record<string, string>
}> {
  let created = 0
  let existing = 0
  const accountIds: Record<string, string> = {}

  try {
    // ★ دریافت تمام حساب‌های موجود برای این tenant
    const existingAccounts = await db.client.account.findMany({
      where: { tenantId },
      select: { id: true, code: true, name: true, type: true },
    })

    const existingByCode = new Map(existingAccounts.map(a => [a.code, a]))

    // ★ برای هر حساب پیش‌فرض: اگر موجود نیست، ایجاد کن
    for (const def of DEFAULT_ACCOUNTS) {
      const existing = existingByCode.get(def.code)
      if (existing) {
        accountIds[def.code] = existing.id
        // ★ اگر حساب موجود است ولی isSystemAccount ست نیست، آن را به‌روزرسانی کن
        if (def.isSystemAccount) {
          try {
            const fieldsRaw = (db.client.account as any).fields as unknown
            const fields = (fieldsRaw || {}) as Record<string, unknown>
            if ('isSystemAccount' in fields) {
              await db.client.account.update({
                where: { id: existing.id },
                data: { isSystemAccount: true } as any,
              })
            }
          } catch {
            // ★ فیلد isSystemAccount ممکن است هنوز در schema نباشد — ignore
          }
        }
      } else {
        try {
          const newAcc = await db.client.account.create({
            data: {
              code: def.code,
              name: def.name,
              type: def.type,
              level: def.level,
              isActive: true,
              tenantId,
              ...(def.isSystemAccount ? { isSystemAccount: true } as any : {}),
            },
          })
          accountIds[def.code] = newAcc.id
          created++
          console.log(`[DefaultAccounts] Created: ${def.code} - ${def.name}`)
        } catch (err: any) {
          console.warn(`[DefaultAccounts] Failed to create ${def.code} ${def.name}:`, err?.message)
        }
      }
    }

    existing = existingAccounts.length
    return { success: true, created, existing, accountIds }
  } catch (error: any) {
    console.error('[DefaultAccounts] ensureDefaultAccounts failed:', error?.message)
    return { success: false, created, existing, accountIds }
  }
}

// ═══════════════════════════════════════════════════════════════
//  getAccountByCode — دریافت حساب با کد (با fallback هوشمند)
// ═══════════════════════════════════════════════════════════════

export async function getAccountByCode(
  tenantId: string,
  code: string
): Promise<{ id: string; name: string; code: string } | null> {
  try {
    const account = await db.client.account.findFirst({
      where: { code, tenantId },
      select: { id: true, name: true, code: true },
    })
    return account || null
  } catch (error: any) {
    console.warn(`[DefaultAccounts] getAccountByCode(${code}) failed:`, error?.message)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
//  getAccountsByCodes — دریافت چندین حساب با کد
// ═══════════════════════════════════════════════════════════════

export async function getAccountsByCodes(
  tenantId: string,
  codes: string[]
): Promise<Map<string, { id: string; name: string; code: string }>> {
  const result = new Map<string, { id: string; name: string; code: string }>()
  try {
    const accounts = await db.client.account.findMany({
      where: { code: { in: codes }, tenantId },
      select: { id: true, name: true, code: true },
    })
    for (const acc of accounts) {
      result.set(acc.code, acc)
    }
  } catch (error: any) {
    console.warn('[DefaultAccounts] getAccountsByCodes failed:', error?.message)
  }
  return result
}

// ═══════════════════════════════════════════════════════════════
//  resolveAccountWithFallback — یافتن حساب با fallback بر اساس نوع
// ----------------------------------------------------------------------------
//  ★ این تابع سعی می‌کند ابتدا حساب را با کد پیدا کند.
//  ★ اگر پیدا نشد، بر اساس type و name جستجو می‌کند.
//  ★ این سازگاری با tenant‌هایی است که چارت حساب‌های سفارشی دارند.
// ═══════════════════════════════════════════════════════════════

export async function resolveAccountWithFallback(
  tenantId: string,
  primaryCode: string,
  fallbackType: string,
  fallbackNameKeywords: string[]
): Promise<{ id: string; name: string; code: string } | null> {
  // ★ ۱. جستجو با کد
  const byCode = await getAccountByCode(tenantId, primaryCode)
  if (byCode) return byCode

  // ★ ۲. جستجو با type
  try {
    const byType = await db.client.account.findFirst({
      where: { type: fallbackType, tenantId, isActive: true },
      select: { id: true, name: true, code: true },
    })
    if (byType) return byType
  } catch { /* ignore */ }

  // ★ ۳. جستجو با name keywords
  try {
    const accounts = await db.client.account.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, code: true, type: true },
    })
    for (const acc of accounts) {
      const name = (acc.name || '').toLowerCase()
      if (fallbackNameKeywords.some(kw => name.includes(kw.toLowerCase()))) {
        return acc
      }
    }
  } catch { /* ignore */ }

  return null
}
