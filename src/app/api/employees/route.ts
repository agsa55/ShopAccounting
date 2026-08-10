// ============================================================================
// src/app/api/employees/route.ts
// ShopAccounting v11.0 — Store Employees/Users API
// ============================================================================
// ★★★ v11.0 تغییرات:
//   ★ اعمال دقیق محدودیت کاربران بر اساس پلن (پایه:2، پیشرفته:5، حرفه‌ای:∞)
//   ★ فیلتر مجوزها بر اساس قابلیت‌های فعال پلن در POST و PUT
//   ★ چک محدودیت در فعال‌سازی کاربر غیرفعال (PUT)
//   ★ محدودیت ۱ مدیر در پلن‌های غیر-نامحدود
//   ★ نمایش اطلاعات دقیق‌تر planLimits در GET
// ★ اصلاح v10: lastLogin → lastLoginAt (نام ستون واقعی)
// ★ اصلاح: fallback برای ستون‌های مفقود (مثل نسخه login)
// ★ اصلاح: تبدیل امن permissions به آرایه
// ★ اصلاح: استفاده از الگوی curried برای withTenantAndPermission
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { requireSubscriptionAndLimit } from '@/lib/plan-guard'
import { checkPlanLimit, PLAN_LIMITS } from '@/lib/plan-limits'
import { PLANS, getFeaturesByPlanName, resolvePlanName, type PlanName } from '@/lib/plan-features'
import bcrypt from 'bcryptjs'

// ─── تابع امن تبدیل permissions به آرایه ──────────────────────

function parsePermissions(permissions: any): string[] {
  if (permissions == null) return []
  if (Array.isArray(permissions)) return permissions
  if (typeof permissions === 'string') {
    const trimmed = permissions.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed
      if (typeof parsed === 'string') {
        if (parsed === 'all') return ['all']
        return parsed.split(',').map((s: string) => s.trim()).filter(Boolean)
      }
      return []
    } catch {
      if (trimmed === 'all') return ['all']
      if (trimmed.includes(',')) {
        return trimmed.split(',').map((s: string) => s.trim()).filter(Boolean)
      }
      return [trimmed]
    }
  }
  return []
}

// ═══════════════════════════════════════════════════════════════
//  ★★★ v11.0: توابع کمکی برای محاسبه دقیق محدودیت پلن
// ═══════════════════════════════════════════════════════════════

/**
 * دریافت حداکثر تعداد کاربران مجاز بر اساس نام پلن
 * می‌خواند از PLANS در plan-features.ts (مرجع اصلی)
 */
function getMaxUsersForPlan(planNameInput: string | null | undefined): number {
  const resolved = resolvePlanName(planNameInput)
  const planInfo = PLANS[resolved]
  return planInfo?.maxUsers ?? 2 // fallback به 2 (پلن پایه)
}

/**
 * تشخیص پلن واقعی tenant از داده‌های مختلف
 */
function resolveTenantPlanName(tenant: any): PlanName {
  const candidates = [
    tenant?.planName,
    tenant?.tenant?.planName,
    tenant?.tenant?.planTier?.name,
    tenant?.planTierName,
    tenant?.tenant?.planTierName,
  ].filter(Boolean)
  
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      return resolvePlanName(c)
    }
  }
  return 'simple'
}

/**
 * فیلتر مجوزها بر اساس قابلیت‌های فعال پلن
 * فقط مجوزهایی که در پلن فعلی فعال هستند، نگه داشته می‌شوند
 */
