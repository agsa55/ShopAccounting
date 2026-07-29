// src/app/api/stock-counts/[id]/route.ts — v6.6.0 ★★★ ACCOUNT FIX
// ============================================================================
// ★★★ v6.6.0 تغییرات:
//   ★ استفاده از getStandardAccountIds (auto-seed) به‌جای manual lookup
//   ★ استفاده از expense accounts صحیح:
//     - کمبود (shortage): 5100 هزینه‌های اداری (یا حساب کسری انبار اگه موجود باشه)
//     - مازاد (surplus): 4900 سایر درآمدها (یا 4200 درآمد خدمات)
//   ★ تاریخ JE = تاریخ انبارگردانی
//   ★ fallback به 5100/4900 اگه حساب‌های کسری/مازاد موجود نبودند
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'

// ═══════════════════════════════════════════════════════════════
//  GET /api/stock-counts/[id] — جزئیات سند
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    // ★ Next.js 16: params یک Promise است
    const paramsObj = ctx.params && typeof ctx.params?.then === 'function'
      ? await ctx.params
      : ctx.params
    const id = paramsObj?.id

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه الزامی است' }, { status: 400 })
    }

    let stockCount: any = null
    try {
      stockCount = await tenantDb.stockCount.findFirst({
        where: { id, tenantId },
        include: {
          items: {
            include: {
              Product: {
                select: {
                  id: true, name: true, code: true, barcode: true,
                  unit: { select: { nameFa: true, symbol: true } },
                },
              },
            },
            orderBy: { Product: { name: 'asc' } },
          },
          Warehouse: { select: { id: true, name: true, code: true } },
        },
      })
    } catch (err: any) {
      console.warn('[StockCounts GET id] Query failed:', err?.message)
      return NextResponse.json({
        success: false,
        error: 'سند یافت نشد یا مدل‌ها migrate نشده‌اند',
      }, { status: 404 })
    }

    if (!stockCount) {
      return NextResponse.json({ success: false, error: 'سند یافت نشد' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: stockCount })
  } catch (error: any) {
    console.error('[StockCounts GET id] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری سند' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/stock-counts/[id] — به‌روزرسانی آیتم‌ها
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
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

    const existing = await tenantDb.stockCount.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'سند یافت نشد' }, { status: 404 })
    }

    if (existing.status === 'completed') {
      return NextResponse.json({
        success: false,
        error: 'سند تأیید شده قابل ویرایش نیست. برای ویرایش، ابتدا آن را لغو کنید.',
      }, { status: 400 })
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    const result = await txClient.$transaction(async (tx: any) => {
      const updateData: any = {}
      if (body.status) updateData.status = body.status
      if (body.notes !== undefined) updateData.notes = body.notes
      updateData.updatedAt = new Date()

      if (body.items && Array.isArray(body.items)) {
        let totalDifference = 0
        let totalItems = 0

        for (const item of body.items) {
          const stockLevel = await tx.stockLevel.findUnique({
            where: { warehouseId_productId: { warehouseId: existing.warehouseId, productId: item.productId } },
          }).catch(() => null)

          const product = await tx.product.findUnique({ where: { id: item.productId } }).catch(() => null)

          const systemQty = stockLevel?.quantity || 0
          const unitCost = stockLevel?.averageCost || product?.purchasePrice || 0
          const countedQty = parseFloat(item.countedQty) || 0
          const difference = countedQty - systemQty
          const differenceAmount = difference * unitCost

          totalDifference += differenceAmount
          totalItems++

          if (item.id) {
            await tx.stockCountItem.update({
              where: { id: item.id },
              data: {
                countedQty,
                difference,
                differenceAmount,
                reason: item.reason || null,
              },
            })
          } else {
            await tx.stockCountItem.create({
              data: {
                stockCountId: id,
                productId: item.productId,
                systemQty,
                countedQty,
                difference,
                unitCost,
                differenceAmount,
                reason: item.reason || null,
              },
            })
          }
        }

        updateData.totalDifference = totalDifference
        updateData.totalItems = totalItems
      }

      await tx.stockCount.update({ where: { id }, data: updateData })

      return await tx.stockCount.findFirst({
        where: { id },
        include: { items: { include: { Product: { select: { name: true, code: true } } } } },
      })
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: 'سند انبار گردانی به‌روزرسانی شد',
    })
  } catch (error: any) {
    console.error('[StockCounts PUT] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'خطا در به‌روزرسانی سند',
    }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/stock-counts/[id] — حذف سند (فقط draft)
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
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

    if (existing.status !== 'draft') {
      return NextResponse.json({
        success: false,
        error: 'فقط اسناد پیش‌نویس قابل حذف هستند',
      }, { status: 400 })
    }

    await tenantDb.stockCount.delete({ where: { id } })

    return NextResponse.json({ success: true, message: 'سند حذف شد' })
  } catch (error: any) {
    console.error('[StockCounts DELETE] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در حذف سند' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/stock-counts/[id] — تأیید و ثبت نهایی
//  Body: { action: 'approve', notes?: string } یا { action: 'cancel' }
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

    const action = body.action || 'approve'

    // ═══════════════════════════════════════════════════════════════
    //  لغو سند
    // ═══════════════════════════════════════════════════════════════
    if (action === 'cancel') {
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
    }

    // ═══════════════════════════════════════════════════════════════
    //  تأیید و ثبت نهایی
    // ═══════════════════════════════════════════════════════════════
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

    // ★★★ v6.6.0: گرفتن حساب‌های استاندارد با auto-seed
    await getStandardAccountIds(tenantId).catch(() => ({} as any))
    const accIds = await getStandardAccountIds(tenantId)

    // ★★★ v6.6.0: تلاش برای پیدا کردن حساب‌های اختصاصی کسری/مازاد
    //   اگر نبودند، fallback به 5100 (هزینه اداری) و 4200 (درآمد خدمات)
    let shortageAccountId: string | null = null
    let surplusAccountId: string | null = null
    const inventoryAccountId = accIds.inventoryAccountId

    try {
      const accounts = await db.client.account.findMany({
        where: { tenantId, isActive: true },
      })

      for (const acc of accounts) {
        const code = (acc.code || '').toLowerCase()
        const name = (acc.name || '').toLowerCase()

        // ★ حساب کسری/ضایعات انبار (اولویت ۱)
        if (!shortageAccountId && (name.includes('کسری') || name.includes('ضایعات') || name.includes('هزینه انبار'))) {
          shortageAccountId = acc.id
        }
        // ★ fallback: 5100 هزینه‌های اداری (اولویت ۲)
        if (!shortageAccountId && code === '5100') {
          shortageAccountId = acc.id
        }
        // ★ fallback نهایی: 5106/5110/5120 سایر هزینه‌ها
        if (!shortageAccountId && code.startsWith('51') && code !== '5150' && code !== '5105') {
          shortageAccountId = acc.id
        }

        // ★ حساب مازاد انبار (اولویت ۱)
        if (!surplusAccountId && (name.includes('مازاد') || name.includes('درآمد انبار') || name.includes('سایر درآمدها'))) {
          surplusAccountId = acc.id
        }
        // ★ fallback: 4900 سایر درآمدها
        if (!surplusAccountId && code.startsWith('49')) {
          surplusAccountId = acc.id
        }
        // ★ fallback نهایی: 4200 درآمد خدمات
        if (!surplusAccountId && code === '4200') {
          surplusAccountId = acc.id
        }
      }
    } catch (err: any) {
      console.warn('[StockCount Approve] Could not find shortage/surplus accounts:', err?.message)
    }

    console.log('[StockCount Approve] Resolved accounts:', {
      inventory: inventoryAccountId,
      shortage: shortageAccountId,
      surplus: surplusAccountId,
    })

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    const result = await txClient.$transaction(async (tx: any) => {
      let totalShortage = 0
      let totalSurplus = 0

      // ═══════════════════════════════════════════════════════════════
      //  مرحله ۱: به‌روزرسانی StockLevel و ثبت StockMovement
      // ═══════════════════════════════════════════════════════════════
      for (const item of itemsWithDifference) {
        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: stockCount.warehouseId,
              productId: item.productId,
            },
          },
        }).catch(() => null)

        if (!stockLevel) {
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
          await tx.stockLevel.update({
            where: { id: stockLevel.id },
            data: { quantity: item.countedQty },
          })
        }

        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: item.countedQty },
        }).catch(() => {})

        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            fromWarehouseId: item.difference < 0 ? stockCount.warehouseId : null,
            toWarehouseId: item.difference > 0 ? stockCount.warehouseId : null,
            quantity: Math.abs(item.difference),
            unitCost: item.unitCost,
            movementType: 'adjustment',
            referenceType: 'stock_count',
            referenceId: stockCount.id,
            description: `انبار گردانی ${stockCount.number} — ${item.Product.name} — ${item.difference > 0 ? 'مازاد' : 'کمبود'} ${Math.abs(item.difference)}`,
          },
        })

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

      if ((totalShortage > 0 || totalSurplus > 0) && inventoryAccountId) {
        const lines: any[] = []
        const jeNumber = `JE-${(await tx.journalEntry.count({ where: { tenantId } }) + 1).toString().padStart(6, '0')}`

        // ★ کمبود (shortage): Dr هزینه / Cr موجودی کالا
        if (totalShortage > 0 && shortageAccountId) {
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
        } else if (totalShortage > 0) {
          console.warn('[StockCount Approve] shortageAccountId missing — shortage journal skipped:', totalShortage)
        }

        // ★ مازاد (surplus): Dr موجودی کالا / Cr درآمد
        if (totalSurplus > 0 && surplusAccountId) {
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
        } else if (totalSurplus > 0) {
          console.warn('[StockCount Approve] surplusAccountId missing — surplus journal skipped:', totalSurplus)
        }

        if (lines.length >= 2) {
          const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0)
          const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0)

          const journalEntry = await tx.journalEntry.create({
            data: {
              number: jeNumber,
              // ★★★ v6.6.0: تاریخ JE = تاریخ انبارگردانی
              date: stockCount.countDate || new Date(),
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
    console.error('[StockCount Approve POST] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'خطا در تأیید سند',
    }, { status: 500 })
  }
})
