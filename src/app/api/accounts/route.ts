// ============================================================================
// src/app/api/accounts/route.ts — GET / POST / PUT / DELETE (v3.19 ★★★ FIX PACK)
// ShopAccounting — Chart of Accounts API with Auto-Seed
// ============================================================================
// ★★★ v3.19 (fix pack): افزودن ۶ حساب مفقود به DEFAULT_ACCOUNTS:
//   - 1900  مالیات پرداختنی (tax)
//   - 1950  مالیات بر ارزش افزوده (tax)
//   - 5105  هزینه کارمزد درگاه (expense) — استفاده‌شده در profit-loss/route.ts
//   - 5106  هزینه کارمزد پلتفرم (expense) — استفاده‌شده در profit-loss/route.ts
//   - 6100  هزینه تعمیرات (repair_expense) — استفاده‌شده در فاکتور خدماتی خرید
//   - 6200  هزینه خدمات (service_expense) — استفاده‌شده در فاکتور خدماتی خرید
//
//   این حساب‌ها در مستندات (v8.8) تعریف شده بودن اما در auto-seed نبودن.
//   نبود 5105 و 5106 باعث می‌شد کارمزدهای پرداخت آنلاین در گزارش P&L شناسایی نشن.
//   نبود 6100 و 6200 باعث می‌شد فاکتورهای تعمیرات/خدمات حساب متناسب نداشته باشن.
//
// ★★★ v3.18.2 (حفظ شد): اگه tenant حسابی نداره، حساب‌های پیش‌فرض ساخته می‌شن
// ★★★ v3.18 (حفظ شد): پشتیبانی از tenantId در همه query ها
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ═══════════════════════════════════════════════════════════════
//  حساب‌های پیش‌فرض (استاندارد حسابداری ایران)
//  ★★★ v3.19: ۲۸ حساب (قبلاً ۲۲ تا بود)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_ACCOUNTS = [
  // ─── دارایی‌ها (Asset) ───
  { code: '1000', name: 'صندوق', type: 'cash', level: 1 },
  { code: '1010', name: 'صندوق فروشگاه', type: 'cash', level: 2 },
  { code: '1100', name: 'بانک', type: 'bank', level: 1 },
  { code: '1200', name: 'موجودی کالا', type: 'inventory', level: 1 },
  { code: '1300', name: 'حساب‌های دریافتنی', type: 'receivable', level: 1 },
  { code: '1310', name: 'بدهکاران تجاری', type: 'receivable', level: 2 },
  { code: '1350', name: 'چک‌های دریافتنی', type: 'receivable', level: 2 },
  { code: '1400', name: 'تجهیزات', type: 'asset', level: 1 },

  // ─── بدهی‌ها (Liability) ───
  { code: '1900', name: 'مالیات پرداختنی', type: 'tax', level: 1 },           // ★★★ v3.19: NEW
  { code: '1950', name: 'مالیات بر ارزش افزوده', type: 'tax', level: 2 },      // ★★★ v3.19: NEW
  { code: '2000', name: 'حساب‌های پرداختنی', type: 'payable', level: 1 },
  { code: '2010', name: 'بستانکاران تجاری', type: 'payable', level: 2 },
  { code: '2050', name: 'چک‌های پرداختنی', type: 'payable', level: 2 },
  { code: '2100', name: 'وام بانکی', type: 'liability', level: 1 },

  // ─── حقوق صاحبان سهام (Equity) ───
  { code: '3000', name: 'سرمایه', type: 'equity', level: 1 },
  { code: '3100', name: 'سود انباشته', type: 'equity', level: 1 },

  // ─── درآمد (Revenue) ───
  { code: '4000', name: 'فروش', type: 'revenue', level: 1 },
  { code: '4100', name: 'فروش کالا', type: 'revenue', level: 2 },
  { code: '4200', name: 'درآمد خدمات', type: 'revenue', level: 1 },

  // ─── بهای تمام شده (COGS) ───
  { code: '5000', name: 'بهای تمام شده کالای فروش رفته', type: 'cogs', level: 1 },

  // ─── هزینه‌های عملیاتی (Expense) ───
  { code: '5100', name: 'هزینه‌های اداری', type: 'expense', level: 1 },
  { code: '5105', name: 'هزینه کارمزد درگاه', type: 'expense', level: 2 },     // ★★★ v3.19: NEW — Zarinpal/IDPay fees
  { code: '5106', name: 'هزینه کارمزد پلتفرم', type: 'expense', level: 2 },    // ★★★ v3.19: NEW — platform commission
  { code: '5110', name: 'حقوق و دستمزد', type: 'expense', level: 2 },
  { code: '5120', name: 'هزینه اجاره', type: 'expense', level: 2 },
  { code: '5130', name: 'هزینه آب و برق و گاز', type: 'expense', level: 2 },
  { code: '5140', name: 'هزینه تبلیغات', type: 'expense', level: 2 },
  { code: '5150', name: 'هزینه استهلاک', type: 'expense', level: 2 },         // ★★★ v3.19: NEW — fixed-asset depreciation
  { code: '5200', name: 'هزینه مالیات', type: 'expense', level: 1 },

  // ─── هزینه‌های تعمیرات و خدمات (Repair & Service Expense) ───
  { code: '6100', name: 'هزینه تعمیرات', type: 'expense', level: 1 },         // ★★★ v3.19: NEW
  { code: '6200', name: 'هزینه خدمات', type: 'expense', level: 1 },           // ★★★ v3.19: NEW
]

