// ============================================================================
// src/app/api/admin/backup/storage/downloaded/route.ts
// Mark storage backups as downloaded/archived.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { markStorageBackupsDownloaded } from '@/lib/admin/backup-storage-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    const ids = Array.isArray(body?.ids)
      ? body.ids.map((x: any) => String(x || '').trim()).filter(Boolean)
      : []

    const all = Boolean(body?.all)
    const archiveBatchId = body?.archiveBatchId
      ? String(body.archiveBatchId).trim()
      : null

    if (!all && ids.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'ids or all=true is required.',
          errorCode: 'MISSING_TARGETS',
        },
        { status: 400 }
      )
    }

    const updatedIds = await markStorageBackupsDownloaded({
      ids,
      all,
      archiveBatchId,
    })

    return NextResponse.json({
      success: true,
      data: {
        updatedCount: updatedIds.length,
        updatedIds,
      },
    })
  } catch (err: any) {
    console.error('[Admin Backup Storage Downloaded] ERROR:', err)

    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to mark storage backups as downloaded.',
        details:
          process.env.NODE_ENV === 'development'
            ? err?.stack
            : undefined,
      },
      { status: 500 }
    )
  }
}