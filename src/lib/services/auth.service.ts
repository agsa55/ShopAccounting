/**
 * Auth Service - ShopAccounting v4.0
 *
 * سرویس احراز هویت با JWT واقعی
 * بر اساس فیلدهای واقعی Prisma Schema
 *
 * فیلدهای StoreUser:
 *   id, username, passwordHash, role, mobile,
 *   lastLoginAt, failedAttempts, lockoutEnd,
 *   tenantId, permissions
 */

import { db } from '@/lib/db';
import { signTokenPair, TokenPair, TokenPayload } from '@/lib/jwt';
import { hashPassword, verifyPassword, isHashedPassword } from '@/lib/crypto';

// ─── تایپ‌ها ───────────────────────────────────────────────

export interface LoginResult {
  success: boolean;
  data?: {
    tokenPair: TokenPair;
    user: {
      id: string;
      username: string;
      role: string;
      permissions: string[];
      tenantId: string;
      mobile?: string | null;
    };
  };
  error?: string;
  errorCode?: string;
}

export interface RegisterResult {
  success: boolean;
  data?: {
    tokenPair: TokenPair;
    user: {
      id: string;
      username: string;
      role: string;
      permissions: string[];
      tenantId: string;
    };
  };
  error?: string;
  errorCode?: string;
}

// ─── کمک‌کننده تبدیل permissions ───────────────────────────────

/**
 * تبدیل فیلد permissions از دیتابیس به آرایه
 * permissions در دیتابیس ممکن است:
 * - null باشد → آرایه خالی
 * - رشته JSON باشد → parse شود
 * - رشته جدا شده با کاما باشد → split شود
 */
function parsePermissions(permissions: string | null): string[] {
  if (!permissions) return [];

  // اگر با [ شروع شود، احتمالا JSON است
  if (permissions.startsWith('[')) {
    try {
      const parsed = JSON.parse(permissions);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // JSON نبود، ادامه بده
    }
  }

  // جدا شده با کاما
  return permissions.split(',').map((p: string) => p.trim()).filter(Boolean);
}

// ─── جستجوی کاربر ───────────────────────────────────────────────

/**
 * جستجوی کاربر با username یا mobile
 * اگر tenantId مشخص باشد، فقط در آن tenant جستجو می‌کند
 */
async function findUser(login: string, tenantId?: string) {
  const whereBase: any = {};
  if (tenantId) whereBase.tenantId = tenantId;

  // مرحله 1: جستجوی مستقیم با username
  let user = await db.storeUser.findFirst({
    where: { ...whereBase, username: login },
  });

  if (user) return user;

  // مرحله 2: جستجو با mobile (شماره موبایل)
  user = await db.storeUser.findFirst({
    where: { ...whereBase, mobile: login },
  });

  if (user) return user;

  return null;
}

// ─── ورود ───────────────────────────────────────────────

/**
 * ورود کاربر با username و رمز عبور
 * tenantId اختیاری است - اگر ارسال نشود، اولین کاربر پیدا شده استفاده می‌شود
 *
 * نکته مهم: اگر رمز عبور در دیتابیس plaintext باشد (نسخه قدیمی)،
 * بعد از ورود موفق، رمز به صورت خودکار به bcrypt هش می‌شود
 */
export async function loginUser(
  username: string,
  password: string,
  tenantId?: string
): Promise<LoginResult> {
  const startTime = Date.now();

  try {
    // 1. جستجوی کاربر
    const user = await findUser(username, tenantId);

    if (!user) {
      console.warn('Login failed: user not found', { username, tenantId });
      return {
        success: false,
        error: 'نام کاربری یا رمز عبور اشتباه است.',
        errorCode: 'INVALID_CREDENTIALS',
      };
    }

    // 2. بررسی قفل شدن حساب (lockoutEnd)
    if (user.lockoutEnd && new Date(user.lockoutEnd) > new Date()) {
      const remainingMinutes = Math.ceil(
        (new Date(user.lockoutEnd).getTime() - Date.now()) / 60000
      );
      return {
        success: false,
        error: `حساب کاربری شما قفل شده. لطفاً ${remainingMinutes} دقیقه دیگر تلاش کنید.`,
        errorCode: 'ACCOUNT_LOCKED',
      };
    }

    // 3. بررسی رمز عبور
    // فیلد passwordHash ممکن است هش bcrypt باشد یا plaintext قدیمی
    let isPasswordValid = false;

    if (isHashedPassword(user.passwordHash)) {
      // رمز عبور هش شده (حالت عادی) - بررسی با bcrypt
      isPasswordValid = await verifyPassword(password, user.passwordHash);
    } else {
      // رمز عبور plaintext (حالت قدیمی - مهاجرت از v3.0)
      isPasswordValid = user.passwordHash === password;

      // اگر رمز درست بود، آن را به bcrypt هش کن (مهاجرت خودکار)
      if (isPasswordValid) {
        try {
          const hashedPassword = await hashPassword(password);
          await db.storeUser.update({
            where: { id: user.id },
            data: { passwordHash: hashedPassword },
          });
          console.log('✅ Password migrated to bcrypt for user:', user.id);
        } catch (hashError) {
          console.error('⚠️ Failed to hash password during migration:', hashError);
        }
      }
    }

    if (!isPasswordValid) {
      // افزایش شمارنده تلاش‌های ناموفق
      try {
        const newFailedAttempts = (user.failedAttempts || 0) + 1;
        const updateData: any = { failedAttempts: newFailedAttempts };

        // بعد از 5 تلاش ناموفق، حساب را 15 دقیقه قفل کن
        if (newFailedAttempts >= 5) {
          updateData.lockoutEnd = new Date(Date.now() + 15 * 60 * 1000);
        }

        await db.storeUser.update({
          where: { id: user.id },
          data: updateData,
        });
      } catch {
        // مهم نیست
      }

      console.warn('Login failed: wrong password', { userId: user.id });
      return {
        success: false,
        error: 'نام کاربری یا رمز عبور اشتباه است.',
        errorCode: 'INVALID_CREDENTIALS',
      };
    }

    // 4. ورود موفق - بازنشانی شمارنده و بروزرسانی آخرین ورود
    try {
      await db.storeUser.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          failedAttempts: 0,
          lockoutEnd: null,
        },
      });
    } catch {
      // مهم نیست
    }

    // 5. تبدیل permissions به آرایه
    const userPermissions = parsePermissions(user.permissions);

    // 6. ایجاد جفت توکن JWT
    const tokenPayload: TokenPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as 'Manager' | 'Cashier',
      permissions: userPermissions,
      username: user.username,
    };

    const tokenPair = await signTokenPair(tokenPayload);

    console.log('Login successful', {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      durationMs: Date.now() - startTime,
    });

    return {
      success: true,
      data: {
        tokenPair,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: userPermissions,
          tenantId: user.tenantId,
          mobile: user.mobile,
        },
      },
    };
  } catch (error: any) {
    console.error('Login error', {
      username,
      tenantId,
      error: error.message,
      durationMs: Date.now() - startTime,
    });

    return {
      success: false,
      error: 'خطای داخلی سرور.',
      errorCode: 'INTERNAL_ERROR',
    };
  }
}

