// ============================================================================
// src/lib/auth-client.ts — Client-side Auth Utilities (v1.0)
// ShopAccounting v4.1
// ============================================================================
// توابع کمکی سمت کلاینت برای مدیریت توکن و اطلاعات کاربر در localStorage
// ★ این فایل اختیاریه — login-page.tsx خودش هم مستقیم از localStorage استفاده میکنه
// ★ ولی اگه بخش‌های دیگه برنامه این فایل رو import میکنن، لازمه
// ============================================================================

const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

export interface StoredUser {
  userId: string;
  username: string;
  role: string;
  mobile: string | null;
  tenantId: string;
  storeId: string;
  storeName: string;
  permissions: string[];
  isActive: boolean;
  userType: 'storeUser' | 'portalUser';
}

/**
 * ذخیره access token در localStorage
 */
export function setAccessToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * خواندن access token از localStorage
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * حذف access token از localStorage
 */
export function removeAccessToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * ذخیره refresh token در localStorage
 */
export function setRefreshToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

/**
 * خواندن refresh token از localStorage
 */
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * ذخیره اطلاعات کاربر در localStorage
 */
export function setStoredUser(user: StoredUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * خواندن اطلاعات کاربر از localStorage
 */
export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

/**
 * پاکسازی تمام اطلاعات احراز هویت از localStorage
 */
export function clearAuthData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('storeName');
  localStorage.removeItem('tenant');
  localStorage.removeItem('planName');
}

/**
 * بررسی آیا کاربر لاگین کرده
 */
export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

/**
 * خواندن سطح دسترسی کاربر
 */
export function getUserRole(): string | null {
  const user = getStoredUser();
  return user?.role || null;
}

/**
 * بررسی آیا کاربر دسترسی کامل دارد
 */
export function isFullAccess(): boolean {
  const role = getUserRole();
  if (!role) return false;
  return ['admin', 'manager', 'owner', 'Admin', 'Manager', 'Owner'].includes(role);
}
