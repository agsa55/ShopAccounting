// ============================================================================
// src/lib/admin/backup-storage-admin.ts
// Admin helpers for file-based backups stored on disk/storage.
// ============================================================================

import { prisma } from '@/lib/prisma'
import {
  deleteBackupFile,
  getBackupFileStat,
  readBackupFile,
  readBackupFileMaybeDecompressed,
} from './backup-storage'
import { restoreBackupFromJsonText } from './backup-service'

// ============================================================================
// Types
// ============================================================================

export interface StorageBackupItem {
  id: string
  type: string
  tenant_id: string | null
  tenant_name: string | null
  file_name: string
  storage_path: string | null
  file_size: number
  size_original: number | null
  size_compressed: number | null
  checksum: string | null
  status: string | null
  error_message: string | null
  created_at: string
  expires_at: string | null
  downloaded_at: string | null
  archive_batch_id: string | null
  exists: boolean
  actual_size: number | null
}

export interface ListStorageBackupsOptions {
  tenantId?: string | null
  from?: string | null
  to?: string | null
  limit?: number | null
  offset?: number | null
}

export interface DeleteStorageBackupsInput {
  ids?: string[]
  all?: boolean
}

export interface DeleteStorageBackupsResult {
  deletedCount: number
  skippedCount: number
  freedBytes: number
  errors: Array<{
    id: string
    error: string
  }>
}

export interface MarkDownloadedInput {
  ids?: string[]
  all?: boolean
  archiveBatchId?: string | null
}

// ============================================================================
// Helpers
// ============================================================================

const STORAGE_SELECT = `
  id::text,
  type,
  tenant_id::text,
  tenant_name,
  file_name,
  storage_path,
  file_size::bigint,
  size_original::bigint,
  size_compressed::bigint,
  checksum,
  status,
  error_message,
  created_at,
  expires_at,
  downloaded_at,
  archive_batch_id
`

function toNumber(value: any): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toDateISO(value: any): string | null {
  if (!value) return null

  if (value instanceof Date) {
    return value.toISOString()
  }

  return String(value)
}

function clampInt(value: any, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function normalizeIdList(ids?: string[]): string[] {
  return Array.isArray(ids)
    ? ids
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    : []
}

async function attachFileStats(rows: any[]): Promise<StorageBackupItem[]> {
  return Promise.all(
    rows.map(async (row) => {
      const storagePath = row.storage_path ? String(row.storage_path) : null

      let exists = false
      let actualSize: number | null = null

      if (storagePath) {
        try {
          const st = await getBackupFileStat(storagePath)
          exists = st.exists
          actualSize = st.size ?? null
        } catch {
          exists = false
          actualSize = null
        }
      }

      return {
        id: String(row.id),
        type: String(row.type || ''),
        tenant_id: row.tenant_id ? String(row.tenant_id) : null,
        tenant_name: row.tenant_name ? String(row.tenant_name) : null,
        file_name: String(row.file_name || ''),
        storage_path: storagePath,
        file_size: toNumber(row.file_size) ?? 0,
        size_original: toNumber(row.size_original),
        size_compressed: toNumber(row.size_compressed),
        checksum: row.checksum ? String(row.checksum) : null,
        status: row.status ? String(row.status) : null,
        error_message: row.error_message ? String(row.error_message) : null,
        created_at: toDateISO(row.created_at) || new Date().toISOString(),
        expires_at: toDateISO(row.expires_at),
        downloaded_at: toDateISO(row.downloaded_at),
        archive_batch_id: row.archive_batch_id ? String(row.archive_batch_id) : null,
        exists,
        actual_size: actualSize,
      }
    })
  )
}

// ============================================================================
// List storage backups
// ============================================================================

export async function listStorageBackups(
  options: ListStorageBackupsOptions = {}
): Promise<StorageBackupItem[]> {
  const params: any[] = []
  const where: string[] = ["storage_type = 'file'"]

  if (options.tenantId) {
    params.push(String(options.tenantId).trim())
    where.push(`tenant_id = $${params.length}::varchar`)
  }

  if (options.from) {
    params.push(String(options.from))
    where.push(`created_at >= $${params.length}::timestamptz`)
  }

  if (options.to) {
    params.push(String(options.to))
    where.push(`created_at <= $${params.length}::timestamptz`)
  }

  const limit = clampInt(options.limit, 1, 500, 100)
  const offset = clampInt(options.offset, 0, 100000, 0)

  params.push(limit, offset)

  const limitIndex = params.length - 1
  const offsetIndex = params.length

  const sql = `
    SELECT ${STORAGE_SELECT}
    FROM public.admin_backups
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${limitIndex}::int
    OFFSET $${offsetIndex}::int
  `

  const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params)

  return attachFileStats(rows)
}

// ============================================================================
// Summary
// ============================================================================

export async function getStorageBackupSummary(): Promise<{
  count: number
  totalCompressed: number
  totalOriginal: number
  expiredCount: number
}> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      count: any
      total_compressed: any
      total_original: any
      expired_count: any
    }>
  >(
    `
      SELECT
        COUNT(*)::bigint AS count,
        COALESCE(SUM(COALESCE(size_compressed, file_size, 0)), 0)::bigint AS total_compressed,
        COALESCE(SUM(COALESCE(size_original, 0)), 0)::bigint AS total_original,
        COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < now())::bigint AS expired_count
      FROM public.admin_backups
      WHERE storage_type = 'file'
    `
  )

  const row = rows[0] || {}

  return {
    count: Number(row.count || 0),
    totalCompressed: Number(row.total_compressed || 0),
    totalOriginal: Number(row.total_original || 0),
    expiredCount: Number(row.expired_count || 0),
  }
}

