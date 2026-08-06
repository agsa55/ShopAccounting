// ============================================================================
// src/app/api/invoices/route.ts — GET/POST/PUT/DELETE (v7.1 ★★★ Final Fixed)
// ----------------------------------------------------------------------------
// ★★★ v7.1: اصلاح نهایی نام فیلدها مطابق با schema.prisma
//   ★ invoiceItem: حذف tenantId، اضافه شدن productName
//   ★ invoicePayment: تغییر paymentDate به paidAt و referenceNumber به paymentRef
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'
import type { PlanTier } from '@/lib/plan-features'

// ─── تولید توکن پورتال ────────────────────────────
function generatePortalToken(): string {
  const uuid = randomUUID().replace(/-/g, '')
  const ts = Date.now().toString(36)
  return `${uuid}${ts}`.slice(0, 40)
}

// ─── ایجاد سند حسابداری خودکار ────────────────────────────
async function createAutoJournalEntry(
  tx: any,
  tenantId: string,
  invoice: any,
  invoiceItems: any[],
  paymentType: string,
  planTier: PlanTier,
  totalCogs: number
) {
  try {
    const totalAmount = invoice.totalAmount || 0
    if (totalAmount <= 0) return

    const jeCount = await tx.journalEntry.count({ where: { tenantId } })
    const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

    let cashAccountId: string | null = null
    let salesAccountId: string | null = null
    let cogsAccountId: string | null = null
    let inventoryAccountId: string | null = null
    let receivablesAccountId: string | null = null
    let vatAccountId: string | null = null

    try {
      const accountIds = await getStandardAccountIds(tenantId)
      cashAccountId = accountIds.cashAccountId
      salesAccountId = accountIds.salesAccountId
      cogsAccountId = accountIds.cogsAccountId
      inventoryAccountId = accountIds.inventoryAccountId
      receivablesAccountId = accountIds.receivablesAccountId
      vatAccountId = accountIds.vatAccountId || accountIds.taxAccountId
    } catch (err: any) {
      console.warn('[Invoices] Could not find/seed accounts for journal entry:', err?.message)
    }

    const lines: any[] = []
    const isCreditOrInstallment = paymentType === 'credit' || paymentType === 'installment'
    const netSales = invoice.subTotal - invoice.discountAmount

    const debitAccountId = isCreditOrInstallment ? (receivablesAccountId || cashAccountId) : cashAccountId
    if (debitAccountId) lines.push({ accountId: debitAccountId, debit: totalAmount, credit: 0, description: 'بدهکار: بابت فاکتور فروش' })
    if (salesAccountId) lines.push({ accountId: salesAccountId, debit: 0, credit: netSales, description: 'بستانکار: درآمد فروش' })
    if (invoice.taxAmount > 0 && vatAccountId) {
      lines.push({ accountId: vatAccountId, debit: 0, credit: invoice.taxAmount, description: 'بستانکار: مالیات بر ارزش افزوده فروش' })
    }

    if (totalCogs > 0 && cogsAccountId && inventoryAccountId) {
      lines.push({ accountId: cogsAccountId, debit: totalCogs, credit: 0, description: 'بدهکار: بهای تمام شده کالای فروش رفته' })
      lines.push({ accountId: inventoryAccountId, debit: 0, credit: totalCogs, description: 'بستانکار: خروج از موجودی کالا' })
    }

    if (lines.length >= 2) {
      const totalDebit = lines.reduce((sum: number, l: any) => sum + l.debit, 0)
      const totalCredit = lines.reduce((sum: number, l: any) => sum + l.credit, 0)

      await tx.journalEntry.create({
        data: {
          number: jeNumber,
          date: invoice.invoiceDate || invoice.createdAt || new Date(),
          description: `سند خودکار بابت فاکتور ${invoice.number}${isCreditOrInstallment ? ' (نسیه/قسطی)' : ''}`,
          status: 'posted', sourceType: 'invoice', sourceId: invoice.id,
          totalDebit, totalCredit, createdBy: invoice.cashierId, tenantId,
          lines: { create: lines },
        },
      })
    }
  } catch (error: any) {
    console.error('[Invoices] Failed to create auto journal entry:', error?.message)
  }
}

