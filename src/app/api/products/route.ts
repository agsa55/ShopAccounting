// ============================================================================
// src/app/api/products/route.ts — GET (صفحه‌بندی + جستجو) / POST / PUT / DELETE
// ============================================================================
// ★★★ v6.2: هنگام ایجاد محصول با موجودی اولیه، یک StockLevel در انبار پیش‌فرض ساخته می‌شود
// ★★★ v6.1: افزودن صفحه‌بندی و جستجوی سرور
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  GET /api/products — صفحه‌بندی + جستجو
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)

     // ★★★ v8.9: دریافت کد بعدی
      const action = searchParams.get('action')
      if (action === 'nextCode') {
        const count = await tenantDb.product.count({ where: { tenantId } })
        let attempts = 0
        let nextCode = ''
        do {
          nextCode = `PRD-${(count + attempts + 1).toString().padStart(6, '0')}`
          const existing = await tenantDb.product.findFirst({
            where: { tenantId, code: nextCode },
          })
          if (!existing) break
          attempts++
        } while (attempts < 100)
        return NextResponse.json({ success: true, data: { code: nextCode } })
      }

    // ★★★ v6.1: صفحه‌بندی
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const search = searchParams.get('search') || ''
    const categoryId = searchParams.get('categoryId') || ''
    const activeOnly = searchParams.get('activeOnly') === 'true'
    const sort = searchParams.get('sort') || 'recent'

    // ★ ساخت شرط
    const where: any = { tenantId }
    if (activeOnly) where.isActive = true
    if (categoryId && categoryId !== 'all') where.categoryId = categoryId
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { barcode: { contains: search } },
      ]
    }

    // ★ مرتب‌سازی
    let orderBy: any = { createdAt: 'desc' }
    if (sort === 'name') orderBy = { name: 'asc' }
    else if (sort === 'price') orderBy = { salePrice: 'desc' }
    else if (sort === 'stock') orderBy = { currentStock: 'asc' }

    const [products, total] = await Promise.all([
      tenantDb.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true, nameFa: true, symbol: true } },
        },
      }),
      tenantDb.product.count({ where }),
    ])

    console.log(`[Products GET] Returning ${products.length} products (page ${page}/${Math.ceil(total / limit)}), tenantId: ${tenantId}`)

    return NextResponse.json({
      success: true,
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    console.error('[Products GET] Error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری محصولات' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
// POST /api/products — ایجاد محصول
// ★★★ v8.9: تولید کد اتوماتیک + تولید بارکد
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('products')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const body = await req.json()

      if (!body.name) {
        return NextResponse.json(
          { success: false, error: 'نام محصول الزامی است' },
          { status: 400 }
        )
      }

      // ★★★ v8.9: تولید کد اتوماتیک اگر کد ارسال نشده باشد
      let productCode = body.code?.trim()
      if (!productCode) {
        const productCount = await tenantDb.product.count({ where: { tenantId } })
        // ★ تولید کد یکتا
        let attempts = 0
        do {
          productCode = `PRD-${(productCount + attempts + 1)
            .toString()
            .padStart(6, '0')}`
          const existingCode = await tenantDb.product.findFirst({
            where: { tenantId, code: productCode },
          })
          if (!existingCode) break
          attempts++
        } while (attempts < 100)
      }

      // ★ بررسی تکراری نبودن کد
      const existing = await tenantDb.product.findFirst({
        where: { tenantId, code: productCode },
      })
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'کد محصول تکراری است' },
          { status: 400 }
        )
      }

      // ★★★ v8.9: تولید بارکد EAN-13 اگر درخواست شده باشد
      let barcodeValue = body.barcode ? String(body.barcode).trim() : null
      if (body.generateBarcode && !barcodeValue) {
        // تولید بارکد یکتا
        let barcodeAttempts = 0
        do {
          const timestamp = Date.now().toString().slice(-4)
          const random = Math.floor(Math.random() * 100)
            .toString()
            .padStart(2, '0')
          const barcode12 = '629123' + timestamp + random

          // محاسبه check digit
          let sum = 0
          for (let i = 0; i < 12; i++) {
            const digit = parseInt(barcode12[i])
            const multiplier = i % 2 === 0 ? 1 : 3
            sum += digit * multiplier
          }
          const checkDigit = (10 - (sum % 10)) % 10
          barcodeValue = barcode12 + checkDigit.toString()

          // بررسی یکتایی بارکد
          const existingBarcode = await tenantDb.product.findFirst({
            where: { tenantId, barcode: barcodeValue },
          })
          if (!existingBarcode) break

          barcodeAttempts++
          // تأخیر کوچک برای تضمین یکتایی timestamp
          await new Promise((r) => setTimeout(r, 2))
        } while (barcodeAttempts < 10)
      }

      const initialStock = 0
      const purchasePrice = parseFloat(body.purchasePrice) || 0

      const product = await tenantDb.product.create({
        data: {
          tenantId,
          code: productCode,
          name: String(body.name).trim(),
          barcode: barcodeValue,
          categoryId:
            body.categoryId && body.categoryId !== 'none'
              ? body.categoryId
              : null,
          unitId:
            body.unitId && body.unitId !== 'none' ? body.unitId : null,
          purchasePrice,
          salePrice: parseFloat(body.salePrice) || 0,
          taxRate: parseFloat(body.taxRate) || 0,
          currentStock: initialStock,
          minStock: parseFloat(body.minStock) || 0,
          isActive: body.isActive !== false,
        },
      })

      return NextResponse.json({ success: true, data: product }, { status: 201 })
    } catch (error: any) {
      console.error('[Products POST] Error:', error?.message || error)
      return NextResponse.json(
        { success: false, error: error?.message || 'خطا در ایجاد محصول' },
        { status: 500 }
      )
    }
  }
)