// ============================================================================
// Get one storage backup
// ============================================================================

export async function getStorageBackupById(id: string): Promise<StorageBackupItem> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT ${STORAGE_SELECT}
      FROM public.admin_backups
      WHERE id = $1::uuid
        AND storage_type = 'file'
      LIMIT 1
    `,
    id
  )

  if (!rows[0]) {
    throw new Error('Backup file not found.')
  }

  const [item] = await attachFileStats(rows)
  return item
}

// ============================================================================
// Download storage backup as raw gzip file
// ============================================================================

export async function downloadStorageBackup(id: string): Promise<{
  item: StorageBackupItem
  fileName: string
  data: Buffer
}> {
  const item = await getStorageBackupById(id)

  if (!item.storage_path) {
    throw new Error('Storage path is missing for this backup.')
  }

  if (!item.exists) {
    throw new Error('Backup file does not exist on storage.')
  }

  const data = await readBackupFile(item.storage_path)

  return {
    item,
    fileName: item.file_name,
    data,
  }
}

// ============================================================================
// Restore directly from storage file
// ============================================================================

export async function restoreStorageBackup(id: string): Promise<any> {
  const item = await getStorageBackupById(id)

  if (!item.storage_path) {
    throw new Error('Storage path is missing for this backup.')
  }

  if (!item.exists) {
    throw new Error('Backup file does not exist on storage.')
  }

  const buffer = await readBackupFileMaybeDecompressed(item.storage_path)
  const jsonText = buffer.toString('utf-8')

  return restoreBackupFromJsonText(jsonText)
}

// ============================================================================
// Mark backups as downloaded/archived
// ============================================================================

export async function markStorageBackupsDownloaded(
  input: MarkDownloadedInput
): Promise<string[]> {
  const archiveBatchId = input.archiveBatchId ? String(input.archiveBatchId).trim() : null

  if (input.all) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `
        UPDATE public.admin_backups
        SET
          downloaded_at = now(),
          archive_batch_id = COALESCE($1::varchar, archive_batch_id),
          updated_at = now()
        WHERE storage_type = 'file'
        RETURNING id::text
      `,
      archiveBatchId
    )

    return rows.map((r) => String(r.id))
  }

  const ids = normalizeIdList(input.ids)

  if (ids.length === 0) {
    return []
  }

  const placeholders = ids.map((_, index) => `$${index + 2}::uuid`).join(', ')

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
      UPDATE public.admin_backups
      SET
        downloaded_at = now(),
        archive_batch_id = COALESCE($1::varchar, archive_batch_id),
        updated_at = now()
      WHERE storage_type = 'file'
        AND id IN (${placeholders})
      RETURNING id::text
    `,
    archiveBatchId,
    ...ids
  )

  return rows.map((r) => String(r.id))
}

// ============================================================================
// Delete storage backups from disk and DB
// ============================================================================

export async function deleteStorageBackups(
  input: DeleteStorageBackupsInput
): Promise<DeleteStorageBackupsResult> {
  let rows: any[] = []

  if (input.all) {
    rows = await prisma.$queryRawUnsafe<any[]>(
      `
        SELECT
          id::text,
          storage_path,
          COALESCE(size_compressed, file_size, 0)::bigint AS bytes
        FROM public.admin_backups
        WHERE storage_type = 'file'
      `
    )
  } else {
    const ids = normalizeIdList(input.ids)

    if (ids.length === 0) {
      return {
        deletedCount: 0,
        skippedCount: 0,
        freedBytes: 0,
        errors: [],
      }
    }

    const placeholders = ids.map((_, index) => `$${index + 1}::uuid`).join(', ')

    rows = await prisma.$queryRawUnsafe<any[]>(
      `
        SELECT
          id::text,
          storage_path,
          COALESCE(size_compressed, file_size, 0)::bigint AS bytes
        FROM public.admin_backups
        WHERE storage_type = 'file'
          AND id IN (${placeholders})
      `,
      ...ids
    )
  }

  const errors: Array<{ id: string; error: string }> = []
  let deletedCount = 0
  let skippedCount = 0
  let freedBytes = 0

  for (const row of rows) {
    const id = String(row.id)
    const storagePath = row.storage_path ? String(row.storage_path) : null

    if (storagePath) {
      try {
        await deleteBackupFile(storagePath)
      } catch (err: any) {
        errors.push({
          id,
          error: err?.message || 'Failed to delete file from storage.',
        })
        skippedCount++
        continue
      }
    }

    await prisma.$queryRawUnsafe(
      `
        DELETE FROM public.admin_backups
        WHERE id = $1::uuid
          AND storage_type = 'file'
      `,
      id
    )

    deletedCount++
    freedBytes += Number(row.bytes || 0)
  }

  return {
    deletedCount,
    skippedCount,
    freedBytes,
    errors,
  }
}