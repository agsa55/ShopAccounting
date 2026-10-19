// ============================================================================
// src/lib/admin/backup-service.ts
// سرویس پشتیبان‌گیری برای پنل ادمین
// ★ نسخه 2.1 — رفع خطاهای TypeScript + ایمن‌سازی بکاپ/بازیابی چندمستأجری
// ============================================================================
// ★ تغییرات مهم:
//   ✓ رفع خطای TS2347 با استفاده از SqlExecutor typed
//   ✓ همه فراخوانی‌های db.client به prisma تبدیل شدند
//   ✓ بکاپ تک‌فروشگاهی فقط داده‌های مربوط به همان فروشگاه را می‌گیرد
//   ✓ جداول فرزند بدون tenantId از طریق parent scoped می‌شوند
//   ✓ بازیابی تک‌فروشگاهی فقط همان فروشگاه را برمی‌گرداند
//   ✓ از SQL injection جلوگیری می‌شود
//   ✓ پشتیبانی بهتر از BigInt / Date / Buffer / JSON / bytea
//   ✓ بکاپ‌های قدیمی version 1 برای restore تک‌فروشگاهی مسدود می‌شوند
//   ✓ restore کامل دیتابیس به‌صورت پیش‌فرض غیرفعال است
// ============================================================================

import { db } from '@/lib/db'
import {
  saveBackupFile,
  buildTenantBackupFileName,
  getBackupStorageRoot,
} from './backup-storage'

// ============================================================================
// ★ Typed SQL Executor برای رفع خطای TypeScript
// ============================================================================
type SqlExecutor = {
  $queryRawUnsafe<T = any>(sql: string, ...args: any[]): Promise<T>
  $executeRawUnsafe(sql: string, ...args: any[]): Promise<any>
  $transaction<T>(
    fn: (tx: SqlExecutor) => Promise<T>,
    options?: {
      timeout?: number
      maxWait?: number
    }
  ): Promise<T>
}

const prisma = db.client as unknown as SqlExecutor

// Transaction options برای عملیات‌های طولانی restore
const TX_OPTIONS = {
  timeout: 600000, // 10 minutes
  maxWait: 10000,  // 10 seconds
}
// ============================================================================

// ═══════════════════════════════════════════════════════════
// ★ Feature Flags
// ═══════════════════════════════════════════════════════════

// بازیابی تک‌فروشگاهی الان امن شده و فعال است.
const ENABLE_TENANT_RESTORE: boolean = true

// بازیابی کامل دیتابیس بسیار خطرناک است.
// فقط بعد از تست کامل در محیط staging و گرفتن بکاپ اضطراری، آن را true کنید.
const ENABLE_FULL_DATABASE_RESTORE: boolean = false

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

export interface RestoreResult {
  success: boolean
  restoredCount: number
  tablesRestored: string[]
  duration: number
}

interface ColumnTypeInfo {
  dataType: string
  udtName: string
}

interface ChildRelation {
  childColumn: string
  parentTable: string
  parentColumn: string
  parentTenantColumn: string
}



// ============================================================================
// ★ Client-side backup mode
// ----------------------------------------------------------------------------
// بکاپ دستی جدید نباید محتوایش را داخل دیتابیس ذخیره کند.
// فقط متادیتای سبک ذخیره می‌شود تا در لیست ادمین نمایش داده شود.
// فایل واقعی توسط مرورگر روی سیستم کاربر ذخیره می‌شود.
// ============================================================================

const STORE_BACKUP_METADATA: boolean = true
const SAVE_BACKUP_DATA_TO_DB: boolean = false

export type BackupStorageType = 'db' | 'client' | 'file'

export interface BuiltBackup {
  type: 'tenant' | 'full_database'
  tenantId: string | null
  tenantName: string | null
  subDomain: string | null
  fileName: string
  jsonBuffer: Buffer
  recordCount: number
  backupData: any
}
// ═══════════════════════════════════════════════════════════
// ★ جداول تحت هر فروشگاه
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

// ═══════════════════════════════════════════════════════════
// ★ جداول سیستمی / پلتفرمی
// ═══════════════════════════════════════════════════════════

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

const ADMIN_BACKUP_TABLE = 'admin_backups'
const LEGACY_BACKUP_TABLE = 'Backups'

// ═══════════════════════════════════════════════════════════
// Helpers: Buffer
// ═══════════════════════════════════════════════════════════

function toNodeBuffer(value: any): Buffer {
  if (!value) {
    return Buffer.alloc(0)
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return value
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value)
  }

  if (typeof value === 'string') {
    const s = value.trim()

    if (!s) {
      return Buffer.alloc(0)
    }

    // PostgreSQL bytea hex format: \x7b225f6d657461223a...
    if (s.startsWith('\\x')) {
      try {
        return Buffer.from(s.slice(2), 'hex')
      } catch {
        return Buffer.from(s, 'utf-8')
      }
    }

    // If it already looks like JSON, keep it as UTF-8.
    if (s.startsWith('{') || s.startsWith('[')) {
      return Buffer.from(s, 'utf-8')
    }

    // Try base64 only if it looks like base64 and decodes to JSON-like content.
    if (/^[A-Za-z0-9+/=\s]+$/.test(s) && s.length % 4 === 0) {
      try {
        const decoded = Buffer.from(s, 'base64')

        if (
          decoded.length > 0 &&
          (decoded[0] === 123 /* { */ || decoded[0] === 91 /* [ */)
        ) {
          return decoded
        }
      } catch {
        // ignore
      }
    }

    return Buffer.from(s, 'utf-8')
  }

  if (value && typeof value === 'object' && Array.isArray((value as any).data)) {
    return Buffer.from((value as any).data)
  }

  return Buffer.alloc(0)
}
// ═══════════════════════════════════════════════════════════
// Helpers: JSON serialization with BigInt / Buffer support
// ═══════════════════════════════════════════════════════════

