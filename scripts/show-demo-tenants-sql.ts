// ============================================================================
// scripts/show-demo-tenants-sql.ts — List all demo tenants (v9.2.3 ★★★)
// ----------------------------------------------------------------------------
// این نسخه از SQL مستقیم استفاده می‌کند (بدون Prisma) و با ES modules سازگار است.
//
// ★ نحوه اجرا:
//   npx ts-node scripts/show-demo-tenants-sql.ts
// ============================================================================

import sql from 'mssql'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// ─── ES module helper برای __dirname ──────────────────────────────
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─── خواندن DATABASE_URL از فایل .env ─────────────────────────────
function loadEnv(): void {
  try {
    // ★ پوشه ریشه پروژه (دو سطح بالاتر از scripts/)
    const projectRoot = path.resolve(__dirname, '..')
    const envPath = path.join(projectRoot, '.env')

    console.log(`🔍 Looking for .env at: ${envPath}`)

    if (!fs.existsSync(envPath)) {
      console.warn(`⚠ .env file not found at: ${envPath}`)
      // ★ fallback: جستجو در مسیر فعلی
      const altPath = path.join(process.cwd(), '.env')
      if (fs.existsSync(altPath)) {
        console.log(`✓ Found .env at: ${altPath}`)
        return parseEnvFile(altPath)
      }
      return
    }

    parseEnvFile(envPath)
  } catch (err) {
    console.warn('⚠ Could not load .env file:', err)
  }
}

function parseEnvFile(envPath: string): void {
  const content = fs.readFileSync(envPath, 'utf-8')
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.substring(0, eqIndex).trim()
    let value = trimmed.substring(eqIndex + 1).trim()
    // ★ حذف کوتیشن‌ها
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1)
    }
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

loadEnv()

// ─── پارس کردن DATABASE_URL ───────────────────────────────────────
// ★★★ v9.2.4: پارسر بازنویسی شد تا با SQL Server connection string سازگار باشد
//
// فرمت SQL Server:
//   sqlserver://localhost:1433;database=ShopAccounting;user=sa;password=As@1180;trustServerCertificate=true
//
// ★ نکته: در این فرمت، @ ممکن است در پسورد باشد، پس نباید از @ برای تشخیص استفاده کنیم
function parseConnectionString(connStr: string): sql.config {
  let host = 'localhost'
  let port = 1433
  let database = ''
  let user = 'sa'
  let password = ''
  let trustServerCertificate = true

  try {
    // ★ حذف prefix
    let conn = connStr.trim()
    if (conn.startsWith('sqlserver://')) {
      conn = conn.substring('sqlserver://'.length)
    }

    // ★ جدا کردن host:port از بقیه با اولین ; یا /
    let hostPortPart = ''
    let queryParamsPart = ''

    // ★ پیدا کردن اولین جداکننده (مهم: اولین رخداد، نه آخرین)
    let separatorIndex = -1
    for (let i = 0; i < conn.length; i++) {
      if (conn[i] === ';' || conn[i] === '/' || conn[i] === '?') {
        separatorIndex = i
        break
      }
    }

    if (separatorIndex !== -1) {
      hostPortPart = conn.substring(0, separatorIndex)
      queryParamsPart = conn.substring(separatorIndex + 1)
    } else {
      hostPortPart = conn
    }

    // ★ پارس کردن host:port
    if (hostPortPart.includes(':')) {
      const colonIndex = hostPortPart.indexOf(':')
      host = hostPortPart.substring(0, colonIndex)
      port = parseInt(hostPortPart.substring(colonIndex + 1), 10) || 1433
    } else {
      host = hostPortPart || 'localhost'
    }

    // ★ اگر queryParamsPart با / شروع شده (مثلاً /database)، database name است
    if (queryParamsPart.startsWith('/')) {
      // ★ فرمت: /databaseName;param1=value1;...
      const nextSep = queryParamsPart.indexOf(';')
      if (nextSep === -1) {
        database = queryParamsPart.substring(1)
        queryParamsPart = ''
      } else {
        database = queryParamsPart.substring(1, nextSep)
        queryParamsPart = queryParamsPart.substring(nextSep + 1)
      }
    }

    // ★ پارس کردن query params (مثلاً database=...;user=...;password=...)
    if (queryParamsPart) {
      const params = queryParamsPart.split(';')
      for (const param of params) {
        if (!param.trim()) continue
        const eqIndex = param.indexOf('=')
        if (eqIndex === -1) continue
        const key = param.substring(0, eqIndex).trim().toLowerCase()
        const value = param.substring(eqIndex + 1).trim()

        if (key === 'database' || key === 'dbname' || key === 'db') {
          database = value
        } else if (key === 'user' || key === 'username' || key === 'uid') {
          user = value
        } else if (key === 'password' || key === 'pwd') {
          password = value
        } else if (key === 'server' || key === 'host' || key === 'datasource') {
          host = value
        } else if (key === 'port') {
          port = parseInt(value, 10) || 1433
        } else if (key === 'trustservercertificate') {
          trustServerCertificate = value.toLowerCase() === 'true'
        }
      }
    }
  } catch (err) {
    console.error('❌ Error parsing connection string:', err)
  }

  return {
    server: host,
    port: port,
    database: database,
    user: user,
    password: password,
    options: { trustServerCertificate, enableArithAbort: true },
  }
}

