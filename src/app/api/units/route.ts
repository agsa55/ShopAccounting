// ============================================================================
// src/app/api/units/route.ts — GET / POST (v3.9.1 — REWRITTEN)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.9.1: حل قطعی مشکل واحدها
//
// تغییرات مهم:
//   ★ حذف fallback به fake IDs مثل 'unit-piece' (این ریشه مشکل بود!)
//   ★ اگه tenant هیچ واحدی نداره، واقعاً در دیتابیس می‌سازه (auto-seed)
//   ★ response به صورت { success: true, data: { units: [...] } } استاندارد شد
//   ★ اگه query خطا بده، fallback به لیست استاتیک (با هشدار)
//
// ★ نکته مهم: این فایل قبلاً fake IDs برمی‌گردوند که باعث می‌شد:
//   - dropdown در frontend درست کار نکنه
//   - PUT /api/products با خطای INVALID_UNIT مواجه بشه (چون 'unit-piece' در دیتابیس نبود)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ═══════════════════════════════════════════════════════════════
//  واحدهای پیش‌فرض — همون لیست اصلی شما
// ═══════════════════════════════════════════════════════════════

const DEFAULT_UNITS = [
  { name: 'piece', nameFa: 'عدد', symbol: 'عدد', isDefault: true },
  { name: 'box', nameFa: 'جعبه', symbol: 'جعبه', isDefault: false },
  { name: 'carton', nameFa: 'کارتن', symbol: 'کارتن', isDefault: false },
  { name: 'pack', nameFa: 'بسته', symbol: 'بسته', isDefault: false },
  { name: 'kilogram', nameFa: 'کیلوگرم', symbol: 'کگ', isDefault: false },
  { name: 'gram', nameFa: 'گرم', symbol: 'گ', isDefault: false },
  { name: 'liter', nameFa: 'لیتر', symbol: 'لی', isDefault: false },
  { name: 'milliliter', nameFa: 'میلی‌لیتر', symbol: 'ملی', isDefault: false },
  { name: 'meter', nameFa: 'متر', symbol: 'م', isDefault: false },
  { name: 'ton', nameFa: 'تن', symbol: 'تن', isDefault: false },
  { name: 'roll', nameFa: 'رول', symbol: 'رول', isDefault: false },
  { name: 'bundle', nameFa: 'دسته', symbol: 'دسته', isDefault: false },
  { name: 'dozen', nameFa: 'جین', symbol: 'جین', isDefault: false },
  { name: 'set', nameFa: 'ست', symbol: 'ست', isDefault: false },
  { name: 'pair', nameFa: 'جفت', symbol: 'جفت', isDefault: false },
  { name: 'bag', nameFa: 'کیسه', symbol: 'کیسه', isDefault: false },
]

// ═══════════════════════════════════════════════════════════════
//  GET /api/units — لیست واحدها
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    console.log('[Units GET] Fetching units for tenant:', tenantId)

    // ★★★ مرحله ۱: query واحدهای tenant از دیتابیس
    let units: any[] = []
    let dbError: string | null = null

    try {
      const where: any = { tenantId }
      units = await tenantDb.unit.findMany({
        where,
        orderBy: [
          { isDefault: 'desc' },
          { nameFa: 'asc' },
        ],
      })
      console.log('[Units GET] Found', units.length, 'units in database')
    } catch (err: any) {
      dbError = err?.message || 'Unknown error'
      console.warn('[Units GET] Database query failed:', dbError)
      units = []
    }

    // ★★★ مرحله ۲: اگه دیتابیس خالی هست (و خطا نداشت)، auto-seed کن
    if (units.length === 0 && !dbError) {
      console.log('[Units GET] No units found, auto-seeding default units to database...')

      try {
        for (const unit of DEFAULT_UNITS) {
          try {
            await tenantDb.unit.create({
              data: {
                name: unit.name,
                nameFa: unit.nameFa,
                symbol: unit.symbol,
                isDefault: unit.isDefault,
                tenantId,
              },
            })
          } catch (createErr: any) {
            // ★ اگه واحد تکراری بود (unique constraint)، skip کن
            if (createErr?.message?.includes('Unique') || createErr?.message?.includes('duplicate')) {
              console.log('[Units GET] Unit already exists, skipping:', unit.name)
            } else {
              console.error('[Units GET] Failed to create unit', unit.name, ':', createErr?.message)
            }
          }
        }

        // ★ دوباره query کن تا واحدهای ساخته‌شده رو بگیریم
        units = await tenantDb.unit.findMany({
          where: { tenantId },
          orderBy: [
            { isDefault: 'desc' },
            { nameFa: 'asc' },
          ],
        })
        console.log('[Units GET] Auto-seeded successfully. Total units:', units.length)
      } catch (seedErr: any) {
        console.error('[Units GET] Auto-seed failed:', seedErr?.message)
      }
    }

    // ★★★ مرحله ۳: اگه هنوز هیچ واحدی نیست (مثلاً دیتابیس خطا داده)،
    // از لیست استاتیک استفاده کن ولی با هشدار — این فقط fallback آخرینه
    if (units.length === 0) {
      console.warn('[Units GET] ⚠️  Using static fallback — units will NOT be saveable!')
      console.warn('[Units GET] ⚠️  Database issue:', dbError)

      units = DEFAULT_UNITS.map((u, idx) => ({
        id: `fallback-unit-${idx + 1}`,
        name: u.name,
        nameFa: u.nameFa,
        symbol: u.symbol,
        isDefault: u.isDefault,
        tenantId,
        createdAt: new Date().toISOString(),
        _warning: 'این یک fallback است و در دیتابیس ذخیره نشده',
      }))
    }

    // ★★★ v3.9.1: استاندارد response — data.units (نه data مستقیم)
    return NextResponse.json({
      success: true,
      data: { units },
    })
  } catch (error: any) {
    console.error('[Units GET] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری واحدها' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/units — ایجاد واحد جدید
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { success: false, error: 'نام واحد الزامی است' },
        { status: 400 }
      )
    }

    if (!body.nameFa || !body.nameFa.trim()) {
      return NextResponse.json(
        { success: false, error: 'نام فارسی واحد الزامی است' },
        { status: 400 }
      )
    }

    // ★ بررسی یکتایی نام در tenant
    const existing = await tenantDb.unit.findFirst({
      where: {
        tenantId,
        OR: [
          { name: body.name.trim() },
          { nameFa: body.nameFa.trim() },
        ],
      },
    })

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'واحد با این نام قبلاً ثبت شده است' },
        { status: 400 }
      )
    }

    const unit = await tenantDb.unit.create({
      data: {
        name: body.name.trim(),
        nameFa: body.nameFa.trim(),
        symbol: body.symbol?.trim() || null,
        isDefault: body.isDefault || false,
        tenantId,
      },
    })

    console.log('[Units POST] Created unit:', {
      id: unit.id,
      name: unit.name,
      nameFa: unit.nameFa,
      tenantId,
    })

    return NextResponse.json({
      success: true,
      data: { unit },
    }, { status: 201 })
  } catch (error: any) {
    console.error('[Units POST] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در ایجاد واحد' },
      { status: 500 }
    )
  }
})
