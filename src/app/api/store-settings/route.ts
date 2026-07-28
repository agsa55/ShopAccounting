// ============================================================================
// src/app/api/store-settings/route.ts — GET/PUT (v3.36.3 ★★★)
// ============================================================================
// ★★★ v3.36.3 رفع باگ‌ها:
//   ۱) GET: هم data.settings و هم فیلدهای مستقیم را برمی‌گرداند (backward compatible)
//   ۲) PUT: اطمینان از پاسخ کامل پس از ذخیره
//   ۳) ثبت AuditLog برای تغییرات
//   ۴) هندل بهتر خطاها
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation';
import { randomUUID } from 'crypto';

// ═══════════════════════════════════════════════════════════════
//  GET — دریافت تنظیمات فروشگاه
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('settings')(
  async (request: NextRequest, _context: any, tenant: any) => {
    try {
      const settings = await db.client.storeSetting.findFirst({
        where: { tenantId: tenant.tenantId },
      });

      // ★★★ v3.36.3: پاسخ backward compatible
      //   - data.settings (فرمت قدیمی با کل settings)
      //   - data.storeName, data.address, ... (فرمت مستقیم برای فرم‌هایی که اینطوری می‌خوانند)
      const settingsObj: any = settings || {};

      return NextResponse.json({
        success: true,
        data: {
          // ★ فرمت اصلی (برای فرم‌های جدید)
          settings: settingsObj,
          // ★ فیلدهای مستقیم (برای فرم‌های قدیمی که از data.storeName می‌خوانند)
          storeName: settingsObj.storeName || null,
          address: settingsObj.address || null,
          phone: settingsObj.phone || null,
          registrationNumber: settingsObj.registrationNumber || null,
          defaultTaxRate: settingsObj.defaultTaxRate ?? 9,
          logoUrl: settingsObj.logoUrl || null,
          bankIban: settingsObj.bankIban || null,
          bankName: settingsObj.bankName || null,
        },
      });
    } catch (error: any) {
      console.error(`[StoreSettings GET] Failed: ${error.message}`);
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت تنظیمات.' },
        { status: 500 }
      );
    }
  }
);

// ═══════════════════════════════════════════════════════════════
//  PUT — ذخیره تنظیمات فروشگاه
// ═══════════════════════════════════════════════════════════════
export const PUT = withTenantAndPermission('settings')(
  async (request: NextRequest, _context: any, tenant: any) => {
    // ★ بررسی نقش کاربر
    const userRole = tenant.user?.role;
    const fullAccessRoles = ['Admin', 'Manager', 'Owner', 'admin', 'manager', 'owner'];
    if (!fullAccessRoles.includes(userRole)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیر می‌تواند تنظیمات را تغییر دهد.', errorCode: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    try {
      const body = await request.json();
      console.log('[StoreSettings PUT] Received body:', body);

      // ★ استخراج فقط فیلدهای مجاز
      const allowedData: any = {};
      if (body.storeName !== undefined) allowedData.storeName = body.storeName;
      if (body.address !== undefined) allowedData.address = body.address;
      if (body.phone !== undefined) allowedData.phone = body.phone;
      if (body.registrationNumber !== undefined) allowedData.registrationNumber = body.registrationNumber;
      if (body.defaultTaxRate !== undefined) {
        // ★ اطمینان از عدد بودن
        const taxRate = parseFloat(body.defaultTaxRate);
        allowedData.defaultTaxRate = isNaN(taxRate) ? 9 : taxRate;
      }
      if (body.logoUrl !== undefined) allowedData.logoUrl = body.logoUrl;
      if (body.bankIban !== undefined) allowedData.bankIban = body.bankIban;
      if (body.bankName !== undefined) allowedData.bankName = body.bankName;

      console.log('[StoreSettings PUT] Allowed data to save:', allowedData);

      // ★ بررسی رکورد موجود
      const existingSetting = await db.client.storeSetting.findFirst({
        where: { tenantId: tenant.tenantId },
      });

      let settings;
      let action: 'created' | 'updated';

      if (existingSetting) {
        // ★ update رکورد موجود
        settings = await db.client.storeSetting.update({
          where: { id: existingSetting.id },
          data: allowedData,
        });
        action = 'updated';
        console.log(`[StoreSettings PUT] Updated existing record: ${existingSetting.id}`);
      } else {
        // ★ create رکورد جدید
        settings = await db.client.storeSetting.create({
          data: { ...allowedData, tenantId: tenant.tenantId },
        });
        action = 'created';
        console.log(`[StoreSettings PUT] Created new record: ${settings.id}`);
      }

      // ★★★ v3.36.3: ثبت AuditLog (با فیلدهای سازگار با schema واقعی AuditLogs)
      // ★★★ v3.36.9: افزودن id به‌صورت دستی (چون schema آن را auto-default ندارد)
      try {
        await db.client.auditLogs.create({
          data: {
            id: randomUUID(),
            tenantId: tenant.tenantId,
            userId: tenant.user?.id || 'unknown',
            action: `store_settings_${action}`,
            entityId: settings.id,
            details: JSON.stringify({
              before: existingSetting ? {
                storeName: (existingSetting as any).storeName,
                address: (existingSetting as any).address,
                phone: (existingSetting as any).phone,
              } : null,
              after: {
                storeName: (settings as any).storeName,
                address: (settings as any).address,
                phone: (settings as any).phone,
              },
            }),
            createdAt: new Date(),
          },
        });
      } catch (auditErr: any) {
        console.warn('[StoreSettings PUT] AuditLog failed (non-blocking):', auditErr?.message);
      }

      // ★★★ v3.36.3: پاسخ کامل با داده‌های ذخیره‌شده
      const settingsTyped: any = settings;
      return NextResponse.json({
        success: true,
        message: action === 'created' ? 'تنظیمات ایجاد شد' : 'تنظیمات با موفقیت ذخیره شد',
        data: {
          settings: settingsTyped,
          // ★ فیلدهای مستقیم برای فرم‌های قدیمی
          storeName: settingsTyped.storeName,
          address: settingsTyped.address,
          phone: settingsTyped.phone,
          registrationNumber: settingsTyped.registrationNumber,
          defaultTaxRate: settingsTyped.defaultTaxRate,
          logoUrl: settingsTyped.logoUrl,
          bankIban: settingsTyped.bankIban,
          bankName: settingsTyped.bankName,
        },
      });
    } catch (error: any) {
      console.error('[StoreSettings PUT] Update failed:', error);
      return NextResponse.json(
        { success: false, error: 'خطا در بروزرسانی: ' + error.message },
        { status: 500 }
      );
    }
  }
);

