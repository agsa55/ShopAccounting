// ============================================================================
// scripts/cleanup-all-tenants-sql.ts (v9.5.0 ★★★)
// ShopAccounting — Delete ALL tenants except active demos
// ----------------------------------------------------------------------------
// ★★★ این اسکریپت تمام tenant ها را حذف می‌کند به‌جز:
//   - tenant های demo فعال (status='demo' و هنوز منقضی نشده)
//
// ★★★ این عملیات غیرقابل بازگشت است!
//   تمام داده‌های tenant های حذف‌شده (محصولات، فاکتورها، اسناد، کاربران) حذف می‌شوند.
//
// ★ نحوه اجرا:
//   npx ts-node scripts/cleanup-all-tenants-sql.ts
//
// ★ برای تأیید، ابتدا یک DryRun انجام کنید:
//   npx ts-node scripts/cleanup-all-tenants-sql.ts --dry-run
// ============================================================================

import sql from 'mssql'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─── خواندن .env ──────────────────────────────────────────────────
function loadEnv(): void {
  const projectRoot = path.resolve(__dirname, '..')
  const envPath = path.join(projectRoot, '.env')
  if (fs.existsSync(envPath)) {
    parseEnvFile(envPath)
  } else {
    const altPath = path.join(process.cwd(), '.env')
    if (fs.existsSync(altPath)) parseEnvFile(altPath)
  }
}

