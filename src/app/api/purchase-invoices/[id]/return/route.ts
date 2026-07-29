// src/app/api/purchase-invoices/[id]/return/route.ts — v8.8.0 (Account Fix)
// ============================================================================
// ★★★ v8.8.0 تغییرات:
//   ★ استفاده از getStandardAccountIds (auto-seed) به‌جای manual lookup
//   ★ استفاده از VAT (2160) برای مالیات بر ارزش افزوده (نه 190 قدیمی)
//   ★ استفاده از tradePurchasableId (2010) برای نسیه خرید (نه 210 عمومی)
//   ★ استفاده از cashAccountId (1010) برای خرید نقدی
//   ★ تاریخ JE = تاریخ فاکتور برگشتی
//
// ★★★ v8.7.1 (حفظ شد): بررسی موجودی انبار قبل از برگشت
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id

    const paramsObj: any = ctx.params && typeof ctx.params?.then === 'function' ? await ctx.params : ctx.params
    const originalId = paramsObj?.id

    if (!originalId) {
      return NextResponse.json({ success: false, error: 'شناسه فاکتور اصلی الزامی است' }, { status: 400 })
    }

    const body = await req.json()
    const { items: returnItems = [], description, invoiceDate } = body

    if (!Array.isArray(returnItems) || returnItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'حداقل یک آیتم برای برگشت الزامی است' },
        { status: 400 }
      )
    }

    // ★ اعتبارسنجی آیتم‌ها
    for (const item of returnItems) {
      if (!item.purchaseInvoiceItemId) {
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

    // ★ پیدا کردن فاکتور اصلی
    const originalInvoice: any = await tenantDb.purchaseInvoice.findFirst({
      where: { id: originalId, tenantId },
    })

    if (!originalInvoice) {
      return NextResponse.json({ success: false, error: 'فاکتور اصلی یافت نشد' }, { status: 404 })
    }

    if (originalInvoice.invoiceType === 'purchase_return') {
      return NextResponse.json(
        { success: false, error: 'فاکتور اصلی خودش برگشتی است — امکان برگشت مجدد وجود ندارد' },
        { status: 400 }
      )
    }

    // ★ بارگذاری آیتم‌های فاکتور اصلی
    const originalItems = await tenantDb.purchaseInvoiceItem.findMany({
      where: { purchaseInvoiceId: originalId },
    })

    // ★ اعتبارسنجی: مقدار برگشتی نباید بیشتر از موجودی انبار باشد
    const itemsToProcess: any[] = []
    let returnSubTotal = 0
    let returnDiscount = 0
    let returnTax = 0

    for (const retItem of returnItems) {
      const origItem = originalItems.find((oi: any) => oi.id === retItem.purchaseInvoiceItemId)
      if (!origItem) {
        return NextResponse.json(
          { success: false, error: `آیتم فاکتور اصلی یافت نشد: ${retItem.purchaseInvoiceItemId}` },
          { status: 400 }
        )
      }

      // ✅ بررسی ۱: مقدار خرید اصلی
      if (retItem.quantity > origItem.quantity) {
        return NextResponse.json(
          {
            success: false,
            error: `مقدار برگشتی (${retItem.quantity}) نمی‌تواند بیشتر از مقدار خرید (${origItem.quantity}) باشد برای کالای ${origItem.productName}`,
          },
          { status: 400 }
        )
      }

      // ✅ بررسی ۲: موجودی انبار فعلی
      if (origItem.productId) {
        const stockLevel = await tenantDb.stockLevel.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: originalInvoice.warehouseId,
              productId: origItem.productId,
            },
          },
        }).catch(() => null)

        if (stockLevel && retItem.quantity > stockLevel.quantity) {
          return NextResponse.json(
            {
              success: false,
              error: `موجودی ${origItem.productName} کافی نیست. موجودی فعلی: ${stockLevel.quantity} عدد، تعداد درخواستی برگشت: ${retItem.quantity} عدد`,
            },
            { status: 400 }
          )
        }
      }

      // محاسبه مبالغ متناسب با مقدار برگشتی
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

    // ★ تولید شماره فاکتور برگشتی
    const returnCount = await tenantDb.purchaseInvoice.count({
      where: { tenantId, invoiceType: 'purchase_return' },
    })
    const returnNumber = `PR-${(returnCount + 1).toString().padStart(6, '0')}`

    // ★★★ v8.8.0: گرفتن حساب‌های استاندارد با auto-seed
    await getStandardAccountIds(tenantId).catch(() => ({} as any))
    const accIds = await getStandardAccountIds(tenantId)

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    // ══════ شروع تراکنش ══════
    const result = await txClient.$transaction(async (tx: any) => {
      // ۱. ایجاد فاکتور برگشتی خرید
      const returnInvoice = await tx.purchaseInvoice.create({
        data: {
          tenantId,
          supplierId: originalInvoice.supplierId,
          number: returnNumber,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          status: 'confirmed',
          paymentType: originalInvoice.paymentType,
          subTotal: returnSubTotal,
          discountAmount: returnDiscount,
          taxAmount: returnTax,
          totalAmount: returnTotal,
          paidAmount: 0,
          remainingAmount: returnTotal,
          warehouseId: originalInvoice.warehouseId,
          description: description || `برگشت کالا به تامین‌کننده — فاکتور اصلی ${originalInvoice.number}`,
          cashierId: userId,
          invoiceType: 'purchase_return',
          originalPurchaseInvoiceId: originalId,
        },
      })

      // ۲. ایجاد آیتم‌های برگشتی + کاهش موجودی
      for (const item of itemsToProcess) {
        await tx.purchaseInvoiceItem.create({
          data: {
            purchaseInvoiceId: returnInvoice.id,
            productId: item.productId || null,
            productName: item.productName,
            quantity: item.returnQuantity,
            unitPrice: item.unitPrice,
            discountAmount: item.lineDiscount,
            taxAmount: item.lineTax,
            lineTotal: item.lineTotal,
            returnReason: item.returnReason,
          },
        })

        // کاهش موجودی انبار
        if (item.productId) {
          const stockLevel = await tx.stockLevel.findUnique({
            where: {
              warehouseId_productId: {
                warehouseId: originalInvoice.warehouseId,
                productId: item.productId,
              },
            },
          })

          if (stockLevel) {
            const newQty = stockLevel.quantity - item.returnQuantity
            const newAvgCost = newQty > 0 ? stockLevel.averageCost : 0

            await tx.stockLevel.update({
              where: {
                warehouseId_productId: {
                  warehouseId: originalInvoice.warehouseId,
                  productId: item.productId,
                },
              },
              data: {
                quantity: { decrement: item.returnQuantity },
                averageCost: newAvgCost,
              },
            })
          }

          // ثبت حرکت کالا
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              fromWarehouseId: originalInvoice.warehouseId,
              quantity: item.returnQuantity,
              unitCost: item.unitPrice,
              movementType: 'purchase_return',
              referenceType: 'purchase_return',
              referenceId: returnInvoice.id,
              description: `برگشت به تامین‌کننده — فاکتور برگشتی ${returnNumber}`,
            },
          })

          // کاهش Product.currentStock
          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: { decrement: item.returnQuantity } },
          }).catch((err: any) => console.warn('[Return] خطا در Product.update:', err?.message))
        }
      }

      // ★★★ v8.8.0: سند حسابداری برگشتی — استفاده از getStandardAccountIds
      try {
        const inventoryAccountId = accIds.inventoryAccountId
        const cashAccountId = accIds.cashAccountId
        // ★★★ v8.8.0: برای نسیه از tradePurchasableId (2010) استفاده کنیم
        const payableAccountId = accIds.tradePurchasableId || accIds.payablesAccountId
        // ★★★ v8.8.0: VAT (2160) برای مالیات بر ارزش افزوده
        const vatAccountId = accIds.vatAccountId || accIds.taxAccountId

        if (inventoryAccountId) {
          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

          const isCredit = originalInvoice.paymentType === 'credit'
          const lines: any[] = []
          const netAmount = returnSubTotal - returnDiscount

          // ★ بستانکار: موجودی کالا (کاهش)
          lines.push({
            accountId: inventoryAccountId,
            debit: 0,
            credit: netAmount,
            description: `بستانکار: برگشت کالا به تامین‌کننده — فاکتور برگشتی ${returnNumber}`,
          })

          // ★ بستانکار: مالیات بر ارزش افزوده (کاهش)
          if (returnTax > 0 && vatAccountId) {
            lines.push({
              accountId: vatAccountId,
              debit: 0,
              credit: returnTax,
              description: `بستانکار: مالیات بر ارزش افزوده برگشت خرید — فاکتور ${returnNumber}`,
            })
          }

          // ★ بدهکار: بستانکاران تجاری (نسیه) یا صندوق (نقدی)
          const debitAccountId = isCredit
            ? (payableAccountId || cashAccountId)
            : cashAccountId
          if (debitAccountId) {
            lines.push({
              accountId: debitAccountId,
              debit: returnTotal,
              credit: 0,
              description: `بدهکار: ${isCredit ? 'بستانکاران تجاری' : 'صندوق'} — فاکتور برگشتی خرید ${returnNumber}`,
            })
          }

          if (lines.length >= 2) {
            const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
            const totalCredit = lines.reduce((s, l) => s + l.credit, 0)

            const journalEntry = await tx.journalEntry.create({
              data: {
                number: jeNumber,
                // ★★★ v8.8.0: تاریخ JE = تاریخ فاکتور برگشتی
                date: invoiceDate ? new Date(invoiceDate) : new Date(),
                description: `سند خودکار بابت فاکتور برگشتی خرید ${returnNumber}`,
                status: 'posted',
                sourceType: 'purchase_return',
                sourceId: returnInvoice.id,
                totalDebit,
                totalCredit,
                createdBy: userId || null,
                tenantId,
                lines: { create: lines },
              },
            })

            await tx.purchaseInvoice.update({
              where: { id: returnInvoice.id },
              data: { journalEntryId: journalEntry.id },
            })
          }
        }
      } catch (jeErr: any) {
        console.warn('[Return] Auto journal entry failed:', jeErr?.message)
      }

      // ۴. کاهش بدهی تامین‌کننده
      if (originalInvoice.paymentType === 'credit' && originalInvoice.supplierId) {
        await tx.supplier.update({
          where: { id: originalInvoice.supplierId },
          data: { currentBalance: { decrement: returnTotal } },
        }).catch((err: any) => console.warn('[Return] خطا در Supplier.update:', err?.message))
      }

      return returnInvoice
    })

    console.log(`[Purchase Return] ✓ فاکتور برگشتی ${returnNumber} ثبت شد`)

    return NextResponse.json({
      success: true,
      data: {
        id: result.id,
        number: result.number,
        totalAmount: result.totalAmount,
        invoiceType: result.invoiceType,
        originalPurchaseInvoiceId: result.originalPurchaseInvoiceId,
      },
      message: `فاکتور برگشتی خرید با شماره ${returnNumber} با موفقیت ثبت شد. مبلغ: ${returnTotal.toLocaleString('fa-IR')} ریال`,
    })
  } catch (error: any) {
    console.error('[Purchase Return] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در ثبت فاکتور برگشتی خرید' },
      { status: 500 }
    )
  }
})
