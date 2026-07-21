// ============================================================================
// scripts/reset-demo-password-sql.ts — Reset demo password (v9.2.2 ★★★)
// ----------------------------------------------------------------------------
// این نسخه از SQL مستقیم + bcryptjs استفاده می‌کند (بدون Prisma).
//
// ★ نحوه اجرا:
//   npx ts-node scripts/reset-demo-password-sql.ts <username-or-mobile> <new-password>
// ============================================================================

import sql from 'mssql'
import bcrypt from 'bcryptjs'

// ─── خواندن DATABASE_URL از فایل .env ─────────────────────────────
function loadEnv() {
  try {
    const fs = require('fs')
    const path = require('path')
    const envPath = path.join(process.cwd(), '.env')
    if (fs.existsSync(envPath)) {
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
  } catch (err) {
    console.warn('⚠ Could not load .env file:', err)
  }
}

loadEnv()

// ─── پارس کردن DATABASE_URL ───────────────────────────────────────
function parseConnectionString(connStr: string): sql.config {
  let host = 'localhost'
  let port = 1433
  let database = ''
  let user = 'sa'
  let password = ''
  let trustServerCertificate = true

  try {
    let conn = connStr.replace(/^sqlserver:\/\//, '')
    let authPart = ''
    let restPart = ''
    
    if (conn.includes('@')) {
      const atIndex = conn.lastIndexOf('@')
      authPart = conn.substring(0, atIndex)
      restPart = conn.substring(atIndex + 1)
      if (authPart.includes(':')) {
        const colonIndex = authPart.indexOf(':')
        user = decodeURIComponent(authPart.substring(0, colonIndex))
        password = decodeURIComponent(authPart.substring(colonIndex + 1))
      } else {
        user = decodeURIComponent(authPart)
      }
    } else {
      restPart = conn
    }
    
    let hostPortPart = restPart
    let queryParamsPart = ''
    const semicolonIndex = restPart.indexOf(';')
    const slashIndex = restPart.indexOf('/')
    let separatorIndex = -1
    if (semicolonIndex !== -1 && slashIndex !== -1) {
      separatorIndex = Math.min(semicolonIndex, slashIndex)
    } else if (semicolonIndex !== -1) {
      separatorIndex = semicolonIndex
    } else if (slashIndex !== -1) {
      separatorIndex = slashIndex
    }
    
    if (separatorIndex !== -1) {
      hostPortPart = restPart.substring(0, separatorIndex)
      queryParamsPart = restPart.substring(separatorIndex + 1)
    }
    
    if (hostPortPart.includes(':')) {
      const colonIndex = hostPortPart.lastIndexOf(':')
      host = hostPortPart.substring(0, colonIndex)
      port = parseInt(hostPortPart.substring(colonIndex + 1), 10) || 1433
    } else {
      host = hostPortPart || 'localhost'
    }
    
    if (queryParamsPart) {
      if (queryParamsPart.startsWith('/') && !queryParamsPart.includes('=')) {
        database = queryParamsPart.substring(1).split(';')[0].split('?')[0]
        const rest = queryParamsPart.substring(database.length + 1)
        queryParamsPart = rest.startsWith(';') ? rest.substring(1) : ''
      }
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

async function main() {
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
