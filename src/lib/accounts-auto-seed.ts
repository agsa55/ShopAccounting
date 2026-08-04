// ============================================================================
// src/lib/accounts-auto-seed.ts — Auto-Seed Default Accounts (v3.0 FINAL)
// ShopAccounting — Helper for ensuring standard accounts exist
// ============================================================================
// ★★★ v3.0 تغییرات نهایی:
//   - حذف کامل کدهای قدیمی (1900, 1950, 1000, 4000, 6100, 6200) از لیست ساخت
//   - منطق پاکسازی: اگر کد قدیمی وجود داشت و سند نداشت -> حذف کامل
//   - منطق پاکسازی: اگر کد قدیمی وجود داشت و سند داشت -> تغییر نام به "[منسوخ]" و غیرفعال‌سازی
//   - استفاده انحصاری از Types فارسی استاندارد (بدهی، هزینه، صندوق، ...)
// ============================================================================

import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  حساب‌های پیش‌فرض استاندارد (منبع واحد حقیقت - Single Source of Truth)
// ═══════════════════════════════════════════════════════════════
export const DEFAULT_ACCOUNTS = [
  { code: '1010', name: 'صندوق فروشگاه', type: 'صندوق', level: 1 },
  { code: '1100', name: 'بانک', type: 'بانک', level: 1 },
  { code: '1200', name: 'موجودی کالا', type: 'موجودی', level: 1 },
  { code: '1300', name: 'حساب‌های دریافتنی', type: 'دریافتنی', level: 1 },
  { code: '1310', name: 'بدهکاران تجاری', type: 'دریافتنی', level: 2 },
  { code: '1350', name: 'چک‌های دریافتنی', type: 'دریافتنی', level: 2 },
  { code: '1500', name: 'پیش‌پرداخت‌ها', type: 'دارایی', level: 1 },
  { code: '1400', name: 'تجهیزات و اثاثیه', type: 'دارایی_ثابت', level: 1 },
  { code: '1401', name: 'استهلاک انباشته تجهیزات', type: 'کاهنده_دارایی', level: 2 },
  { code: '2000', name: 'حساب‌های پرداختنی', type: 'پرداختنی', level: 1 },
  { code: '2010', name: 'بستانکاران تجاری', type: 'پرداختنی', level: 2 },
  { code: '2050', name: 'چک‌های پرداختنی', type: 'پرداختنی', level: 2 },
  { code: '2100', name: 'وام بانکی', type: 'بدهی', level: 1 },
  { code: '2150', name: 'مالیات پرداختنی', type: 'بدهی', level: 1 }, // ★★★ جایگزین 1900
  { code: '2160', name: 'مالیات بر ارزش افزوده', type: 'بدهی', level: 2 }, // ★★★ جایگزین 1950
  { code: '2200', name: 'پیش‌دریافت‌ها', type: 'بدهی', level: 1 },
  { code: '3000', name: 'سرمایه مالک', type: 'سرمایه', level: 1 },
  { code: '3100', name: 'سود (زیان) انباشته', type: 'سرمایه', level: 1 },
  { code: '3200', name: 'برداشت مالک', type: 'سرمایه', level: 1 },
  { code: '4100', name: 'فروش کالا', type: 'درآمد', level: 1 },
  { code: '4200', name: 'درآمد خدمات', type: 'درآمد', level: 1 },
  { code: '5000', name: 'بهای تمام شده کالای فروش رفته', type: 'بهای_تمام_شده', level: 1 },
  { code: '5100', name: 'هزینه‌های اداری و تشکیلاتی', type: 'هزینه', level: 1 },
  { code: '5105', name: 'هزینه کارمزد درگاه پرداخت', type: 'هزینه', level: 2 },
  { code: '5106', name: 'هزینه کارمزد پلتفرم', type: 'هزینه', level: 2 },
  { code: '5110', name: 'حقوق و دستمزد', type: 'هزینه', level: 2 },
  { code: '5120', name: 'هزینه اجاره', type: 'هزینه', level: 2 },
  { code: '5130', name: 'هزینه انرژی (آب، برق، گاز)', type: 'هزینه', level: 2 },
  { code: '5140', name: 'هزینه تبلیغات و بازاریابی', type: 'هزینه', level: 2 },
  { code: '5150', name: 'هزینه استهلاک', type: 'هزینه', level: 2 },
  { code: '5160', name: 'هزینه تعمیرات و نگهداری', type: 'هزینه', level: 2 }, // ★★★ جایگزین 6100
  { code: '5170', name: 'هزینه خدمات و متفرقه', type: 'هزینه', level: 2 }, // ★★★ جایگزین 6200
  { code: '5200', name: 'هزینه مالیات و عوارض', type: 'هزینه', level: 1 },
] as const

// کدهای قدیمی که باید پاکسازی شوند
const DEPRECATED_CODES = ['1900', '1950', '1000', '4000', '6100', '6200']

export interface SeedResult {
  created: number
  skipped: number
  total: number
  cleaned: number
}

