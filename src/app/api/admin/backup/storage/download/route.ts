// ============================================================================
// src/app/api/admin/backup/storage/download/route.ts
// Download one file-based backup from storage.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { downloadStorageBackup } from '@/lib/admin/backup-storage-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')

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

    const { fileName, data } = await downloadStorageBackup(id)

    const uint8 = new Uint8Array(data)
    const asciiFileName = fileName.replace(/[^\x20-\x7E]/g, '_')

    const headers = new Headers()
    headers.set('Content-Type', 'application/octet-stream')
    headers.set(
      'Content-Disposition',
      `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    )
    headers.set('X-Backup-File-Name', encodeURIComponent(fileName))
    headers.set('Content-Length', String(data.length))

    return new Response(uint8, {
      status: 200,
      headers,
    })
  } catch (err: any) {
    console.error('[Admin Backup Storage Download] ERROR:', err)

    const message = err?.message || 'Failed to download storage backup.'

    const status =
      message.includes('not found') ||
      message.includes('does not exist')
        ? 404
        : 500

    return NextResponse.json(
      {
        success: false,
        error: message,
        details:
          process.env.NODE_ENV === 'development'
            ? err?.stack
            : undefined,
      },
      { status }
    )
  }
}