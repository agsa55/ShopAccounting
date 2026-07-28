// src/app/api/fixed-assets/depreciate/route.ts — v8.8
// ============================================================================
// محاسبه و صدور سند استهلاک ماهانه دارایی‌های ثابت
// ----------------------------------------------------------------------------
// این API برای هر دارایی ثابت فعال:
//   ۱. تعداد ماه‌های گذشته از آخرین استهلاک را محاسبه می‌کند
//   ۲. مبلغ استهلاک را محاسبه می‌کند
//   ۳. سند استهلاک صادر می‌کند
//   ۴. accumulatedDepreciation و bookValue را به‌روزرسانی می‌کند
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  POST /api/fixed-assets/depreciate — محاسبه استهلاک همه دارایی‌ها
//  Body: { assetId? }  // اگه assetId داده نشه، همه دارایی‌ها
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id

    const body = await req.json().catch(() => ({}))
    const { assetId } = body

    // ★ پیدا کردن دارایی‌های فعال
    const where: any = { tenantId, status: 'active' }
    if (assetId) where.id = assetId

    const assets = await tenantDb.fixedAsset.findMany({ where })

    if (assets.length === 0) {
      return NextResponse.json({
        success: true,
        data: { processed: 0, totalDepreciation: 0 },
        message: 'هیچ دارایی فعالی برای استهلاک وجود ندارد',
      })
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client
    let totalProcessed = 0
    let totalDepreciationAmount = 0
    const journalEntries: string[] = []

    for (const asset of assets) {
      // ★ محاسبه تعداد ماه‌های گذشته
      const lastDepDate = asset.lastDepreciationDate || asset.depreciationStartDate
      const now = new Date()
      const monthsPassed = Math.floor(
        (now.getFullYear() - lastDepDate.getFullYear()) * 12 +
        (now.getMonth() - lastDepDate.getMonth())
      )

      if (monthsPassed <= 0) continue  // هنوز وقت استهلاک نیست

      // ★ محاسبه مبلغ استهلاک
      const depreciableAmount = asset.purchasePrice - asset.salvageValue
      const monthlyDepreciation = depreciableAmount / asset.usefulLife
      const depreciationAmount = monthlyDepreciation * monthsPassed

      // ★ بررسی اینکه آیا دارایی کاملاً مستهلک شده
      const newAccumDep = asset.accumulatedDepreciation + depreciationAmount
      const actualDepreciation = Math.min(depreciationAmount, depreciableAmount - asset.accumulatedDepreciation)

      if (actualDepreciation <= 0) {
        // دارایی کاملاً مستهلک شده
        await tenantDb.fixedAsset.update({
          where: { id: asset.id },
          data: { status: 'fully_depreciated' },
        }).catch(() => {})
        continue
      }

      const newBookValue = asset.purchasePrice - newAccumDep

      await txClient.$transaction(async (tx: any) => {
        // ۱. صدور سند استهلاک
        if (asset.depExpenseAccountId && asset.accumDepAccountId) {
          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

          const lines: any[] = [
            {
              accountId: asset.depExpenseAccountId,
              debit: actualDepreciation,
              credit: 0,
              description: `بدهکار: هزینه استهلاک ${asset.name} — ${monthsPassed} ماه`,
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
              date: new Date(),
              description: `سند استهلاک — ${asset.name} (${monthsPassed} ماه)`,
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

        // ۲. به‌روزرسانی دارایی
        await tx.fixedAsset.update({
          where: { id: asset.id },
          data: {
            accumulatedDepreciation: newAccumDep,
            bookValue: newBookValue,
            lastDepreciationDate: new Date(),
            status: newBookValue <= asset.salvageValue ? 'fully_depreciated' : 'active',
          },
        })

        totalProcessed++
        totalDepreciationAmount += actualDepreciation
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        processed: totalProcessed,
        totalDepreciation: totalDepreciationAmount,
        journalEntries: journalEntries.length,
      },
      message: totalProcessed > 0
        ? `${totalProcessed} دارایی استهلاک شد — مجموع: ${totalDepreciationAmount.toLocaleString('fa-IR')} ریال`
        : 'هیچ دارایی برای استهلاک وجود ندارد',
    })
  } catch (error: any) {
    console.error('[Depreciation POST] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در محاسبه استهلاک' },
      { status: 500 }
    )
  }
})