// ═══════════════════════════════════════════════════════════════
//  ensureDefaultAccounts — تضمین وجود حساب‌های استاندارد و پاکسازی قدیمی‌ها
// ═══════════════════════════════════════════════════════════════
export async function ensureDefaultAccounts(tenantId: string): Promise<SeedResult> {
  let created = 0
  let skipped = 0
  let cleaned = 0

  try {
    // ─── مرحله ۱: پاکسازی حساب‌های منسوخ ───────────────────────
    for (const oldCode of DEPRECATED_CODES) {
      const oldAccount = await db.client.account.findFirst({
        where: { tenantId, code: oldCode }
      })

      if (oldAccount) {
        // بررسی آیا این حساب در هیچ سندی استفاده شده است؟
        const usageCount = await db.client.journalEntryLine.count({
          where: { accountId: oldAccount.id }
        })

        if (usageCount === 0) {
          // اگر سندی ندارد، کاملاً حذف کن
          await db.client.account.delete({ where: { id: oldAccount.id } })
          cleaned++
        } else {
          // اگر سند دارد، نامش را تغییر بده و غیرفعال کن تا تاریخچه خراب نشود
          await db.client.account.update({
            where: { id: oldAccount.id },
            data: {
              code: `${oldCode}_DEPRECATED`,
              name: `⛔ [منسوخ] ${oldAccount.name}`,
              isActive: false,
            }
          })
          cleaned++
        }
      }
    }

    // ─── مرحله ۲: بررسی و ساخت/به‌روزرسانی حساب‌های استاندارد ──
    const existingAccounts = await db.client.account.findMany({
      where: { tenantId },
      select: { code: true, id: true, name: true, type: string, level: number },
    })
    const existingByCode = new Map(existingAccounts.map(a => [a.code, a]))

    for (const acc of DEFAULT_ACCOUNTS) {
      const existing = existingByCode.get(acc.code)
      
      if (existing) {
        // اگر وجود دارد، فقط در صورت نیاز به‌روزرسانی کن
        if (existing.type !== acc.type || existing.name !== acc.name || existing.level !== acc.level) {
          await db.client.account.update({
            where: { id: existing.id },
            data: { type: acc.type, name: acc.name, level: acc.level, isActive: true }
          })
        }
        skipped++
      } else {
        // اگر وجود ندارد، ایجاد کن
        await db.client.account.create({
          data: {
            code: acc.code,
            name: acc.name,
            type: acc.type,
            level: acc.level,
            isActive: true,
            tenantId,
          }
        })
        created++
      }
    }

    const total = await db.client.account.count({ where: { tenantId } })
    return { created, skipped, total, cleaned }

  } catch (err: any) {
    console.error('[AccountsAutoSeed] Failed:', err?.message)
    return { created: 0, skipped: 0, total: 0, cleaned: 0 }
  }
}

// ═══════════════════════════════════════════════════════════════
//  getStandardAccountIds — دریافت ID حساب‌های استاندارد
// ═══════════════════════════════════════════════════════════════
export interface StandardAccountIds {
  cashAccountId: string | null
  bankAccountId: string | null
  salesAccountId: string | null
  cogsAccountId: string | null
  inventoryAccountId: string | null
  receivablesAccountId: string | null
  payablesAccountId: string | null
  taxAccountId: string | null           // 2150
  vatAccountId: string | null           // 2160
  fixedAssetAccountId: string | null
  accumDepAccountId: string | null      // 1401
  depExpenseAccountId: string | null
  equityAccountId: string | null
  retainedEarningsId: string | null
  serviceRevenueId: string | null
  checkReceivableId: string | null
  checkPayableId: string | null
  tradePurchasableId: string | null
  tradeReceivableId: string | null
}

export async function getStandardAccountIds(tenantId: string): Promise<StandardAccountIds> {
  // اطمینان از وجود و پاکسازی حساب‌ها قبل از دریافت ID
  await ensureDefaultAccounts(tenantId)

  const accounts = await db.client.account.findMany({
    where: { tenantId, isActive: true },
    orderBy: { code: 'asc' },
  })

  const codeMap = new Map<string, string>()
  for (const acc of accounts) {
    codeMap.set(acc.code, acc.id)
  }

  return {
    cashAccountId: codeMap.get('1010') ?? accounts.find((a) => a.type === 'صندوق')?.id ?? null,
    bankAccountId: codeMap.get('1100') ?? accounts.find((a) => a.type === 'بانک')?.id ?? null,
    salesAccountId: codeMap.get('4100') ?? accounts.find((a) => a.type === 'درآمد')?.id ?? null,
    cogsAccountId: codeMap.get('5000') ?? accounts.find((a) => a.type === 'بهای_تمام_شده')?.id ?? null,
    inventoryAccountId: codeMap.get('1200') ?? accounts.find((a) => a.type === 'موجودی')?.id ?? null,
    receivablesAccountId: codeMap.get('1300') ?? accounts.find((a) => a.type === 'دریافتنی')?.id ?? null,
    payablesAccountId: codeMap.get('2000') ?? accounts.find((a) => a.type === 'پرداختنی')?.id ?? null,
    taxAccountId: codeMap.get('2150') ?? accounts.find((a) => a.name.includes('مالیات پرداختنی'))?.id ?? null,
    vatAccountId: codeMap.get('2160') ?? accounts.find((a) => a.name.includes('ارزش افزوده'))?.id ?? null,
    fixedAssetAccountId: codeMap.get('1400') ?? accounts.find((a) => a.type === 'دارایی_ثابت')?.id ?? null,
    accumDepAccountId: codeMap.get('1401') ?? accounts.find((a) => a.type === 'کاهنده_دارایی')?.id ?? null,
    depExpenseAccountId: codeMap.get('5150') ?? null,
    equityAccountId: codeMap.get('3000') ?? null,
    retainedEarningsId: codeMap.get('3100') ?? null,
    serviceRevenueId: codeMap.get('4200') ?? null,
    checkReceivableId: codeMap.get('1350') ?? null,
    checkPayableId: codeMap.get('2050') ?? null,
    tradePurchasableId: codeMap.get('2010') ?? null,
    tradeReceivableId: codeMap.get('1310') ?? null,
  }
}