// ─── ایجاد پلن قسطی ──────────────────────────────────────
async function createInstallmentPlan(tx: any, tenantId: string, invoice: any, installmentData: any) {
  try {
    const { downPayment, numberOfInstallments, interestRate, installmentPeriod, totalWithInterest, installmentAmount, remainingAmount } = installmentData
    const periodDays: Record<string, number> = { monthly: 30, biweekly: 14, weekly: 7 }
    const daysPerPeriod = periodDays[installmentPeriod] || 30

    const plan = await tx.installmentPlan.create({
      data: {
        invoiceId: invoice.id, customerId: invoice.customerId || null,
        totalAmount: invoice.totalAmount, downPayment: downPayment || 0,
        remainingAmount: remainingAmount || 0, interestRate: interestRate || 0,
        totalWithInterest: totalWithInterest || 0,
        numberOfInstallments: numberOfInstallments || 1,
        installmentAmount: installmentAmount || 0,
        installmentPeriod: installmentPeriod || 'monthly',
        status: 'active', paidInstallments: 0,
        totalPaidAmount: downPayment || 0,
        nextDueDate: new Date(Date.now() + daysPerPeriod * 24 * 60 * 60 * 1000),
        tenantId,
      },
    })

    for (let i = 1; i <= numberOfInstallments; i++) {
      const dueDate = new Date(Date.now() + i * daysPerPeriod * 24 * 60 * 60 * 1000)
      await tx.installmentSchedule.create({
        data: { planId: plan.id, installmentNumber: i, amount: installmentAmount || 0, dueDate, status: 'pending', paidAmount: 0, tenantId },
      })
    }
    return plan
  } catch (error: any) {
    console.error('[Invoices] Failed to create installment plan:', error?.message)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/invoices
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const status = searchParams.get('status')

    const where: any = { tenantId }
    if (status) {
      const statusUpper = status.toUpperCase()
      where.OR = [
        { status: statusUpper },
        { status: statusUpper.toLowerCase() },
        ...(statusUpper === 'PENDING' ? [{ paymentType: 'credit', status: { in: ['confirmed', 'Confirmed'] } }] : []),
        ...(statusUpper === 'PAID' ? [{ paymentType: { in: ['cash', 'Cash', 'card', 'Card'] }, paidAmount: { gt: 0 } }] : []),
        ...(statusUpper === 'PARTIAL' ? [{ remainingAmount: { gt: 0 }, paidAmount: { gt: 0 } }] : []),
      ]
    }

    let invoices: any[] = []
    try {
      invoices = await tenantDb.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, mobile: true, portalToken: true } },
          cashier: { select: { id: true, username: true } },
          items: true,
          payments: true,
          installmentPlan: { include: { schedules: { orderBy: { installmentNumber: 'asc' } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
      })
    } catch (err: any) {
      console.warn('[Invoices] Include failed, using fallback:', err?.message)
      invoices = await tenantDb.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, mobile: true, portalToken: true } },
          cashier: { select: { id: true, username: true } },
          items: true, payments: true, installmentPlan: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
      }).catch(() => [])
    }

    const result = invoices.map((inv: any) => {
      let paymentStatus = 'PENDING'
      const paymentType = (inv.paymentType || 'cash').toLowerCase()
      if (inv.paidAmount >= inv.totalAmount && inv.totalAmount > 0) paymentStatus = 'PAID'
      else if (inv.paidAmount > 0) paymentStatus = 'PARTIAL'

      const statusUpper = (inv.status || 'DRAFT').toUpperCase()
      const finalAmount = inv.totalAmount || 0
      const customerName = inv.customer ? `${inv.customer.firstName || ''} ${inv.customer.lastName || ''}`.trim() : null
      const items = (inv.items || []).map((item: any) => ({ ...item, totalAmount: item.lineTotal || item.totalAmount || 0 }))

      return {
        ...inv, invoiceNumber: inv.number, customerName, finalAmount,
        paymentStatus, status: statusUpper, items,
        installmentPlan: inv.installmentPlan || null,
        customerPortalToken: inv.customer?.portalToken || null,
      }
    })

    const total = await tenantDb.invoice.count({ where })

    return NextResponse.json({
      success: true, data: result,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error: any) {
    console.error('[Invoices] GET error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری فاکتورها' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/invoices
//  ★★★ v7.1: اصلاح نهایی محاسبه COGS و فیلدها مطابق schema
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('pos')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb as any
    const tenantId = tenant.tenantId

    const invoiceData = await req.json()
    const items = invoiceData.items || []

    const branchId = invoiceData.branchId || null

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'فاکتور باید حداقل یک قلم کالا داشته باشد' },
        { status: 400 }
      )
    }

    const pt = (invoiceData.paymentType || 'cash').toLowerCase()
    const isCreditOrInstallment = pt === 'credit' || pt === 'installment' || pt === 'check'
    const invoiceStatus = isCreditOrInstallment ? 'unpaid' : 'paid'

    let subTotal = 0
    let totalTax = 0
    let totalDiscount = 0

    for (const item of items) {
      const qty = Number(item.quantity) || 0
      const price = Number(item.unitPrice) || 0
      const disc = Number(item.discountAmount) || 0
      const tax = Number(item.taxAmount) || 0

      subTotal += qty * price
      totalDiscount += disc
      totalTax += tax
    }

    const discountAmount = Number(invoiceData.discountAmount) || 0
    const taxAmount = Number(invoiceData.taxAmount) || totalTax
    const totalAmount = subTotal - totalDiscount - discountAmount + taxAmount
    const paidAmount = Number(invoiceData.paidAmount) || (isCreditOrInstallment ? 0 : totalAmount)
    const remainingAmount = Number(invoiceData.remainingAmount) || (isCreditOrInstallment ? totalAmount : 0)

    const count = await tenantDb.invoice.count({ where: { tenantId } })
    const invoiceNumber = `INV-${(count + 1).toString().padStart(6, '0')}`

    let warehouseId = invoiceData.warehouseId || null
    if (!warehouseId) {
      try {
        const defaultWh = await tenantDb.warehouse.findFirst({ where: { tenantId, isDefault: true, isActive: true } })
        if (defaultWh) warehouseId = defaultWh.id
        else {
          const firstWh = await tenantDb.warehouse.findFirst({ where: { tenantId, isActive: true } })
          if (firstWh) warehouseId = firstWh.id
        }
      } catch { /* ignore */ }
    }

    for (const item of items) {
      if (item.productId) {
        try {
          const product = await tenantDb.product.findFirst({ where: { id: item.productId, tenantId } })
          if (!product) continue

          if (item.quantity > product.currentStock) {
            return NextResponse.json(
              { success: false, error: `موجودی محصول "${product.name}" کافی نیست. موجودی فعلی: ${product.currentStock}، تعداد درخواستی: ${item.quantity}`, code: 'INSUFFICIENT_STOCK' },
              { status: 400 }
            )
          }

          if (warehouseId) {
            const stockLevel = await tenantDb.stockLevel.findUnique({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
            }).catch(() => null)
            if (stockLevel && item.quantity > stockLevel.quantity) {
              return NextResponse.json(
                { success: false, error: `موجودی "${product.name}" در انبار کافی نیست. موجودی انبار: ${stockLevel.quantity}، تعداد درخواستی: ${item.quantity}`, code: 'INSUFFICIENT_STOCK' },
                { status: 400 }
              )
            }
          }
        } catch { /* ignore */ }
      }
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    // ★★★ متغیر برای نگهداری بهای تمام‌شده کل (خارج از تراکنش تعریف می‌شود)
    let totalCogs = 0

    const result = await txClient.$transaction(async (tx: any) => {
      // ۱. ایجاد فاکتور
      const inv = await tx.invoice.create({
        data: {
          number: invoiceNumber, customerId: invoiceData.customerId || null,
          invoiceDate: new Date(), dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
          status: invoiceStatus, paymentType: invoiceData.paymentType || 'cash',
          subTotal, discountAmount, taxAmount, totalAmount, paidAmount,
          remainingAmount,
          cashierId: tenant.user?.id || null, description: invoiceData.description || null, tenantId,
          ...(warehouseId ? { warehouseId } : {}),
          ...(branchId ? { branchId } : {}),
        },
      })

      // ۲. ایجاد اقلام فاکتور و کسر موجودی
      for (const item of items) {
        if (!item.productId) continue

        const product = await tx.product.findUnique({ 
          where: { id: item.productId },
          select: { name: true, purchasePrice: true }
        })

        const unitCost = Number(product?.purchasePrice || 0)
        const itemCogs = unitCost * item.quantity
        totalCogs += itemCogs // ★★★ جمع زدن بهای تمام‌شده این قلم

        await tx.invoiceItem.create({
          data: {
            invoiceId: inv.id,
            productId: item.productId,
            productName: item.productName || product?.name || 'نامشخص',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount || 0,
            taxAmount: item.taxAmount || 0,
          },
        })

        // کسر از Product.currentStock
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: item.quantity } },
        }).catch((err: any) => console.warn(`[Invoices POST] Failed to decrement Product.currentStock:`, err?.message))

        // کسر از StockLevel
        if (warehouseId) {
          const stockLevel = await tx.stockLevel.findUnique({
            where: { warehouseId_productId: { warehouseId, productId: item.productId } },
          }).catch(() => null)

          if (stockLevel) {
            await tx.stockLevel.update({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              data: { quantity: { decrement: item.quantity } },
            }).catch((err: any) => console.warn(`[Invoices POST] Failed to decrement StockLevel:`, err?.message))
          } else {
            await tx.stockLevel.create({
              data: {
                tenantId, warehouseId, productId: item.productId,
                quantity: item.quantity,
                averageCost: unitCost,
              },
            }).catch((err: any) => console.warn(`[Invoices POST] Failed to create StockLevel:`, err?.message))
          }

          // ثبت حرکت انبار
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              fromWarehouseId: warehouseId,
              quantity: item.quantity,
              unitCost: unitCost,
              movementType: 'sale',
              referenceType: 'invoice',
              referenceId: inv.id,
              description: `فروش فاکتور ${invoiceNumber}`,
            },
          }).catch((err: any) => console.warn(`[Invoices POST] Failed to create StockMovement:`, err?.message))
        }
      }

      // ۳. ثبت پرداخت‌ها (اگر وجود داشته باشد)
      const payments = invoiceData.payments || []
      for (const p of payments) {
        await tx.invoicePayment.create({
          data: {
            invoiceId: inv.id,
            amount: p.amount,
            paymentType: p.paymentType || 'cash',
            paidAt: new Date(),
            paymentRef: p.paymentRef || p.referenceNumber || null,
            tenantId,
          },
        })
      }

      // ۴. به‌روزرسانی مانده حساب مشتری (در صورت نسیه/قسطی)
      if (isCreditOrInstallment && invoiceData.customerId) {
        await tx.customer.update({
          where: { id: invoiceData.customerId },
          data: { currentBalance: { increment: remainingAmount } },
        }).catch((err: any) => console.warn(`[Invoices POST] Failed to update customer balance:`, err?.message))
      }

      return inv
    })

    // ۵. ایجاد سند حسابداری خودکار (با ارسال totalCogs صحیح که در تراکنش محاسبه شد)
    const planTier = tenant.planTier || 'basic'
    await createAutoJournalEntry(tenantDb, tenantId, result, items, pt, planTier, totalCogs)

    return NextResponse.json({ success: true, data: result, message: 'فاکتور با موفقیت ثبت شد' }, { status: 201 })
  } catch (error: any) {
    console.error('[Invoices POST] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'خطا در ثبت فاکتور' }, { status: 500 })
  }
})
// ═══════════════════════════════════════════════════════════════
//  PUT /api/invoices
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    if (!body.id) {
      return NextResponse.json({ success: false, error: 'شناسه فاکتور الزامی است' }, { status: 400 })
    }

    const where: any = { id: body.id, tenantId }
    const existing = await tenantDb.invoice.findFirst({ where })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'فاکتور یافت نشد' }, { status: 404 })
    }

    const updateData: Record<string, any> = {}
    if (body.status !== undefined) updateData.status = body.status
    if (body.description !== undefined) updateData.description = body.description
    if (body.dueDate !== undefined) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null

    if (body.status === 'cancelled' && existing.status !== 'cancelled') {
      let warehouseId = existing.warehouseId || null
      if (!warehouseId) {
        const defaultWh = await tenantDb.warehouse.findFirst({ where: { tenantId, isDefault: true } }).catch(() => null)
        if (defaultWh) warehouseId = defaultWh.id
      }

      const items = await tenantDb.invoiceItem.findMany({ where: { invoiceId: existing.id } })
      const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

      await txClient.$transaction(async (tx: any) => {
        await tx.invoice.update({ where: { id: body.id }, data: updateData })

        for (const item of items) {
          if (!item.productId) continue

          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: { increment: item.quantity } },
          }).catch((err: any) => console.warn(`[Invoices PUT] Failed to increment Product.currentStock:`, err?.message))

          if (warehouseId) {
            const stockLevel = await tx.stockLevel.findUnique({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
            }).catch(() => null)

            if (stockLevel) {
              await tx.stockLevel.update({
                where: { warehouseId_productId: { warehouseId, productId: item.productId } },
                data: { quantity: { increment: item.quantity } },
              }).catch((err: any) => console.warn(`[Invoices PUT] Failed to increment StockLevel:`, err?.message))
            }

            await tx.stockMovement.create({
              data: {
                tenantId,
                productId: item.productId,
                toWarehouseId: warehouseId,
                quantity: item.quantity,
                unitCost: 0,
                movementType: 'return',
                referenceType: 'invoice',
                referenceId: existing.id,
                description: `برگشت از لغو فاکتور ${existing.number}`,
              },
            }).catch((err: any) => console.warn(`[Invoices PUT] Failed to create StockMovement:`, err?.message))
          }
        }

        if ((existing.paymentType === 'credit' || existing.paymentType === 'installment') && existing.customerId) {
          const remainingAmount = existing.totalAmount - existing.paidAmount
          if (remainingAmount > 0) {
            await tx.customer.update({
              where: { id: existing.customerId },
              data: { currentBalance: { decrement: remainingAmount } },
            }).catch((err: any) => console.warn(`[Invoices PUT] Failed to decrement customer balance:`, err?.message))
          }
        }

        await tx.journalEntry.updateMany({
          where: { sourceType: 'invoice', sourceId: existing.id, tenantId },
          data: { status: 'cancelled', description: `ابطال شده — فاکتور ${existing.number} لغو شد` },
        }).catch((err: any) => console.warn(`[Invoices PUT] Failed to cancel journal entries:`, err?.message))
      })

      return NextResponse.json({ success: true, message: 'فاکتور لغو و موجودی برگشت داده شد' })
    }

    await tenantDb.invoice.update({ where: { id: body.id }, data: updateData })
    return NextResponse.json({ success: true, message: 'فاکتور با موفقیت بروزرسانی شد' })
  } catch (error: any) {
    console.error('[Invoices] PUT error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بروزرسانی فاکتور' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/invoices
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant?.tenantDb
    const tenantId = tenant?.tenantId

    if (!tenantDb) {
      return NextResponse.json({ success: false, error: 'خطای پیکربندی tenant' }, { status: 500 })
    }

    const { searchParams } = new URL(req.url)
    const invoiceId = searchParams.get('id')

    if (!invoiceId) {
      return NextResponse.json({ success: false, error: 'شناسه فاکتور الزامی است' }, { status: 400 })
    }

    const invoice: any = await tenantDb.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { items: true },
    })

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'فاکتور یافت نشد' }, { status: 404 })
    }

    const isReturn = invoice.invoiceType === 'sale_return' || invoice.invoiceType === 'purchase_return'
    const isPaid = (invoice.status || '').toUpperCase() === 'PAID' || (Number(invoice.paidAmount) || 0) > 0

    if (isPaid && !isReturn) {
      return NextResponse.json({ success: false, error: 'فاکتور پرداخت‌شده قابل حذف نیست' }, { status: 400 })
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    await txClient.$transaction(async (tx: any) => {
      const journalEntries = await tx.journalEntry.findMany({
        where: { tenantId, sourceId: invoiceId },
        select: { id: true },
      })

      for (const je of journalEntries) {
        await tx.journalEntry.update({
          where: { id: je.id },
          data: {
            isCancelled: true,
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelReason: `حذف فاکتور ${invoice.number}`,
          },
        }).catch((err: any) => console.warn('[DELETE] Journal entry cancel failed:', err?.message))
      }

      await tx.invoicePayment.deleteMany({ where: { invoiceId } }).catch(() => {})

      if (invoice.paymentType === 'installment') {
        try {
          const plan = await tx.installmentPlan.findUnique({ where: { invoiceId }, select: { id: true } })
          if (plan) {
            await tx.installmentSchedule.deleteMany({ where: { planId: plan.id } }).catch(() => {})
            await tx.installmentPlan.delete({ where: { id: plan.id } }).catch(() => {})
          }
        } catch (err: any) {
          console.warn('[DELETE] InstallmentPlan cleanup failed:', err?.message)
        }
      }

      await tx.onlinePayment.deleteMany({ where: { invoiceId } }).catch(() => {})

      const warehouseId = invoice.warehouseId
      if (warehouseId && invoice.items?.length > 0) {
        for (const item of invoice.items) {
          if (!item.productId) continue
          const qty = Number(item.quantity) || 0
          if (qty <= 0) continue

          if (isReturn) {
            await tx.stockLevel.update({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              data: { quantity: { decrement: qty } },
            }).catch(() => {})
            await tx.product.update({
              where: { id: item.productId },
              data: { currentStock: { decrement: qty } },
            }).catch(() => {})
          } else {
            await tx.stockLevel.update({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              data: { quantity: { increment: qty } },
            }).catch(() => {})
            await tx.product.update({
              where: { id: item.productId },
              data: { currentStock: { increment: qty } },
            }).catch(() => {})
          }
        }
      }

      if (!isReturn && (invoice.paymentType === 'credit' || invoice.paymentType === 'installment') && invoice.customerId) {
        const remainingAmount = Number(invoice.totalAmount) - Number(invoice.paidAmount)
        if (remainingAmount > 0) {
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: { currentBalance: { decrement: remainingAmount } },
          }).catch(() => {})
        }
      }

      await tx.stockMovement.deleteMany({ where: { tenantId, referenceId: invoiceId } }).catch(() => {})
      await tx.invoiceItem.deleteMany({ where: { invoiceId } })
      await tx.invoice.delete({ where: { id: invoiceId } })
    })

    return NextResponse.json({ success: true, message: `فاکتور ${invoice.number} با موفقیت حذف شد` })
  } catch (error: any) {
    console.error('[Invoices DELETE] Error:', error?.message)
    return NextResponse.json({ success: false, error: 'خطا در حذف فاکتور: ' + (error?.message || '') }, { status: 500 })
  }
})