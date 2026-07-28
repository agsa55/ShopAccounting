// ═══════════════════════════════════════════════════════════════
// scripts/fix-jes-wrong-accounts.ts
// ★★★ FIX SCRIPT — اصلاح حساب‌های اشتباه در Journal Entries
// ═══════════════════════════════════════════════════════════════
// ★★★ v3: حذف include: { account } — استفاده از accountMap (مثل داشبورد)
//   - در v2 از `include: { account: {...} }` استفاده می‌کرد که در Prisma schema
//     شما این relation به اسم `account` تعریف نشده (فقط کلید خارجی accountId هست).
//   - در v3، مثل داشبورد، ابتدا تمام accounts را fetch می‌کنیم و یک Map می‌سازیم.
//   - سپس برای هر JE Line، accountId را در Map lookup می‌کنیم.
//
// نحوه اجرا (از ریشه پروژه):
//   npx tsx scripts/fix-jes-wrong-accounts.ts
//
// برای حالت DRY RUN (بدون آپدیت):
//   DRY_RUN=1 npx tsx scripts/fix-jes-wrong-accounts.ts
//
// برای tenantId خاص:
//   TENANT_ID=demo-1784284690986-v5csdiths npx tsx scripts/fix-jes-wrong-accounts.ts
// ═══════════════════════════════════════════════════════════════

import { db } from '../src/lib/db'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const TARGET_TENANT_ID = process.env.TENANT_ID

// ═══════════════════════════════════════════════════════════════
//  راه‌نمایی حساب‌های استاندارد (با اولویت)
// ═══════════════════════════════════════════════════════════════
const ACCOUNT_RULES = {
  cash: [
    { code: '1010', type: 'cash' },
    { code: '1000', type: 'cash' },
    { code: '1100', type: 'bank' },
  ],
  sales: [
    { code: '4100', type: 'revenue' },
    { code: '4000', type: 'revenue' },
  ],
  receivable: [
    { code: '1300', type: 'receivable' },
    { code: '1310', type: 'receivable' },
  ],
  payable: [
    { code: '2000', type: 'payable' },
    { code: '2010', type: 'payable' },
  ],
  cogs: [{ code: '5000', type: 'cogs' }],
  inventory: [{ code: '1200', type: 'inventory' }],
  tax: [
    { code: '1900', type: 'tax' },
    { code: '1950', type: 'tax' },
  ],
} as const

type RuleKey = keyof typeof ACCOUNT_RULES

