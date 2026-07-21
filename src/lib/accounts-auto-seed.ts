// ============================================================================
// src/lib/accounts-auto-seed.ts — Auto-Seed Default Accounts (v2.0)
// ShopAccounting — Helper for ensuring standard accounts exist
// ============================================================================
// ★★★ v2.0 تغییرات:
//   - حذف 1000 (تداخل با 1010)
//   - حذف 4000 (تداخل با 4100)
//   - جابجایی مالیات: 1900→2150 و 1950→2160 (بدهی، نه دارایی)
//   - اضافه کردن 1401 استهلاک انباشته (الزامی برای دارایی ثابت)
//   - اضافه کردن 1500 پیش‌پرداخت‌ها
//   - اضافه کردن 2200 پیش‌دریافت‌ها
//   - اضافه کردن 3200 برداشت مالک
//   - اصلاح منطق taxAccountId برای کد جدید 2150
//   - اضافه کردن accumDepAccountId برای استهلاک انباشته
// ============================================================================

import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  حساب‌های پیش‌فرض (استاندارد حسابداری ایران) — v2.0
//  ★★★ اصلاح‌شده و کامل‌شده
// ═══════════════════════════════════════════════════════════════

const DEFAULT_ACCOUNTS = [
  // ─────────────────────────────────────────
  // دارایی‌های جاری (Current Assets) — 10xx
  // ─────────────────────────────────────────
  {
    code: '1010',
    name: 'صندوق فروشگاه',
    type: 'cash',
    level: 1,
    description: 'موجودی نقد در صندوق فروشگاه',
  },
  {
    code: '1100',
    name: 'بانک',
    type: 'bank',
    level: 1,
    description: 'حساب‌های بانکی فروشگاه',
  },
  {
    code: '1200',
    name: 'موجودی کالا',
    type: 'inventory',
    level: 1,
    description: 'ارزش کالاهای موجود در انبار',
  },
  {
    code: '1300',
    name: 'حساب‌های دریافتنی',
    type: 'receivable',
    level: 1,
    description: 'مطالبات از مشتریان',
  },
  {
    code: '1310',
    name: 'بدهکاران تجاری',
    type: 'receivable',
    level: 2,
    description: 'مانده نسیه مشتریان',
  },
  {
    code: '1350',
    name: 'چک‌های دریافتنی',
    type: 'receivable',
    level: 2,
    description: 'چک‌های دریافت‌شده از مشتریان',
  },
  {
    code: '1500',
    name: 'پیش‌پرداخت‌ها',
    type: 'asset',
    level: 1,
    description: 'مبالغ پرداخت‌شده به تامین‌کنندگان قبل از دریافت کالا',
  },

  // ─────────────────────────────────────────
  // دارایی‌های ثابت (Fixed Assets) — 14xx
  // ─────────────────────────────────────────
  {
    code: '1400',
    name: 'تجهیزات',
    type: 'asset',
    level: 1,
    description: 'دارایی‌های ثابت مشهود فروشگاه',
  },
  {
    // ★★★ حیاتی برای استهلاک دارایی‌های ثابت
    code: '1401',
    name: 'استهلاک انباشته تجهیزات',
    type: 'contra_asset',
    level: 2,
    description: 'استهلاک انباشته تجهیزات (حساب کنترا)',
  },

  // ─────────────────────────────────────────
  // بدهی‌های جاری (Current Liabilities) — 20xx
  // ─────────────────────────────────────────
  {
    code: '2000',
    name: 'حساب‌های پرداختنی',
    type: 'payable',
    level: 1,
    description: 'بدهی به تامین‌کنندگان',
  },
  {
    code: '2010',
    name: 'بستانکاران تجاری',
    type: 'payable',
    level: 2,
    description: 'مانده نسیه به تامین‌کنندگان',
  },
  {
    code: '2050',
    name: 'چک‌های پرداختنی',
    type: 'payable',
    level: 2,
    description: 'چک‌های صادرشده برای تامین‌کنندگان',
  },
  {
    // ★★★ جابجا شده از 1900 — مالیات یک بدهی است، نه دارایی
    code: '2150',
    name: 'مالیات پرداختنی',
    type: 'tax',
    level: 1,
    description: 'مالیات بر درآمد پرداخت‌نشده به دولت',
  },
  {
    // ★★★ جابجا شده از 1950
    code: '2160',
    name: 'مالیات بر ارزش افزوده',
    type: 'tax',
    level: 2,
    description: 'مالیات بر ارزش افزوده دریافتی از مشتریان',
  },
  {
    code: '2200',
    name: 'پیش‌دریافت‌ها',
    type: 'liability',
    level: 1,
    description: 'مبالغ دریافت‌شده از مشتریان قبل از ارائه کالا/خدمت',
  },

  // ─────────────────────────────────────────
  // بدهی‌های بلندمدت (Long-term Liabilities) — 21xx
  // ─────────────────────────────────────────
  {
    code: '2100',
    name: 'وام بانکی',
    type: 'liability',
    level: 1,
    description: 'تسهیلات و وام‌های بانکی دریافت‌شده',
  },

  // ─────────────────────────────────────────
  // حقوق صاحبان سهام (Equity) — 30xx
  // ─────────────────────────────────────────
  {
    code: '3000',
    name: 'سرمایه مالک',
    type: 'equity',
    level: 1,
    description: 'سرمایه‌گذاری اولیه مالک فروشگاه',
  },
  {
    code: '3100',
    name: 'سود انباشته',
    type: 'equity',
    level: 1,
    description: 'سود تجمیع‌شده از سال‌های قبل',
  },
  {
    code: '3200',
    name: 'برداشت مالک',
    type: 'equity',
    level: 1,
    description: 'برداشت مالک از سرمایه فروشگاه',
  },

  // ─────────────────────────────────────────
  // درآمد (Revenue) — 41xx / 42xx
  // ─────────────────────────────────────────
  {
    // ★★★ حساب 4000 حذف شد — 4100 حساب اصلی فروش است
    code: '4100',
    name: 'فروش کالا',
    type: 'revenue',
    level: 1,
    description: 'درآمد حاصل از فروش کالا',
  },
  {
    code: '4200',
    name: 'درآمد خدمات',
    type: 'service_revenue',
    level: 1,
    description: 'درآمد حاصل از ارائه خدمات و تعمیرات',
  },

  // ─────────────────────────────────────────
  // بهای تمام‌شده (COGS) — 50xx
  // ─────────────────────────────────────────
  {
    code: '5000',
    name: 'بهای تمام شده کالای فروش رفته',
    type: 'cogs',
    level: 1,
    description: 'بهای خرید کالاهایی که فروخته شده‌اند',
  },

  // ─────────────────────────────────────────
  // هزینه‌های عملیاتی (Operating Expenses) — 51xx
  // ─────────────────────────────────────────
  {
    code: '5100',
    name: 'هزینه‌های اداری',
    type: 'expense',
    level: 1,
    description: 'هزینه‌های عمومی اداری فروشگاه',
  },
  {
    code: '5105',
    name: 'هزینه کارمزد درگاه',
    type: 'expense',
    level: 2,
    description: 'کارمزد درگاه پرداخت آنلاین',
  },
  {
    code: '5106',
    name: 'هزینه کارمزد پلتفرم',
    type: 'expense',
    level: 2,
    description: 'کارمزد پلتفرم ShopAccounting',
  },
  {
    code: '5110',
    name: 'حقوق و دستمزد',
    type: 'expense',
    level: 2,
    description: 'حقوق و مزایای کارکنان',
  },
  {
    code: '5120',
    name: 'هزینه اجاره',
    type: 'expense',
    level: 2,
    description: 'اجاره محل فروشگاه',
  },
  {
    code: '5130',
    name: 'هزینه آب و برق و گاز',
    type: 'expense',
    level: 2,
    description: 'هزینه‌های انرژی',
  },
  {
    code: '5140',
    name: 'هزینه تبلیغات',
    type: 'expense',
    level: 2,
    description: 'هزینه‌های بازاریابی و تبلیغات',
  },
  {
    code: '5150',
    name: 'هزینه استهلاک',
    type: 'expense',
    level: 2,
    description: 'هزینه استهلاک دارایی‌های ثابت (ماهانه)',
  },
  {
    code: '5200',
    name: 'هزینه مالیات',
    type: 'expense',
    level: 1,
    description: 'هزینه مالیات بر درآمد',
  },

  // ─────────────────────────────────────────
  // هزینه‌های تعمیرات و خدمات — 61xx / 62xx
  // ─────────────────────────────────────────
  {
    code: '6100',
    name: 'هزینه تعمیرات',
    type: 'expense',
    level: 1,
    description: 'هزینه تعمیرات دستگاه‌ها و تجهیزات مشتریان',
  },
  {
    code: '6200',
    name: 'هزینه خدمات',
    type: 'expense',
    level: 1,
    description: 'هزینه خدمات پس از فروش',
  },
] as const

