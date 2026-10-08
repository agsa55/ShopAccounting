// ============================================================================
// src/lib/admin/backup-scheduler.ts
// ★ ماژول زمان‌بندی بکاپ خودکار فروشگاه‌ها داخل استورج
// ----------------------------------------------------------------------------
// این فایل:
//   - تنظیمات زمان‌بندی را از admin_backup_schedule می‌خواند
//   - تنظیمات را ذخیره می‌کند
//   - ساعت تهران را بررسی می‌کند
//   - از اجرای همزمان یا تکراری جلوگیری می‌کند
//   - بکاپ فایل‌محور فروشگاه‌ها را با createTenantStorageBackup می‌سازد
//   - بکاپ‌های منقضی‌شده را از استورج و دیتابیس حذف می‌کند
//   - سقف تعداد بکاپ برای هر فروشگاه را اعمال می‌کند
//   - آخرین وضعیت اجرا را ثبت می‌کند
// ============================================================================

import { prisma } from '@/lib/prisma'
import { createTenantStorageBackup } from './backup-service'
import { deleteBackupFile } from './backup-storage'

// ============================================================================
// Types
// ============================================================================

export interface BackupSchedule {
  id: string
  enabled: boolean
  schedule_time: string
  timezone: string
  backup_full_database: boolean
  backup_all_tenants: boolean
  backup_selected_tenants: boolean
  selected_tenant_ids: string[]
  retention_days: number
  max_backups_per_tenant: number
  max_full_backups: number
  last_run_at: string | null
  last_run_date: string | null
  last_status: string | null
  last_error: string | null
  last_summary: any | null
  created_at: string
  updated_at: string
}

export interface BackupScheduleInput {
  enabled?: boolean
  schedule_time?: string
  timezone?: string
  backup_full_database?: boolean
  backup_all_tenants?: boolean
  backup_selected_tenants?: boolean
  selected_tenant_ids?: string[]
  retention_days?: number
  max_backups_per_tenant?: number
  max_full_backups?: number
}

export interface ScheduledBackupError {
  tenantId: string
  tenantName: string
  error: string
}

export interface ScheduledBackupRunResult {
  ran: boolean
  status: 'skipped' | 'success' | 'partial' | 'failed' | 'running'
  reason?: string
  startedAt: string
  finishedAt: string
  tenantsTotal: number
  successes: number
  errors: ScheduledBackupError[]
  deletedExpired: number
  deletedPerTenantLimit: number
  deletedFullLimit: number
  summary: any
}

// ============================================================================
// Constants
// ============================================================================

const SCHEDULE_ID = 'default'

const SCHEDULE_SELECT_COLUMNS = `
  id::text,
  enabled,
  schedule_time,
  timezone,
  backup_full_database,
  backup_all_tenants,
  backup_selected_tenants,
  selected_tenant_ids,
  retention_days,
  max_backups_per_tenant,
  max_full_backups,
  last_run_at,
  last_run_date,
  last_status,
  last_error,
  last_summary,
  created_at,
  updated_at
`

// ============================================================================
// Helpers
// ============================================================================

function toDateISO(value: any): string | null {
  if (!value) return null

  if (value instanceof Date) {
    return value.toISOString()
  }

  return String(value)
}

function parseSelectedTenantIds(value: any): string[] {
  if (!value) return []

  if (Array.isArray(value)) {
    return value
      .map((x) => String(x || '').trim())
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed
          .map((x) => String(x || '').trim())
          .filter(Boolean)
      }
    } catch {
      return []
    }
  }

  if (typeof value === 'object') {
    // Some drivers may return jsonb as object-like value.
    const values = Object.values(value)
    if (Array.isArray(values)) {
      return values
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    }
  }

  return []
}

function normalizeSchedule(row: any): BackupSchedule {
  return {
    id: String(row.id || SCHEDULE_ID),
    enabled: Boolean(row.enabled),
    schedule_time: String(row.schedule_time || '03:00'),
    timezone: String(row.timezone || 'Asia/Tehran'),
    backup_full_database: Boolean(row.backup_full_database),
    backup_all_tenants: Boolean(row.backup_all_tenants),
    backup_selected_tenants: Boolean(row.backup_selected_tenants),
    selected_tenant_ids: parseSelectedTenantIds(row.selected_tenant_ids),
    retention_days: Number(row.retention_days || 7),
    max_backups_per_tenant: Number(row.max_backups_per_tenant || 7),
    max_full_backups: Number(row.max_full_backups || 7),
    last_run_at: toDateISO(row.last_run_at),
    last_run_date: row.last_run_date ? String(row.last_run_date) : null,
    last_status: row.last_status ? String(row.last_status) : null,
    last_error: row.last_error ? String(row.last_error) : null,
    last_summary: row.last_summary ?? null,
    created_at: toDateISO(row.created_at) || new Date().toISOString(),
    updated_at: toDateISO(row.updated_at) || new Date().toISOString(),
  }
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim())
}

