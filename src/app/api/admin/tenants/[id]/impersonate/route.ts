// src/app/api/admin/tenants/[id]/impersonate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jwt from 'jsonwebtoken';

export async function POST(
  req: NextRequest,
  context: any
) {
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const tenantId = resolvedParams.id;

    if (!tenantId) {
      return NextResponse.json({ error: 'شناسه فروشگاه نامعتبر است' }, { status: 400 });
    }

    // ۱. بررسی وجود فروشگاه
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'فروشگاه یافت نشد' }, { status: 404 });
    }

    if (tenant.status !== 'active') {
      return NextResponse.json({ error: 'این فروشگاه غیرفعال است' }, { status: 403 });
    }

    // ۲. ★ پیدا کردن یک کاربر واقعی (Owner/Manager) در این فروشگاه
    const storeUser = await db.client.storeUser.findFirst({
      where: { 
        tenantId: tenant.id,
        isActive: true,
      },
      orderBy: { createdAt: 'asc' }, // اولین کاربر ساخته‌شده (معمولاً Owner)
    });

    if (!storeUser) {
      return NextResponse.json({ 
        error: 'هیچ کاربر فعالی در این فروشگاه وجود ندارد' 
      }, { status: 404 });
    }

    // ۳. ★ ساخت Payload با userId واقعی (تا Middleware آن را قبول کند)
    const payload = {
      userId: storeUser.id,       // ← ID واقعی کاربر در StoreUsers
      tenantId: tenant.id,
      role: storeUser.role,       // ← نقش واقعی (Owner/Manager/Cashier)
      username: storeUser.username,
      impersonatedBy: 'admin',    // ← برای لاگ امنیتی
    };

    // ۴. امضای توکن
    const token = jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: '1h' });

    // ۵. تنظیم کوکی
    const response = NextResponse.json({ 
      success: true, 
      message: 'ورود موفقیت‌آمیز',
      redirectUrl: '/dashboard', // ← آدرس داشبورد فروشگاه
    });

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    });

    return response;
  } catch (error) {
    console.error('Impersonate Error:', error);
    return NextResponse.json({ error: 'خطای داخلی سرور' }, { status: 500 });
  }
}