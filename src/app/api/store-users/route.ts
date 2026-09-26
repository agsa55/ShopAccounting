/**
 * API Route: Store Users v10 — ShopAccounting v10.0
 *
 * ★★★ اصلاحات v10 نسبت به v6:
 *   ★ حذف firstName/lastName — این ستون‌ها در جدول StoreUsers وجود ندارند!
 *   ★ اضافه شدن ستون‌های واقعی: permissions, storeId, storeName, failedAttempts
 *   ★ جستجو بر اساس username, mobile, storeName (نه firstName/lastName)
 *   ★ پشتیبانی از نقش Admin علاوه بر Manager
 *
 * ★ v11.9.5: محافظت از کاربر اصلی (admin/Manager)
 *   - جلوگیری از ایجاد Manager جدید
 *   - جلوگیری از تغییر نقش admin
 *   - جلوگیری از حذف admin
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
import { logger } from '@/lib/system-logger';

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

      // ★ v11.9.5: جلوگیری از ایجاد کاربر با نقش Manager
      // Manager فقط از register ایجاد می‌شود (کاربر اصلی)
      if (body.role === 'Manager' || body.role === 'Admin' || body.role === 'Owner') {
        return NextResponse.json(
          { 
            success: false, 
            error: 'ایجاد کاربر با نقش مدیر از این بخش امکان‌پذیر نیست. مدیر اصلی فقط هنگام ثبت‌نام فروشگاه ایجاد می‌شود.' 
          },
          { status: 403 }
        );
      }

      // ★ v11.9.5: جلوگیری از استفاده از username='admin' (مخصوص مدیر اصلی)
      if (body.username === 'admin') {
        return NextResponse.json(
          { success: false, error: 'نام کاربری "admin" رزرو شده است و فقط برای مدیر اصلی قابل استفاده است.' },
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
      // ★ v11.9.5: role همیشه Cashier (فقط مدیر اصلی Manager است)
      const userData: any = {
        username: body.username,
        password: hashedPassword,
        mobile: body.mobile || null,
        role: 'Cashier',  // ★ همیشه Cashier برای کاربران جدید
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

      // ★ v11.9.5: لاگ ایجاد صندوق‌دار جدید
      logger.info('صندوق‌دار جدید اضافه شد', {
        tenantId: tenant.tenantId,
        username: body.username,
        role: 'Cashier',
        createdBy: tenant.user.username,
        permissions: body.permissions || [],
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

      // ★ v11.9.5: محافظت از کاربر اصلی (admin)
      if (existing.username === 'admin') {
        // جلوگیری از تغییر نقش admin
        if (body.role !== undefined && body.role !== 'Manager') {
          return NextResponse.json(
            { success: false, error: 'نقش مدیر اصلی قابل تغییر نیست.' },
            { status: 403 }
          );
        }
        
        // جلوگیری از غیرفعال‌سازی admin
        if (body.isActive === false) {
          return NextResponse.json(
            { success: false, error: 'مدیر اصلی را نمی‌توان غیرفعال کرد.' },
            { status: 403 }
          );
        }
      }

      // ★ v11.9.5: جلوگیری از تغییر نقش صندوق‌دار به Manager
      if (body.role === 'Manager' || body.role === 'Admin' || body.role === 'Owner') {
        if (existing.username !== 'admin') {
          return NextResponse.json(
            { success: false, error: 'تغییر نقش به مدیر امکان‌پذیر نیست.' },
            { status: 403 }
          );
        }
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

      // ★ v11.9.5: لاگ ویرایش کاربر
      logger.info('کاربر ویرایش شد', {
        tenantId: tenant.tenantId,
        userId: body.id,
        username: existing.username,
        changes: Object.keys(updateData),
        editedBy: tenant.user.username,
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

      // ★ v11.9.5: جلوگیری از حذف مدیر اصلی (admin)
      if (existing.username === 'admin' && existing.role === 'Manager') {
        return NextResponse.json(
          { success: false, error: 'مدیر اصلی قابل حذف نیست.' },
          { status: 403 }
        );
      }

      // ★ به جای حذف واقعی، غیرفعال می‌کنیم (soft delete)
      await tenant.tenantDb.storeUser.update({
        where: { id },
        data: { isActive: false },
      });

      // ★ v11.9.5: لاگ حذف (غیرفعال‌سازی) کاربر
      logger.info('کاربر غیرفعال شد', {
        tenantId: tenant.tenantId,
        userId: id,
        username: existing.username,
        role: existing.role,
        deletedBy: tenant.user.username,
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