function backupReplacer(_key: string, value: any): any {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'bigint') {
    return { __type: 'bigint', value: value.toString() }
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return { __type: 'bytea', value: value.toString('base64') }
  }

  if (value instanceof Uint8Array) {
    return { __type: 'bytea', value: Buffer.from(value).toString('base64') }
  }

  // Buffer.toJSON() may already have converted it to { type: 'Buffer', data: [...] }
  if (
    value &&
    typeof value === 'object' &&
    (value as any).type === 'Buffer' &&
    Array.isArray((value as any).data)
  ) {
    return {
      __type: 'bytea',
      value: Buffer.from((value as any).data).toString('base64'),
    }
  }

  return value
}

function backupReviver(_key: string, value: any): any {
  if (value && typeof value === 'object' && '__type' in value) {
    const type = (value as any).__type

    if (type === 'bigint') {
      try {
        return BigInt((value as any).value)
      } catch {
        return (value as any).value
      }
    }

    if (type === 'bytea') {
      return Buffer.from((value as any).value, 'base64')
    }
  }

  return value
}

function serializeBackup(data: any): string {
  return JSON.stringify(data, backupReplacer)
}

function deserializeBackup(json: string): any {
  return JSON.parse(json, backupReviver)
}

// ═══════════════════════════════════════════════════════════
// DB metadata helpers
// ═══════════════════════════════════════════════════════════

async function getExistingTables(executor: SqlExecutor = prisma): Promise<Set<string>> {
  const result = await executor.$queryRawUnsafe<Array<{ table_name: string }>>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `)

  return new Set(result.map((r) => r.table_name))
}

async function getTenantColumnName(
  executor: SqlExecutor,
  tableName: string
): Promise<string | null> {
  const result = await executor.$queryRawUnsafe<Array<{ column_name: string }>>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name IN ('tenantId', 'tenant_id')
      LIMIT 1
    `,
    tableName
  )

  return result.length > 0 ? result[0].column_name : null
}

async function getForeignKeyParents(
  executor: SqlExecutor,
  tableName: string
): Promise<string[]> {
  const rows = await executor.$queryRawUnsafe<Array<{ parent_table: string }>>(
    `
      SELECT DISTINCT ccu.table_name AS parent_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
       AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
    `,
    tableName
  )

  return Array.from(new Set(rows.map((r) => r.parent_table)))
}

async function getChildRelation(
  executor: SqlExecutor,
  tableName: string
): Promise<ChildRelation | null> {
  const rows = await executor.$queryRawUnsafe<
    Array<{
      child_column: string
      parent_table: string
      parent_column: string
    }>
  >(
    `
      SELECT
        kcu.column_name AS child_column,
        ccu.table_name AS parent_table,
        ccu.column_name AS parent_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
       AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
    `,
    tableName
  )

  for (const row of rows) {
    const parentTenantColumn = await getTenantColumnName(executor, row.parent_table)
    if (parentTenantColumn) {
      return {
        childColumn: row.child_column,
        parentTable: row.parent_table,
        parentColumn: row.parent_column,
        parentTenantColumn,
      }
    }
  }

  return null
}

// ═══════════════════════════════════════════════════════════
// Dependency ordering
// child tables before parent tables for DELETE
// reverse order for INSERT
// ═══════════════════════════════════════════════════════════

async function orderTablesByDependency(
  executor: SqlExecutor,
  tables: string[]
): Promise<string[]> {
  const tableSet = new Set(tables)
  const parentsMap = new Map<string, string[]>()
  const indegree = new Map<string, number>()

  for (const table of tables) {
    parentsMap.set(table, [])
    indegree.set(table, 0)
  }

  for (const table of tables) {
    const parents = (await getForeignKeyParents(executor, table)).filter(
      (p) => tableSet.has(p) && p !== table
    )

    parentsMap.set(table, parents)

    for (const parent of parents) {
      indegree.set(parent, (indegree.get(parent) || 0) + 1)
    }
  }

  const queue = tables.filter((t) => (indegree.get(t) || 0) === 0)
  const order: string[] = []
  const processed = new Set<string>()

  while (queue.length > 0) {
    const node = queue.shift()!

    if (processed.has(node)) continue

    processed.add(node)
    order.push(node)

    for (const parent of parentsMap.get(node) || []) {
      const nextDegree = (indegree.get(parent) || 0) - 1
      indegree.set(parent, nextDegree)

      if (nextDegree === 0) {
        queue.push(parent)
      }
    }
  }

  // If there is a cycle or unexpected FK graph, append remaining tables.
  for (const table of tables) {
    if (!processed.has(table)) {
      order.push(table)
    }
  }

  return order
}

// ═══════════════════════════════════════════════════════════
// Tenant-scoped read/delete
// ═══════════════════════════════════════════════════════════

