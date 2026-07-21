/**
 * API Route: Auth Debug - ShopAccounting v4.0
 *
 * فقط برای دیباگ! در تولید حذف شود!
 * GET /api/auth/debug?username=admin
 *
 * نمایش اطلاعات کاربر بدون نیاز به رمز عبور
 * برای بررسی فیلدهای واقعی Prisma Schema
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  // فقط در dev mode فعال باشد
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  try {
    const username = request.nextUrl.searchParams.get('username') || 'admin';

    const user = await db.storeUser.findFirst({
      where: { username },
    });

    if (!user) {
      // جستجوی همه کاربران
      const allUsers = await db.storeUser.findMany({
        select: {
          id: true,
          username: true,
          role: true,
          tenantId: true,
          permissions: true,
          mobile: true,
          lastLoginAt: true,
          failedAttempts: true,
          lockoutEnd: true,
        },
        take: 10,
      });

      return NextResponse.json({
        message: `User '${username}' not found. Here are all users:`,
        users: allUsers,
      });
    }

    return NextResponse.json({
      message: 'User found!',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
        permissions: user.permissions,
        mobile: user.mobile,
        lastLoginAt: user.lastLoginAt,
        failedAttempts: user.failedAttempts,
        lockoutEnd: user.lockoutEnd,
        // passwordHash را نمایش نمی‌دهیم
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
