// ============================================================================
// src/app/api/auth/refresh/route.ts — POST /api/auth/refresh (v3.0)
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
  verifyRefreshToken,
  signTokenPair,
  getRefreshTokenFromCookie,
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
  setTokenCookie,
  TokenExpiredError,
} from '@/lib/jwt';

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

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    let refreshToken = getRefreshTokenFromCookie(request);

    if (!refreshToken) {
      try {
        const body = await request.json();
        if (body?.refreshToken) {
          refreshToken = body.refreshToken;
        }
      } catch { /* body وجود نداره یا JSON نیست */ }
    }

    if (!refreshToken) {
      return NextResponse.json(
        { success: false, error: 'Refresh token not found. Please login again.' },
        { status: 401 }
      );
    }

    let decoded: { userId: string; tenantId: string; userType: string };
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error: any) {
      if (error instanceof TokenExpiredError) {
        const response = NextResponse.json(
          { success: false, error: 'Refresh token expired. Please login again.' },
          { status: 401 }
        );
        clearRefreshTokenCookie(response);
        return response;
      }

      const response = NextResponse.json(
        { success: false, error: 'Invalid refresh token. Please login again.' },
        { status: 401 }
      );
      clearRefreshTokenCookie(response);
      return response;
    }

    const { userId, tenantId, userType } = decoded;

    // ★★★ v3.0: بدون isIsolated
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        subDomain: true,
        companyName: true,
        status: true,
        planName: true,
        planTierId: true,
        billingCycle: true,
      },
    });

    if (!tenant) {
      const response = NextResponse.json(
        { success: false, error: 'Tenant not found.' },
        { status: 401 }
      );
      clearRefreshTokenCookie(response);
      return response;
    }

    if (tenant.status === 'sold') {
      const response = NextResponse.json(
        { success: false, error: 'This store has been sold and is no longer accessible.' },
        { status: 403 }
      );
      clearRefreshTokenCookie(response);
      return response;
    }

    let user: any = null;
    let userPermissions: string[] = [];

    try {
      // ★★★ v3.0: همیشه db.client
      const tenantDb = db.client;

      if (userType === 'portalUser') {
        const portalUser = await (tenantDb as any).portalUsers?.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            role: true,
            permissions: true,
          },
        });

        if (!portalUser) {
          const response = NextResponse.json(
            { success: false, error: 'User not found.' },
            { status: 401 }
          );
          clearRefreshTokenCookie(response);
          return response;
        }

        user = portalUser;
        userPermissions = parsePermissions(portalUser.permissions);
      } else {
        // ★ fallback برای StoreUser
        try {
          const storeUser = await tenantDb.storeUser.findUnique({
            where: { id: userId },
            select: {
              id: true,
              username: true,
              role: true,
              permissions: true,
              mobile: true,
              storeId: true,
              storeName: true,
            },
          });

          if (!storeUser) {
            const response = NextResponse.json(
              { success: false, error: 'User not found.' },
              { status: 401 }
            );
            clearRefreshTokenCookie(response);
            return response;
          }

          user = storeUser;
          userPermissions = parsePermissions((storeUser as any).permissions);
        } catch (err: any) {
          if (err?.message?.includes('Invalid column') || err?.message?.includes('does not exist')) {
            console.warn('[Auth/Refresh] Some columns missing, using basic select');
            const storeUser = await tenantDb.storeUser.findUnique({
              where: { id: userId },
              select: {
                id: true,
                username: true,
                role: true,
                permissions: true,
                mobile: true,
              },
            });

            if (!storeUser) {
              const response = NextResponse.json(
                { success: false, error: 'User not found.' },
                { status: 401 }
              );
              clearRefreshTokenCookie(response);
              return response;
            }

            user = storeUser;
            userPermissions = parsePermissions((storeUser as any).permissions);
          } else {
            throw err;
          }
        }
      }
    } catch (dbError: any) {
      console.error('[Auth/Refresh] DB error:', dbError.message);
      const response = NextResponse.json(
        { success: false, error: 'Database connection error.' },
        { status: 500 }
      );
      clearRefreshTokenCookie(response);
      return response;
    }

    const tokenPayload = {
      userId: user.id,
      tenantId,
      username: user.username,
      role: user.role,
      userType: (userType || 'storeUser') as 'storeUser' | 'portalUser',
      permissions: userPermissions,
    };

    const tokenPair = signTokenPair(tokenPayload);

    console.log('[Auth/Refresh] Token refreshed successfully', {
      userId: user.id,
      tenantId,
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
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: userPermissions,
          tenantId,
          storeName: user.storeName || tenant.companyName,
          mobile: user.mobile || undefined,
        },
        tenant: {
          id: tenant.id,
          subDomain: tenant.subDomain,
          companyName: tenant.companyName,
          planName: planName,
          planTierName: planName,
          planTierNameFa: planTierNameFa,
          billingCycle: tenant.billingCycle,
          status: tenant.status,
          isIsolated: false,  // ★ v3.0: همیشه false
        },
      },
    });

    setTokenCookie(response, tokenPair.accessToken);
    setRefreshTokenCookie(response, tokenPair.refreshToken);

    return response;
  } catch (error: any) {
    console.error('[Auth/Refresh] Unexpected error:', {
      error: error.message,
      stack: error.stack,
      durationMs: Date.now() - startTime,
    });

    const response = NextResponse.json(
      { success: false, error: 'Internal server error during token refresh.' },
      { status: 500 }
    );
    clearRefreshTokenCookie(response);
    return response;
  }
}