// ═══════════════════════════════════════════════════════════════
//  نوع برگشتی ensureDefaultAccounts
// ═══════════════════════════════════════════════════════════════

export interface SeedResult {
  created: number
  skipped: number
  total: number
  migratedCodes?: string[] // کدهایی که به کد جدید migrate شدند
}

// ═══════════════════════════════════════════════════════════════
//  ensureDefaultAccounts — تضمین وجود حساب‌های استاندارد
//  ★★★ idempotent — چند بار هم صدا بزنید مشکلی نیست
//  ★★★ v2.0: migration کدهای قدیمی به کدهای جدید
// ═══════════════════════════════════════════════════════════════

export async function ensureDefaultAccounts(tenantId: string): Promise<SeedResult> {
  let created = 0
  let skipped = 0
  const migratedCodes: string[] = []

  try {
    // ─── مرحله ۱: migration کدهای قدیمی ───────────────────────
    // اگر حساب‌های قدیمی (1900، 1950، 4000، 1000) وجود دارند،
    // و کدهای جدید هنوز نیستند، کد قدیمی را به جدید تغییر بده

    const migrationMap: Array<{ oldCode: string; newCode: string; newName?: string; newType?: string }> = [
      { oldCode: '1900', newCode: '2150', newName: 'مالیات پرداختنی', newType: 'tax' },
      { oldCode: '1950', newCode: '2160', newName: 'مالیات بر ارزش افزوده', newType: 'tax' },
    ]

    for (const migration of migrationMap) {
      try {
        // آیا کد قدیمی وجود دارد؟
        const oldAccount = await db.client.account.findFirst({
          where: { tenantId, code: migration.oldCode },
        })

        if (oldAccount) {
          // آیا کد جدید هنوز نیست؟
          const newAccountExists = await db.client.account.findFirst({
            where: { tenantId, code: migration.newCode },
          })

          if (!newAccountExists) {
            // تغییر کد قدیمی به کد جدید
            await db.client.account.update({
              where: { id: oldAccount.id },
              data: {
                code: migration.newCode,
                ...(migration.newName ? { name: migration.newName } : {}),
                ...(migration.newType ? { type: migration.newType } : {}),
              },
            })
            migratedCodes.push(`${migration.oldCode}→${migration.newCode}`)
            console.log(
              `[AccountsAutoSeed] Migrated account code: ${migration.oldCode} → ${migration.newCode}`
            )
          }
        }
      } catch (err: any) {
        console.error(
          `[AccountsAutoSeed] Migration error ${migration.oldCode}→${migration.newCode}:`,
          err?.message
        )
      }
    }

    // ─── مرحله ۲: حذف/غیرفعال‌کردن حساب‌های منسوخ ──────────────
    // حساب 1000 و 4000 را غیرفعال می‌کنیم (حذف نمی‌کنیم چون ممکن است
    // سند داشته باشند)

    const deprecatedCodes = ['1000', '4000']
    for (const depCode of deprecatedCodes) {
      try {
        const depAccount = await db.client.account.findFirst({
          where: { tenantId, code: depCode, isActive: true },
        })
        if (depAccount) {
          await db.client.account.update({
            where: { id: depAccount.id },
            data: { isActive: false },
          })
          console.log(`[AccountsAutoSeed] Deactivated deprecated account: ${depCode}`)
        }
      } catch (err: any) {
        // اگر نشد، ادامه بده
      }
    }

    // ─── مرحله ۳: بررسی و ساخت حساب‌های جدید ───────────────────

    const existingAccounts = await db.client.account.findMany({
      where: { tenantId },
      select: { code: true },
    })
    const existingCodes = new Set(existingAccounts.map((a) => a.code))

    const accountsToCreate = DEFAULT_ACCOUNTS.filter(
      (acc) => !existingCodes.has(acc.code)
    )

    if (accountsToCreate.length === 0) {
      skipped = existingAccounts.length
      console.log(
        `[AccountsAutoSeed] All accounts exist for tenant ${tenantId} — skipped`
      )
    } else {
      console.log(
        `[AccountsAutoSeed] Creating ${accountsToCreate.length} missing accounts for tenant ${tenantId}:`,
        accountsToCreate.map((a) => a.code)
      )

      for (const acc of accountsToCreate) {
        try {
          await db.client.account.create({
            data: {
              code: acc.code,
              name: acc.name,
              type: acc.type,
              level: acc.level,
              isActive: true,
              tenantId,
            },
          })
          created++
        } catch (err: any) {
          // تکراری یا خطای دیگر — skip
          skipped++
        }
      }
    }

    const total = await db.client.account.count({ where: { tenantId } })

    console.log(
      `[AccountsAutoSeed] Done for tenant ${tenantId}: ` +
        `${created} created, ${skipped} skipped, ${total} total` +
        (migratedCodes.length ? `, migrated: ${migratedCodes.join(', ')}` : '')
    )

    return { created, skipped, total, migratedCodes }
  } catch (err: any) {
    console.error('[AccountsAutoSeed] Failed:', err?.message)
    // ★ fail نشود — عملیات اصلی نباید متوقف شود
    return { created: 0, skipped: 0, total: 0, migratedCodes: [] }
  }
}

