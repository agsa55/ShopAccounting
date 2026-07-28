/**
 * API Route: Data Export - ShopAccounting v4.3 (Hybrid)
 *
 * خروجی‌گیری کامل داده‌ها با دیتابیس اختصاصی هر فروشگاه
 *
 * فایل: src/app/api/export/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation';
import { db } from '@/lib/db';

const TENANT_MODELS = [
  'storeUser', 'productCategory', 'unit', 'product', 'customer',
  'invoice', 'invoiceItem', 'invoicePayment', 'installmentPlan', 'installment',
  'stockMovement', 'account', 'fiscalYear', 'journalEntry', 'journalEntryLine',
  'paymentGatewaySetting', 'posSetting', 'storeSetting', 'invoiceTemplate', 'notification',
] as const;

// ─── GET: خروجی JSON کامل ─────────────────────────────────────
export const GET = withTenantAndPermission('settings')(
  async (request: NextRequest, _context: any, tenant) => {
    try {
      const { searchParams } = new URL(request.url);
      const format = searchParams.get('format') || 'json';

      // اطلاعات tenant از MasterDB
      const tenantInfo = await db.master.tenant.findUnique({
        where: { id: tenant.tenantId },
        select: { id: true, subDomain: true, companyName: true, planName: true, status: true, isIsolated: true, dbName: true, createdAt: true },
      });

      const exportData: Record<string, any[]> = {};
      const recordCounts: Record<string, number> = {};
      let totalRecords = 0;

      for (const modelName of TENANT_MODELS) {
        try {
          const model = (tenant.tenantDb as any)[modelName];
          if (!model || typeof model.findMany !== 'function') {
            exportData[modelName] = [];
            recordCounts[modelName] = 0;
            continue;
          }

          const where: any = {};
          if (!tenant.isIsolated) where.tenantId = tenant.tenantId;

          const records = await model.findMany({ where });
          exportData[modelName] = records;
          recordCounts[modelName] = records.length;
          totalRecords += records.length;
        } catch (e: any) {
          exportData[modelName] = [];
          recordCounts[modelName] = 0;
        }
      }

      if (format === 'csv-summary') {
        const csvLines = ['Model,Count'];
        for (const [model, count] of Object.entries(recordCounts)) csvLines.push(`${model},${count}`);
        const buffer = Buffer.from(csvLines.join('\n'), 'utf-8');
        return new NextResponse(buffer, {
          status: 200,
          headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="export-summary-${tenant.tenantId}.csv"`, 'Content-Length': buffer.length.toString() },
        });
      }

      const fullExport = {
        meta: {
          version: '4.3', appName: 'ShopAccounting',
          exportedAt: new Date().toISOString(),
          tenantId: tenant.tenantId, tenant: tenantInfo,
          isIsolated: tenant.isIsolated,
          totalRecords, recordCounts,
          description: 'این فایل شامل تمام داده‌های فروشگاه شماست.',
        },
        data: exportData,
      };

      const buffer = Buffer.from(JSON.stringify(fullExport, null, 2), 'utf-8');
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="shopaccounting-export-${tenant.tenantId}-${new Date().toISOString().slice(0, 10)}.json"`,
          'Content-Length': buffer.length.toString(),
        },
      });
    } catch (error: any) {
      console.error('[Export] GET error:', error.message);
      return NextResponse.json({ success: false, error: 'خطا در خروجی‌گیری.' }, { status: 500 });
    }
  }
);

// ─── POST: بسته انتقال به دیتابیس مستقل ───────────────────────
export const POST = withTenantAndPermission('settings')(
  async (request: NextRequest, _context: any, tenant) => {
    try {
      const body = await request.json();
      const { targetDbName, newTenantId } = body;

      if (!targetDbName) {
        return NextResponse.json({ success: false, error: 'نام دیتابیس مقصد الزامی است.' }, { status: 400 });
      }

      const tenantInfo = await db.master.tenant.findUnique({ where: { id: tenant.tenantId } });
      if (!tenantInfo) {
        return NextResponse.json({ success: false, error: 'فروشگاه یافت نشد.' }, { status: 404 });
      }

      const exportData: Record<string, any[]> = {};
      const recordCounts: Record<string, number> = {};

      for (const modelName of TENANT_MODELS) {
        try {
          const model = (tenant.tenantDb as any)[modelName];
          if (!model || typeof model.findMany !== 'function') { exportData[modelName] = []; recordCounts[modelName] = 0; continue; }

          const where: any = {};
          if (!tenant.isIsolated) where.tenantId = tenant.tenantId;

          const records = await model.findMany({ where });
          exportData[modelName] = records;
          recordCounts[modelName] = records.length;
        } catch (e: any) { exportData[modelName] = []; recordCounts[modelName] = 0; }
      }

      const migrationPackage = {
        meta: { version: '4.3', appName: 'ShopAccounting', exportedAt: new Date().toISOString(), sourceTenantId: tenant.tenantId, targetDbName, newTenantId: newTenantId || tenant.tenantId, recordCounts },
        tenantConfig: { subDomain: tenantInfo.subDomain, companyName: tenantInfo.companyName, planName: tenantInfo.planName },
        data: exportData,
      };

      const buffer = Buffer.from(JSON.stringify(migrationPackage, null, 2), 'utf-8');
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="migration-${tenant.tenantId}-${targetDbName}.json"`,
          'Content-Length': buffer.length.toString(),
        },
      });
    } catch (error: any) {
      console.error('[Export] POST error:', error.message);
      return NextResponse.json({ success: false, error: 'خطا در آماده‌سازی بسته انتقال.' }, { status: 500 });
    }
  }
);
