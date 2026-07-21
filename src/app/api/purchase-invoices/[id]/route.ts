// ============================================================================
// src/app/api/purchase-invoices/[id]/route.ts — GET / PUT / DELETE
// فاکتور خرید: مشاهده، ویرایش، حذف (با rollback کامل موجودی و سند)
// ============================================================================
// ★★★ v6.1.4: اضافه شدن console.log برای ایجاد آیتم‌های جدید (برای خطایابی)
// ★★★ v6.1.3: GET بدون include (کوئری‌های جداگانه برای items/supplier/warehouse)
// ★★★ Next.js 16: params یک Promise است و باید await شود
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  Helper: rollback کامل یک فاکتور خرید
// ═══════════════════════════════════════════════════════════════
async function rollbackPurchaseInvoice(tx: any, invoice: any, tenantId: string) {
  const invoiceId = invoice.id
  const warehouseId = invoice.warehouseId

  console.log(`[Rollback] شروع rollback فاکتور ${invoice.number} (id=${invoiceId})`)

  const items = await tx.purchaseInvoiceItem.findMany({
    where: { purchaseInvoiceId: invoiceId },
  })
  console.log(`[Rollback] پیدا شد ${items.length} آیتم برای rollback`)

  for (const item of items) {
    if (!item.productId) {
      console.warn(`[Rollback] آیتم بدون productId: ${item.productName} — رد شد`)
      continue
    }

    console.log(`[Rollback] کاهش Product.currentStock: productId=${item.productId}, quantity=${item.quantity}`)
    await tx.product.update({
      where: { id: item.productId },
      data: { currentStock: { decrement: item.quantity } },
    }).catch(err => console.error(`[Rollback] خطا در Product.update:`, err?.message))

    const stockLevel = await tx.stockLevel.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: item.productId } },
    }).catch(() => null)

    if (stockLevel) {
      const remainingQty = stockLevel.quantity - item.quantity
      const newAvgCost = remainingQty > 0 ? stockLevel.averageCost : 0
      console.log(`[Rollback] کاهش StockLevel: productId=${item.productId}, qty=${item.quantity} → ${remainingQty}`)
      await tx.stockLevel.update({
        where: { warehouseId_productId: { warehouseId, productId: item.productId } },
        data: { quantity: { decrement: item.quantity }, averageCost: newAvgCost },
      }).catch(err => console.error(`[Rollback] خطا در StockLevel.update:`, err?.message))
    }

    await tx.stockMovement.deleteMany({
      where: { referenceType: 'purchase_invoice', referenceId: invoiceId, productId: item.productId },
    }).catch(err => console.warn(`[Rollback] خطا در StockMovement.deleteMany:`, err?.message))
  }

  if (invoice.journalEntryId) {
    console.log(`[Rollback] ابطال JournalEntry: ${invoice.journalEntryId}`)
    await tx.journalEntry.update({
      where: { id: invoice.journalEntryId },
      data: { status: 'cancelled', description: `ابطال شده — فاکتور خرید ${invoice.number} حذف/ویرایش شد` },
    }).catch(err => console.warn(`[Rollback] خطا در JournalEntry.update:`, err?.message))
  }

  if (invoice.paymentType === 'credit' && invoice.supplierId) {
    console.log(`[Rollback] کاهش Supplier.currentBalance: supplierId=${invoice.supplierId}, amount=${invoice.totalAmount}`)
    await tx.supplier.update({
      where: { id: invoice.supplierId },
      data: { currentBalance: { decrement: invoice.totalAmount } },
    }).catch(err => console.warn(`[Rollback] خطا در Supplier.update:`, err?.message))
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

    return NextResponse.json({
      success: true,
      data: { ...invoice, items, supplier, warehouse, journalEntry },
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
      message: `فاکتور خرید ${invoice.number} با موفقیت لغو شد. موجودی انبار و سند حسابداری برگشت خوردند.`,
    })
  } catch (error: any) {
    console.error('[DELETE] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: error?.message || 'خطا در حذف فاکتور' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/purchase-invoices/[id] — ویرایش فاکتور
// ═══════════════════════════════════════════════════════════════
export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const paramsObj: any = ctx.params && typeof ctx.params?.then === 'function' ? await ctx.params : ctx.params
    const id = paramsObj?.id
    const body = await req.json()
    const { items, supplierId, warehouseId, paymentType, description, invoiceDate } = body

    console.log(`[PUT] شروع ویرایش فاکتور id=${id}, items count=${items?.length || 0}, invoiceDate=${invoiceDate || '(بدون تغییر)'}`)

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه فاکتور الزامی است' }, { status: 400 })
    }

    if (!items || items.length === 0) {
      console.warn(`[PUT] items خالی است!`)
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

    // ★ محاسبه مبالغ جدید
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
    const isCredit = (paymentType || 'cash').toLowerCase() === 'credit'
    const paidAmount = isCredit ? 0 : totalAmount
    const remainingAmount = isCredit ? totalAmount : 0

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    const result = await txClient.$transaction(async (tx: any) => {
      // ۱. rollback فاکتور قدیمی
      console.log(`[PUT] مرحله ۱: rollback فاکتور قدیمی`)
      await rollbackPurchaseInvoice(tx, oldInvoice, tenantId)

      // ۲. حذف آیتم‌های قدیمی
      console.log(`[PUT] مرحله ۲: حذف آیتم‌های قدیمی`)
      await tx.purchaseInvoiceItem.deleteMany({ where: { purchaseInvoiceId: id } })

      // ۳. به‌روزرسانی فاکتور
      console.log(`[PUT] مرحله ۳: به‌روزرسانی فاکتور با اطلاعات جدید`)
      await tx.purchaseInvoice.update({
        where: { id },
        data: {
          supplierId: supplierId || null,
          warehouseId,
          paymentType: (paymentType || 'cash').toLowerCase(),
          // ★★★ v6.2.1: به‌روزرسانی تاریخ فاکتور
          ...(invoiceDate ? { invoiceDate: new Date(invoiceDate) } : {}),
          subTotal,
          discountAmount,
          taxAmount,
          totalAmount,
          paidAmount,
          remainingAmount,
          description: description || null,
          status: 'confirmed',
          journalEntryId: null,
        },
      })

      // ۴. ایجاد آیتم‌های جدید + افزایش موجودی
      console.log(`[PUT] مرحله ۴: ایجاد ${invoiceItems.length} آیتم جدید`)
      for (let i = 0; i < invoiceItems.length; i++) {
        const item = invoiceItems[i]
        console.log(`[PUT] آیتم ${i + 1}/${invoiceItems.length}: productId=${item.productId}, qty=${item.quantity}, price=${item.unitPrice}`)

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
            const oldTotalValue = stockLevel.quantity * stockLevel.averageCost
            const newTotalValue = oldTotalValue + (item.quantity * netUnitCost)
            const newTotalQty = stockLevel.quantity + item.quantity
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

          console.log(`[PUT] به‌روزرسانی Product.currentStock: productId=${item.productId}, +${item.quantity}`)
          await tx.product.update({
            where: { id: item.productId },
            data: {
              purchasePrice: netUnitCost,
              currentStock: { increment: item.quantity },
            },
          })
        }
      }

      // ۵. ایجاد سند حسابداری جدید
      console.log(`[PUT] مرحله ۵: ایجاد سند حسابداری جدید`)
      try {
        const accounts = await tx.account.findMany({ where: { tenantId } })
        let inventoryAccountId: string | null = null
        let cashAccountId: string | null = null
        let payableAccountId: string | null = null
        let taxAccountId: string | null = null

        for (const acc of accounts) {
          const code = (acc.code || '').toLowerCase()
          const type = (acc.type || '').toLowerCase()
          const name = (acc.name || '').toLowerCase()

          if (!inventoryAccountId && (type === 'inventory' || code.startsWith('120') || name.includes('موجودی') || name.includes('انبار'))) {
            inventoryAccountId = acc.id
          }
          if (!cashAccountId && (type === 'cash' || type === 'bank' || code.startsWith('110') || name.includes('صندوق') || name.includes('بانک'))) {
            cashAccountId = acc.id
          }
          if (!payableAccountId && (type === 'payable' || type === 'accounts_payable' || code.startsWith('210') || name.includes('بدهکاران') || name.includes('تامین'))) {
            payableAccountId = acc.id
          }
          if (!taxAccountId && (type === 'tax' || code.startsWith('190') || name.includes('مالیات'))) {
            taxAccountId = acc.id
          }
        }

        if (inventoryAccountId) {
          const jeCount = await tx.journalEntry.count({ where: { tenantId } })
          const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

          const lines: any[] = []
          const netAmount = subTotal - discountAmount
          lines.push({
            accountId: inventoryAccountId,
            debit: netAmount,
            credit: 0,
            description: `بدهکار: خرید کالا - ویرایش فاکتور ${oldInvoice.number}`,
          })

          if (taxAmount > 0 && taxAccountId) {
            lines.push({
              accountId: taxAccountId,
              debit: taxAmount,
              credit: 0,
              description: `بدهکار: مالیات خرید - ویرایش فاکتور ${oldInvoice.number}`,
            })
          }

          const creditAccountId = isCredit ? (payableAccountId || cashAccountId) : cashAccountId
          if (creditAccountId) {
            lines.push({
              accountId: creditAccountId,
              debit: 0,
              credit: totalAmount,
              description: `بستانکار: ${isCredit ? 'بدهکاران تجاری' : 'صندوق'} - ویرایش فاکتور خرید ${oldInvoice.number}`,
            })
          }

          if (lines.length >= 2) {
            const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
            const totalCredit = lines.reduce((s, l) => s + l.credit, 0)

            const journalEntry = await tx.journalEntry.create({
              data: {
                number: jeNumber,
                date: new Date(),
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
            console.log(`[PUT] سند جدید ایجاد شد: ${jeNumber}`)
          }
        }
      } catch (jeErr: any) {
        console.warn(`[PUT] Auto journal entry failed:`, jeErr?.message)
      }

      // ۶. به‌روزرسانی Supplier
      if (isCredit && supplierId) {
        try {
          await tx.supplier.update({
            where: { id: supplierId },
            data: { currentBalance: { increment: totalAmount } },
          })
        } catch (supErr: any) {
          console.warn(`[PUT] Supplier balance update failed:`, supErr?.message)
        }
      }

      console.log(`[PUT] ویرایش کامل شد`)
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