// ─── ثبت‌نام ───────────────────────────────────────────────

/**
 * ثبت‌نام کاربر جدید
 */
export async function registerUser(data: {
  username: string;
  password: string;
  mobile?: string;
  tenantId: string;
  role?: string;
  permissions?: string[];
}): Promise<RegisterResult> {
  const startTime = Date.now();

  try {
    // 1. بررسی تکراری نبودن username
    const existingUser = await db.storeUser.findFirst({
      where: {
        username: data.username,
        tenantId: data.tenantId,
      },
    });

    if (existingUser) {
      return {
        success: false,
        error: 'این نام کاربری قبلاً ثبت شده است.',
        errorCode: 'USERNAME_EXISTS',
      };
    }

    // 2. هش رمز عبور
    const hashedPassword = await hashPassword(data.password);

    // 3. تبدیل permissions به رشته
    const permissionsStr = data.permissions?.length
      ? JSON.stringify(data.permissions)
      : null;

    // 4. ایجاد کاربر
    const user = await db.storeUser.create({
      data: {
        username: data.username,
        passwordHash: hashedPassword,
        mobile: data.mobile || null,
        tenantId: data.tenantId,
        role: data.role ?? 'Cashier',
        permissions: permissionsStr,
        failedAttempts: 0,
      },
    });

    // 5. ایجاد جفت توکن JWT
    const userPermissions = data.permissions ?? [];
    const tokenPayload: TokenPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as 'Manager' | 'Cashier',
      permissions: userPermissions,
      username: user.username,
    };

    const tokenPair = await signTokenPair(tokenPayload);

    console.log('Registration successful', {
      userId: user.id,
      tenantId: data.tenantId,
      durationMs: Date.now() - startTime,
    });

    return {
      success: true,
      data: {
        tokenPair,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: userPermissions,
          tenantId: user.tenantId,
        },
      },
    };
  } catch (error: any) {
    console.error('Registration error', {
      username: data.username,
      tenantId: data.tenantId,
      error: error.message,
    });

    return {
      success: false,
      error: 'خطای داخلی سرور.',
      errorCode: 'INTERNAL_ERROR',
    };
  }
}

// ─── تمدید توکن ───────────────────────────────────────────────

/**
 * تمدید توکن دسترسی با اطلاعات کاربر فعلی
 */
export async function refreshUserTokens(
  userId: string,
  tenantId: string
): Promise<LoginResult> {
  const startTime = Date.now();

  try {
    const user = await db.storeUser.findFirst({
      where: { id: userId, tenantId },
    });

    if (!user) {
      return {
        success: false,
        error: 'کاربر یافت نشد.',
        errorCode: 'USER_NOT_FOUND',
      };
    }

    const userPermissions = parsePermissions(user.permissions);

    const tokenPayload: TokenPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role as 'Manager' | 'Cashier',
      permissions: userPermissions,
      username: user.username,
    };

    const tokenPair = await signTokenPair(tokenPayload);

    return {
      success: true,
      data: {
        tokenPair,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: userPermissions,
          tenantId: user.tenantId,
          mobile: user.mobile,
        },
      },
    };
  } catch (error: any) {
    console.error('Token refresh error', {
      userId,
      tenantId,
      error: error.message,
    });

    return {
      success: false,
      error: 'خطای داخلی سرور.',
      errorCode: 'INTERNAL_ERROR',
    };
  }
}
