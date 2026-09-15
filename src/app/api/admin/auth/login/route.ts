import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, error: 'نام کاربری و رمز عبور الزامی است' }, { status: 400 });
    }

    const admin = await db.client.adminUser.findUnique({
      where: { username, isActive: true }
    });

    if (!admin) {
      return NextResponse.json({ success: false, error: 'نام کاربری یا رمز عبور اشتباه است' }, { status: 401 });
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return NextResponse.json({ success: false, error: 'نام کاربری یا رمز عبور اشتباه است' }, { status: 401 });
    }

    const payload = {
      userId: admin.id,
      username: admin.username,
      role: admin.role,
      tenantId: 'master', 
      userType: 'admin',
      permissions: ['*'],
    };

    const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: '24h' });
    
    await db.client.adminUser.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() }
    });

    const response = NextResponse.json({ success: true, data: { user: payload } });
    
    // ★★★ تنظیم دقیق کوکی برای تمام مسیرها
    response.cookies.set('token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 1 روز
      path: '/', // ★★★ حیاتی: در دسترس بودن کوکی در تمام صفحات
    });

    return response;
  } catch (error) {
    console.error('[Admin Login] Error:', error);
    return NextResponse.json({ success: false, error: 'خطای داخلی سرور' }, { status: 500 });
  }
}