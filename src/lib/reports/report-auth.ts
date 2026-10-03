// ============================================================================
// src/lib/reports/report-auth.ts — v12.0 ★★★
// ShopAccounting — Shared Auth Helpers for Custom Report APIs
// ----------------------------------------------------------------------------
// این فایل توابع مشترک احراز هویت و استخراج tenantId را برای همه APIهای
// گزارش دلخواه فراهم می‌کند تا از تکرار کد جلوگیری شود.
//
// ★ امنیت:
//   - tenantId از JWT یا header استخراج می‌شود
//   - در production باید JWT به‌صورت کامل verify شود
//   - اطلاعات پلن از دیتابیس خوانده می‌شود (نه از ادعای کاربر)
// ============================================================================

import type { NextRequest } from 'next/server'
import { PrismaClient } from '@prisma/client'

// ═══════════════════════════════════════════════════════════════
//  Prisma Client (Singleton)
// ═══════════════════════════════════════════════════════════════

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// ═══════════════════════════════════════════════════════════════
//  Extract tenantId from request
// ═══════════════════════════════════════════════════════════════

/**
 * استخراج tenantId از درخواست
 *
 * اولویت‌ها:
 * 1. هدر x-tenant-id (سازگار با ساختار فعلی پروژه)
 * 2. توکن JWT در Authorization header
 * 3. کوئری پارامتر tenantId (برای سازگاری با APIهای قدیمی)
 */
export async function extractTenantId(req: NextRequest): Promise<string | null> {
  // اولویت ۱: از x-tenant-id header
  const tenantIdHeader = req.headers.get('x-tenant-id')
  if (tenantIdHeader && tenantIdHeader.trim()) {
    return tenantIdHeader.trim()
  }

  // اولویت ۲: از JWT token در Authorization header
  const authHeader = req.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    try {
      const parts = token.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
        if (payload.tenantId) {
          return String(payload.tenantId)
        }
      }
    } catch {
      // JWT invalid، ادامه می‌دهیم
    }
  }

  // اولویت ۳: از کوئری پارامتر
  const tenantIdParam = req.nextUrl.searchParams.get('tenantId')
  if (tenantIdParam && tenantIdParam.trim()) {
    return tenantIdParam.trim()
  }

  return null
}

// ═══════════════════════════════════════════════════════════════
//  Get tenant info with plan
// ═══════════════════════════════════════════════════════════════

export interface TenantInfo {
  id: string
  companyName: string | null
  planName: string | null
  status: string | null
}

/**
 * خواندن اطلاعات tenant از دیتابیس
 * این اطلاعات برای بررسی محدودیت‌های پلن استفاده می‌شود
 */
export async function getTenantInfo(tenantId: string): Promise<TenantInfo | null> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        companyName: true,
        planName: true,
        status: true,
      },
    })

    return tenant
  } catch (error) {
    console.error('[Report Auth] Failed to get tenant info:', error)
    return null
  }
}