function filterPermissionsByPlan(perms: string[], planName: PlanName): string[] {
  if (!Array.isArray(perms) || perms.length === 0) return []
  if (perms.includes('all')) return ['all'] // مدیر → دسترسی کامل
  
  const features = getFeaturesByPlanName(planName)
  
  // نگاشت permission keys به feature flags
  const PERM_TO_FEATURE: Record<string, keyof typeof features | null> = {
    'dashboard': null,          // همیشه فعال
    'pos': null,                // همیشه فعال
    'products': null,           // همیشه فعال
    'categories': null,         // همیشه فعال
    'customers': null,          // همیشه فعال
    'invoices': null,           // همیشه فعال
    'reports': null,            // همیشه فعال
    'installments': 'canAccessInstallments',
    'accounting': 'canTrialBalance',
  }
  
  return perms.filter((perm) => {
    const featureKey = PERM_TO_FEATURE[perm]
    // اگر نگاشت نشده → فعال فرض کن (backward compatibility)
    if (featureKey === null || featureKey === undefined) return true
    // چک کن که آیا این قابلیت در پلن فعال است
    const featureValue = features[featureKey]
    return featureValue === true
  })
}

/**
 * شمارش کاربران فعال tenant
 */
async function countActiveUsers(tenantDb: any, tenantId: string): Promise<number> {
  try {
    return await tenantDb.storeUser.count({
      where: {
        tenantId,
        isActive: true,
      },
    })
  } catch {
    return 0
  }
}

/**
 * شمارش مدیران فعال tenant
 */
async function countActiveManagers(tenantDb: any, tenantId: string): Promise<number> {
  try {
    return await tenantDb.storeUser.count({
      where: {
        tenantId,
        role: { in: ['Manager', 'Admin'] },
        isActive: true,
      },
    })
  } catch {
    return 0
  }
}

/**
 * جستجوی کارکنان — با fallback برای ستون‌های مفقود
 * ابتدا با select کامل (شامل lastLoginAt)
 * اگه خطا خورد، fallback به select ساده
 */
