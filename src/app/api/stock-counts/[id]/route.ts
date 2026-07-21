// src/app/api/stock-counts/[id]/route.ts
// ShopAccounting v6.5 — Stock Count Detail API
// ============================================================================
// ★ GET: جزئیات یک سند انبار گردانی
// ★ PUT: به‌روزرسانی آیتم‌ها (تعداد شمرده‌شده، دلیل)
// ★ DELETE: حذف سند (فقط در حالت draft)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

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
//  Body: {
//    status?: 'draft' | 'in_progress' | 'completed' | 'cancelled',
//    notes?: string,
//    items?: [{ id?, productId, countedQty, reason? }] // به‌روزرسانی یا افزودن
//  }
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

    // ★ اگر سند تأیید شده (completed)، نمی‌توان ویرایش کرد
    if (existing.status === 'completed') {
      return NextResponse.json({
        success: false,
        error: 'سند تأیید شده قابل ویرایش نیست. برای ویرایش، ابتدا آن را لغو کنید.',
      }, { status: 400 })
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    const result = await txClient.$transaction(async (tx: any) => {
      // ★ به‌روزرسانی فیلدهای سند
      const updateData: any = {}
      if (body.status) updateData.status = body.status
      if (body.notes !== undefined) updateData.notes = body.notes
      updateData.updatedAt = new Date()

      // ★ به‌روزرسانی آیتم‌ها (اگه ارسال شده)
      if (body.items && Array.isArray(body.items)) {
        let totalDifference = 0
        let totalItems = 0

        for (const item of body.items) {
          // ★ گرفتن StockLevel فعلی برای unitCost و systemQty
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
            // ★ به‌روزرسانی آیتم موجود
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
            // ★ آیتم جدید
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

    // ★ فقط در حالت draft قابل حذف است
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
//  ★★★ v6.5.4: POST /api/stock-counts/[id] — تأیید و ثبت نهایی
//  (Fallback اگه پوشه approve کپی نشده باشه — همان منطق approve)
//  Body: { action: 'approve', notes?: string }
//  یا: { action: 'cancel' }
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

      if (totalShortage > 0 || totalSurplus > 0) {
        let inventoryAccountId: string | null = null
        let shortageAccountId: string | null = null
        let surplusAccountId: string | null = null

        try {
          const accounts = await tx.account.findMany({ where: { tenantId } })
          for (const acc of accounts) {
            const code = (acc.code || '').toLowerCase()
            const type = (acc.type || '').toLowerCase()
            const name = (acc.name || '').toLowerCase()

            if (!inventoryAccountId && (type === 'inventory' || code.startsWith('120') || name.includes('موجودی') || name.includes('انبار') || name.includes('کالا'))) {
              inventoryAccountId = acc.id
            }
            if (!shortageAccountId && (code.startsWith('51') || code.startsWith('52') || name.includes('کسری') || name.includes('هزینه انبار') || name.includes('ضایعات'))) {
              shortageAccountId = acc.id
            }
            if (!surplusAccountId && (code.startsWith('42') || code.startsWith('49') || name.includes('مازاد') || name.includes('درآمد انبار') || name.includes('سایر درآمدها'))) {
              surplusAccountId = acc.id
            }
          }
        } catch (err: any) {
          console.warn('[StockCount Approve] Could not find accounts:', err?.message)
        }

        const lines: any[] = []
        const jeNumber = `JE-${(await tx.journalEntry.count({ where: { tenantId } }) + 1).toString().padStart(6, '0')}`

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

