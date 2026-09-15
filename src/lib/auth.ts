import jwt from 'jsonwebtoken';
import { db } from './db';

// ★ کلید رمزنگاری توکن (باید با کلید استفاده شده در زمان لاگین یکی باشد)
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

export interface AdminPayload {
  id: string;
  username: string;
  role: string;
}

/**
 * تولید توکن جدید برای مدیر (معمولاً در زمان لاگین استفاده می‌شود)
 */
export function generateAdminToken(admin: AdminPayload): string {
  return jwt.sign(admin, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * بررسی و رمزگشایی توکن مدیر در سمت سرور (مورد نیاز API تغییر رمز)
 */
export async function verifyAdminToken(token: string): Promise<AdminPayload | null> {
  try {
    // ۱. رمزگشایی توکن
    const decoded = jwt.verify(token, JWT_SECRET) as AdminPayload;
    
    // ۲. بررسی وجود مدیر در دیتابیس (برای اطمینان از اینکه حساب حذف نشده باشد)
    const admin = await db.client.adminUser.findUnique({
      where: { id: decoded.id },
      select: { id: true } // فقط ID را می‌گیریم تا سربار کم باشد
    });

    if (!admin) {
      return null; // توکن معتبر است اما کاربر در دیتابیس وجود ندارد
    }

    return decoded; // توکن کاملاً معتبر است
  } catch (error) {
    // اگر توکن منقضی شده باشد یا دستکاری شده باشد، به اینجا می‌آید
    return null;
  }
}