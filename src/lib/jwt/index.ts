/**
 * JWT Service - ShopAccounting v4.0
 *
 * جایگزینی mock-jwt-token با JSON Web Token واقعی
 * از کتابخانه jose استفاده می‌شود (سازگار با Edge Runtime)
 *
 * فیلدهای واقعی StoreUser:
 *   id, username, passwordHash, role, mobile,
 *   lastLoginAt, failedAttempts, lockoutEnd,
 *   tenantId, permissions
 *
 * Access Token: 15 دقیقه - در memory نگهداری می‌شود
 * Refresh Token: 7 روز - در httpOnly cookie نگهداری می‌شود
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// ─── تنظیمات ───────────────────────────────────────────────
const ALGORITHM = 'HS256';

// کلیدهای رمزنگاری
function getAccessSecret(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not defined in environment variables');
  }
  return new TextEncoder().encode(secret);
}

function getRefreshSecret(): Uint8Array {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not defined in environment variables');
  }
  return new TextEncoder().encode(secret);
}

// زمان انقضا
const ACCESS_TOKEN_EXPIRES = '15m';   // 15 دقیقه
const REFRESH_TOKEN_EXPIRES = '7d';   // 7 روز
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 روز به ثانیه

// ─── تایپ‌ها ───────────────────────────────────────────────

export interface TokenPayload {
  userId: string;
  tenantId: string;
  role: 'Manager' | 'Cashier';
  permissions: string[];
  username: string;
}

export interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // ثانیه تا انقضای access token
}

// ─── توکن‌ساز ───────────────────────────────────────────────

/**
 * ایجاد Access Token (کوتاه‌مدت - 15 دقیقه)
 */
export async function signAccessToken(payload: TokenPayload): Promise<string> {
  const secret = getAccessSecret();

  const token = await new SignJWT({
    ...payload,
    type: 'access',
  })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRES)
    .setIssuer('shopaccounting')
    .setAudience('shopaccounting-api')
    .setSubject(payload.userId)
    .sign(secret);

  return token;
}

/**
 * ایجاد Refresh Token (بلندمدت - 7 روز)
 */
export async function signRefreshToken(payload: TokenPayload): Promise<string> {
  const secret = getRefreshSecret();

  const token = await new SignJWT({
    userId: payload.userId,
    tenantId: payload.tenantId,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRES)
    .setIssuer('shopaccounting')
    .setAudience('shopaccounting-refresh')
    .setSubject(payload.userId)
    .sign(secret);

  return token;
}

/**
 * ایجاد جفت توکن (Access + Refresh)
 * همچنین Refresh Token را در httpOnly cookie تنظیم می‌کند
 */
export async function signTokenPair(payload: TokenPayload): Promise<TokenPair> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(payload),
    signRefreshToken(payload),
  ]);

  // تنظیم refresh token در httpOnly cookie
  try {
    const cookieStore = await cookies();
    cookieStore.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/refresh',
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
  } catch {
    // در برخی محیط‌ها cookieStore در دسترس نیست
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // 15 دقیقه به ثانیه
  };
}

// ─── توکن‌خوان ───────────────────────────────────────────────

/**
 * اعتبارسنجی Access Token
 */
export async function verifyAccessToken(token: string): Promise<DecodedToken> {
  try {
    const secret = getAccessSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'shopaccounting',
      audience: 'shopaccounting-api',
    });

    return payload as unknown as DecodedToken;
  } catch (error: any) {
    if (error.code === 'ERR_JWT_EXPIRED') {
      throw new TokenExpiredError('Access token expired');
    }
    throw new TokenInvalidError(`Invalid access token: ${error.message}`);
  }
}

/**
 * اعتبارسنجی Refresh Token
 */
export async function verifyRefreshToken(token: string): Promise<{ userId: string; tenantId: string }> {
  try {
    const secret = getRefreshSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'shopaccounting',
      audience: 'shopaccounting-refresh',
    });

    return {
      userId: payload.sub as string,
      tenantId: (payload as any).tenantId as string,
    };
  } catch (error: any) {
    if (error.code === 'ERR_JWT_EXPIRED') {
      throw new TokenExpiredError('Refresh token expired');
    }
    throw new TokenInvalidError(`Invalid refresh token: ${error.message}`);
  }
}

// ─── توابع کمکی ───────────────────────────────────────────────

/**
 * استخراج توکن از هدر Authorization
 * فرمت: Bearer <token>
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  return parts[1];
}

/**
 * گرفتن payload کاربر از توکن در درخواست فعلی
 */
export async function getUserFromRequest(request: Request): Promise<DecodedToken | null> {
  const authHeader = request.headers.get('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) return null;

  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

/**
 * پاک کردن Refresh Token cookie (برای خروج)
 */
export async function clearRefreshTokenCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('refresh_token');
  } catch {
    // در برخی محیط‌ها cookieStore در دسترس نیست
  }
}

/**
 * گرفتن Refresh Token از cookie
 */
export async function getRefreshTokenFromCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('refresh_token')?.value ?? null;
  } catch {
    return null;
  }
}

// ─── خطاهای سفارشی ───────────────────────────────────────────────

export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export class TokenInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenInvalidError';
  }
}
