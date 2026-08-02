// ============================================================================
// src/app/api/invoices/route.ts — GET/POST/PUT/DELETE (v7.0 ★★★ Transaction Safety)
// ----------------------------------------------------------------------------
// ★★★ v7.0: اصلاحات Transaction Safety:
//   ★ انتقال createAutoJournalEntry به داخل transaction اصلی POST
//   ★ انتقال createInstallmentPlan به داخل transaction اصلی POST
//   ★ انتقال customer.currentBalance به داخل transaction اصلی POST
//   ★ انتقال rollback موجودی + ابطال سند در PUT به داخل transaction
//   ★ حفظ تمام منطق v6.6 بدون تغییر
//
// ★★★ v6.6 (حفظ شد): حذف InstallmentPlan + InstallmentSchedule + OnlinePayment
// ★★★ v6.5 (حفظ شد): اصلاح تاریخ JE = تاریخ فاکتور
// ★★★ v6.4 (حفظ شد): auto-seed حساب‌های استاندارد
// ★★★ v6.3 (حفظ شد): COGS در همه پلن‌ها
// ★★★ v6.2 (حفظ شد): کاهش StockLevel + COGS + rollback
// ★★★ v6.0 (حفظ شد): مودیان + portalToken + سند خودکار
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { requireSubscriptionAndLimit } from '@/lib/plan-guard'
import { getTenantPlanInfo } from '@/lib/plan-limits'
import { resolvePlanTier, type PlanTier } from '@/lib/plan-features'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'

// ★★★ v6.0: import برای اتصال سامانه مودیان
import { autoSubmitInvoiceIfNeeded } from '@/lib/moidian'

// ★★★ v6.4: helper برای auto-seed حساب‌های استاندارد
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'

// ─── تولید توکن پورتال (UUID + timestamp پایه ۳۶) ────────────────────────────
function generatePortalToken(): string {
  const uuid = randomUUID().replace(/-/g, '')
  const ts = Date.now().toString(36)
  return `${uuid}${ts}`.slice(0, 40)
}

