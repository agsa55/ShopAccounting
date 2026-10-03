// ============================================================================
// src/lib/admin/backup-service.ts
// سرویس پشتیبان‌گیری برای پنل ادمین
// ★ نسخه Prisma با نام‌های صحیح جداول (PascalCase)
// ============================================================================

import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════
export interface BackupRecord {
  id: string
  type: 'tenant' | 'full_database'
  tenant_id: string | null
  tenant_name: string | null
  file_name: string
  file_size: number
  record_count: number
  created_by: string
  created_at: string
}

export interface BackupCreateResult {
  id: string
  fileName: string
  fileSize: number
  recordCount: number
  duration: number
}

// ═══════════════════════════════════════════════════════════
// ★ نام‌های صحیح جداول (مطابق با Prisma schema)
// در PostgreSQL با Prisma، نام‌ها PascalCase و quoted هستند
// ═══════════════════════════════════════════════════════════
const TENANT_TABLES = [
  'Products',
  'Customers',
  'Suppliers',
  'Warehouses',
  'InvoiceItems',
  'Invoices',
  'PurchaseInvoices',
  'PurchaseInvoiceItems',
  'InvoicePayments',
  'OnlinePayments',
  'CardPayments',
  'Checks',
  'Accounts',
  'JournalEntries',
  'JournalEntryLines',
  'ProductCategories',
  'StoreUsers',
  'StoreSettings',
  'StockLevels',
  'StockMovements',
  'StockCounts',
  'StockCountItems',
  'CashMovements',
  'CashShifts',
  'Branches',
  'Units',
  'FixedAssets',
  'InitialBalances',
  'InstallmentPlans',
  'InstallmentSchedules',
  'RecurringJournals',
  'CustomReports',
  'PortalUsers',
  'PosDevices',
  'FiscalYears',
]

const SYSTEM_TABLES = [
  'Tenants',
  'Plans',
  'PlanTiers',
  'PlanPrices',
  'Subscriptions',
  'SubscriptionPayments',
  'AdminUsers',
  'AuditLogs',
  'SystemLogs',
  'SmsLogs',
  'SmsSettings',
  'MoidianSettings',
  'PaymentGateways',
  'Tickets',
  'TicketMessages',
  'OtpCodes',
  'IdentityRegistry',
  'UserLookups',
  'Backups',
]

// ═══════════════════════════════════════════════════════════
// دریافت لیست جداول موجود (در schema public)
// ═══════════════════════════════════════════════════════════
async function getExistingTables(): Promise<Set<string>> {
  const result = await db.client.$queryRawUnsafe<Array<{ table_name: string }>>(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
  `)
  return new Set(result.map((r) => r.table_name))
}

// ═══════════════════════════════════════════════════════════
// بررسی وجود ستون tenantId در جدول
// (Prisma از tenantId استفاده می‌کند نه tenant_id)
// ═══════════════════════════════════════════════════════════
async function hasTenantIdColumn(tableName: string): Promise<boolean> {
  const result = await db.client.$queryRawUnsafe<Array<{ column_name: string }>>(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = $1 
      AND column_name IN ('tenantId', 'tenant_id')
  `, tableName)
  return result.length > 0
}

