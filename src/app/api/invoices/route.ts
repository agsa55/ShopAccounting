// src/app/api/invoices/route.ts — GET/POST/PUT (v6.5 ★★★ FIX PACK v3)
// ----------------------------------------------------------------------------
// ★★★ v6.5 (fix pack v3) — اصلاح بحرانی تاریخ JE:
//   ★ قبلاً: `date: new Date()` در ساخت JournalEntry — تاریخ الان (ساعت سیستم)
//   ★ مشکل: اگه فاکتور در گذشته ثبت بشه (مثلاً فاکتور صبح، ولی JE شب ساخته بشه)
//     یا اگه کاربر تاریخ دستی وارد کنه، JE در تاریخ اشتباه ثبت می‌شه.
//     داشبورد فیلتر `date >= startOfMonth AND date <= now` اعمال می‌کنه.
//     اگه JE در آینده باشه (که با ساعت سیستم ساخت می‌شه)، از نتیجه فیلتر می‌شه.
//     این دقیقاً مشکل سود ماه = 0 بود: JEها در ساعت 22:15 ساخته شده بودن ولی
//     now در داشبورد 19:29 بود → JEها آینده محسوب می‌شدن → سود = 0.
//   ★ حالا: `date: invoice.invoiceDate || new Date()` — تاریخ فاکتور.
//   ★ مزیت: حتی اگه کاربر فاکتور را در گذشته ثبت کنه، JE هم در همان روز ثبت می‌شه.
//
// ★★★ v6.4 (حفظ شد):
//   ★ auto-seed حساب‌های استاندارد قبل از ایجاد سند حسابداری
//     قبلاً اگه کاربر قبل از اولین فاکتور، صفحه "حساب‌ها" را باز نکرده بود،
//     هیچ حسابی در دیتابیس نبود و تابع createAutoJournalEntry با lines.length < 2
//     fail خاموش می‌کرد. در نتیجه سود ماه = 0 می‌شد.
//     حالا قبل از ساخت سند، ensureDefaultAccounts صدا زده می‌شه.
//
// ★★★ v6.3 (حفظ شد):
//   ★ ثبت COGS (بهای تمام شده) در همه پلن‌ها (ساده/حرفه‌ای/سازمانی)
//     قبلاً COGS فقط در پلن حرفه‌ای و سازمانی ثبت می‌شد. این باعث می‌شد:
//       - سود ماه در داشبورد اشتباه محاسبه بشه (فروش بدون کسر بهای تمام شده)
//       - موجودی کالا (1200) در ترازنامه اشتباه محاسبه بشه
//       - گزارش سود و زیان در پلن ساده اشتباه باشه
//     حالا COGS در همه پلن‌ها ثبت می‌شه. این یک اصلاح بنیادی حسابداری است.
//   ★ نکته: در پلن ساده، کاربر فقط «مشاهده» اسناد رو داره (قفل سند دستی).
//     اما اسناد خودکار فاکتورها باید کامل باشن تا حسابداری درست باشه.
//
// ★★★ v6.2 (حفظ شد):
//   ★ کاهش StockLevel (موجودی واقعی انبار) هنگام فروش
//   ★ ثبت StockMovement (حرکت کالا — خروج از انبار)
//   ★ محاسبه COGS از StockLevel.averageCost (به‌جای purchasePrice)
//   ★ rollback موجودی هنگام لغو فاکتور
// ★★★ v6.0 (حفظ شد): اتصال سامانه مودیان + تولید خودکار portalToken + سند حسابداری خودکار
// ★★★ v3.36 (حفظ شد): پلن قسطی + مدیریت موجودی Product.currentStock
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
//   ★★★ v6.4: استفاده از getStandardAccountIds (با auto-seed داخلی)
//   ★★★ v6.3: COGS در همه پلن‌ها ثبت می‌شود (حذف شرط planTier)
async function createAutoJournalEntry(
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

    const jeCount = await db.client.journalEntry.count({ where: { tenantId } })
    const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

    // ★★★ v6.4: استفاده از helper که خودش حساب‌ها را seed می‌کند
    let cashAccountId: string | null = null
    let salesAccountId: string | null = null
    let cogsAccountId: string | null = null
    let inventoryAccountId: string | null = null
    let receivablesAccountId: string | null = null
    let taxAccountId: string | null = null

    try {
      const accountIds = await getStandardAccountIds(tenantId)
      cashAccountId = accountIds.cashAccountId
      salesAccountId = accountIds.salesAccountId
      cogsAccountId = accountIds.cogsAccountId
      inventoryAccountId = accountIds.inventoryAccountId
      receivablesAccountId = accountIds.receivablesAccountId
      taxAccountId = accountIds.taxAccountId
      
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

    // ★ بستانکار: مالیات فروش (در صورت وجود)
    if (invoice.taxAmount > 0 && taxAccountId) {
      lines.push({ accountId: taxAccountId, debit: 0, credit: invoice.taxAmount, description: 'بستانکار: مالیات فروش' })
    }

    // ★★★ v6.3: COGS در همه پلن‌ها (حذف شرط planTier)
    //   این یک اصلاح بنیادی حسابداری است. بدون COGS، سود اشتباه محاسبه می‌شه.
    if (totalCogs > 0 && cogsAccountId && inventoryAccountId) {
      lines.push({ accountId: cogsAccountId, debit: totalCogs, credit: 0, description: 'بدهکار: بهای تمام شده کالای فروش رفته' })
      lines.push({ accountId: inventoryAccountId, debit: 0, credit: totalCogs, description: 'بستانکار: خروج از موجودی کالا' })
    } else if (totalCogs > 0) {
      // ★ fallback: اگه حساب COGS یا Inventory پیدا نشد، لاگ بزن
      console.warn('[Invoices] COGS accounts missing', {
        cogsAccountId, inventoryAccountId, totalCogs,
        hint: 'باید حساب‌های 5000 (COGS) و 1200 (موجودی کالا) در چارت حساب‌ها موجود باشن. اگه نیستند، accounts/route.ts را صدا بزنید تا auto-seed بشن.',
      })
    }

    if (lines.length >= 2) {
      const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0)
      const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0)

      await db.client.journalEntry.create({
        data: {
          // ★★★ v6.5: تاریخ JE = تاریخ فاکتور (نه ساعت سیستم)
          // این اصلاح بحرانی است: قبلاً `new Date()` باعث می‌شد JE در آینده
          // ثبت بشه و در فیلتر داشبورد `date <= now` از نتیجه فیلتر بشه → profit = 0
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
async function createInstallmentPlan(tenantId: string, invoice: any, installmentData: any) {
  try {
    const { downPayment, numberOfInstallments, interestRate, installmentPeriod, totalWithInterest, installmentAmount, remainingAmount } = installmentData
    const periodDays: Record<string, number> = { monthly: 30, biweekly: 14, weekly: 7 }
    const daysPerPeriod = periodDays[installmentPeriod] || 30

    const plan = await db.client.installmentPlan.create({
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
      await db.client.installmentSchedule.create({
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

          // ★ اول Product.currentStock را بررسی کن (سریع)
          if (item.quantity > product.currentStock) {
            return NextResponse.json(
              { success: false, error: `موجودی محصول "${product.name}" کافی نیست. موجودی فعلی: ${product.currentStock}، تعداد درخواستی: ${item.quantity}`, code: 'INSUFFICIENT_STOCK' },
              { status: 400 }
            )
          }

          // ★ سپس StockLevel را در انبار انتخاب‌شده بررسی کن (دقیق‌تر)
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

    // ★★★ v6.2: استفاده از transaction برای یکپارچگی
    const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

    const invoice = await txClient.$transaction(async (tx: any) => {
      const inv = await tx.invoice.create({
        data: {
          number: invoiceNumber, customerId: invoiceData.customerId || null,
          invoiceDate: new Date(), dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
          status: invoiceStatus, paymentType: invoiceData.paymentType || 'cash',
          subTotal, discountAmount, taxAmount, totalAmount, paidAmount,
          remainingAmount: totalAmount - paidAmount,
          cashierId: tenant.user?.id || null, description: invoiceData.description || null, tenantId,
          // ★★★ v6.2: ذخیره warehouseId در فاکتور
          ...(warehouseId ? { warehouseId } : {}),
        },
      })

      // ★ ایجاد آیتم‌های فاکتور
      for (const item of invoiceItems) {
        await tx.invoiceItem.create({
          data: { invoiceId: inv.id, productId: item.productId || null, productName: item.productName || '', quantity: item.quantity, unitPrice: item.unitPrice, discountAmount: item.discountAmount || 0, taxAmount: item.taxAmount || 0, lineTotal: item.lineTotal || 0 },
        })
      }

      // ★ ایجاد پرداخت‌ها
      for (const pay of invoicePayments) {
        await tx.invoicePayment.create({
          data: { invoiceId: inv.id, amount: pay.amount || 0, paymentType: pay.paymentType || 'cash', paymentRef: pay.paymentRef || null, paidAt: pay.paidAt || new Date(), tenantId },
        })
      }

      // ★★★ v6.2: کاهش موجودی + ثبت حرکت کالا + محاسبه COGS
      let totalCogs = 0
      for (const item of invoiceItems) {
        if (!item.productId) continue

        // ★ کاهش Product.currentStock (برای سازگاری با کد قدیمی)
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: item.quantity } },
        }).catch(err => console.warn(`[Invoices] Failed to decrement Product.currentStock:`, err?.message))

        // ★★★ کاهش StockLevel (موجودی واقعی انبار) + محاسبه COGS
        if (warehouseId) {
          const stockLevel = await tx.stockLevel.findUnique({
            where: { warehouseId_productId: { warehouseId, productId: item.productId } },
          }).catch(() => null)

          if (stockLevel) {
            // ★ COGS = تعداد × میانگین هزینه
            const itemCogs = item.quantity * (stockLevel.averageCost || 0)
            totalCogs += itemCogs

            // ★ کاهش موجودی انبار
            await tx.stockLevel.update({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              data: { quantity: { decrement: item.quantity } },
            }).catch(err => console.warn(`[Invoices] Failed to decrement StockLevel:`, err?.message))

            // ★ ثبت حرکت کالا (خروج از انبار)
            await tx.stockMovement.create({
              data: {
                tenantId,
                productId: item.productId,
                fromWarehouseId: warehouseId,
                quantity: item.quantity,
                unitCost: stockLevel.averageCost || 0,
                movementType: 'sale',
                referenceType: 'invoice',
                referenceId: inv.id,
                description: `فاکتور فروش ${invoiceNumber}`,
              },
            }).catch(err => console.warn(`[Invoices] Failed to create StockMovement:`, err?.message))
          } else {
            // ★ fallback: اگر StockLevel نبود، از Product.purchasePrice برای COGS استفاده کن
            const product = await tx.product.findUnique({ where: { id: item.productId } }).catch(() => null)
            if (product) {
              totalCogs += item.quantity * (product.purchasePrice || 0)
            }
          }
        } else {
          // ★ fallback: انبار انتخاب‌شده نیست — از Product.purchasePrice برای COGS استفاده کن
          const product = await tx.product.findUnique({ where: { id: item.productId } }).catch(() => null)
          if (product) {
            totalCogs += item.quantity * (product.purchasePrice || 0)
          }
        }
      }

      // ★ ذخیره COGS در فاکتور (در صورت وجود فیلد)
      try {
        await tx.invoice.update({
          where: { id: inv.id },
          data: { cogsAmount: totalCogs } as any,
        })
      } catch { /* فیلد cogsAmount ممکن است در schema نباشد — ignore */ }

      return { invoice: inv, totalCogs }
    })

    const { invoice: createdInvoice, totalCogs } = invoice

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

    if (invoiceData.customerId && (invoiceData.paymentType === 'credit' || invoiceData.paymentType === 'installment')) {
      try {
        const remainingAmount = totalAmount - paidAmount
        if (remainingAmount > 0) {
          await tenantDb.customer.update({
            where: { id: invoiceData.customerId },
            data: { currentBalance: { increment: remainingAmount }, lastPurchaseAt: new Date() },
          })
        }
      } catch (err: any) { console.warn('[Invoices] Failed to update customer balance:', err?.message) }
    } else if (invoiceData.customerId) {
      try {
        await tenantDb.customer.update({ where: { id: invoiceData.customerId }, data: { lastPurchaseAt: new Date() } })
      } catch { /* ignore */ }
    }

    let createdInstallmentPlan: any = null
    if (invoiceData.paymentType === 'installment' && installmentPlanData) {
      createdInstallmentPlan = await createInstallmentPlan(tenantId, createdInvoice, installmentPlanData)
    }

    // ★ سند حسابداری خودکار (با COGS در همه پلن‌ها) — ★★★ v6.3
    try {
      const planInfo = await getTenantPlanInfo(tenantId)
      const planTier = resolvePlanTier(planInfo.tierName)
      await createAutoJournalEntry(tenantId, createdInvoice, invoiceItems, invoiceData.paymentType || 'cash', planTier, totalCogs)
    } catch (jeErr: any) {
      console.warn('[Invoices] Auto journal entry failed (non-blocking):', jeErr?.message)
    }

    // ─── ★★★ v6.0: ارسال خودکار فاکتور به سامانه مودیان ─────────────────
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

    // ★★★ v6.2: اگر فاکتور لغو می‌شود، موجودی را برگشت بزن
    if (body.status === 'cancelled' && existing.status !== 'cancelled') {
      console.log(`[Invoices PUT] لغو فاکتور ${existing.number} — برگشت موجودی`)

      // ★ پیدا کردن warehouseId فاکتور یا انبار پیش‌فرض
      let warehouseId = existing.warehouseId || null
      if (!warehouseId) {
        const defaultWh = await tenantDb.warehouse.findFirst({ where: { tenantId, isDefault: true } }).catch(() => null)
        if (defaultWh) warehouseId = defaultWh.id
      }

      // ★ گرفتن آیتم‌های فاکتور
      const items = await tenantDb.invoiceItem.findMany({ where: { invoiceId: existing.id } })

      for (const item of items) {
        if (!item.productId) continue

        // ★ افزایش Product.currentStock
        await tenantDb.product.update({
          where: { id: item.productId },
          data: { currentStock: { increment: item.quantity } },
        }).catch(err => console.warn(`[Invoices PUT] Failed to increment Product.currentStock:`, err?.message))

        // ★ افزایش StockLevel
        if (warehouseId) {
          const stockLevel = await tenantDb.stockLevel.findUnique({
            where: { warehouseId_productId: { warehouseId, productId: item.productId } },
          }).catch(() => null)

          if (stockLevel) {
            await tenantDb.stockLevel.update({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              data: { quantity: { increment: item.quantity } },
            }).catch(err => console.warn(`[Invoices PUT] Failed to increment StockLevel:`, err?.message))
          } else {
            // ★ اگر StockLevel نبود، یکی بساز
            await tenantDb.stockLevel.create({
              data: {
                tenantId, warehouseId, productId: item.productId,
                quantity: item.quantity,
                averageCost: 0, // نمی‌دانیم cost قبلی چه بوده
              },
            }).catch(err => console.warn(`[Invoices PUT] Failed to create StockLevel:`, err?.message))
          }

          // ★ ثبت حرکت کالا (ورودی به انبار — برگشت از فروش)
          await tenantDb.stockMovement.create({
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
          }).catch(err => console.warn(`[Invoices PUT] Failed to create StockMovement:`, err?.message))
        }

        // ★ اگر نسیه/قسطی بوده، بدهی مشتری را کاهش بده
        if ((existing.paymentType === 'credit' || existing.paymentType === 'installment') && existing.customerId) {
          const remainingAmount = existing.totalAmount - existing.paidAmount
          if (remainingAmount > 0) {
            await tenantDb.customer.update({
              where: { id: existing.customerId },
              data: { currentBalance: { decrement: remainingAmount } },
            }).catch(err => console.warn(`[Invoices PUT] Failed to decrement customer balance:`, err?.message))
          }
        }
      }

      // ★ ابطال سند حسابداری (نه حذف)
      try {
        await db.client.journalEntry.updateMany({
          where: { sourceType: 'invoice', sourceId: existing.id, tenantId },
          data: { status: 'cancelled', description: `ابطال شده — فاکتور ${existing.number} لغو شد` },
        })
      } catch (err: any) {
        console.warn(`[Invoices PUT] Failed to cancel journal entries:`, err?.message)
      }
    }

    await tenantDb.invoice.update({ where: { id: body.id }, data: updateData })

    return NextResponse.json({ success: true, message: 'فاکتور با موفقیت بروزرسانی شد' })
  } catch (error: any) {
    console.error('[Invoices] PUT error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بروزرسانی فاکتور' }, { status: 500 })
  }
})

// ============================================================================
// DELETE handler for /api/invoices — Add this to src/app/api/invoices/route.ts
// ----------------------------------------------------------------------------
// ★★★ v9.9.1: اضافه‌شدن قابلیت حذف فاکتور (به‌خصوص فاکتورهای برگشتی)
// ============================================================================

// ★ این کد را به انتهای فایل src/app/api/invoices/route.ts اضافه کنید
// (قبل از آخرین خط خالی)

// src/app/api/invoices/route.ts — DELETE handler
// ★★★ FIX: اضافه کردن rollback موجودی هنگام حذف فاکتور برگشتی

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

    await tenantDb.$transaction(async (tx: any) => {
      // ★ ۱. ابطال/حذف سند حسابداری
      const journalEntries = await tx.journalEntry.findMany({
        where: { tenantId, sourceId: invoiceId },
        select: { id: true },
      })

      for (const je of journalEntries) {
        await tx.journalEntryLine.deleteMany({
          where: { journalEntryId: je.id },
        })
        await tx.journalEntry.delete({
          where: { id: je.id },
        })
      }

      // ★ ۲. حذف پرداخت‌ها
      await tx.invoicePayment.deleteMany({
        where: { invoiceId },
      }).catch(() => {})

      // ★ ۳. rollback موجودی
      const warehouseId = invoice.warehouseId
      
      if (warehouseId && invoice.items?.length > 0) {
        for (const item of invoice.items) {
          if (!item.productId) continue

          const qty = Number(item.quantity) || 0
          if (qty <= 0) continue

          if (isReturn) {
            // ★ فاکتور برگشتی: موجودی رو کاهش بده
            // (چون هنگام ثبت برگشتی، موجودی افزایش یافته بود)
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
            // ★ فاکتور فروش عادی: موجودی رو افزایش بده
            // (چون هنگام ثبت فروش، موجودی کاهش یافته بود)
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

      // ★ ۴. حذف StockMovements مرتبط
      await tx.stockMovement.deleteMany({
        where: { tenantId, referenceId: invoiceId },
      }).catch(() => {})

      // ★ ۵. حذف آیتم‌های فاکتور
      await tx.invoiceItem.deleteMany({
        where: { invoiceId },
      })

      // ★ ۶. حذف فاکتور
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

