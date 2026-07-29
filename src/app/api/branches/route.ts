// ============================================================================
// src/app/api/branches/route.ts — GET / POST / PUT / DELETE (v8.8 — ENTERPRISE)
// ShopAccounting — Multi-Branch Management for Enterprise Plan
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'

// ═══════════════════════════════════════════════════════════════
// GET /api/branches — لیست شعب + تعداد انبارهای هر شعبه
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canMultiBranch) {
      return NextResponse.json(
        { success: false, error: 'مدیریت شعب فقط در پلن سازمانی (حرفه‌ای) در دسترس است', code: 'PLAN_FEATURE_RESTRICTED' },
        { status: 403 }
      )
    }

    const tenantDb = tenant.tenantDb as any

    const branches = await tenantDb.branch.findMany({
      where: { tenantId: tenant.tenantId },
      include: {
        _count: {
          select: { Warehouses: true }
        }
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = branches.map((b: any) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      address: b.address,
      phone: b.phone,
      manager: b.manager,
      isActive: b.isActive,
      warehouseCount: b._count.Warehouses,
      createdAt: b.createdAt,
    }))

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    console.error('[Branches GET] Error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری شعب' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
// POST /api/branches — ایجاد شعبه جدید
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canMultiBranch) {
      return NextResponse.json({ success: false, error: 'مدیریت شعب فقط در پلن سازمانی در دسترس است' }, { status: 403 })
    }

    const tenantDb = tenant.tenantDb as any
    const body = await req.json()

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ success: false, error: 'نام شعبه الزامی است' }, { status: 400 })
    }

    // تولید خودکار کد شعبه در صورت عدم ورود
    const branchCount = await tenantDb.branch.count({ where: { tenantId: tenant.tenantId } })
    const code = body.code?.trim() || `BR-${(branchCount + 1).toString().padStart(3, '0')}`

    const newBranch = await tenantDb.branch.create({
      data: {
        tenantId: tenant.tenantId,
        name: body.name.trim(),
        code: code,
        address: body.address?.trim() || null,
        phone: body.phone?.trim() || null,
        manager: body.manager?.trim() || null,
        isActive: body.isActive !== false,
      },
    })

    return NextResponse.json({ success: true, data: newBranch, message: 'شعبه با موفقیت ایجاد شد' }, { status: 201 })
  } catch (error: any) {
    console.error('[Branches POST] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'خطا در ایجاد شعبه' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
// PUT /api/branches — ویرایش شعبه
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canMultiBranch) {
      return NextResponse.json({ success: false, error: 'مدیریت شعب فقط در پلن سازمانی در دسترس است' }, { status: 403 })
    }

    const tenantDb = tenant.tenantDb as any
    const body = await req.json()

    if (!body.id) {
      return NextResponse.json({ success: false, error: 'شناسه شعبه الزامی است' }, { status: 400 })
    }

    const updatedBranch = await tenantDb.branch.update({
      where: { id: body.id, tenantId: tenant.tenantId },
      data: {
        name: body.name?.trim(),
        code: body.code?.trim(),
        address: body.address?.trim() || null,
        phone: body.phone?.trim() || null,
        manager: body.manager?.trim() || null,
        isActive: body.isActive,
      },
    })

    return NextResponse.json({ success: true, data: updatedBranch, message: 'شعبه با موفقیت به‌روزرسانی شد' })
  } catch (error: any) {
    console.error('[Branches PUT] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'خطا در به‌روزرسانی شعبه' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
// DELETE /api/branches — حذف نرم (Soft Delete) شعبه
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canMultiBranch) {
      return NextResponse.json({ success: false, error: 'مدیریت شعب فقط در پلن سازمانی در دسترس است' }, { status: 403 })
    }

    const tenantDb = tenant.tenantDb as any
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه شعبه الزامی است' }, { status: 400 })
    }

    // بررسی امنیتی: جلوگیری از حذف شعبه‌ای که انبار دارد
    const warehouseCount = await tenantDb.warehouse.count({
      where: { branchId: id, tenantId: tenant.tenantId }
    })

    if (warehouseCount > 0) {
      return NextResponse.json({ 
        success: false, 
        error: `امکان حذف شعبه وجود ندارد. این شعبه دارای ${warehouseCount} انبار فعال است. ابتدا انبارها را منتقل یا حذف کنید.` 
      }, { status: 400 })
    }

    // حذف نرم (Soft Delete) برای حفظ یکپارچگی داده‌های تاریخی
    await tenantDb.branch.update({
      where: { id, tenantId: tenant.tenantId },
      data: { isActive: false }
    })

    return NextResponse.json({ success: true, message: 'شعبه با موفقیت غیرفعال (حذف نرم) شد' })
  } catch (error: any) {
    console.error('[Branches DELETE] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'خطا در حذف شعبه' }, { status: 500 })
  }
})