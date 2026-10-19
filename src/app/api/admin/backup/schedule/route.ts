// ============================================================================
// src/app/api/admin/backup/schedule/route.ts
// Admin backup schedule API
// ----------------------------------------------------------------------------
// GET:
//   Read current schedule settings and status
//
// POST:
//   Save schedule settings
//   Or manually run scheduled backup with action: "run"
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import {
  getBackupSchedule,
  getSchedulerStatus,
  runScheduledBackupNow,
  saveBackupSchedule,
} from '@/lib/admin/backup-scheduler'
import type { BackupScheduleInput } from '@/lib/admin/backup-scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function asBool(value: any): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off'].includes(normalized)) return false
  }

  return Boolean(value)
}

function asString(value: any): string | undefined {
  if (value === undefined) return undefined
  return String(value || '').trim()
}

function asNumber(value: any): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function asStringArray(value: any): string[] | undefined {
  if (value === undefined) return undefined

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

  return []
}

export async function GET(_req: NextRequest) {
  try {
    const [schedule, status] = await Promise.all([
      getBackupSchedule(),
      getSchedulerStatus(),
    ])

    return NextResponse.json({
      success: true,
      data: schedule,
      status,
    })
  } catch (err: any) {
    console.error('[Admin Backup Schedule] GET ERROR:', err)

    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to load backup schedule',
        details:
          process.env.NODE_ENV === 'development'
            ? err?.stack
            : undefined,
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    if (body?.action === 'run') {
      console.log('[Admin Backup Schedule] Manual run requested')

      const result = await runScheduledBackupNow()

      console.log(
        `[Admin Backup Schedule] Manual run finished: ran=${result.ran}, status=${result.status}`
      )

      return NextResponse.json({
        success: true,
        data: result,
      })
    }

    const input: BackupScheduleInput = {}

    if ('enabled' in body) {
      input.enabled = asBool(body.enabled)
    }

    if ('schedule_time' in body) {
      input.schedule_time = asString(body.schedule_time)
    }

    if ('timezone' in body) {
      input.timezone = asString(body.timezone)
    }

    if ('backup_full_database' in body) {
      input.backup_full_database = asBool(body.backup_full_database)
    }

    if ('backup_all_tenants' in body) {
      input.backup_all_tenants = asBool(body.backup_all_tenants)
    }

    if ('backup_selected_tenants' in body) {
      input.backup_selected_tenants = asBool(body.backup_selected_tenants)
    }

    if ('selected_tenant_ids' in body) {
      input.selected_tenant_ids = asStringArray(body.selected_tenant_ids)
    }

    if ('retention_days' in body) {
      input.retention_days = asNumber(body.retention_days)
    }

    if ('max_backups_per_tenant' in body) {
      input.max_backups_per_tenant = asNumber(body.max_backups_per_tenant)
    }

    if ('max_full_backups' in body) {
      input.max_full_backups = asNumber(body.max_full_backups)
    }

    if (Object.keys(input).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No schedule input provided.',
          errorCode: 'EMPTY_SCHEDULE_INPUT',
        },
        { status: 400 }
      )
    }

    console.log('[Admin Backup Schedule] Saving schedule settings', input)

    const schedule = await saveBackupSchedule(input)

    console.log('[Admin Backup Schedule] Schedule saved')

    return NextResponse.json({
      success: true,
      data: schedule,
    })
  } catch (err: any) {
    console.error('[Admin Backup Schedule] POST ERROR:', err)

    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to save or run backup schedule',
        details:
          process.env.NODE_ENV === 'development'
            ? err?.stack
            : undefined,
      },
      { status: 500 }
    )
  }
}