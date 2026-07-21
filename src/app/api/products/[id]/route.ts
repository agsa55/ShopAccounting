// ============================================================================
// src/app/api/products/[id]/route.ts — GET / PUT / DELETE (v3.9 — REWRITTEN)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.9: بازنویسی کامل برای حل مشکل ویرایش واحد محصولات
//
// عملیات:
//   GET    — دریافت یک محصول با include واحد و دسته‌بندی
//   PUT    — ویرایش محصول با ذخیره unitId
//   DELETE — حذف محصول (با بررسی موجودی)
//
// ★★★ نکته مهم: در PUT، فیلد unitId حتماً ذخیره می‌شه
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ═══════════════════════════════════════════════════════════════
//  GET /api/products/[id] — دریافت یک محصول
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    // ★★★ Next.js 16: params باید await بشه
    const params = await ctx.params
    const productId = params.id

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'شناسه محصول الزامی است' },
        { status: 400 }
      )
    }

    const product = await tenantDb.product.findFirst({
      where: { id: productId, tenantId },
      include: {
        category: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, nameFa: true, symbol: true } },
      },
    })

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'محصول یافت نشد' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { product },
    })
  } catch (error: any) {
    console.error('[Products GET by id] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری محصول' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/products/[id] — ویرایش محصول
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    // ★★★ Next.js 16: params باید await بشه
    const params = await ctx.params
    const productId = params.id

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'شناسه محصول الزامی است' },
        { status: 400 }
      )
    }

    const body = await req.json()

    console.log('[Products PUT] Request body for product', productId, ':', {
      name: body.name,
      code: body.code,
      unitId: body.unitId,
      categoryId: body.categoryId,
      salePrice: body.salePrice,
    })

    // ─── ۱. یافتن محصول موجود ───────────────────────────────
    const existing = await tenantDb.product.findFirst({
      where: { id: productId, tenantId },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'محصول یافت نشد' },
        { status: 404 }
      )
    }

    // ─── ۲. اعتبارسنجی فیلدهای اجباری ───────────────────────
    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { success: false, error: 'نام محصول الزامی است', code: 'NAME_REQUIRED' },
        { status: 400 }
      )
    }

    // ★★★ v3.9: اعتبارسنجی واحد — حتماً باید انتخاب بشه
    if (!body.unitId || body.unitId === 'none' || body.unitId === '') {
      return NextResponse.json(
        { success: false, error: 'واحد محصول الزامی است', code: 'UNIT_REQUIRED' },
        { status: 400 }
      )
    }

    // ★★★ v3.9: مطمئن بشیم unitId در دیتابیس موجوده و متعلق به همین tenant هست
    const unitExists = await tenantDb.unit.findFirst({
      where: { id: body.unitId, tenantId },
    })
    if (!unitExists) {
      return NextResponse.json(
        { success: false, error: 'واحد انتخاب شده معتبر نیست', code: 'INVALID_UNIT' },
        { status: 400 }
      )
    }

    // ★ اعتبارسنجی قیمت‌ها
    const purchasePrice = Number(body.purchasePrice) || 0
    const salePrice = Number(body.salePrice) || 0
    const currentStock = Number(body.currentStock) || 0

    if (purchasePrice < 0) {
      return NextResponse.json(
        { success: false, error: 'قیمت خرید معتبر نیست', code: 'INVALID_PURCHASE_PRICE' },
        { status: 400 }
      )
    }

    if (salePrice <= 0) {
      return NextResponse.json(
        { success: false, error: 'قیمت فروش باید بزرگتر از صفر باشد', code: 'INVALID_SALE_PRICE' },
        { status: 400 }
      )
    }

    if (currentStock < 0) {
      return NextResponse.json(
        { success: false, error: 'موجودی محصول معتبر نیست', code: 'INVALID_STOCK' },
        { status: 400 }
      )
    }

    // ─── ۳. اگه categoryId ارسال شده، اعتبارسنجی ────────────
    if (body.categoryId && body.categoryId !== 'none') {
      const categoryExists = await tenantDb.category.findFirst({
        where: { id: body.categoryId, tenantId },
      })
      if (!categoryExists) {
        return NextResponse.json(
          { success: false, error: 'دسته‌بندی انتخاب شده معتبر نیست', code: 'INVALID_CATEGORY' },
          { status: 400 }
        )
      }
    }

    // ─── ۴. اگه کد محصول تغییر کرده، بررسی یکتایی ────────────
    let finalCode = body.code?.trim() || existing.code
    if (finalCode !== existing.code) {
      const duplicateCode = await tenantDb.product.findFirst({
        where: { code: finalCode, tenantId, NOT: { id: productId } },
      })
      if (duplicateCode) {
        return NextResponse.json(
          { success: false, error: 'کد محصول تکراری است', code: 'DUPLICATE_CODE' },
          { status: 400 }
        )
      }
    }

    // ─── ۵. ساخت updateData با همه فیلدها ───────────────────
    // ★★★ v3.9: حتماً unitId در updateData هست
    const updateData: any = {
      name: body.name.trim(),
      code: finalCode,
      barcode: body.barcode?.trim() || null,
      categoryId: body.categoryId && body.categoryId !== 'none' ? body.categoryId : null,
      unitId: body.unitId,  // ★★★ این خط مهم‌ترین تغییر هست
      purchasePrice,
      salePrice,
      taxRate: Number(body.taxRate) || 0,
      currentStock,
      minStock: 0,  // ★ v3.2: حذف شد
      isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
    }

    console.log('[Products PUT] updateData:', {
      unitId: updateData.unitId,
      categoryId: updateData.categoryId,
      name: updateData.name,
    })

    // ─── ۶. بروزرسانی محصول ────────────────────────────────
    const updatedProduct = await tenantDb.product.update({
      where: { id: productId },
      data: updateData,
      include: {
        category: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true, nameFa: true, symbol: true } },
      },
    })

    console.log('[Products PUT] Updated product:', {
      id: updatedProduct.id,
      name: updatedProduct.name,
      unitId: updatedProduct.unitId,
      unit: updatedProduct.unit,
    })

    return NextResponse.json({
      success: true,
      data: { product: updatedProduct },
      message: 'محصول با موفقیت بروزرسانی شد',
    })
  } catch (error: any) {
    console.error('[Products PUT] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در بروزرسانی محصول' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/products/[id] — حذف محصول
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    // ★★★ Next.js 16: params باید await بشه
    const params = await ctx.params
    const productId = params.id

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'شناسه محصول الزامی است' },
        { status: 400 }
      )
    }

    // ★ یافتن محصول
    const existing = await tenantDb.product.findFirst({
      where: { id: productId, tenantId },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'محصول یافت نشد' },
        { status: 404 }
      )
    }

    // ★★★ v3.2: جلوگیری از حذف محصول با موجودی > 0
    if (existing.currentStock > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `امکان حذف محصول با موجودی ${existing.currentStock} وجود ندارد. ابتدا موجودی را صفر کنید.`,
          code: 'HAS_STOCK',
        },
        { status: 400 }
      )
    }

    // ★ حذف محصول
    await tenantDb.product.delete({
      where: { id: productId },
    })

    console.log('[Products DELETE] Deleted product:', productId)

    return NextResponse.json({
      success: true,
      message: 'محصول با موفقیت حذف شد',
    })
  } catch (error: any) {
    console.error('[Products DELETE] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در حذف محصول' },
      { status: 500 }
    )
  }
})
