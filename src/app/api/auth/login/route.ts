// ============================================================================
// src/app/api/auth/login/route.ts — POST /api/auth/login (v3.0)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.0:
//   ★ حذف isIsolated — دیگه این فیلد در Tenant وجود نداره
//   ★ db.forTenant همیشه db.client رو برمی‌گردانه
// ★ حفظ fallback های قبلی برای ستون‌های مفقود در StoreUser
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  signTokenPair,
  setTokenCookie,
  setRefreshTokenCookie,
} from '@/lib/jwt';
import bcrypt from 'bcryptjs';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function parsePermissions(permissions: string | null): string[] {
  if (!permissions) return [];
  if (permissions.startsWith('[')) {
    try {
      const parsed = JSON.parse(permissions);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  if (permissions.trim() === 'all') return ['all'];
  return permissions.split(',').map((p: string) => p.trim()).filter(Boolean);
}

/**
 * ★ جستجوی کاربر — با fallback برای ستون‌های مفقود
 */
async function findStoreUser(tenantDb: any, username: string, tenantId: string | null) {
  // ★★★ v3.0: همیشه tenantId فیلتر بشه (حتی isolated که دیگه نداریم)
  const where: any = { username };
  if (tenantId) where.tenantId = tenantId;

  try {
    const user = await tenantDb.storeUser.findFirst({
      where,
      select: {
        id: true,
        username: true,
        password: true,
        role: true,
        permissions: true,
        mobile: true,
        isActive: true,
        lastLoginAt: true,
        lockoutEnd: true,
        failedAttempts: true,
        storeId: true,
        storeName: true,
      },
    });
    return { user, hasLockoutColumns: true };
  } catch (err: any) {
    if (err?.message?.includes('Invalid column') || err?.message?.includes('does not exist')) {
      console.warn('[Auth/Login] Lockout columns not found, using basic select for tenant');
      try {
        const user = await tenantDb.storeUser.findFirst({
          where,
          select: {
            id: true,
            username: true,
            password: true,
            role: true,
            permissions: true,
            mobile: true,
            isActive: true,
            lastLoginAt: true,
          },
        });
        return { user, hasLockoutColumns: false };
      } catch (err2: any) {
        console.error('[Auth/Login] Even basic select failed:', err2?.message);
        return { user: null, hasLockoutColumns: false };
      }
    }
    throw err;
  }
}

async function incrementFailedAttempts(tenantDb: any, userId: string, currentAttempts: number, hasLockoutColumns: boolean) {
  if (!hasLockoutColumns) return;
  try {
    const newAttempts = currentAttempts + 1;
    const updateData: any = { failedAttempts: newAttempts };
    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      updateData.lockoutEnd = new Date(Date.now() + LOCKOUT_MINUTES * 60000);
    }
    await tenantDb.storeUser.update({
      where: { id: userId },
      data: updateData,
    });
  } catch (err: any) {
    console.warn('[Auth/Login] Failed to update failedAttempts:', err?.message);
  }
}

async function resetLoginStats(tenantDb: any, userId: string, hasLockoutColumns: boolean) {
  try {
    const updateData: any = { lastLoginAt: new Date() };
    if (hasLockoutColumns) {
      updateData.failedAttempts = 0;
      updateData.lockoutEnd = null;
    }
    await tenantDb.storeUser.update({
      where: { id: userId },
      data: updateData,
    });
  } catch (err: any) {
    console.warn('[Auth/Login] Failed to update lastLoginAt:', err?.message);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'نام کاربری و رمز عبور الزامی است', errorCode: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    const tenantSlug = request.cookies.get('tenant-slug')?.value
      || request.headers.get('x-tenant-slug')
      || null;

    let user: any = null;
    let tenant: any = null;
    let userType: 'storeUser' | 'portalUser' = 'storeUser';
    let hasLockoutColumns = false;

    // ═★★ v3.0: دریافت tenant ها بدون isIsolated ═★★
    const tenants = await db.client.tenant.findMany({
      where: { status: { not: 'sold' } },
      select: {
        id: true,
        subDomain: true,
        companyName: true,
        status: true,
        ownerName: true,
        logoUrl: true,
        planName: true,
        planTierId: true,
        billingCycle: true,
        expiresAt: true,
        soldAt: true,
      },
    });

    let tenantOrder = tenants;
    if (tenantSlug) {
      const preferred = tenants.find(t => t.subDomain === tenantSlug);
      const others = tenants.filter(t => t.subDomain !== tenantSlug);
      tenantOrder = preferred ? [preferred, ...others] : tenants;
      console.log('[Auth/Login] Tenant slug from cookie:', tenantSlug);
    } else {
      console.log('[Auth/Login] No tenant slug — searching across all tenants');
    }

    for (const t of tenantOrder) {
      try {
        // ★★★ v3.0: همیشه db.client (در معماری یکپارچه)
        const tenantDb = db.client;

        const result = await findStoreUser(tenantDb, username, t.id);

        if (result.user) {
          user = result.user;
          hasLockoutColumns = result.hasLockoutColumns;
          userType = 'storeUser';
          tenant = t;
          console.log('[Auth/Login] Found storeUser:', username, 'in tenant:', t.subDomain,
            hasLockoutColumns ? '(full columns)' : '(basic columns)');
          break;
        }

        // سپس portalUser
        try {
          user = await (tenantDb as any).portalUsers?.findFirst({
            where: { username },
            select: {
              id: true,
              username: true,
              password: true,
              role: true,
              permissions: true,
              mobile: true,
              isActive: true,
            },
          });
          if (user) {
            userType = 'portalUser';
            tenant = t;
            hasLockoutColumns = false;
            console.log('[Auth/Login] Found portalUser:', username, 'in tenant:', t.subDomain);
            break;
          }
        } catch { /* portalUser وجود نداره */ }
      } catch (err: any) {
        console.warn('[Auth/Login] Error searching tenant', t.subDomain, ':', err.message);
        continue;
      }
    }

    if (!user || !tenant) {
      console.warn('[Auth/Login] User not found:', username);
      return NextResponse.json(
        { success: false, error: 'نام کاربری یا رمز عبور اشتباه است', errorCode: 'INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

    if (user.isActive === false) {
      return NextResponse.json(
        { success: false, error: 'حساب کاربری شما غیرفعال شده است. با مدیر فروشگاه تماس بگیرید', errorCode: 'ACCOUNT_INACTIVE' },
        { status: 403 }
      );
    }

    if (hasLockoutColumns && user.lockoutEnd && new Date(user.lockoutEnd) > new Date()) {
      const remainingMinutes = Math.ceil(
        (new Date(user.lockoutEnd).getTime() - Date.now()) / 60000
      );
      return NextResponse.json(
        {
          success: false,
          error: `حساب شما قفل شده است. لطفاً ${remainingMinutes} دقیقه دیگر تلاش کنید`,
          errorCode: 'ACCOUNT_LOCKED',
        },
        { status: 423 }
      );
    }

    const storedPassword = user.password;
    if (!storedPassword) {
      return NextResponse.json(
        { success: false, error: 'نام کاربری یا رمز عبور اشتباه است', errorCode: 'INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

    let isPasswordValid = false;
    if (storedPassword === password) {
      isPasswordValid = true;
    } else {
      try {
        isPasswordValid = await bcrypt.compare(password, storedPassword);
      } catch {
        isPasswordValid = false;
      }
    }

    if (!isPasswordValid) {
      const currentAttempts = user.failedAttempts || 0;
      const tenantDb = db.client;
      await incrementFailedAttempts(tenantDb, user.id, currentAttempts, hasLockoutColumns);

      const remaining = MAX_FAILED_ATTEMPTS - (currentAttempts + 1);
      if (hasLockoutColumns && remaining <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: `حساب شما به دلیل ${MAX_FAILED_ATTEMPTS} تلاش ناموفق قفل شد`,
            errorCode: 'ACCOUNT_LOCKED',
          },
          { status: 423 }
        );
      }

      return NextResponse.json(
        { success: false, error: 'نام کاربری یا رمز عبور اشتباه است', errorCode: 'INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

    const userPermissions = parsePermissions(user.permissions);
    const tokenPayload = {
      userId: user.id,
      tenantId: tenant.id,
      username: user.username,
      role: user.role,
      userType,
      permissions: userPermissions,
    };

    const tokenPair = signTokenPair(tokenPayload);

    const tenantDb = db.client;
    await resetLoginStats(tenantDb, user.id, hasLockoutColumns);

    if (userType === 'portalUser') {
      try {
        await (tenantDb as any).portalUsers?.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      } catch { /* ignore */ }
    }

    console.log('[Auth/Login] Login successful', {
      userId: user.id,
      tenantId: tenant.id,
      username: user.username,
      durationMs: Date.now() - startTime,
    });

    // ★★★ v3.0: دریافت نام پلن از PlanTier
    let planName = tenant.planName || 'simple';
    let planTierNameFa = 'ساده';

    if (tenant.planTierId) {
      try {
        const planTier = await db.client.planTier.findUnique({
          where: { id: tenant.planTierId },
        });
        if (planTier) {
          planName = planTier.name;
          planTierNameFa = planTier.nameFa;
        }
      } catch { /* ignore */ }
    }

    const response = NextResponse.json({
      success: true,
      data: {
        token: tokenPair.accessToken,
        expiresIn: tokenPair.expiresIn,
        refreshToken: tokenPair.refreshToken,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          mobile: user.mobile || '',
          tenantId: tenant.id,
          userType,
          permissions: userPermissions,
          storeName: user.storeName || tenant.companyName,
        },
        tenant: {
          id: tenant.id,
          subDomain: tenant.subDomain,
          companyName: tenant.companyName,
          planName: planName,
          planTierName: planName,
          planTierNameFa: planTierNameFa,
          billingCycle: tenant.billingCycle || 'monthly',
          status: tenant.status,
          isIsolated: false,  // ★ v3.0: همیشه false
        },
      },
    });

    setTokenCookie(response, tokenPair.accessToken);
    setRefreshTokenCookie(response, tokenPair.refreshToken);

    return response;
  } catch (error: any) {
    console.error('[Auth/Login] Unexpected error:', {
      error: error.message,
      stack: error.stack,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور', errorCode: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