// ═══════════════════════════════════════════════════════════════
//  تابع auto-seed — ساخت حساب‌های پیش‌فرض
//  ★★★ v3.19: اگه tenant قبلاً حساب‌های قدیمی داره (مثلاً بدون 5105/5106)،
//  این تابع فقط حساب‌های جدید رو اضافه می‌کنه و قبلی‌ها رو دست نمی‌زنه.
// ═══════════════════════════════════════════════════════════════

async function seedDefaultAccounts(tenantDb: any, tenantId: string) {
  console.log('[Accounts] Seeding default accounts for tenant:', tenantId)

  let createdCount = 0
  let skippedCount = 0

  for (const acc of DEFAULT_ACCOUNTS) {
    try {
      // ★ بررسی اینکه حساب تکراری نباشه (بر اساس کد)
      const existing = await tenantDb.account.findFirst({
        where: { code: acc.code, tenantId },
      })
      if (existing) {
        skippedCount++
        continue
      }

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
      createdCount++
    } catch (err: any) {
      console.warn('[Accounts] Failed to seed account', acc.code, ':', err?.message)
    }
  }

  console.log(`[Accounts] Seed complete: ${createdCount} created, ${skippedCount} skipped (already existed)`)
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/accounts — لیست حساب‌ها
//  ★★★ v3.19: auto-seed اگه هیچ حسابی نبود + sync اگه حساب‌های جدید اضافه شده
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

      // ★★★ v3.18.2: اگه هیچ حسابی وجود نداره، auto-seed کن
      if (accounts.length === 0) {
        await seedDefaultAccounts(tenant.tenantDb, tenant.tenantId)
        // ★ دوباره query کن
        accounts = await tenant.tenantDb.account.findMany({
          where,
          orderBy: { code: 'asc' },
        })
      } else {
        // ★★★ v3.19: اگه tenant حساب‌ها داره ولی حساب‌های جدید (5105, 5106, 6100, 6200, ...)
        //   موجود نیستن، اون‌ها رو اضافه کن. این migration پویا برای tenant‌های قدیمی است.
        const existingCodes = new Set(accounts.map((a: any) => a.code))
        const missingAccounts = DEFAULT_ACCOUNTS.filter(acc => !existingCodes.has(acc.code))

        if (missingAccounts.length > 0) {
          console.log(`[Accounts] Found ${missingAccounts.length} missing default accounts, seeding them...`, missingAccounts.map(a => a.code))
          await seedDefaultAccounts(tenant.tenantDb, tenant.tenantId)
          // ★ دوباره query کن
          accounts = await tenant.tenantDb.account.findMany({
            where,
            orderBy: { code: 'asc' },
          })
        }
      }

      return NextResponse.json({ success: true, data: { accounts } })
    } catch (error: any) {
      console.error(`[Accounts] GET error: ${error.message}`)
      return NextResponse.json(
        { success: false, error: 'خطا در دریافت حساب‌ها.' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  POST /api/accounts — ایجاد حساب
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(
  async (request: NextRequest, _context: any, tenant: any) => {
    if (tenant.user.role !== 'Manager' && tenant.user.role !== 'Admin' && tenant.user.role !== 'Owner') {
      return NextResponse.json(
        { success: false, error: 'فقط مدیر می‌تواند حساب ایجاد کند.' },
        { status: 403 }
      )
    }

    try {
      const body = await request.json()

      if (!body.name || !body.code) {
        return NextResponse.json(
          { success: false, error: 'نام و کد حساب الزامی است.' },
          { status: 400 }
        )
      }

      const existing = await tenant.tenantDb.account.findFirst({
        where: { code: body.code, tenantId: tenant.tenantId },
      })
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'کد حساب تکراری است.' },
          { status: 409 }
        )
      }

      const accountData: any = {
        code: body.code,
        name: body.name,
        type: body.type || 'cash',
        level: body.level || 1,
        parentId: body.parentId || null,
        isActive: body.isActive !== undefined ? body.isActive : true,
        tenantId: tenant.tenantId,
      }

      const account = await tenant.tenantDb.account.create({
        data: accountData,
      })

      return NextResponse.json({ success: true, data: { account } }, { status: 201 })
    } catch (error: any) {
      console.error(`[Accounts] POST error: ${error.message}`)
      return NextResponse.json(
        { success: false, error: 'خطا در ایجاد حساب.' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  PUT /api/accounts — ویرایش حساب
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(
  async (request: NextRequest, _context: any, tenant: any) => {
    if (tenant.user.role !== 'Manager' && tenant.user.role !== 'Admin' && tenant.user.role !== 'Owner') {
      return NextResponse.json(
        { success: false, error: 'فقط مدیر می‌تواند حساب ویرایش کند.' },
        { status: 403 }
      )
    }

    try {
      const body = await request.json()

      if (!body.id) {
        return NextResponse.json(
          { success: false, error: 'شناسه حساب الزامی است.' },
          { status: 400 }
        )
      }

      const existing = await tenant.tenantDb.account.findFirst({
        where: { id: body.id, tenantId: tenant.tenantId },
      })
      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'حساب یافت نشد.' },
          { status: 404 }
        )
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
      return NextResponse.json(
        { success: false, error: 'خطا در ویرایش حساب.' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/accounts — حذف حساب
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('accounting')(
  async (request: NextRequest, _context: any, tenant: any) => {
    if (tenant.user.role !== 'Manager' && tenant.user.role !== 'Admin' && tenant.user.role !== 'Owner') {
      return NextResponse.json(
        { success: false, error: 'فقط مدیر می‌تواند حساب حذف کند.' },
        { status: 403 }
      )
    }

    try {
      const { searchParams } = new URL(request.url)
      const id = searchParams.get('id')

      if (!id) {
        return NextResponse.json(
          { success: false, error: 'شناسه حساب الزامی است.' },
          { status: 400 }
        )
      }

      const existing = await tenant.tenantDb.account.findFirst({
        where: { id, tenantId: tenant.tenantId },
      })
      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'حساب یافت نشد.' },
          { status: 404 }
        )
      }

      await tenant.tenantDb.account.delete({ where: { id } })

      return NextResponse.json({ success: true, message: 'حساب حذف شد.' })
    } catch (error: any) {
      console.error(`[Accounts] DELETE error: ${error.message}`)
      return NextResponse.json(
        { success: false, error: 'خطا در حذف حساب.' },
        { status: 500 }
      )
    }
  }
)