async function fetchTenantScopedRows(
  executor: SqlExecutor,
  table: string,
  tenantId: string
): Promise<any[] | null> {
  const tenantColumn = await getTenantColumnName(executor, table)

  if (tenantColumn) {
    return executor.$queryRawUnsafe<any[]>(
      `SELECT * FROM "${table}" WHERE "${tenantColumn}" = $1::varchar`,
      tenantId
    )
  }

  const relation = await getChildRelation(executor, table)

  if (relation) {
    return executor.$queryRawUnsafe<any[]>(
      `
        SELECT c.*
        FROM "${table}" c
        JOIN "${relation.parentTable}" p
          ON c."${relation.childColumn}" = p."${relation.parentColumn}"
        WHERE p."${relation.parentTenantColumn}" = $1::varchar
      `,
      tenantId
    )
  }

  return null
}

async function deleteTenantScopedRows(
  executor: SqlExecutor,
  table: string,
  tenantId: string
): Promise<boolean> {
  const tenantColumn = await getTenantColumnName(executor, table)

  if (tenantColumn) {
    await executor.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "${tenantColumn}" = $1::varchar`,
      tenantId
    )
    return true
  }

  const relation = await getChildRelation(executor, table)

  if (relation) {
    await executor.$executeRawUnsafe(
      `
        DELETE FROM "${table}"
        WHERE "${relation.childColumn}" IN (
          SELECT "${relation.parentColumn}"
          FROM "${relation.parentTable}"
          WHERE "${relation.parentTenantColumn}" = $1::varchar
        )
      `,
      tenantId
    )
    return true
  }

  console.warn(`[Restore] ⚠️ Cannot safely scope table ${table} to tenant. Skipping.`)
  return false
}

// ═══════════════════════════════════════════════════════════
// Column type helpers for safe INSERT
// ═══════════════════════════════════════════════════════════

const ARRAY_CASTS: Record<string, string> = {
  _text: 'text[]',
  _varchar: 'varchar[]',
  _char: 'char[]',
  _bpchar: 'char[]',
  _int2: 'smallint[]',
  _int4: 'integer[]',
  _int8: 'bigint[]',
  _float4: 'real[]',
  _float8: 'double precision[]',
  _numeric: 'numeric[]',
  _bool: 'boolean[]',
  _uuid: 'uuid[]',
  _json: 'json[]',
  _jsonb: 'jsonb[]',
  _date: 'date[]',
  _timestamp: 'timestamp[]',
  _timestamptz: 'timestamptz[]',
}

async function getTableColumnsInfo(
  executor: SqlExecutor,
  tableName: string
): Promise<Record<string, ColumnTypeInfo>> {
  const rows = await executor.$queryRawUnsafe<
    Array<{
      column_name: string
      data_type: string
      udt_name: string
    }>
  >(
    `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    tableName
  )

  const map: Record<string, ColumnTypeInfo> = {}

  for (const row of rows) {
    map[row.column_name] = {
      dataType: row.data_type,
      udtName: row.udt_name,
    }
  }

  return map
}

function sqlCastForColumn(col: ColumnTypeInfo): string {
  const dt = col.dataType

  if (dt === 'timestamp with time zone') return 'timestamptz'
  if (dt === 'timestamp without time zone') return 'timestamp'
  if (dt === 'character varying') return 'varchar'
  if (dt === 'character') return 'char'
  if (dt === 'USER-DEFINED') return col.udtName

  if (dt === 'ARRAY') {
    return ARRAY_CASTS[col.udtName] || 'text[]'
  }

  return dt
}

function toPgArrayLiteral(value: any[]): string {
  const items = value.map((v) => {
    if (v === null || v === undefined) return 'NULL'

    const s = String(v)
    const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return `"${escaped}"`
  })

  return `{${items.join(',')}}`
}

function normalizeParam(value: any, col: ColumnTypeInfo): any {
  if (value === null || value === undefined) return null

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  // Custom bytea marker from reviver
  if (value && typeof value === 'object' && (value as any).__type === 'bytea') {
    return Buffer.from((value as any).value, 'base64')
  }

  // Buffer.toJSON fallback
  if (
    value &&
    typeof value === 'object' &&
    (value as any).type === 'Buffer' &&
    Array.isArray((value as any).data)
  ) {
    return Buffer.from((value as any).data)
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return value
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value)
  }

  if (col.dataType === 'bytea' && typeof value === 'string') {
    if (value.startsWith('\\x')) {
      return Buffer.from(value.slice(2), 'hex')
    }

    try {
      return Buffer.from(value, 'base64')
    } catch {
      return value
    }
  }

  if (typeof value === 'boolean') {
    if (col.dataType === 'boolean') return value
    return value ? 'true' : 'false'
  }

  if (typeof value === 'string' && col.dataType === 'boolean') {
    return value === 'true'
  }

  if (col.dataType === 'ARRAY') {
    if (Array.isArray(value)) return toPgArrayLiteral(value)
    if (typeof value === 'string') return value
    return toPgArrayLiteral([value])
  }

  if (typeof value === 'number') {
    if (
      col.dataType === 'integer' ||
      col.dataType === 'smallint' ||
      col.dataType === 'bigint' ||
      col.dataType === 'numeric' ||
      col.dataType === 'real' ||
      col.dataType === 'double precision'
    ) {
      return String(value)
    }

    return value
  }

  if (typeof value === 'object') {
    if (col.dataType === 'json' || col.dataType === 'jsonb') {
      return JSON.stringify(value)
    }

    return JSON.stringify(value)
  }

  return String(value)
}