// ─── ایجاد سند حسابداری خودکار ────────────────────────────
//   ★★★ v7.0: پذیرش tx (transaction client) به‌جای db.client مستقیم
//   ★★★ v6.4: استفاده از getStandardAccountIds (با auto-seed داخلی)
//   ★★★ v6.3: COGS در همه پلن‌ها ثبت می‌شود (حذف شرط planTier)
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

    // ★★★ v6.4: استفاده از helper که خودش حساب‌ها را seed می‌کند
    let cashAccountId: string | null = null
    let salesAccountId: string | null = null
    let cogsAccountId: string | null = null
    let inventoryAccountId: string | null = null
    let receivablesAccountId: string | null = null
    let taxAccountId: string | null = null
    let vatAccountId: string | null = null

    try {
      const accountIds = await getStandardAccountIds(tenantId)
      cashAccountId = accountIds.cashAccountId
      salesAccountId = accountIds.salesAccountId
      cogsAccountId = accountIds.cogsAccountId
      inventoryAccountId = accountIds.inventoryAccountId
      receivablesAccountId = accountIds.receivablesAccountId
      taxAccountId = accountIds.taxAccountId
      vatAccountId = accountIds.vatAccountId || accountIds.taxAccountId

      console.log('[Invoices] Account IDs resolved', {
        hasCash: !!cashAccountId,
        hasSales: !!salesAccountId,
        hasCogs: !!cogsAccountId,
        hasInventory: !!inventoryAccountId,
      })
    } catch (err: any) {
      console.warn('[Invoices] Could not find/seed accounts for journal entry:', err?.message)
    }

    const lines: any[] = []
    const isCreditOrInstallment = paymentType === 'credit' || paymentType === 'installment'
    const netSales = invoice.subTotal - invoice.discountAmount

    // ★ بدهکار: صندوق یا مطالبات
    const debitAccountId = isCreditOrInstallment ? (receivablesAccountId || cashAccountId) : cashAccountId
    if (debitAccountId) lines.push({ accountId: debitAccountId, debit: totalAmount, credit: 0, description: 'بدهکار: بابت فاکتور فروش' })

    // ★ بستانکار: درآمد فروش (خالص بدون مالیات)
    if (salesAccountId) lines.push({ accountId: salesAccountId, debit: 0, credit: netSales, description: 'بستانکار: درآمد فروش' })

    // ★ بستانکار: مالیات فروش (در صورت وجود) — استفاده از VAT (2160)
    if (invoice.taxAmount > 0 && vatAccountId) {
      lines.push({ accountId: vatAccountId, debit: 0, credit: invoice.taxAmount, description: 'بستانکار: مالیات بر ارزش افزوده فروش' })
    }

    // ★★★ v6.3: COGS در همه پلن‌ها (حذف شرط planTier)
    if (totalCogs > 0 && cogsAccountId && inventoryAccountId) {
      lines.push({ accountId: cogsAccountId, debit: totalCogs, credit: 0, description: 'بدهکار: بهای تمام شده کالای فروش رفته' })
      lines.push({ accountId: inventoryAccountId, debit: 0, credit: totalCogs, description: 'بستانکار: خروج از موجودی کالا' })
    } else if (totalCogs > 0) {
      console.warn('[Invoices] COGS accounts missing', {
        cogsAccountId, inventoryAccountId, totalCogs,
        hint: 'باید حساب‌های 5000 (COGS) و 1200 (موجودی کالا) در چارت حساب‌ها موجود باشن.',
      })
    }

    if (lines.length >= 2) {
      const totalDebit = lines.reduce((sum: number, l: any) => sum + l.debit, 0)
      const totalCredit = lines.reduce((sum: number, l: any) => sum + l.credit, 0)

      await tx.journalEntry.create({
        data: {
          // ★★★ v6.5: تاریخ JE = تاریخ فاکتور (نه ساعت سیستم)
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
// ★★★ v7.0: پذیرش tx (transaction client)
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
      try {
        invoices = await tenantDb.invoice.findMany({
          where,
          include: {
            customer: { select: { id: true, firstName: true, lastName: true, mobile: true, portalToken: true } },
            cashier: { select: { id: true, username: true } },
            items: true, payments: true, installmentPlan: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit, take: limit,
        })
      } catch { invoices = [] }
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
//  ★★★ v7.0: همه عملیات بحرانی داخل یک Transaction
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const limitCheck = await requireSubscriptionAndLimit(tenant.tenantId, 'invoices')
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { success: false, error: limitCheck.message, code: 'PLAN_LIMIT_INVOICES' },
        { status: 403 }
      )
    }

    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    const { items, payments, installmentPlanData, ...invoiceData } = body

    if (!items || items.length === 0) {
      return NextResponse.json({ success: false, error: 'حداقل یک آیتم فاکتور الزامی است', code: 'NO_ITEMS' }, { status: 400 })
    }

    // ★★★ v6.2: پیدا کردن انبار پیش‌فرض (اگر warehouseId ارائه نشده)
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

    // ★★★ v6.2: بررسی موجودی واقعی در StockLevel (به‌جای فقط Product.currentStock)
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

    const isCreditOrInstallment = invoiceData.paymentType === 'credit' || invoiceData.paymentType === 'installment'
    if (isCreditOrInstallment && !invoiceData.customerId) {
      return NextResponse.json({ success: false, error: 'برای فروش نسیه/قسطی انتخاب مشتری الزامی است', code: 'CUSTOMER_REQUIRED' }, { status: 400 })
    }

    const count = await tenantDb.invoice.count({ where: { tenantId } })
    const invoiceNumber = `INV-${(count + 1).toString().padStart(5, '0')}`

    let subTotal = 0, discountAmount = 0, taxAmount = 0
    const invoiceItems = (items || []).map((item: any) => {
      const lineTotal = item.quantity * item.unitPrice - (item.discountAmount || 0) + (item.taxAmount || 0)
      subTotal += item.quantity * item.unitPrice
      discountAmount += item.discountAmount || 0
      taxAmount += item.taxAmount || 0
      return {
        productId: item.productId || null, productName: item.productName || '',
        quantity: item.quantity, unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0, taxAmount: item.taxAmount || 0,
        lineTotal,
      }
    })

    const totalAmount = subTotal - discountAmount + taxAmount
    let paidAmount = 0
    const invoicePayments = (payments || []).map((pay: any) => {
      paidAmount += pay.amount || 0
      return { amount: pay.amount || 0, paymentType: pay.paymentType || 'cash', paymentRef: pay.paymentRef || null, paidAt: new Date(), tenantId }
    })

    if (invoiceData.paymentType === 'credit') {
      paidAmount = 0
      invoicePayments.length = 0
    } else if (invoiceData.paymentType === 'installment' && installmentPlanData) {
      paidAmount = installmentPlanData.downPayment || 0
      invoicePayments.length = 0
      if (paidAmount > 0) invoicePayments.push({ amount: paidAmount, paymentType: 'installment', paidAt: new Date(), tenantId })
    } else if (invoicePayments.length === 0) {
      paidAmount = totalAmount
      invoicePayments.push({ amount: totalAmount, paymentType: invoiceData.paymentType?.toLowerCase() || 'cash', paidAt: new Date(), tenantId })
    }

    let invoiceStatus = invoiceData.status || 'confirmed'
    if (invoiceData.paymentType === 'credit') invoiceStatus = 'pending'
    else if (invoiceData.paymentType === 'installment') invoiceStatus = (installmentPlanData?.downPayment || 0) > 0 ? 'partial' : 'pending'
    else if (paidAmount >= totalAmount) invoiceStatus = 'paid'

    // ★★★ v7.0: دریافت planTier قبل از transaction (read-only)
    let planTier: PlanTier = 'basic'
    try {
      const planInfo = await getTenantPlanInfo(tenantId)
      planTier = resolvePlanTier(planInfo.tierName)
    } catch { /* ignore */ }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    // ═══════════════════════════════════════════════════════════
    // ★★★ v7.0: همه عملیات بحرانی داخل یک Transaction
    // ═══════════════════════════════════════════════════════════
    const result = await txClient.$transaction(async (tx: any) => {
      // ۱. ایجاد فاکتور
      const inv = await tx.invoice.create({
        data: {
          number: invoiceNumber, customerId: invoiceData.customerId || null,
          invoiceDate: new Date(), dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
          status: invoiceStatus, paymentType: invoiceData.paymentType || 'cash',
          subTotal, discountAmount, taxAmount, totalAmount, paidAmount,
          remainingAmount: totalAmount - paidAmount,
          cashierId: tenant.user?.id || null, description: invoiceData.description || null, tenantId,
          ...(warehouseId ? { warehouseId } : {}),
        },
      })

      // ۲. ایجاد آیتم‌های فاکتور
      for (const item of invoiceItems) {
        await tx.invoiceItem.create({
          data: { invoiceId: inv.id, productId: item.productId || null, productName: item.productName || '', quantity: item.quantity, unitPrice: item.unitPrice, discountAmount: item.discountAmount || 0, taxAmount: item.taxAmount || 0, lineTotal: item.lineTotal || 0 },
        })
      }

      // ۳. ایجاد پرداخت‌ها
      for (const pay of invoicePayments) {
        await tx.invoicePayment.create({
          data: { invoiceId: inv.id, amount: pay.amount || 0, paymentType: pay.paymentType || 'cash', paymentRef: pay.paymentRef || null, paidAt: pay.paidAt || new Date(), tenantId },
        })
      }

      // ۴. ★★★ v6.2: کاهش موجودی + ثبت حرکت کالا + محاسبه COGS
      let totalCogs = 0
      for (const item of invoiceItems) {
        if (!item.productId) continue

        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: item.quantity } },
        }).catch((err: any) => console.warn(`[Invoices] Failed to decrement Product.currentStock:`, err?.message))

        if (warehouseId) {
          const stockLevel = await tx.stockLevel.findUnique({
            where: { warehouseId_productId: { warehouseId, productId: item.productId } },
          }).catch(() => null)

          if (stockLevel) {
            const itemCogs = item.quantity * (stockLevel.averageCost || 0)
            totalCogs += itemCogs

            await tx.stockLevel.update({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              data: { quantity: { decrement: item.quantity } },
            }).catch((err: any) => console.warn(`[Invoices] Failed to decrement StockLevel:`, err?.message))

            await tx.stockMovement.create({
              data: {
                tenantId,
                productId: item.productId,
                fromWarehouseId: warehouseId,
                quantity: item.quantity,
                unitCost: stockLevel.averageCost || 0,
                movementType: 'sale_out',
                referenceType: 'invoice',
                referenceId: inv.id,
                description: `فاکتور فروش ${invoiceNumber}`,
              },
            }).catch((err: any) => console.warn(`[Invoices] Failed to create StockMovement:`, err?.message))
          } else {
            const product = await tx.product.findUnique({ where: { id: item.productId } }).catch(() => null)
            if (product) {
              totalCogs += item.quantity * (product.purchasePrice || 0)
            }
          }
        } else {
          const product = await tx.product.findUnique({ where: { id: item.productId } }).catch(() => null)
          if (product) {
            totalCogs += item.quantity * (product.purchasePrice || 0)
          }
        }
      }

      // ۵. ذخیره COGS در فاکتور
      try {
        await tx.invoice.update({
          where: { id: inv.id },
          data: { cogsAmount: totalCogs } as any,
        })
      } catch { /* فیلد cogsAmount ممکن است در schema نباشد — ignore */ }

      // ۶. ★★★ v7.0: به‌روزرسانی مانده مشتری (داخل transaction)
      if (invoiceData.customerId && (invoiceData.paymentType === 'credit' || invoiceData.paymentType === 'installment')) {
        const remainingAmount = totalAmount - paidAmount
        if (remainingAmount > 0) {
          await tx.customer.update({
            where: { id: invoiceData.customerId },
            data: { currentBalance: { increment: remainingAmount }, lastPurchaseAt: new Date() },
          }).catch((err: any) => console.warn('[Invoices] Failed to update customer balance:', err?.message))
        }
      } else if (invoiceData.customerId) {
        await tx.customer.update({
          where: { id: invoiceData.customerId },
          data: { lastPurchaseAt: new Date() },
        }).catch(() => { /* ignore */ })
      }

      // ۷. ★★★ v7.0: ایجاد پلن قسطی (داخل transaction)
      let createdInstallmentPlan: any = null
      if (invoiceData.paymentType === 'installment' && installmentPlanData) {
        createdInstallmentPlan = await createInstallmentPlan(tx, tenantId, inv, installmentPlanData)
      }

      // ۸. ★★★ v7.0: صدور سند حسابداری (داخل transaction)
      await createAutoJournalEntry(tx, tenantId, inv, invoiceItems, invoiceData.paymentType || 'cash', planTier, totalCogs)

      return { invoice: inv, totalCogs, createdInstallmentPlan }
    })

    const { invoice: createdInvoice, totalCogs, createdInstallmentPlan } = result

    // ═══════════════════════════════════════════════════════════
    // عملیات غیربحرانی (خارج از transaction — اگر fail شود فاکتور باقی است)
    // ═══════════════════════════════════════════════════════════

    // ★ تولید portalToken
    let portalUrl: string | null = null
    let portalToken: string | null = null
    if (invoiceData.customerId) {
      try {
        const customer = await tenantDb.customer.findFirst({
          where: { id: invoiceData.customerId, tenantId },
          select: { id: true, portalToken: true },
        })
        if (customer) {
          if (!customer.portalToken) {
            portalToken = generatePortalToken()
            await tenantDb.customer.update({
              where: { id: customer.id },
              data: { portalToken: portalToken },
            })
          } else {
            portalToken = customer.portalToken
          }
          portalUrl = `/portal/${portalToken}`
        }
      } catch (err: any) {
        console.warn('[Invoices] Failed to generate portal token (non-blocking):', err?.message)
      }
    }

    // ★ ارسال خودکار به سامانه مودیان (non-blocking)
    try {
      await autoSubmitInvoiceIfNeeded(tenantId, createdInvoice.id)
    } catch (moidianErr: any) {
      console.warn('[Invoices] Auto Moidian submission failed (non-blocking):', moidianErr?.message)
    }

    return NextResponse.json({
      success: true,
      data: {
        ...createdInvoice,
        portalUrl,
        portalToken,
        cogsAmount: totalCogs,
        installmentPlan: createdInstallmentPlan ? {
          id: createdInstallmentPlan.id, status: createdInstallmentPlan.status,
          numberOfInstallments: createdInstallmentPlan.numberOfInstallments,
          totalWithInterest: createdInstallmentPlan.totalWithInterest,
          downPayment: createdInstallmentPlan.downPayment,
          installmentAmount: createdInstallmentPlan.installmentAmount,
        } : null,
      },
    }, { status: 201 })
  } catch (error: any) {
    console.error('[Invoices] POST error:', error?.message || error)
    return NextResponse.json({ success: false, error: error?.message || 'خطا در ایجاد فاکتور' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/invoices
//  ★★★ v7.0: rollback موجودی + ابطال سند داخل Transaction
//  ★★★ v6.2: اگر status به 'cancelled' تغییر کند، موجودی برگشت می‌خورد
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

    // ★★★ v7.0: اگر فاکتور لغو می‌شود، همه عملیات در یک Transaction
    if (body.status === 'cancelled' && existing.status !== 'cancelled') {
      console.log(`[Invoices PUT] لغو فاکتور ${existing.number} — برگشت موجودی`)

      let warehouseId = existing.warehouseId || null
      if (!warehouseId) {
        const defaultWh = await tenantDb.warehouse.findFirst({ where: { tenantId, isDefault: true } }).catch(() => null)
        if (defaultWh) warehouseId = defaultWh.id
      }

      const items = await tenantDb.invoiceItem.findMany({ where: { invoiceId: existing.id } })

      const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

      await txClient.$transaction(async (tx: any) => {
        // ۱. به‌روزرسانی وضعیت فاکتور
        await tx.invoice.update({ where: { id: body.id }, data: updateData })

        // ۲. rollback موجودی
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
            } else {
              await tx.stockLevel.create({
                data: {
                  tenantId, warehouseId, productId: item.productId,
                  quantity: item.quantity,
                  averageCost: 0,
                },
              }).catch((err: any) => console.warn(`[Invoices PUT] Failed to create StockLevel:`, err?.message))
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

        // ۳. ★★★ v6.6: اگر نسیه/قسطی بوده، بدهی مشتری را کاهش بده
        if ((existing.paymentType === 'credit' || existing.paymentType === 'installment') && existing.customerId) {
          const remainingAmount = existing.totalAmount - existing.paidAmount
          if (remainingAmount > 0) {
            await tx.customer.update({
              where: { id: existing.customerId },
              data: { currentBalance: { decrement: remainingAmount } },
            }).catch((err: any) => console.warn(`[Invoices PUT] Failed to decrement customer balance:`, err?.message))
          }
        }

        // ۴. ★ ابطال سند حسابداری (نه حذف) — داخل transaction
        await tx.journalEntry.updateMany({
          where: { sourceType: 'invoice', sourceId: existing.id, tenantId },
          data: { status: 'cancelled', description: `ابطال شده — فاکتور ${existing.number} لغو شد` },
        }).catch((err: any) => {
          console.warn(`[Invoices PUT] Failed to cancel journal entries:`, err?.message)
        })
      })

      return NextResponse.json({ success: true, message: 'فاکتور لغو و موجودی برگشت داده شد' })
    }

    // ★ حالت عادی (بدون لغو)
    await tenantDb.invoice.update({ where: { id: body.id }, data: updateData })

    return NextResponse.json({ success: true, message: 'فاکتور با موفقیت بروزرسانی شد' })
  } catch (error: any) {
    console.error('[Invoices] PUT error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بروزرسانی فاکتور' }, { status: 500 })
  }
})

