// ============================================================================
// src/app/api/auth/verify/route.ts — GET /api/auth/verify (v3.0)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.0: حذف isIsolated — دیگه این فیلد در Tenant وجود نداره
// ★ حفظ fallback های قبلی برای ستون‌های مفقود در StoreUser
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { db } from '@/lib/db';

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

export async function GET(request: NextRequest) {
  try {
    let authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      authHeader = request.headers.get('x-authorization');
    }

    const token = authHeader?.replace('Bearer ', '') || request.cookies.get('token')?.value;

    if (!token) {
      console.warn('[Auth/Verify] No token found in headers or cookies');
      return NextResponse.json(
        { success: false, error: 'توکن یافت نشد' },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      console.warn('[Auth/Verify] Token invalid or expired', {
        tokenPrefix: token.substring(0, 20) + '...',
      });
      return NextResponse.json(
        { success: false, error: 'توکن نامعتبر یا منقضی شده' },
        { status: 401 }
      );
    }

    console.log('[Auth/Verify] Token decoded successfully', {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      userType: decoded.userType,
    });

    const { userId, tenantId, userType } = decoded;

    // ★★★ v3.0: بدون isIsolated
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
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
      },
    });

    if (!tenant) {
      console.warn('[Auth/Verify] Tenant not found:', tenantId);
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد' },
        { status: 401 }
      );
    }

    if (tenant.status === 'sold') {
      console.warn('[Auth/Verify] Tenant sold:', tenantId);
      return NextResponse.json(
        { success: false, error: 'این فروشگاه فروخته شده و دیگر قابل دسترسی نیست' },
        { status: 403 }
      );
    }

    let user: any = null;
    let userPermissions: string[] = [];

    try {
      const tenantDb = db.client;  // ★ v3.0: همیشه db.client

      if (userType === 'portalUser') {
        const portalUser = await tenantDb.portalUsers?.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            role: true,
            permissions: true,
          },
        });

        if (!portalUser) {
          console.warn('[Auth/Verify] PortalUser not found:', { userId, tenantId });
          return NextResponse.json(
            { success: false, error: 'کاربر یافت نشد' },
            { status: 401 }
          );
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
            console.warn('[Auth/Verify] StoreUser not found:', { userId, tenantId });
            return NextResponse.json(
              { success: false, error: 'کاربر یافت نشد' },
              { status: 401 }
            );
          }

          user = storeUser;
          userPermissions = parsePermissions((storeUser as any).permissions);
        } catch (err: any) {
          if (err?.message?.includes('Invalid column') || err?.message?.includes('does not exist')) {
            console.warn('[Auth/Verify] Some columns missing, using basic select');
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
              return NextResponse.json(
                { success: false, error: 'کاربر یافت نشد' },
                { status: 401 }
              );
            }

            user = storeUser;
            userPermissions = parsePermissions((storeUser as any).permissions);
          } else {
            throw err;
          }
        }
      }
    } catch (dbError: any) {
      console.error('[Auth/Verify] DB error:', dbError.message);
      return NextResponse.json(
        { success: false, error: 'خطا در اتصال به دیتابیس' },
        { status: 500 }
      );
    }

    // ★ دریافت نام پلن از PlanTier
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

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: userPermissions,
        tenantId,
        tenantSubDomain: tenant.subDomain,
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
        expiresAt: tenant.expiresAt,
      },
    });
  } catch (error: any) {
    console.error('[Auth/Verify] Unexpected error:', error.message);
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    );
  }
}