async function fixSequences(executor: SqlExecutor, table: string): Promise<void> {
  const serialColumns = await executor.$queryRawUnsafe<Array<{ column_name: string }>>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_default LIKE 'nextval%'
    `,
    table
  )

  for (const col of serialColumns) {
    try {
      await executor.$executeRawUnsafe(
        `
          SELECT setval(
            pg_get_serial_sequence($1, $2),
            COALESCE((SELECT MAX("${col.column_name}") FROM "${table}"), 1),
            true
          )
        `,
        `"${table}"`,
        col.column_name
      )
    } catch (err: any) {
      console.warn(
        `[Restore] ⚠️ Could not fix sequence for ${table}.${col.column_name}:`,
        err.message
      )
    }
  }
}

async function insertRows(
  executor: SqlExecutor,
  table: string,
  rows: any[]
): Promise<number> {
  if (!Array.isArray(rows) || rows.length === 0) return 0

  const columnsInfo = await getTableColumnsInfo(executor, table)
  const firstRow = rows[0]

  if (!firstRow || typeof firstRow !== 'object') return 0

  const columns = Object.keys(firstRow).filter((c) => Boolean(columnsInfo[c]))

  if (columns.length === 0) {
    console.warn(`[Restore] ⚠️ No matching columns found for table ${table}`)
    return 0
  }

  const columnList = columns.map((c) => `"${c}"`).join(', ')
  const placeholders = columns
    .map((c, idx) => `$${idx + 1}::${sqlCastForColumn(columnsInfo[c]!)}`)
    .join(', ')

  const sql = `INSERT INTO "${table}" (${columnList}) VALUES (${placeholders})`

  let inserted = 0

  for (const row of rows) {
    const params = columns.map((c) => normalizeParam(row[c], columnsInfo[c]!))
    await executor.$executeRawUnsafe(sql, ...params)
    inserted++
  }

  await fixSequences(executor, table)

  return inserted
}

// ═══════════════════════════════════════════════════════════
// List backups
// ═══════════════════════════════════════════════════════════

export async function listBackups(): Promise<BackupRecord[]> {
  const result = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      id::text,
      type,
      tenant_id::text,
      tenant_name,
      file_name,
      file_size::bigint,
      record_count,
      created_by,
      created_at,
      COALESCE(storage_type, 'db') AS storage_type
    FROM admin_backups
    ORDER BY created_at DESC
  `)

  return result.map((row) => ({
    id: String(row.id),
    type: row.type,
    tenant_id: row.tenant_id ? String(row.tenant_id) : null,
    tenant_name: row.tenant_name ?? null,
    file_name: String(row.file_name),
    file_size: Number(row.file_size),
    record_count: Number(row.record_count ?? 0),
    created_by: row.created_by ? String(row.created_by) : 'admin',
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    storage_type: row.storage_type || 'db',
  }))
}
// ═══════════════════════════════════════════════════════════
// Create tenant backup
// ═══════════════════════════════════════════════════════════

