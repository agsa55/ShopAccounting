/**
 * Employee Service
 * 
 * Business logic for employee/user management.
 * Includes RBAC permission handling and caching.
 */

import { db } from '@/lib/db'
import { cacheService } from '@/lib/cache'
import { CacheKeys, CacheTTL } from '@/lib/redis'
import { dbLogger, logBusinessEvent, PerformanceTimer } from '@/lib/logger'
import bcrypt from 'bcryptjs'
import type { CreateEmployeeInput, UpdateEmployeeInput } from '@/lib/validations/employee'

// ============================================
// Permission Helpers
// ============================================

/**
 * Parse permissions from JSON string stored in database
 */
export function parsePermissions(permissionsJson: string | null, role: string): string[] {
  if (role === 'Manager') return [] // Manager always has full access
  if (!permissionsJson) return []
  try {
    const parsed = JSON.parse(permissionsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Serialize permissions for database storage
 */
export function serializePermissions(permissions: string[], role: string): string | null {
  if (role === 'Manager') return null // No need to store for managers
  if (!permissions || permissions.length === 0) return '[]'
  return JSON.stringify(permissions)
}

// ============================================
// Get Employees
// ============================================

export async function getEmployees(tenantId: string) {
  const timer = new PerformanceTimer('getEmployees')
  const cacheKey = `shopaccounting:${tenantId}:employees`

  try {
    const result = await cacheService.getOrSet(
      cacheKey,
      async () => {
        const users = await db.storeUser.findMany({
          where: { tenantId },
          orderBy: { role: 'asc' },
        })

        return users.map((user) => ({
          id: user.id,
          username: user.username,
          role: user.role,
          mobile: user.mobile,
          isActive: user.isActive,
          lastLoginAt: user.lastLoginAt,
          failedAttempts: user.failedAttempts,
          lockoutEnd: user.lockoutEnd,
          tenantId: user.tenantId,
          permissions: parsePermissions(user.permissions, user.role),
        }))
      },
      { ttl: CacheTTL.MEDIUM }
    )

    timer.end({ tenantId, count: result.length })
    return result
  } catch (error) {
    dbLogger.error({ error, tenantId }, 'Failed to get employees')
    timer.end({ tenantId, error: true })
    throw error
  }
}

// ============================================
// Create Employee
// ============================================

export async function createEmployee(input: CreateEmployeeInput) {
  const timer = new PerformanceTimer('createEmployee')
  const { username, password, role, mobile, tenantId, permissions } = input

  try {
    // Check username uniqueness
    const existing = await db.storeUser.findFirst({
      where: { username, tenantId },
    })

    if (existing) {
      return { success: false, error: 'این نام کاربری قبلاً ثبت شده است' }
    }

    // Check plan limits
    const plan = await db.plan.findFirst({ where: { isActive: true } })
    const currentUsers = await db.storeUser.count({ where: { tenantId } })
    if (plan && currentUsers >= plan.maxUsers) {
      return { success: false, error: `حداکثر ${plan.maxUsers} کاربر مجاز است` }
    }

    // Build permissions
    const permissionsJson = serializePermissions(permissions || [], role || 'Cashier')

    // Create user
    const user = await db.storeUser.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 10),
        role: role || 'Cashier',
        mobile: mobile || null,
        tenantId,
        isActive: true,
        permissions: permissionsJson,
      },
    })

    // Invalidate cache
    await cacheService.del(`shopaccounting:${tenantId}:employees`)

    // Log business event
    logBusinessEvent('employee_created', tenantId, 'system', {
      newUserId: user.id,
      newUserUsername: username,
      newUserRole: role,
    })

    timer.end({ tenantId, userId: user.id })

    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        mobile: user.mobile,
        isActive: user.isActive,
        permissions: permissions || [],
      },
    }
  } catch (error) {
    dbLogger.error({ error, tenantId }, 'Failed to create employee')
    timer.end({ tenantId, error: true })
    return { success: false, error: 'خطای داخلی سرور' }
  }
}

// ============================================
// Update Employee
// ============================================

export async function updateEmployee(input: UpdateEmployeeInput) {
  const timer = new PerformanceTimer('updateEmployee')
  const { id, tenantId, role, permissions, isActive, username, password, mobile } = input

  try {
    // Check user belongs to tenant
    const existing = await db.storeUser.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return { success: false, error: 'کاربر یافت نشد' }
    }

    // Don't allow deactivating the last manager
    if (existing.role === 'Manager' && isActive === false) {
      const managerCount = await db.storeUser.count({
        where: { tenantId, role: 'Manager', isActive: true },
      })
      if (managerCount <= 1) {
        return { success: false, error: 'نمی‌توان آخرین مدیر را غیرفعال کرد' }
      }
    }

    // Build update data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {}
    if (username !== undefined) updateData.username = username
    if (password) updateData.passwordHash = await bcrypt.hash(password, 10)
    if (role !== undefined) updateData.role = role
    if (mobile !== undefined) updateData.mobile = mobile
    if (isActive !== undefined) updateData.isActive = isActive

    // Handle permissions
    if (permissions !== undefined) {
      const effectiveRole = role || existing.role
      updateData.permissions = serializePermissions(permissions, effectiveRole)
    }

    const user = await db.storeUser.update({
      where: { id },
      data: updateData,
    })

    // Invalidate caches
    await cacheService.del(`shopaccounting:${tenantId}:employees`)
    // Also invalidate the user's session cache so permissions take effect
    await cacheService.del(CacheKeys.userSession(id))

    // Log business event
    logBusinessEvent('employee_updated', tenantId, 'system', {
      updatedUserId: id,
      changes: Object.keys(updateData),
    })

    timer.end({ tenantId, userId: id })

    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        mobile: user.mobile,
        isActive: user.isActive,
        permissions: permissions || [],
      },
    }
  } catch (error) {
    dbLogger.error({ error, tenantId, userId: id }, 'Failed to update employee')
    timer.end({ tenantId, error: true })
    return { success: false, error: 'خطای داخلی سرور' }
  }
}

// ============================================
// Delete Employee
// ============================================

export async function deleteEmployee(id: string, tenantId: string) {
  const timer = new PerformanceTimer('deleteEmployee')

  try {
    const existing = await db.storeUser.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return { success: false, error: 'کاربر یافت نشد' }
    }

    // Don't allow deleting the last manager
    if (existing.role === 'Manager') {
      const managerCount = await db.storeUser.count({
        where: { tenantId, role: 'Manager', isActive: true },
      })
      if (managerCount <= 1) {
        return { success: false, error: 'نمی‌توان آخرین مدیر را حذف کرد' }
      }
    }

    await db.storeUser.delete({ where: { id } })

    // Invalidate caches
    await cacheService.del(`shopaccounting:${tenantId}:employees`)
    await cacheService.del(CacheKeys.userSession(id))

    logBusinessEvent('employee_deleted', tenantId, 'system', {
      deletedUserId: id,
      deletedUsername: existing.username,
    })

    timer.end({ tenantId, userId: id })
    return { success: true, message: 'کاربر حذف شد' }
  } catch (error) {
    dbLogger.error({ error, tenantId, userId: id }, 'Failed to delete employee')
    timer.end({ tenantId, error: true })
    return { success: false, error: 'خطای داخلی سرور' }
  }
}
