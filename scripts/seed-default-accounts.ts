// ============================================================================
// scripts/seed-default-accounts.ts — v8.8 ★★★
// ShopAccounting — Seed Default Chart of Accounts for All Tenants
// ----------------------------------------------------------------------------
// ★ این اسکریپت برای تمام tenant‌های موجود، حساب‌های پیش‌فرض را ایجاد می‌کند.
// ★ شامل چارت کامل حساب‌های استاندارد:
//     • دارایی‌ها (صندوق، بانک، موجودی، دریافتنی، چک، تجهیزات)
//     • بدهی‌ها (پرداختنی، بستانکاران، چک پرداختنی، وام)
//     • سرمایه (سرمایه مالک، سود انباشته)
//     • درآمد (فروش کالا، درآمد خدمات)
//     • بهای تمام شده و هزینه‌ها
//     • مالیات
//
// ★ نحوه اجرا:
//   npx tsx scripts/seed-default-accounts.ts
//
// ★ این اسکریپت idempotent است — اجرای چندباره آن هیچ اشکالی ندارد.
// ============================================================================

import { db } from '../src/lib/db'

// ★ v9.5.0: استفاده از db.client

// ═══════════════════════════════════════════════════════════════
//  تعریف حساب‌های پیش‌فرض — چارت استاندارد کامل
// ═══════════════════════════════════════════════════════════════

const DEFAULT_ACCOUNTS = [
  // ─── ۱. دارایی‌های جاری ─────────────────────────────────────────
  { code: '1010', name: 'صندوق فروشگاه', type: 'cash', level: 2 },
  { code: '1100', name: 'بانک', type: 'bank', level: 2 },
  { code: '1200', name: 'موجودی کالا', type: 'inventory', level: 2 },
  { code: '1300', name: 'حساب‌های دریافتنی', type: 'receivable', level: 2 },
  { code: '1310', name: 'بدهکاران تجاری', type: 'receivable', level: 3 },  // ★ v8.8: نسیه
  { code: '1350', name: 'چک‌های دریافتنی', type: 'receivable', level: 3 }, // ★ v8.8: چک

  // ─── ۲. دارایی‌های ثابت ────────────────────────────────────────
  { code: '1400', name: 'تجهیزات', type: 'asset', level: 2 },  // ★ v8.8: دارایی ثابت

  // ─── ۳. بدهی‌های جاری ──────────────────────────────────────────
  { code: '2000', name: 'حساب‌های پرداختنی', type: 'payable', level: 2 },
  { code: '2010', name: 'بستانکاران تجاری', type: 'payable', level: 3 },  // ★ v8.8: نسیه
  { code: '2050', name: 'چک‌های پرداختنی', type: 'payable', level: 3 },   // ★ v8.8: چک
  { code: '2100', name: 'وام بانکی', type: 'liability', level: 2 },      // ★ v8.8: وام

  // ─── ۴. حقوق صاحبان سهام ──────────────────────────────────────
  { code: '3000', name: 'سرمایه', type: 'equity', level: 2 },            // ★ v8.8: سرمایه مالک
  { code: '3100', name: 'سود انباشته', type: 'equity', level: 2 },       // ★ v8.8: سود انباشته

  // ─── ۵. درآمدها ────────────────────────────────────────────────
  { code: '4000', name: 'فروش', type: 'revenue', level: 2 },
  { code: '4100', name: 'فروش کالا', type: 'revenue', level: 3 },
  { code: '4200', name: 'درآمد خدمات', type: 'service_revenue', level: 3 },  // ★ v8.8: خدمات

  // ─── ۶. بهای تمام شده ──────────────────────────────────────────
  { code: '5000', name: 'بهای تمام شده کالای فروش رفته', type: 'cogs', level: 2 },
  { code: '5100', name: 'هزینه‌های اداری', type: 'expense', level: 2 },
  { code: '5110', name: 'حقوق و دستمزد', type: 'expense', level: 3 },
  { code: '5120', name: 'هزینه اجاره', type: 'expense', level: 3 },
  { code: '5130', name: 'هزینه آب و برق و گاز', type: 'expense', level: 3 },
  { code: '5140', name: 'هزینه تبلیغات', type: 'expense', level: 3 },
  { code: '5200', name: 'هزینه مالیات', type: 'expense', level: 2 },

  // ─── ۷. هزینه‌های تعمیرات و خدمات (جدید v8.7) ──────────────────
  { code: '6100', name: 'هزینه تعمیرات', type: 'repair_expense', level: 2 },     // ★ v8.8
  { code: '6200', name: 'هزینه خدمات', type: 'service_expense', level: 2 },      // ★ v8.8

  // ─── ۸. مالیات ────────────────────────────────────────────────
  { code: '1900', name: 'مالیات پرداختنی', type: 'tax', level: 2 },
  { code: '1950', name: 'مالیات بر ارزش افزوده (فروش)', type: 'tax', level: 3 },

  // ─── ۹. کارمزدها (v8.2) ──────────────────────────────────────
  { code: '5105', name: 'هزینه کارمزد درگاه پرداخت آنلاین', type: 'expense', level: 3 },
  { code: '5106', name: 'هزینه کارمزد پلتفرم ShopAccounting', type: 'expense', level: 3 },
] as const