// ═══════════════════════════════════════════════════════════
// دریافت نام ستون tenant (tenantId یا tenant_id)
// ═══════════════════════════════════════════════════════════
async function getTenantColumnName(tableName: string): Promise<string | null> {
  const result = await db.client.$queryRawUnsafe<Array<{ column_name: string }>>(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = $1 
      AND column_name IN ('tenantId', 'tenant_id')
  `, tableName)
  return result.length > 0 ? result[0].column_name : null
}

// ═══════════════════════════════════════════════════════════
// لیست بکاپ‌ها (بدون data)
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// لیست بکاپ‌ها (بدون data) — نسخه اصلاح‌شده برای BigInt
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// لیست بکاپ‌ها (بدون data) — نسخه اصلاح‌شده برای UUID
// ═══════════════════════════════════════════════════════════
export async function listBackups(): Promise<BackupRecord[]> {
  const result = await db.client.$queryRawUnsafe<any[]>(`
    SELECT 
      id::text,
      type,
      tenant_id::text,
      tenant_name,
      file_name,
      file_size::bigint,
      record_count,
      created_by,
      created_at
    FROM admin_backups
    ORDER BY created_at DESC
  `)

  return result.map((row) => ({
    id: String(row.id),
    type: row.type,
    tenant_id: row.tenant_id ? String(row.tenant_id) : null,
    tenant_name: row.tenant_name,
    file_name: row.file_name,
    file_size: Number(row.file_size),
    record_count: Number(row.record_count),
    created_by: row.created_by,
    created_at: row.created_at instanceof Date 
      ? row.created_at.toISOString() 
      : String(row.created_at),
  }))
}
// ═══════════════════════════════════════════════════════════
// ایجاد بکاپ یک فروشگاه
// ═══════════════════════════════════════════════════════════
export async function createTenantBackup(
  tenantId: string,
  createdBy: string = 'admin'
): Promise<BackupCreateResult> {
  const startTime = Date.now()

  // ۱. دریافت اطلاعات فروشگاه (نام جدول: "Tenants")
  const tenantResult = await db.client.$queryRawUnsafe<Array<{
    id: string
    companyName: string
    subDomain: string
  }>>(
    'SELECT id, "companyName", "subDomain" FROM "Tenants" WHERE id = $1',
    tenantId
  )

  if (tenantResult.length === 0) {
    throw new Error('فروشگاه یافت نشد')
  }

  const tenant = tenantResult[0]

  // ۲. جمع‌آوری داده از همه جداول
  const backupData: Record<string, any> = {
    _meta: {
      type: 'tenant',
      tenantId,
      tenantName: tenant.companyName,
      subDomain: tenant.subDomain,
      createdAt: new Date().toISOString(),
      version: '1.0',
    },
  }

  let totalRecords = 0
  const existingTables = await getExistingTables()

  console.log(`[Backup] Starting tenant backup for: ${tenant.companyName}`)
  console.log(`[Backup] Total tables in DB: ${existingTables.size}`)

  for (const table of TENANT_TABLES) {
    if (!existingTables.has(table)) {
      console.log(`[Backup] ⏭️ Skipping ${table} (not exists)`)
      continue
    }

    try {
      const tenantColumn = await getTenantColumnName(table)
      
      if (!tenantColumn) {
        // جدول بدون tenantId - همه رکوردها را بکاپ بگیر
        console.log(`[Backup] 📋 ${table} (no tenant column - backing up all)`)
        const rows = await db.client.$queryRawUnsafe<any[]>(
          `SELECT * FROM "${table}"`
        )
        backupData[table] = rows
        totalRecords += rows.length
        continue
      }

      // جدول با tenantId - فقط رکوردهای این tenant
      const rows = await db.client.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${table}" WHERE "${tenantColumn}" = $1`,
        tenantId
      )

      backupData[table] = rows
      totalRecords += rows.length
      console.log(`[Backup] ✅ ${table}: ${rows.length} records`)
    } catch (err: any) {
      console.warn(`[Backup] ⚠️ Error reading ${table}:`, err.message)
      backupData[table] = []
    }
  }

  // ۳. ذخیره در دیتابیس
  const jsonStr = JSON.stringify(backupData)
  const dataBuffer = Buffer.from(jsonStr, 'utf-8')

  const now = new Date()
  const datePart = now.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const fileName = `tenant-${tenant.subDomain}-${datePart}.json`

  const insertResult = await db.client.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO admin_backups 
     (type, tenant_id, tenant_name, file_name, file_size, record_count, data, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    'tenant',
    tenantId,
    tenant.companyName,
    fileName,
    dataBuffer.length,
    totalRecords,
    dataBuffer,
    createdBy
  )

  const duration = Date.now() - startTime

  console.log(`[Backup] ✅ Backup created: ${fileName} (${totalRecords} records, ${formatSize(dataBuffer.length)})`)

  return {
    id: insertResult[0].id,
    fileName,
    fileSize: dataBuffer.length,
    recordCount: totalRecords,
    duration,
  }
}

