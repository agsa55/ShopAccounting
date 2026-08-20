// ============================================================================
// src/app/api/purchase-invoices/[id]/route.ts — v8.9.2 (Complete Fix)
// فاکتور خرید: مشاهده، ویرایش، حذف (با rollback کامل موجودی و سند)
// ============================================================================
// ★★★ v8.9.2 تغییرات:
//   ★ rollbackPurchaseInvoice: پشتیبانی کامل از چک (ابطال + کاهش بدهی)
//   ★ PUT: استفاده از getStandardAccountIds برای سند حسابداری
//   ★ PUT: پشتیبانی از چک در paidAmount (مثل نسیه = 0)
//   ★ PUT: به‌روزرسانی بدهی تامین‌کننده برای چک هم
//   ★ PUT: باطل کردن کامل چک قبلی (نه فقط unlink)
//   ★ PUT: سازگاری کامل با types فارسی جدید (accounts-auto-seed)
//
// ★★★ v6.1.4 (حفظ شد): console.log برای ایجاد آیتم‌های جدید
// ★★★ v6.1.3 (حفظ شد): GET بدون include (کوئری‌های جداگانه)
// ★★★ Next.js 16: params یک Promise است و باید await شود
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'

// ═══════════════════════════════════════════════════════════════
//  Helper: rollback کامل یک فاکتور خرید
//  ★ v8.9.2: پشتیبانی کامل از نقدی، نسیه و چک
// ═══════════════════════════════════════════════════════════════
async function rollbackPurchaseInvoice(tx: any, invoice: any, tenantId: string) {
  const invoiceId = invoice.id
  const warehouseId = invoice.warehouseId
  const pt = (invoice.paymentType || 'cash').toLowerCase()
  
  console.log(`[Rollback] شروع rollback فاکتور ${invoice.number} (id=${invoiceId}, paymentType=${pt})`)

  // ── ۱. بازگشت موجودی کالا ───────────────────────────────
  const items = await tx.purchaseInvoiceItem.findMany({
    where: { purchaseInvoiceId: invoiceId },
  })

  console.log(`[Rollback] پیدا شد ${items.length} آیتم برای rollback`)

  for (const item of items) {
    if (!item.productId) {
      console.warn(`[Rollback] آیتم بدون productId: ${item.productName} — رد شد`)
      continue
    }

    const qty = Number(item.quantity)

    // کاهش Product.currentStock
    console.log(`[Rollback] کاهش Product.currentStock: productId=${item.productId}, qty=${qty}`)
    await tx.product.update({
      where: { id: item.productId },
      data: { currentStock: { decrement: qty } },
    }).catch(err => console.error(`[Rollback] خطا در Product.update:`, err?.message))

    // کاهش StockLevel + اصلاح averageCost
    const stockLevel = await tx.stockLevel.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: item.productId } },
    }).catch(() => null)

    if (stockLevel) {
      const remainingQty = Number(stockLevel.quantity) - qty
      const newAvgCost = remainingQty > 0 ? stockLevel.averageCost : 0
      console.log(`[Rollback] کاهش StockLevel: productId=${item.productId}, qty=${qty} → ${remainingQty}`)
      await tx.stockLevel.update({
        where: { warehouseId_productId: { warehouseId, productId: item.productId } },
        data: { quantity: { decrement: qty }, averageCost: newAvgCost },
      }).catch(err => console.error(`[Rollback] خطا در StockLevel.update:`, err?.message))
    }

    // حذف StockMovement
    await tx.stockMovement.deleteMany({
      where: { referenceType: 'purchase_invoice', referenceId: invoiceId, productId: item.productId },
    }).catch(err => console.warn(`[Rollback] خطا در StockMovement.deleteMany:`, err?.message))
  }

  // ── ۲. ابطال سند حسابداری ─────────────────────────────
  if (invoice.journalEntryId) {
    console.log(`[Rollback] ابطال JournalEntry: ${invoice.journalEntryId}`)
    await tx.journalEntry.update({
      where: { id: invoice.journalEntryId },
      data: {
        isCancelled: true,
        cancelledAt: new Date(),
        status: 'cancelled',
        description: `ابطال شده — فاکتور خرید ${invoice.number} حذف/ویرایش شد`,
      },
    }).catch(err => console.warn(`[Rollback] خطا در JournalEntry.update:`, err?.message))
  }

  // ── ۳. کاهش بدهی تامین‌کننده (نسیه و چک) ──────────────────
  if ((pt === 'credit' || pt === 'check') && invoice.supplierId) {
    console.log(`[Rollback] کاهش Supplier.currentBalance: supplierId=${invoice.supplierId}, amount=${invoice.totalAmount}`)
    await tx.supplier.update({
      where: { id: invoice.supplierId },
      data: { currentBalance: { decrement: Number(invoice.totalAmount) } },
    }).catch(err => console.warn(`[Rollback] خطا در Supplier.update:`, err?.message))
  }

  // ── ۴. باطل کردن چک مرتبط (فقط برای چک) ──────────────────
  if (pt === 'check') {
    try {
      const relatedCheck = await tx.check.findFirst({
        where: { purchaseInvoiceId: invoiceId, tenantId },
      })
      if (relatedCheck) {
        if (relatedCheck.status === 'pending') {
          // چک هنوز پاس نشده → باطل کن
          await tx.check.update({
            where: { id: relatedCheck.id },
            data: {
              status: 'cancelled',
              description: `${relatedCheck.description || ''} [باطل شده — فاکتور ${invoice.number} حذف/ویرایش شد]`,
            },
          })
          console.log(`[Rollback] ✓ چک ${relatedCheck.checkNumber} باطل شد`)
        } else {
          console.warn(`[Rollback] ⚠️ چک ${relatedCheck.checkNumber} قبلاً ${relatedCheck.status} شده — نمی‌توان باطل کرد`)
        }
      }
    } catch (err: any) {
      console.warn(`[Rollback] Check rollback failed:`, err?.message)
    }
  }

  console.log(`[Rollback] تکمیل rollback فاکتور ${invoice.number}`)
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/purchase-invoices/[id]
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const paramsObj: any = ctx.params && typeof ctx.params?.then === 'function' ? await ctx.params : ctx.params
    const id = paramsObj?.id

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه فاکتور الزامی است' }, { status: 400 })
    }

    const invoice: any = await tenantDb.purchaseInvoice.findFirst({
      where: { id, tenantId },
    })

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'فاکتور یافت نشد' }, { status: 404 })
    }

    let items: any[] = []
    try {
      items = await tenantDb.purchaseInvoiceItem.findMany({
        where: { purchaseInvoiceId: id },
        orderBy: { id: 'asc' },
      })
      console.log(`[GET] پیدا شد ${items.length} آیتم برای فاکتور ${invoice.number}`)
    } catch (err: any) {
      console.warn(`[GET] خطا در گرفتن items:`, err?.message)
    }

    let supplier: any = null
    if (invoice.supplierId) {
      try {
        supplier = await tenantDb.supplier.findUnique({
          where: { id: invoice.supplierId },
          select: { id: true, name: true, code: true },
        })
      } catch (err: any) {
        console.warn(`[GET] خطا در گرفتن supplier:`, err?.message)
      }
    }

    let warehouse: any = null
    if (invoice.warehouseId) {
      try {
        warehouse = await tenantDb.warehouse.findUnique({
          where: { id: invoice.warehouseId },
          select: { id: true, name: true },
        })
      } catch (err: any) {
        console.warn(`[GET] خطا در گرفتن warehouse:`, err?.message)
      }
    }

    let journalEntry: any = null
    if (invoice.journalEntryId) {
      try {
        journalEntry = await tenantDb.journalEntry.findUnique({
          where: { id: invoice.journalEntryId },
          select: { id: true, number: true, status: true },
        })
      } catch (err: any) {
        console.warn(`[GET] خطا در گرفتن journalEntry:`, err?.message)
      }
    }

    let checkInfo: any = null
    if (invoice.paymentType === 'check') {
      try {
        checkInfo = await tenantDb.check.findFirst({
          where: { purchaseInvoiceId: id, tenantId },
          select: {
            id: true,
            status: true,
            checkNumber: true,
            bankName: true,
            branchName: true,
            dueDate: true,
            payeeName: true,
            amount: true,
          },
          orderBy: { createdAt: 'desc' },
        })
      } catch (err: any) {
        console.warn(`[GET] خطا در گرفتن checkInfo:`, err?.message)
      }
    }

    return NextResponse.json({
      success: true,
      data: { ...invoice, items, supplier, warehouse, journalEntry, checkInfo },
    })
  } catch (error: any) {
    console.error('[GET] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری فاکتور' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/purchase-invoices/[id]
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const paramsObj: any = ctx.params && typeof ctx.params?.then === 'function' ? await ctx.params : ctx.params
    const id = paramsObj?.id
    const { searchParams } = new URL(req.url)
    const hardDelete = searchParams.get('hardDelete') === 'true'

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه فاکتور الزامی است' }, { status: 400 })
    }

    const invoice = await tenantDb.purchaseInvoice.findFirst({ where: { id, tenantId } })
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'فاکتور یافت نشد' }, { status: 404 })
    }

    if (invoice.status === 'cancelled') {
      return NextResponse.json({ success: false, error: 'این فاکتور قبلاً لغو شده است' }, { status: 400 })
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client
    await txClient.$transaction(async (tx: any) => {
      await rollbackPurchaseInvoice(tx, invoice, tenantId)

      if (hardDelete) {
        await tx.purchaseInvoiceItem.deleteMany({ where: { purchaseInvoiceId: id } })
        await tx.purchaseInvoice.delete({ where: { id } })
        console.log(`[DELETE] فاکتور ${invoice.number} فیزیکی حذف شد`)
      } else {
        await tx.purchaseInvoice.update({
          where: { id },
          data: {
            status: 'cancelled',
            description: `${invoice.description || ''}\n[لغو شده در ${new Date().toISOString()}]`,
          },
        })
        console.log(`[DELETE] فاکتور ${invoice.number} لغو شد (soft delete)`)
      }
    })

    return NextResponse.json({
      success: true,
      message: `فاکتور خرید ${invoice.number} با موفقیت لغو شد. موجودی انبار، سند حسابداری و چک مرتبط برگشت خوردند.`,
    })
  } catch (error: any) {
    console.error('[DELETE] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: error?.message || 'خطا در حذف فاکتور' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/purchase-invoices/[id] — ویرایش فاکتور
//  ★ v8.9.2: استفاده کامل از getStandardAccountIds + پشتیبانی چک
// ═══════════════════════════════════════════════════════════════
export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const paramsObj: any = ctx.params && typeof ctx.params?.then === 'function' ? await ctx.params : ctx.params
    const id = paramsObj?.id
    const body = await req.json()
    const { items, supplierId, warehouseId, paymentType, description, invoiceDate, checkData } = body

    console.log(`[PUT] شروع ویرایش فاکتور id=${id}, items=${items?.length || 0}, invoiceDate=${invoiceDate || '(بدون تغییر)'}`)

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه فاکتور الزامی است' }, { status: 400 })
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ success: false, error: 'حداقل یک آیتم الزامی است' }, { status: 400 })
    }

    if (!warehouseId) {
      return NextResponse.json({ success: false, error: 'انتخاب انبار الزامی است' }, { status: 400 })
    }

    const oldInvoice = await tenantDb.purchaseInvoice.findFirst({ where: { id, tenantId } })
    if (!oldInvoice) {
      return NextResponse.json({ success: false, error: 'فاکتور یافت نشد' }, { status: 404 })
    }

    if (oldInvoice.status === 'cancelled') {
      return NextResponse.json({ success: false, error: 'امکان ویرایش فاکتور لغو شده وجود ندارد' }, { status: 400 })
    }

    const warehouse = await tenantDb.warehouse.findFirst({ where: { id: warehouseId, tenantId } })
    if (!warehouse) {
      return NextResponse.json({ success: false, error: 'انبار یافت نشد' }, { status: 400 })
    }

    // ── محاسبه مبالغ جدید ─────────────────────────────────
    let subTotal = 0, discountAmount = 0, taxAmount = 0
    const invoiceItems = (items || []).map((item: any) => {
      const lineTotal = item.quantity * item.unitPrice - (item.discountAmount || 0) + (item.taxAmount || 0)
      subTotal += item.quantity * item.unitPrice
      discountAmount += item.discountAmount || 0
      taxAmount += item.taxAmount || 0
      return {
        productId: item.productId || null,
        productName: item.productName || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0,
        taxAmount: item.taxAmount || 0,
        lineTotal,
      }
    })

    const totalAmount = subTotal - discountAmount + taxAmount
    
    // ★ v8.9.2: پشتیبانی از چک و نسیه (هر دو unpaid)
    const ptLower = (paymentType || 'cash').toLowerCase()
    const isCreditOrCheck = ptLower === 'credit' || ptLower === 'check'
    const paidAmount = isCreditOrCheck ? 0 : totalAmount
    const remainingAmount = isCreditOrCheck ? totalAmount : 0

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client
    const result = await txClient.$transaction(async (tx: any) => {
      // ═══════════════════════════════════════════════════
      // ۱. rollback فاکتور قدیمی
      // ═══════════════════════════════════════════════════
      console.log(`[PUT] مرحله ۱: rollback فاکتور قدیمی`)
      await rollbackPurchaseInvoice(tx, oldInvoice, tenantId)

      // ═══════════════════════════════════════════════════
      // ۲. حذف آیتم‌های قدیمی
      // ═══════════════════════════════════════════════════
      console.log(`[PUT] مرحله ۲: حذف آیتم‌های قدیمی`)
      await tx.purchaseInvoiceItem.deleteMany({ where: { purchaseInvoiceId: id } })

      // ═══════════════════════════════════════════════════
      // ۳. به‌روزرسانی فاکتور
      // ═══════════════════════════════════════════════════
      console.log(`[PUT] مرحله ۳: به‌روزرسانی فاکتور با اطلاعات جدید`)
      await tx.purchaseInvoice.update({
        where: { id },
        data: {
          supplierId: supplierId || null,
          warehouseId,
          paymentType: ptLower,
          ...(invoiceDate ? { invoiceDate: new Date(invoiceDate) } : {}),
          subTotal,
          discountAmount,
          taxAmount,
          totalAmount,
          paidAmount,        // ★ v8.9.2: برای چک هم 0
          remainingAmount,   // ★ v8.9.2: برای چک هم totalAmount
          description: description || null,
          status: 'confirmed',
          journalEntryId: null,
        },
      })

      // ═══════════════════════════════════════════════════
      // ۴. ایجاد آیتم‌های جدید + افزایش موجودی
      // ═══════════════════════════════════════════════════
      console.log(`[PUT] مرحله ۴: ایجاد ${invoiceItems.length} آیتم جدید`)
      for (let i = 0; i < invoiceItems.length; i++) {
        const item = invoiceItems[i]
        console.log(`[PUT] آیتم ${i + 1}/${invoiceItems.length}: productId=${item.productId}, qty=${item.quantity}`)

        await tx.purchaseInvoiceItem.create({
          data: {
            purchaseInvoiceId: id,
            productId: item.productId || null,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            taxAmount: item.taxAmount,
            lineTotal: item.lineTotal,
          },
        })

        if (item.productId) {
          const stockLevel = await tx.stockLevel.findUnique({
            where: { warehouseId_productId: { warehouseId, productId: item.productId } },
          })

          const netUnitCost = item.quantity > 0
            ? (item.unitPrice * item.quantity - item.discountAmount) / item.quantity
            : item.unitPrice

          if (stockLevel) {
            const oldTotalValue = Number(stockLevel.quantity) * Number(stockLevel.averageCost)
            const newTotalValue = oldTotalValue + (item.quantity * netUnitCost)
            const newTotalQty = Number(stockLevel.quantity) + item.quantity
            const newAvgCost = newTotalQty > 0 ? newTotalValue / newTotalQty : netUnitCost

            await tx.stockLevel.update({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              data: { quantity: { increment: item.quantity }, averageCost: newAvgCost },
            })
          } else {
            await tx.stockLevel.create({
              data: {
                tenantId,
                warehouseId,
                productId: item.productId,
                quantity: item.quantity,
                averageCost: netUnitCost,
              },
            })
          }

          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              toWarehouseId: warehouseId,
              quantity: item.quantity,
              unitCost: netUnitCost,
              movementType: 'purchase',
              referenceType: 'purchase_invoice',
              referenceId: id,
              description: `ویرایش فاکتور خرید ${oldInvoice.number}`,
            },
          })

          await tx.product.update({
            where: { id: item.productId },
            data: {
              purchasePrice: netUnitCost,
              currentStock: { increment: item.quantity },
            },
          })
        }
      }

      // ═══════════════════════════════════════════════════
      // ★ v8.9.2: ایجاد سند حسابداری جدید با getStandardAccountIds
      // ═══════════════════════════════════════════════════
      console.log(`[PUT] مرحله ۵: ایجاد سند حسابداری جدید`)
      try {
        const accIds = await getStandardAccountIds(tenantId)

        const inventoryAccountId = accIds.inventoryAccountId
        const cashAccountId = accIds.cashAccountId
        const payableAccountId = accIds.tradePurchasableId || accIds.payablesAccountId
        const checkPayableAccountId = accIds.checkPayableAccountId || (accIds as any).checkPayableId
        const vatAccountId = accIds.vatAccountId || accIds.taxAccountId

        if (inventoryAccountId) {
          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`
          const lines: any[] = []
          const netAmount = subTotal - discountAmount

          // بدهکار: موجودی کالا (افزایش دارایی)
          lines.push({
            accountId: inventoryAccountId,
            debit: netAmount,
            credit: 0,
            description: `بدهکار: خرید کالا - ویرایش فاکتور ${oldInvoice.number}`,
          })

          // بدهکار: مالیات ارزش افزوده (در صورت وجود)
          if (taxAmount > 0 && vatAccountId) {
            lines.push({
              accountId: vatAccountId,
              debit: taxAmount,
              credit: 0,
              description: `بدهکار: مالیات ارزش افزوده خرید - ویرایش فاکتور ${oldInvoice.number}`,
            })
          }

          // ★ v8.9.2: بستانکار — بر اساس روش پرداخت (نقدی/نسیه/چک)
          let creditAccountId: string | null = null
          let creditDescription = ''

          if (ptLower === 'check') {
            // چک: حساب ۲۰۵۰ (چک‌های پرداختنی)
            creditAccountId = checkPayableAccountId || payableAccountId || cashAccountId
            creditDescription = `بستانکار: چک پرداختنی - ویرایش فاکتور ${oldInvoice.number}`
          } else if (ptLower === 'credit') {
            // نسیه: حساب ۲۰۱۰ (بستانکاران تجاری)
            creditAccountId = payableAccountId || cashAccountId
            creditDescription = `بستانکار: بستانکاران تجاری - ویرایش فاکتور ${oldInvoice.number}`
          } else {
            // نقدی: حساب ۱۰۱۰ (صندوق)
            creditAccountId = cashAccountId
            creditDescription = `بستانکار: صندوق - ویرایش فاکتور ${oldInvoice.number}`
          }

          if (creditAccountId) {
            lines.push({
              accountId: creditAccountId,
              debit: 0,
              credit: totalAmount,
              description: creditDescription,
            })
          }

          if (lines.length >= 2) {
            const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0)
            const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0)

            const journalEntry = await tx.journalEntry.create({
              data: {
                number: jeNumber,
                date: invoiceDate ? new Date(invoiceDate) : new Date(),
                description: `سند خودکار بابت ویرایش فاکتور خرید ${oldInvoice.number}`,
                status: 'posted',
                sourceType: 'purchase_invoice',
                sourceId: id,
                totalDebit,
                totalCredit,
                createdBy: tenant.user?.id || null,
                tenantId,
                lines: { create: lines },
              },
            })

            await tx.purchaseInvoice.update({
              where: { id },
              data: { journalEntryId: journalEntry.id },
            })

            console.log(`[PUT] ✓ سند جدید ایجاد شد: ${jeNumber}`)
          }
        }
      } catch (jeErr: any) {
        console.warn(`[PUT] Auto journal entry failed:`, jeErr?.message)
      }

      // ═══════════════════════════════════════════════════
      // ★ v8.9.2: به‌روزرسانی Supplier (نسیه و چک)
      // ═══════════════════════════════════════════════════
      if (isCreditOrCheck && supplierId) {
        try {
          await tx.supplier.update({
            where: { id: supplierId },
            data: { currentBalance: { increment: totalAmount } },
          })
          console.log(`[PUT] ✓ Supplier.currentBalance +${totalAmount} (${ptLower})`)
        } catch (supErr: any) {
          console.warn(`[PUT] Supplier balance update failed:`, supErr?.message)
        }
      }

      // ═══════════════════════════════════════════════════
      // ★ v8.9.2: مدیریت چک پرداختنی (ایجاد/به‌روزرسانی/ابطال)
      // ═══════════════════════════════════════════════════
      try {
        const existingCheck = await tx.check.findFirst({
          where: { purchaseInvoiceId: id, tenantId },
        })

        if (ptLower === 'check' && checkData) {
          if (existingCheck) {
            // به‌روزرسانی چک موجود
            console.log(`[PUT] به‌روزرسانی چک موجود: ${existingCheck.id}`)
            await tx.check.update({
              where: { id: existingCheck.id },
              data: {
                checkNumber: checkData.checkNumber?.trim() || existingCheck.checkNumber,
                bankName: checkData.bankName?.trim() || existingCheck.bankName,
                branchName: checkData.branchName?.trim() || null,
                dueDate: checkData.dueDate ? new Date(checkData.dueDate) : existingCheck.dueDate,
                payeeName: checkData.payeeName?.trim() || null,
                amount: totalAmount,
                supplierId: supplierId || null,
                status: 'pending',
              },
            })
          } else {
            // ساخت چک جدید
            console.log(`[PUT] ایجاد چک جدید برای فاکتور ویرایش‌شده`)
            await tx.check.create({
              data: {
                tenantId,
                type: 'payable',
                checkNumber: checkData.checkNumber?.trim() || `CHK-${Date.now().toString().slice(-6)}`,
                bankName: checkData.bankName?.trim() || 'نامشخص',
                branchName: checkData.branchName?.trim() || null,
                amount: totalAmount,
                issueDate: new Date(),
                dueDate: checkData.dueDate ? new Date(checkData.dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                supplierId: supplierId || null,
                payeeName: checkData.payeeName?.trim() || null,
                description: `چک پرداختنی بابت فاکتور خرید ${oldInvoice.number}`,
                status: 'pending',
                purchaseInvoiceId: id,
              },
            })
          }
        } else if (ptLower !== 'check' && existingCheck) {
          // ★ v8.9.2: اگر نوع پرداخت از چک به چیز دیگر تغییر کرده → باطل کردن چک قبلی
          if (existingCheck.status === 'pending') {
            await tx.check.update({
              where: { id: existingCheck.id },
              data: {
                status: 'cancelled',
                purchaseInvoiceId: null,
                description: `${existingCheck.description || ''} [ابطال شده — نوع پرداخت از چک به ${ptLower} تغییر کرد]`,
              },
            })
            console.log(`[PUT] ✓ چک قبلی ${existingCheck.checkNumber} باطل شد (تغییر نوع پرداخت)`)
          } else {
            console.warn(`[PUT] ⚠️ چک ${existingCheck.checkNumber} قبلاً ${existingCheck.status} شده — نمی‌توان باطل کرد`)
          }
        }
      } catch (checkErr: any) {
        console.warn(`[PUT] Check handling failed:`, checkErr?.message)
      }

      console.log(`[PUT] ✓ ویرایش کامل شد`)
      return await tx.purchaseInvoice.findUnique({ where: { id } })
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: `فاکتور خرید ${oldInvoice.number} با موفقیت ویرایش شد`,
    })
  } catch (error: any) {
    console.error('[PUT] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: error?.message || 'خطا در ویرایش فاکتور' }, { status: 500 })
  }
})