async function findEmployees(tenantDb: any, where: any) {
  // ★ تلاش اول: select کامل با lastLoginAt
  try {
    const employees = await tenantDb.storeUser.findMany({
      where,
      select: {
        id: true,
        username: true,
        role: true,
        permissions: true,
        mobile: true,
        isActive: true,
        lastLoginAt: true,  // ★ نام صحیح ستون
        storeId: true,
        storeName: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return { employees, hasLastLoginAt: true }
  } catch (err: any) {
    if (err?.message?.includes('lastLoginAt') || err?.message?.includes('Unknown field')) {
      console.warn('[Employees] lastLoginAt not found, using fallback select')
    } else if (err?.message?.includes('Invalid column') || err?.message?.includes('does not exist')) {
      console.warn('[Employees] Some columns missing, using fallback select')
    } else {
      throw err
    }

    // ★ fallback: select ساده بدون ستون‌های مشکوک
    try {
      const employees = await tenantDb.storeUser.findMany({
        where,
        select: {
          id: true,
          username: true,
          role: true,
          permissions: true,
          mobile: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })
      return { employees, hasLastLoginAt: false }
    } catch (err2: any) {
      console.error('[Employees] Even fallback select failed:', err2?.message)
      return { employees: [], hasLastLoginAt: false }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/employees — لیست کارکنان
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('employees')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const isIsolated = tenant.isIsolated

    // ★★★ v23-fix: همیشه tenantId فیلتر بشه
    const where = { tenantId }

    // ★ استفاده از تابع fallback
    const { employees, hasLastLoginAt } = await findEmployees(tenantDb, where)

    // ★ خواندن هر دو نوع محدودیت (برای backward compatibility)
    const userLimit = await checkPlanLimit(tenantId, 'users')
    
    // ★★★ v11.0: خواندن مستقیم از PLANS (مرجع اصلی)
    const resolvedPlanName = resolveTenantPlanName(tenant)
    const planInfo = PLANS[resolvedPlanName]
    const maxUsers = planInfo?.maxUsers ?? 0
    const isUnlimited = maxUsers === 0
    
    // شمارش دقیق کاربران فعال
    const activeCount = await countActiveUsers(tenantDb, tenantId)
    const totalCount = employees.length
    const remaining = isUnlimited ? -1 : Math.max(0, maxUsers - activeCount)
    const canAdd = isUnlimited || activeCount < maxUsers
    
    const tierName = tenant.planTierName || tenant.tenant?.planTier?.name || tenant.planName || 'simple'

    return NextResponse.json({
      success: true,
      data: {
        employees: employees.map((emp: any) => ({
          id: emp.id,
          username: emp.username,
          role: emp.role,
          permissions: parsePermissions(emp.permissions),
          mobile: emp.mobile || '',
          isActive: emp.isActive,
          lastLogin: hasLastLoginAt
            ? (emp.lastLoginAt?.toISOString() || null)
            : null,
          storeId: emp.storeId || null,
          storeName: emp.storeName || null,
        })),
        // ★ backward compatible
        planLimits: {
          maxUsers: maxUsers,
          currentCount: activeCount,
          totalCount: totalCount,
          remaining: remaining,
          canAdd: canAdd,
          isUnlimited: isUnlimited,
          planTierName: tierName,
          planLabel: planInfo?.label || 'پایه',
          planName: resolvedPlanName,
        },
      },
    })
  } catch (error: any) {
    console.error('[Employees GET] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری کارکنان' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/employees — افزودن کاربر جدید
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('employees')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    await requireSubscriptionAndLimit(tenant.tenantId, 'users')

    const body = await req.json()
    const { username, password, mobile, role, permissions } = body

    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیران اجازه افزودن کاربر را دارند' },
        { status: 403 }
      )
    }

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'نام کاربری و رمز عبور الزامی است' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' },
        { status: 400 }
      )
    }

    const tenantDb = tenant.tenantDb
    const isIsolated = tenant.isIsolated
    const tenantId = tenant.tenantId

    // ★★★ v11.0: چک دقیق محدودیت کاربران بر اساس پلن
    const resolvedPlanName = resolveTenantPlanName(tenant)
    const planInfo = PLANS[resolvedPlanName]
    const maxUsers = planInfo?.maxUsers ?? 0
    const isUnlimited = maxUsers === 0
    
    const activeCount = await countActiveUsers(tenantDb, tenantId)
    
    if (!isUnlimited && activeCount >= maxUsers) {
      return NextResponse.json(
        { 
          success: false, 
          error: `سقف کاربران پلن ${planInfo?.label || 'فعلی'} (${maxUsers} کاربر) تکمیل شده است. برای افزودن کاربر بیشتر، پلن خود را ارتقا دهید.`,
          code: 'PLAN_LIMIT_USERS' 
        },
        { status: 403 }
      )
    }

    // ★★★ v11.0: محدودیت ۱ مدیر در پلن‌های غیر-نامحدود
    if (role === 'Manager' && !isUnlimited) {
      const managerCount = await countActiveManagers(tenantDb, tenantId)
      if (managerCount >= 1) {
        return NextResponse.json(
          { 
            success: false, 
            error: `در پلن ${planInfo?.label || 'فعلی'} فقط یک کاربر با نقش مدیر مجاز است. برای مدیران بیشتر، پلن حرفه‌ای را تهیه کنید.`,
            code: 'PLAN_LIMIT_MANAGERS'
          },
          { status: 403 }
        )
      }
    }

    const existing = await tenantDb.storeUser.findFirst({
      where: { username },
    })

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'این نام کاربری قبلاً ثبت شده است' },
        { status: 409 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    
    // ★★★ v11.0: فیلتر مجوزها بر اساس قابلیت‌های پلن
    const rawPerms = parsePermissions(permissions)
    const filteredPerms = filterPermissionsByPlan(rawPerms, resolvedPlanName)
    const permsString = role === 'Manager' ? JSON.stringify(['all']) : JSON.stringify(filteredPerms)

    const newEmployee = await tenantDb.storeUser.create({
      data: {
        username,
        password: hashedPassword,
        mobile: mobile || null,
        role: role || 'Cashier',
        permissions: permsString,
        isActive: true,
        tenantId: tenantId,  // ★★★ v23-fix: همیشه tenantId ارسال بشه
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        employee: {
          id: newEmployee.id,
          username: newEmployee.username,
          role: newEmployee.role,
          permissions: parsePermissions(newEmployee.permissions),
          mobile: newEmployee.mobile,
          isActive: newEmployee.isActive,
        },
        // ★ اطلاعات محدودیت برای به‌روزرسانی UI
        planLimits: {
          maxUsers: maxUsers,
          currentCount: activeCount + 1,
          remaining: isUnlimited ? -1 : Math.max(0, maxUsers - activeCount - 1),
          canAdd: isUnlimited || (activeCount + 1) < maxUsers,
          isUnlimited: isUnlimited,
          planLabel: planInfo?.label || 'پایه',
        },
      },
    })
  } catch (error: any) {
    if (error.message?.includes('PLAN_LIMIT')) {
      return NextResponse.json(
        { success: false, error: error.message, code: 'PLAN_LIMIT_USERS' },
        { status: 403 }
      )
    }
    console.error('[Employees POST] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در افزودن کاربر' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/employees — ویرایش کاربر
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('employees')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const body = await req.json()
    // ★★★ v3.16: پشتیبانی از employeeId, id, userId, و _id
    const employeeId = body.employeeId || body.id || body.userId || body._id

    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیران اجازه ویرایش کاربر را دارند' },
        { status: 403 }
      )
    }

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'شناسه کاربر الزامی است' },
        { status: 400 }
      )
    }

    const tenantDb = tenant.tenantDb
    const isIsolated = tenant.isIsolated
    const tenantId = tenant.tenantId

    const existing = await tenantDb.storeUser.findFirst({
      where: {
        id: employeeId,
        tenantId: tenantId,  // ★★★ v23-fix: همیشه tenantId فیلتر بشه
      },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'کاربر یافت نشد' },
        { status: 404 }
      )
    }

    // ★★★ v11.0: چک محدودیت‌ها قبل از اعمال تغییرات
    const resolvedPlanName = resolveTenantPlanName(tenant)
    const planInfo = PLANS[resolvedPlanName]
    const maxUsers = planInfo?.maxUsers ?? 0
    const isUnlimited = maxUsers === 0

    // ★★★ v11.0: اگر در حال فعال‌سازی کاربر غیرفعال است، چک سقف
    if (body.isActive === true && existing.isActive === false) {
      const activeCount = await countActiveUsers(tenantDb, tenantId)
      if (!isUnlimited && activeCount >= maxUsers) {
        return NextResponse.json(
          { 
            success: false, 
            error: `سقف کاربران فعال پلن ${planInfo?.label || 'فعلی'} (${maxUsers} کاربر) تکمیل شده است. ابتدا یک کاربر دیگر را غیرفعال یا حذف کنید.`,
            code: 'PLAN_LIMIT_USERS'
          },
          { status: 403 }
        )
      }
    }

    // ★★★ v11.0: اگر در حال تغییر نقش به Manager است، چک محدودیت مدیر
    if (body.role === 'Manager' && existing.role !== 'Manager' && !isUnlimited) {
      const managerCount = await countActiveManagers(tenantDb, tenantId)
      if (managerCount >= 1) {
        return NextResponse.json(
          { 
            success: false, 
            error: `در پلن ${planInfo?.label || 'فعلی'} فقط یک کاربر با نقش مدیر مجاز است.`,
            code: 'PLAN_LIMIT_MANAGERS'
          },
          { status: 403 }
        )
      }
    }

    const updateData: Record<string, any> = {}
    if (body.isActive !== undefined) updateData.isActive = body.isActive
    
    // ★★★ v11.0: فیلتر مجوزها بر اساس قابلیت‌های پلن
    if (body.permissions !== undefined) {
      const rawPerms = parsePermissions(body.permissions)
      const filteredPerms = filterPermissionsByPlan(rawPerms, resolvedPlanName)
      updateData.permissions = JSON.stringify(filteredPerms)
    }
    
    if (body.role !== undefined) updateData.role = body.role
    if (body.username !== undefined) updateData.username = body.username
    if (body.mobile !== undefined) updateData.mobile = body.mobile || null
    if (body.password) {
      if (body.password.length < 6) {
        return NextResponse.json(
          { success: false, error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' },
          { status: 400 }
        )
      }
      updateData.password = await bcrypt.hash(body.password, 12)
    }

    await tenantDb.storeUser.update({
      where: { id: employeeId },
      data: updateData,
    })

    // ★ محاسبه مجدد محدودیت‌ها برای پاسخ
    const newActiveCount = await countActiveUsers(tenantDb, tenantId)

    return NextResponse.json({
      success: true,
      message: 'کاربر با موفقیت بروزرسانی شد',
      data: {
        planLimits: {
          maxUsers: maxUsers,
          currentCount: newActiveCount,
          remaining: isUnlimited ? -1 : Math.max(0, maxUsers - newActiveCount),
          canAdd: isUnlimited || newActiveCount < maxUsers,
          isUnlimited: isUnlimited,
          planLabel: planInfo?.label || 'پایه',
        },
      },
    })
  } catch (error: any) {
    console.error('[Employees PUT] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در بروزرسانی کاربر' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/employees — حذف کاربر (soft delete)
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('employees')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const { searchParams } = new URL(req.url)
    const employeeId = searchParams.get('id')

    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیران اجازه حذف کاربر را دارند' },
        { status: 403 }
      )
    }

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'شناسه کاربر الزامی است' },
        { status: 400 }
      )
    }

    const tenantDb = tenant.tenantDb
    const isIsolated = tenant.isIsolated
    const tenantId = tenant.tenantId

    const existing = await tenantDb.storeUser.findFirst({
      where: {
        id: employeeId,
        tenantId: tenantId,  // ★★★ v23-fix: همیشه tenantId فیلتر بشه
      },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'کاربر یافت نشد' },
        { status: 404 }
      )
    }

    // ★ جلوگیری از حذف آخرین مدیر
    if (existing.role === 'Manager' || existing.role === 'Admin') {
      const adminCount = await tenantDb.storeUser.count({
        where: {
          tenantId: tenantId,  // ★★★ v23-fix: همیشه tenantId فیلتر بشه
          role: { in: ['Manager', 'Admin'] },
          isActive: true,
        },
      })
      if (adminCount <= 1) {
        return NextResponse.json(
          { success: false, error: 'نمی‌توان آخرین مدیر را حذف کرد' },
          { status: 400 }
        )
      }
    }

    await tenantDb.storeUser.update({
      where: { id: employeeId },
      data: { isActive: false },
    })

    // ★ محاسبه مجدد محدودیت‌ها برای پاسخ
    const resolvedPlanName = resolveTenantPlanName(tenant)
    const planInfo = PLANS[resolvedPlanName]
    const maxUsers = planInfo?.maxUsers ?? 0
    const isUnlimited = maxUsers === 0
    const newActiveCount = await countActiveUsers(tenantDb, tenantId)

    return NextResponse.json({
      success: true,
      message: 'کاربر با موفقیت حذف شد',
      data: {
        planLimits: {
          maxUsers: maxUsers,
          currentCount: newActiveCount,
          remaining: isUnlimited ? -1 : Math.max(0, maxUsers - newActiveCount),
          canAdd: isUnlimited || newActiveCount < maxUsers,
          isUnlimited: isUnlimited,
          planLabel: planInfo?.label || 'پایه',
        },
      },
    })
  } catch (error: any) {
    console.error('[Employees DELETE] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در حذف کاربر' },
      { status: 500 }
    )
  }
})