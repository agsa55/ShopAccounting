// ============================================================================
// scripts/reset-demo-password-sql.ts — Reset demo password (v9.2.3 ★★★)
// ----------------------------------------------------------------------------
// این نسخه از SQL مستقیم + bcryptjs استفاده می‌کند (بدون Prisma) و با ES modules سازگار است.
//
// ★ نحوه اجرا:
//   npx ts-node scripts/reset-demo-password-sql.ts <username-or-mobile> <new-password>
// ============================================================================

import sql from 'mssql'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// ─── ES module helper برای __dirname ──────────────────────────────
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ─── خواندن DATABASE_URL از فایل .env ─────────────────────────────
function loadEnv(): void {
  try {
    const projectRoot = path.resolve(__dirname, '..')
    const envPath = path.join(projectRoot, '.env')

    if (!fs.existsSync(envPath)) {
      const altPath = path.join(process.cwd(), '.env')
      if (fs.existsSync(altPath)) {
        parseEnvFile(altPath)
        return
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
function parseConnectionString(connStr: string): sql.config {
  let host = 'localhost'
  let port = 1433
  let database = ''
  let user = 'sa'
  let password = ''
  let trustServerCertificate = true

  try {
    let conn = connStr.trim()
    if (conn.startsWith('sqlserver://')) {
      conn = conn.substring('sqlserver://'.length)
    }

    let hostPortPart = ''
    let queryParamsPart = ''

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

    if (hostPortPart.includes(':')) {
      const colonIndex = hostPortPart.indexOf(':')
      host = hostPortPart.substring(0, colonIndex)
      port = parseInt(hostPortPart.substring(colonIndex + 1), 10) || 1433
    } else {
      host = hostPortPart || 'localhost'
    }

    if (queryParamsPart.startsWith('/')) {
      const nextSep = queryParamsPart.indexOf(';')
      if (nextSep === -1) {
        database = queryParamsPart.substring(1)
        queryParamsPart = ''
      } else {
        database = queryParamsPart.substring(1, nextSep)
        queryParamsPart = queryParamsPart.substring(nextSep + 1)
      }
    }

    if (queryParamsPart) {
      const params = queryParamsPart.split(';')
      for (const param of params) {
        if (!param.trim()) continue
        const eqIndex = param.indexOf('=')
        if (eqIndex === -1) continue
        const key = param.substring(0, eqIndex).trim().toLowerCase()
        const value = param.substring(eqIndex + 1).trim()

        if (key === 'database' || key === 'dbname' || key === 'db') database = value
        else if (key === 'user' || key === 'username' || key === 'uid') user = value
        else if (key === 'password' || key === 'pwd') password = value
        else if (key === 'server' || key === 'host' || key === 'datasource') host = value
        else if (key === 'port') port = parseInt(value, 10) || 1433
        else if (key === 'trustservercertificate') trustServerCertificate = value.toLowerCase() === 'true'
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
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.log('\n❌ استفاده نادرست!')
    console.log('\n✓ نحوه استفاده:')
    console.log('   npx ts-node scripts/reset-demo-password-sql.ts <username-or-mobile> <new-password>')
    console.log('\nمثال:')
    console.log('   npx ts-node scripts/reset-demo-password-sql.ts demo_5678_abcd myNewPass123')
    console.log('   npx ts-node scripts/reset-demo-password-sql.ts 09377498180 myNewPass123\n')
    process.exit(1)
  }

  const identifier = args[0]
  const newPassword = args[1]

  if (newPassword.length < 4) {
    console.log('\n❌ رمز عبور باید حداقل ۴ کاراکتر باشد.\n')
    process.exit(1)
  }

  const connStr = process.env.DATABASE_URL || process.env.MASTER_DATABASE_URL || ''
  if (!connStr) {
    console.error('❌ DATABASE_URL در فایل .env تنظیم نشده است!')
    process.exit(1)
  }

  console.log(`\n🔄 جستجوی tenant دمو با شناسه: ${identifier}\n`)

  const config = parseConnectionString(connStr)
  let pool: sql.ConnectionPool | null = null

  try {
    pool = await sql.connect(config)
    console.log('✓ متصل به دیتابیس\n')

    // ★ جستجوی کاربر با username یا mobile + tenant دمو
    const result = await pool.request()
      .input('identifier', sql.NVarChar, identifier)
      .query(`
        SELECT 
          u.id AS userId,
          u.username,
          u.mobile,
          u.role,
          u.isActive,
          t.id AS tenantId,
          t.subDomain,
          t.companyName,
          t.status AS tenantStatus,
          t.ownerMobile,
          t.expiresAt
        FROM StoreUsers u
        INNER JOIN Tenants t ON t.id = u.tenantId
        WHERE (u.username = @identifier OR u.mobile = @identifier)
          AND t.status IN ('demo', 'demo_pending')
      `)

    if (result.recordset.length === 0) {
      console.log(`❌ کاربری با شناسه "${identifier}" در tenant های دمو یافت نشد.`)
      console.log(`\n💡 برای دیدن لیست دموها:`)
      console.log(`   npx ts-node scripts/show-demo-tenants-sql.ts\n`)
      process.exit(1)
    }

    const row = result.recordset[0]

    console.log(`✓ کاربر یافت شد:`)
    console.log(`   👤 نام کاربری:  ${row.username}`)
    console.log(`   📱 موبایل:      ${row.mobile || '—'}`)
    console.log(`   🏪 فروشگاه:    ${row.companyName || '—'}`)
    console.log(`   🌐 زیردامنه:   ${row.subDomain || '—'}`)
    console.log(`   📊 وضعیت tenant: ${row.tenantStatus || '—'}`)

    if (row.tenantStatus !== 'demo' && row.tenantStatus !== 'demo_pending') {
      console.log(`\n❌ این کاربر به tenant دمو متصل نیست (وضعیت: ${row.tenantStatus}).`)
      process.exit(1)
    }

    // ★ هش کردن رمز عبور جدید
    console.log(`\n🔄 هش کردن رمز عبور جدید...`)
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // ★ به‌روزرسانی رمز عبور
    await pool.request()
      .input('userId', sql.NVarChar(450), row.userId)
      .input('password', sql.NVarChar(sql.MAX), hashedPassword)
      .query(`
        UPDATE StoreUsers
        SET password = @password
        WHERE id = @userId
      `)

    console.log(`\n✅ رمز عبور با موفقیت بازنشانی شد!\n`)
    console.log('═'.repeat(80))
    console.log('\n📋 اطلاعات ورود به دمو:\n')
    console.log(`   🌐 URL ورود:    http://localhost:3000/${row.subDomain}/login`)
    console.log(`   👤 نام کاربری:  ${row.username}`)
    console.log(`   🔒 رمز عبور:    ${newPassword}`)
    console.log(`   📱 موبایل:      ${row.mobile || row.ownerMobile || '—'}`)

    if (row.expiresAt) {
      const expiresAt = new Date(row.expiresAt)
      const now = new Date()
      const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      console.log(`   ⏰ انقضا:      ${expiresAt.toISOString()}`)
      console.log(`   ⏳ روز باقی:   ${daysRemaining} روز`)
    }
    console.log('\n' + '═'.repeat(80))
    console.log('\n💡 برای ورود:')
    console.log(`   1. به آدرس بالا بروید`)
    console.log(`   2. نام کاربری و رمز عبور بالا را وارد کنید\n`)

  } catch (error: any) {
    console.error('\n❌ خطا:', error.message)
    if (error.code) console.error('  Code:', error.code)
    process.exit(1)
  } finally {
    if (pool) await pool.close()
  }
}

main()
  .catch((error) => {
    console.error('❌ خطای غیرمنتظره:', error)
    process.exit(1)
  })