// ═══════════════════════════════════════════════════════════════
//  تابع اصلی
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  ShopAccounting v8.8 — Seed Default Accounts (Complete)')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log()

  const tenants = await db.client.tenant.findMany({
    select: { id: true, companyName: true, planName: true },
  })

  console.log(`Found ${tenants.length} tenant(s)`)
  console.log()

  let totalCreated = 0
  let totalExisting = 0
  let totalFailed = 0

  // ★ بررسی isSystemAccount
  let isSystemAccountSupported = false
  try {
    const sampleAccount = await db.client.account.findFirst()
    if (sampleAccount && 'isSystemAccount' in sampleAccount) {
      isSystemAccountSupported = true
    }
  } catch {
    // ★ فیلد موجود نیست
  }

  if (!isSystemAccountSupported) {
    console.warn('⚠️  فیلد isSystemAccount در schema موجود نیست.')
    console.warn('   ادامه بدون ست کردن isSystemAccount...\n')
  }

  for (const tenant of tenants) {
    console.log(`── Tenant: ${tenant.companyName} (${tenant.id.substring(0, 8)}...)`)
    console.log(`   Plan: ${tenant.planName}`)

    let tenantCreated = 0
    let tenantExisting = 0

    const existingAccounts = await db.client.account.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, code: true, name: true },
    })
    const existingByCode = new Map(existingAccounts.map(a => [a.code, a]))

    for (const def of DEFAULT_ACCOUNTS) {
      const existing = existingByCode.get(def.code)
      if (existing) {
        tenantExisting++
        if (isSystemAccountSupported) {
          try {
            await db.client.account.update({
              where: { id: existing.id },
              data: { isSystemAccount: true } as any,
            })
          } catch (err: any) {
            // ignore
          }
        }
      } else {
        try {
          await db.client.account.create({
            data: {
              code: def.code,
              name: def.name,
              type: def.type,
              level: def.level,
              isActive: true,
              tenantId: tenant.id,
              ...(isSystemAccountSupported ? { isSystemAccount: true } as any : {}),
            } as any,
          })
          tenantCreated++
          console.log(`   ✓ Created: ${def.code} — ${def.name}`)
        } catch (err: any) {
          totalFailed++
          console.warn(`   ✗ Failed to create ${def.code} ${def.name}: ${err?.message}`)
        }
      }
    }

    console.log(`   Summary: ${tenantCreated} created, ${tenantExisting} existing\n`)
    totalCreated += tenantCreated
    totalExisting += tenantExisting
  }

  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  Summary')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  Total tenants:    ${tenants.length}`)
  console.log(`  Total created:    ${totalCreated}`)
  console.log(`  Total existing:   ${totalExisting}`)
  console.log(`  Total failed:     ${totalFailed}`)
  console.log()

  if (totalFailed > 0) {
    console.warn('⚠️  برخی حساب‌ها ایجاد نشدند. خطاها را بررسی کنید.')
    process.exit(1)
  } else {
    console.log('✓ All default accounts seeded successfully.')
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.client.$disconnect()
  })
