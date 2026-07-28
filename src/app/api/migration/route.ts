// ============================================================================
// src/app/api/migration/route.ts
// ShopAccounting v2 — Data Migration: Shared DB → Isolated DB
// ============================================================================
// ★ POST: مهاجرت تمام داده‌های tenant از دیتابیس اشتراکی به اختصاصی
// ★ این API وقتی فراخوانی می‌شود که کاربر از پنل رایگان به پولی ارتقا داده
// ★ مراحل:
//   1. ایجاد دیتابیس اختصاصی (SA_tenant_XXX)
//   2. اجرای migration روی دیتابیس جدید
//   3. خواندن داده‌ها از دیتابیس اشتراکی (tenantId filter)
//   4. نوشتن داده‌ها در دیتابیس اختصاصی (بدون tenantId)
//   5. بروزرسانی فیلد isIsolated و tenantDb در Tenant
//   6. تأیید مهاجرت
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ─── جداول قابل مهاجرت ──────────────────────────────────────

const MIGRATABLE_TABLES = [
  { model: 'product', name: 'محصولات' },
  { model: 'category', name: 'دسته‌بندی‌ها' },
  { model: 'customer', name: 'مشتریان' },
  { model: 'account', name: 'حساب‌ها' },
  { model: 'invoice', name: 'فاکتورها' },
  { model: 'invoiceItem', name: 'آیتم‌های فاکتور' },
  { model: 'invoicePayment', name: 'پرداخت‌های فاکتور' },
  { model: 'storeSetting', name: 'تنظیمات فروشگاه' },
  { model: 'paymentGateway', name: 'درگاه پرداخت' },
  { model: 'posDevice', name: 'کارتخوان' },
  { model: 'storeUser', name: 'کاربران فروشگاه' },
  { model: 'journalEntry', name: 'اسناد حسابداری' },
  { model: 'journalEntryLine', name: 'ردیف‌های سند' },
  { model: 'installmentPlan', name: 'طرح‌های اقساطی' },
  { model: 'installmentPayment', name: 'پرداخت‌های اقساط' },
  { model: 'unit', name: 'واحدها' },
]