// ═══════════════════════════════════════════════════════════════
//  getStandardAccountIds — دریافت ID حساب‌های استاندارد
//  ★★★ v2.0: اضافه‌شدن accumDepAccountId برای استهلاک انباشته
//  ★★★ v2.0: اصلاح taxAccountId برای کد جدید 2150
// ═══════════════════════════════════════════════════════════════

export interface StandardAccountIds {
  cashAccountId: string | null          // 1010 صندوق
  bankAccountId: string | null          // 1100 بانک
  salesAccountId: string | null         // 4100 فروش کالا
  cogsAccountId: string | null          // 5000 بهای تمام‌شده
  inventoryAccountId: string | null     // 1200 موجودی کالا
  receivablesAccountId: string | null   // 1300 حساب‌های دریافتنی
  payablesAccountId: string | null      // 2000 حساب‌های پرداختنی
  taxAccountId: string | null           // 2150 مالیات پرداختنی (جدید)
  vatAccountId: string | null           // 2160 مالیات بر ارزش افزوده (جدید)
  fixedAssetAccountId: string | null    // 1400 تجهیزات
  accumDepAccountId: string | null      // 1401 استهلاک انباشته (جدید)
  depExpenseAccountId: string | null    // 5150 هزینه استهلاک
  equityAccountId: string | null        // 3000 سرمایه مالک
  retainedEarningsId: string | null     // 3100 سود انباشته
  serviceRevenueId: string | null       // 4200 درآمد خدمات
  checkReceivableId: string | null      // 1350 چک‌های دریافتنی
  checkPayableId: string | null         // 2050 چک‌های پرداختنی
  tradePurchasableId: string | null     // 2010 بستانکاران تجاری
  tradeReceivableId: string | null      // 1310 بدهکاران تجاری
}