export async function createTenantBackup(
  tenantIdInput: string,
  createdBy: string = 'admin'
): Promise<BackupCreateResult> {
  const startTime = Date.now()

  const tenantResult = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      companyName: string
      subDomain: string
    }>
  >(
    `
      SELECT id, "companyName", "subDomain"
      FROM "Tenants"
      WHERE id = $1::varchar
         OR "subDomain" = $1::varchar
      LIMIT 1
    `,
    tenantIdInput
  )

  if (tenantResult.length === 0) {
    throw new Error('فروشگاه یافت نشد')
  }

  const tenant = tenantResult[0]
  const tenantId = String(tenant.id)

  const backupData: Record<string, any> = {
    _meta: {
      type: 'tenant',
      tenantId,
      tenantName: tenant.companyName,
      subDomain: tenant.subDomain,
      createdAt: new Date().toISOString(),
      version: '2.0',
      scoped: true,
    },
  }

  let totalRecords = 0
  const existingTables = await getExistingTables()

  console.log(`[Backup] Starting tenant backup for: ${tenant.companyName}`)
  console.log(`[Backup] tenantId: ${tenantId}`)
  console.log(`[Backup] Total tables in DB: ${existingTables.size}`)

  for (const table of TENANT_TABLES) {
    if (!existingTables.has(table)) {
      console.log(`[Backup] ⏭️ Skipping ${table} (not exists)`)
      continue
    }

    try {
      const rows = await fetchTenantScopedRows(prisma, table, tenantId)

      if (rows === null) {
        console.warn(`[Backup] ⚠️ Skipping ${table}: no safe tenant scope found`)
        continue
      }

      backupData[table] = rows
      totalRecords += rows.length
      console.log(`[Backup] ✅ ${table}: ${rows.length} records`)
    } catch (err: any) {
      console.warn(`[Backup] ⚠️ Error reading ${table}:`, err.message)
      // Do NOT store empty array for failed tables, otherwise restore could wipe data.
      continue
    }
  }

  const jsonStr = serializeBackup(backupData)
  const dataBuffer = Buffer.from(jsonStr, 'utf-8')

  const now = new Date()
  const datePart = now.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const fileName = `tenant-${tenant.subDomain}-${datePart}.json`

  const insertResult = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      INSERT INTO admin_backups
        (type, tenant_id, tenant_name, file_name, file_size, record_count, data, created_by)
      VALUES
        ($1, $2::varchar, $3, $4, $5::bigint, $6::int, $7, $8)
      RETURNING id::text
    `,
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

  console.log(
    `[Backup] ✅ Backup created: ${fileName} (${totalRecords} records, ${formatSize(dataBuffer.length)})`
  )

  return {
    id: String(insertResult[0].id),
    fileName,
    fileSize: dataBuffer.length,
    recordCount: totalRecords,
    duration,
  }
}


// ============================================================================
// ★ Build tenant backup without saving payload to DB
// ----------------------------------------------------------------------------
// This function only reads tenant-scoped data and returns a Buffer.
// It does NOT insert into admin_backups.
// ============================================================================

export async function buildTenantBackup(
  tenantIdInput: string,
  storage: 'client' | 'file' = 'client'
): Promise<BuiltBackup> {
  const tenantResult = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      companyName: string
      subDomain: string
    }>
  >(
    `
      SELECT id, "companyName", "subDomain"
      FROM "Tenants"
      WHERE id = $1::varchar
         OR "subDomain" = $1::varchar
      LIMIT 1
    `,
    tenantIdInput
  )

  if (tenantResult.length === 0) {
    throw new Error('فروشگاه یافت نشد')
  }

  const tenant = tenantResult[0]
  const tenantId = String(tenant.id)

 const backupData: Record<string, any> = {
  _meta: {
    type: 'tenant',
    tenantId,
    tenantName: tenant.companyName,
    subDomain: tenant.subDomain,
    createdAt: new Date().toISOString(),
    version: '2.0',
    scoped: true,
    storage,
  },
}

  let totalRecords = 0
  const existingTables = await getExistingTables()

  console.log(`[Backup] Building tenant backup for: ${tenant.companyName}`)
  console.log(`[Backup] tenantId: ${tenantId}`)

  for (const table of TENANT_TABLES) {
    if (!existingTables.has(table)) {
      console.log(`[Backup] ⏭️ Skipping ${table} (not exists)`)
      continue
    }

    try {
      const rows = await fetchTenantScopedRows(prisma, table, tenantId)

      if (rows === null) {
        console.warn(`[Backup] ⚠️ Skipping ${table}: no safe tenant scope found`)
        continue
      }

      backupData[table] = rows
      totalRecords += rows.length
      console.log(`[Backup] ✅ ${table}: ${rows.length} records`)
    } catch (err: any) {
      console.warn(`[Backup] ⚠️ Error reading ${table}:`, err.message)
      // Do NOT store empty array for failed tables, otherwise restore could wipe data.
      continue
    }
  }

  const jsonStr = serializeBackup(backupData)
  const jsonBuffer = Buffer.from(jsonStr, 'utf-8')

  const now = new Date()
  const datePart = now.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const fileName = `tenant-${tenant.subDomain}-${datePart}.json`

  console.log(
    `[Backup] ✅ Tenant backup built: ${fileName} (${totalRecords} records, ${formatSize(jsonBuffer.length)})`
  )

return {
  type: 'tenant',
  tenantId,
  tenantName: tenant.companyName,
  subDomain: tenant.subDomain,
  fileName,
  jsonBuffer,
  recordCount: totalRecords,
  backupData,
}
}

// ============================================================================
// ★ Register metadata only for client-stored backup
// ----------------------------------------------------------------------------
// This does NOT save backup payload into DB.
// It only records file name / tenant / size so admin UI can list it.
// ============================================================================

export async function registerClientBackupMetadata(
  built: BuiltBackup,
  createdBy: string = 'admin'
): Promise<string | null> {
  if (!STORE_BACKUP_METADATA) return null

  const result = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      INSERT INTO admin_backups
        (
          type,
          tenant_id,
          tenant_name,
          file_name,
          file_size,
          record_count,
          data,
          created_by,
          storage_type
        )
      VALUES
        (
          $1,
          $2::varchar,
          $3,
          $4,
          $5::bigint,
          $6::int,
          NULL::bytea,
          $7,
          'client'
        )
      RETURNING id::text
    `,
    built.type,
    built.tenantId,
    built.tenantName,
    built.fileName,
    built.jsonBuffer.length,
    built.recordCount,
    createdBy
  )

  return result[0] ? String(result[0].id) : null
}


// ============================================================================
// ★ Tenant storage backup — file on Runflare/local storage + metadata in DB
// ----------------------------------------------------------------------------
// This creates a gzip file inside BACKUP_STORAGE_PATH and stores only metadata
// in admin_backups with storage_type = 'file'.
// ============================================================================

export interface CreateTenantStorageBackupOptions {
  retentionDays?: number
  createdBy?: string
}

export interface TenantStorageBackupResult {
  id: string
  fileName: string
  storagePath: string
  sizeOriginal: number
  sizeCompressed: number
  checksum: string
  recordCount: number
  expiresAt: string | null
  createdAt: string
}

