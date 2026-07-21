/**
 * Require Permission Middleware - ShopAccounting v4.0
 *
 * میدلویر اعمال مجوزها در سطح API
 * بر اساس فیلدهای واقعی Prisma Schema
 *
 * فیلدهای واقعی StoreUser:
 *   id, username, passwordHash, role, mobile,
 *   lastLoginAt, failedAttempts, lockoutEnd,
 *   tenantId, permissions (String | Null - JSON or comma-separated)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, DecodedToken } from '@/lib/jwt';

// ─── تایپ‌ها ───────────────────────────────────────────────

export type PermissionString = string;
export type PermissionCheck = PermissionString | PermissionString[] | PermissionChecker;

export type PermissionChecker = (
  user: DecodedToken,
  request: NextRequest
) => boolean | Promise<boolean>;

export interface RouteContext {
  params: Promise<{ [key: string]: string | string[] }>;
}

export type RouteHandler = (
  request: NextRequest,
  context: RouteContext
) => Promise<NextResponse> | NextResponse;

export type ProtectedRouteHandler = (
  request: NextRequest,
  context: RouteContext,
  user: DecodedToken
) => Promise<NextResponse> | NextResponse;

// ─── لیست مجوزهای معتبر ───────────────────────────────────

export const VALID_PERMISSIONS = [
  'dashboard',
  'pos',
  'products',
  'customers',
  'invoices',
  'installments',
  'accounting',
  'reports',
  'settings',
  'employees',
] as const;

export type ValidPermission = typeof VALID_PERMISSIONS[number];

// ─── میدلویر اصلی ─────────────────────────────────────────

export function withPermission(permission: PermissionCheck) {
  return (handler: ProtectedRouteHandler): RouteHandler => {
    return async (request: NextRequest, context: RouteContext): Promise<NextResponse> => {
      // 1. استخراج و اعتبارسنجی توکن
      const user = await getUserFromRequest(request);

      if (!user) {
        return NextResponse.json(
          {
            success: false,
            error: 'دسترسی غیرمجاز. لطفاً وارد حساب کاربری خود شوید.',
            errorCode: 'UNAUTHORIZED',
          },
          { status: 401 }
        );
      }

      // 2. بررسی مجوز
      const hasPermission = await checkPermission(permission, user, request);

      if (!hasPermission) {
        return NextResponse.json(
          {
            success: false,
            error: 'شما مجوز دسترسی به این بخش را ندارید.',
            errorCode: 'FORBIDDEN',
            requiredPermission: formatPermission(permission),
          },
          { status: 403 }
        );
      }

      // 3. اجرای handler اصلی با اطلاعات کاربر
      try {
        return await handler(request, context, user);
      } catch (error: any) {
        console.error('Route handler error', {
          userId: user.userId,
          tenantId: user.tenantId,
          error: error.message,
        });

        return NextResponse.json(
          {
            success: false,
            error: 'خطای داخلی سرور.',
            errorCode: 'INTERNAL_ERROR',
          },
          { status: 500 }
        );
      }
    };
  };
}

// ─── مجوزهای از پیش تعریف‌شده ──────────────────────────────────

export const managerOnly = withPermission((_user) => _user.role === 'Manager');

export const authenticatedOnly = withPermission(() => true);

export function canRead(permission: ValidPermission) {
  return withPermission((user) => {
    if (user.role === 'Manager') return true;
    return user.permissions?.includes(permission) ?? false;
  });
}

export function canWrite(permission: ValidPermission) {
  return withPermission((user) => {
    if (user.role === 'Manager') return true;
    return false;
  });
}

export const canDelete = withPermission((_user) => _user.role === 'Manager');

// ─── توابع کمکی ───────────────────────────────────────────────

async function checkPermission(
  permission: PermissionCheck,
  user: DecodedToken,
  request: NextRequest
): Promise<boolean> {
  if (typeof permission === 'string') {
    if (user.role === 'Manager') return true;
    return user.permissions?.includes(permission) ?? false;
  }

  if (Array.isArray(permission)) {
    if (user.role === 'Manager') return true;
    return permission.some((p) => user.permissions?.includes(p) ?? false);
  }

  if (typeof permission === 'function') {
    return await permission(user, request);
  }

  return false;
}

function formatPermission(permission: PermissionCheck): string {
  if (typeof permission === 'string') return permission;
  if (Array.isArray(permission)) return permission.join(' | ');
  return '[custom checker]';
}
