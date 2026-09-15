// ============================================================================
// src/app/api/accounts/route.ts — GET / POST / PUT / DELETE (v4.0 ★★★ FINAL FIX)
// ShopAccounting — Chart of Accounts API with Auto-Seed
// ============================================================================
// ★★★ v4.0: اصلاح کامل چارت حساب‌ها و رفع باگ بازگشت حساب‌های قدیمی
//   - حذف کامل کدهای منسوخ (1900, 1950, 1000, 4000, 6100, 6200) از لیست ساخت
//   - جایگزینی با کدهای استاندارد (2150, 2160, 5160, 5170)
//   - استفاده انحصاری از انواع فارسی استاندارد (بدهی، هزینه، صندوق، ...)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ═══════════════════════════════════════════════════════════════
//  حساب‌های پیش‌فرض استاندارد (منبع واحد حقیقت)
// ═══════════════════════════════════════════════════════════════
const DEFAULT_ACCOUNTS = [
  // ─── دارایی‌های جاری ───
  { code: '1010', name: 'صندوق فروشگاه', type: 'صندوق', level: 1 },
  { code: '1100', name: 'بانک', type: 'بانک', level: 1 },
  { code: '1200', name: 'موجودی کالا', type: 'موجودی', level: 1 },
  { code: '1300', name: 'حساب‌های دریافتنی', type: 'دریافتنی', level: 1 },
  { code: '1310', name: 'بدهکاران تجاری', type: 'دریافتنی', level: 2 },
  { code: '1350', name: 'چک‌های دریافتنی', type: 'دریافتنی', level: 2 },
  { code: '1500', name: 'پیش‌پرداخت‌ها', type: 'دارایی', level: 1 },
  
  // ─── دارایی‌های غیرجاری (ثابت) ───
  { code: '1400', name: 'تجهیزات و اثاثیه', type: 'دارایی_ثابت', level: 1 },
  { code: '1401', name: 'استهلاک انباشته تجهیزات', type: 'کاهنده_دارایی', level: 2 }, 
  
  // ─── بدهی‌های جاری و بلندمدت ───
  { code: '2000', name: 'حساب‌های پرداختنی', type: 'پرداختنی', level: 1 },
  { code: '2010', name: 'بستانکاران تجاری', type: 'پرداختنی', level: 2 },
  { code: '2050', name: 'چک‌های پرداختنی', type: 'پرداختنی', level: 2 },
  { code: '2100', name: 'وام بانکی', type: 'بدهی', level: 1 },
  { code: '2150', name: 'مالیات پرداختنی', type: 'بدهی', level: 1 }, // ★★★ جایگزین 1900
  { code: '2160', name: 'مالیات بر ارزش افزوده', type: 'بدهی', level: 2 }, // ★★★ جایگزین 1950
  { code: '2200', name: 'پیش‌دریافت‌ها', type: 'بدهی', level: 1 },
  
  // ─── حقوق صاحبان سهام ───
  { code: '3000', name: 'سرمایه مالک', type: 'سرمایه', level: 1 },
  { code: '3100', name: 'سود (زیان) انباشته', type: 'سرمایه', level: 1 },
  { code: '3200', name: 'برداشت مالک', type: 'سرمایه', level: 1 },
  
  // ─── درآمدها ───
  { code: '4100', name: 'فروش کالا', type: 'درآمد', level: 1 },
  { code: '4200', name: 'درآمد خدمات', type: 'درآمد', level: 1 },
  
  // ─── بهای تمام شده ───
  { code: '5000', name: 'بهای تمام شده کالای فروش رفته', type: 'بهای_تمام_شده', level: 1 },
  
  // ─── هزینه‌های عملیاتی و عمومی ───
  { code: '5100', name: 'هزینه‌های اداری و تشکیلاتی', type: 'هزینه', level: 1 },
  { code: '5105', name: 'هزینه کارمزد درگاه پرداخت', type: 'هزینه', level: 2 },
  { code: '5106', name: 'هزینه کارمزد پلتفرم', type: 'هزینه', level: 2 },
  { code: '5110', name: 'حقوق و دستمزد', type: 'هزینه', level: 2 },
  { code: '5120', name: 'هزینه اجاره', type: 'هزینه', level: 2 },
  { code: '5130', name: 'هزینه انرژی (آب، برق، گاز)', type: 'هزینه', level: 2 },
  { code: '5140', name: 'هزینه تبلیغات و بازاریابی', type: 'هزینه', level: 2 },
  { code: '5150', name: 'هزینه استهلاک', type: 'هزینه', level: 2 },
  { code: '5160', name: 'هزینه تعمیرات و نگهداری', type: 'هزینه', level: 2 }, // ★★★ جایگزین 6100
  { code: '5170', name: 'هزینه خدمات و متفرقه', type: 'هزینه', level: 2 }, // ★★★ جایگزین 6200
  { code: '5200', name: 'هزینه مالیات و عوارض', type: 'هزینه', level: 1 },
]

