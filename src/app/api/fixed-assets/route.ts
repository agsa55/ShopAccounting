// src/app/api/fixed-assets/route.ts — v8.8
// ============================================================================
// مدیریت دارایی‌های ثابت + استهلاک
// ----------------------------------------------------------------------------
// این API امکان ثبت، مشاهده، ویرایش و حذف دارایی‌های ثابت را فراهم می‌کند.
// هر دارایی ثابت به‌صورت خودکار:
//   ۱. سند خرید دارایی صادر می‌کند
//   ۲. استهلاک ماهانه محاسبه و سند استهلاک صادر می‌کند
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  GET /api/fixed-assets — لیست دارایی‌های ثابت
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'all'

    const where: any = { tenantId }
    if (status !== 'all') where.status = status

    // ★★★ v8.8: پیدا کردن دیتابیس درست
    let useDb: any = null
    const tenantDb = tenant.tenantDb
    if (tenantDb && typeof tenantDb.fixedAsset !== 'undefined') {
      useDb = tenantDb
    } else if (db && (db as any).client && typeof (db as any).client.fixedAsset !== 'undefined') {
      useDb = (db as any).client
    } else if (db && typeof (db as any).fixedAsset !== 'undefined') {
      useDb = db
    }

    if (!useDb) {
      console.error('[FixedAssets GET] fixedAsset model not found in any db instance')
      return NextResponse.json({
        success: true,
        data: { assets: [] },
        message: 'مدل FixedAsset در Prisma Client یافت نشد. لطفاً npx prisma generate اجرا کنید.',
      })
    }

    const assets = await useDb.fixedAsset.findMany({
      where,
      orderBy: { purchaseDate: 'desc' },
    }).catch((err: any) => {
      console.error('[FixedAssets GET] query error:', err?.message)
      return []
    })

    return NextResponse.json({
      success: true,
      data: { assets },
    })
  } catch (error: any) {
    console.error('[FixedAssets GET] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری دارایی‌ها' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/fixed-assets — ثبت دارایی ثابت جدید
//  Body: {
//    name, code, category, purchasePrice, salvageValue, usefulLife,
//    purchaseDate, depreciationMethod, description?,
//  }
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id

    const body = await req.json()
    const {
      name,
      code,
      category = 'تجهیزات',
      purchasePrice,
      salvageValue = 0,
      usefulLife = 60,
      purchaseDate,
      depreciationMethod = 'straight_line',
      description,
    } = body

    // ★ اعتبارسنجی
    if (!name || !code || !purchasePrice) {
      return NextResponse.json(
        { success: false, error: 'نام، کد و بهای خرید الزامی است' },
        { status: 400 }
      )
    }
    if (typeof purchasePrice !== 'number' || purchasePrice <= 0) {
      return NextResponse.json(
        { success: false, error: 'بهای خرید باید بزرگتر از صفر باشد' },
        { status: 400 }
      )
    }
    if (typeof usefulLife !== 'number' || usefulLife < 1) {
      return NextResponse.json(
        { success: false, error: 'عمر مفید باید حداقل ۱ ماه باشد' },
        { status: 400 }
      )
    }

    // ★ محاسبه نرخ استهلاک ماهانه (روش خط مستقیم)
    const depreciableAmount = purchasePrice - salvageValue
    const monthlyDepreciation = depreciableAmount / usefulLife
    const depreciationRate = (monthlyDepreciation / purchasePrice) * 100

    // ★★★ v8.8: پیدا کردن دیتابیس درست
    let useDb: any = null
    if (tenantDb && typeof tenantDb.fixedAsset !== 'undefined') {
      useDb = tenantDb
    } else if (db && (db as any).client && typeof (db as any).client.fixedAsset !== 'undefined') {
      useDb = (db as any).client
    } else if (db && typeof (db as any).fixedAsset !== 'undefined') {
      useDb = db
    }

    if (!useDb) {
      return NextResponse.json(
        { success: false, error: 'مدل FixedAsset در Prisma Client یافت نشد. لطفاً npx prisma generate اجرا کنید.' },
        { status: 500 }
      )
    }

    const txClient = useDb.$transaction ? useDb : db

    const result = await txClient.$transaction(async (tx: any) => {
      // ۱. پیدا کردن حساب‌های مربوطه
      const accounts = await tx.account.findMany({ where: { tenantId } })
      const findAccountByCode = (code: string) => accounts.find((a: any) => a.code === code) || null

      const assetAccount = findAccountByCode('1400')  // تجهیزات
      // ★ حساب استهلاک انباشته: 1401 (اگه نیست، 1400)
      const accumDepAccount = findAccountByCode('1401') || assetAccount
      // ★ حساب هزینه استهلاک: 5150 (اگه نیست، 5100)
      const depExpenseAccount = findAccountByCode('5150') || findAccountByCode('5100')

      // ۲. ایجاد دارایی ثابت
      const asset = await tx.fixedAsset.create({
        data: {
          tenantId,
          name: name.trim(),
          code: code.trim(),
          category: category.trim(),
          purchasePrice,
          salvageValue,
          usefulLife,
          depreciationRate,
          accumulatedDepreciation: 0,
          bookValue: purchasePrice,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          depreciationStartDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          depreciationMethod,
          status: 'active',
          accountId: assetAccount?.id || null,
          accumDepAccountId: accumDepAccount?.id || null,
          depExpenseAccountId: depExpenseAccount?.id || null,
          description: description?.trim() || null,
        },
      })

      // ۳. صدور سند خرید دارایی
      if (assetAccount) {
        // پیدا کردن حساب بانک/صندوق
        const cashAccount = findAccountByCode('1010') || findAccountByCode('1100')

        if (cashAccount) {
          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

          const lines: any[] = [
            {
              accountId: assetAccount.id,
              debit: purchasePrice,
              credit: 0,
              description: `بدهکار: خرید دارایی ثابت — ${name}`,
            },
            {
              accountId: cashAccount.id,
              debit: 0,
              credit: purchasePrice,
              description: `بستانکار: پرداخت بابت ${name}`,
            },
          ]

          const journalEntry = await tx.journalEntry.create({
            data: {
              number: jeNumber,
              date: new Date(),
              description: `سند خرید دارایی ثابت — ${name}`,
              status: 'posted',
              sourceType: 'fixed_asset_purchase',
              sourceId: asset.id,
              totalDebit: purchasePrice,
              totalCredit: purchasePrice,
              createdBy: userId || null,
              tenantId,
              lines: { create: lines },
            },
          })

          await tx.fixedAsset.update({
            where: { id: asset.id },
            data: { journalEntryId: journalEntry.id },
          })
        }
      }

      return asset
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: `دارایی ثابت «${name}» با موفقیت ثبت شد`,
    })
  } catch (error: any) {
    console.error('[FixedAssets POST] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در ثبت دارایی ثابت' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/fixed-assets — ویرایش دارایی ثابت
//  Body: { id, action: 'edit', name, code, category, purchasePrice, ... }
// ═══════════════════════════════════════════════════════════════
export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (body.action !== 'edit' || !body.id) {
      return NextResponse.json(
        { success: false, error: 'درخواست نامعتبر' },
        { status: 400 }
      )
    }

    const asset = await tenantDb.fixedAsset.findFirst({
      where: { id: body.id, tenantId },
    })

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'دارایی یافت نشد' },
        { status: 404 }
      )
    }

    const purchasePrice = parseFloat(body.purchasePrice) || asset.purchasePrice
    const salvageValue = parseFloat(body.salvageValue) || 0
    const usefulLife = parseInt(body.usefulLife) || asset.usefulLife

    // ★ محاسبه مجدد استهلاک
    const depreciableAmount = purchasePrice - salvageValue
    const monthlyDepreciation = depreciableAmount / usefulLife
    const depreciationRate = (monthlyDepreciation / purchasePrice) * 100

    await tenantDb.fixedAsset.update({
      where: { id: asset.id },
      data: {
        name: body.name?.trim() || asset.name,
        code: body.code?.trim() || asset.code,
        category: body.category?.trim() || asset.category,
        purchasePrice,
        salvageValue,
        usefulLife,
        depreciationRate,
        bookValue: purchasePrice - asset.accumulatedDepreciation,
        description: body.description?.trim() || null,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'دارایی ویرایش شد',
    })
  } catch (error: any) {
    console.error('[FixedAssets PUT] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در ویرایش دارایی' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/fixed-assets — حذف دارایی ثابت
//  Query: id
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه الزامی است' },
        { status: 400 }
      )
    }

    const asset = await tenantDb.fixedAsset.findFirst({
      where: { id, tenantId },
    })

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'دارایی یافت نشد' },
        { status: 404 }
      )
    }

    // ابطال سند خرید (اگه وجود داره)
    if (asset.journalEntryId) {
      await tenantDb.journalEntry.update({
        where: { id: asset.journalEntryId },
        data: { status: 'cancelled', description: `ابطال شده — حذف دارایی ${asset.name}` },
      }).catch(() => {})
    }

    await tenantDb.fixedAsset.delete({ where: { id } })

    return NextResponse.json({
      success: true,
      message: 'دارایی ثابت حذف شد',
    })
  } catch (error: any) {
    console.error('[FixedAssets DELETE] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در حذف دارایی' },
      { status: 500 }
    )
  }
})
