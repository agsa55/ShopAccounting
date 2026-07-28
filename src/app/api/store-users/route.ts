/**
 * API Route: Store Users v10 — ShopAccounting v10.0
 *
 * ★★★ اصلاحات v10 نسبت به v6:
 *   ★ حذف firstName/lastName — این ستون‌ها در جدول StoreUsers وجود ندارند!
 *   ★ اضافه شدن ستون‌های واقعی: permissions, storeId, storeName, failedAttempts
 *   ★ جستجو بر اساس username, mobile, storeName (نه firstName/lastName)
 *   ★ پشتیبانی از نقش Admin علاوه بر Manager
 *
 * ستون‌های واقعی StoreUser:
 *   id, username, password, mobile, role, permissions, tenantId,
 *   storeId, storeName, isActive, lastLoginAt, createdAt, updatedAt,
 *   failedAttempts, lockoutEnd
 *
 * فایل: src/app/api/store-users/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation';
import { requireSubscriptionAndLimit } from '@/lib/plan-guard';
import bcrypt from 'bcryptjs';

// ─── GET: لیست کاربران فروشگاه ────────────────────────────────
export const GET = withTenantAndPermission('employees')(
  async (request: NextRequest, _context: any, tenant: any) => {
    try {
      const { searchParams } = new URL(request.url);
      const search = searchParams.get('search');
      const role = searchParams.get('role');

      const where: any = { isActive: true };
      if (!tenant.isIsolated) where.tenantId = tenant.tenantId;
      if (search) {
        // ★ جستجو بر اساس ستون‌های واقعی — بدون firstName/lastName
        where.OR = [
          { username: { contains: search } },
          { mobile: { contains: search } },
          { storeName: { contains: search } },
        ];
      }
      if (role) where.role = role;

      // ★ ستون‌های واقعی — بدون firstName/lastName
      const users = await tenant.tenantDb.storeUser.findMany({
        where,
        select: {
          id: true,
          username: true,
          mobile: true,
          role: true,
          permissions: true,
          storeId: true,
          storeName: true,
          isActive: true,
          lastLoginAt: true,
          failedAttempts: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json({ success: true, data: { users } });
    } catch (error: any) {
      console.error(`[StoreUsers] GET error: ${error.message}`);
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت کاربران.' },
        { status: 500 }
      );
    }
  }
);

// ─── POST: ایجاد کاربر جدید ────────────────────────────────
export const POST = withTenantAndPermission('employees')(
  async (request: NextRequest, _context: any, tenant: any) => {
    // ★ فقط مدیر می‌تواند کاربر اضافه کند
    if (tenant.user.role !== 'Manager' && tenant.user.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'فقط مدیر می‌تواند کاربر جدید اضافه کند.', errorCode: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    try {
      // ★ بررسی اشتراک فعال + محدودیت کاربران
      const guard = await requireSubscriptionAndLimit(tenant.tenantId, 'users');
      if (!guard.allowed) {
        return NextResponse.json(
          { success: false, error: guard.message, errorCode: 'PLAN_LIMIT_EXCEEDED' },
          { status: 403 }
        );
      }

      const body = await request.json();

      if (!body.username || !body.password) {
        return NextResponse.json(
          { success: false, error: 'نام کاربری و رمز عبور الزامی است.' },
          { status: 400 }
        );
      }

      // ★ بررسی تکراری نبودن نام کاربری
      const where: any = { username: body.username };
      if (!tenant.isIsolated) where.tenantId = tenant.tenantId;

      const existing = await tenant.tenantDb.storeUser.findFirst({ where });
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'نام کاربری قبلاً استفاده شده است.' },
          { status: 409 }
        );
      }

      // ★ هش رمز عبور
      const hashedPassword = await bcrypt.hash(body.password, 10);

      // ★ ستون‌های واقعی — بدون firstName/lastName
      const userData: any = {
        username: body.username,
        password: hashedPassword,
        mobile: body.mobile || null,
        role: body.role || 'Cashier',
        permissions: body.permissions || null,
        storeId: body.storeId || null,
        storeName: body.storeName || null,
        isActive: true,
        failedAttempts: 0,
      };

      // ★ برای tenant اشتراکی باید tenantId ست بشه
      if (!tenant.isIsolated) {
        userData.tenantId = tenant.tenantId;
      }

      const user = await tenant.tenantDb.storeUser.create({
        data: userData,
      });

      // ★ بدون برگرداندن رمز عبور
      const { password: _, ...safeUser } = user;

      return NextResponse.json({ success: true, data: { user: safeUser } }, { status: 201 });
    } catch (error: any) {
      console.error(`[StoreUsers] POST error: ${error.message}`);
      return NextResponse.json(
        { success: false, error: 'خطا در ایجاد کاربر.' },
        { status: 500 }
      );
    }
  }
);

// ─── PUT: ویرایش کاربر ────────────────────────────────────
export const PUT = withTenantAndPermission('employees')(
  async (request: NextRequest, _context: any, tenant: any) => {
    // ★ فقط مدیر می‌تواند کاربر ویرایش کند
    if (tenant.user.role !== 'Manager' && tenant.user.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'فقط مدیر می‌تواند کاربر ویرایش کند.', errorCode: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    try {
      const body = await request.json();

      if (!body.id) {
        return NextResponse.json(
          { success: false, error: 'شناسه کاربر الزامی است.' },
          { status: 400 }
        );
      }

      const where: any = { id: body.id };
      if (!tenant.isIsolated) where.tenantId = tenant.tenantId;

      const existing = await tenant.tenantDb.storeUser.findFirst({ where });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'کاربر یافت نشد.' },
          { status: 404 }
        );
      }

      // ★ ستون‌های واقعی — بدون firstName/lastName
      const updateData: any = {};
      if (body.mobile !== undefined) updateData.mobile = body.mobile;
      if (body.role !== undefined) updateData.role = body.role;
      if (body.permissions !== undefined) updateData.permissions = body.permissions;
      if (body.storeId !== undefined) updateData.storeId = body.storeId;
      if (body.storeName !== undefined) updateData.storeName = body.storeName;
      if (body.isActive !== undefined) updateData.isActive = body.isActive;

      // ★ اگر رمز عبور جدید داده شده، هش کن و ریست کن شمارنده‌ها رو
      if (body.password) {
        updateData.password = await bcrypt.hash(body.password, 10);
        updateData.failedAttempts = 0;
        updateData.lockoutEnd = null;
      }

      const user = await tenant.tenantDb.storeUser.update({
        where: { id: body.id },
        data: updateData,
      });

      // ★ بدون برگرداندن رمز عبور
      const { password: _, ...safeUser } = user;

      return NextResponse.json({ success: true, data: { user: safeUser } });
    } catch (error: any) {
      console.error(`[StoreUsers] PUT error: ${error.message}`);
      return NextResponse.json(
        { success: false, error: 'خطا در ویرایش کاربر.' },
        { status: 500 }
      );
    }
  }
);

// ─── DELETE: حذف (غیرفعال‌سازی) کاربر ────────────────────────────────
export const DELETE = withTenantAndPermission('employees')(
  async (request: NextRequest, _context: any, tenant: any) => {
    // ★ فقط مدیر می‌تواند کاربر حذف کند
    if (tenant.user.role !== 'Manager' && tenant.user.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'فقط مدیر می‌تواند کاربر حذف کند.', errorCode: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    try {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');

      if (!id) {
        return NextResponse.json(
          { success: false, error: 'شناسه کاربر الزامی است.' },
          { status: 400 }
        );
      }

      const where: any = { id };
      if (!tenant.isIsolated) where.tenantId = tenant.tenantId;

      const existing = await tenant.tenantDb.storeUser.findFirst({ where });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'کاربر یافت نشد.' },
          { status: 404 }
        );
      }

      // ★ به جای حذف واقعی، غیرفعال می‌کنیم (soft delete)
      await tenant.tenantDb.storeUser.update({
        where: { id },
        data: { isActive: false },
      });

      return NextResponse.json({ success: true, message: 'کاربر غیرفعال شد.' });
    } catch (error: any) {
      console.error(`[StoreUsers] DELETE error: ${error.message}`);
      return NextResponse.json(
        { success: false, error: 'خطا در حذف کاربر.' },
        { status: 500 }
      );
    }
  }
);
