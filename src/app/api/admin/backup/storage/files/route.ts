// ============================================================================
// src/app/api/admin/backup/storage/files/route.ts
// List file-based backups stored on disk/storage.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import {
  getStorageBackupSummary,
  listStorageBackups,
} from '@/lib/admin/backup-storage-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeNum(value: string | null | undefined, fallback: number): number {
  if (value === null || value === undefined) return fallback

  const trimmed = String(value).trim()
  if (!trimmed) return fallback

  const n = Number(trimmed)
  return Number.isFinite(n) ? n : fallback
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams

    const items = await listStorageBackups({
      tenantId: sp.get('tenantId') || undefined,
      from: sp.get('from') || undefined,
      to: sp.get('to') || undefined,
      limit: safeNum(sp.get('limit'), 100),
      offset: safeNum(sp.get('offset'), 0),
    })

    const summary = await getStorageBackupSummary()

    return NextResponse.json({
      success: true,
      data: items,
      summary,
    })
  } catch (err: any) {
    console.error('[Admin Backup Storage Files] GET ERROR:', err)

    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to list storage backups.',
        details:
          process.env.NODE_ENV === 'development'
            ? err?.stack
            : undefined,
      },
      { status: 500 }
    )
  }
}