// ═══════════════════════════════════════════════════════════════
//  Helper: پیدا کردن accountId صحیح
// ═══════════════════════════════════════════════════════════════
async function findCorrectAccountId(
  tenantId: string,
  ruleKey: RuleKey
): Promise<{ id: string; code: string; name: string } | null> {
  const rules = ACCOUNT_RULES[ruleKey]
  for (const rule of rules) {
    const acc = await db.client.account.findFirst({
      where: { tenantId, code: rule.code },
      select: { id: true, code: true, name: true, type: true },
    })
    if (acc) {
      const accType = (acc.type || '').toLowerCase()
      const ruleType = rule.type.toLowerCase()
      if (accType !== ruleType) {
        console.log(`  [WARN] Account ${acc.code} type mismatch: expected ${rule.type}, got ${acc.type} — using anyway (code match)`)
      }
      return acc
    }
  }
  const fallback = await db.client.account.findFirst({
    where: {
      tenantId,
      type: { contains: ruleKey as string, mode: 'insensitive' as any },
    },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, type: true },
  })
  if (fallback) {
    console.log(`  [FALLBACK] Using account ${fallback.code} (${fallback.name}) for rule "${ruleKey}" — type: ${fallback.type}`)
    return fallback
  }
  return null
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  FIX JE WRONG ACCOUNTS (v3 — No include:account)')
  console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN (no updates)' : '⚡ LIVE (will update)'}`)
  if (TARGET_TENANT_ID) {
    console.log(`  Target tenant: ${TARGET_TENANT_ID}`)
  } else {
    console.log('  Target: ALL tenants')
  }
  console.log('═══════════════════════════════════════════════════════════════')

  // ─── یافتن tenantIdها ───
  let tenantIds: string[] = []
  if (TARGET_TENANT_ID) {
    tenantIds = [TARGET_TENANT_ID]
  } else {
    try {
      const tenants = await (db.client as any).tenant.findMany({
        select: { id: true },
      })
      tenantIds = tenants.map((t: any) => t.id).filter(Boolean)
    } catch (err: any) {
      try {
        const jes = await db.client.journalEntry.findMany({
          distinct: ['tenantId'],
          select: { tenantId: true },
        })
        tenantIds = jes.map((j: any) => j.tenantId).filter(Boolean)
      } catch (err2: any) {
        console.error('  ❌ Cannot find tenants:', err2?.message)
        console.error('  💡 Tip: Set TENANT_ID env var: TENANT_ID=demo-xxx npx tsx scripts/fix-jes-wrong-accounts.ts')
        process.exit(1)
      }
    }
  }

  console.log(`\nFound ${tenantIds.length} tenant(s) to process`)

  let totalFixed = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (const tenantId of tenantIds) {
    if (!tenantId) continue
    console.log(`\n─── Processing tenant: ${tenantId} ───`)

    // ─── یافتن accountIdهای صحیح ───
    const correctAccounts = {
      cash: await findCorrectAccountId(tenantId, 'cash'),
      sales: await findCorrectAccountId(tenantId, 'sales'),
      receivable: await findCorrectAccountId(tenantId, 'receivable'),
      payable: await findCorrectAccountId(tenantId, 'payable'),
      cogs: await findCorrectAccountId(tenantId, 'cogs'),
      inventory: await findCorrectAccountId(tenantId, 'inventory'),
      tax: await findCorrectAccountId(tenantId, 'tax'),
    }

    console.log('  Correct accounts resolved:')
    for (const [key, val] of Object.entries(correctAccounts)) {
      console.log(`    ${key}: ${val ? `${val.code} (${val.name})` : '❌ NOT FOUND'}`)
    }

    if (!correctAccounts.cash && !correctAccounts.sales) {
      console.log('  ⚠️ Neither cash nor sales account found — skipping tenant')
      continue
    }

    // ─── ★★★ v3: fetch accountMap (مثل داشبورد) ───
    const accountsList = await db.client.account.findMany({
      where: { tenantId },
      select: { id: true, code: true, name: true, type: true },
    })
    const accountMap = new Map<string, { id: string; code: string; name: string; type: string }>()
    for (const a of accountsList) {
      accountMap.set(a.id, {
        id: a.id,
        code: a.code || '',
        name: (a.name as string) || '',
        type: ((a.type as string) || '').toLowerCase(),
      })
    }
    console.log(`  Loaded ${accountMap.size} accounts into accountMap`)

    // ─── کوئری JE Lines (بدون include: account) ───
    let jeLines: any[] = []
    try {
      jeLines = await db.client.journalEntryLine.findMany({
        where: { journalEntry: { tenantId } },
        include: {
          journalEntry: {
            select: {
              id: true, number: true, sourceType: true,
              isCancelled: true, totalDebit: true, totalCredit: true,
            },
          },
          // ★★★ حذف include: { account } — این relation در schema شما وجود ندارد
          // فقط accountId را می‌گیریم و خودمون از accountMap پیدا می‌کنیم
        },
        orderBy: { journalEntry: { number: 'asc' } },
      })
    } catch (err: any) {
      console.error(`  ❌ JE Lines query failed: ${err?.message}`)
      totalErrors++
      continue
    }

    console.log(`  Found ${jeLines.length} JE Lines for tenant`)

    // ─── تحلیل هر خط و تعیین fix مورد نیاز ───
    const fixes: Array<{
      lineId: string
      jeNumber: string
      sourceType: string
      currentAccount: { code: string; name: string; type: string } | null
      correctAccount: { id: string; code: string; name: string }
      reason: string
      debit: number
      credit: number
    }> = []

    for (const line of jeLines) {
      const je = line.journalEntry
      if (!je) continue
      if (je.isCancelled) continue

      // ★★★ v3: lookup از accountMap
      const currentAcc = line.accountId ? accountMap.get(line.accountId) : null
      const currentAccCode = currentAcc?.code || ''
      const currentAccType = currentAcc?.type || ''
      const isLineUnknown = !currentAcc
      const debit = Number(line.debit) || 0
      const credit = Number(line.credit) || 0
      const sourceType = je.sourceType || ''

      let fixTarget: { id: string; code: string; name: string } | null = null
      let reason = ''

      if (sourceType === 'invoice') {
        // خط debit (cash/receivable)
        if (debit > 0 && credit === 0) {
          if (isLineUnknown || currentAccCode === '2100' || currentAccType === 'liability') {
            fixTarget = correctAccounts.cash || correctAccounts.receivable
            reason = isLineUnknown
              ? `خط debit در فاکتور فروش — accountId نامعتبر (unknown) — باید cash یا receivable باشد`
              : `خط debit در فاکتور فروش — به ${currentAccCode} (${currentAcc?.name}) رفته — باید cash یا receivable باشد`
          }
        }
        // خط credit (sales)
        else if (credit > 0 && debit === 0) {
          if (isLineUnknown || currentAccCode === '4200' || currentAccCode === '4000') {
            fixTarget = correctAccounts.sales
            reason = isLineUnknown
              ? `خط credit در فاکتور فروش — accountId نامعتبر (unknown) — باید sales (4100) باشد`
              : `خط credit در فاکتور فروش — به ${currentAccCode} (${currentAcc?.name}) رفته — باید 4100 (فروش کالا) باشد`
          }
        }
      } else if (sourceType === 'purchase_invoice') {
        // خط credit (cash/payable)
        if (credit > 0 && debit === 0) {
          if (isLineUnknown || currentAccCode === '2100' || currentAccType === 'liability') {
            fixTarget = correctAccounts.payable || correctAccounts.cash
            reason = isLineUnknown
              ? `خط credit در فاکتور خرید — accountId نامعتبر (unknown) — باید payable یا cash باشد`
              : `خط credit در فاکتور خرید — به ${currentAccCode} (${currentAcc?.name}) رفته — باید payable (2000) یا cash (1010) باشد`
          }
        }
      }

      if (fixTarget) {
        fixes.push({
          lineId: line.id,
          jeNumber: je.number || '?',
          sourceType,
          currentAccount: currentAcc
            ? { code: currentAcc.code, name: currentAcc.name, type: currentAcc.type }
            : null,
          correctAccount: fixTarget,
          reason,
          debit,
          credit,
        })
      } else {
        totalSkipped++
      }
    }

    if (fixes.length === 0) {
      console.log('  ✓ No fixes needed for this tenant')
      continue
    }

    console.log(`\n  ⚠️ Found ${fixes.length} line(s) needing fix:`)
    for (const f of fixes) {
      console.log(`    [${f.jeNumber}] ${f.sourceType}`)
      console.log(`      Current: ${f.currentAccount ? `${f.currentAccount.code} (${f.currentAccount.name})` : 'NULL/unknown'} — debit:${f.debit}, credit:${f.credit}`)
      console.log(`      Fix →:   ${f.correctAccount.code} (${f.correctAccount.name})`)
      console.log(`      Reason:  ${f.reason}`)
    }

    if (DRY_RUN) {
      console.log(`\n  🔍 DRY RUN — skipping UPDATE. Set DRY_RUN=0 to apply.`)
      totalSkipped += fixes.length
      continue
    }

    // ─── اعمال fixes ───
    console.log(`\n  ⚡ Applying ${fixes.length} fix(es)...`)
    for (const f of fixes) {
      try {
        await db.client.journalEntryLine.update({
          where: { id: f.lineId },
          data: { accountId: f.correctAccount.id },
        })
        console.log(`    ✓ [${f.jeNumber}] Updated line ${f.lineId.substring(0, 8)}... → ${f.correctAccount.code} (${f.correctAccount.name})`)
        totalFixed++
      } catch (err: any) {
        console.error(`    ✗ [${f.jeNumber}] Failed: ${err?.message}`)
        totalErrors++
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  Total fixed:   ${totalFixed}`)
  console.log(`  Total skipped: ${totalSkipped}`)
  console.log(`  Total errors:  ${totalErrors}`)
  console.log('═══════════════════════════════════════════════════════════════')

  if (DRY_RUN) {
    console.log('\n  🔍 DRY RUN mode — no changes were made.')
    console.log('  To apply fixes, run with DRY_RUN=0:')
    console.log('    DRY_RUN=0 npx tsx scripts/fix-jes-wrong-accounts.ts')
  } else {
    console.log('\n  ✅ Fixes applied. Please refresh the dashboard to verify.')
  }

  await db.$disconnect?.()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