// ★★★ v8.9: Endpoint جدید برای دریافت کد اتوماتیک
// GET /api/products?action=nextCode
// (اضافه شده به ابتدای تابع GET موجود)

// ═══════════════════════════════════════════════════════════════
//  PUT /api/products — به‌روزرسانی محصول
//  ★★★ v6.2: فیلد currentStock در ویرایش قابل تغییر نیست (فقط از طریق فاکتور خرید/فروش)
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('products')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (!body.id) {
      return NextResponse.json({ success: false, error: 'شناسه محصول الزامی است' }, { status: 400 })
    }

    const existing = await tenantDb.product.findFirst({ where: { id: body.id, tenantId } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'محصول یافت نشد' }, { status: 404 })
    }

    // ★ بررسی تکراری نبودن کد
    if (body.code && body.code !== existing.code) {
      const dup = await tenantDb.product.findFirst({
        where: { tenantId, code: body.code, NOT: { id: body.id } },
      })
      if (dup) {
        return NextResponse.json({ success: false, error: 'کد محصول تکراری است' }, { status: 400 })
      }
    }

    const data: any = {}
    if (body.code !== undefined) data.code = String(body.code).trim()
    if (body.name !== undefined) data.name = String(body.name).trim()
    if (body.barcode !== undefined) data.barcode = body.barcode ? String(body.barcode).trim() : null
    if (body.categoryId !== undefined) data.categoryId = (body.categoryId && body.categoryId !== 'none') ? body.categoryId : null
    if (body.unitId !== undefined) data.unitId = (body.unitId && body.unitId !== 'none') ? body.unitId : null
    if (body.purchasePrice !== undefined) data.purchasePrice = parseFloat(body.purchasePrice) || 0
    if (body.salePrice !== undefined) data.salePrice = parseFloat(body.salePrice) || 0
    if (body.taxRate !== undefined) data.taxRate = parseFloat(body.taxRate) || 0
    if (body.minStock !== undefined) data.minStock = parseFloat(body.minStock) || 0
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive)
    // ★★★ v6.2: currentStock در ویرایش قابل تغییر نیست (فقط از طریق فاکتور)
    // اگر فرانت‌اند آن را فرستاد، نادیده می‌گیریم

    const product = await tenantDb.product.update({ where: { id: body.id }, data })

    return NextResponse.json({ success: true, data: product })
  } catch (error: any) {
    console.error('[Products PUT] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: error?.message || 'خطا در ویرایش محصول' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/products — حذف محصول (soft delete: isActive = false)
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('products')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه محصول الزامی است' }, { status: 400 })
    }

    const existing = await tenantDb.product.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'محصول یافت نشد' }, { status: 404 })
    }

    // ★ بررسی وجود فاکتور برای محصول (جلوگیری از حذف اگر فاکتور دارد)
    const invoiceCount = await tenantDb.invoiceItem.count({
      where: { productId: id, invoice: { tenantId } },
    }).catch(() => 0)

    const purchaseInvoiceCount = await tenantDb.purchaseInvoiceItem.count({
      where: { productId: id, purchaseInvoice: { tenantId } },
    }).catch(() => 0)

    if (invoiceCount > 0 || purchaseInvoiceCount > 0) {
      // ★ soft delete: غیرفعال کن تا تاریخچه حفظ شود
      await tenantDb.product.update({
        where: { id },
        data: { isActive: false },
      })
      return NextResponse.json({
        success: true,
        message: 'محصول دارای فاکتور است و به‌صورت غیرفعال درآمد',
      })
    }

    // ★ حذف StockLevel ها و StockMovement ها هم (در صورت عدم وجود فاکتور)
    await tenantDb.stockLevel.deleteMany({ where: { productId: id, tenantId } }).catch(() => {})
    await tenantDb.stockMovement.deleteMany({ where: { productId: id, tenantId } }).catch(() => {})

    await tenantDb.product.delete({ where: { id } })

    return NextResponse.json({
      success: true,
      message: 'محصول با موفقیت حذف شد',
    })
  } catch (error: any) {
    console.error('[Products DELETE] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: error?.message || 'خطا در حذف محصول' }, { status: 500 })
  }
})
