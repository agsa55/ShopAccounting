// ============================================================================
// src/app/api/employees/route.ts
// ShopAccounting v10.0 — Store Employees/Users API
// ============================================================================
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

/**
 * ★ جستجوی کارکنان — با fallback برای ستون‌های مفقود
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

    const userLimit = await checkPlanLimit(tenantId, 'users')
    const tierName = tenant.planTierName || tenant.tenant?.planTier?.name || tenant.planName || 'free'

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
        planLimits: {
          maxUsers: userLimit.limit,
          currentCount: userLimit.current,
          remaining: userLimit.remaining,
          canAdd: userLimit.allowed,
          planTierName: tierName,
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

    const tenantDb = tenant.tenantDb
    const isIsolated = tenant.isIsolated

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
    const permsArray = parsePermissions(permissions)
    const permsString = role === 'Manager' ? JSON.stringify(['all']) : JSON.stringify(permsArray)

    const newEmployee = await tenantDb.storeUser.create({
      data: {
        username,
        password: hashedPassword,
        mobile: mobile || null,
        role: role || 'Cashier',
        permissions: permsString,
        isActive: true,
        tenantId: tenant.tenantId,  // ★★★ v23-fix: همیشه tenantId ارسال بشه
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

    const existing = await tenantDb.storeUser.findFirst({
      where: {
        id: employeeId,
        tenantId: tenant.tenantId,  // ★★★ v23-fix: همیشه tenantId فیلتر بشه
      },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'کاربر یافت نشد' },
        { status: 404 }
      )
    }

    const updateData: Record<string, any> = {}
    if (body.isActive !== undefined) updateData.isActive = body.isActive
    if (body.permissions !== undefined) {
      const permsArray = parsePermissions(body.permissions)
      updateData.permissions = JSON.stringify(permsArray)
    }
    if (body.role !== undefined) updateData.role = body.role
    if (body.username !== undefined) updateData.username = body.username
    if (body.mobile !== undefined) updateData.mobile = body.mobile || null
    if (body.password) {
      updateData.password = await bcrypt.hash(body.password, 12)
    }

    await tenantDb.storeUser.update({
      where: { id: employeeId },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      message: 'کاربر با موفقیت بروزرسانی شد',
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

    const existing = await tenantDb.storeUser.findFirst({
      where: {
        id: employeeId,
        tenantId: tenant.tenantId,  // ★★★ v23-fix: همیشه tenantId فیلتر بشه
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
          tenantId: tenant.tenantId,  // ★★★ v23-fix: همیشه tenantId فیلتر بشه
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

    return NextResponse.json({
      success: true,
      message: 'کاربر با موفقیت حذف شد',
    })
  } catch (error: any) {
    console.error('[Employees DELETE] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در حذف کاربر' },
      { status: 500 }
    )
  }
})
