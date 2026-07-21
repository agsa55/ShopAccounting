/**
 * Zod Validation Schemas - Common
 * 
 * Shared validation utilities and base schemas
 * used across all API route validations.
 */

import { z } from 'zod'

// ============================================
// Common Validators
// ============================================

/** Non-empty string */
export const nonEmptyString = z.string().min(1, 'این فیلد الزامی است')

/** CUID (Prisma default ID format) */
export const cuid = z.string().cuid('شناسه نامعتبر است')

/** Tenant ID */
export const tenantId = z.string().min(1, 'شناسه فروشگاه الزامی است')

/** Pagination */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

/** Search query */
export const searchSchema = z.object({
  search: z.string().optional().default(''),
})

/** Date range filter */
export const dateRangeSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

/** Tenant-scoped query parameters */
export const tenantQuerySchema = z.object({
  tenantId: z.string().min(1, 'شناسه فروشگاه الزامی است').default('demo'),
})

// ============================================
// API Response Schemas (for documentation)
// ============================================

export const successResponseSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
})

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
})

export const paginatedResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(z.unknown()),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

// ============================================
// Validation Helper
// ============================================

/**
 * Validate request body against a Zod schema
 * Returns parsed data or throws a formatted error
 */
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    const firstError = result.error.errors[0]
    throw new ValidationError(
      firstError?.message || 'داده‌های ورودی نامعتبر است',
      result.error.errors
    )
  }
  return result.data
}

/**
 * Validate query parameters against a Zod schema
 */
export function validateQuery<T>(schema: z.ZodSchema<T>, searchParams: URLSearchParams): T {
  const params: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    params[key] = value
  })
  
  const result = schema.safeParse(params)
  if (!result.success) {
    const firstError = result.error.errors[0]
    throw new ValidationError(
      firstError?.message || 'پارامترهای جستجو نامعتبر است',
      result.error.errors
    )
  }
  return result.data
}

// ============================================
// Custom Error Class
// ============================================

export class ValidationError extends Error {
  public errors: z.ZodIssue[]
  
  constructor(message: string, errors: z.ZodIssue[] = []) {
    super(message)
    this.name = 'ValidationError'
    this.errors = errors
  }
}

// ============================================
// Type Helpers
// ============================================

export type PaginatedQuery = z.infer<typeof paginationSchema>
export type TenantQuery = z.infer<typeof tenantQuerySchema>
export type DateRangeQuery = z.infer<typeof dateRangeSchema>
