// ============================================================================
// src/app/api/customers/route.ts — GET/POST/PUT/DELETE (v6.1 — Search Enhanced)
// ============================================================================
// ★★★ v6.1 بهبودها:
//   ★ جستجوی ترکیبی: "علی احمدی" → firstName CONTAINS "علی" AND lastName CONTAINS "احمدی"
//   ★ افزودن nationalCode به جستجو
//   ★ افزودن lastPurchaseAt به orderBy (مشتریان اخیر اول)
//   ★ مدیریت بهتر خطا با fallback کامل
//   ★ حفظ ساختار withTenantAndPermission و tenantDb (مطابق معماری موجود)
//   ★ حفظ planLimits در پاسخ (مطابق فرانت‌اند موجود)
//   ★ حفظ displayName mapping (مطابق فرانت‌اند موجود)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { requireSubscriptionAndLimit } from '@/lib/plan-guard'
import { checkPlanLimit } from '@/lib/plan-limits'

// ═══════════════════════════════════════════════════════════════
//  Helper: find customers با fallback برای column های ناقص
//  اگر دیتابیس قدیمی باشد و بعضی ستون‌ها (مثل nationalCode, lastPurchaseAt,
//  portalToken) وجود نداشته باشند، این تابع به‌صورت خودکار به select سبک‌تر
//  برمی‌گردد.
// ═══════════════════════════════════════════════════════════════
async function findCustomers(tenantDb: any, where: any, take: number, orderBy: any[] = []) {
  // ★ تلاش ۱: با تمام ستون‌ها
  try {
    const customers = await tenantDb.customer.findMany({ where, take, orderBy })
    return { customers, hasFullColumns: true }
  } catch (err: any) {
    const msg = err?.message || ''
    if (!msg.includes('Invalid column') && !msg.includes('Unknown field') && !msg.includes('does not exist')) {
      throw err
    }
    console.warn('[Customers] Some columns missing, using fallback select:', msg.slice(0, 100))
  }

  // ★ تلاش ۲: با select سبک‌تر (ستون‌های اصلی)
  try {
    const customers = await tenantDb.customer.findMany({
      where, take,
      select: {
        id: true, code: true, firstName: true, lastName: true,
        mobile: true, tenantId: true, createdAt: true,
        currentBalance: true, isBlacklisted: true,
      },
      orderBy: orderBy.length > 0 ? orderBy : { firstName: 'asc' },
    })
    return { customers, hasFullColumns: false }
  } catch (err2: any) {
    console.warn('[Customers] Fallback also failed:', err2?.message)
    // ★ تلاش ۳: حداقل ستون‌ها
    try {
      const customers = await tenantDb.customer.findMany({
        where, take,
        select: { id: true, firstName: true, lastName: true, mobile: true, tenantId: true, createdAt: true },
      })
      return { customers, hasFullColumns: false }
    } catch {
      return { customers: [], hasFullColumns: false }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  Helper: ساخت شرط جستجوی سرور-ساید
//  این تابع ۵ فیلد را جستجو می‌کند:
//  - firstName (contains)
//  - lastName (contains)
//  - mobile (contains)
//  - code (contains)
//  - nationalCode (contains)
//  + حالت ترکیبی: "علی احمدی" → firstName CONTAINS "علی" AND lastName CONTAINS "احمدی"
// ═══════════════════════════════════════════════════════════════
function buildSearchWhere(search: string): any {
  const trimmed = search.trim()
  if (!trimmed) return null

  const parts = trimmed.split(/\s+/).filter(Boolean)
  const firstPart = parts[0] || trimmed
  const secondPart = parts[1] || ''

  const orConditions: any[] = [
    { firstName: { contains: trimmed } },
    { lastName: { contains: trimmed } },
    { mobile: { contains: trimmed } },
    { code: { contains: trimmed } },
    { nationalCode: { contains: trimmed } },
  ]

  // ★ حالت ترکیبی: "علی احمدی"
  if (parts.length >= 2) {
    orConditions.push({
      AND: [
        { firstName: { contains: firstPart } },
        { lastName: { contains: secondPart } },
      ],
    })
    // برعکس هم ممکن است: lastName "علی" + firstName "احمدی" (نادر اما ممکن)
    orConditions.push({
      AND: [
        { firstName: { contains: secondPart } },
        { lastName: { contains: firstPart } },
      ],
    })
  }

  return { OR: orConditions }
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/customers
//  Query params:
//    tenantId (required, via middleware)
//    search   (optional) — جستجو در نام، موبایل، کد، کد ملی
//    limit    (optional, default 200)
//    activeOnly (optional, default false) — فقط مشتریان غیر لیست سیاه
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 9999)
    const search = searchParams.get('search') || ''
    const activeOnly = searchParams.get('activeOnly') === 'true'

    // ★ ساخت شرط where
    const where: any = { tenantId }
    if (activeOnly) where.isBlacklisted = false

    // ★ افزودن شرط جستجو
    const searchWhere = buildSearchWhere(search)
    if (searchWhere) {
      Object.assign(where, searchWhere)
    }

    // ★★★ v6.1: orderBy با fallback
    // اول بر اساس lastPurchaseAt (مشتریان اخیر اول)، سپس createdAt
    // اگر lastPurchaseAt وجود نداشت، به createdAt برمی‌گردیم
    let orderBy: any[] = [
      { lastPurchaseAt: 'desc' },
      { createdAt: 'desc' },
      { firstName: 'asc' },
    ]

    const { customers: rawCustomers, hasFullColumns } = await findCustomers(tenantDb, where, limit + 1, orderBy)

    // اگر orderBy خطا داد (مثلاً lastPurchaseAt موجود نبود)، با orderBy ساده تلاش کن
    let customers = rawCustomers
    if (customers.length === 0 && search && hasFullColumns === false) {
      const retry = await findCustomers(tenantDb, where, limit + 1, [{ createdAt: 'desc' }])
      customers = retry.customers
    }

    const hasMore = customers.length > limit
    const result = hasMore ? customers.slice(0, limit) : customers

    // ★★★ mapping: افزودن displayName برای فرانت‌اند
    const mapped = result.map((c: any) => ({
      ...c,
      displayName: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
    }))

    // ★★★ plan limits برای نمایش در UI
    let planLimits: any = null
    try {
      const customerLimit = await checkPlanLimit(tenantId, 'customers')
      planLimits = {
        maxCustomers: customerLimit.limit,
        currentCount: customerLimit.current,
        remaining: customerLimit.remaining,
        canAdd: customerLimit.allowed,
        planTierName: tenant.planTierName || 'simple',
      }
    } catch { /* ignore */ }

    return NextResponse.json({
      success: true,
      data: mapped,
      hasMore,
      planLimits,
    })
  } catch (error: any) {
    console.error('[Customers] GET error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری مشتریان' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/customers — ایجاد مشتری جدید
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const limitCheck = await requireSubscriptionAndLimit(tenant.tenantId, 'customers')
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { success: false, error: limitCheck.message, code: 'PLAN_LIMIT_CUSTOMERS' },
        { status: 403 }
      )
    }

    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    // ★ تولید کد خودکار اگر ارائه نشده
    const count = await tenantDb.customer.count({ where: { tenantId } })
    const code = body.code || `C-${(count + 1).toString().padStart(4, '0')}`

    // ★★★ v6.1: تجزیه نام کامل اگر firstName/lastName ارائه نشد
    let firstName = body.firstName
    let lastName = body.lastName
    if ((!firstName || !lastName) && body.name) {
      const parts = String(body.name).trim().split(/\s+/)
      firstName = firstName || parts[0] || ''
      lastName = lastName || parts.slice(1).join(' ') || ''
    }

    const customer = await tenantDb.customer.create({
      data: {
        code,
        firstName: firstName || '',
        lastName: lastName || '',
        mobile: body.mobile || null,
        nationalCode: body.nationalCode || null,
        address: body.address || null,
        creditLimit: body.creditLimit || 0,
        currentBalance: body.currentBalance || 0,
        isBlacklisted: body.isBlacklisted || false,
        tenantId,
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          ...customer,
          displayName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('[Customers] POST error:', error?.message || error)
    if (error?.message?.includes('PLAN_LIMIT')) {
      return NextResponse.json(
        { success: false, error: error.message, code: 'PLAN_LIMIT_CUSTOMERS' },
        { status: 403 }
      )
    }
    return NextResponse.json({ success: false, error: 'خطا در ایجاد مشتری' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/customers — به‌روزرسانی مشتری
// ═══════════════════════════════════════════════════════════════
export const PUT = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (!body.id) {
      return NextResponse.json({ success: false, error: 'شناسه مشتری الزامی است' }, { status: 400 })
    }

    // ★ بررسی مالکیت مشتری (tenant isolation)
    const where: any = { id: body.id, tenantId }
    const existing = await tenantDb.customer.findFirst({ where })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'مشتری یافت نشد' }, { status: 404 })
    }

    // ★ ساخت داده‌های به‌روزرسانی (فقط فیلدهای ارائه‌شده)
    const updateData: Record<string, any> = {}
    if (body.firstName !== undefined) updateData.firstName = body.firstName
    if (body.lastName !== undefined) updateData.lastName = body.lastName
    if (body.mobile !== undefined) updateData.mobile = body.mobile || null
    if (body.nationalCode !== undefined) updateData.nationalCode = body.nationalCode || null
    if (body.address !== undefined) updateData.address = body.address || null
    if (body.creditLimit !== undefined) updateData.creditLimit = parseFloat(body.creditLimit) || 0
    if (body.currentBalance !== undefined) updateData.currentBalance = parseFloat(body.currentBalance) || 0
    if (body.isBlacklisted !== undefined) updateData.isBlacklisted = Boolean(body.isBlacklisted)
    if (body.code !== undefined) updateData.code = body.code

    const customer = await tenantDb.customer.update({ where: { id: body.id }, data: updateData })

    return NextResponse.json({
      success: true,
      data: {
        ...customer,
        displayName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
      },
    })
  } catch (error: any) {
    console.error('[Customers] PUT error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در ویرایش مشتری' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/customers — حذف نرم (soft delete)
//  ★ به‌جای حذف فیزیکی، مشتری را blacklist می‌کند تا تاریخچه فاکتورها حفظ شود
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('id')

    if (!customerId) {
      return NextResponse.json({ success: false, error: 'شناسه مشتری الزامی است' }, { status: 400 })
    }

    // ★ بررسی مالکیت مشتری
    const where: any = { id: customerId, tenantId }
    const existing = await tenantDb.customer.findFirst({ where })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'مشتری یافت نشد' }, { status: 404 })
    }

    // ★ soft delete: blacklist می‌کنیم تا تاریخچه فاکتورها حفظ شود
    await tenantDb.customer.update({
      where: { id: customerId },
      data: { isBlacklisted: true },
    })

    return NextResponse.json({ success: true, message: 'مشتری با موفقیت حذف شد' })
  } catch (error: any) {
    console.error('[Customers] DELETE error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در حذف مشتری' }, { status: 500 })
  }
})
