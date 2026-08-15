// ============================================================================
// src/app/api/tenants/check-availability/route.ts
// ★ بررسی تکراری بودن: subdomain, storeName, username
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// کلمات رزرو شده برای subdomain
const RESERVED_SUBDOMAINS = [
  'admin', 'test', 'shop', 'api', 'auth', 'www', 'mail', 'ftp', 'cdn',
  'app', 'dashboard', 'login', 'register', 'support', 'help', 'billing',
  'payment', 'system', 'root', 'super', 'manager', 'owner', 'demo', 'trial',
  'new', 'old', 'backup', 'dev', 'staging', 'production', 'web', 'mobile',
]

// کلمات رزرو شده برای username
const RESERVED_USERNAMES = [
  'admin', 'administrator', 'root', 'super', 'system', 'support', 'help',
  'info', 'contact', 'manager', 'owner', 'user', 'guest', 'test', 'demo',
  'null', 'undefined', 'anonymous', 'public', 'private',
]

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const subdomain = searchParams.get('subdomain')?.toLowerCase().trim()
    const storeName = searchParams.get('storeName')?.trim()
    const username = searchParams.get('username')?.toLowerCase().trim()

    const result: any = {}

    // ── ۱. بررسی subdomain ─────────────────────────────────
    if (subdomain) {
      if (subdomain.length < 3) {
        result.subdomain = {
          available: false,
          reason: 'حداقل ۳ کاراکتر لازم است',
        }
      } else if (RESERVED_SUBDOMAINS.includes(subdomain)) {
        result.subdomain = {
          available: false,
          reason: 'این نام رزرو شده است',
        }
      } else if (!/^[a-z0-9-]+$/.test(subdomain)) {
        result.subdomain = {
          available: false,
          reason: 'فقط حروف انگلیسی، اعداد و خط تیره مجاز است',
        }
      } else {
        try {
          const existing = await db.client.tenant.findFirst({
            where: { 
              subDomain: subdomain,
              NOT: { status: 'deleted' }
            },
            select: { id: true },
          })
          result.subdomain = {
            available: !existing,
            reason: existing ? 'قبلاً ثبت شده است' : 'آزاد است',
          }
        } catch {
          result.subdomain = { available: true, reason: 'آزاد است' }
        }
      }
    }

    // ── ۲. بررسی storeName ─────────────────────────────────
    if (storeName) {
      if (storeName.length < 2) {
        result.storeName = {
          available: false,
          reason: 'حداقل ۲ کاراکتر لازم است',
        }
      } else {
        try {
          const existing = await db.client.tenant.findFirst({
            where: { 
              companyName: { equals: storeName, mode: 'insensitive' },
              NOT: { status: 'deleted' }
            },
            select: { id: true },
          })
          result.storeName = {
            available: !existing,
            reason: existing ? 'این نام قبلاً استفاده شده است' : 'آزاد است',
          }
        } catch {
          result.storeName = { available: true, reason: 'آزاد است' }
        }
      }
    }

    // ── ۳. بررسی username ─────────────────────────────────
    if (username) {
      if (username.length < 3) {
        result.username = {
          available: false,
          reason: 'حداقل ۳ کاراکتر لازم است',
        }
      } else if (!/^[a-z0-9_]+$/.test(username)) {
        result.username = {
          available: false,
          reason: 'فقط حروف انگلیسی، اعداد و _ مجاز است',
        }
      } else if (RESERVED_USERNAMES.includes(username)) {
        result.username = {
          available: false,
          reason: 'این نام کاربری رزرو شده است',
        }
      } else {
        try {
          const existing = await db.client.storeUser.findFirst({
            where: { 
              username: { equals: username, mode: 'insensitive' },
              isActive: true,
            },
            select: { id: true },
          })
          result.username = {
            available: !existing,
            reason: existing ? 'این نام کاربری قبلاً استفاده شده است' : 'آزاد است',
          }
        } catch {
          result.username = { available: true, reason: 'آزاد است' }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    console.error('[CheckAvailability] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در بررسی' },
      { status: 500 }
    )
  }
}