// ============================================================================
// ★★★ v7.0: DELETE handler — تمام عملیات داخل Transaction
// ----------------------------------------------------------------------------
//   ۱. ابطال (نه حذف) سند حسابداری — حفظ audit trail
//   ۲. حذف InstallmentPlan + InstallmentSchedule برای فاکتور اقساطی
//   ۳. برگشت Customer.currentBalance برای فاکتور credit
//   ۴. حذف OnlinePayment های مرتبط (رکوردهای یتیم)
//   ۵. حذف InvoicePayment ها
//   ۶. rollback موجودی (Sale: increment, Return: decrement)
// ============================================================================

export const DELETE = withTenantAndPermission('pos')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant?.tenantDb
    const tenantId = tenant?.tenantId

    if (!tenantDb) {
      return NextResponse.json(
        { success: false, error: 'خطای پیکربندی tenant' },
        { status: 500 }
      )
    }

    const { searchParams } = new URL(req.url)
    const invoiceId = searchParams.get('id')

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فاکتور الزامی است' },
        { status: 400 }
      )
    }

    const invoice: any = await tenantDb.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { items: true },
    })

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'فاکتور یافت نشد' },
        { status: 404 }
      )
    }

    const isReturn =
      invoice.invoiceType === 'sale_return' ||
      invoice.invoiceType === 'purchase_return'

    const isPaid =
      (invoice.status || '').toUpperCase() === 'PAID' ||
      (Number(invoice.paidAmount) || 0) > 0

    if (isPaid && !isReturn) {
      return NextResponse.json(
        { success: false, error: 'فاکتور پرداخت‌شده قابل حذف نیست' },
        { status: 400 }
      )
    }

    // ★★★ v6.6: بررسی وجود فاکتور برگشتی مرتبط
    if (!isReturn) {
      const hasReturn = await tenantDb.invoice.count({
        where: { originalInvoiceId: invoiceId, tenantId },
      }).catch(() => 0)

      if (hasReturn > 0) {
        return NextResponse.json(
          { success: false, error: 'این فاکتور دارای فاکتور برگشتی است و قابل حذف نیست. ابتدا فاکتور برگشتی را حذف کنید.' },
          { status: 400 }
        )
      }
    }

    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    await txClient.$transaction(async (tx: any) => {
      // ★ ۱. ابطال (نه حذف) سند حسابداری — حفظ audit trail
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
        }).catch((err: any) =>
          console.warn('[DELETE] Journal entry cancel failed:', err?.message)
        )
      }

      // ★ ۲. حذف پرداخت‌های فاکتور
      await tx.invoicePayment.deleteMany({
        where: { invoiceId },
      }).catch(() => {})

      // ★★★ v6.6: ۳. حذف InstallmentPlan + InstallmentSchedule (در صورت وجود)
      if (invoice.paymentType === 'installment') {
        try {
          const plan = await tx.installmentPlan.findUnique({
            where: { invoiceId },
            select: { id: true },
          })

          if (plan) {
            await tx.installmentSchedule.deleteMany({
              where: { planId: plan.id },
            }).catch(() => {})

            await tx.installmentPlan.delete({
              where: { id: plan.id },
            }).catch(() => {})

            console.log(`[DELETE] InstallmentPlan + Schedules حذف شد برای فاکتور ${invoice.number}`)
          }
        } catch (err: any) {
          console.warn('[DELETE] InstallmentPlan cleanup failed:', err?.message)
        }
      }

      // ★★★ v6.6: ۴. حذف OnlinePayment های مرتبط (جلوگیری از رکوردهای یتیم)
      await tx.onlinePayment.deleteMany({
        where: { invoiceId },
      }).catch(() => {})

      // ★ ۵. rollback موجودی
      const warehouseId = invoice.warehouseId

      if (warehouseId && invoice.items?.length > 0) {
        for (const item of invoice.items) {
          if (!item.productId) continue

          const qty = Number(item.quantity) || 0
          if (qty <= 0) continue

          if (isReturn) {
            try {
              await tx.stockLevel.update({
                where: {
                  warehouseId_productId: {
                    warehouseId,
                    productId: item.productId,
                  },
                },
                data: { quantity: { decrement: qty } },
              })
            } catch (err: any) {
              console.warn('[DELETE] StockLevel decrement failed:', err?.message)
            }

            try {
              await tx.product.update({
                where: { id: item.productId },
                data: { currentStock: { decrement: qty } },
              })
            } catch (err: any) {
              console.warn('[DELETE] Product.currentStock decrement failed:', err?.message)
            }
          } else {
            try {
              await tx.stockLevel.update({
                where: {
                  warehouseId_productId: {
                    warehouseId,
                    productId: item.productId,
                  },
                },
                data: { quantity: { increment: qty } },
              })
            } catch (err: any) {
              console.warn('[DELETE] StockLevel increment failed:', err?.message)
            }

            try {
              await tx.product.update({
                where: { id: item.productId },
                data: { currentStock: { increment: qty } },
              })
            } catch (err: any) {
              console.warn('[DELETE] Product.currentStock increment failed:', err?.message)
            }
          }
        }
      }

      // ★★★ v6.6: ۶. برگشت Customer.currentBalance برای فاکتور credit/installment
      if (!isReturn && (invoice.paymentType === 'credit' || invoice.paymentType === 'installment') && invoice.customerId) {
        const remainingAmount = Number(invoice.totalAmount) - Number(invoice.paidAmount)
        if (remainingAmount > 0) {
          try {
            await tx.customer.update({
              where: { id: invoice.customerId },
              data: { currentBalance: { decrement: remainingAmount } },
            })
            console.log(`[DELETE] Customer.currentBalance کاهش یافت: ${remainingAmount}`)
          } catch (err: any) {
            console.warn('[DELETE] Customer.currentBalance rollback failed:', err?.message)
          }
        }
      }

      // ★ ۷. حذف StockMovements مرتبط
      await tx.stockMovement.deleteMany({
        where: { tenantId, referenceId: invoiceId },
      }).catch(() => {})

      // ★ ۸. حذف آیتم‌های فاکتور
      await tx.invoiceItem.deleteMany({
        where: { invoiceId },
      })

      // ★ ۹. حذف فاکتور
      await tx.invoice.delete({
        where: { id: invoiceId },
      })
    })

    console.log(`[Invoices DELETE] ✓ Invoice ${invoice.number} deleted`)

    return NextResponse.json({
      success: true,
      message: `فاکتور ${invoice.number} با موفقیت حذف شد`,
    })
  } catch (error: any) {
    console.error('[Invoices DELETE] Error:', error?.message)
    return NextResponse.json(
      {
        success: false,
        error: 'خطا در حذف فاکتور: ' + (error?.message || ''),
      },
      { status: 500 }
    )
  }
})