// ═══════════════════════════════════════════════════════════
// ایجاد بکاپ کامل دیتابیس
// ═══════════════════════════════════════════════════════════
export async function createFullDatabaseBackup(
  createdBy: string = 'admin'
): Promise<BackupCreateResult> {
  const startTime = Date.now()

  const backupData: Record<string, any> = {
    _meta: {
      type: 'full_database',
      createdAt: new Date().toISOString(),
      version: '1.0',
    },
  }

  let totalRecords = 0
  const existingTables = await getExistingTables()
  const allTables = [...SYSTEM_TABLES, ...TENANT_TABLES].filter(
    (t) => existingTables.has(t) && t !== 'admin_backups' && t !== 'Backups'
  )

  console.log(`[Backup] Starting full database backup`)
  console.log(`[Backup] Tables to backup: ${allTables.length}`)

  for (const table of allTables) {
    try {
      const rows = await db.client.$queryRawUnsafe<any[]>(
        `SELECT * FROM "${table}"`
      )
      backupData[table] = rows
      totalRecords += rows.length
      console.log(`[Backup] ✅ ${table}: ${rows.length} records`)
    } catch (err: any) {
      console.warn(`[Backup] ⚠️ Error reading ${table}:`, err.message)
      backupData[table] = []
    }
  }

  const jsonStr = JSON.stringify(backupData)
  const dataBuffer = Buffer.from(jsonStr, 'utf-8')

  const now = new Date()
  const datePart = now.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const fileName = `full-database-${datePart}.json`

  const insertResult = await db.client.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO admin_backups 
     (type, tenant_id, tenant_name, file_name, file_size, record_count, data, created_by)
     VALUES ($1, NULL, NULL, $2, $3, $4, $5, $6)
     RETURNING id`,
    'full_database',
    fileName,
    dataBuffer.length,
    totalRecords,
    dataBuffer,
    createdBy
  )

  const duration = Date.now() - startTime

  console.log(`[Backup] ✅ Full backup created: ${fileName} (${totalRecords} records)`)

  return {
    id: insertResult[0].id,
    fileName,
    fileSize: dataBuffer.length,
    recordCount: totalRecords,
    duration,
  }
}

// ═══════════════════════════════════════════════════════════
// دانلود بکاپ
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// دانلود بکاپ — اصلاح UUID
// ═══════════════════════════════════════════════════════════
export async function downloadBackup(id: string): Promise<{
  fileName: string
  data: Buffer
}> {
  const result = await db.client.$queryRawUnsafe<Array<{
    file_name: string
    data: Buffer
  }>>(
    'SELECT file_name, data FROM admin_backups WHERE id = $1::uuid',
    id
  )

  if (result.length === 0) {
    throw new Error('فایل بکاپ یافت نشد')
  }

  const row = result[0]
  const buffer = Buffer.isBuffer(row.data) 
    ? row.data 
    : Buffer.from(row.data as any)

  return {
    fileName: row.file_name,
    data: buffer,
  }
}

// ═══════════════════════════════════════════════════════════
// حذف بکاپ
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// حذف بکاپ — اصلاح UUID
// ═══════════════════════════════════════════════════════════
export async function deleteBackup(id: string): Promise<void> {
  await db.client.$queryRawUnsafe(
    'DELETE FROM admin_backups WHERE id = $1::uuid', 
    id
  )
}

// ═══════════════════════════════════════════════════════════
// آمار کلی
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// آمار کلی — نسخه اصلاح‌شده برای BigInt
// ═══════════════════════════════════════════════════════════
export async function getBackupStats(): Promise<{
  total: number
  tenantCount: number
  fullCount: number
  totalSize: number
  latestAt: string | null
}> {
  const result = await db.client.$queryRawUnsafe<any[]>(`
    SELECT 
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE type = 'tenant')::int as tenant_count,
      COUNT(*) FILTER (WHERE type = 'full_database')::int as full_count,
      COALESCE(SUM(file_size), 0)::bigint as total_size,
      MAX(created_at) as latest_at
    FROM admin_backups
  `)

  const row = result[0]
  return {
    total: Number(row.total) || 0,
    tenantCount: Number(row.tenant_count) || 0,
    fullCount: Number(row.full_count) || 0,
    totalSize: Number(row.total_size) || 0,
    latestAt: row.latest_at instanceof Date
      ? row.latest_at.toISOString()
      : row.latest_at ? String(row.latest_at) : null,
  }
}
// ═══════════════════════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════════════════════
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

// ═══════════════════════════════════════════════════════════
// بازیابی از بکاپ
// ═══════════════════════════════════════════════════════════
export async function restoreBackup(backupId: string): Promise<{
  success: boolean
  restoredCount: number
  tablesRestored: string[]
  duration: number
}> {
  const startTime = Date.now()

  // ۱. دریافت فایل بکاپ
  const backupResult = await db.client.$queryRawUnsafe<Array<{
    type: string
    data: Buffer
    tenant_name: string
  }>>(
    'SELECT type, data, tenant_name FROM admin_backups WHERE id = $1',
    backupId
  )

  if (backupResult.length === 0) {
    throw new Error('فایل بکاپ یافت نشد')
  }

  const backup = backupResult[0]
  const buffer = Buffer.isBuffer(backup.data) ? backup.data : Buffer.from(backup.data as any)
  const jsonStr = buffer.toString('utf-8')
  const backupData = JSON.parse(jsonStr)

  console.log(`[Restore] Starting restore from backup: ${backup.tenant_name || 'Full Database'}`)

  // ۲. استخراج جداول (به جز _meta)
  const tables = Object.keys(backupData).filter(key => key !== '_meta')
  let totalRestored = 0
  const restoredTables: string[] = []

  // ۳. شروع transaction
  await db.client.$executeRawUnsafe('BEGIN')

  try {
    // ۴. برای هر جدول، داده‌های فعلی را پاک کن و داده‌های بکاپ را insert کن
    for (const table of tables) {
      const rows = backupData[table]
      
      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(`[Restore] ⏭️ Skipping ${table} (no data)`)
        continue
      }

      try {
        // پاک کردن داده‌های فعلی (با CASCADE برای foreign keys)
        await db.client.$executeRawUnsafe(`DELETE FROM "${table}" CASCADE`)
        console.log(`[Restore] 🗑️ Cleared ${table}`)

        // Insert کردن داده‌های بکاپ
        if (rows.length > 0) {
          // ساخت INSERT query
          const columns = Object.keys(rows[0])
          const columnList = columns.map(c => `"${c}"`).join(', ')
          
          for (const row of rows) {
            const values = columns.map((col, idx) => {
              const value = row[col]
              if (value === null || value === undefined) return 'NULL'
              if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
              if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
              if (value instanceof Date) return `'${value.toISOString()}'`
              return String(value)
            })
            
            const insertQuery = `INSERT INTO "${table}" (${columnList}) VALUES (${values.join(', ')})`
            await db.client.$executeRawUnsafe(insertQuery)
          }
          
          totalRestored += rows.length
          restoredTables.push(table)
          console.log(`[Restore] ✅ Restored ${rows.length} records to ${table}`)
        }
      } catch (err: any) {
        console.warn(`[Restore] ⚠️ Error restoring ${table}:`, err.message)
        // ادامه می‌دهیم تا بقیه جداول هم restore شوند
      }
    }

    // ۵. Commit transaction
    await db.client.$executeRawUnsafe('COMMIT')
    
    const duration = Date.now() - startTime
    
    console.log(`[Restore] ✅ Restore completed: ${totalRestored} records in ${restoredTables.length} tables`)
    
    return {
      success: true,
      restoredCount: totalRestored,
      tablesRestored: restoredTables,
      duration,
    }
  } catch (err: any) {
    // Rollback در صورت خطا
    await db.client.$executeRawUnsafe('ROLLBACK')
    console.error('[Restore] ❌ Restore failed, rolled back:', err.message)
    throw err
  }
}