export async function createTenantStorageBackup(
  tenantIdInput: string,
  options: CreateTenantStorageBackupOptions = {}
): Promise<TenantStorageBackupResult> {
  const createdBy = String(options.createdBy || 'scheduler').trim() || 'scheduler'

  const retentionDays =
    options.retentionDays ??
    Number(process.env.BACKUP_RETENTION_DAYS || 7) ??
    7

  console.log(
    `[BackupStorage] Creating storage backup for tenant: ${tenantIdInput}`
  )

  const built = await buildTenantBackup(tenantIdInput, 'file')

  const fileName = buildTenantBackupFileName({
    subDomain: built.subDomain || built.tenantId || 'tenant',
    tenantId: built.tenantId || undefined,
    date: new Date(),
  })

  const saved = await saveBackupFile({
    data: built.jsonBuffer,
    fileName,
    retentionDays: Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 7,
  })

  console.log(
    `[BackupStorage] File saved: root=${getBackupStorageRoot()} path=${saved.storagePath}`
  )

  const expiresAtParam = saved.expiresAt ? saved.expiresAt.toISOString() : null

  const inserted = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      created_at: Date | string
    }>
  >(
    `
      INSERT INTO admin_backups
        (
          type,
          tenant_id,
          tenant_name,
          file_name,
          file_size,
          record_count,
          data,
          created_by,
          storage_type,
          storage_path,
          size_original,
          size_compressed,
          checksum,
          status,
          expires_at,
          created_at,
          updated_at
        )
      VALUES
        (
          $1,
          $2::varchar,
          $3,
          $4,
          $5::bigint,
          $6::int,
          NULL::bytea,
          $7,
          'file',
          $8,
          $9::bigint,
          $10::bigint,
          $11,
          'completed',
          $12::timestamptz,
          now(),
          now()
        )
      RETURNING id::text, created_at
    `,
    built.type,
    built.tenantId,
    built.tenantName,
    saved.fileName,
    saved.sizeCompressed,
    built.recordCount,
    createdBy,
    saved.storagePath,
    saved.sizeOriginal,
    saved.sizeCompressed,
    saved.checksum,
    expiresAtParam
  )

  if (!inserted[0]) {
    throw new Error('ذخیره متادیتای بکاپ فایل‌محور در دیتابیس ناموفق بود.')
  }

  const row = inserted[0]

  const result: TenantStorageBackupResult = {
    id: String(row.id),
    fileName: saved.fileName,
    storagePath: saved.storagePath,
    sizeOriginal: saved.sizeOriginal,
    sizeCompressed: saved.sizeCompressed,
    checksum: saved.checksum,
    recordCount: built.recordCount,
    expiresAt: saved.expiresAt ? saved.expiresAt.toISOString() : null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }

  console.log(
    `[BackupStorage] Metadata saved: id=${result.id} file=${result.fileName}`
  )

  return result
}
// ═══════════════════════════════════════════════════════════
// Create full database backup
// ═══════════════════════════════════════════════════════════

export async function createFullDatabaseBackup(
  createdBy: string = 'admin'
): Promise<BackupCreateResult> {
  const startTime = Date.now()

  const backupData: Record<string, any> = {
    _meta: {
      type: 'full_database',
      createdAt: new Date().toISOString(),
      version: '2.0',
      scoped: false,
    },
  }

  let totalRecords = 0
  const existingTables = await getExistingTables()

  const allTables = [...SYSTEM_TABLES, ...TENANT_TABLES].filter(
    (t) =>
      existingTables.has(t) &&
      t !== ADMIN_BACKUP_TABLE &&
      t !== LEGACY_BACKUP_TABLE
  )

  console.log(`[Backup] Starting full database backup`)
  console.log(`[Backup] Tables to backup: ${allTables.length}`)

  for (const table of allTables) {
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "${table}"`)

      backupData[table] = rows
      totalRecords += rows.length
      console.log(`[Backup] ✅ ${table}: ${rows.length} records`)
    } catch (err: any) {
      console.warn(`[Backup] ⚠️ Error reading ${table}:`, err.message)
      // Do NOT include failed tables as empty arrays.
      continue
    }
  }

  const jsonStr = serializeBackup(backupData)
  const dataBuffer = Buffer.from(jsonStr, 'utf-8')

  const now = new Date()
  const datePart = now.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const fileName = `full-database-${datePart}.json`

  const insertResult = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      INSERT INTO admin_backups
        (type, tenant_id, tenant_name, file_name, file_size, record_count, data, created_by)
      VALUES
        ($1, NULL::varchar, NULL, $2, $3::bigint, $4::int, $5, $6)
      RETURNING id::text
    `,
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
    id: String(insertResult[0].id),
    fileName,
    fileSize: dataBuffer.length,
    recordCount: totalRecords,
    duration,
  }
}

// ═══════════════════════════════════════════════════════════
// Download backup
// ═══════════════════════════════════════════════════════════

export async function downloadBackup(id: string): Promise<{
  fileName: string
  data: Buffer
}> {
  const result = await prisma.$queryRawUnsafe<
    Array<{
      file_name: string
      data: any
      storage_type: string
      data_len: number | null
    }>
  >(
    `
      SELECT
        file_name,
        data,
        COALESCE(storage_type, 'db') AS storage_type,
        octet_length(data) AS data_len
      FROM admin_backups
      WHERE id = $1::uuid
    `,
    id
  )

  if (result.length === 0) {
    throw new Error('فایل بکاپ یافت نشد')
  }

  const row = result[0]

  if (row.storage_type === 'client') {
    throw new Error(
      'محتوای این بکاپ در دیتابیس ذخیره نشده است. این بکاپ روی سیستم شما ذخیره شده است.'
    )
  }

  if (row.data === null || row.data === undefined) {
    throw new Error('محتوای این بکاپ در دیتابیس خالی است.')
  }

  const buffer = toNodeBuffer(row.data)

  if (!buffer || buffer.length === 0) {
    throw new Error('محتوای این بکاپ خالی یا آسیب‌دیده است.')
  }

  return {
    fileName: row.file_name,
    data: buffer,
  }
}

