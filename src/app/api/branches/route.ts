// ============================================================================
// src/app/api/branches/route.ts — GET / POST / PUT / DELETE (v3.18 — ENTERPRISE)
// ShopAccounting — Multi-Branch Management for Enterprise Plan
// ============================================================================
// ★★★ v3.18: مدیریت شعب برای پلن سازمانی
//
// عملیات:
//   GET    — لیست شعب
//   POST   — ایجاد شعبه جدید
//   PUT    — ویرایش شعبه
//   DELETE — حذف شعبه (soft delete)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'

// ═══════════════════════════════════════════════════════════════
//  GET /api/branches — لیست شعب
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    // ★ بررسی پلن سازمانی
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canMultiBranch) {
      return NextResponse.json(
        { success: false, error: 'مدیریت شعب فقط در پلن سازمانی در دسترس است', code: 'PLAN_FEATURE_RESTRICTED' },
        { status: 403 }
      )
    }

    // ★ در حال حاضر از StoreUser با storeId/storeName به‌عنوان شعبه استفاده می‌کنیم
    // در آینده می‌تونیم یک جدول Branch جداگانه بسازیم
    const branches = await tenantDb.storeUser.findMany({
      where: { tenantId, storeId: { not: null } },
      select: {
        id: true,
        storeId: true,
        storeName: true,
        username: true,
        role: true,
        isActive: true,
      },
      orderBy: { storeName: 'asc' },
    })

    // ★ گروه‌بندی بر اساس storeId
    const branchMap = new Map<string, any>()
    for (const u of branches) {
      if (u.storeId && !branchMap.has(u.storeId)) {
        branchMap.set(u.storeId, {
          id: u.storeId,
          name: u.storeName || 'شعبه بدون نام',
          userCount: 0,
          isActive: true,
        })
      }
      if (u.storeId) {
        branchMap.get(u.storeId)!.userCount++
      }
    }

    // ★ اضافه‌کردن شعبه اصلی (بدون storeId)
    const mainBranchUsers = await tenantDb.storeUser.count({
      where: { tenantId, storeId: null },
    })

    const result = [
      { id: 'main', name: 'شعبه اصلی', userCount: mainBranchUsers, isActive: true },
      ...Array.from(branchMap.values()),
    ]

    return NextResponse.json({
      success: true,
      data: { branches: result },
    })
  } catch (error: any) {
    console.error('[Branches GET] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری شعب' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/branches — ایجاد شعبه جدید
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const features = getFeaturesByPlanName(tenant.planTierName)
    if (!features.canMultiBranch) {
      return NextResponse.json(
        { success: false, error: 'مدیریت شعب فقط در پلن سازمانی در دسترس است' },
        { status: 403 }
      )
    }

    const tenantDb = tenant.tenantDb
    const body = await req.json()

    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { success: false, error: 'نام شعبه الزامی است' },
        { status: 400 }
      )
    }

    // ★ تولید ID شعبه
    const branchId = `branch-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`

    // ★ در حال حاضر شعبه رو با ایجاد یک StoreUser مدیر با storeId ثبت می‌کنیم
    // در آینده جدول Branch جداگانه ساخته می‌شه
    const managerUser = await tenantDb.storeUser.create({
      data: {
        username: `${body.name.trim()}-manager`,
        password: body.managerPassword || 'temp12345',
        role: 'Manager',
        storeId: branchId,
        storeName: body.name.trim(),
        isActive: true,
        tenantId: tenant.tenantId,
      },
    })

    console.log('[Branches POST] Created branch:', { branchId, name: body.name, managerId: managerUser.id })

    return NextResponse.json({
      success: true,
      data: {
        branch: {
          id: branchId,
          name: body.name.trim(),
          managerId: managerUser.id,
        },
      },
      message: 'شعبه با موفقیت ایجاد شد',
    }, { status: 201 })
  } catch (error: any) {
    console.error('[Branches POST] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در ایجاد شعبه' },
      { status: 500 }
    )
  }
})
