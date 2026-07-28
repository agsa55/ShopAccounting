// ============================================================================
// src/app/api/categories/route.ts — GET/POST/PUT/DELETE (v3.0)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const GET = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const where = { tenantId }

    let categories: any[] = []
    try {
      categories = await tenantDb.category.findMany({ where, orderBy: { name: 'asc' } })
    } catch (err: any) {
      if (err?.message?.includes('sortOrder') || err?.message?.includes('Invalid column') || err?.message?.includes('updatedAt')) {
        try {
          categories = await tenantDb.category.findMany({
            where,
            select: { id: true, name: true, parentId: true, isActive: true, tenantId: true, createdAt: true },
            orderBy: { name: 'asc' },
          })
        } catch { categories = [] }
      } else { throw err }
    }

    const mapped = await Promise.all(categories.map(async (cat: any) => {
      let productCount = 0
      try {
        productCount = await tenantDb.product.count({ where: { categoryId: cat.id, tenantId } })
      } catch { /* ignore */ }
      return {
        id: cat.id, name: cat.name, parentId: cat.parentId, isActive: cat.isActive, productCount,
      }
    }))

    return NextResponse.json({ success: true, data: mapped })
  } catch (error: any) {
    console.error('[Categories] GET error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری دسته‌بندی‌ها' }, { status: 500 })
  }
})

export const POST = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (!body.name) {
      return NextResponse.json({ success: false, error: 'نام دسته‌بندی الزامی است' }, { status: 400 })
    }

    const category = await tenantDb.category.create({
      data: {
        name: body.name, parentId: body.parentId || null,
        isActive: body.isActive ?? true, tenantId,
      },
    })

    return NextResponse.json({ success: true, data: category }, { status: 201 })
  } catch (error: any) {
    console.error('[Categories] POST error:', error)
    return NextResponse.json({ success: false, error: 'خطا در ایجاد دسته‌بندی' }, { status: 500 })
  }
})

export const PUT = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (!body.id) {
      return NextResponse.json({ success: false, error: 'شناسه دسته‌بندی الزامی است' }, { status: 400 })
    }

    const where: any = { id: body.id, tenantId }
    const existing = await tenantDb.category.findFirst({ where })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'دسته‌بندی یافت نشد' }, { status: 404 })
    }

    const updateData: Record<string, any> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.parentId !== undefined) updateData.parentId = body.parentId || null
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    const category = await tenantDb.category.update({ where: { id: body.id }, data: updateData })
    return NextResponse.json({ success: true, data: category })
  } catch (error: any) {
    console.error('[Categories] PUT error:', error)
    return NextResponse.json({ success: false, error: 'خطا در ویرایش دسته‌بندی' }, { status: 500 })
  }
})

export const DELETE = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const categoryId = searchParams.get('id')

    if (!categoryId) {
      return NextResponse.json({ success: false, error: 'شناسه دسته‌بندی الزامی است' }, { status: 400 })
    }

    const where: any = { id: categoryId, tenantId }
    const existing = await tenantDb.category.findFirst({ where })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'دسته‌بندی یافت نشد' }, { status: 404 })
    }

    const productCount = await tenantDb.product.count({ where: { categoryId, tenantId } })
    if (productCount > 0) {
      return NextResponse.json(
        { success: false, error: `این دسته‌بندی ${productCount} محصول دارد و قابل حذف نیست. ابتدا محصولات را انتقال دهید.` },
        { status: 400 }
      )
    }

    await tenantDb.category.delete({ where: { id: categoryId } })
    return NextResponse.json({ success: true, message: 'دسته‌بندی با موفقیت حذف شد' })
  } catch (error: any) {
    console.error('[Categories] DELETE error:', error)
    return NextResponse.json({ success: false, error: 'خطا در حذف دسته‌بندی' }, { status: 500 })
  }
})
