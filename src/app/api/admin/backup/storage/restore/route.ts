// ============================================================================
// src/app/api/admin/backup/storage/restore/route.ts
// Restore directly from a file-based backup stored on disk/storage.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { restoreStorageBackup } from '@/lib/admin/backup-storage-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const id = String(body?.id || '').trim()

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'id is required.',
          errorCode: 'MISSING_BACKUP_ID',
        },
        { status: 400 }
      )
    }

    const result = await restoreStorageBackup(id)

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    console.error('[Admin Backup Storage Restore] ERROR:', err)

    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to restore storage backup.',
        details:
          process.env.NODE_ENV === 'development'
            ? err?.stack
            : undefined,
      },
      { status: 500 }
    )
  }
}