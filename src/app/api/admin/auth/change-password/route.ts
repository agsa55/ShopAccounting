import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // ۱. خواندن توکن (اولویت با کوکی، سپس هدر)
    const cookieToken = request.cookies.get('token')?.value;
    const headerToken = request.headers.get('authorization')?.replace('Bearer ', '');
    const token = cookieToken || headerToken;

    if (!token) {
      return NextResponse.json({ success: false, error: 'توکن یافت نشد. لطفاً مجدداً وارد شوید.' }, { status: 401 });
    }

    // ۲. رمزگشایی توکن
    let payload: any;
    try {
      payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!);
    } catch (err) {
      return NextResponse.json({ success: false, error: 'توکن نامعتبر یا منقضی شده است.' }, { status: 401 });
    }

    // ۳. بررسی دسترسی: پذیرش Admin، SuperAdmin و userType: admin
    const role = payload.role?.toLowerCase();
    const userType = payload.userType?.toLowerCase();
    const isAdmin = userType === 'admin' || role === 'admin' || role === 'superadmin';
    
    if (!isAdmin) {
      console.warn('⚠️ [Change Password] Access Denied. Payload:', payload);
      return NextResponse.json({ success: false, error: 'دسترسی غیرمجاز. فقط مدیران ارشد می‌توانند رمز را تغییر دهند.' }, { status: 403 });
    }

    // ۴. دریافت داده‌های فرم
    const body = await request.json();
    const { currentPassword, newPassword, confirmPassword } = body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ success: false, error: 'تمام فیلدها الزامی هستند' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد' }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ success: false, error: 'رمز عبور جدید و تکرار آن مطابقت ندارند' }, { status: 400 });
    }

    // ۵. جستجوی مدیر در دیتابیس بر اساس userId
    const admin = await db.client.adminUser.findUnique({
      where: { id: payload.userId },
      select: { id: true, password: true, username: true, role: true }
    });

    if (!admin) {
      return NextResponse.json({ success: false, error: 'کاربر یافت نشد' }, { status: 404 });
    }

    // ۶. بررسی رمز عبور فعلی
    const isValidPassword = await bcrypt.compare(currentPassword, admin.password);
    if (!isValidPassword) {
      return NextResponse.json({ success: false, error: 'رمز عبور فعلی اشتباه است' }, { status: 401 });
    }

    // ۷. رمزنگاری و ذخیره رمز عبور جدید
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await db.client.adminUser.update({
      where: { id: admin.id },
      data: { password: hashedPassword }
    });

    console.log(`✅ [Change Password] Password changed successfully for ${admin.role}: ${admin.username}`);

    return NextResponse.json({
      success: true,
      message: 'رمز عبور با موفقیت تغییر کرد',
    });

  } catch (error: any) {
    console.error('💥 [Change Password API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'خطا در تغییر رمز عبور' },
      { status: 500 }
    );
  }
}