async function main(): Promise<void> {
  const connStr = process.env.DATABASE_URL || process.env.MASTER_DATABASE_URL || ''

  if (!connStr) {
    console.error('❌ DATABASE_URL در فایل .env تنظیم نشده است!')
    console.error('   لطفاً مطمئن شوید فایل .env در ریشه پروژه exists دارد و شامل DATABASE_URL است.')
    process.exit(1)
  }

  console.log('\n📋 لیست تمام tenant های دمو:\n')
  console.log('═'.repeat(100))

  const config = parseConnectionString(connStr)
  console.log(`\n🔌 اتصال به: ${config.server}:${config.port}/${config.database} (user: ${config.user})\n`)

  let pool: sql.ConnectionPool | null = null

  try {
    pool = await sql.connect(config)
    console.log('✓ متصل به دیتابیس\n')

    // ★ کوئری: پیدا کردن تمام tenant های دمو + کاربران Admin آنها
    const result = await pool.request().query(`
      SELECT 
        t.id,
        t.subDomain,
        t.companyName,
        t.ownerMobile,
        t.status,
        t.expiresAt,
        t.createdAt,
        t.planName,
        pt.nameFa AS planTierNameFa,
        u.username AS adminUsername,
        u.mobile AS adminMobile,
        u.role AS adminRole,
        u.isActive AS adminIsActive
      FROM Tenants t
      LEFT JOIN StoreUsers u ON u.tenantId = t.id AND u.role = 'Admin'
      LEFT JOIN PlanTiers pt ON pt.id = t.planTierId
      WHERE t.status IN ('demo', 'demo_pending')
      ORDER BY t.createdAt DESC
    `)

    if (result.recordset.length === 0) {
      console.log('\n❌ هیچ tenant دمویی یافت نشد.\n')
      return
    }

    console.log(`\n✓ تعداد tenant های دمو: ${result.recordset.length}\n`)

    const now = new Date()

    for (let i = 0; i < result.recordset.length; i++) {
      const t = result.recordset[i]
      const expiresAt = t.expiresAt ? new Date(t.expiresAt) : null
      const isExpired = expiresAt ? expiresAt < now : false
      const daysRemaining = expiresAt
        ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : -1
      const createdAt = t.createdAt ? new Date(t.createdAt) : null

      console.log(`\n${i + 1}. ${t.companyName || '(بدون نام)'}`)
      console.log(`   📱 موبایل:     ${t.ownerMobile || '—'}`)
      console.log(`   🌐 زیردامنه:   ${t.subDomain}`)
      console.log(`   📍 URL ورود:   http://localhost:3000/${t.subDomain}/login`)
      console.log(`   📊 وضعیت:      ${t.status} ${isExpired ? '(منقضی شده)' : '(فعال)'}`)
      if (expiresAt) {
        console.log(`   ⏰ انقضا:      ${expiresAt.toISOString()}`)
        console.log(`   ⏳ روز باقی:   ${isExpired ? 0 : daysRemaining} روز`)
      }
      if (createdAt) {
        console.log(`   📅 ایجاد:      ${createdAt.toISOString()}`)
      }
      if (t.planTierNameFa) {
        console.log(`   🎯 پلن:        ${t.planTierNameFa}`)
      }

      // ★ نمایش کاربر Admin
      if (t.adminUsername) {
        console.log(`   👥 نام کاربری: ${t.adminUsername}`)
        console.log(`      نقش: ${t.adminRole} | فعال: ${t.adminIsActive ? 'بله' : 'خیر'}`)
      } else {
        console.log(`   👥 کاربران:    هیچ کاربر Admin یافت نشد`)
      }

      console.log(`   ${'─'.repeat(80)}`)
    }

    console.log('\n💡 برای بازنشانی رمز عبور یک tenant دمو:')
    console.log('   npx ts-node scripts/reset-demo-password-sql.ts <username-or-mobile> <new-password>')
    console.log('\nمثال:')
    console.log('   npx ts-node scripts/reset-demo-password-sql.ts demo_5678_abcd myNewPass123')
    console.log('   npx ts-node scripts/reset-demo-password-sql.ts 09377498180 myNewPass123\n')

  } catch (error: any) {
    console.error('\n❌ خطا در اتصال یا کوئری:')
    console.error('  Message:', error.message)
    if (error.code) console.error('  Code:', error.code)
    process.exit(1)
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}

main()
  .catch((error) => {
    console.error('❌ خطای غیرمنتظره:', error)
    process.exit(1)
  })
