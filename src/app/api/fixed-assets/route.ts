// src/app/api/fixed-assets/route.ts — v8.8.1 (اصلاح باگ Decimal و گارد امنیتی ویرایش)
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  GET /api/fixed-assets
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'all'

    const where: any = { tenantId }
    if (status !== 'all') where.status = status

    let useDb: any = tenant.tenantDb || (db as any).client || db
    if (!useDb?.fixedAsset) {
      return NextResponse.json({ success: true, data: { assets: [] } })
    }

    const assets = await useDb.fixedAsset.findMany({
      where,
      orderBy: { purchaseDate: 'desc' },
    }).catch(() => [])

    return NextResponse.json({ success: true, data: { assets } })
  } catch (error: any) {
    console.error('[FixedAssets GET] Error:', error?.message)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری دارایی‌ها' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/fixed-assets
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id
    const body = await req.json()

    const { name, code, category = 'تجهیزات', purchasePrice, salvageValue = 0, usefulLife = 60, purchaseDate, depreciationMethod = 'straight_line', description } = body

    if (!name || !code || !purchasePrice) {
      return NextResponse.json({ success: false, error: 'نام، کد و بهای خرید الزامی است' }, { status: 400 })
    }

    const price = Number(purchasePrice)
    const salvage = Number(salvageValue) || 0
    const life = Number(usefulLife) || 60

    if (price <= 0 || life < 1) {
      return NextResponse.json({ success: false, error: 'مقادیر عددی نامعتبر هستند' }, { status: 400 })
    }

    let useDb: any = tenantDb || (db as any).client || db
    const txClient = useDb.$transaction ? useDb : db

    const result = await txClient.$transaction(async (tx: any) => {
      const accounts = await tx.account.findMany({ where: { tenantId } })
      const findAccountByCode = (code: string) => accounts.find((a: any) => a.code === code) || null

      const assetAccount = findAccountByCode('1400')
      const accumDepAccount = findAccountByCode('1401') || assetAccount
      const depExpenseAccount = findAccountByCode('5150') || findAccountByCode('5100')

      const asset = await tx.fixedAsset.create({
        data: {
          tenantId, name: name.trim(), code: code.trim(), category: category.trim(),
          purchasePrice: price, salvageValue: salvage, usefulLife: life,
          depreciationRate: ((price - salvage) / life / price) * 100,
          accumulatedDepreciation: 0, bookValue: price,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          depreciationStartDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          depreciationMethod, status: 'active',
          accountId: assetAccount?.id || null,
          accumDepAccountId: accumDepAccount?.id || null,
          depExpenseAccountId: depExpenseAccount?.id || null,
          description: description?.trim() || null,
        },
      })

      // صدور سند خرید
      if (assetAccount) {
        const cashAccount = findAccountByCode('1010') || findAccountByCode('1100')
        if (cashAccount) {
          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

          const journalEntry = await tx.journalEntry.create({
            data: {
              number: jeNumber, date: new Date(),
              description: `سند خرید دارایی ثابت — ${name}`,
              status: 'posted', sourceType: 'fixed_asset_purchase', sourceId: asset.id,
              totalDebit: price, totalCredit: price, createdBy: userId || null, tenantId,
              lines: {
                create: [
                  { accountId: assetAccount.id, debit: price, credit: 0, description: `بدهکار: خرید دارایی ثابت ${name}` },
                  { accountId: cashAccount.id, debit: 0, credit: price, description: `بستانکار: پرداخت بابت ${name}` },
                ],
              },
            },
          })

          await tx.fixedAsset.update({ where: { id: asset.id }, data: { journalEntryId: journalEntry.id } })
        }
      }
      return asset
    })

    return NextResponse.json({ success: true, data: result, message: `دارایی ثابت «${name}» ثبت و سند آن صادر شد` })
  } catch (error: any) {
    console.error('[FixedAssets POST] Error:', error?.message)
    return NextResponse.json({ success: false, error: 'خطا در ثبت دارایی' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/fixed-assets (با گارد امنیتی حسابداری)
// ═══════════════════════════════════════════════════════════════
export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (body.action !== 'edit' || !body.id) {
      return NextResponse.json({ success: false, error: 'درخواست نامعتبر' }, { status: 400 })
    }

    const asset = await tenantDb.fixedAsset.findFirst({ where: { id: body.id, tenantId } })
    if (!asset) return NextResponse.json({ success: false, error: 'دارایی یافت نشد' }, { status: 404 })

    // ★★★ گارد امنیتی حسابداری: اگر استهلاک خورده، اجازه تغییر بهای خرید یا عمر مفید را نده
    if (Number(asset.accumulatedDepreciation) > 0) {
      if (body.purchasePrice || body.usefulLife) {
        return NextResponse.json(
          { success: false, error: 'تغییر بهای خرید یا عمر مفید داراییِ مستهلک‌شده مجاز نیست. برای اصلاح، از سند اصلاحی استفاده کنید.' },
          { status: 403 }
        )
      }
    }

    const purchasePrice = body.purchasePrice ? Number(body.purchasePrice) : Number(asset.purchasePrice)
    const salvageValue = body.salvageValue ? Number(body.salvageValue) : Number(asset.salvageValue)
    const usefulLife = body.usefulLife ? Number(body.usefulLife) : Number(asset.usefulLife)

    const depreciableAmount = purchasePrice - salvageValue
    const monthlyDepreciation = depreciableAmount / usefulLife
    const depreciationRate = (monthlyDepreciation / purchasePrice) * 100

    await tenantDb.fixedAsset.update({
      where: { id: asset.id },
      data: {
        name: body.name?.trim() || asset.name,
        code: body.code?.trim() || asset.code,
        category: body.category?.trim() || asset.category,
        purchasePrice, salvageValue, usefulLife, depreciationRate,
        bookValue: purchasePrice - Number(asset.accumulatedDepreciation),
        description: body.description?.trim() || null,
      },
    })

    return NextResponse.json({ success: true, message: 'دارایی با موفقیت ویرایش شد' })
  } catch (error: any) {
    console.error('[FixedAssets PUT] Error:', error?.message)
    return NextResponse.json({ success: false, error: 'خطا در ویرایش دارایی' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/fixed-assets
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ success: false, error: 'شناسه الزامی است' }, { status: 400 })

    const asset = await tenantDb.fixedAsset.findFirst({ where: { id, tenantId: tenant.tenantId } })
    if (!asset) return NextResponse.json({ success: false, error: 'دارایی یافت نشد' }, { status: 404 })

    // ابطال سند خرید در صورت وجود
    if (asset.journalEntryId) {
      await tenantDb.journalEntry.update({
        where: { id: asset.journalEntryId },
        data: { status: 'cancelled', description: `ابطال شده — حذف دارایی ${asset.name}` },
      }).catch(() => {})
    }

    await tenantDb.fixedAsset.delete({ where: { id } })
    return NextResponse.json({ success: true, message: 'دارایی ثابت و سند مرتبط آن ابطال شد' })
  } catch (error: any) {
    console.error('[FixedAssets DELETE] Error:', error?.message)
    return NextResponse.json({ success: false, error: 'خطا در حذف دارایی' }, { status: 500 })
  }
})