/**
 * JWT Utility — ShopAccounting v23.2
 *
 * توابع استخراج و اعتبارسنجی JWT Token
 * + توابع مدیریت کوکی و تولید جفت توکن
 *
 * فایل: src/lib/jwt.ts
 *
 * ★★★ تغییرات v23.2 نسبت به v23.1:
 *   ★ رفع مشکل matching نام تابع — نام تابع middleware به proxy تغییر نکرد
 *   ★ اضافه شدن نام‌گذاری واضح‌تر برای خطاها
 */

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

// ─── Types ─────────────────────────────────────────────────────

export interface DecodedToken {
  userId: string;
  username: string;
  role: string;
  tenantId: string;
   userType: 'storeUser' | 'portalUser' | 'admin';
  permissions: string[];
  storeId?: string;
  storeName?: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // ثانیه تا انقضای access token
}

// ─── Constants ─────────────────────────────────────────────────

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'default-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'default-refresh-secret';
const ACCESS_TOKEN_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '24h';
const REFRESH_TOKEN_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';
const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
const TOKEN_COOKIE_NAME = 'token';

// ─── Custom Errors ─────────────────────────────────────────────

export class TokenExpiredError extends Error {
  public readonly expiredAt: Date;

  constructor(message: string = 'توکن منقضی شده است', expiredAt?: Date) {
    super(message);
    this.name = 'TokenExpiredError';
    this.expiredAt = expiredAt || new Date();
    Object.setPrototypeOf(this, TokenExpiredError.prototype);
  }
}

export class TokenInvalidError extends Error {
  constructor(message: string = 'توکن نامعتبر است') {
    super(message);
    this.name = 'TokenInvalidError';
    Object.setPrototypeOf(this, TokenInvalidError.prototype);
  }
}

// ─── توابع کمکی ───────────────────────────────────────────────

/**
 * استخراج کاربر از درخواست HTTP
 *
 * از هدر Authorization: Bearer <token> استفاده می‌کند
 * اگر توکن معتبر نباشد یا وجود نداشته باشد، null برمی‌گرداند
 */
export async function getUserFromRequest(request: NextRequest): Promise<DecodedToken | null> {
  try {
    // ★ روش ۱: هدر Authorization ★
    let authHeader = request.headers.get('Authorization');

    // ★ روش ۲: هدر x-authorization (ست شده توسط middleware.ts) ★
    if (!authHeader?.startsWith('Bearer ')) {
      authHeader = request.headers.get('x-authorization');
    }

    // ★ روش ۳: کوکی token ★
    if (!authHeader?.startsWith('Bearer ')) {
      const tokenFromCookie = request.cookies.get(TOKEN_COOKIE_NAME)?.value;
      if (tokenFromCookie) {
        authHeader = `Bearer ${tokenFromCookie}`;
      }
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7); // حذف "Bearer "

    if (!token) {
      return null;
    }

    return verifyToken(token);
  } catch (error: any) {
    console.error('[JWT] getUserFromRequest error:', error.message);
    return null;
  }
}

/**
 * اعتبارسنجی و رمزگشایی Access Token
 * در صورت خطا null برمی‌گرداند (برای استفاده در middleware/guards)
 */
export function verifyToken(token: string): DecodedToken | null {
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as any;

    return {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      tenantId: decoded.tenantId,
      userType: decoded.userType || 'storeUser',
      permissions: decoded.permissions || [],
      storeId: decoded.storeId || undefined,
      storeName: decoded.storeName || undefined,
      iat: decoded.iat,
      exp: decoded.exp,
    };
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      console.warn('[JWT] Token expired');
    } else {
      console.error('[JWT] verifyToken error:', error.message);
    }
    return null;
  }
}

/**
 * اعتبارسنجی Refresh Token
 * ★ در صورت خطا throw می‌کند (برای استفاده در refresh endpoint)
 * - TokenExpiredError: توکن منقضی شده
 * - TokenInvalidError: توکن نامعتبر
 */
export function verifyRefreshToken(token: string): { userId: string; tenantId: string; userType: string } {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as any;
    return {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      userType: decoded.userType || 'storeUser',
    };
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new TokenExpiredError('Refresh token منقضی شده است', error.expiredAt);
    }
    throw new TokenInvalidError('Refresh token نامعتبر است');
  }
}

/**
 * تولید Access Token
 */
export function generateAccessToken(payload: Omit<DecodedToken, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES } as jwt.SignOptions);
}

/**
 * تولید Refresh Token
 */
export function generateRefreshToken(userId: string, tenantId: string, userType: string): string {
  return jwt.sign({ userId, tenantId, userType }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES } as jwt.SignOptions);
}

/**
 * تولید جفت توکن (access + refresh)
 * ★ برای استفاده در login و refresh endpoints
 */
export function signTokenPair(payload: Omit<DecodedToken, 'iat' | 'exp'>): TokenPair {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload.userId, payload.tenantId, payload.userType);

  // محاسبه expiresIn از access token
  const decoded = jwt.decode(accessToken) as any;
  const expiresIn = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 86400;

  return { accessToken, refreshToken, expiresIn };
}

// ─── مدیریت کوکی ─────────────────────────────────────────────

/**
 * استخراج refresh token از کوکی درخواست
 */
export function getRefreshTokenFromCookie(request: NextRequest): string | null {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
  return refreshToken || null;
}

/**
 * استخراج access token از کوکی یا هدر Authorization
 */
export function getTokenFromRequest(request: NextRequest): string | null {
  // اول از هدر Authorization
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // بعد از کوکی
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value;
  return token || null;
}

/**
 * تنظیم کوکی refresh token در پاسخ
 */
export function setRefreshTokenCookie(response: NextResponse, refreshToken: string): void {
  response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // ۷ روز
    path: '/',
  });
}

/**
 * تنظیم کوکی access token در پاسخ
 */
export function setTokenCookie(response: NextResponse, accessToken: string): void {
  response.cookies.set(TOKEN_COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 1, // ۱ روز
    path: '/',
  });
}

/**
 * پاک کردن کوکی refresh token از پاسخ
 */
export function clearRefreshTokenCookie(response: NextResponse): void {
  response.cookies.set(REFRESH_TOKEN_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

/**
 * پاک کردن کوکی access token از پاسخ
 */
export function clearTokenCookie(response: NextResponse): void {
  response.cookies.set(TOKEN_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

// ─── توابع کمکی اضافی ────────────────────────────────────────

/**
 * بررسی نقش دسترسی کامل
 */
export function isFullAccessRole(role: string | undefined): boolean {
  if (!role) return false;
  const fullAccessRoles = new Set(['Admin', 'Manager', 'Owner', 'admin', 'manager', 'owner']);
  return fullAccessRoles.has(role);
}

/**
 * بررسی آیا توکن نزدیک انقضا است (کمتر از ۵ دقیقه)
 */
export function isTokenNearExpiry(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as any;
    if (!decoded?.exp) return true;

    const expiresAt = decoded.exp * 1000;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    return expiresAt - now < fiveMinutes;
  } catch {
    return true;
  }
}
