// ============================================================================
// src/app/api/auth/refresh/route.ts — POST /api/auth/refresh (v3.1 ★★★)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.1: پشتیبانی کامل از refresh توکن برای Customer (Portal)
//   ★ اگر customerId در payload بود، از جدول Customer می‌خواند
//   ★ portalToken را حفظ و بازگردانی می‌کند
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

    let decoded: any;
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

    const { userId, tenantId, userType, customerId } = decoded;

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
      const tenantDb = db.client;

      // ═══════════════════════════════════════════════════════════
      //  ★★★ v3.1: پشتیبانی از Customer (Portal User)
      // ═══════════════════════════════════════════════════════════
      if (userType === 'portalUser' && customerId) {
        const customer = await tenantDb.customer.findUnique({
          where: { id: customerId },
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true,
            mobile: true,
            nationalCode: true,
            tenantId: true,
            currentBalance: true,
            creditLimit: true,
            portalToken: true,
            isBlacklisted: true,
          },
        });

        if (!customer || customer.isBlacklisted) {
          const response = NextResponse.json(
            { success: false, error: 'Customer not found or blacklisted.' },
            { status: 401 }
          );
          clearRefreshTokenCookie(response);
          return response;
        }

        user = {
          ...customer,
          role: 'customer',
          username: `${customer.firstName} ${customer.lastName}`,
        };

        console.log('[Auth/Refresh] ✅ Customer token refreshed:', {
          customerId: customer.id,
          tenantId,
          name: `${customer.firstName} ${customer.lastName}`,
        });

      } else if (userType === 'portalUser') {
        // ─── حالت legacy: portalUsers (اگر وجود داشت) ──────────
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
        // ─── حالت StoreUser (پرسنل فروشگاه) ───────────────────
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

    // ═══════════════════════════════════════════════════════════
    //  ساخت Token Payload بر اساس نوع کاربر
    // ═══════════════════════════════════════════════════════════
    let tokenPayload: any;

    if (userType === 'portalUser' && customerId) {
      // ★★★ v3.1: Payload برای Customer
      tokenPayload = {
        customerId: user.id,
        tenantId,
        firstName: user.firstName,
        lastName: user.lastName,
        mobile: user.mobile,
        userType: 'portalUser',
        portalToken: user.portalToken,
      };
    } else {
      // Payload برای StoreUser
      tokenPayload = {
        userId: user.id,
        tenantId,
        username: user.username,
        role: user.role,
        userType: (userType || 'storeUser') as 'storeUser' | 'portalUser',
        permissions: userPermissions,
        storeId: user.storeId || undefined,
        storeName: user.storeName || tenant.companyName,
      };
    }

    const tokenPair = signTokenPair(tokenPayload);

    console.log('[Auth/Refresh] Token refreshed successfully', {
      userType,
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

    // ═══════════════════════════════════════════════════════════
    //  ساخت Response بر اساس نوع کاربر
    // ═══════════════════════════════════════════════════════════
    const responseData: any = {
      success: true,
      data: {
        token: tokenPair.accessToken,
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresIn: tokenPair.expiresIn,
        tenant: {
          id: tenant.id,
          subDomain: tenant.subDomain,
          companyName: tenant.companyName,
          planName: planName,
          planTierName: planName,
          planTierNameFa: planTierNameFa,
          billingCycle: tenant.billingCycle,
          status: tenant.status,
          isIsolated: false,
        },
      },
    };

    if (userType === 'portalUser' && customerId) {
      // ★★★ v3.1: Response برای Customer
      responseData.data.user = {
        id: user.id,
        customerId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        mobile: user.mobile,
        tenantId,
        userType: 'portalUser',
        currentBalance: user.currentBalance?.toString() || '0',
        creditLimit: user.creditLimit?.toString() || '0',
        portalToken: user.portalToken,
      };
    } else {
      // Response برای StoreUser
      responseData.data.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: userPermissions,
        tenantId,
        storeName: user.storeName || tenant.companyName,
        mobile: user.mobile || undefined,
        userType: (userType || 'storeUser'),
      };
    }

    const response = NextResponse.json(responseData);

    // ★★★ v3.1: ذخیره portal_token در کوکی برای Customer
    if (userType === 'portalUser' && customerId && user.portalToken) {
      response.cookies.set('portal_token', user.portalToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });
    }

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