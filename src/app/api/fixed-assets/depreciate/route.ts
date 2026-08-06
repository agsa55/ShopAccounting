// src/app/api/fixed-assets/depreciate/route.ts — v8.8.1 (اصلاح باگ Decimal و منطق ماه‌های عقب‌افتاده)
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id

    const body = await req.json().catch(() => ({}))
    const { assetId } = body

    const where: any = { tenantId, status: 'active' }
    if (assetId) where.id = assetId

    const assets = await tenantDb.fixedAsset.findMany({ where })

    if (assets.length === 0) {
      return NextResponse.json({
        success: true, data: { processed: 0, totalDepreciation: 0 },
        message: 'هیچ دارایی فعالی برای استهلاک وجود ندارد',
      })
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client
    let totalProcessed = 0
    let totalDepreciationAmount = 0
    const journalEntries: string[] = []

    for (const asset of assets) {
      // ★★★ تبدیل صریح به Number برای جلوگیری از باگ Prisma Decimal
      const purchasePrice = Number(asset.purchasePrice)
      const salvageValue = Number(asset.salvageValue) || 0
      const usefulLife = Number(asset.usefulLife) || 60
      const currentAccumDep = Number(asset.accumulatedDepreciation) || 0

      const lastDepDate = asset.lastDepreciationDate || asset.depreciationStartDate
      const now = new Date()
      
      // محاسبه دقیق ماه‌های گذشته
      const monthsPassed = Math.floor(
        (now.getFullYear() - lastDepDate.getFullYear()) * 12 +
        (now.getMonth() - lastDepDate.getMonth())
      )

      if (monthsPassed <= 0) continue

      const depreciableAmount = purchasePrice - salvageValue
      const monthlyDepreciation = depreciableAmount / usefulLife
      
      // مبلغ کل استهلاک برای ماه‌های گذشته
      const calculatedDepreciation = monthlyDepreciation * monthsPassed
      
      // ★★★ جلوگیری از استهلاک بیش از حد (سقف مجاز)
      const remainingDepreciable = depreciableAmount - currentAccumDep
      const actualDepreciation = Math.min(calculatedDepreciation, remainingDepreciable)

      if (actualDepreciation <= 0.01) { // آستانه خطای اعشار
        await tenantDb.fixedAsset.update({
          where: { id: asset.id },
          data: { status: 'fully_depreciated', bookValue: salvageValue },
        }).catch(() => {})
        continue
      }

      const newAccumDep = currentAccumDep + actualDepreciation
      const newBookValue = purchasePrice - newAccumDep

      await txClient.$transaction(async (tx: any) => {
        if (asset.depExpenseAccountId && asset.accumDepAccountId) {
          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

          const lines: any[] = [
            {
              accountId: asset.depExpenseAccountId,
              debit: actualDepreciation,
              credit: 0,
              description: `بدهکار: هزینه استهلاک ${asset.name} (${monthsPassed} ماه)`,
            },
            {
              accountId: asset.accumDepAccountId,
              debit: 0,
              credit: actualDepreciation,
              description: `بستانکار: استهلاک انباشته ${asset.name}`,
            },
          ]

          const journalEntry = await tx.journalEntry.create({
            data: {
              number: jeNumber,
              date: now,
              description: `سند استهلاک ${monthsPassed > 1 ? 'عقب‌افتاده' : 'ماهانه'} — ${asset.name}`,
              status: 'posted',
              sourceType: 'depreciation',
              sourceId: asset.id,
              totalDebit: actualDepreciation,
              totalCredit: actualDepreciation,
              createdBy: userId || null,
              tenantId,
              lines: { create: lines },
            },
          })
          journalEntries.push(journalEntry.id)
        }

        await tx.fixedAsset.update({
          where: { id: asset.id },
          data: {
            accumulatedDepreciation: newAccumDep,
            bookValue: newBookValue,
            lastDepreciationDate: now,
            status: newBookValue <= salvageValue ? 'fully_depreciated' : 'active',
          },
        })

        totalProcessed++
        totalDepreciationAmount += actualDepreciation
      })
    }

    return NextResponse.json({
      success: true,
      data: { processed: totalProcessed, totalDepreciation: totalDepreciationAmount, journalEntries: journalEntries.length },
      message: totalProcessed > 0
        ? `${totalProcessed} دارایی استهلاک شد — مجموع: ${totalDepreciationAmount.toLocaleString('fa-IR')} ریال`
        : 'هیچ استهلاک جدیدی محاسبه نشد (احتمالاً همه به سقف رسیده‌اند)',
    })
  } catch (error: any) {
    console.error('[Depreciation POST] Error:', error?.message)
    return NextResponse.json({ success: false, error: 'خطا در محاسبه استهلاک' }, { status: 500 })
  }
})