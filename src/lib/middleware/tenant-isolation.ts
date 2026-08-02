// ============================================================================
// src/lib/middleware/tenant-isolation.ts — Tenant Isolation Middleware (v4.0 ★★★)
// ----------------------------------------------------------------------------
// ★★★ v4.0: اصلاحات امنیتی بحرانی:
//   ★ جایگزینی decodeJwtPayload (بدون verify) با jwt.verify واقعی
//   ★ جلوگیری از دسترسی با JWT جعلی (Tenant Spoofing)
//   ★ افزودن fallback با JWT_REFRESH_SECRET
//   ★ Fail-closed: اگر secret نباشد، درخواست رد می‌شود
//
// ★★★ v3.36.4 (حفظ شد): پشتیبانی کامل از توکن‌های پورتال مشتری
//   - اگر payload.type === 'portal' باشد، کاربر به‌عنوان مشتری شناخته می‌شود
//   - نقش 'Customer' به او داده می‌شود
//   - برای مسیرهای عمومی (pos برای پرداخت آنلاین، customers خودش) دسترسی داده می‌شود
//   - برای مسیرهای مدیریتی (settings, employees, backup) دسترسی داده نمی‌شود
//
// ★ لیست مجاز برای مشتری پورتال:
//   - pos (برای /api/payments/online/request و /api/invoices)
//   - dashboard (برای /api/portal/*)
//   - customers (برای مشاهده اطلاعات خودش)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkSubscriptionStatus } from '@/lib/plan-limits'

// ★★★ v4.0: import واقعی jsonwebtoken برای verify امضا
import jwt from 'jsonwebtoken'

export interface TenantContext {
  user: any
  tenantId: string
  tenantDb: any
  isIsolated: boolean
  isTrial: boolean
  daysRemaining: number
  planName: string
  planTierName: string
  planTierNameFa: string
  billingCycle: string
  tenant?: any
  // ★★★ v3.36.4: فیلدهای جدید برای تشخیص کاربر پورتال
  isPortalUser?: boolean
  customerId?: string
}

type RouteHandler = (
  req: NextRequest,
  ctx: any,
  tenant: TenantContext
) => Promise<NextResponse> | Promise<Response>

const PERMISSION_EXPANSION: Record<string, string[]> = {
  pos: ['products', 'invoices', 'customers', 'categories'],
  settings: ['store-setting', 'payment-gateway', 'pos-device'],
  backup: ['backup'],
  employees: ['employees'],
  dashboard: ['dashboard'],
  subscription: ['subscription', 'settings', 'store-setting'],
}

const FULL_ACCESS_ROLES = ['Admin', 'Manager', 'Owner', 'admin', 'manager', 'owner']

// ★★★ v3.36.4: نقش جدید برای مشتری پورتال
//   مشتری پورتال فقط به مسیرهای زیر دسترسی دارد:
//   - pos (برای پرداخت آنلاین و مشاهده فاکتور خودش)
//   - customers (برای مشاهده اطلاعات خودش)
//   - dashboard (برای مسیرهای /api/portal/*)
const PORTAL_ALLOWED_PERMISSIONS = ['pos', 'customers', 'dashboard', 'invoices']

function checkUserPermission(userRole: string, userPermissions: any, requiredPermission: string): boolean {
  if (FULL_ACCESS_ROLES.includes(userRole)) return true

  let expandedPermissions: string[] = [requiredPermission]
  for (const [key, subPerms] of Object.entries(PERMISSION_EXPANSION)) {
    if (requiredPermission === key || subPerms.includes(requiredPermission)) {
      expandedPermissions = [key, ...subPerms]
      break
    }
  }

  let userPermsArray: string[] = []
  if (Array.isArray(userPermissions)) {
    userPermsArray = userPermissions
  } else if (typeof userPermissions === 'string') {
    if (userPermissions.trim() === 'all') return true
    try {
      const parsed = JSON.parse(userPermissions)
      if (Array.isArray(parsed)) {
        userPermsArray = parsed
      } else {
        userPermsArray = userPermissions.split(',').map((s: string) => s.trim()).filter(Boolean)
      }
    } catch {
      userPermsArray = userPermissions.split(',').map((s: string) => s.trim()).filter(Boolean)
    }
  }

  if (userPermsArray.includes('all')) return true
  return expandedPermissions.some(p => userPermsArray.includes(p))
}

function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)

  const xAuth = req.headers.get('x-authorization')
  if (xAuth?.startsWith('Bearer ')) return xAuth.slice(7)
  if (xAuth) return xAuth

  const cookieToken = req.cookies.get('token')?.value
  if (cookieToken) return cookieToken

  return null
}

