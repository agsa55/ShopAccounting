// ============================================================================
// src/app/api/customers/route.ts — GET/POST/PUT/DELETE (v6.2)
// ★ v6.2: نرمال‌سازی فارسی برای جستجو (ي/ك عربی ↔ ی/ک فارسی)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { requireSubscriptionAndLimit } from '@/lib/plan-guard'
import { checkPlanLimit } from '@/lib/plan-limits'

// ═══════════════════════════════════════════════════════════════
//  ★ v6.2: نرمال‌سازی فارسی سمت سرور
// ═══════════════════════════════════════════════════════════════

function normalizeFa(text: string): string {
  if (!text) return ''
  return text
    .replace(/\u064A/g, '\u06CC')  // ي → ی
    .replace(/\u0643/g, '\u06A9')  // ك → ک
    .replace(/\u0624/g, '\u0648')  // ؤ → و
    .replace(/[\u0625\u0623\u0622]/g, '\u0627')  // إ أ آ → ا
    .replace(/\u0629/g, '\u0647')  // ة → ه
    .replace(/[\u064B-\u0652]/g, '')  // حذف اعراب
    .replace(/\u0640/g, '')  // حذف کشیده
}

// ═══════════════════════════════════════════════════════════════
//  Helper: find customers با fallback
// ═══════════════════════════════════════════════════════════════

async function findCustomers(tenantDb: any, where: any, take: number, orderBy: any[] = []) {
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
//  ★ v6.2: buildSearchWhere با نرمال‌سازی فارسی
//  استفاده از both forms (عربی + فارسی) برای هر ترم
// ═══════════════════════════════════════════════════════════════

function buildSearchWhere(search: string): any {
  const trimmed = search.trim()
  if (!trimmed) return null

  // نرمال‌سازی به شکل فارسی استاندارد
  const normalized = normalizeFa(trimmed)
  
  // همچنین شکل عربی را هم بسازیم (برای رکوردهایی که با ي/ك ثبت شده‌اند)
  const arabicForm = normalized
    .replace(/\u06CC/g, '\u064A')  // ی → ي
    .replace(/\u06A9/g, '\u0643')  // ک → ك

  // شکل‌های مختلف برای جستجو
  const searchForms = Array.from(new Set([trimmed, normalized, arabicForm])).filter(Boolean)

  const parts = trimmed.split(/\s+/).filter(Boolean)
  const firstPart = parts[0] || trimmed
  const secondPart = parts[1] || ''

  const orConditions: any[] = []

  // ★ جستجو در هر فیلد با تمام شکل‌های عبارت
  for (const form of searchForms) {
    orConditions.push({ firstName: { contains: form } })
    orConditions.push({ lastName: { contains: form } })
    orConditions.push({ mobile: { contains: form } })
    orConditions.push({ code: { contains: form } })
    orConditions.push({ nationalCode: { contains: form } })
  }

  // ★ حالت ترکیبی: "رضا بخشی" با هر دو شکل
  if (parts.length >= 2) {
    const firstForms = Array.from(new Set([
      firstPart,
      normalizeFa(firstPart),
      normalizeFa(firstPart).replace(/\u06CC/g, '\u064A').replace(/\u06A9/g, '\u0643')
    ])).filter(Boolean)
    
    const secondForms = Array.from(new Set([
      secondPart,
      normalizeFa(secondPart),
      normalizeFa(secondPart).replace(/\u06CC/g, '\u064A').replace(/\u06A9/g, '\u0643')
    ])).filter(Boolean)

    // ترکیب همه حالت‌های ممکن
    for (const first of firstForms) {
      for (const second of secondForms) {
        orConditions.push({
          AND: [
            { firstName: { contains: first } },
            { lastName: { contains: second } },
          ],
        })
        orConditions.push({
          AND: [
            { firstName: { contains: second } },
            { lastName: { contains: first } },
          ],
        })
      }
    }
  }

  return { OR: orConditions }
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/customers
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 9999)
    const search = searchParams.get('search') || ''
    const activeOnly = searchParams.get('activeOnly') === 'true'

    const where: any = { tenantId }
    if (activeOnly) where.isBlacklisted = false

    const searchWhere = buildSearchWhere(search)
    if (searchWhere) {
      Object.assign(where, searchWhere)
    }

    let orderBy: any[] = [
      { lastPurchaseAt: 'desc' },
      { createdAt: 'desc' },
      { firstName: 'asc' },
    ]

    const { customers: rawCustomers, hasFullColumns } = await findCustomers(tenantDb, where, limit + 1, orderBy)

    let customers = rawCustomers
    if (customers.length === 0 && search && hasFullColumns === false) {
      const retry = await findCustomers(tenantDb, where, limit + 1, [{ createdAt: 'desc' }])
      customers = retry.customers
    }

    const hasMore = customers.length > limit
    const result = hasMore ? customers.slice(0, limit) : customers

    const mapped = result.map((c: any) => ({
      ...c,
      displayName: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
    }))

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
//  ★ v6.2: نرمال‌سازی نام هنگام ذخیره (اختیاری ولی توصیه شده)
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

    const count = await tenantDb.customer.count({ where: { tenantId } })
    const code = body.code || `C-${(count + 1).toString().padStart(4, '0')}`

    let firstName = body.firstName
    let lastName = body.lastName
    if ((!firstName || !lastName) && body.name) {
      const parts = String(body.name).trim().split(/\s+/)
      firstName = firstName || parts[0] || ''
      lastName = lastName || parts.slice(1).join(' ') || ''
    }

    // ★ v6.2: نرمال‌سازی نام‌ها هنگام ذخیره (برای جلوگیری از مشکلات آتی)
    firstName = normalizeFa(firstName || '')
    lastName = normalizeFa(lastName || '')

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
//  ★ v6.2: نرمال‌سازی نام هنگام به‌روزرسانی
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (!body.id) {
      return NextResponse.json({ success: false, error: 'شناسه مشتری الزامی است' }, { status: 400 })
    }

    const where: any = { id: body.id, tenantId }
    const existing = await tenantDb.customer.findFirst({ where })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'مشتری یافت نشد' }, { status: 404 })
    }

    const updateData: Record<string, any> = {}
    
    // ★ v6.2: نرمال‌سازی نام‌ها هنگام به‌روزرسانی
    if (body.firstName !== undefined) updateData.firstName = normalizeFa(body.firstName)
    if (body.lastName !== undefined) updateData.lastName = normalizeFa(body.lastName)
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
//  DELETE /api/customers — حذف نرم
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

    const where: any = { id: customerId, tenantId }
    const existing = await tenantDb.customer.findFirst({ where })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'مشتری یافت نشد' }, { status: 404 })
    }

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