function clampInt(value: any, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function getTehranParts(timeZone: string = 'Asia/Tehran'): {
  date: string
  time: string
} {
  const now = new Date()
  const tz = String(timeZone || 'Asia/Tehran').trim() || 'Asia/Tehran'

  const formatInTimeZone = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now)

    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value || '00'

    const year = get('year')
    const month = get('month')
    const day = get('day')
    let hour = get('hour')
    const minute = get('minute')

    if (hour === '24') hour = '00'

    return {
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}`,
    }
  }

  try {
    return formatInTimeZone(tz)
  } catch {
    // If invalid timezone is stored, fallback to Tehran.
    return formatInTimeZone('Asia/Tehran')
  }
}

async function ensureDefaultScheduleRow(): Promise<void> {
  await prisma.$queryRawUnsafe(
    `
      INSERT INTO public.admin_backup_schedule (id)
      VALUES ($1)
      ON CONFLICT (id) DO NOTHING
    `,
    SCHEDULE_ID
  )
}

// ============================================================================
// Schedule: Read
// ============================================================================

export async function getBackupSchedule(): Promise<BackupSchedule> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT ${SCHEDULE_SELECT_COLUMNS}
      FROM public.admin_backup_schedule
      WHERE id = $1
      LIMIT 1
    `,
    SCHEDULE_ID
  )

  if (rows[0]) {
    return normalizeSchedule(rows[0])
  }

  await ensureDefaultScheduleRow()

  const rows2 = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT ${SCHEDULE_SELECT_COLUMNS}
      FROM public.admin_backup_schedule
      WHERE id = $1
      LIMIT 1
    `,
    SCHEDULE_ID
  )

  if (!rows2[0]) {
    throw new Error('سطر پیش‌فرض زمان‌بندی بکاپ ساخته نشد.')
  }

  return normalizeSchedule(rows2[0])
}

// ============================================================================
// Schedule: Save
// ============================================================================

export async function saveBackupSchedule(
  input: BackupScheduleInput
): Promise<BackupSchedule> {
  const current = await getBackupSchedule()

  const next: BackupSchedule = {
    ...current,
    ...Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined)
    ),
  } as BackupSchedule

  // Validate / normalize
  next.schedule_time = String(next.schedule_time || '03:00').trim()

  if (!isValidTime(next.schedule_time)) {
    throw new Error('ساعت اجرا باید در قالب HH:mm باشد. مثال: 03:00')
  }

  next.timezone = String(next.timezone || 'Asia/Tehran').trim() || 'Asia/Tehran'

  // Test timezone by formatting now in it.
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: next.timezone }).format(new Date())
  } catch {
    next.timezone = 'Asia/Tehran'
  }

  next.enabled = Boolean(next.enabled)
  next.backup_full_database = Boolean(next.backup_full_database)
  next.backup_all_tenants = Boolean(next.backup_all_tenants)
  next.backup_selected_tenants = Boolean(next.backup_selected_tenants)

  next.selected_tenant_ids = Array.isArray(next.selected_tenant_ids)
    ? next.selected_tenant_ids
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    : []

  next.retention_days = clampInt(next.retention_days, 1, 30, 7)
  next.max_backups_per_tenant = clampInt(next.max_backups_per_tenant, 1, 30, 7)
  next.max_full_backups = clampInt(next.max_full_backups, 1, 30, 7)

  await prisma.$queryRawUnsafe(
    `
      UPDATE public.admin_backup_schedule
      SET
        enabled = $1,
        schedule_time = $2,
        timezone = $3,
        backup_full_database = $4,
        backup_all_tenants = $5,
        backup_selected_tenants = $6,
        selected_tenant_ids = $7::jsonb,
        retention_days = $8,
        max_backups_per_tenant = $9,
        max_full_backups = $10,
        updated_at = now()
      WHERE id = $11
    `,
    next.enabled,
    next.schedule_time,
    next.timezone,
    next.backup_full_database,
    next.backup_all_tenants,
    next.backup_selected_tenants,
    JSON.stringify(next.selected_tenant_ids),
    next.retention_days,
    next.max_backups_per_tenant,
    next.max_full_backups,
    SCHEDULE_ID
  )

  return getBackupSchedule()
}

// ============================================================================
// Tenants selection
// ============================================================================

interface TenantForBackup {
  id: string
  companyName: string
  subDomain: string
}

async function getTenantsForSchedule(
  schedule: BackupSchedule
): Promise<TenantForBackup[]> {
  // اگر بکاپ همه فروشگاه‌ها فعال باشد
  if (schedule.backup_all_tenants) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
        SELECT
          id::text,
          "companyName",
          "subDomain"
        FROM public."Tenants"
        WHERE status = 'active'
        ORDER BY "createdAt" ASC
      `
    )

    return rows.map((r) => ({
      id: String(r.id),
      companyName: String(r.companyName || ''),
      subDomain: String(r.subDomain || ''),
    }))
  }

  // اگر بکاپ فروشگاه‌های انتخابی فعال باشد
  if (schedule.backup_selected_tenants && schedule.selected_tenant_ids.length > 0) {
    const ids = schedule.selected_tenant_ids

    const placeholders = ids
      .map((_, index) => `$${index + 1}::varchar`)
      .join(', ')

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
        SELECT
          id::text,
          "companyName",
          "subDomain"
        FROM public."Tenants"
        WHERE id IN (${placeholders})
        ORDER BY "createdAt" ASC
      `,
      ...ids
    )

    return rows.map((r) => ({
      id: String(r.id),
      companyName: String(r.companyName || ''),
      subDomain: String(r.subDomain || ''),
    }))
  }

  return []
}

// ============================================================================
// Cleanup expired file backups
// ============================================================================

async function cleanupExpiredFileBackups(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      storage_path: string | null
    }>
  >(
    `
      SELECT
        id::text,
        storage_path
      FROM public.admin_backups
      WHERE storage_type = 'file'
        AND expires_at IS NOT NULL
        AND expires_at < now()
    `
  )

  let deleted = 0

  for (const row of rows) {
    if (row.storage_path) {
      try {
        await deleteBackupFile(row.storage_path)
      } catch (err: any) {
        console.warn(
          `[BackupScheduler] ⚠️ Failed to delete expired file ${row.storage_path}:`,
          err?.message || err
        )
      }
    }

    await prisma.$queryRawUnsafe(
      `
        DELETE FROM public.admin_backups
        WHERE id = $1::uuid
      `,
      row.id
    )

    deleted++
  }

  return deleted
}

// ============================================================================
// Enforce max backups per tenant
// ============================================================================

async function enforceMaxBackupsPerTenant(max: number): Promise<number> {
  if (!max || max <= 0) return 0

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      storage_path: string | null
    }>
  >(
    `
      WITH ranked AS (
        SELECT
          id,
          storage_path,
          ROW_NUMBER() OVER (
            PARTITION BY tenant_id
            ORDER BY created_at DESC
          ) AS rn
        FROM public.admin_backups
        WHERE storage_type = 'file'
          AND tenant_id IS NOT NULL
      )
      SELECT
        id::text,
        storage_path
      FROM ranked
      WHERE rn > $1::int
    `,
    max
  )

  let deleted = 0

  for (const row of rows) {
    if (row.storage_path) {
      try {
        await deleteBackupFile(row.storage_path)
      } catch (err: any) {
        console.warn(
          `[BackupScheduler] ⚠️ Failed to delete over-limit file ${row.storage_path}:`,
          err?.message || err
        )
      }
    }

    await prisma.$queryRawUnsafe(
      `
        DELETE FROM public.admin_backups
        WHERE id = $1::uuid
      `,
      row.id
    )

    deleted++
  }

  return deleted
}

// ============================================================================
// Enforce max full backups
// ============================================================================

async function enforceMaxFullBackups(max: number): Promise<number> {
  if (!max || max <= 0) return 0

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      storage_path: string | null
    }>
  >(
    `
      SELECT
        id::text,
        storage_path
      FROM public.admin_backups
      WHERE storage_type = 'file'
        AND type = 'full_database'
      ORDER BY created_at DESC
      OFFSET $1::int
    `,
    max
  )

  let deleted = 0

  for (const row of rows) {
    if (row.storage_path) {
      try {
        await deleteBackupFile(row.storage_path)
      } catch (err: any) {
        console.warn(
          `[BackupScheduler] ⚠️ Failed to delete over-limit full file ${row.storage_path}:`,
          err?.message || err
        )
      }
    }

    await prisma.$queryRawUnsafe(
      `
        DELETE FROM public.admin_backups
        WHERE id = $1::uuid
      `,
      row.id
    )

    deleted++
  }

  return deleted
}

// ============================================================================
// Update schedule after run
// ============================================================================

async function updateScheduleAfterRun(
  status: string,
  error: string | null,
  summary: any
): Promise<void> {
  await prisma.$queryRawUnsafe(
    `
      UPDATE public.admin_backup_schedule
      SET
        last_status = $1::varchar,
        last_error = $2,
        last_summary = $3::jsonb,
        updated_at = now()
      WHERE id = $4
    `,
    status,
    error,
    JSON.stringify(summary || {}),
    SCHEDULE_ID
  )
}

// ============================================================================
// Claim run atomically
// ============================================================================

async function claimScheduledRun(
  tehranDate: string,
  force: boolean
): Promise<BackupSchedule | null> {
  // برای اجرای دستی force، فقط از اجرای همزمان جلوگیری می‌کنیم.
  // برای اجرای خودکار، باید enabled باشد و امروز هنوز اجرا نشده باشد،
  // مگر اینکه وضعیت running قدیمی/گیرکرده باشد.
  if (force) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
        UPDATE public.admin_backup_schedule
        SET
          last_status = 'running',
          last_run_at = now(),
          last_run_date = $1,
          updated_at = now()
        WHERE id = $2
          AND (
            last_status IS DISTINCT FROM 'running'
            OR last_run_at < now() - interval '2 hours'
          )
        RETURNING ${SCHEDULE_SELECT_COLUMNS}
      `,
      tehranDate,
      SCHEDULE_ID
    )

    return rows[0] ? normalizeSchedule(rows[0]) : null
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      UPDATE public.admin_backup_schedule
      SET
        last_status = 'running',
        last_run_at = now(),
        last_run_date = $1,
        updated_at = now()
      WHERE id = $2
        AND enabled = true
        AND (
          last_run_date IS NULL
          OR last_run_date <> $1
          OR (
            last_status = 'running'
            AND last_run_at < now() - interval '2 hours'
          )
        )
        AND (
          last_status IS DISTINCT FROM 'running'
          OR last_run_at < now() - interval '2 hours'
        )
      RETURNING ${SCHEDULE_SELECT_COLUMNS}
    `,
    tehranDate,
    SCHEDULE_ID
  )

  return rows[0] ? normalizeSchedule(rows[0]) : null
}

// ============================================================================
// Main: run scheduled backup if due
// ============================================================================

export async function runScheduledBackupIfDue(
  options: { force?: boolean } = {}
): Promise<ScheduledBackupRunResult> {
  const force = Boolean(options.force)
  const startedAt = new Date().toISOString()

  const schedule = await getBackupSchedule()
  const tehran = getTehranParts(schedule.timezone)

  if (!force) {
    if (!schedule.enabled) {
      return {
        ran: false,
        status: 'skipped',
        reason: 'disabled',
        startedAt,
        finishedAt: new Date().toISOString(),
        tenantsTotal: 0,
        successes: 0,
        errors: [],
        deletedExpired: 0,
        deletedPerTenantLimit: 0,
        deletedFullLimit: 0,
        summary: {
          message: 'زمان‌بندی بکاپ غیرفعال است.',
        },
      }
    }

    if (tehran.time < schedule.schedule_time) {
      return {
        ran: false,
        status: 'skipped',
        reason: 'not_due_yet',
        startedAt,
        finishedAt: new Date().toISOString(),
        tenantsTotal: 0,
        successes: 0,
        errors: [],
        deletedExpired: 0,
        deletedPerTenantLimit: 0,
        deletedFullLimit: 0,
        summary: {
          tehranTime: tehran.time,
          scheduleTime: schedule.schedule_time,
          message: 'هنوز ساعت تعیین‌شده نرسیده است.',
        },
      }
    }

    if (schedule.last_run_date === tehran.date) {
      return {
        ran: false,
        status: 'skipped',
        reason: 'already_run_today',
        startedAt,
        finishedAt: new Date().toISOString(),
        tenantsTotal: 0,
        successes: 0,
        errors: [],
        deletedExpired: 0,
        deletedPerTenantLimit: 0,
        deletedFullLimit: 0,
        summary: {
          tehranDate: tehran.date,
          lastRunDate: schedule.last_run_date,
          message: 'بکاپ امروز قبلاً اجرا شده است.',
        },
      }
    }
  }

  const claimed = await claimScheduledRun(tehran.date, force)

  if (!claimed) {
    return {
      ran: false,
      status: 'skipped',
      reason: 'concurrent_or_not_claimable',
      startedAt,
      finishedAt: new Date().toISOString(),
      tenantsTotal: 0,
      successes: 0,
      errors: [],
      deletedExpired: 0,
      deletedPerTenantLimit: 0,
      deletedFullLimit: 0,
      summary: {
        message: 'اجرای دیگری در حال انجام است یا شرایط اجرا فراهم نبود.',
      },
    }
  }

  const errors: ScheduledBackupError[] = []
  let successes = 0
  let tenantsTotal = 0
  let deletedExpired = 0
  let deletedPerTenantLimit = 0
  let deletedFullLimit = 0

  try {
    const tenants = await getTenantsForSchedule(claimed)
    tenantsTotal = tenants.length

    console.log(
      `[BackupScheduler] ▶️ Running scheduled backup for ${tenantsTotal} tenant(s). force=${force}`
    )

    for (const tenant of tenants) {
      try {
        await createTenantStorageBackup(tenant.id, {
          retentionDays: claimed.retention_days,
          createdBy: 'scheduler',
        })

        successes++

        console.log(
          `[BackupScheduler] ✅ Backup created for tenant: ${tenant.companyName || tenant.subDomain}`
        )
      } catch (err: any) {
        const message = err?.message || 'خطای ناشناخته'

        errors.push({
          tenantId: tenant.id,
          tenantName: tenant.companyName || tenant.subDomain || tenant.id,
          error: message,
        })

        console.error(
          `[BackupScheduler] ❌ Backup failed for tenant ${tenant.companyName || tenant.subDomain}:`,
          message
        )
      }
    }

    deletedExpired = await cleanupExpiredFileBackups()
    deletedPerTenantLimit = await enforceMaxBackupsPerTenant(
      claimed.max_backups_per_tenant
    )
    deletedFullLimit = await enforceMaxFullBackups(claimed.max_full_backups)

    const status =
      errors.length === 0
        ? 'success'
        : successes > 0
        ? 'partial'
        : 'failed'

    const summary = {
      force,
      tehranDate: tehran.date,
      tehranTime: tehran.time,
      tenantsTotal,
      successes,
      failed: errors.length,
      deletedExpired,
      deletedPerTenantLimit,
      deletedFullLimit,
      errors,
    }

    await updateScheduleAfterRun(status, null, summary)

    const finishedAt = new Date().toISOString()

    console.log(
      `[BackupScheduler] ✅ Scheduled backup finished: status=${status}, success=${successes}, failed=${errors.length}`
    )

    return {
      ran: true,
      status: status as ScheduledBackupRunResult['status'],
      startedAt,
      finishedAt,
      tenantsTotal,
      successes,
      errors,
      deletedExpired,
      deletedPerTenantLimit,
      deletedFullLimit,
      summary,
    }
  } catch (err: any) {
    const message = err?.message || 'خطای ناشناخته در اجرای زمان‌بندی بکاپ'

    const summary = {
      force,
      tehranDate: tehran.date,
      tehranTime: tehran.time,
      tenantsTotal,
      successes,
      failed: errors.length,
      deletedExpired,
      deletedPerTenantLimit,
      deletedFullLimit,
      errors,
      fatal: message,
    }

    await updateScheduleAfterRun('failed', message, summary)

    console.error('[BackupScheduler] ❌ Fatal scheduled backup error:', message)

    return {
      ran: true,
      status: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      tenantsTotal,
      successes,
      errors,
      deletedExpired,
      deletedPerTenantLimit,
      deletedFullLimit,
      summary,
    }
  }
}

// ============================================================================
// Manual helpers
// ============================================================================

export async function runScheduledBackupNow(): Promise<ScheduledBackupRunResult> {
  return runScheduledBackupIfDue({ force: true })
}

export async function getSchedulerStatus(): Promise<{
  schedule: BackupSchedule
  tehran: { date: string; time: string }
  isDue: boolean
  canRunNow: boolean
}> {
  const schedule = await getBackupSchedule()
  const tehran = getTehranParts(schedule.timezone)

  const isDue =
    schedule.enabled &&
    tehran.time >= schedule.schedule_time &&
    schedule.last_run_date !== tehran.date

  return {
    schedule,
    tehran,
    isDue,
    canRunNow: true,
  }
}