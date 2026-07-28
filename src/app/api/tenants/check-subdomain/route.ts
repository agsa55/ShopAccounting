// ============================================================================
// src/app/api/tenants/check-subdomain/route.ts — GET /api/tenants/check-subdomain
// ShopAccounting v5.0 — Multi-tenant SaaS Platform
// ============================================================================
// بررسی آزاد بودن زیردامنه برای ثبت‌نام
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ★ لیست زیردامنه‌های رزرو شده
const RESERVED_SUBDOMAINS = [
  'admin', 'test', 'shop', 'api', 'auth', 'www', 'mail', 'ftp', 'cdn',
  'app', 'blog', 'dev', 'staging', 'demo', 'support', 'help', 'docs',
  'status', 'dashboard', 'panel', 'control', 'manage', 'system',
  'shopaccounting', 'saas', 'master', 'tenant', 'owner',
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subdomain = searchParams.get('subdomain');

    if (!subdomain) {
      return NextResponse.json(
        { success: false, error: 'زیردامنه مشخص نشده است' },
        { status: 400 }
      );
    }

    // بررسی طول زیردامنه
    if (subdomain.length < 3) {
      return NextResponse.json({
        success: true,
        available: false,
        reason: 'زیردامنه باید حداقل ۳ کاراکتر باشد',
      });
    }

    // بررسی فرمت زیردامنه (فقط حروف انگلیسی و اعداد)
    if (!/^[a-z0-9]+$/.test(subdomain)) {
      return NextResponse.json({
        success: true,
        available: false,
        reason: 'زیردامنه فقط می‌تواند شامل حروف انگلیسی و اعداد باشد',
      });
    }

    // بررسی زیردامنه‌های رزرو شده
    if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
      return NextResponse.json({
        success: true,
        available: false,
        reason: 'این زیردامنه رزرو شده است',
      });
    }

    // بررسی در دیتابیس
    try {
      const existing = await db.master.tenant.findFirst({
        where: { subDomain: subdomain.toLowerCase() },
        select: { id: true },
      });

      if (existing) {
        return NextResponse.json({
          success: true,
          available: false,
          reason: 'این زیردامنه قبلاً ثبت شده است',
        });
      }
    } catch (dbError: any) {
      console.warn('[Check-Subdomain] DB lookup failed:', dbError.message);
      // اگر DB در دسترس نیست، فقط بررسی رزرو شده‌ها رو انجام بده
    }

    return NextResponse.json({
      success: true,
      available: true,
    });
  } catch (error: any) {
    console.error('[Check-Subdomain] Error:', error);
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    );
  }
}
