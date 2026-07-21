/**
 * Zod Validation Schemas - Employee
 * 
 * Input validation for employee/user management endpoints
 */

import { z } from 'zod'
import { tenantId, cuid } from './common'

// ============================================
// Permission Keys
// ============================================

export const PERMISSION_KEYS = [
  'dashboard',
  'pos',
  'products',
  'categories',
  'customers',
  'invoices',
  'installments',
  'accounting',
  'reports',
] as const

export type PermissionKey = typeof PERMISSION_KEYS[number]

// ============================================
// Create Employee Schema
// ============================================

export const createEmployeeSchema = z.object({
  username: z.string()
    .min(3, 'نام کاربری حداقل ۳ کاراکتر')
    .max(30, 'نام کاربری حداکثر ۳۰ کاراکتر')
    .regex(/^[a-zA-Z0-9_]+$/, 'نام کاربری فقط شامل حروف انگلیسی، اعداد و _'),
  password: z.string()
    .min(6, 'رمز عبور حداقل ۶ کاراکتر')
    .max(50, 'رمز عبور حداکثر ۵۰ کاراکتر'),
  role: z.enum(['Manager', 'Cashier']).default('Cashier'),
  mobile: z.string()
    .regex(/^09[0-9]{9}$/, 'شماره موبایل نامعتبر است')
    .optional()
    .nullable(),
  tenantId: tenantId,
  permissions: z.array(z.enum(PERMISSION_KEYS))
    .optional()
    .default([])
    .refine(
      (perms) => {
        // Settings is not a valid permission for cashiers
        return !perms.includes('settings' as PermissionKey)
      },
      { message: 'تنظیمات فقط برای مدیر قابل دسترسی است' }
    ),
}).refine(
  (data) => {
    // Managers don't need permissions
    if (data.role === 'Manager') return true
    // Cashiers can have empty permissions (no access) but array must exist
    return Array.isArray(data.permissions)
  },
  { message: 'مجوزهای صندوق‌دار الزامی است' }
)

// ============================================
// Update Employee Schema
// ============================================

export const updateEmployeeSchema = z.object({
  id: cuid,
  username: z.string()
    .min(3, 'نام کاربری حداقل ۳ کاراکتر')
    .max(30, 'نام کاربری حداکثر ۳۰ کاراکتر')
    .optional(),
  password: z.string()
    .min(6, 'رمز عبور حداقل ۶ کاراکتر')
    .max(50, 'رمز عبور حداکثر ۵۰ کاراکتر')
    .optional(),
  role: z.enum(['Manager', 'Cashier']).optional(),
  mobile: z.string()
    .regex(/^09[0-9]{9}$/, 'شماره موبایل نامعتبر است')
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
  tenantId: tenantId,
  permissions: z.array(z.enum(PERMISSION_KEYS))
    .optional()
    .default([]),
})

// ============================================
// Employee Query Schema (GET)
// ============================================

export const employeeQuerySchema = z.object({
  tenantId: tenantId,
})

// ============================================
// Delete Employee Schema
// ============================================

export const deleteEmployeeSchema = z.object({
  id: cuid,
  tenantId: tenantId,
})

// ============================================
// Type Exports
// ============================================

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>
export type EmployeeQueryInput = z.infer<typeof employeeQuerySchema>
export type DeleteEmployeeInput = z.infer<typeof deleteEmployeeSchema>
