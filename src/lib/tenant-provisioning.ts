// ============================================================================
// src/lib/tenant-provisioning.ts — STUB (v3.0)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.0 — این فایل به یک stub تبدیل شده:
//   ★ در معماری جدید، دیگه دیتابیس اختصاصی نمی‌سازیم
//   ★ همه داده‌ها در بانک مشترک ShopAccounting هستن
//   ★ این stub برای backward compat نگه داشته شده
//   ★ اگه کدی این توابع رو صدا می‌زنه، همیشه success برمی‌گردونه
// ============================================================================

export interface ProvisionResult {
  success: boolean
  dbName?: string
  connectionStringEncrypted?: string
  error?: string
}

/**
 * ★★★ v3.0: همیشه success برمی‌گردانه — دیگه دیتابیس اختصاصی نمی‌سازیم
 */
export async function provisionTenantDatabase(
  _tenantId: string,
  _masterDb?: any
): Promise<ProvisionResult> {
  console.log('[TenantProvisioning] v3.0: No provisioning needed — using shared database')
  return {
    success: true,
    dbName: 'ShopAccounting', // ★ همون بانک مشترک
    connectionStringEncrypted: '',
  }
}

/**
 * ★★★ v3.0: همیشه success برمی‌گردانه
 */
export async function provisionIsolatedTenant(_tenantId: string): Promise<ProvisionResult> {
  console.log('[TenantProvisioning] v3.0: No isolation needed — using shared database')
  return {
    success: true,
    dbName: 'ShopAccounting',
  }
}

/**
 * ★★★ v3.0: همیشه success برمی‌گردانه
 */
export async function testSqlServerConnection(): Promise<{
  success: boolean
  error?: string
  server?: string
  port?: number
}> {
  return {
    success: true,
    server: 'localhost',
    port: 1433,
  }
}

/**
 * ★★★ v3.0: این تابع هنوز کار می‌کنه چون کاربر رو در بانک مشترک ایجاد می‌کنه
 */
export async function createAdminUserDirect(params: {
  tenantId: string
  dbName?: string  // ★ در v3.0 نادیده گرفته می‌شه
  username: string
  hashedPassword: string
  mobile?: string
  email?: string
}): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    const { db } = await import('@/lib/db')

    // ★ ایجاد کاربر در بانک مشترک با tenantId
    const user = await db.client.storeUser.create({
      data: {
        username: params.username,
        password: params.hashedPassword,
        mobile: params.mobile || null,
        role: 'admin',
        isActive: true,
        tenantId: params.tenantId,
      },
    })

    return {
      success: true,
      userId: user.id,
    }
  } catch (error: any) {
    console.error('[TenantProvisioning] createAdminUserDirect error:', error.message)
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * ★ برای backward compat
 */
export function decryptConnectionString(_encrypted: string): string {
  return ''
}

export default {
  provisionTenantDatabase,
  provisionIsolatedTenant,
  testSqlServerConnection,
  createAdminUserDirect,
  decryptConnectionString,
}