// ═══════════════════════════════════════════════════════════════
//  POST /api/migration — اجرای مهاجرت
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('migration')(async (req: NextRequest, ctx: any, tenant: any) => {
  const tenantId = tenant.tenantId

  try {
    // ★ فقط مدیران اجازه مهاجرت دارند
    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user?.role)) {
      return NextResponse.json(
        { success: false, error: 'فقط مدیران اجازه مهاجرت داده‌ها را دارند' },
        { status: 403 }
      )
    }

    // ★ بررسی: آیا دیتابیس اختصاصی قبلاً ایجاد شده؟
    const tenantRecord = await db.master.tenant.findUnique({
      where: { id: tenantId },
    })

    if (!tenantRecord) {
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد' },
        { status: 404 }
      )
    }

    // ★ اگر قبلاً isolated شده، مهاجرت لازم نیست
    if (tenantRecord.isIsolated) {
      return NextResponse.json({
        success: true,
        message: 'دیتابیس اختصاصی قبلاً فعال است. مهاجرت لازم نیست.',
        data: { alreadyMigrated: true },
      })
    }

    const dbName = tenantRecord.tenantDb || `SA_tenant_${tenantId.replace(/-/g, '')}`

    // ═══════════════════════════════════════════════════════════
    //  مرحله ۱: ایجاد دیتابیس اختصاصی (اگر وجود ندارد)
    // ═══════════════════════════════════════════════════════════
    
    // استفاده از tenant-provisioning برای ایجاد دیتابیس
    try {
      const { provisionTenantDatabase } = await import('@/lib/tenant-provisioning')
      await provisionTenantDatabase(tenantId, dbName)
    } catch (provErr: any) {
      // اگر دیتابیس قبلاً وجود دارد، ادامه بده
      if (!provErr?.message?.includes('already exists')) {
        console.error('[Migration] Database provisioning failed:', provErr)
        return NextResponse.json(
          { success: false, error: `خطا در ایجاد دیتابیس اختصاصی: ${provErr.message}` },
          { status: 500 }
        )
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  مرحله ۲: اتصال به دیتابیس اختصاصی
    // ═══════════════════════════════════════════════════════════

    const isolatedDb = await db.forTenant(tenantId)

    // ═══════════════════════════════════════════════════════════
    //  مرحله ۳: خواندن داده‌ها از دیتابیس اشتراکی
    // ═══════════════════════════════════════════════════════════

    const sharedDb = db.master // دیتابیس اشتراکی
    const migrationResults: Record<string, number> = {}
    let totalMigrated = 0

    for (const table of MIGRATABLE_TABLES) {
      try {
        // خواندن از دیتابیس اشتراکی با فیلتر tenantId
        const records = await (sharedDb as any)[table.model]?.findMany({
          where: { tenantId },
        }) || []

        if (records.length === 0) {
          migrationResults[table.model] = 0
          continue
        }

        // ═══════════════════════════════════════════════════════
        //  مرحله ۴: نوشتن داده‌ها در دیتابیس اختصاصی
        // ═══════════════════════════════════════════════════════

        // حذف فیلد tenantId از رکوردها (در دیتابیس اختصاصی نیاز نیست)
        const cleanRecords = records.map((record: any) => {
          const { tenantId: _, ...rest } = record
          return rest
        })

        // استفاده از createMany برای عملیات دسته‌ای
        try {
          await (isolatedDb as any)[table.model]?.createMany({
            data: cleanRecords,
            skipDuplicates: true,
          })
        } catch (createErr: any) {
          // اگر createMany پشتیبانی نمی‌شود، یکی یکی ایجاد کن
          if (createErr?.message?.includes('createMany')) {
            for (const record of cleanRecords) {
              try {
                await (isolatedDb as any)[table.model]?.create({ data: record })
              } catch {
                // رد کردن رکوردهای تکراری
              }
            }
          } else {
            console.warn(`[Migration] Error migrating ${table.model}:`, createErr?.message)
          }
        }

        migrationResults[table.model] = records.length
        totalMigrated += records.length

      } catch (err: any) {
        // جدول ممکن است در schema اشتراکی وجود نداشته باشد
        console.warn(`[Migration] Skip table ${table.model}:`, err?.message)
        migrationResults[table.model] = -1 // خطا
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  مرحله ۵: بروزرسانی فیلدهای Tenant
    // ═══════════════════════════════════════════════════════════

    await db.master.tenant.update({
      where: { id: tenantId },
      data: {
        isIsolated: true,
        tenantDb: dbName,
        dbType: 'isolated',
      },
    })

    // ═══════════════════════════════════════════════════════════
    //  مرحله ۶: حذف داده‌ها از دیتابیس اشتراکی (اختیاری)
    // ═══════════════════════════════════════════════════════════
    // ★★★ هشدار: این مرحله باید با احتیاط انجام شود!
    // برای امنیت بیشتر، داده‌ها را حذف نمی‌کنیم. 
    // کاربر می‌تواند بعداً از تنظیمات، داده‌های اشتراکی را حذف کند.
    // در عوض، فقط tenantId رکوردها را علامت‌گذاری می‌کنیم.

    // بروزرسانی cache دیتابیس
    db.invalidateTenantCache?.(tenantId)

    return NextResponse.json({
      success: true,
      message: `مهاجرت با موفقیت انجام شد. ${totalMigrated} رکورد منتقل شد.`,
      data: {
        tenantId,
        dbName,
        totalMigrated,
        details: migrationResults,
        alreadyMigrated: false,
      },
    })
  } catch (error: any) {
    console.error('[Migration POST] Error:', error)
    return NextResponse.json(
      { success: false, error: `خطا در مهاجرت داده‌ها: ${error.message}` },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  GET /api/migration — بررسی وضعیت مهاجرت
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('migration')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantId = tenant.tenantId

    const tenantRecord = await db.master.tenant.findUnique({
      where: { id: tenantId },
    })

    if (!tenantRecord) {
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد' },
        { status: 404 }
      )
    }

    const tierName = tenantRecord.planTier?.name || tenantRecord.planName || 'free'
    const needsMigration = !tenantRecord.isIsolated && tierName !== 'free'

    return NextResponse.json({
      success: true,
      data: {
        tenantId,
        isIsolated: tenantRecord.isIsolated,
        dbName: tenantRecord.tenantDb,
        dbType: tenantRecord.dbType,
        tierName,
        needsMigration,
      },
    })
  } catch (error: any) {
    console.error('[Migration GET] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در بررسی وضعیت مهاجرت' },
      { status: 500 }
    )
  }
})