export async function getStandardAccountIds(
  tenantId: string
): Promise<StandardAccountIds> {
  // ★ اول مطمئن شو حساب‌ها هستن و migration انجام شده
  await ensureDefaultAccounts(tenantId)

  // ★ همه حساب‌ها را با ترتیب کد بگیر (orderBy برای ثبات)
  const accounts = await db.client.account.findMany({
    where: { tenantId, isActive: true },
    orderBy: { code: 'asc' },
  })

  // ─── نگاشت کد → ID ───────────────────────────────────────────
  const codeMap = new Map<string, string>()
  for (const acc of accounts) {
    codeMap.set(acc.code, acc.id)
  }

  // ─── resolve با اولویت‌بندی دقیق ────────────────────────────

  const result: StandardAccountIds = {
    // ★ صندوق — اولویت: 1010 > type=cash > type=bank > 1100
    cashAccountId:
      codeMap.get('1010') ??
      accounts.find((a) => a.type === 'cash')?.id ??
      codeMap.get('1100') ??
      null,

    // ★ بانک — اولویت: 1100 > type=bank
    bankAccountId:
      codeMap.get('1100') ??
      accounts.find((a) => a.type === 'bank')?.id ??
      null,

    // ★ فروش — اولویت: 4100 > 4000 > type=revenue (نه service_revenue)
    salesAccountId:
      codeMap.get('4100') ??
      codeMap.get('4000') ??
      accounts.find((a) => a.type === 'revenue' && a.code.startsWith('4'))?.id ??
      null,

    // ★ بهای تمام‌شده — اولویت: 5000 > type=cogs
    cogsAccountId:
      codeMap.get('5000') ??
      accounts.find((a) => a.type === 'cogs')?.id ??
      null,

    // ★ موجودی کالا — اولویت: 1200 > type=inventory
    inventoryAccountId:
      codeMap.get('1200') ??
      accounts.find((a) => a.type === 'inventory')?.id ??
      null,

    // ★ حساب‌های دریافتنی — اولویت: 1300 > type=receivable
    receivablesAccountId:
      codeMap.get('1300') ??
      accounts.find((a) => a.type === 'receivable')?.id ??
      null,

    // ★ حساب‌های پرداختنی — اولویت: 2000 > type=payable
    payablesAccountId:
      codeMap.get('2000') ??
      accounts.find((a) => a.type === 'payable')?.id ??
      null,

    // ★★★ v2.0: مالیات — کد جدید 2150 (قبلاً 1900)
    taxAccountId:
      codeMap.get('2150') ??
      codeMap.get('1900') ?? // fallback برای تنانت‌های قدیمی
      accounts.find((a) => a.type === 'tax')?.id ??
      null,

    // ★★★ v2.0: مالیات بر ارزش افزوده — کد جدید 2160 (قبلاً 1950)
    vatAccountId:
      codeMap.get('2160') ??
      codeMap.get('1950') ?? // fallback
      accounts.find((a) => a.type === 'tax' && a.code !== '2150' && a.code !== '1900')?.id ??
      null,

    // ★ دارایی ثابت — اولویت: 1400 > type=asset
    fixedAssetAccountId:
      codeMap.get('1400') ??
      accounts.find((a) => a.type === 'asset' && a.code.startsWith('14'))?.id ??
      null,

    // ★★★ v2.0: استهلاک انباشته — 1401 (جدید، حیاتی)
    accumDepAccountId:
      codeMap.get('1401') ??
      accounts.find((a) => a.type === 'contra_asset')?.id ??
      null,

    // ★ هزینه استهلاک — 5150
    depExpenseAccountId:
      codeMap.get('5150') ??
      accounts.find(
        (a) => a.type === 'expense' && (a.name.includes('استهلاک') || a.code === '5150')
      )?.id ??
      null,

    // ★ سرمایه مالک — 3000
    equityAccountId:
      codeMap.get('3000') ??
      accounts.find((a) => a.type === 'equity' && a.code === '3000')?.id ??
      null,

    // ★ سود انباشته — 3100
    retainedEarningsId:
      codeMap.get('3100') ??
      accounts.find((a) => a.type === 'equity' && a.code === '3100')?.id ??
      null,

    // ★ درآمد خدمات — 4200
    serviceRevenueId:
      codeMap.get('4200') ??
      accounts.find((a) => a.type === 'service_revenue')?.id ??
      null,

    // ★ چک‌های دریافتنی — 1350
    checkReceivableId:
      codeMap.get('1350') ??
      accounts.find(
        (a) => a.type === 'receivable' && a.name.includes('چک')
      )?.id ??
      null,

    // ★ چک‌های پرداختنی — 2050
    checkPayableId:
      codeMap.get('2050') ??
      accounts.find(
        (a) => a.type === 'payable' && a.name.includes('چک')
      )?.id ??
      null,

    // ★ بستانکاران تجاری — 2010
    tradePurchasableId:
      codeMap.get('2010') ??
      accounts.find(
        (a) => a.type === 'payable' && a.name.includes('بستانکار')
      )?.id ??
      null,

    // ★ بدهکاران تجاری — 1310
    tradeReceivableId:
      codeMap.get('1310') ??
      accounts.find(
        (a) => a.type === 'receivable' && a.name.includes('بدهکار')
      )?.id ??
      null,
  }

  // ─── لاگ برای debug ───────────────────────────────────────────
  const missing = Object.entries(result)
    .filter(([, v]) => v === null)
    .map(([k]) => k)

  if (missing.length > 0) {
    console.warn(
      `[AccountsAutoSeed] WARNING — Missing account IDs for tenant ${tenantId}:`,
      missing
    )
  } else {
    console.log(
      `[AccountsAutoSeed] All ${Object.keys(result).length} standard accounts resolved for tenant ${tenantId}`
    )
  }

  return result
}