function parseEnvFile(envPath: string): void {
  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.substring(0, eqIndex).trim()
    let value = trimmed.substring(eqIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnv()

// ─── پارس DATABASE_URL ────────────────────────────────────────────
function parseConnectionString(connStr: string): sql.config {
  let host = 'localhost', port = 1433, database = '', user = 'sa', password = '', trustServerCertificate = true
  try {
    let conn = connStr.trim()
    if (conn.startsWith('sqlserver://')) conn = conn.substring('sqlserver://'.length)

    let hostPortPart = '', queryParamsPart = ''
    let separatorIndex = -1
    for (let i = 0; i < conn.length; i++) {
      if (conn[i] === ';' || conn[i] === '/' || conn[i] === '?') { separatorIndex = i; break }
    }
    if (separatorIndex !== -1) {
      hostPortPart = conn.substring(0, separatorIndex)
      queryParamsPart = conn.substring(separatorIndex + 1)
    } else { hostPortPart = conn }

    if (hostPortPart.includes(':')) {
      const ci = hostPortPart.indexOf(':')
      host = hostPortPart.substring(0, ci)
      port = parseInt(hostPortPart.substring(ci + 1), 10) || 1433
    } else { host = hostPortPart || 'localhost' }

    if (queryParamsPart.startsWith('/')) {
      const ns = queryParamsPart.indexOf(';')
      if (ns === -1) { database = queryParamsPart.substring(1); queryParamsPart = '' }
      else { database = queryParamsPart.substring(1, ns); queryParamsPart = queryParamsPart.substring(ns + 1) }
    }

    if (queryParamsPart) {
      for (const param of queryParamsPart.split(';')) {
        if (!param.trim()) continue
        const ei = param.indexOf('=')
        if (ei === -1) continue
        const key = param.substring(0, ei).trim().toLowerCase()
        const value = param.substring(ei + 1).trim()
        if (key === 'database' || key === 'db') database = value
        else if (key === 'user' || key === 'uid') user = value
        else if (key === 'password' || key === 'pwd') password = value
        else if (key === 'server' || key === 'host') host = value
        else if (key === 'port') port = parseInt(value, 10) || 1433
        else if (key === 'trustservercertificate') trustServerCertificate = value.toLowerCase() === 'true'
      }
    }
  } catch (err) { console.error('❌ Error parsing connection string:', err) }

  return { server: host, port, database, user, password, options: { trustServerCertificate, enableArithAbort: true } }
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run')

  const connStr = process.env.DATABASE_URL || process.env.MASTER_DATABASE_URL || ''
  if (!connStr) { console.error('❌ DATABASE_URL تنظیم نشده!'); process.exit(1) }

  console.log('\n🧹 پاکسازی تمام tenant ها (به‌جز دموهای فعال)')
  console.log('═'.repeat(80))

  if (isDryRun) {
    console.log('⚠️  حالت DryRun — فقط نمایش، بدون حذف\n')
  }

  const config = parseConnectionString(connStr)
  let pool: sql.ConnectionPool | null = null

  try {
    pool = await sql.connect(config)
    console.log(`✓ متصل به: ${config.server}:${config.port}/${config.database}\n`)

    // ★ ۱. پیدا کردن tenant های دمو فعال که نگه داشته می‌شوند
    const keepResult = await pool.request().query(`
      SELECT id, subDomain, companyName, status, expiresAt
      FROM Tenants
      WHERE status = 'demo' AND (expiresAt IS NULL OR expiresAt > GETUTCDATE())
      ORDER BY createdAt DESC
    `)

    console.log(`📌 Tenant هایی که نگه داشته می‌شوند (دموی فعال): ${keepResult.recordset.length}`)
    for (const t of keepResult.recordset) {
      console.log(`   ✓ ${t.subDomain} — ${t.companyName} (status: ${t.status})`)
    }
    console.log('')

    // ★ ۲. پیدا کردن tenant هایی که حذف می‌شوند
    const deleteResult = await pool.request().query(`
      SELECT id, subDomain, companyName, status, planName, createdAt
      FROM Tenants
      WHERE NOT (status = 'demo' AND (expiresAt IS NULL OR expiresAt > GETUTCDATE()))
      ORDER BY createdAt DESC
    `)

    console.log(`🗑️  Tenant هایی که حذف می‌شوند: ${deleteResult.recordset.length}`)
    for (const t of deleteResult.recordset) {
      console.log(`   ✗ ${t.subDomain} — ${t.companyName} (status: ${t.status}, plan: ${t.planName})`)
    }
    console.log('')

    if (deleteResult.recordset.length === 0) {
      console.log('✅ هیچ tenant ای برای حذف نیست.')
      return
    }

    if (isDryRun) {
      console.log('⚠️  DryRun — هیچ حذفی انجام نشد.')
      return
    }

    // ★ ۳. تأیید نهایی
    console.log('⚠️  هشدار: این عملیات غیرقابل بازگشت است!')
    console.log('   تمام داده‌های tenant های فوق حذف خواهد شد.')
    console.log('   برای تأیید، در محیط non-interactive، --force اضافه کنید.\n')

    if (!process.argv.includes('--force')) {
      console.log('❌ برای اجرای واقعی، از --force استفاده کنید:')
      console.log('   npx ts-node scripts/cleanup-all-tenants-sql.ts --force')
      return
    }

    // ★ ۴. حذف tenant ها
    console.log('🔄 شروع حذف...\n')

    const tablesToClean = [
      'SubscriptionPayments', 'Subscriptions', 'UserLookups', 'StoreUsers',
      'OtpCodes', 'FiscalYears', 'JournalEntries', 'Accounts',
      'Invoices', 'InvoiceItems', 'InvoicePayments', 'InstallmentPlans', 'InstallmentSchedules',
      'PurchaseInvoices', 'PurchaseInvoiceItems',
      'StockMovements', 'StockLevels', 'StockCounts', 'Warehouses',
      'Products', 'Categories', 'Units',
      'Customers', 'Suppliers',
      'StoreSettings', 'PaymentGateways', 'PosDevices', 'SmsSettings', 'SmsLogs', 'MoidianSettings',
      'Branches', 'Checks', 'FixedAssets', 'InitialBalances',
      'Tickets', 'TicketMessages',
      'OnlinePayments', 'CardPayments',
      'AuditLogs', 'Backups',
    ]

    let totalRecordsDeleted = 0
    let tenantsDeleted = 0

    for (const t of deleteResult.recordset) {
      const tenantId = t.id
      let tenantRecords = 0

      console.log(`🗑️  حذف: ${t.subDomain} — ${t.companyName}`)

      for (const table of tablesToClean) {
        try {
          const r = await pool.request()
            .input('tenantId', sql.NVarChar(1000), tenantId)
            .query(`DELETE FROM ${table} WHERE tenantId = @tenantId`)
          if (r.rowsAffected[0] > 0) {
            tenantRecords += r.rowsAffected[0]
          }
        } catch (err: any) {
          // جدول ممکن است وجود نداشته باشد
        }
      }

      // حذف خود Tenant
      try {
        await pool.request()
          .input('tenantId', sql.NVarChar(1000), tenantId)
          .query('DELETE FROM Tenants WHERE id = @tenantId')
        tenantRecords += 1
        tenantsDeleted++
      } catch (err: any) {
        console.error(`   ❌ خطا در حذف tenant: ${err.message}`)
      }

      totalRecordsDeleted += tenantRecords
      console.log(`   ✓ ${tenantRecords} رکورد حذف شد`)
    }

    console.log('\n' + '═'.repeat(80))
    console.log(`✅ پاکسازی کامل شد!`)
    console.log(`   • Tenant های حذف شده: ${tenantsDeleted}`)
    console.log(`   • مجموع رکوردهای حذف شده: ${totalRecordsDeleted}`)
    console.log(`   • Tenant های نگه‌داشته شده: ${keepResult.recordset.length}`)
    console.log('═'.repeat(80) + '\n')

  } catch (error: any) {
    console.error('❌ خطا:', error.message)
    process.exit(1)
  } finally {
    if (pool) await pool.close()
  }
}

main()
