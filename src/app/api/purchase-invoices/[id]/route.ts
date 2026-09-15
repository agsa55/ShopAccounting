// ============================================================================
// src/app/api/purchase-invoices/[id]/route.ts — v11.6.8 (Smart Delete)
// ★ فاکتور خرید: مشاهده، ویرایش، حذف هوشمند
// ════════════════════════════════════════════════════════════════════════════
// ★★★ v11.6.8 تغییرات مهم:
//   ★ منطق هوشمند DELETE:
//     - فاکتور پرداخت‌نشده: حذف فیزیکی کامل (فاکتور + سند + صندوق)
//     - فاکتور پرداخت‌شده: فقط لغو (حفظ حسابرسی)
//   ★ rollback کامل تراکنش‌های صندوق (CashMovement)
//   ★ حذف فیزیکی سند حسابداری (برای فاکتور پرداخت‌نشده)
//   ★ پشتیبانی از force=true برای حذف اجباری توسط ادمین
// ════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'
import { generateJournalNumber } from '@/lib/journal-number-generator'

// ═══════════════════════════════════════════════════════════════
//  Helper: rollback کامل یک فاکتور خرید (با پاکسازی صندوق و سند)
//  ★ v11.6.8: پشتیبانی از hardDelete (حذف فیزیکی سند)
// ═══════════════════════════════════════════════════════════════
async function rollbackPurchaseInvoice(
  tx: any, 
  invoice: any, 
  tenantId: string,
  options: { hardDeleteJournal?: boolean } = {}
) {
  const invoiceId = invoice.id
  const warehouseId = invoice.warehouseId
  const pt = (invoice.paymentType || 'cash').toLowerCase()
  const hardDeleteJournal = options.hardDeleteJournal ?? false
  
  console.log(`[Rollback] 🔄 شروع rollback فاکتور ${invoice.number} (paymentType=${pt}, hardDeleteJournal=${hardDeleteJournal})`)

  // ── ۱. حذف تراکنش‌های صندوق (بسیار مهم!) ─────────────
  try {
    const deletedCashMovements = await tx.cashMovement.deleteMany({
      where: { 
        OR: [
          { invoiceId: invoiceId },  // برای فاکتور فروش
          { description: { contains: invoice.number } },  // برای فاکتور خرید
        ],
        tenantId,
      },
    })
    console.log(`[Rollback] ✅ CashMovements حذف شد: ${deletedCashMovements.count} رکورد`)
  } catch (cashErr: any) {
    console.warn(`[Rollback] ⚠️ CashMovement cleanup failed:`, cashErr?.message)
  }

  // ── ۲. بازگشت موجودی کالا ───────────────────────────────
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

  // ── ۳. مدیریت سند حسابداری ─────────────────────────────
  // ★ v11.6.8: بر اساس حالت، سند را حذف فیزیکی یا فقط cancelled کنیم
  if (hardDeleteJournal) {
    // حذف فیزیکی سند (برای فاکتور پرداخت‌نشده)
    try {
      const journalEntries = await tx.journalEntry.findMany({
        where: { tenantId, sourceId: invoiceId },
        select: { id: true },
      })

      for (const je of journalEntries) {
        // ابتدا خطوط سند را حذف می‌کنیم (به خاطر foreign key)
        await tx.journalEntryLine.deleteMany({ 
          where: { journalEntryId: je.id } 
        }).catch(() => {})
        
        await tx.journalEntry.delete({ 
          where: { id: je.id } 
        }).catch(() => {})
      }

      console.log(`[Rollback] ✅ Journal Entries فیزیکی حذف شد: ${journalEntries.length} سند`)
    } catch (jeErr: any) {
      console.warn(`[Rollback] ⚠️ Hard delete journal failed:`, jeErr?.message)
    }
  } else {
    // فقط cancelled (برای فاکتور پرداخت‌شده - حفظ حسابرسی)
    if (invoice.journalEntryId) {
      await tx.journalEntry.update({
        where: { id: invoice.journalEntryId },
        data: {
          isCancelled: true,
          cancelledAt: new Date(),
          status: 'cancelled',
          description: `ابطال شده — فاکتور خرید ${invoice.number} لغو شد`,
        },
      }).catch(err => console.warn(`[Rollback] خطا در JournalEntry.update:`, err?.message))
      console.log(`[Rollback] 📋 JournalEntry ${invoice.journalEntryId} cancelled شد`)
    }

    // ابطال سندهای مرتبط (بدون journalEntryId مستقیم)
    await tx.journalEntry.updateMany({
      where: {
        tenantId,
        sourceId: invoiceId,
        sourceType: { in: ['purchase_invoice', 'service_purchase'] },
        status: 'posted',
      },
      data: {
        isCancelled: true,
        cancelledAt: new Date(),
        status: 'cancelled',
        description: `ابطال شده — فاکتور خرید ${invoice.number} لغو شد`,
      },
    }).catch(() => {})
  }

  // ── ۴. کاهش بدهی تامین‌کننده (نسیه و چک) ──────────────────
  if ((pt === 'credit' || pt === 'check') && invoice.supplierId) {
    await tx.supplier.update({
      where: { id: invoice.supplierId },
      data: { currentBalance: { decrement: Number(invoice.totalAmount) } },
    }).catch(err => console.warn(`[Rollback] خطا در Supplier.update:`, err?.message))
    console.log(`[Rollback] ✓ Supplier.currentBalance -${invoice.totalAmount}`)
  }

  // ── ۵. باطل کردن چک مرتبط (فقط برای چک) ──────────────────
  if (pt === 'check') {
    try {
      const relatedCheck = await tx.check.findFirst({
        where: { purchaseInvoiceId: invoiceId, tenantId },
      })
      if (relatedCheck) {
        if (relatedCheck.status === 'pending') {
          if (hardDeleteJournal) {
            // حذف فیزیکی چک (برای فاکتور پرداخت‌نشده)
            await tx.check.delete({ where: { id: relatedCheck.id } })
            console.log(`[Rollback] ✓ چک ${relatedCheck.checkNumber} فیزیکی حذف شد`)
          } else {
            await tx.check.update({
              where: { id: relatedCheck.id },
              data: {
                status: 'cancelled',
                description: `${relatedCheck.description || ''} [باطل شده — فاکتور ${invoice.number} لغو شد]`,
              },
            })
            console.log(`[Rollback] ✓ چک ${relatedCheck.checkNumber} باطل شد`)
          }
        } else {
          console.warn(`[Rollback] ⚠️ چک ${relatedCheck.checkNumber} قبلاً ${relatedCheck.status} شده`)
        }
      }
    } catch (err: any) {
      console.warn(`[Rollback] Check rollback failed:`, err?.message)
    }
  }

  console.log(`[Rollback] ✅ تکمیل rollback فاکتور ${invoice.number}`)
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
//  DELETE /api/purchase-invoices/[id] (v11.6.8 - Smart Delete)
//  ★ منطق هوشمند:
//    - فاکتور پرداخت‌نشده → حذف فیزیکی کامل
//    - فاکتور پرداخت‌شده → فقط لغو (حفظ حسابرسی)
//    - force=true → حذف فیزیکی اجباری (برای ادمین)
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const paramsObj: any = ctx.params && typeof ctx.params?.then === 'function' ? await ctx.params : ctx.params
    const id = paramsObj?.id
    const { searchParams } = new URL(req.url)
    const force = searchParams.get('force') === 'true'

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه فاکتور الزامی است' }, { status: 400 })
    }

    const invoice: any = await tenantDb.purchaseInvoice.findFirst({ 
      where: { id, tenantId },
      include: { items: true },
    })
    
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'فاکتور یافت نشد' }, { status: 404 })
    }

    if (invoice.status === 'cancelled' && !force) {
      return NextResponse.json({ success: false, error: 'این فاکتور قبلاً لغو شده است' }, { status: 400 })
    }

    // ═══════════════════════════════════════════════════════════════
    // منطق هوشمند: حذف کامل یا لغو؟
    // ═══════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════
