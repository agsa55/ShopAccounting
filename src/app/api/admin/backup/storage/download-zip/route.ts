// ============================================================================
// src/app/api/admin/backup/storage/download-zip/route.ts
// Download selected or all file-based backups as ZIP.
// Uses fflate. Supports ?format=json for debugging.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { zipSync } from 'fflate'
import {
  getStorageBackupById,
  listStorageBackups,
} from '@/lib/admin/backup-storage-admin'
import { readBackupFile } from '@/lib/admin/backup-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function padTwo(n: number): string {
  return String(n).padStart(2, '0')
}

function buildZipFileName(): string {
  const now = new Date()

  const stamp = [
    now.getFullYear(),
    padTwo(now.getMonth() + 1),
    padTwo(now.getDate()),
    '-',
    padTwo(now.getHours()),
    '-',
    padTwo(now.getMinutes()),
  ].join('')

  return `runflare-backups-${stamp}.zip`
}

function normalizeIds(ids: any): string[] {
  if (!Array.isArray(ids)) return []

  return ids
    .map((x) => String(x || '').trim())
    .filter(Boolean)
}

function bufferToUint8(buf: Buffer): Uint8Array {
  return Uint8Array.from(buf)
}

function textToUint8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function uniqueEntryName(fileName: string, id: string, used: Set<string>): string {
  let name = `backups/${fileName || `backup-${id}.zip`}`

  if (!used.has(name)) {
    used.add(name)
    return name
  }

  const dotIndex = name.lastIndexOf('.')
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name
  const ext = dotIndex > 0 ? name.slice(dotIndex) : ''

  let counter = 1
  let candidate = `${base}-${counter}${ext}`

  while (used.has(candidate)) {
    counter++
    candidate = `${base}-${counter}${ext}`
  }

  used.add(candidate)
  return candidate
}

export async function POST(req: NextRequest) {
  try {
    console.log('[Backup ZIP] ▶️ route hit')

    const format = req.nextUrl.searchParams.get('format') || 'binary'

    const body = await req.json().catch(() => ({}))

    const all = Boolean(body?.all)
    const ids = normalizeIds(body?.ids)

    console.log('[Backup ZIP] request parsed:', {
      format,
      all,
      idsCount: ids.length,
    })

    if (!all && ids.length === 0) {
      console.warn('[Backup ZIP] ❌ missing targets')

      return NextResponse.json(
        {
          success: false,
          error: 'ids or all=true is required.',
          errorCode: 'MISSING_TARGETS',
        },
        { status: 400 }
      )
    }

    let items: any[] = []

    if (all) {
      items = await listStorageBackups({ limit: 500 })
    } else {
      const resolved = await Promise.all(
        ids.map(async (id) => {
          try {
            return await getStorageBackupById(id)
          } catch {
            return null
          }
        })
      )

      items = resolved.filter(Boolean)
    }

    console.log('[Backup ZIP] items loaded:', items.length)

    items = items.filter((item) => item?.storage_path && item?.exists)

    console.log('[Backup ZIP] valid items:', items.length)

    if (items.length === 0) {
      console.warn('[Backup ZIP] ❌ no valid files')

      return NextResponse.json(
        {
          success: false,
          error: 'No valid backup files found in storage.',
          errorCode: 'NO_BACKUP_FILES',
        },
        { status: 404 }
      )
    }

    const files: Record<string, Uint8Array | [Uint8Array, any]> = {}
    const usedNames = new Set<string>()

    const manifest: any = {
      generatedAt: new Date().toISOString(),
      source: 'runflare-local-storage',
      count: items.length,
      files: [],
    }

    for (const item of items) {
      const storagePath = String(item.storage_path)

      console.log('[Backup ZIP] reading file:', storagePath)

      const buffer = await readBackupFile(storagePath)

      const entryName = uniqueEntryName(
        String(item.file_name || ''),
        String(item.id || ''),
        usedNames
      )

      files[entryName] = [
        bufferToUint8(buffer),
        {
          mtime: item.created_at ? new Date(item.created_at) : new Date(),
        },
      ]

      manifest.files.push({
        id: item.id,
        fileName: item.file_name,
        entryName,
        storagePath: item.storage_path,
        tenantId: item.tenant_id || null,
        tenantName: item.tenant_name || null,
        sizeCompressed:
          item.size_compressed ?? item.actual_size ?? item.file_size ?? null,
        sizeOriginal: item.size_original ?? null,
        checksum: item.checksum || null,
        createdAt: item.created_at || null,
        expiresAt: item.expires_at || null,
        downloadedAt: item.downloaded_at || null,
        archiveBatchId: item.archive_batch_id || null,
      })
    }

    files['manifest.json'] = textToUint8(
      JSON.stringify(manifest, null, 2)
    )

    console.log('[Backup ZIP] zipping files:', Object.keys(files).length)

    const zipBytes = zipSync(files)
    const zipBuffer = Buffer.from(zipBytes)

    console.log('[Backup ZIP] zip created:', {
      byteLength: zipBuffer.byteLength,
    })

    const fileName = buildZipFileName()
    const asciiFileName = fileName.replace(/[^\x20-\x7E]/g, '_')

    // ------------------------------------------------------------------------
    // Debug mode: return base64 JSON instead of binary.
    // Use this if binary Response gives 204 in your Next/Turbopack setup.
    // ------------------------------------------------------------------------
    if (format === 'json') {
      console.log('[Backup ZIP] returning JSON base64 response')

      return NextResponse.json({
        success: true,
        data: {
          fileName,
          count: items.length,
          size: zipBuffer.byteLength,
          zipBase64: zipBuffer.toString('base64'),
        },
      })
    }

    const headers = new Headers()
    headers.set('Content-Type', 'application/zip')
    headers.set(
      'Content-Disposition',
      `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(
        fileName
      )}`
    )
    headers.set('X-ZIP-File-Name', encodeURIComponent(fileName))
    headers.set('X-ZIP-File-Count', String(items.length))

    console.log('[Backup ZIP] returning binary response')

    return new NextResponse(zipBuffer, {
      status: 200,
      headers,
    })
  } catch (err: any) {
    console.error('[Backup ZIP] ❌ ERROR:', err)

    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to create ZIP archive.',
        details:
          process.env.NODE_ENV === 'development'
            ? err?.stack
            : undefined,
      },
      { status: 500 }
    )
  }
}