// ★★★ v4.0: تابع verify واقعی JWT (جایگزین decodeJwtPayload ناامن)
// ─────────────────────────────────────────────────────────────────────────────
// قبلاً فقط payload را decode می‌کرد بدون بررسی امضا:
//   const payload = Buffer.from(parts[1], 'base64url').toString('utf-8')
//   return JSON.parse(payload)
// این یعنی هر کسی می‌توانست JWT جعلی بسازد و به داده هر tenant دسترسی پیدا کند!
//
// حالا با jwt.verify امضا را بررسی می‌کند.
// اگر secret موجود نباشد، درخواست رد می‌شود (fail-closed).
// ─────────────────────────────────────────────────────────────────────────────
function verifyJwtToken(token: string): { valid: boolean; payload: any; error?: string } {
  const secret = process.env.JWT_ACCESS_SECRET

  if (!secret) {
    console.error('[TenantIsolation] ★ CRITICAL: JWT_ACCESS_SECRET is not set!')
    return { valid: false, payload: null, error: 'JWT secret configured نشده است' }
  }

  try {
    const payload = jwt.verify(token, secret) as any
    return { valid: true, payload }
  } catch (err: any) {
    // ★ اگر verify با ACCESS_SECRET ناموفق بود، با REFRESH_SECRET هم امتحان کن
    // (برخی توکن‌ها ممکن است با secret دیگری امضا شده باشند)
    const refreshSecret = process.env.JWT_REFRESH_SECRET
    if (refreshSecret && refreshSecret !== secret) {
      try {
        const payload = jwt.verify(token, refreshSecret) as any
        return { valid: true, payload }
      } catch {
        // هر دو ناموفق — ادامه به خطا
      }
    }

    const errorMessage = err?.name === 'TokenExpiredError'
      ? 'توکن منقضی شده است'
      : err?.name === 'JsonWebTokenError'
        ? 'توکن نامعتبر است'
        : 'خطا در اعتبارسنجی توکن'

    return { valid: false, payload: null, error: errorMessage }
  }
}

async function buildTenantContext(req: NextRequest): Promise<TenantContext | NextResponse> {
  const token = extractToken(req)
  if (!token) {
    return NextResponse.json({ success: false, error: 'توکن احراز هویت الزامی است' }, { status: 401 })
  }

  // ★★★ v4.0: verify واقعی JWT (نه فقط decode)
  const { valid, payload, error } = verifyJwtToken(token)

  if (!valid || !payload) {
    return NextResponse.json(
      { success: false, error: error || 'توکن نامعتبر است', code: 'INVALID_TOKEN' },
      { status: 401 }
    )
  }

  const userId = payload.userId || payload.sub || payload.id
  const tenantId = payload.tenantId || payload.tid
  // ★★★ v3.36.4: استخراج نوع توکن و customerId (برای پورتال)
  const tokenType = payload.type
  const portalCustomerId = payload.customerId

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'شناسه فروشگاه در توکن یافت نشد' }, { status: 400 })
  }

  let tenant: any
  try {
    tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      include: { planTier: true },
    })
  } catch {
    try {
      tenant = await db.client.tenant.findUnique({ where: { id: tenantId } })
    } catch (err: any) {
      return NextResponse.json({ success: false, error: 'خطا در دریافت اطلاعات فروشگاه' }, { status: 500 })
    }
  }

  if (!tenant) {
    return NextResponse.json({ success: false, error: 'فروشگاه یافت نشد' }, { status: 404 })
  }

  let subscription: any
  try {
    subscription = await checkSubscriptionStatus(tenantId)
  } catch {
    subscription = {
      isActive: true,
      isTrial: false,
      isExpired: false,
      daysRemaining: 30,
      tierName: 'simple',
      tierNameFa: 'ساده',
      billingCycle: 'monthly',
      isIsolated: false,
    }
  }

  if (subscription.isExpired) {
    return NextResponse.json(
      { success: false, error: 'اشتراک شما منقضی شده است. لطفاً طرح خود را تمدید کنید.', code: 'SUBSCRIPTION_EXPIRED' },
      { status: 403 }
    )
  }

  const tenantDb = db.client

  let user: any = null
  let isPortalUser = false
  let customerId: string | undefined = undefined

  // ★★★ v3.36.4: تشخیص توکن پورتال
  if (tokenType === 'portal') {
    // ★ این یک توکن پورتال مشتری است
    isPortalUser = true

    // ★ دریافت اطلاعات مشتری از دیتابیس
    if (portalCustomerId) {
      try {
        const customer = await db.client.customer.findFirst({
          where: { id: portalCustomerId, tenantId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mobile: true,
            currentBalance: true,
            isBlacklisted: true,
          },
        })

        if (customer) {
          customerId = customer.id
          user = {
            id: customer.id,
            role: 'Customer',
            permissions: ['pos', 'customers', 'dashboard', 'invoices'],
            // ★ اطلاعات اضافی برای استفاده در APIها
            customerId: customer.id,
            customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
            customerMobile: customer.mobile,
            isBlacklisted: customer.isBlacklisted,
          }
        } else {
          // ★ مشتری یافت نشد — اما همچنان به او نقش Customer می‌دهیم
          //   تا بتواند مسیرهای عمومی را استفاده کند (در صورت نیاز)
          user = {
            id: portalCustomerId,
            role: 'Customer',
            permissions: ['pos', 'customers', 'dashboard'],
            customerId: portalCustomerId,
          }
          customerId = portalCustomerId
        }
      } catch (err: any) {
        console.warn('[TenantIsolation] Failed to load portal customer:', err?.message)
        // ★ fallback: همچنان به او اجازه دسترسی بده
        user = {
          id: portalCustomerId,
          role: 'Customer',
          permissions: ['pos', 'customers', 'dashboard'],
          customerId: portalCustomerId,
        }
        customerId = portalCustomerId
      }
    } else {
      // ★ توکن پورتال بدون customerId — غیرمعتبر
      return NextResponse.json(
        { success: false, error: 'توکن پورتال نامعتبر است', code: 'INVALID_PORTAL_TOKEN' },
        { status: 401 }
      )
    }
  } else if (userId) {
    // ★ توکن معمولی (StoreUser)
    try {
      user = await tenantDb.storeUser.findFirst({
        where: { id: userId, tenantId, isActive: true },
      })
    } catch {
      try {
        user = await db.client.portalUsers.findFirst({
          where: { id: userId, isActive: true },
        })
      } catch { /* ignore */ }
    }
  }

  const planTierName = subscription.tierName || tenant.planTier?.name || 'simple'
  const planTierNameFa = subscription.tierNameFa
    || tenant.planTier?.nameFa
    || (planTierName === 'simple' ? 'ساده'
      : planTierName === 'professional' ? 'حرفه‌ای'
      : planTierName === 'enterprise' ? 'سازمانی'
      : 'ساده')

  const context: TenantContext = {
    user: user || { id: userId, role: 'Cashier', permissions: [] },
    tenantId,
    tenantDb,
    isIsolated: false,
    isTrial: false,
    daysRemaining: subscription.daysRemaining ?? 0,
    planName: tenant.planName || planTierName,
    planTierName,
    planTierNameFa,
    billingCycle: subscription.billingCycle || tenant.billingCycle || 'monthly',
    tenant,
    // ★★★ v3.36.4: فیلدهای جدید
    isPortalUser,
    customerId,
  }

  return context
}

