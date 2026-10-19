// ============================================================================
// src/app/api/admin/backup/restore-upload/route.ts
// Restore from uploaded backup file by admin.
// Supports both plain .json and gzipped .json.gz files.
// ============================================================================

import { restoreBackupFromJsonText } from '@/lib/admin/backup-service'
import { gunzipSync } from 'zlib'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    console.log('[API Backup Restore Upload] request received')

    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      console.warn('[API Backup Restore Upload] no file received')

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Backup file was not provided.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const MAX_SIZE = 200 * 1024 * 1024 // 200MB

    if (file.size > MAX_SIZE) {
      console.warn('[API Backup Restore Upload] file too large:', file.size)

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Backup file is too large.',
        }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buf = Buffer.from(arrayBuffer)

    if (!buf || buf.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Backup file is empty.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const isGzip = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b

    let text: string

    try {
      text = isGzip ? gunzipSync(buf).toString('utf-8') : buf.toString('utf-8')
    } catch (err: any) {
      console.error('[API Backup Restore Upload] decompression error:', err)

      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid gzip backup file: ${err?.message || 'unknown error'}`,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    if (!text || !text.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Backup file content is empty.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('[API Backup Restore Upload] restoring from uploaded file:', {
      fileName: file.name,
      fileSize: file.size,
      isGzip,
    })

    const result = await restoreBackupFromJsonText(text)

    console.log('[API Backup Restore Upload] restore completed:', {
      restoredCount: result?.restoredCount,
      tablesRestored: result?.tablesRestored?.length,
      duration: result?.duration,
    })

    return new Response(
      JSON.stringify({
        success: true,
        data: result,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (err: any) {
    console.error('[API Backup Restore Upload] Error:', err)

    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Failed to restore backup.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}