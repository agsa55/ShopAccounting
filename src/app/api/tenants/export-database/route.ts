/**
 * API Route: Export / Sell Database — v5.0
 *
 * قابلیت فروش کل وبسایت:
 *   - بکاپ‌گیری از دیتابیس اختصاصی فروشگاه
 *   - تحویل فایل بکاپ (.bak) به مشتری
 *   - ثبت اطلاعات فروش (نام خریدار، شماره تماس)
 *   - تغییر وضعیت Tenant به "sold"
 *   - ایجاد AuditLog کامل
 *
 * POST /api/tenants/export-database
 *
 * فایل: src/app/api/tenants/export-database/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromRequest, isFullAccessRole } from '@/lib/jwt';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز.', errorCode: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // فقط Admin/Owner اجازه فروش دارند
    if (!isFullAccessRole(user.role)) {
      return NextResponse.json(
        { success: false, error: 'شما مجوز فروش وبسایت را ندارید.', errorCode: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const tenantId = user.tenantId;
    const body = await request.json();
    const { soldTo, soldToContact } = body;

    if (!soldTo || !soldToContact) {
      return NextResponse.json(
        { success: false, error: 'نام خریدار و شماره تماس الزامی است.' },
        { status: 400 }
      );
    }

    // ─── بررسی وضعیت Tenant ─────────────────────────────────
    const tenant = await db.master.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        companyName: true,
        isIsolated: true,
        dbName: true,
        status: true,
        planName: true,
      },
    });

    if (!tenant) {
      return NextResponse.json({ success: false, error: 'فروشگاه یافت نشد.' }, { status: 404 });
    }

    if (tenant.status === 'sold') {
      return NextResponse.json({ success: false, error: 'این فروشگاه قبلاً فروخته شده است.' }, { status: 409 });
    }

    // ─── اگر دیتابیس اختصاصی دارد → بکاپ بگیر ────────────────
    let backupResult: { success: boolean; backupPath?: string; error?: string } | null = null;

    if (tenant.isIsolated && tenant.dbName) {
      backupResult = await createDatabaseBackup(tenant.dbName);

      if (!backupResult.success) {
        return NextResponse.json(
          { success: false, error: `خطا در بکاپ‌گیری: ${backupResult.error}` },
          { status: 500 }
        );
      }
    }

    // ─── اگر دیتابیس مشترک دارد → اول اختصاصی کن بعد بکاپ ────
    if (!tenant.isIsolated) {
      // ارتقا به دیتابیس اختصاصی
      const { provisionIsolatedTenant } = await import('@/lib/tenant-provisioning');
      const provisionResult = await provisionIsolatedTenant(tenantId);

      if (!provisionResult.success) {
        return NextResponse.json(
          {
            success: false,
            error: 'خطا در ایجاد دیتابیس اختصاصی. لطفاً ابتدا از طریق upgrade-plan ارتقا دهید.',
            details: provisionResult.error,
          },
          { status: 500 }
        );
      }

      // حالا بکاپ بگیر
      backupResult = await createDatabaseBackup(provisionResult.databaseName);

      if (!backupResult.success) {
        return NextResponse.json(
          { success: false, error: `خطا در بکاپ‌گیری: ${backupResult.error}` },
          { status: 500 }
        );
      }
    }

    // ─── بروزرسانی Tenant ─────────────────────────────────────
    await db.master.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'sold',
        soldAt: new Date(),
        soldTo,
        soldToContact,
      },
    });

    // ─── بروزرسانی Subscription ──────────────────────────────
    const currentSub = await db.master.subscription.findFirst({
      where: { tenantId, status: 'active' },
    });

    if (currentSub) {
      await db.master.subscription.update({
        where: { id: currentSub.id },
        data: {
          status: 'sold',
          endDate: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000), // ۱۰۰ سال
        },
      });
    }

    // ─── ثبت AuditLog ────────────────────────────────────────
    await db.master.auditLog.create({
      data: {
        id: randomUUID(),
        tenantId,
        userId: user.userId,
        action: 'tenant.sell_database',
        entityType: 'Tenant',
        entityId: tenantId,
        details: JSON.stringify({
          soldTo,
          soldToContact,
          databaseName: tenant.dbName,
          backupPath: backupResult?.backupPath,
          wasIsolated: tenant.isIsolated,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'فروش وبسایت ثبت شد! بکاپ دیتابیس آماده تحویل است.',
      data: {
        tenantId,
        companyName: tenant.companyName,
        soldTo,
        soldToContact,
        databaseName: tenant.dbName,
        backupPath: backupResult?.backupPath,
        status: 'sold',
        deliveryNote: 'فایل بکاپ و دسترسی دیتابیس ظرف ۴۸ ساعت کاری تحویل داده خواهد شد.',
      },
    });
  } catch (error: any) {
    console.error('[ExportDatabase] Error:', error.message);
    return NextResponse.json({ success: false, error: 'خطای داخلی سرور.' }, { status: 500 });
  }
}

// ─── بکاپ‌گیری از دیتابیس ──────────────────────────────────────

/**
 * ایجاد بکاپ از دیتابیس SQL Server
 *
 * فایل بکاپ در مسیر SQL Server backup directory ذخیره می‌شود
 * فرمت: SA_tenant_{id}_backup_{timestamp}.bak
 */
