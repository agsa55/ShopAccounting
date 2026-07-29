// src/app/api/invoices/[id]/return/route.ts — v9.9 ★★★ ACCOUNT FIX
// ============================================================================
// ★★★ v9.9 تغییرات:
//   ★ استفاده از getStandardAccountIds (auto-seed) به‌جای manual lookup
//   ★ استفاده از VAT (2160) برای مالیات بر ارزش افزوده (نه 190 قدیمی)
//   ★ استفاده از bankAccountId (1100) به‌عنوان fallback صندوق
//   ★ حذف حلقه manual account lookup
//   ★ اصلاح buyer/seller account selection برای نسیه (1310 بدهکاران تجاری)
//
// ★★★ v9.8 (حفظ شد):
//   ★ محاسبه و ذخیره cogsAmount در فاکتور برگشتی
//   ★ منطق fallback چندمرحله‌ای COGS
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'

export const POST = withTenantAndPermission('pos')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant?.tenantDb
    const tenantId = tenant?.tenantId
    const userId = tenant?.user?.id

    if (!tenantDb) {
      console.error('[Sale Return] tenantDb is undefined')
      return NextResponse.json(
        { success: false, error: 'خطای پیکربندی tenant — tenantDb موجود نیست' },
        { status: 500 }
      )
    }

    const paramsObj: any =
      ctx?.params && typeof ctx.params?.then === 'function'
        ? await ctx.params
        : ctx?.params || {}
    const originalId = paramsObj?.id

    if (!originalId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فاکتور اصلی الزامی است' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const {
      items: returnItems = [],
      description,
      invoiceDate,
      paymentType = 'cash',
    } = body

    if (!Array.isArray(returnItems) || returnItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'حداقل یک آیتم برای برگشت الزامی است' },
        { status: 400 }
      )
    }

    for (const item of returnItems) {
      if (!item.invoiceItemId) {
        return NextResponse.json(
          { success: false, error: 'آیتم برگشتی باید به یک آیتم فاکتور اصلی متصل باشد' },
          { status: 400 }
        )
      }
      if (!item.quantity || item.quantity <= 0) {
        return NextResponse.json(
          { success: false, error: 'مقدار برگشتی باید بزرگتر از صفر باشد' },
          { status: 400 }
        )
      }
    }

    const originalInvoice: any = await tenantDb.invoice.findFirst({
      where: { id: originalId, tenantId },
    })

    if (!originalInvoice) {
      return NextResponse.json(
        { success: false, error: 'فاکتور اصلی یافت نشد' },
        { status: 404 }
      )
    }

    if (originalInvoice.invoiceType === 'sale_return') {
      return NextResponse.json(
        { success: false, error: 'فاکتور اصلی خودش برگشتی است — امکان برگشت مجدد وجود ندارد' },
        { status: 400 }
      )
    }

    if (originalInvoice.invoiceType === 'service') {
      return NextResponse.json(
        { success: false, error: 'فاکتور خدماتی قابل برگشت نیست' },
        { status: 400 }
      )
    }

    const originalItems = await tenantDb.invoiceItem.findMany({
      where: { invoiceId: originalId },
    })

    const itemsToProcess: any[] = []
    let returnSubTotal = 0
    let returnDiscount = 0
    let returnTax = 0

    for (const retItem of returnItems) {
      const origItem = originalItems.find((oi: any) => oi.id === retItem.invoiceItemId)
      if (!origItem) {
        return NextResponse.json(
          { success: false, error: `آیتم فاکتور اصلی یافت نشد: ${retItem.invoiceItemId}` },
          { status: 400 }
        )
      }

      if (retItem.quantity > origItem.quantity) {
        return NextResponse.json(
          {
            success: false,
            error: `مقدار برگشتی (${retItem.quantity}) نمی‌تواند بیشتر از مقدار فروش (${origItem.quantity}) باشد`,
          },
          { status: 400 }
        )
      }

      const ratio = origItem.quantity > 0 ? retItem.quantity / origItem.quantity : 0
      const lineDiscount = origItem.discountAmount * ratio
      const lineTax = origItem.taxAmount * ratio
      const lineTotal = origItem.lineTotal * ratio

      itemsToProcess.push({
        ...origItem,
        returnQuantity: retItem.quantity,
        returnReason: retItem.returnReason || null,
        lineDiscount,
        lineTax,
        lineTotal,
      })

      returnSubTotal += origItem.unitPrice * retItem.quantity
      returnDiscount += lineDiscount
      returnTax += lineTax
    }

    const returnTotal = returnSubTotal - returnDiscount + returnTax

    if (returnTotal <= 0) {
      return NextResponse.json(
        { success: false, error: 'مبلغ کل برگشتی باید بزرگتر از صفر باشد' },
        { status: 400 }
      )
    }

    const returnCount = await tenantDb.invoice.count({
      where: { tenantId, invoiceType: 'sale_return' },
    })
    const timestamp = Date.now().toString().slice(-4)
    const returnNumber = `SR-${(returnCount + 1).toString().padStart(4, '0')}-${timestamp}`

    let warehouseId = originalInvoice.warehouseId
    if (!warehouseId) {
      const defaultWh = await tenantDb.warehouse
        .findFirst({ where: { tenantId, isDefault: true, isActive: true } })
        .catch(() => null)
      if (defaultWh) warehouseId = defaultWh.id
      else {
        const firstWh = await tenantDb.warehouse
          .findFirst({ where: { tenantId, isActive: true } })
          .catch(() => null)
        if (firstWh) warehouseId = firstWh.id
      }
    }

    // ★★★ v9.9: گرفتن حساب‌های استاندارد قبل از transaction (با auto-seed)
    await getStandardAccountIds(tenantId).catch(() => ({} as any))
    const accIds = await getStandardAccountIds(tenantId)

    const result = await tenantDb.$transaction(async (tx: any) => {
      const returnInvoice = await tx.invoice.create({
        data: {
          tenantId,
          number: returnNumber,
          customerId: originalInvoice.customerId,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          status: 'confirmed',
          paymentType: paymentType,
          subTotal: returnSubTotal,
          discountAmount: returnDiscount,
          taxAmount: returnTax,
          totalAmount: returnTotal,
          paidAmount: paymentType === 'cash' ? returnTotal : 0,
          remainingAmount: paymentType === 'cash' ? 0 : returnTotal,
          cashierId: userId,
          description: description || `برگشت کالا — فاکتور اصلی ${originalInvoice.number}`,
          invoiceType: 'sale_return',
          originalInvoiceId: originalId,
          ...(warehouseId ? { warehouseId } : {}),
        },
      })

      // ★★★ v9.8: محاسبه COGS برگشتی
      let totalReturnCogs = 0
      const cogsBreakdown: any[] = []

      for (const item of itemsToProcess) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: returnInvoice.id,
            productId: item.productId || null,
            productName: item.productName,
            quantity: item.returnQuantity,
            unitPrice: item.unitPrice,
            discountAmount: item.lineDiscount,
            taxAmount: item.lineTax,
            lineTotal: item.lineTotal,
            description: item.returnReason,
          },
        })

        if (!item.productId) continue

        let itemCogs = 0
        let cogsSource = 'unknown'

        // ★ افزایش Product.currentStock (همیشه)
        await tx.product
          .update({
            where: { id: item.productId },
            data: { currentStock: { increment: item.returnQuantity } },
          })
          .catch((err: any) =>
            console.warn('[Sale Return] Product.currentStock increment failed:', err?.message)
          )

        if (warehouseId) {
          let stockLevel: any = null
          try {
            stockLevel = await tx.stockLevel.findUnique({
              where: {
                warehouseId_productId: { warehouseId, productId: item.productId },
              },
            })
          } catch {
            stockLevel = null
          }

          if (stockLevel) {
            const avgCost = Number(stockLevel.averageCost) || 0
            if (avgCost > 0) {
              itemCogs = item.returnQuantity * avgCost
              cogsSource = 'StockLevel.averageCost'
            } else {
              const product = await tx.product.findUnique({ where: { id: item.productId } }).catch(() => null)
              if (product) {
                const purchasePrice = Number(product.purchasePrice) || 0
                if (purchasePrice > 0) {
                  itemCogs = item.returnQuantity * purchasePrice
                  cogsSource = 'Product.purchasePrice (fallback)'
                } else {
                  const salePrice = Number(product.salePrice) || Number(item.unitPrice) || 0
                  itemCogs = item.returnQuantity * salePrice
                  cogsSource = 'Product.salePrice (last resort)'
                }
              }
            }

            const oldTotalValue = stockLevel.quantity * stockLevel.averageCost
            const newTotalValue = oldTotalValue + itemCogs
            const newTotalQty = stockLevel.quantity + item.returnQuantity
            const newAvgCost = newTotalQty > 0 ? newTotalValue / newTotalQty : avgCost

            await tx.stockLevel.update({
              where: {
                warehouseId_productId: { warehouseId, productId: item.productId },
              },
              data: {
                quantity: { increment: item.returnQuantity },
                averageCost: newAvgCost,
              },
            })
          } else {
            const product = await tx.product.findUnique({ where: { id: item.productId } }).catch(() => null)
            if (product) {
              const purchasePrice = Number(product.purchasePrice) || 0
              if (purchasePrice > 0) {
                itemCogs = item.returnQuantity * purchasePrice
                cogsSource = 'Product.purchasePrice (no StockLevel)'
              } else {
                const salePrice = Number(product.salePrice) || Number(item.unitPrice) || 0
                itemCogs = item.returnQuantity * salePrice
                cogsSource = 'Product.salePrice (no StockLevel + no purchasePrice)'
              }
            }

            await tx.stockLevel.create({
              data: {
                tenantId,
                warehouseId,
                productId: item.productId,
                quantity: item.returnQuantity,
                averageCost: item.returnQuantity > 0 ? itemCogs / item.returnQuantity : 0,
              },
            })
          }

          try {
            await tx.stockMovement.create({
              data: {
                tenantId,
                productId: item.productId,
                toWarehouseId: warehouseId,
                quantity: item.returnQuantity,
                unitCost: item.returnQuantity > 0 ? itemCogs / item.returnQuantity : 0,
                movementType: 'sale_return',
                referenceType: 'sale_return',
                referenceId: returnInvoice.id,
                description: `برگشت از مشتری — ${returnNumber}`,
              },
            })
          } catch (smErr: any) {
            console.warn('[Sale Return] StockMovement create failed:', smErr?.message)
          }
        } else {
          const product = await tx.product.findUnique({ where: { id: item.productId } }).catch(() => null)
          if (product) {
            const purchasePrice = Number(product.purchasePrice) || 0
            if (purchasePrice > 0) {
              itemCogs = item.returnQuantity * purchasePrice
              cogsSource = 'Product.purchasePrice (no warehouse)'
            } else {
              const salePrice = Number(product.salePrice) || Number(item.unitPrice) || 0
              itemCogs = item.returnQuantity * salePrice
              cogsSource = 'Product.salePrice (no warehouse + no purchasePrice)'
            }
          }
        }

        totalReturnCogs += itemCogs
        cogsBreakdown.push({
          productId: item.productId,
          productName: item.productName,
          quantity: item.returnQuantity,
          unitCost: item.returnQuantity > 0 ? itemCogs / item.returnQuantity : 0,
          itemCogs,
          cogsSource,
        })
      }

      console.log(`[Sale Return] COGS calculated for ${returnNumber}:`, {
        totalReturnCogs,
        breakdown: cogsBreakdown,
      })

      // ★★★ ذخیره COGS در فاکتور برگشتی
      try {
        await tx.invoice.update({
          where: { id: returnInvoice.id },
          data: { cogsAmount: totalReturnCogs } as any,
        })
      } catch (err: any) {
        console.warn('[Sale Return] cogsAmount field not found:', err?.message)
      }

      // ★★★ v9.9: سند حسابداری برگشتی — استفاده از getStandardAccountIds
      try {
        const salesAccountId = accIds.salesAccountId
        const cogsAccountId = accIds.cogsAccountId
        const inventoryAccountId = accIds.inventoryAccountId
        // ★★★ v9.9: VAT (2160) برای مالیات بر ارزش افزوده
        const vatAccountId = accIds.vatAccountId || accIds.taxAccountId
        const cashAccountId = accIds.cashAccountId || accIds.bankAccountId
        // ★★★ v9.9: برای نسیه از tradeReceivableId (1310) استفاده کنیم
        const receivablesAccountId = accIds.tradeReceivableId || accIds.receivablesAccountId

        if (salesAccountId) {
          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

          const isCredit = paymentType === 'credit'
          const netSales = returnSubTotal - returnDiscount

          const lines: any[] = []

          // ★ بدهکار: برگشت فروش (کاهش درآمد)
          lines.push({
            accountId: salesAccountId,
            debit: netSales,
            credit: 0,
            description: `بدهکار: برگشت فروش — ${returnNumber}`,
          })

          // ★ بدهکار: مالیات بر ارزش افزوده (با کاهش)
          if (returnTax > 0 && vatAccountId) {
            lines.push({
              accountId: vatAccountId,
              debit: returnTax,
              credit: 0,
              description: `بدهکار: مالیات بر ارزش افزوده برگشت فروش — ${returnNumber}`,
            })
          }

          // ★ بستانکار: صندوق (نقدی) یا بدهکاران تجاری (نسیه)
          const creditAccountId = isCredit
            ? (receivablesAccountId || cashAccountId)
            : cashAccountId
          if (creditAccountId) {
            lines.push({
              accountId: creditAccountId,
              debit: 0,
              credit: returnTotal,
              description: `بستانکار: ${isCredit ? 'بدهکاران تجاری (کاهش طلب)' : 'صندوق'} — ${returnNumber}`,
            })
          }

          // ★★★ سند COGS برگشتی (معکوس)
          if (totalReturnCogs > 0 && cogsAccountId && inventoryAccountId) {
            lines.push({
              accountId: inventoryAccountId,
              debit: totalReturnCogs,
              credit: 0,
              description: `بدهکار: برگشت به انبار — ${returnNumber}`,
            })
            lines.push({
              accountId: cogsAccountId,
              debit: 0,
              credit: totalReturnCogs,
              description: `بستانکار: معکوس بهای تمام شده — ${returnNumber}`,
            })
          }

          if (lines.length >= 2) {
            const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
            const totalCredit = lines.reduce((s, l) => s + l.credit, 0)

            await tx.journalEntry.create({
              data: {
                number: jeNumber,
                // ★★★ v9.9: تاریخ JE = تاریخ فاکتور برگشتی
                date: invoiceDate ? new Date(invoiceDate) : new Date(),
                description: `سند برگشتی فروش ${returnNumber}`,
                status: 'posted',
                sourceType: 'sale_return',
                sourceId: returnInvoice.id,
                totalDebit,
                totalCredit,
                createdBy: userId || null,
                tenantId,
                lines: { create: lines },
              },
            })
          }
        }
      } catch (jeErr: any) {
        console.warn('[Sale Return] Journal entry failed:', jeErr?.message)
      }

      if (paymentType === 'credit' && originalInvoice.customerId) {
        await tx.customer
          .update({
            where: { id: originalInvoice.customerId },
            data: { currentBalance: { decrement: returnTotal } },
          })
          .catch((err: any) =>
            console.warn('[Sale Return] Customer balance update failed:', err?.message)
          )
      }

      return returnInvoice
    })

    return NextResponse.json({
      success: true,
      data: {
        id: result.id,
        number: result.number,
        totalAmount: result.totalAmount,
        invoiceType: result.invoiceType,
        originalInvoiceId: result.originalInvoiceId,
      },
      message: `فاکتور برگشتی ${returnNumber} با موفقیت ثبت شد. مبلغ: ${returnTotal.toLocaleString('fa-IR')} ریال`,
    })
  } catch (error: any) {
    console.error('[Sale Return] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در ثبت فاکتور برگشتی فروش' },
      { status: 500 }
    )
  }
})
