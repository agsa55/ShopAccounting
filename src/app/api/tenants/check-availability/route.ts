// ============================================================================
// src/app/api/tenants/check-availability/route.ts
// ★ v1.2: PUBLIC endpoint — بدون middleware احراز هویت
// ★ مشابه check-subdomain — برای فرم ثبت‌نام (کاربر هنوز لاگین نکرده)
// ★ از db.master استفاده می‌کند (نه db.client)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ★ لیست زیردامنه‌های رزرو شده
const RESERVED_SUBDOMAINS = [
  'admin', 'test', 'shop', 'api', 'auth', 'www', 'mail', 'ftp', 'cdn',
  'app', 'blog', 'dev', 'staging', 'demo', 'support', 'help', 'docs',
  'status', 'dashboard', 'panel', 'control', 'manage', 'system',
  'shopaccounting', 'saas', 'master', 'tenant', 'owner',
  'billing', 'payment', 'root', 'super', 'new', 'old', 'backup',
  'production', 'web', 'mobile', 'login', 'register',
];

// ★ لیست نام‌های کاربری رزرو شده
const RESERVED_USERNAMES = [
  'admin', 'administrator', 'root', 'super', 'system', 'support', 'help',
  'info', 'contact', 'manager', 'owner', 'user', 'guest', 'test', 'demo',
  'null', 'undefined', 'anonymous', 'public', 'private', 'moderator',
  'staff', 'official', 'security', 'abuse', 'spam',
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subdomain = searchParams.get('subdomain')?.toLowerCase().trim();
    const storeName = searchParams.get('storeName')?.trim();
    const username = searchParams.get('username')?.toLowerCase().trim();

    const result: any = {};

    // ── ۱. بررسی subdomain ─────────────────────────────────
    if (subdomain) {
      if (subdomain.length < 3) {
        result.subdomain = {
          available: false,
          reason: 'حداقل ۳ کاراکتر لازم است',
        };
      } else if (RESERVED_SUBDOMAINS.includes(subdomain)) {
        result.subdomain = {
          available: false,
          reason: 'این نام رزرو شده است',
        };
      } else if (!/^[a-z0-9-]+$/.test(subdomain)) {
        result.subdomain = {
          available: false,
          reason: 'فقط حروف انگلیسی، اعداد و خط تیره مجاز است',
        };
      } else {
        try {
          // ★ v1.2: استفاده از db.master (نه db.client)
          const existing = await db.master.tenant.findFirst({
            where: { 
              subDomain: subdomain,
            },
            select: { id: true },
          });
          result.subdomain = {
            available: !existing,
            reason: existing ? 'قبلاً ثبت شده است' : 'آزاد است',
          };
        } catch (dbError: any) {
          console.warn('[Check-Availability] subdomain DB lookup failed:', dbError.message);
          result.subdomain = { available: true, reason: 'آزاد است' };
        }
      }
    }

    // ── ۲. بررسی storeName ─────────────────────────────────
    if (storeName) {
      if (storeName.length < 2) {
        result.storeName = {
          available: false,
          reason: 'حداقل ۲ کاراکتر لازم است',
        };
      } else {
        try {
          const existing = await db.master.tenant.findFirst({
            where: { 
              companyName: { equals: storeName, mode: 'insensitive' },
            },
            select: { id: true },
          });
          result.storeName = {
            available: !existing,
            reason: existing ? 'این نام قبلاً استفاده شده است' : 'آزاد است',
          };
        } catch (dbError: any) {
          console.warn('[Check-Availability] storeName DB lookup failed:', dbError.message);
          result.storeName = { available: true, reason: 'آزاد است' };
        }
      }
    }

    // ── ۳. بررسی username ─────────────────────────────────
    if (username) {
      if (username.length < 3) {
        result.username = {
          available: false,
          reason: 'حداقل ۳ کاراکتر لازم است',
        };
      } else if (!/^[a-z0-9_]+$/.test(username)) {
        result.username = {
          available: false,
          reason: 'فقط حروف انگلیسی، اعداد و _ مجاز است',
        };
      } else if (RESERVED_USERNAMES.includes(username)) {
        result.username = {
          available: false,
          reason: 'این نام کاربری رزرو شده است',
        };
      } else {
        try {
          const existing = await db.master.storeUser.findFirst({
            where: { 
              username: { equals: username, mode: 'insensitive' },
            },
            select: { id: true },
          });
          result.username = {
            available: !existing,
            reason: existing ? 'این نام کاربری قبلاً استفاده شده است' : 'آزاد است',
          };
        } catch (dbError: any) {
          console.warn('[Check-Availability] username DB lookup failed:', dbError.message);
          result.username = { available: true, reason: 'آزاد است' };
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[Check-Availability] Error:', error);
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    );
  }
}