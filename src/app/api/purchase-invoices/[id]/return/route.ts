// src/app/api/purchase-invoices/[id]/return/route.ts — v8.9.0 (Complete Fix)
// ============================================================================
// ★★★ v8.9.0 تغییرات:
//   ★ paidAmount = returnTotal (فاکتور برگشتی = دریافت وجه)
//   ★ remainingAmount = 0
//   ★ بررسی مجموع برگشت‌های قبلی (جلوگیری از برگشت تکراری)
//   ★ پشتیبانی کامل از پرداخت با چک (checkPayableAccountId)
//   ★ بررسی فاکتور لغو شده
//   ★ به‌روزرسانی وضعیت چک مرتبط
//
// ★★★ v8.8.0 (حفظ شد): getStandardAccountIds + VAT (2160)
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

    // ★ v8.9.0: بررسی وضعیت فاکتور اصلی
    if (originalInvoice.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'فاکتور لغو شده قابل برگشت نیست' },
        { status: 400 }
      )
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

    // ★ v8.9.0: بارگذاری مجموع برگشت‌های قبلی هر آیتم
    const previousReturns = await tenantDb.purchaseInvoiceItem.findMany({
      where: {
        purchaseInvoice: {
          originalPurchaseInvoiceId: originalId,
          invoiceType: 'purchase_return',
          tenantId,
          status: { not: 'cancelled' },
        },
      },
    })

    // ساخت map از مجموع برگشت‌های قبلی برای هر آیتم اصلی
    const returnedQtyMap = new Map<string, number>()
    for (const ret of previousReturns) {
      const origItem = originalItems.find((oi: any) => oi.productId === ret.productId)
      if (origItem) {
        const current = returnedQtyMap.get(origItem.id) || 0
        returnedQtyMap.set(origItem.id, current + Number(ret.quantity))
      }
    }

    // ★ اعتبارسنجی و پردازش آیتم‌ها
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

      const origQty = Number(origItem.quantity)
      const retQty = Number(retItem.quantity)

      // ✅ بررسی ۱: مقدار خرید اصلی
      if (retQty > origQty) {
        return NextResponse.json(
          {
            success: false,
            error: `مقدار برگشتی (${retQty}) نمی‌تواند بیشتر از مقدار خرید (${origQty}) باشد برای کالای ${origItem.productName}`,
          },
          { status: 400 }
        )
      }

      // ★ v8.9.0: بررسی ۲: مجموع برگشت‌های قبلی + فعلی نباید از خرید بیشتر باشد
      const alreadyReturned = returnedQtyMap.get(origItem.id) || 0
      const totalAfterReturn = alreadyReturned + retQty
      if (totalAfterReturn > origQty) {
        return NextResponse.json(
          {
            success: false,
            error: `برای ${origItem.productName}: قبلاً ${alreadyReturned} عدد برگشت شده. حداکثر ${origQty - alreadyReturned} عدد دیگر قابل برگشت است.`,
          },
          { status: 400 }
        )
      }

      // ✅ بررسی ۳: موجودی انبار فعلی
      if (origItem.productId) {
        const stockLevel = await tenantDb.stockLevel.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: originalInvoice.warehouseId,
              productId: origItem.productId,
            },
          },
        }).catch(() => null)

        if (stockLevel && retQty > Number(stockLevel.quantity)) {
          return NextResponse.json(
            {
              success: false,
              error: `موجودی ${origItem.productName} کافی نیست. موجودی فعلی: ${stockLevel.quantity} عدد، تعداد درخواستی برگشت: ${retQty} عدد`,
            },
            { status: 400 }
          )
        }
      }

      // محاسبه مبالغ متناسب با مقدار برگشتی
      const ratio = origQty > 0 ? retQty / origQty : 0
      const lineDiscount = Number(origItem.discountAmount) * ratio
      const lineTax = Number(origItem.taxAmount) * ratio
      const lineTotal = Number(origItem.lineTotal) * ratio

      itemsToProcess.push({
        ...origItem,
        returnQuantity: retQty,
        returnReason: retItem.returnReason || null,
        lineDiscount,
        lineTax,
        lineTotal,
      })

      returnSubTotal += Number(origItem.unitPrice) * retQty
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

    // ★ گرفتن حساب‌های استاندارد
    await getStandardAccountIds(tenantId).catch(() => ({} as any))
    const accIds = await getStandardAccountIds(tenantId)

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    // ══════ شروع تراکنش ══════
    const result = await txClient.$transaction(async (tx: any) => {
      // ★ v8.9.0: فاکتور برگشتی = "دریافت وجه" پس paidAmount = returnTotal
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
          paidAmount: returnTotal,  // ★ v8.9.0: کل مبلغ دریافت شده
          remainingAmount: 0,       // ★ v8.9.0: باقیمانده صفر
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
            const newQty = Number(stockLevel.quantity) - item.returnQuantity
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

      // ★ v8.9.0: سند حسابداری — پشتیبانی کامل از چک
      try {
        const inventoryAccountId = accIds.inventoryAccountId
        const cashAccountId = accIds.cashAccountId
        const payableAccountId = accIds.tradePurchasableId || accIds.payablesAccountId
        const checkPayableAccountId = accIds.checkPayableAccountId || (accIds as any).checkPayableId
        const vatAccountId = accIds.vatAccountId || accIds.taxAccountId

        if (inventoryAccountId) {
          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

          const pt = (originalInvoice.paymentType || 'cash').toLowerCase()
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

          // ★ v8.9.0: بدهکار — بر اساس روش پرداخت اصلی
          let debitAccountId: string | null = null
          let debitDescription = ''

          if (pt === 'check') {
            // ★ چک: استفاده از حساب ۲۰۵۰ (چک‌های پرداختنی)
            debitAccountId = checkPayableAccountId || payableAccountId || cashAccountId
            debitDescription = `بدهکار: کاهش چک‌های پرداختنی — فاکتور برگشتی خرید ${returnNumber}`
            console.log('[Return] 💳 Check payment — using account:', debitAccountId)
          } else if (pt === 'credit') {
            // نسیه: حساب بستانکاران تجاری
            debitAccountId = payableAccountId || cashAccountId
            debitDescription = `بدهکار: بستانکاران تجاری — فاکتور برگشتی خرید ${returnNumber}`
          } else {
            // نقدی: صندوق/بانک
            debitAccountId = cashAccountId
            debitDescription = `بدهکار: صندوق — فاکتور برگشتی خرید ${returnNumber}`
          }

          if (debitAccountId) {
            lines.push({
              accountId: debitAccountId,
              debit: returnTotal,
              credit: 0,
              description: debitDescription,
            })
          }

          if (lines.length >= 2) {
            const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
            const totalCredit = lines.reduce((s, l) => s + l.credit, 0)

            const journalEntry = await tx.journalEntry.create({
              data: {
                number: jeNumber,
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

            console.log(`[Return] ✅ سند حسابداری ${jeNumber} صادر شد`)
          }
        }
      } catch (jeErr: any) {
        console.warn('[Return] Auto journal entry failed:', jeErr?.message)
      }

      // ★ v8.9.0: کاهش بدهی تامین‌کننده (نسیه و چک)
      const pt = (originalInvoice.paymentType || 'cash').toLowerCase()
      if ((pt === 'credit' || pt === 'check') && originalInvoice.supplierId) {
        await tx.supplier.update({
          where: { id: originalInvoice.supplierId },
          data: { currentBalance: { decrement: returnTotal } },
        }).catch((err: any) => console.warn('[Return] خطا در Supplier.update:', err?.message))
      }

      // ★ v8.9.0: به‌روزرسانی وضعیت چک مرتبط (در صورت وجود)
      if (pt === 'check') {
        try {
          const existingCheck = await tx.check.findFirst({
            where: { purchaseInvoiceId: originalId, tenantId },
          })
          if (existingCheck) {
            const newAmount = Math.max(0, Number(existingCheck.amount) - returnTotal)
            await tx.check.update({
              where: { id: existingCheck.id },
              data: {
                amount: newAmount,
                description: `${existingCheck.description || ''} [برگشتی ${returnNumber}: -${returnTotal}]`,
                status: newAmount <= 0 ? 'cancelled' : existingCheck.status,
              },
            }).catch((err: any) => console.warn('[Return] Check update failed:', err?.message))
          }
        } catch (checkErr: any) {
          console.warn('[Return] Check handling failed:', checkErr?.message)
        }
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
      message: `فاکتور برگشتی خرید ${returnNumber} ثبت شد. مبلغ: ${returnTotal.toLocaleString('fa-IR')} ریال`,
    })
  } catch (error: any) {
    console.error('[Purchase Return] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در ثبت فاکتور برگشتی خرید' },
      { status: 500 }
    )
  }
})