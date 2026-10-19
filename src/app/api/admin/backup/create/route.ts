// ============================================================================
// src/app/api/admin/backup/create/route.ts
// ★ API ساخت بکاپ دستی فروشگاه به‌صورت فایل‌محور
// ----------------------------------------------------------------------------
// این endpoint:
//   - بکاپ فروشگاه را می‌سازد
//   - فایل JSON را به مرورگر برمی‌گرداند
//   - فقط متادیتا را در admin_backups ذخیره می‌کند
//   - ستون data را NULL می‌گذارد
// ============================================================================

import {
  buildTenantBackup,
  registerClientBackupMetadata,
} from '@/lib/admin/backup-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    // ========================================================================
    // ★ نکته امنیتی مهم
    // ------------------------------------------------------------------------
    // اگر در پروژه شما middleware یا helper برای احراز هویت ادمین وجود دارد،
    // حتماً اینجا اضافه کنید.
    //
    // مثال:
    // const session = await getServerSession(authOptions)
    // if (!session?.user?.isAdmin) {
    //   return new Response(
    //     JSON.stringify({ success: false, error: 'دسترسی غیرمجاز' }),
    //     { status: 401, headers: { 'Content-Type': 'application/json' } }
    //   )
    // }
    // ========================================================================

    let body: any

    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'بدنه درخواست JSON معتبر نیست.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const tenantId = String(body?.tenantId || '').trim()

    if (!tenantId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'شناسه فروشگاه ارسال نشده است.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const createdBy = String(body?.createdBy || 'admin').trim() || 'admin'

    console.log(`[API Backup Create] Building backup for tenant: ${tenantId}`)

    const built = await buildTenantBackup(tenantId)

    const backupId = await registerClientBackupMetadata(built, createdBy)

    const uint8 = new Uint8Array(built.jsonBuffer)

    const asciiFileName = built.fileName.replace(/[^\x20-\x7E]/g, '_')

    const headers = new Headers()
  headers.set('Content-Type', 'application/octet-stream')
    headers.set(
      'Content-Disposition',
      `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(
        built.fileName
      )}`
    )
    headers.set('X-Backup-File-Name', encodeURIComponent(built.fileName))
    headers.set('X-Backup-Record-Count', String(built.recordCount))
    headers.set('X-Backup-Size', String(built.jsonBuffer.length))

    if (backupId) {
      headers.set('X-Backup-Id', backupId)
    }

    console.log(
      `[API Backup Create] Backup ready: ${built.fileName} (${built.recordCount} records)`
    )

    return new Response(uint8, {
      status: 200,
      headers,
    })
  } catch (err: any) {
    console.error('[API Backup Create] Error:', err)

    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'خطای ناشناخته در ساخت بکاپ',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}