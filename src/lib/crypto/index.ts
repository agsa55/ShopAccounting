/**
 * Crypto Service - ShopAccounting v4.0
 *
 * سرویس هش و بررسی رمز عبور
 * از bcryptjs استفاده می‌شود (خالص JS، بدون وابستگی native)
 */

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * هش رمز عبور
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * بررسی رمز عبور
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * بررسی آیا رمز عبور هش شده است
 * (برای سازگاری با رمزهای قدیمی که هش نشده‌اند)
 */
export function isHashedPassword(password: string): boolean {
  return password.startsWith('$2a$') || password.startsWith('$2b$') || password.startsWith('$2y$');
}
