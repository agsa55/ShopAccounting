// src/app/api/stock-counts/[id]/approve/route.ts
// ShopAccounting v6.5 — Stock Count Approval API
// ============================================================================
// ★★★ این مهم‌ترین API انبار گردانی است:
//   1. موجودی StockLevel را با مقدار شمرده‌شده به‌روز می‌کند
//   2. StockMovement برای هر اختلاف ثبت می‌کند (نوع: adjustment)
//   3. سند حسابداری خودکار ثبت می‌کند:
//      - کمبود → بدهکار «کسری/هزینه انبار» / بستانکار «موجودی کالا»
//      - مازاد → بدهکار «موجودی کالا» / بستانکار «مازاد/درآمد انبار»
//   4. وضعیت سند را به completed تغییر می‌دهد
//   5. در صورت خطا، rollback کامل (transaction)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  POST /api/stock-counts/[id]/approve — تأیید و ثبت نهایی
//  Body: { notes?: string }
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    const paramsObj = ctx.params && typeof ctx.params?.then === 'function'
      ? await ctx.params
      : ctx.params
    const id = paramsObj?.id

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه الزامی است' }, { status: 400 })
    }

    // ★ گرفتن سند با آیتم‌ها
    const stockCount = await tenantDb.stockCount.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            Product: { select: { id: true, name: true, code: true } },
          },
        },
        Warehouse: { select: { id: true, name: true } },
      },
    })

    if (!stockCount) {
      return NextResponse.json({ success: false, error: 'سند یافت نشد' }, { status: 404 })
    }

    // ★ فقط اسناد draft یا in_progress قابل تأیید هستند
    if (stockCount.status === 'completed') {
      return NextResponse.json({
        success: false,
        error: 'این سند قبلاً تأیید شده است',
      }, { status: 400 })
    }
    if (stockCount.status === 'cancelled') {
      return NextResponse.json({
        success: false,
        error: 'سند لغو‌شده قابل تأیید نیست',
      }, { status: 400 })
    }

    // ★ فیلتر آیتم‌هایی که اختلاف دارند (difference ≠ 0)
    const itemsWithDifference = stockCount.items.filter((item: any) => item.difference !== 0)

    if (itemsWithDifference.length === 0) {
      // ★ هیچ اختلافی نیست — فقط وضعیت را completed کن
      await tenantDb.stockCount.update({
        where: { id },
        data: {
          status: 'completed',
          approvedBy: tenant.user?.id || null,
          approvedAt: new Date(),
          notes: body.notes || stockCount.notes,
        },
      })

      return NextResponse.json({
        success: true,
        message: 'سند تأیید شد — هیچ اختلافی وجود نداشت',
        data: { id, status: 'completed', totalDifference: 0 },
      })
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    const result = await txClient.$transaction(async (tx: any) => {
      let totalShortage = 0  // جمع کمبود (مثبت)
      let totalSurplus = 0   // جمع مازاد (مثبت)

      // ═══════════════════════════════════════════════════════════════
      //  مرحله ۱: به‌روزرسانی StockLevel و ثبت StockMovement
      // ═══════════════════════════════════════════════════════════════
      for (const item of itemsWithDifference) {
        // ★ به‌روزرسانی StockLevel
        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: stockCount.warehouseId,
              productId: item.productId,
            },
          },
        }).catch(() => null)

        if (!stockLevel) {
          // ★ اگه StockLevel وجود نداشت، ایجاد کن با countedQty
          await tx.stockLevel.create({
            data: {
              tenantId,
              warehouseId: stockCount.warehouseId,
              productId: item.productId,
              quantity: item.countedQty,
              averageCost: item.unitCost,
            },
          })
        } else {
          // ★ به‌روزرسانی quantity به countedQty
          await tx.stockLevel.update({
            where: { id: stockLevel.id },
            data: { quantity: item.countedQty },
          })
        }

        // ★ به‌روزرسانی Product.currentStock (برای سازگاری با کد قدیمی)
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: item.countedQty },
        }).catch(() => {})

        // ★ ثبت StockMovement (نوع: adjustment)
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            fromWarehouseId: item.difference < 0 ? stockCount.warehouseId : null, // کمبود → خروج
            toWarehouseId: item.difference > 0 ? stockCount.warehouseId : null,   // مازاد → ورود
            quantity: Math.abs(item.difference),
            unitCost: item.unitCost,
            movementType: 'adjustment',
            referenceType: 'stock_count',
            referenceId: stockCount.id,
            description: `انبار گردانی ${stockCount.number} — ${item.Product.name} — ${item.difference > 0 ? 'مازاد' : 'کمبود'} ${Math.abs(item.difference)}`,
          },
        })

        // ★ جمع‌بندی مالی
        if (item.difference < 0) {
          totalShortage += Math.abs(item.differenceAmount)
        } else {
          totalSurplus += item.differenceAmount
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  مرحله ۲: ایجاد سند حسابداری خودکار
      // ═══════════════════════════════════════════════════════════════
      let journalEntryId: string | null = null

      if (totalShortage > 0 || totalSurplus > 0) {
        // ★ پیدا کردن account‌های مربوطه
        let inventoryAccountId: string | null = null
        let shortageAccountId: string | null = null  // کسری/هزینه انبار
        let surplusAccountId: string | null = null   // مازاد/درآمد انبار

        try {
          const accounts = await tx.account.findMany({ where: { tenantId } })
          for (const acc of accounts) {
            const code = (acc.code || '').toLowerCase()
            const type = (acc.type || '').toLowerCase()
            const name = (acc.name || '').toLowerCase()

            // ★ موجودی کالا (کد 120 یا type=inventory)
            if (!inventoryAccountId && (type === 'inventory' || code.startsWith('120') || name.includes('موجودی') || name.includes('انبار') || name.includes('کالا'))) {
              inventoryAccountId = acc.id
            }
            // ★ کسری/هزینه انبار (کد 5xx یا name شامل کسری/هزینه)
            if (!shortageAccountId && (code.startsWith('51') || code.startsWith('52') || name.includes('کسری') || name.includes('هزینه انبار') || name.includes('ضایعات'))) {
              shortageAccountId = acc.id
            }
            // ★ مازاد/درآمد انبار (کد 4xx یا name شامل مازاد)
            if (!surplusAccountId && (code.startsWith('42') || code.startsWith('49') || name.includes('مازاد') || name.includes('درآمد انبار') || name.includes('سایر درآمدها'))) {
              surplusAccountId = acc.id
            }
          }
        } catch (err: any) {
          console.warn('[StockCount Approve] Could not find accounts:', err?.message)
        }

        // ★ ساخت خطوط سند
        const lines: any[] = []
        const jeNumber = `JE-${(await tx.journalEntry.count({ where: { tenantId } }) + 1).toString().padStart(6, '0')}`

        // ★ کمبود: بدهکار هزینه/کسری، بستانکار موجودی کالا
        if (totalShortage > 0 && shortageAccountId && inventoryAccountId) {
          lines.push({
            accountId: shortageAccountId,
            debit: totalShortage,
            credit: 0,
            description: `بدهکار: کسری انبار (انبار گردانی ${stockCount.number})`,
          })
          lines.push({
            accountId: inventoryAccountId,
            debit: 0,
            credit: totalShortage,
            description: `بستانکار: کاهش موجودی کالا (کسری)`,
          })
        }

        // ★ مازاد: بدهکار موجودی کالا، بستانکار درآمد/مازاد
        if (totalSurplus > 0 && surplusAccountId && inventoryAccountId) {
          lines.push({
            accountId: inventoryAccountId,
            debit: totalSurplus,
            credit: 0,
            description: `بدهکار: افزایش موجودی کالا (مازاد)`,
          })
          lines.push({
            accountId: surplusAccountId,
            debit: 0,
            credit: totalSurplus,
            description: `بستانکار: مازاد انبار (انبار گردانی ${stockCount.number})`,
          })
        }

        // ★ ایجاد سند اگر خطوط کافی داریم
        if (lines.length >= 2) {
          const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0)
          const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0)

          const journalEntry = await tx.journalEntry.create({
            data: {
              number: jeNumber,
              date: new Date(),
              description: `سند خودکار انبار گردانی ${stockCount.number} — انبار ${stockCount.Warehouse.name}`,
              status: 'posted',
              sourceType: 'stock_count',
              sourceId: stockCount.id,
              totalDebit,
              totalCredit,
              createdBy: tenant.user?.id || null,
              tenantId,
              lines: { create: lines },
            },
          })

          journalEntryId = journalEntry.id
        } else {
          console.warn('[StockCount Approve] حساب‌های مناسب برای سند پیدا نشد — سند ایجاد نشد')
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  مرحله ۳: به‌روزرسانی وضعیت سند
      // ═══════════════════════════════════════════════════════════════
      const updated = await tx.stockCount.update({
        where: { id },
        data: {
          status: 'completed',
          approvedBy: tenant.user?.id || null,
          approvedAt: new Date(),
          notes: body.notes || stockCount.notes,
          journalEntryId,
        },
      })

      return {
        stockCount: updated,
        totalShortage,
        totalSurplus,
        journalEntryId,
        itemsAdjusted: itemsWithDifference.length,
      }
    })

    console.log(`[StockCount Approve] سند ${stockCount.number} تأیید شد — کمبود: ${result.totalShortage}, مازاد: ${result.totalSurplus}, آیتم‌های تنظیم‌شده: ${result.itemsAdjusted}`)

    return NextResponse.json({
      success: true,
      data: result,
      message: `سند انبار گردانی ${stockCount.number} تأیید شد — ${result.itemsAdjusted} آیتم تنظیم شد${result.journalEntryId ? ' + سند حسابداری ثبت شد' : ''}`,
    })
  } catch (error: any) {
    console.error('[StockCount Approve] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'خطا در تأیید سند',
    }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/stock-counts/[id]/cancel — لغو سند (با query ?action=cancel)
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const paramsObj = ctx.params && typeof ctx.params?.then === 'function'
      ? await ctx.params
      : ctx.params
    const id = paramsObj?.id

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه الزامی است' }, { status: 400 })
    }

    const existing = await tenantDb.stockCount.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'سند یافت نشد' }, { status: 404 })
    }

    if (existing.status === 'completed') {
      return NextResponse.json({
        success: false,
        error: 'سند تأیید شده قابل لغو نیست (نیاز به سند برگشت‌ از حساب دارد)',
      }, { status: 400 })
    }

    await tenantDb.stockCount.update({
      where: { id },
      data: { status: 'cancelled' },
    })

    return NextResponse.json({ success: true, message: 'سند لغو شد' })
  } catch (error: any) {
    console.error('[StockCount Cancel] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در لغو سند' }, { status: 500 })
  }
})