// ★ v11.7.0: منطق استاندارد حسابداری
// ═══════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════
    // منطق هوشمند: حذف کامل یا لغو؟
    // ═══════════════════════════════════════════════════════════════
    const paidAmount = Number(invoice.paidAmount || 0)
    const isPaid = paidAmount > 0
    
    // ★ v11.7.0: منطق استاندارد حسابداری
    // حذف فیزیکی فقط برای ادمین با پارامتر force
    // همه فاکتورهای ثبت‌شده فقط لغو می‌شوند
    const isAdmin = tenant.user?.role === 'Admin' || tenant.user?.role === 'admin'
    const canHardDelete = force && isAdmin  // فقط ادمین با تأیید ویژه

    if (force && !isAdmin) {
      return NextResponse.json({
        success: false,
        error: 'حذف فیزیکی فقط توسط ادمین امکان‌پذیر است',
      }, { status: 403 })
    }

    console.log(`[DELETE] 🎯 Invoice ${invoice.number}: paidAmount=${paidAmount}, isPaid=${isPaid}, force=${force}, isAdmin=${isAdmin}, canHardDelete=${canHardDelete}`)

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    if (canHardDelete) {
      // ═══ حذف فیزیکی کامل ═══
      console.log(`[DELETE] 🗑️ HARD DELETE: فاکتور ${invoice.number}`)

      await txClient.$transaction(async (tx: any) => {
        // ۱. rollback کامل با حذف فیزیکی سند
        await rollbackPurchaseInvoice(tx, invoice, tenantId, { hardDeleteJournal: true })

        // ۲. حذف آیتم‌های فاکتور
        await tx.purchaseInvoiceItem.deleteMany({ 
          where: { purchaseInvoiceId: id } 
        })

        // ۳. حذف خود فاکتور
        await tx.purchaseInvoice.delete({ 
          where: { id } 
        })
      })

      console.log(`[DELETE] ✅ Invoice ${invoice.number} HARD DELETED`)

      return NextResponse.json({
        success: true,
        action: 'hard_deleted',
        message: `فاکتور ${invoice.number} به طور کامل حذف شد (فاکتور + سند حسابداری + تراکنش صندوق)`,
      })

    } else {
      // ═══ فقط لغو (فاکتور پرداخت‌شده) ═══
      console.log(`[DELETE] ⚠️ CANCEL ONLY: فاکتور ${invoice.number} (پرداخت‌شده)`)

      await txClient.$transaction(async (tx: any) => {
        // ۱. rollback با cancelled کردن سند (نه حذف فیزیکی)
        await rollbackPurchaseInvoice(tx, invoice, tenantId, { hardDeleteJournal: false })

        // ۲. تغییر وضعیت فاکتور به cancelled
        await tx.purchaseInvoice.update({
          where: { id },
          data: {
            status: 'cancelled',
            description: `${invoice.description || ''}\n[لغو شده در ${new Date().toLocaleString('fa-IR')}]`,
          },
        })
      })

      console.log(`[DELETE] ✅ Invoice ${invoice.number} CANCELLED (paid invoice)`)

      return NextResponse.json({
        success: true,
        action: 'cancelled',
        message: `فاکتور ${invoice.number} لغو شد. (چون پرداخت شده بود، برای حفظ حسابرسی حذف فیزیکی نشد ولی موجودی و چک و سند حسابداری برگشت خوردند)`,
      })
    }

  } catch (error: any) {
    console.error('[DELETE] Error:', error?.message || error)
    return NextResponse.json({ 
      success: false, 
      error: error?.message || 'خطا در حذف فاکتور' 
    }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/purchase-invoices/[id] — ویرایش فاکتور
//  ★ v8.9.3: تشخیص نوع فاکتور (کالا vs خدمات) + ابطال ایمن سند
// ═══════════════════════════════════════════════════════════════
export const PUT = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const paramsObj: any = ctx.params && typeof ctx.params?.then === 'function' ? await ctx.params : ctx.params
    const id = paramsObj?.id
    const body = await req.json()
    const { items, supplierId, warehouseId, paymentType, description, invoiceDate, checkData } = body

    console.log(`[PUT v11.6.8] شروع ویرایش فاکتور id=${id}, items=${items?.length || 0}`)

    if (!id) {
      return NextResponse.json({ success: false, error: 'شناسه فاکتور الزامی است' }, { status: 400 })
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ success: false, error: 'حداقل یک آیتم الزامی است' }, { status: 400 })
    }

    if (!warehouseId) {
      return NextResponse.json({ success: false, error: 'انتخاب انبار الزامی است' }, { status: 400 })
    }

    const oldInvoice: any = await tenantDb.purchaseInvoice.findFirst({ where: { id, tenantId } })
    if (!oldInvoice) {
      return NextResponse.json({ success: false, error: 'فاکتور یافت نشد' }, { status: 404 })
    }

    if (oldInvoice.status === 'cancelled') {
      return NextResponse.json({ success: false, error: 'امکان ویرایش فاکتور لغو شده وجود ندارد' }, { status: 400 })
    }

    const invoiceType = oldInvoice.invoiceType || 'purchase'
    const isServiceInvoice = invoiceType === 'service'
    console.log(`[PUT v11.6.8] نوع فاکتور: ${invoiceType} (isService=${isServiceInvoice})`)

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
        productName: item.productName || item.serviceName || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0,
        taxAmount: item.taxAmount || 0,
        lineTotal,
      }
    })

    const totalAmount = subTotal - discountAmount + taxAmount
    
    const ptLower = (paymentType || 'cash').toLowerCase()
    const isCreditOrCheck = ptLower === 'credit' || ptLower === 'check'
    const paidAmount = isCreditOrCheck ? 0 : totalAmount
    const remainingAmount = isCreditOrCheck ? totalAmount : 0

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client
    const result = await txClient.$transaction(async (tx: any) => {
      // ═══════════════════════════════════════════════════
      // ۱. rollback فاکتور قدیمی
      // ═══════════════════════════════════════════════════
      console.log(`[PUT v11.6.8] مرحله ۱: rollback فاکتور قدیمی`)
      // برای ویرایش، سند را cancelled می‌کنیم (نه حذف فیزیکی) چون فاکتور قبلاً وجود دارد
      await rollbackPurchaseInvoice(tx, oldInvoice, tenantId, { hardDeleteJournal: false })

      // ═══════════════════════════════════════════════════
      // ۲. حذف آیتم‌های قدیمی
      // ═══════════════════════════════════════════════════
      console.log(`[PUT v11.6.8] مرحله ۲: حذف آیتم‌های قدیمی`)
      await tx.purchaseInvoiceItem.deleteMany({ where: { purchaseInvoiceId: id } })

      // ═══════════════════════════════════════════════════
      // ۳. به‌روزرسانی فاکتور
      // ═══════════════════════════════════════════════════
      console.log(`[PUT v11.6.8] مرحله ۳: به‌روزرسانی فاکتور`)
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
          paidAmount,
          remainingAmount,
          description: description || null,
          status: 'confirmed',
          journalEntryId: null,
        },
      })

      // ═══════════════════════════════════════════════════
      // ۴. ایجاد آیتم‌های جدید + مدیریت موجودی (فقط برای کالا)
      // ═══════════════════════════════════════════════════
      console.log(`[PUT v11.6.8] مرحله ۴: ایجاد ${invoiceItems.length} آیتم جدید`)
      
      for (let i = 0; i < invoiceItems.length; i++) {
        const item = invoiceItems[i]

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

        if (item.productId && !isServiceInvoice) {
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
      // ۵. ایجاد سند حسابداری جدید
      // ═══════════════════════════════════════════════════
      console.log(`[PUT v11.6.8] مرحله ۵: ایجاد سند حسابداری جدید`)
      try {
     const accIds = await getStandardAccountIds(tenantId)
// ★ v11.7.1: تولید شماره منحصر به فرد سند (جلوگیری از تکرار)
const jeNumber = await generateJournalNumber(tx, tenantId)
console.log(`[PUT v11.7.1] 📝 Generated journal number: ${jeNumber}`)
        const lines: any[] = []
        const netAmount = subTotal - discountAmount

        if (isServiceInvoice) {
          const serviceCategory = oldInvoice.description?.includes('تعمیرات') ? 'repair' : 'service'
          
          const accounts = await tx.account.findMany({ 
            where: { tenantId, isActive: true },
            select: { id: true, code: true, name: true }
          })
          
          const expenseAccountId = serviceCategory === 'repair' 
            ? accounts.find((a: any) => a.code === '5160')?.id
            : accounts.find((a: any) => a.code === '5170')?.id
          
          if (expenseAccountId) {
            lines.push({
              accountId: expenseAccountId,
              debit: netAmount,
              credit: 0,
              description: `بدهکار: هزینه ${serviceCategory === 'repair' ? 'تعمیرات' : 'خدمات'} - ویرایش فاکتور ${oldInvoice.number}`,
            })
          }
        } else {
          if (accIds.inventoryAccountId) {
            lines.push({
              accountId: accIds.inventoryAccountId,
              debit: netAmount,
              credit: 0,
              description: `بدهکار: خرید کالا - ویرایش فاکتور ${oldInvoice.number}`,
            })
          }
        }

        const vatAccountId = accIds.vatAccountId || accIds.taxAccountId
        if (taxAmount > 0 && vatAccountId) {
          lines.push({
            accountId: vatAccountId,
            debit: taxAmount,
            credit: 0,
            description: `بدهکار: مالیات ارزش افزوده خرید - ویرایش فاکتور ${oldInvoice.number}`,
          })
        }

        const cashAccountId = accIds.cashAccountId
        const payableAccountId = accIds.tradePurchasableId || accIds.payablesAccountId
        const checkPayableAccountId = accIds.checkPayableAccountId || (accIds as any).checkPayableId
        
        let creditAccountId: string | null = null
        let creditDescription = ''

        if (ptLower === 'check') {
          creditAccountId = checkPayableAccountId || payableAccountId || cashAccountId
          creditDescription = `بستانکار: چک پرداختنی - ویرایش فاکتور ${oldInvoice.number}`
        } else if (ptLower === 'credit') {
          creditAccountId = payableAccountId || cashAccountId
          creditDescription = `بستانکار: بستانکاران تجاری - ویرایش فاکتور ${oldInvoice.number}`
        } else {
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
              description: `سند خودکار بابت ویرایش فاکتور ${isServiceInvoice ? 'خدمات' : 'خرید'} ${oldInvoice.number}`,
              status: 'posted',
              sourceType: isServiceInvoice ? 'service_purchase' : 'purchase_invoice',
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

          console.log(`[PUT v11.6.8] ✓ سند جدید ایجاد شد: ${jeNumber}`)
        }
      } catch (jeErr: any) {
        console.warn(`[PUT v11.6.8] Auto journal entry failed:`, jeErr?.message)
      }

      // ═══════════════════════════════════════════════════
      // ۶. به‌روزرسانی Supplier و Check
      // ═══════════════════════════════════════════════════
      if (isCreditOrCheck && supplierId) {
        try {
          await tx.supplier.update({
            where: { id: supplierId },
            data: { currentBalance: { increment: totalAmount } },
          })
        } catch (supErr: any) {
          console.warn(`[PUT v11.6.8] Supplier balance update failed:`, supErr?.message)
        }
      }

      try {
        const existingCheck = await tx.check.findFirst({
          where: { purchaseInvoiceId: id, tenantId },
        })

        if (ptLower === 'check' && checkData) {
          if (existingCheck) {
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
          if (existingCheck.status === 'pending') {
            await tx.check.update({
              where: { id: existingCheck.id },
              data: {
                status: 'cancelled',
                purchaseInvoiceId: null,
                description: `${existingCheck.description || ''} [ابطال شده — نوع پرداخت تغییر کرد]`,
              },
            })
          }
        }
      } catch (checkErr: any) {
        console.warn(`[PUT v11.6.8] Check handling failed:`, checkErr?.message)
      }

      console.log(`[PUT v11.6.8] ✓ ویرایش کامل شد`)
      return await tx.purchaseInvoice.findUnique({ where: { id } })
    })

    return NextResponse.json({
      success: true,
      data: result,
      message: `فاکتور ${oldInvoice.number} با موفقیت ویرایش شد`,
    })
  } catch (error: any) {
    console.error('[PUT v11.6.8] Error:', error?.message || error)
    return NextResponse.json({ success: false, error: error?.message || 'خطا در ویرایش فاکتور' }, { status: 500 })
  }
})