async function createDatabaseBackup(databaseName: string): Promise<{
  success: boolean;
  backupPath?: string;
  error?: string;
}> {
  try {
    const sql = require('mssql');
    const masterUrl = process.env.MASTER_DATABASE_URL || process.env.DATABASE_URL;

    // تجزیه connection string
    const config = parseConnectionString(masterUrl);

    const pool = await sql.connect({
      server: config.server,
      port: config.port,
      user: config.user,
      password: config.password,
      database: 'master',
      options: {
        trustServerCertificate: true,
        encrypt: false,
      },
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const backupFileName = `${databaseName}_backup_${timestamp}.bak`;
    const backupPath = `C:\\SQLBackups\\${backupFileName}`;

    // اجرای بکاپ
    await pool.request().query(`
      BACKUP DATABASE [${databaseName}]
      TO DISK = '${backupPath}'
      WITH FORMAT,
      MEDIANAME = 'ShopAccountingBackup',
      NAME = 'Full Backup of ${databaseName}',
      COMPRESSION,
      STATS = 10;
    `);

    await pool.close();

    return { success: true, backupPath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── تجزیه connection string ──────────────────────────────────

interface ConnectionConfig {
  server: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function parseConnectionString(connStr: string): ConnectionConfig {
  const defaultConfig: ConnectionConfig = {
    server: 'localhost',
    port: 1433,
    user: 'sa',
    password: '',
    database: 'ShopAccounting',
  };

  if (!connStr) return defaultConfig;

  const withoutProtocol = connStr.replace(/^sqlserver:\/\//, '');
  const parts = withoutProtocol.split(';');

  const hostPort = parts[0];
  if (hostPort.includes(':')) {
    const [host, port] = hostPort.split(':');
    defaultConfig.server = host;
    defaultConfig.port = parseInt(port) || 1433;
  } else {
    defaultConfig.server = hostPort;
  }

  for (let i = 1; i < parts.length; i++) {
    const [key, ...valueParts] = parts[i].split('=');
    const value = valueParts.join('=');
    const lowerKey = key.trim().toLowerCase();

    switch (lowerKey) {
      case 'database': defaultConfig.database = value; break;
      case 'user': defaultConfig.user = value; break;
      case 'password': defaultConfig.password = value; break;
      case 'server':
        if (value.includes(',')) {
          const [s, p] = value.split(',');
          defaultConfig.server = s;
          defaultConfig.port = parseInt(p) || 1433;
        } else {
          defaultConfig.server = value;
        }
        break;
    }
  }

  return defaultConfig;
}
