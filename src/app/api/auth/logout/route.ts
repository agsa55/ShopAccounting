/**
 * API Route: Logout - ShopAccounting v4.0
 *
 * اندپوینت خروج کاربر
 * کوکی‌های accessToken و refreshToken را پاک می‌کند
 *
 * POST /api/auth/logout
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully',
  });

  // پاک کردن کوکی‌ها با maxAge: 0
  response.cookies.set('accessToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set('refreshToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
