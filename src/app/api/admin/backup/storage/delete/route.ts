// ============================================================================
// src/app/api/admin/backup/storage/delete/route.ts
// Delete file-based backups from storage and DB.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { deleteStorageBackups } from '@/lib/admin/backup-storage-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    const confirmText = String(body?.confirmText || '').trim()

    if (confirmText !== 'DELETE') {
      return NextResponse.json(
        {
          success: false,
          error: 'confirmText must be DELETE.',
          errorCode: 'CONFIRM_REQUIRED',
        },
        { status: 400 }
      )
    }

    const ids = Array.isArray(body?.ids)
      ? body.ids.map((x: any) => String(x || '').trim()).filter(Boolean)
      : []

    const all = Boolean(body?.all)

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

    const result = await deleteStorageBackups({ ids, all })

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    console.error('[Admin Backup Storage Delete] ERROR:', err)

    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to delete storage backups.',
        details:
          process.env.NODE_ENV === 'development'
            ? err?.stack
            : undefined,
      },
      { status: 500 }
    )
  }
}