// ═══════════════════════════════════════════════════════════════
//  تابع auto-seed — ساخت حساب‌های پیش‌فرض (فقط در صورت عدم وجود)
// ═══════════════════════════════════════════════════════════════
async function seedDefaultAccounts(tenantDb: any, tenantId: string) {
  console.log('[Accounts] Seeding default accounts for tenant:', tenantId)

  for (const acc of DEFAULT_ACCOUNTS) {
    try {
      const existing = await tenantDb.account.findFirst({
        where: { code: acc.code, tenantId },
      })
      if (!existing) {
        await tenantDb.account.create({
          data: {
            code: acc.code,
            name: acc.name,
            type: acc.type,
            level: acc.level,
            isActive: true,
            tenantId,
          },
        })
      }
    } catch (err: any) {
      console.warn('[Accounts] Failed to seed account', acc.code, ':', err?.message)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/accounts — لیست حساب‌ها
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('accounting')(
  async (request: NextRequest, _context: any, tenant: any) => {
    try {
      const { searchParams } = new URL(request.url)
      const accountType = searchParams.get('type')
      const isActive = searchParams.get('isActive')

      const where: any = { tenantId: tenant.tenantId }
      if (accountType) where.type = accountType
      if (isActive !== null && isActive !== undefined) {
        where.isActive = isActive === 'true'
      }

      let accounts = await tenant.tenantDb.account.findMany({
        where,
        orderBy: { code: 'asc' },
      })

      // ★★★ اگر هیچ حسابی وجود ندارد، auto-seed کن
      if (accounts.length === 0) {
        await seedDefaultAccounts(tenant.tenantDb, tenant.tenantId)
        accounts = await tenant.tenantDb.account.findMany({ where, orderBy: { code: 'asc' } })
      } else {
        // ★★★ اگر حساب‌های استاندارد جدید (مثل 2150, 5160) وجود ندارند، آن‌ها را اضافه کن
        const existingCodes = new Set(accounts.map((a: any) => a.code))
        const missingAccounts = DEFAULT_ACCOUNTS.filter(acc => !existingCodes.has(acc.code))

        if (missingAccounts.length > 0) {
          console.log(`[Accounts] Found ${missingAccounts.length} missing standard accounts, seeding them...`)
          await seedDefaultAccounts(tenant.tenantDb, tenant.tenantId)
          accounts = await tenant.tenantDb.account.findMany({ where, orderBy: { code: 'asc' } })
        }
      }

      return NextResponse.json({ success: true, data: { accounts } })
    } catch (error: any) {
      console.error(`[Accounts] GET error: ${error.message}`)
      return NextResponse.json({ success: false, error: 'خطا در دریافت حساب‌ها.' }, { status: 500 })
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  POST /api/accounts — ایجاد حساب
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('accounting')(
  async (request: NextRequest, _context: any, tenant: any) => {
    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user.role)) {
      return NextResponse.json({ success: false, error: 'فقط مدیر می‌تواند حساب ایجاد کند.' }, { status: 403 })
    }

    try {
      const body = await request.json()
      if (!body.name || !body.code) {
        return NextResponse.json({ success: false, error: 'نام و کد حساب الزامی است.' }, { status: 400 })
      }

      const existing = await tenant.tenantDb.account.findFirst({
        where: { code: body.code, tenantId: tenant.tenantId },
      })
      if (existing) {
        return NextResponse.json({ success: false, error: 'کد حساب تکراری است.' }, { status: 409 })
      }

      const account = await tenant.tenantDb.account.create({
        data: {
          code: body.code,
          name: body.name,
          type: body.type || 'هزینه',
          level: body.level || 1,
          parentId: body.parentId || null,
          isActive: body.isActive !== undefined ? body.isActive : true,
          tenantId: tenant.tenantId,
        },
      })

      return NextResponse.json({ success: true, data: { account } }, { status: 201 })
    } catch (error: any) {
      console.error(`[Accounts] POST error: ${error.message}`)
      return NextResponse.json({ success: false, error: 'خطا در ایجاد حساب.' }, { status: 500 })
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  PUT /api/accounts — ویرایش حساب
// ═══════════════════════════════════════════════════════════════
export const PUT = withTenantAndPermission('accounting')(
  async (request: NextRequest, _context: any, tenant: any) => {
    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user.role)) {
      return NextResponse.json({ success: false, error: 'فقط مدیر می‌تواند حساب ویرایش کند.' }, { status: 403 })
    }

    try {
      const body = await request.json()
      if (!body.id) {
        return NextResponse.json({ success: false, error: 'شناسه حساب الزامی است.' }, { status: 400 })
      }

      const existing = await tenant.tenantDb.account.findFirst({
        where: { id: body.id, tenantId: tenant.tenantId },
      })
      if (!existing) {
        return NextResponse.json({ success: false, error: 'حساب یافت نشد.' }, { status: 404 })
      }

      const updateData: any = {}
      if (body.name !== undefined) updateData.name = body.name
      if (body.code !== undefined) updateData.code = body.code
      if (body.type !== undefined) updateData.type = body.type
      if (body.level !== undefined) updateData.level = body.level
      if (body.parentId !== undefined) updateData.parentId = body.parentId || null
      if (body.isActive !== undefined) updateData.isActive = body.isActive

      const account = await tenant.tenantDb.account.update({
        where: { id: body.id },
        data: updateData,
      })

      return NextResponse.json({ success: true, data: { account } })
    } catch (error: any) {
      console.error(`[Accounts] PUT error: ${error.message}`)
      return NextResponse.json({ success: false, error: 'خطا در ویرایش حساب.' }, { status: 500 })
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/accounts — حذف حساب
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantAndPermission('accounting')(
  async (request: NextRequest, _context: any, tenant: any) => {
    if (!['Manager', 'Admin', 'Owner'].includes(tenant.user.role)) {
      return NextResponse.json({ success: false, error: 'فقط مدیر می‌تواند حساب حذف کند.' }, { status: 403 })
    }

    try {
      const { searchParams } = new URL(request.url)
      const id = searchParams.get('id')

      if (!id) {
        return NextResponse.json({ success: false, error: 'شناسه حساب الزامی است.' }, { status: 400 })
      }

      await tenant.tenantDb.account.delete({ where: { id, tenantId: tenant.tenantId } })

      return NextResponse.json({ success: true, message: 'حساب حذف شد.' })
    } catch (error: any) {
      console.error(`[Accounts] DELETE error: ${error.message}`)
      return NextResponse.json({ success: false, error: 'خطا در حذف حساب.' }, { status: 500 })
    }
  }
)