// ═══════════════════════════════════════════════════════════
// Delete backup
// ═══════════════════════════════════════════════════════════

export async function deleteBackup(id: string): Promise<void> {
  await prisma.$executeRawUnsafe('DELETE FROM admin_backups WHERE id = $1::uuid', id)
}

// ═══════════════════════════════════════════════════════════
// Backup stats
// ═══════════════════════════════════════════════════════════

export async function getBackupStats(): Promise<{
  total: number
  tenantCount: number
  fullCount: number
  totalSize: number
  latestAt: string | null
}> {
  const result = await prisma.$queryRawUnsafe<any[]>(`
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
    latestAt:
      row.latest_at instanceof Date
        ? row.latest_at.toISOString()
        : row.latest_at
        ? String(row.latest_at)
        : null,
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
// Restore backup
// ═══════════════════════════════════════════════════════════

export async function restoreBackup(backupId: string): Promise<RestoreResult> {
  const startTime = Date.now()

  const backupResult = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      type: string
      tenant_id: string | null
      tenant_name: string | null
      data: any
      storage_type: string
      data_len: number | null
    }>
  >(
    `
      SELECT
        id::text,
        type,
        tenant_id::text,
        tenant_name,
        data,
        COALESCE(storage_type, 'db') AS storage_type,
        octet_length(data) AS data_len
      FROM admin_backups
      WHERE id = $1::uuid
    `,
    backupId
  )

  if (backupResult.length === 0) {
    throw new Error('فایل بکاپ یافت نشد')
  }

  const backupRow = backupResult[0]

  if (backupRow.storage_type === 'client') {
    throw new Error(
      'محتوای این بکاپ در دیتابیس ذخیره نشده است. این بکاپ روی سیستم شما ذخیره شده است. برای بازیابی، فایل JSON بکاپ را از سیستم خود انتخاب کنید.'
    )
  }

  if (backupRow.data === null || backupRow.data === undefined) {
    throw new Error(
      'محتوای این بکاپ در دیتابیس خالی است. این بکاپ قابل بازیابی از سرور نیست.'
    )
  }

  const buffer = toNodeBuffer(backupRow.data)

  if (!buffer || buffer.length === 0) {
    throw new Error(
      'محتوای این بکاپ خالی یا آسیب‌دیده است. بازیابی از سرور امکان‌پذیر نیست.'
    )
  }

  const jsonStr = buffer.toString('utf-8').trim()

  if (!jsonStr) {
    throw new Error('محتوای این بکاپ خالی است.')
  }

  let backupData: any

  try {
    backupData = deserializeBackup(jsonStr)
  } catch (err: any) {
    throw new Error(
      `فایل بکاپ خراب یا ناقص است: ${err?.message || 'خطای ناشناخته'}`
    )
  }

  const meta = backupData._meta || {}

  console.log(
    `[Restore] Starting restore from DB backup: ${backupRow.tenant_name || 'Full Database'}`
  )

  if (backupRow.type === 'tenant') {
    if (!ENABLE_TENANT_RESTORE) {
      throw new Error('بازیابی تک‌فروشگاهی فعلاً غیرفعال است.')
    }

    if (meta.version !== '2.0' || meta.scoped !== true) {
      throw new Error(
        'این بکاپ قدیمی است و برای بازیابی امن تک‌فروشگاهی قابل استفاده نیست. لطفاً بعد از آپدیت سیستم، بکاپ جدید بگیرید.'
      )
    }

    const tenantId = backupRow.tenant_id || meta.tenantId

    if (!tenantId) {
      throw new Error('شناسه فروشگاه در بکاپ موجود نیست.')
    }

    return await prisma.$transaction(
      async (tx: SqlExecutor) => {
        return await restoreTenantBackup(tx, backupData, String(tenantId), startTime)
      },
      TX_OPTIONS
    )
  }

  if (backupRow.type === 'full_database') {
    if (!ENABLE_FULL_DATABASE_RESTORE) {
      throw new Error(
        'بازیابی کامل دیتابیس به دلیل خطرناک بودن فعلاً غیرفعال است. برای فعال‌سازی، ENABLE_FULL_DATABASE_RESTORE را در backup-service.ts تغییر دهید و حتماً قبل از آن بکاپ اضطراری بگیرید.'
      )
    }

    return await prisma.$transaction(
      async (tx: SqlExecutor) => {
        return await restoreFullBackup(tx, backupData, startTime)
      },
      TX_OPTIONS
    )
  }

  throw new Error('نوع بکاپ نامعلوم است.')
}

// ═══════════════════════════════════════════════════════════
// Restore tenant backup
// ═══════════════════════════════════════════════════════════

async function restoreTenantBackup(
  tx: SqlExecutor,
  backupData: any,
  tenantId: string,
  startTime: number
): Promise<RestoreResult> {
  const tenantExists = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id::text FROM "Tenants" WHERE id = $1::varchar LIMIT 1`,
    tenantId
  )

  if (tenantExists.length === 0) {
    throw new Error('فروشگاه مقصد برای بازیابی یافت نشد. ابتدا باید فروشگاه وجود داشته باشد.')
  }

  const allowedTables = new Set(TENANT_TABLES)

  const presentTables = Object.keys(backupData).filter(
    (key) => key !== '_meta' && allowedTables.has(key)
  )

  if (presentTables.length === 0) {
    return {
      success: true,
      restoredCount: 0,
      tablesRestored: [],
      duration: Date.now() - startTime,
    }
  }

  // Delete children before parents
  const deleteOrder = await orderTablesByDependency(tx, presentTables)

  const clearedTables: string[] = []

  for (const table of deleteOrder) {
    const ok = await deleteTenantScopedRows(tx, table, tenantId)

    if (ok) {
      clearedTables.push(table)
      console.log(`[Restore] 🗑️ Cleared tenant-scoped data from ${table}`)
    }
  }

  // Insert parents before children
  const insertOrder = [...clearedTables].reverse()

  let totalRestored = 0
  const tablesRestored: string[] = []

  for (const table of insertOrder) {
    const rows = backupData[table]

    if (!Array.isArray(rows)) continue

    if (rows.length === 0) {
      tablesRestored.push(table)
      continue
    }

    const count = await insertRows(tx, table, rows)
    totalRestored += count
    tablesRestored.push(table)

    console.log(`[Restore] ✅ Restored ${count} records to ${table}`)
  }

  const duration = Date.now() - startTime

  console.log(
    `[Restore] ✅ Tenant restore completed: ${totalRestored} records in ${tablesRestored.length} tables`
  )

  return {
    success: true,
    restoredCount: totalRestored,
    tablesRestored,
    duration,
  }
}

