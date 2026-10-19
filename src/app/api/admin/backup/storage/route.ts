// ============================================================================
// src/app/api/admin/backup/storage/create/route.ts
// Create a file-based tenant backup inside storage.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createTenantStorageBackup } from '@/lib/admin/backup-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const tenantId = String(body?.tenantId || '').trim()

    if (!tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'tenantId is required.',
          errorCode: 'MISSING_TENANT_ID',
        },
        { status: 400 }
      )
    }

    const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 7)

    const result = await createTenantStorageBackup(tenantId, {
      retentionDays: Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 7,
      createdBy: String(body?.createdBy || 'admin-storage-create'),
    })

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    console.error('[Admin Backup Storage Create] ERROR:', err)

    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Failed to create storage backup.',
        details:
          process.env.NODE_ENV === 'development'
            ? err?.stack
            : undefined,
      },
      { status: 500 }
    )
  }
}