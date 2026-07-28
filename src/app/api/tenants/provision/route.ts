/**
 * API Route: Tenant Provisioning - ShopAccounting v5.1
 *
 * ایجاد دیتابیس اختصاصی برای فروشگاه
 * فقط مدیر سیستم (SuperAdmin) یا Owner/Manager اجازه provisioning دارند
 *
 * POST   /api/tenants/provision — ایجاد دیتابیس اختصاصی
 * GET    /api/tenants/provision?tenantId=xxx — وضعیت provisioning
 * DELETE /api/tenants/provision?tenantId=xxx — حذف دیتابیس اختصاصی
 *
 * فایل: src/app/api/tenants/provision/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encryptConnectionString } from '@/lib/db-encrypt';
import { buildConnectionString, buildTenantDbName, provisionIsolatedTenant } from '@/lib/tenant-provisioning';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ─── POST: ایجاد دیتابیس اختصاصی ─────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, force } = body;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فروشگاه الزامی است.' },
        { status: 400 }
      );
    }

    // بررسی وجود فروشگاه
    const tenant = await db.master.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد.' },
        { status: 404 }
      );
    }

    if (tenant.isIsolated && !force) {
      return NextResponse.json(
        {
          success: false,
          error: 'این فروشگاه قبلاً دیتابیس مستقل دارد. برای بازسازی، force=true ارسال کنید.',
          data: { dbName: tenant.dbName },
        },
        { status: 409 }
      );
    }

    console.log(`[Provision] Starting provisioning for tenant: ${tenantId}`);

    // استفاده از tenant-provisioning.ts
    const result = await provisionIsolatedTenant(tenantId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'خطا در provisioning.', details: result.steps },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        tenantId,
        databaseName: result.databaseName,
        isIsolated: true,
        provisionedAt: new Date().toISOString(),
        steps: result.steps,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error(`[Provision] Error: ${error.message}`);
    return NextResponse.json(
      { success: false, error: `خطا در provisioning: ${error.message}` },
      { status: 500 }
    );
  }
}

// ─── GET: وضعیت provisioning ──────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فروشگاه الزامی است.' },
        { status: 400 }
      );
    }

    const tenant = await db.master.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        companyName: true,
        isIsolated: true,
        dbName: true,
        createdAt: true,
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد.' },
        { status: 404 }
      );
    }

    // آمار connection pool
    const poolStats = db.getPoolStats();

    return NextResponse.json({
      success: true,
      data: {
        tenant,
        poolStats,
      },
    });
  } catch (error: any) {
    console.error(`[Provision] GET error: ${error.message}`);
    return NextResponse.json(
      { success: false, error: 'خطا در دریافت اطلاعات.' },
      { status: 500 }
    );
  }
}

// ─── DELETE: حذف دیتابیس اختصاصی و بازگشت به مشترک ──────────

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فروشگاه الزامی است.' },
        { status: 400 }
      );
    }

    const tenant = await db.master.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد.' },
        { status: 404 }
      );
    }

    if (!tenant.isIsolated) {
      return NextResponse.json(
        { success: false, error: 'این فروشگاه دیتابیس مستقل ندارد.' },
        { status: 400 }
      );
    }

    console.log(`[Provision] Deprovisioning tenant: ${tenantId}, DB: ${tenant.dbName}`);

    // بازنشانی cache
    db.invalidateTenantCache(tenantId);

    // حذف دیتابیس
    if (tenant.dbName) {
      try {
        const config = parseConnStr(process.env.DATABASE_URL || '');
        const dropCmd = `sqlcmd -S ${config.server}${config.port !== 1433 ? ',' + config.port : ''} -U ${config.user} -P "${config.password}" -Q "IF EXISTS (SELECT name FROM sys.databases WHERE name='${tenant.dbName}') ALTER DATABASE [${tenant.dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE IF EXISTS [${tenant.dbName}]"`;
        await execAsync(dropCmd, { timeout: 30000 });
      } catch (dropError: any) {
        console.warn(`[Provision] Error dropping database: ${dropError.message}`);
      }
    }

    // بروزرسانی MasterDB
    await db.master.tenant.update({
      where: { id: tenantId },
      data: {
        dbName: null,
        connectionStringEncrypted: null,
        isIsolated: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'دیتابیس اختصاصی حذف شد. فروشگاه به دیتابیس مشترک بازگشت.',
    });
  } catch (error: any) {
    console.error(`[Provision] DELETE error: ${error.message}`);
    return NextResponse.json(
      { success: false, error: 'خطا در حذف دیتابیس اختصاصی.' },
      { status: 500 }
    );
  }
}

// ─── تابع کمکی ────────────────────────────────────────────────

interface ConnConfig {
  server: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function parseConnStr(connStr: string): ConnConfig {
  const defaults: ConnConfig = {
    server: 'localhost',
    port: 1433,
    user: 'sa',
    password: '',
    database: 'ShopAccounting',
  };

  if (!connStr) return defaults;

  const withoutProtocol = connStr.replace(/^sqlserver:\/\//, '');
  const parts = withoutProtocol.split(';');

  const hostPort = parts[0];
  if (hostPort.includes(':')) {
    const [host, port] = hostPort.split(':');
    defaults.server = host;
    defaults.port = parseInt(port) || 1433;
  } else {
    defaults.server = hostPort;
  }

  for (let i = 1; i < parts.length; i++) {
    const [key, ...valueParts] = parts[i].split('=');
    const value = valueParts.join('=');
    const lowerKey = key.trim().toLowerCase();

    switch (lowerKey) {
      case 'database': defaults.database = value; break;
      case 'user': defaults.user = value; break;
      case 'password': defaults.password = value; break;
    }
  }

  return defaults;
}