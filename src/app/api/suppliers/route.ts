// ============================================================================
// src/app/api/suppliers/route.ts — GET / POST / PUT / DELETE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  GET /api/suppliers — لیست تامین‌کنندگان
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const activeOnly = searchParams.get('activeOnly') === 'true'

    const where: any = { tenantId }
    if (activeOnly) where.isActive = true
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { mobile: { contains: search } },
      ]
    }

    const suppliers = await tenantDb.supplier.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ success: true, data: suppliers })
  } catch (error: any) {
    console.error('[Suppliers GET] Error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری تامین‌کنندگان' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/suppliers — ایجاد تامین‌کننده
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (!body.name) {
      return NextResponse.json({ success: false, error: 'نام تامین‌کننده الزامی است' }, { status: 400 })
    }

    // ★ تولید کد خودکار اگر ارائه نشده
    let code = body.code
    if (!code) {
      const count = await tenantDb.supplier.count({ where: { tenantId } })
      code = `SUP-${(count + 1).toString().padStart(4, '0')}`
    }

    // ★ بررسی تکراری نبودن کد
    const existing = await tenantDb.supplier.findFirst({ where: { tenantId, code } })
    if (existing) {
      return NextResponse.json({ success: false, error: 'کد تامین‌کننده تکراری است' }, { status: 400 })
    }

    const supplier = await tenantDb.supplier.create({
      data: {
        tenantId,
        code,
        name: body.name,
        mobile: body.mobile || null,
        nationalCode: body.nationalCode || null,
        address: body.address || null,
        creditLimit: body.creditLimit ? parseFloat(body.creditLimit) : 0,
        currentBalance: body.currentBalance ? parseFloat(body.currentBalance) : 0,
        isActive: body.isActive !== false,
      },
    })

    return NextResponse.json({ success: true, data: supplier }, { status: 201 })
  } catch (error: any) {
    console.error('[Suppliers POST] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'خطا در ایجاد تامین‌کننده' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/suppliers — به‌روزرسانی
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (!body.id) {
      return NextResponse.json({ success: false, error: 'شناسه الزامی است' }, { status: 400 })
    }

    const existing = await tenantDb.supplier.findFirst({ where: { id: body.id, tenantId } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'تامین‌کننده یافت نشد' }, { status: 404 })
    }

    const updateData: any = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.code !== undefined) {
      // ★ بررسی تکراری نبودن کد جدید
      const dup = await tenantDb.supplier.findFirst({ where: { tenantId, code: body.code, NOT: { id: body.id } } })
      if (dup) {
        return NextResponse.json({ success: false, error: 'کد تکراری است' }, { status: 400 })
      }
      updateData.code = body.code
    }
    if (body.mobile !== undefined) updateData.mobile = body.mobile || null
    if (body.nationalCode !== undefined) updateData.nationalCode = body.nationalCode || null
    if (body.address !== undefined) updateData.address = body.address || null
    if (body.creditLimit !== undefined) updateData.creditLimit = parseFloat(body.creditLimit) || 0
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    await tenantDb.supplier.update({ where: { id: body.id }, data: updateData })

    return NextResponse.json({ success: true, message: 'تامین‌کننده به‌روزرسانی شد' })
  } catch (error: any) {
    console.error('[Suppliers PUT] Error:', error)
    return NextResponse.json({ success: false, error: 'خطا در به‌روزرسانی' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/suppliers — حذف (soft delete)
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه الزامی است' }, { status: 400 })
    }

    // ★ بررسی وجود فاکتور خرید برای این تامین‌کننده
    const hasInvoices = await tenantDb.purchaseInvoice.count({ where: { tenantId, supplierId: id } })
    if (hasInvoices > 0) {
      // ★ soft delete
      await tenantDb.supplier.update({ where: { id }, data: { isActive: false } })
      return NextResponse.json({ success: true, message: 'تامین‌کننده غیرفعال شد (دارای فاکتور خرید است)' })
    }

    await tenantDb.supplier.delete({ where: { id } })
    return NextResponse.json({ success: true, message: 'تامین‌کننده حذف شد' })
  } catch (error: any) {
    console.error('[Suppliers DELETE] Error:', error)
    return NextResponse.json({ success: false, error: 'خطا در حذف' }, { status: 500 })
  }
})