// ═══════════════════════════════════════════════════════════
// Restore full database backup
// ═══════════════════════════════════════════════════════════

async function restoreFullBackup(
  tx: SqlExecutor,
  backupData: any,
  startTime: number
): Promise<RestoreResult> {
  const allowedTables = new Set([...SYSTEM_TABLES, ...TENANT_TABLES])

  const presentTables = Object.keys(backupData).filter(
    (key) =>
      key !== '_meta' &&
      allowedTables.has(key) &&
      key !== ADMIN_BACKUP_TABLE &&
      key !== LEGACY_BACKUP_TABLE
  )

  if (presentTables.length === 0) {
    return {
      success: true,
      restoredCount: 0,
      tablesRestored: [],
      duration: Date.now() - startTime,
    }
  }

  const deleteOrder = await orderTablesByDependency(tx, presentTables)

  const tableList = deleteOrder.map((t) => `"${t}"`).join(', ')

  console.log(`[Restore] 🔥 Truncating ${deleteOrder.length} tables for full restore`)

  await tx.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`)

  const insertOrder = [...deleteOrder].reverse()

  let totalRestored = 0
  const tablesRestored: string[] = []

  for (const table of insertOrder) {
    const rows = backupData[table]

    if (!Array.isArray(rows)) continue

    if (rows.length === 0) {
      tablesRestored.push(table)
      continue
    }

    const count = await insertRows(tx, table, rows)
    totalRestored += count
    tablesRestored.push(table)

    console.log(`[Restore] ✅ Restored ${count} records to ${table}`)
  }

  const duration = Date.now() - startTime

  console.log(
    `[Restore] ✅ Full restore completed: ${totalRestored} records in ${tablesRestored.length} tables`
  )

  return {
    success: true,
    restoredCount: totalRestored,
    tablesRestored,
    duration,
  }
}

// ============================================================================
// ★ Restore from uploaded JSON text (client-side backup file)
// ============================================================================

export async function restoreBackupFromJsonText(jsonText: string): Promise<RestoreResult> {
  const startTime = Date.now()

  let backupData: any

  try {
    backupData = deserializeBackup(jsonText)
  } catch (err: any) {
    throw new Error(`فایل بکاپ معتبر نیست: ${err?.message || 'خطای ناشناخته'}`)
  }

  const meta = backupData._meta || {}

  console.log(
    `[Restore] Uploaded backup: ${meta.tenantName || meta.type || 'Unknown'}`
  )

  if (meta.type === 'tenant') {
    if (!ENABLE_TENANT_RESTORE) {
      throw new Error('بازیابی تک‌فروشگاهی فعلاً غیرفعال است.')
    }

    if (meta.version !== '2.0' || meta.scoped !== true) {
      throw new Error(
        'این فایل بکاپ قدیمی است و برای بازیابی امن تک‌فروشگاهی قابل استفاده نیست. لطفاً با نسخه جدید بکاپ بگیرید.'
      )
    }

    const tenantId = meta.tenantId

    if (!tenantId) {
      throw new Error('شناسه فروشگاه در فایل بکاپ موجود نیست.')
    }

    return await prisma.$transaction(
      async (tx: SqlExecutor) => {
        return await restoreTenantBackup(tx, backupData, String(tenantId), startTime)
      },
      TX_OPTIONS
    )
  }

  if (meta.type === 'full_database') {
    throw new Error(
      'بازیابی کامل دیتابیس از فایل در این نسخه غیرفعال است. برای بکاپ کامل از پنل رانفلر استفاده کنید.'
    )
  }

  throw new Error('نوع بکاپ در فایل نامعلوم است.')
}