export function withTenantAndPermission(permission: string) {
  return function (handler: RouteHandler) {
    return async function (req: NextRequest, ctx: any): Promise<Response> {
      try {
        const contextOrResponse = await buildTenantContext(req)
        if (contextOrResponse instanceof NextResponse || contextOrResponse instanceof Response) {
          return contextOrResponse as Response
        }

        const tenant = contextOrResponse as TenantContext

        // ★★★ v3.36.4: کاربران پورتال فقط به دسته‌های مجاز دسترسی دارند
        if (tenant.isPortalUser) {
          if (!PORTAL_ALLOWED_PERMISSIONS.includes(permission)) {
            return NextResponse.json(
              {
                success: false,
                error: 'دسترسی مشتری پورتال به این بخش محدود است',
                code: 'PORTAL_PERMISSION_DENIED',
              },
              { status: 403 }
            )
          }
          // ★ کاربر پورتال مجاز است — skip checkUserPermission
        } else {
          // ★ کاربر معمولی StoreUser — چک دسترسی معمول
          const hasPermission = checkUserPermission(
            tenant.user?.role || 'Cashier',
            tenant.user?.permissions,
            permission
          )

          if (!hasPermission) {
            return NextResponse.json(
              { success: false, error: 'شما مجوز دسترسی به این بخش را ندارید', code: 'PERMISSION_DENIED' },
              { status: 403 }
            )
          }
        }

        const result = await handler(req, ctx, tenant)

        if (tenant.daysRemaining > 0 && tenant.daysRemaining <= 3) {
          try {
            result.headers.set('X-Subscription-Warning',
              `اشتراک شما تا ${tenant.daysRemaining} روز دیگر منقضی می‌شود`)
          } catch { /* ignore */ }
        }

        return result
      } catch (error: any) {
        console.error('[TenantIsolation] Unexpected error:', error)
        return NextResponse.json({ success: false, error: 'خطای داخلی سرور' }, { status: 500 })
      }
    }
  }
}

export function withTenantIsolation(handler: RouteHandler) {
  return async function (req: NextRequest, ctx: any): Promise<Response> {
    try {
      const contextOrResponse = await buildTenantContext(req)
      if (contextOrResponse instanceof NextResponse || contextOrResponse instanceof Response) {
        return contextOrResponse as Response
      }
      const tenant = contextOrResponse as TenantContext
      const result = await handler(req, ctx, tenant)

      if (tenant.daysRemaining > 0 && tenant.daysRemaining <= 3) {
        try {
          result.headers.set('X-Subscription-Warning',
            `اشتراک شما تا ${tenant.daysRemaining} روز دیگر منقضی می‌شود`)
        } catch { /* ignore */ }
      }
      return result
    } catch (error: any) {
      console.error('[TenantIsolation] Unexpected error:', error)
      return NextResponse.json({ success: false, error: 'خطای داخلی سرور' }, { status: 500 })
    }
  }
}

export async function getTenantContext(req: NextRequest): Promise<TenantContext | NextResponse> {
  return buildTenantContext(req)
}