// ═══════════════════════════════════════════════════════════════
//  لیست حساب‌های پیش‌فرض (برای نمایش در UI)
// ═══════════════════════════════════════════════════════════════

export { DEFAULT_ACCOUNTS }

// ═══════════════════════════════════════════════════════════════
//  خلاصه تغییرات v2.0 برای مستندسازی
// ═══════════════════════════════════════════════════════════════
/*
  حساب‌های حذف‌شده (غیرفعال):
    1000  صندوق           → غیرفعال (تداخل با 1010)
    4000  فروش            → غیرفعال (تداخل با 4100)

  حساب‌های migrate‌شده:
    1900  → 2150  مالیات پرداختنی (از دارایی به بدهی)
    1950  → 2160  مالیات بر ارزش افزوده (از دارایی به بدهی)

  حساب‌های جدید:
    1401  استهلاک انباشته تجهیزات  (contra_asset — الزامی)
    1500  پیش‌پرداخت‌ها             (asset)
    2200  پیش‌دریافت‌ها             (liability)
    3200  برداشت مالک               (equity)

  تغییر در getStandardAccountIds:
    + bankAccountId        (جدید — جدا از cashAccountId)
    + vatAccountId         (جدید — 2160 جدا از taxAccountId 2150)
    + accumDepAccountId    (جدید — 1401 برای استهلاک)
    + serviceRevenueId     (جدید — 4200)
    + checkReceivableId    (جدید — 1350)
    + checkPayableId       (جدید — 2050)
    + tradePurchasableId   (جدید — 2010)
    + tradeReceivableId    (جدید — 1310)
*/