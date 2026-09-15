// ============================================================================
// src/app/api/backup/route.ts (v9.6.0 ★★★ PostgreSQL Multi-tenant)
// ShopAccounting — Backup & Restore for PostgreSQL
// ============================================================================
// ★★★ v9.6.0: بازنویسی کامل برای PostgreSQL
//   ★ هر Tenant فقط داده‌های خودش را بکاپ می‌گیرد
//   ★ استخراج از تمام جداول مرتبط با tenantId
//   ★ فشرده‌سازی Gzip + ذخیره در جدول Backups
//   ★ امکان دانلود فایل JSON و بازیابی (Restore)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { gzip, gunzip } from 'zlib'
import { promisify } from 'util'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

// ═══════════════════════════════════════════════════════════════
//  لیست جداولی که باید بکاپ گرفته شوند (به ترتیب وابستگی)
// ═══════════════════════════════════════════════════════════════
const TABLES_TO_BACKUP = [
  // تنظیمات و پیکربندی
  'StoreSetting',
  'SmsSettings',
  'MoidianSettings',
  'PaymentGateway',
  'PosDevice',
  
  // ساختار پایه
  'Branch',
  'Warehouse',
  'Category',
  'Unit',
  'Account',
  
  // طرف حساب‌ها
  'Customer',
  'Supplier',
  
  // محصولات و انبار
  'Product',
  'StockLevel',
  
  // مالی و حسابداری
  'FiscalYear',
  'JournalEntry',
  'JournalEntryLine',
  'InitialBalance',
  'FixedAsset',
  
  // فاکتورها
  'Invoice',
  'InvoiceItem',
  'InvoicePayment',
  'InstallmentPlan',
  'InstallmentSchedule',
  'PurchaseInvoice',
  'PurchaseInvoiceItem',
  
  // انبارداری
  'StockMovement',
  'StockCount',
  'StockCountItem',
  
  // پرداخت‌ها
  'Check',
  'CardPayment',
  'OnlinePayment',
  
  // کاربران و ارتباطات
  'StoreUser',
  'Ticket',
  'TicketMessage',
  'SmsLog',
  'RecurringJournal',
  'AuditLog',
] as const

// ═══════════════════════════════════════════════════════════════
//  GET — دریافت لیست بکاپ‌های Tenant
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const backups = await db.client.backup.findMany({
        where: { tenantId: tenant.tenantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fileName: true,
          fileSize: true,
          recordCount: true,
          createdAt: true,
        },
      })

      return NextResponse.json({
        success: true,
        data: backups,
      })
    } catch (error: any) {
      console.error('[Backup GET] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت لیست پشتیبان‌ها' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  POST — ساخت بکاپ جدید
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  POST — ساخت بکاپ جدید
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantId = tenant.tenantId
      console.log(`[Backup] Starting backup for tenant: ${tenantId}`)

      // ۱. دریافت اطلاعات Tenant
      const tenantInfo = await db.client.tenant.findUnique({
        where: { id: tenantId },
        include: { planTier: true },
      })

      if (!tenantInfo) {
        return NextResponse.json(
          { success: false, error: 'فروشگاه یافت نشد' },
          { status: 404 }
        )
      }

      // ★★★ اصلاح ۱: تغییر نوع به Record<string, any> برای پذیرش هم آبجکت و هم آرایه
      const backupData: Record<string, any> = {
        _metadata: {
          version: '9.6.0',
          createdAt: new Date().toISOString(),
          tenantId,
          tenantName: tenantInfo.companyName,
          subDomain: tenantInfo.subDomain,
          planName: tenantInfo.planName,
          planTierName: tenantInfo.planTier?.nameFa || tenantInfo.planName,
        },
      }

      let totalRecords = 0

      for (const tableName of TABLES_TO_BACKUP) {
        try {
          // ★★★ اصلاح ۲: استفاده از any برای دسترسی داینامیک به مدل‌های Prisma و جلوگیری از خطای TS
          const modelName = tableName.charAt(0).toLowerCase() + tableName.slice(1)
          // @ts-ignore
          const model = (db.client as any)[modelName]
          
          if (!model || typeof model.findMany !== 'function') {
            console.warn(`[Backup] Model not found or invalid: ${tableName}`)
            continue
          }

          const records = await model.findMany({
            where: { tenantId },
          })

          backupData[tableName] = records
          totalRecords += records.length
          console.log(`[Backup] ${tableName}: ${records.length} records`)
        } catch (err: any) {
          console.warn(`[Backup] Error reading ${tableName}:`, err.message)
          backupData[tableName] = []
        }
      }

      // ۳. تبدیل به JSON و فشرده‌سازی
      const jsonString = JSON.stringify(backupData)
      const compressed = await gzipAsync(Buffer.from(jsonString, 'utf8'))

      // ۴. ساخت نام فایل
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const fileName = `backup_${tenantInfo.subDomain}_${dateStr}.json.gz`

      // ۵. ذخیره در جدول Backups
      const backup = await db.client.backup.create({
        data: {
          fileName,
          fileSize: compressed.length,
          recordCount: totalRecords,
          data: compressed.toString('base64'), // ذخیره به صورت Base64
          tenantId,
        },
      })

      console.log(`[Backup] ✅ Backup created: ${fileName} (${totalRecords} records, ${(compressed.length / 1024).toFixed(2)} KB)`)

      return NextResponse.json({
        success: true,
        data: {
          id: backup.id,
          fileName: backup.fileName,
          fileSize: backup.fileSize,
          recordCount: backup.recordCount,
          createdAt: backup.createdAt,
        },
      })
    } catch (error: any) {
      console.error('[Backup POST] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در ساخت پشتیبان: ' + error.message },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  DELETE — حذف یک بکاپ
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const { searchParams } = new URL(req.url)
      const backupId = searchParams.get('id')

      if (!backupId) {
        return NextResponse.json(
          { success: false, error: 'شناسه بکاپ الزامی است' },
          { status: 400 }
        )
      }

      // اطمینان از تعلق بکاپ به Tenant فعلی
      const backup = await db.client.backup.findFirst({
        where: { id: backupId, tenantId: tenant.tenantId },
      })

      if (!backup) {
        return NextResponse.json(
          { success: false, error: 'بکاپ یافت نشد یا متعلق به شما نیست' },
          { status: 404 }
        )
      }

      await db.client.backup.delete({ where: { id: backupId } })

      return NextResponse.json({ success: true })
    } catch (error: any) {
      console.error('[Backup DELETE] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در حذف پشتیبان' },
        { status: 500 }
      )
    }
  }
)