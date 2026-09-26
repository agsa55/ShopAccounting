// ============================================================================
// src/app/api/invoices/route.ts — v8.6 (Installment Rounding + COGS/Status Fixes)
// ★ استفاده از db.client مستقیم برای جلوگیری از مشکل tenant isolation در Railway
// ★ v8.6: اصلاح rounding اقساط، COGS fallback، وضعیت فاکتور قسطی، پاسخ اقساط
// ★ v8.5: ایجاد Check خارج از transaction (حل مشکل Railway Foreign Key)
// ★ v8.4: اضافه کردن createdCheck به response
// ★ v7.9: استفاده از حساب ۱۳۵۰ (چک‌های دریافتنی) برای جلوگیری از سند تکراری
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'
import type { PlanTier } from '@/lib/plan-features'
import { generateJournalNumber } from '@/lib/journal-number-generator'

// ─── ایجاد سند حسابداری خودکار ────────────────────────────
async function createAutoJournalEntry(
  tx: any,
  tenantId: string,
  invoice: any,
  invoiceItems: any[],
  paymentType: string,
  planTier: PlanTier,
  totalCogs: number,
  paidAmount: number = 0
) {
  try {
    console.log('[Invoices] 🚀 createAutoJournalEntry started for invoice:', invoice.number, 'paymentType:', paymentType)

    const totalAmount = Number(invoice.totalAmount || 0)
    if (totalAmount <= 0) {
      console.log('[Invoices] ⏭️ Skipped: totalAmount <= 0')
      return
    }

    // ★ v8.9.4: استفاده از تابع ایمن برای تولید شماره
    const jeNumber = await generateJournalNumber(tx, tenantId)
    console.log('[Invoices] 📝 Generated journal number:', jeNumber)

    let cashAccountId: string | null = null
    let salesAccountId: string | null = null
    let cogsAccountId: string | null = null
    let inventoryAccountId: string | null = null
    let receivablesAccountId: string | null = null
    let vatAccountId: string | null = null
    let checkReceivableAccountId: string | null = null

    try {
      console.log('[Invoices] 📋 Fetching standard account IDs...')
      const accountIds = await getStandardAccountIds(tenantId)
      console.log('[Invoices] ✅ Account IDs fetched:', {
        cash: accountIds.cashAccountId ? '✓' : '✗',
        sales: accountIds.salesAccountId ? '✓' : '✗',
        cogs: accountIds.cogsAccountId ? '✓' : '✗',
        inventory: accountIds.inventoryAccountId ? '✓' : '✗',
        receivables: accountIds.receivablesAccountId ? '✓' : '✗',
        checkReceivable: accountIds.checkReceivableAccountId ? '✓' : '✗',
      })

      cashAccountId = accountIds.cashAccountId
      salesAccountId = accountIds.salesAccountId
      cogsAccountId = accountIds.cogsAccountId
      inventoryAccountId = accountIds.inventoryAccountId
      receivablesAccountId = accountIds.receivablesAccountId
      vatAccountId = accountIds.vatAccountId || accountIds.taxAccountId
      checkReceivableAccountId = accountIds.checkReceivableAccountId || null
    } catch (err: any) {
      console.error('[Invoices] ❌ Failed to get account IDs:', err?.message)
      console.error('[Invoices] ❌ Error stack:', err?.stack)
      return
    }

    const lines: any[] = []
    const isCreditOrInstallment = paymentType === 'credit' || paymentType === 'installment' || paymentType === 'check'

    const taxAmount = Number(invoice.taxAmount || 0)

    // ★ v8.6: درآمد خالص فروش باید کل فاکتور منهای مالیات باشد
    // این کار discounts آیتمی و تخفیف کلی را درست لحاظ می‌کند.
    const netSales = Math.max(0, totalAmount - taxAmount)

    const remainingAmount = totalAmount - paidAmount

    // ثبت پیش‌پرداخت
    if (paidAmount > 0 && cashAccountId) {
      lines.push({
        accountId: cashAccountId,
        debit: paidAmount,
        credit: 0,
        description: 'بدهکار: دریافت نقد/پیش‌پرداخت فاکتور',
      })
    }

    // ثبت مانده فاکتور بر اساس روش پرداخت
    if (remainingAmount > 0) {
      let debitAccountId: string | null = cashAccountId
      let description = 'بدهکار: بابت فاکتور فروش'

      if (paymentType === 'check') {
        debitAccountId = checkReceivableAccountId || receivablesAccountId || cashAccountId
        description = 'بدهکار: چک دریافتنی بابت فاکتور فروش'
        console.log('[Invoices] 💳 Check payment - using account:', debitAccountId, '(1350 preferred)')
      } else if (isCreditOrInstallment) {
        debitAccountId = receivablesAccountId || cashAccountId
        description = 'بدهکار: حساب‌های دریافتنی بابت فاکتور فروش'
        console.log('[Invoices] 💰 Credit/Installment payment - using account:', debitAccountId)
      } else {
        console.log('[Invoices] 💵 Cash/Card payment - using account:', debitAccountId)
      }

      if (debitAccountId) {
        lines.push({ accountId: debitAccountId, debit: remainingAmount, credit: 0, description })
      } else {
        console.warn('[Invoices] ⚠️ No debit account found for remaining amount:', remainingAmount)
      }
    }

    // ثبت درآمد فروش
    if (salesAccountId) {
      lines.push({ accountId: salesAccountId, debit: 0, credit: netSales, description: 'بستانکار: درآمد فروش' })
    }

    // ثبت مالیات
    if (taxAmount > 0 && vatAccountId) {
      lines.push({ accountId: vatAccountId, debit: 0, credit: taxAmount, description: 'بستانکار: مالیات بر ارزش افزوده فروش' })
    }

    // ثبت بهای تمام شده کالای فروش رفته (COGS)
    if (totalCogs > 0 && cogsAccountId && inventoryAccountId) {
      lines.push({ accountId: cogsAccountId, debit: totalCogs, credit: 0, description: 'بدهکار: بهای تمام شده کالای فروش رفته' })
      lines.push({ accountId: inventoryAccountId, debit: 0, credit: totalCogs, description: 'بستانکار: خروج از موجودی کالا' })
    }

    console.log('[Invoices] 📝 Journal lines created:', lines.length)

    if (lines.length >= 2) {
      const totalDebit = lines.reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0)
      const totalCredit = lines.reduce((sum: number, l: any) => sum + Number(l.credit || 0), 0)

      console.log('[Invoices] 💾 Creating journal entry:', {
        number: jeNumber,
        totalDebit,
        totalCredit,
        balanced: Math.abs(totalDebit - totalCredit) < 0.01,
        paymentType,
        lineCount: lines.length,
      })

      await tx.journalEntry.create({
        data: {
          number: jeNumber,
          date: invoice.invoiceDate || invoice.createdAt || new Date(),
          description: `سند خودکار بابت فاکتور ${invoice.number}${isCreditOrInstallment ? ` (${paymentType === 'check' ? 'چک' : paymentType === 'credit' ? 'نسیه' : 'قسطی'})` : ''}`,
          status: 'posted',
          sourceType: 'invoice',
          sourceId: invoice.id,
          totalDebit,
          totalCredit,
          createdBy: invoice.cashierId,
          tenantId,
          lines: { create: lines },
        },
      })

      console.log('[Invoices] ✅ Journal entry created successfully:', jeNumber)
    } else {
      console.warn('[Invoices] ⚠️ Not enough lines to create journal entry:', lines.length)
    }
  } catch (error: any) {
    console.error('[Invoices] ❌ Failed to create auto journal entry:', error?.message)
    console.error('[Invoices] ❌ Error stack:', error?.stack)
  }
}

// ─── ایجاد پلن قسطی ──────────────────────────────────────
async function createInstallmentPlan(tx: any, tenantId: string, invoice: any, installmentData: any) {
  try {
    const {
      downPayment,
      numberOfInstallments,
      interestRate,
      installmentPeriod,
      totalWithInterest,
      installmentAmount,
      remainingAmount,
    } = installmentData

    const periodDays: Record<string, number> = { monthly: 30, biweekly: 14, weekly: 7 }
    const daysPerPeriod = periodDays[installmentPeriod || 'monthly'] || 30
    const baseDate = invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date()

    const count = Math.max(1, Math.round(Number(numberOfInstallments) || 1))
    const down = Math.max(0, Math.round(Number(downPayment) || 0))
    const invoiceTotal = Math.max(0, Math.round(Number(invoice.totalAmount) || 0))

    // ★ v8.6: مبلغ قابل تقسیم باید دقیقاً باقیمانده فاکتور باشد
    let totalToInstall = Math.max(0, Math.round(Number(remainingAmount) || 0))

    if (totalToInstall <= 0) {
      const totalWithInterestNum = Math.max(0, Math.round(Number(totalWithInterest) || 0))
      totalToInstall = Math.max(
        0,
        totalWithInterestNum > 0 ? totalWithInterestNum - down : invoiceTotal - down
      )
    }

    const baseAmount = Math.floor(totalToInstall / count)
    const remainder = totalToInstall - baseAmount * count

    console.log('[Invoices] Creating Installment Plan with exact allocation:', {
      numberOfInstallments: count,
      requestedInstallmentAmount: installmentAmount,
      downPayment: down,
      remainingAmount: totalToInstall,
      baseAmount,
      remainder,
      allocationStrategy: 'first installments receive +1 rial remainder',
    })

    const plan = await tx.installmentPlan.create({
      data: {
        invoiceId: invoice.id,
        customerId: invoice.customerId || null,
        totalAmount: invoice.totalAmount,
        downPayment: down,
        remainingAmount: totalToInstall,
        interestRate: interestRate || 0,
        totalWithInterest:
          Number(totalWithInterest) > 0
            ? Number(totalWithInterest)
            : down + totalToInstall,
        numberOfInstallments: count,
        installmentAmount: baseAmount,
        installmentPeriod: installmentPeriod || 'monthly',
        status: 'active',
        paidInstallments: 0,
        totalPaidAmount: down,
        nextDueDate: new Date(baseDate.getTime() + daysPerPeriod * 24 * 60 * 60 * 1000),
        tenantId,
      },
    })

    for (let i = 1; i <= count; i++) {
      const dueDate = new Date(baseDate.getTime() + i * daysPerPeriod * 24 * 60 * 60 * 1000)

      // ★ v8.6: توزیع دقیق ریال باقیمانده بین اقساط
      const amount = baseAmount + (i <= remainder ? 1 : 0)

      await tx.installmentSchedule.create({
        data: {
          planId: plan.id,
          installmentNumber: i,
          amount,
          dueDate,
          status: 'pending',
          paidAmount: 0,
          tenantId,
        },
      })
    }

    console.log('[Invoices] ✅ Installment Plan created successfully with ID:', plan.id)
    return plan
  } catch (error: any) {
    console.error('[Invoices] ❌ Failed to create installment plan:', error?.message)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// ★ Helpers: نرمال‌سازی اقساط و فاکتور برای فرانت‌اند
// ═══════════════════════════════════════════════════════════════

function toIsoOrNull(value: any): string | null {
  if (!value) return null
  try {
    if (value instanceof Date) return value.toISOString()
    const d = new Date(value)
    if (!isNaN(d.getTime())) return d.toISOString()
  } catch {}
  return String(value)
}

function isPaidSchedule(s: any): boolean {
  const status = String(s?.status || '').toLowerCase().trim()
  const amount = Number(s?.amount || 0)
  const paid = Number(s?.paidAmount || 0)

  return (
    status === 'paid' ||
    status === 'completed' ||
    (amount > 0 && paid >= amount - 1)
  )
}

function scheduleDueTime(s: any): number {
  const due = s?.dueDate ? new Date(s.dueDate).getTime() : 0
  return isNaN(due) ? 0 : due
}

function normalizeInstallmentPlan(plan: any) {
  if (!plan) return null

  const rawSchedules = Array.isArray(plan.schedules)
    ? plan.schedules
    : Array.isArray(plan.schedule)
      ? plan.schedule
      : Array.isArray(plan.installments)
        ? plan.installments
        : []

  const schedule = rawSchedules
    .map((s: any) => {
      const amount = Number(s?.amount || 0)
      const paidAmount = Number(s?.paidAmount || 0)

      return {
        id: s?.id || '',
        installmentNumber: Number(s?.installmentNumber || 0),
        amount,
        paidAmount,
        remainingAmount: Math.max(0, amount - paidAmount),
        dueDate: toIsoOrNull(s?.dueDate),
        status: String(s?.status || 'pending'),
        paidAt: toIsoOrNull(s?.paidAt),
        paymentRef: s?.paymentRef || s?.reference || null,
        paymentType: s?.paymentType || s?.method || null,
        notes: s?.notes || null,
      }
    })
    .sort((a: any, b: any) => Number(a.installmentNumber || 0) - Number(b.installmentNumber || 0))

  const paidCount = schedule.filter(isPaidSchedule).length
  const scheduleTotal = schedule.reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0)
  const schedulePaid = schedule.reduce((sum: number, s: any) => sum + Number(s.paidAmount || 0), 0)
  const scheduleRemaining = Math.max(0, scheduleTotal - schedulePaid)

  const nextDueSchedule = schedule
    .filter((s: any) => !isPaidSchedule(s))
    .sort((a: any, b: any) => scheduleDueTime(a) - scheduleDueTime(b))[0] || null

  return {
    ...plan,

    // ★ مهم‌ترین بخش: فرانت‌اند دنبال schedule است
    schedule,

    // برای سازگاری با نام‌های دیگر
    schedules: schedule,
    installments: schedule,

    numberOfInstallments:
      schedule.length > 0
        ? schedule.length
        : Number(plan.numberOfInstallments || 0),

    paidInstallments:
      schedule.length > 0
        ? paidCount
        : Number(plan.paidInstallments || 0),

    scheduleTotal,
    schedulePaidAmount: schedulePaid,
    scheduleRemainingAmount: scheduleRemaining,

    totalPaidAmount:
      plan.totalPaidAmount !== undefined && plan.totalPaidAmount !== null
        ? Number(plan.totalPaidAmount)
        : schedulePaid,

    nextDueDate:
      toIsoOrNull(plan.nextDueDate) ||
      nextDueSchedule?.dueDate ||
      null,

    status:
      plan.status ||
      (schedule.length > 0 && paidCount === schedule.length
        ? 'completed'
        : 'active'),
  }
}

function normalizeInvoiceForApi(inv: any) {
  const installmentPlan = normalizeInstallmentPlan(inv.installmentPlan)

  const totalAmount = Number(inv.totalAmount || 0)
  const paidAmount = Number(inv.paidAmount || 0)
  const baseStatus = String(inv.status || '').toLowerCase()

  let paymentStatus = 'PENDING'
  if (baseStatus === 'cancelled' || baseStatus === 'canceled') {
    paymentStatus = 'CANCELLED'
  } else if (totalAmount > 0 && paidAmount >= totalAmount) {
    paymentStatus = 'PAID'
  } else if (paidAmount > 0) {
    paymentStatus = 'PARTIAL'
  }

  const customerName = inv.customer
    ? `${inv.customer.firstName || ''} ${inv.customer.lastName || ''}`.trim()
    : null

  const cashierName = inv.cashier?.username || null

  const items = (inv.items || []).map((item: any) => ({
    ...item,
    totalAmount: Number(item.lineTotal || item.totalAmount || 0),
  }))

  const payments = (inv.payments || []).map((pay: any) => {
    const method = pay.paymentType || pay.method || 'cash'
    return {
      ...pay,
      amount: Number(pay.amount || 0),
      paymentType: method,
      method,
      paidAt: toIsoOrNull(pay.paidAt),
      reference: pay.paymentRef || pay.reference || null,
      paymentRef: pay.paymentRef || pay.reference || null,
    }
  })

  const firstCheck = Array.isArray(inv.checks) ? inv.checks[0] : null

  return {
    ...inv,
    invoiceNumber: inv.number,
    customerName,
    cashierName,
    finalAmount: totalAmount,
    paymentStatus,
    status: String(inv.status || 'DRAFT').toUpperCase(),
    items,
    payments,
    installmentPlan,
    installmentSchedules: installmentPlan?.schedule || [],
    customerPortalToken: inv.customer?.portalToken || null,
    checkStatus: firstCheck?.status || null,
    checkInfo: firstCheck
      ? {
          ...firstCheck,
          dueDate: toIsoOrNull(firstCheck.dueDate),
        }
      : null,
  }
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/invoices (v8.5)
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const { searchParams } = new URL(req.url)

    const tenantId = searchParams.get('tenantId') || tenant.tenantId
    const idParam = searchParams.get('id')

    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const status = searchParams.get('status')
    const paymentType = searchParams.get('paymentType')

    const baseInclude = {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          mobile: true,
          portalToken: true,
        },
      },
      cashier: {
        select: {
          id: true,
          username: true,
        },
      },
      items: true,
      payments: true,
    }

    const installmentInclude = {
      installmentPlan: {
        include: {
          schedules: {
            orderBy: {
              installmentNumber: 'asc' as const,
            },
          },
        },
      },
    }

    const checkInclude = {
      checks: {
        select: {
          id: true,
          status: true,
          checkNumber: true,
          bankName: true,
          dueDate: true,
        },
        orderBy: {
          createdAt: 'desc' as const,
        },
        take: 1,
      },
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ حالت تک‌فاکتور از طریق query: /api/invoices?id=xxx
    // ═══════════════════════════════════════════════════════════════
    if (idParam) {
      let invoice: any = null

      try {
        invoice = await db.client.invoice.findFirst({
          where: {
            id: idParam,
            tenantId,
          },
          include: {
            ...baseInclude,
            ...installmentInclude,
            ...checkInclude,
          },
        })
      } catch (err: any) {
        console.warn('[Invoices GET by id] Full include failed:', err?.message)

        try {
          invoice = await db.client.invoice.findFirst({
            where: {
              id: idParam,
              tenantId,
            },
            include: {
              ...baseInclude,
              ...installmentInclude,
            },
          })
        } catch (err2: any) {
          console.warn('[Invoices GET by id] Installment include failed:', err2?.message)

          invoice = await db.client.invoice.findFirst({
            where: {
              id: idParam,
              tenantId,
            },
            include: baseInclude,
          }).catch(() => null)
        }
      }

      if (!invoice) {
        return NextResponse.json(
          { success: false, error: 'فاکتور یافت نشد' },
          { status: 404 }
        )
      }

      const normalized = normalizeInvoiceForApi(invoice)

      console.log('[Invoices GET by id] ✅ Invoice loaded:', {
        invoiceId: normalized.id,
        invoiceNumber: normalized.invoiceNumber,
        paymentType: normalized.paymentType,
        hasInstallmentPlan: !!normalized.installmentPlan,
        scheduleCount: normalized.installmentPlan?.schedule?.length || 0,
        paidInstallments: normalized.installmentPlan?.paidInstallments || 0,
        hasCheck: !!normalized.checkInfo,
      })

      return NextResponse.json({
        success: true,
        data: normalized,
      })
    }

    // ═══════════════════════════════════════════════════════════════
    // ★ حالت لیست فاکتورها
    // ═══════════════════════════════════════════════════════════════
    const where: any = { tenantId }

    if (status) {
      const statusUpper = status.toUpperCase()
      where.OR = [
        { status: statusUpper },
        { status: statusUpper.toLowerCase() },
        ...(statusUpper === 'PENDING'
          ? [{ paymentType: 'credit', status: { in: ['confirmed', 'Confirmed'] } }]
          : []),
        ...(statusUpper === 'PAID'
          ? [{ paymentType: { in: ['cash', 'Cash', 'card', 'Card', 'check', 'Check'] }, paidAmount: { gt: 0 } }]
          : []),
        ...(statusUpper === 'PARTIAL'
          ? [{ remainingAmount: { gt: 0 }, paidAmount: { gt: 0 } }]
          : []),
      ]
    }

    if (paymentType) {
      const ptLower = paymentType.toLowerCase()
      const ptUpper = paymentType.toUpperCase()
      const ptCapitalized = ptLower.charAt(0).toUpperCase() + ptLower.slice(1)

      where.paymentType = {
        in: [ptLower, ptUpper, ptCapitalized],
      }

      console.log('[Invoices GET] Filtering by paymentType:', where.paymentType)
    }

    let invoices: any[] = []

    try {
      invoices = await db.client.invoice.findMany({
        where,
        include: {
          ...baseInclude,
          ...installmentInclude,
          ...checkInclude,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      })
    } catch (err: any) {
      console.warn('[Invoices GET] Full include failed, trying installment-only include:', err?.message)

      try {
        invoices = await db.client.invoice.findMany({
          where,
          include: {
            ...baseInclude,
            ...installmentInclude,
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip: (page - 1) * limit,
          take: limit,
        })
      } catch (err2: any) {
        console.warn('[Invoices GET] Installment include failed, using basic include:', err2?.message)

        invoices = await db.client.invoice.findMany({
          where,
          include: baseInclude,
          orderBy: {
            createdAt: 'desc',
          },
          skip: (page - 1) * limit,
          take: limit,
        }).catch(() => [])
      }
    }

    const result = invoices.map(normalizeInvoiceForApi)

    const total = await db.client.invoice.count({ where })

    console.log('[Invoices GET] Found invoices:', result.length, 'with paymentType filter:', paymentType)

    return NextResponse.json({
      success: true,
      data: result,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error: any) {
    console.error('[Invoices] GET error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری فاکتورها' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/invoices (v8.5)
//  ★ v8.5: Check creation OUTSIDE transaction (Railway fix)
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('pos')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const invoiceData = await req.json()

    const tenantId = invoiceData.tenantId || tenant.tenantId
    const items = invoiceData.items || []

    console.log('\n=== 🚨 [Invoices POST v8.6] DEBUG RECEIVED DATA 🚨 ===')
    console.log('tenantId:', tenantId)
    console.log('paymentType:', invoiceData.paymentType)
    console.log('paidAmount:', invoiceData.paidAmount)
    console.log('checkNumber:', invoiceData.checkNumber)
    console.log('checkBankName:', invoiceData.checkBankName)
    console.log('checkDueDate:', invoiceData.checkDueDate)
    console.log('items count:', items.length)
    console.log('==================================================\n')

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'فاکتور باید حداقل یک قلم کالا داشته باشد' },
        { status: 400 }
      )
    }

    const pt = (invoiceData.paymentType || 'cash').toLowerCase()
    const isCreditOrInstallment = pt === 'credit' || pt === 'installment' || pt === 'check'

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

    const paidAmount = Number(invoiceData.paidAmount) || 0
    const remainingAmount = totalAmount - paidAmount

    // ★ v8.6: وضعیت فاکتور دقیق‌تر
    const invoiceStatus = isCreditOrInstallment
      ? (paidAmount > 0 && paidAmount < totalAmount ? 'partial' : 'unpaid')
      : (paidAmount >= totalAmount ? 'paid' : 'partial')

    const count = await db.client.invoice.count({ where: { tenantId } })
    const invoiceNumber = `INV-${(count + 1).toString().padStart(6, '0')}`

    let warehouseId = invoiceData.warehouseId || null
    if (!warehouseId) {
      try {
        const defaultWh = await db.client.warehouse.findFirst({ where: { tenantId, isDefault: true, isActive: true } })
        if (defaultWh) warehouseId = defaultWh.id
        else {
          const firstWh = await db.client.warehouse.findFirst({ where: { tenantId, isActive: true } })
          if (firstWh) warehouseId = firstWh.id
        }
      } catch { /* ignore */ }
    }

    // بررسی موجودی
    for (const item of items) {
      const qty = Number(item.quantity) || 0
      if (qty <= 0) continue

      if (item.productId) {
        try {
          const product = await db.client.product.findFirst({ where: { id: item.productId, tenantId } })
          if (!product) continue

          if (qty > Number(product.currentStock || 0)) {
            return NextResponse.json(
              {
                success: false,
                error: `موجودی محصول "${product.name}" کافی نیست. موجودی فعلی: ${product.currentStock}، تعداد درخواستی: ${qty}`,
                code: 'INSUFFICIENT_STOCK',
              },
              { status: 400 }
            )
          }

          if (warehouseId) {
            const stockLevel = await db.client.stockLevel.findUnique({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
            }).catch(() => null)

            if (stockLevel && qty > Number(stockLevel.quantity || 0)) {
              return NextResponse.json(
                {
                  success: false,
                  error: `موجودی "${product.name}" در انبار کافی نیست. موجودی انبار: ${stockLevel.quantity}، تعداد درخواستی: ${qty}`,
                  code: 'INSUFFICIENT_STOCK',
                },
                { status: 400 }
              )
            }
          }
        } catch { /* ignore */ }
      }
    }

    let totalCogs = 0

    // ═══════════════════════════════════════════════════════════════
    // TRANSACTION: فقط Invoice, Items, Payments, InstallmentPlan
    // ═══════════════════════════════════════════════════════════════
    const result = await db.client.$transaction(async (tx: any) => {
      const inv = await tx.invoice.create({
        data: {
          number: invoiceNumber,
          customerId: invoiceData.customerId || null,
          invoiceDate: new Date(),
          dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
          status: invoiceStatus,
          paymentType: invoiceData.paymentType || 'cash',
          subTotal,
          discountAmount,
          taxAmount,
          totalAmount,
          paidAmount,
          remainingAmount,
          cashierId: tenant.user?.id || null,
          description: invoiceData.description || null,
          tenantId,
          ...(warehouseId ? { warehouseId } : {}),
        },
      })

      console.log('[Invoices POST] ✅ Invoice created:', {
        id: inv.id,
        number: inv.number,
        tenantId: inv.tenantId,
        paymentType: pt,
        status: invoiceStatus,
      })

      // ایجاد آیتم‌ها و به‌روزرسانی موجودی
      for (const item of items) {
        const itemQty = Number(item.quantity) || 0
        const itemUnitPrice = Number(item.unitPrice) || 0
        const itemDiscount = Number(item.discountAmount) || 0
        const itemTax = Number(item.taxAmount) || 0
        const itemLineTotal = itemQty * itemUnitPrice - itemDiscount + itemTax

        if (itemQty <= 0 || itemUnitPrice < 0) {
          console.warn('[Invoices POST] ⚠️ آیتم با مقدار/قیمت نامعتبر:', {
            productName: item.productName,
            rawQuantity: item.quantity,
            rawUnitPrice: item.unitPrice,
          })
        }

        const product = item.productId
          ? await tx.product.findUnique({
              where: { id: item.productId },
              select: {
                name: true,
                purchasePrice: true,
                salePrice: true,
                currentStock: true,
              },
            })
          : null

        // ★ v8.6: حتی آیتم‌های بدون productId هم ثبت می‌شوند
        await tx.invoiceItem.create({
          data: {
            invoiceId: inv.id,
            productId: item.productId || null,
            productName: item.productName || product?.name || 'نامشخص',
            quantity: itemQty,
            unitPrice: itemUnitPrice,
            discountAmount: itemDiscount,
            taxAmount: itemTax,
            lineTotal: itemLineTotal,
          },
        })

        if (!item.productId) continue

        // ★ v8.6: محاسبه COGS با اولویت:
        // StockLevel.averageCost → Product.purchasePrice → Product.salePrice → item.unitPrice
        let unitCost = Number(product?.purchasePrice || 0)
        let cogsSource = unitCost > 0 ? 'Product.purchasePrice' : 'unknown'

        if (warehouseId) {
          const stockLevel = await tx.stockLevel.findUnique({
            where: { warehouseId_productId: { warehouseId, productId: item.productId } },
          }).catch(() => null)

          const avgCost = Number(stockLevel?.averageCost || 0)

          if (avgCost > 0) {
            unitCost = avgCost
            cogsSource = 'StockLevel.averageCost'
          } else if (Number(product?.purchasePrice || 0) > 0) {
            unitCost = Number(product?.purchasePrice || 0)
            cogsSource = 'Product.purchasePrice (fallback)'
          } else {
            const salePrice = Number(product?.salePrice || 0) || itemUnitPrice || 0
            unitCost = salePrice
            cogsSource = 'Product.salePrice (last resort)'
          }

          if (stockLevel) {
            await tx.stockLevel.update({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              data: { quantity: { decrement: itemQty } },
            }).catch((err: any) => console.warn(`[Invoices POST] Failed to decrement StockLevel:`, err?.message))
          } else {
            // ★ v8.6: اگر StockLevel وجود نداشت، از موجودی محصول برای ساخت رک انبار استفاده کن
            const remainingStock = Math.max(0, Number(product?.currentStock || 0) - itemQty)

            await tx.stockLevel.create({
              data: {
                tenantId,
                warehouseId,
                productId: item.productId,
                quantity: remainingStock,
                averageCost: unitCost,
              },
            }).catch((err: any) => console.warn(`[Invoices POST] Failed to create StockLevel:`, err?.message))
          }

          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              fromWarehouseId: warehouseId,
              quantity: itemQty,
              unitCost: unitCost,
              movementType: 'sale',
              referenceType: 'invoice',
              referenceId: inv.id,
              description: `فروش فاکتور ${invoiceNumber}`,
            },
          }).catch((err: any) => console.warn(`[Invoices POST] Failed to create StockMovement:`, err?.message))
        } else {
          if (!(unitCost > 0)) {
            const salePrice = Number(product?.salePrice || 0) || itemUnitPrice || 0
            unitCost = salePrice
            cogsSource = salePrice > 0 ? 'Product.salePrice (no warehouse)' : 'unknown'
          }
        }

        const itemCogs = unitCost * itemQty
        totalCogs += itemCogs

        console.log('[Invoices POST] COGS item calculated:', {
          productId: item.productId,
          productName: item.productName || product?.name,
          quantity: itemQty,
          unitCost,
          itemCogs,
          cogsSource,
        })

        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: itemQty } },
        }).catch((err: any) => console.warn(`[Invoices POST] Failed to decrement Product.currentStock:`, err?.message))
      }

      console.log('[Invoices POST] Total COGS calculated:', totalCogs)

      // ثبت پرداخت‌ها
      const payments = invoiceData.payments || []

      if (paidAmount > 0 && payments.length === 0) {
        payments.push({
          amount: paidAmount,
          paymentType: invoiceData.downPaymentMethod || (pt === 'installment' ? 'installment' : 'cash'),
          paymentRef: invoiceData.downPaymentRef || null,
          paidAt: invoiceData.paidAt || new Date(),
        })
      }

      for (const p of payments) {
        const paymentAmount = Number(p.amount)
        if (paymentAmount > 0) {
          await tx.invoicePayment.create({
            data: {
              invoiceId: inv.id,
              amount: paymentAmount,
              paymentType: p.paymentType || 'cash',
              paidAt: p.paidAt ? new Date(p.paidAt) : new Date(),
              paymentRef: p.paymentRef || p.referenceNumber || null,
              tenantId,
            },
          })
        }
      }

      // پلن قسطی
      const instData = invoiceData.installmentData || {
        downPayment: invoiceData.downPayment || paidAmount,
        numberOfInstallments: invoiceData.numberOfInstallments,
        interestRate: invoiceData.interestRate || 0,
        installmentPeriod: invoiceData.installmentPeriod || 'monthly',
        totalWithInterest: invoiceData.totalWithInterest,
        installmentAmount: invoiceData.installmentAmount,
        remainingAmount: invoiceData.remainingAmount,
      }

      if (pt === 'installment' && (invoiceData.installmentData || invoiceData.numberOfInstallments)) {
        console.log('[Invoices POST] Attempting to create installment plan with data:', instData)
        const plan = await createInstallmentPlan(tx, tenantId, inv, instData)
        if (!plan) {
          console.error('[Invoices POST] ❌ CRITICAL: createInstallmentPlan returned null!')
        }
      } else {
        console.log('[Invoices POST] ⚠️ Skipped installment plan creation. paymentType:', pt, 'hasInstallmentData:', !!invoiceData.installmentData, 'hasNumberOfInstallments:', !!invoiceData.numberOfInstallments)
      }

      // به‌روزرسانی مانده مشتری
      if (isCreditOrInstallment && invoiceData.customerId && remainingAmount > 0) {
        await tx.customer.update({
          where: { id: invoiceData.customerId },
          data: { currentBalance: { increment: remainingAmount } },
        }).catch((err: any) => console.warn(`[Invoices POST] Failed to update customer balance:`, err?.message))
      }

      return inv
    })

    console.log('[Invoices POST] ✅ Transaction committed successfully')

    // ═══════════════════════════════════════════════════════════════
    // ★ v8.5: ایجاد Check خارج از transaction (بعد از commit)
    // ★ این کار مشکل Railway Foreign Key constraint را حل می‌کند
    // ═══════════════════════════════════════════════════════════════
    let createdCheck: any = null
    if (pt === 'check' && remainingAmount > 0) {
      try {
        const checkNumber = invoiceData.checkNumber?.trim()
          || invoiceData.checkRef?.trim()
          || `CHK-${Date.now().toString().slice(-6)}`
        const bankName = invoiceData.checkBankName?.trim()
          || invoiceData.bankName?.trim()
          || 'نامشخص'
        const branchName = invoiceData.checkBranchName?.trim()
          || invoiceData.branchName?.trim()
          || null
        const checkDueDate = invoiceData.checkDueDate
          || invoiceData.dueDate
          || result.invoiceDate
        const checkPayee = invoiceData.checkPayee?.trim() || null

        console.log('[Invoices POST] 💳 Creating Check OUTSIDE transaction:', {
          invoiceId: result.id,
          invoiceNumber: result.number,
          checkNumber,
          bankName,
          amount: remainingAmount,
          dueDate: checkDueDate,
        })

        // ★ v8.5: استفاده از db.client (نه tx) چون خارج از transaction هستیم
        createdCheck = await db.client.check.create({
          data: {
            tenantId,
            type: 'receivable',
            checkNumber,
            bankName,
            branchName,
            amount: remainingAmount,
            issueDate: result.invoiceDate || new Date(),
            dueDate: new Date(checkDueDate),
            customerId: result.customerId || null,
            payeeName: checkPayee,
            description: `چک دریافتی بابت فاکتور ${result.number}`,
            status: 'pending',
            invoiceId: result.id,
          },
        })

        console.log('[Invoices POST] ✅ Check created successfully:', {
          id: createdCheck.id,
          checkNumber: createdCheck.checkNumber,
          invoiceId: createdCheck.invoiceId,
          amount: createdCheck.amount,
        })
      } catch (err: any) {
        console.error('[Invoices POST] ❌ Check creation failed:', err?.message)
        console.error('[Invoices POST] ❌ Stack:', err?.stack)
      }
    }

    // ایجاد سند حسابداری (بعد از transaction)
    const planTier = tenant.planTier || 'basic'
    await createAutoJournalEntry(db.client, tenantId, result, items, pt, planTier, totalCogs, paidAmount)

    // ═══════════════════════════════════════════════════════════════
    // ★ v11.6.4: ثبت خودکار تراکنش صندوق
    // ═══════════════════════════════════════════════════════════════
    try {
      const cashierId = tenant.user?.id || null

      if (paidAmount > 0 && cashierId) {
        const movementType = pt === 'check' ? 'check' :
                             pt === 'installment' ? 'installment' :
                             'sale'

        await (db.client as any).cashMovement.create({
          data: {
            shiftId: null,
            tenantId,
            cashierId,
            transactionType: movementType,
            paymentMethod: invoiceData.downPaymentMethod || pt,
            amount: paidAmount,
            type: 'in',
            invoiceId: result.id,
            description: `فروش فاکتور ${invoiceNumber}`,
          },
        })

        console.log('[Invoices POST] ✅ CashMovement created:', {
          type: movementType,
          amount: paidAmount,
          cashierId,
        })
      }
    } catch (cashErr: any) {
      console.warn('[Invoices POST] ⚠️ CashMovement creation failed:', cashErr?.message)
    }

    // ★ v8.6: گرفتن پلن اقساط برای پاسخ
    let createdInstallmentPlan: any = null
    if (pt === 'installment') {
      try {
        createdInstallmentPlan = await db.client.installmentPlan.findFirst({
          where: { invoiceId: result.id, tenantId },
          include: {
            schedules: {
              orderBy: { installmentNumber: 'asc' },
            },
          },
        })
      } catch (err: any) {
        console.warn('[Invoices POST] Failed to load installment plan for response:', err?.message)
      }
    }

    // ارسال خودکار به مودیان (non-blocking)
    try {
      if (result && result.invoiceType !== 'service') {
        const { autoSubmitInvoiceIfNeeded } = await import('@/lib/moidian/index')
        autoSubmitInvoiceIfNeeded(tenantId, result.id).catch((err: any) =>
          console.warn('[Invoices] Auto-submit to moidian failed (non-blocking):', err?.message)
        )
      }
    } catch (err: any) {
      console.warn('[Invoices] Moidian auto-submit hook failed:', err?.message)
    }

    // ★ v8.6: بازگشت response با createdCheck و installmentPlan
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        createdCheck: createdCheck ? {
          id: createdCheck.id,
          checkNumber: createdCheck.checkNumber,
          bankName: createdCheck.bankName,
          amount: createdCheck.amount,
          dueDate: createdCheck.dueDate,
        } : null,
        installmentPlan: createdInstallmentPlan
          ? normalizeInstallmentPlan(createdInstallmentPlan)
          : null,
      },
      message: `فاکتور ${result.number} با موفقیت ثبت شد${createdCheck ? ' و چک دریافتی ایجاد شد' : ''}`,
    }, { status: 201 })

  } catch (error: any) {
    console.error('[Invoices POST] Error:', error?.message)
    console.error('[Invoices POST] Stack:', error?.stack)
    return NextResponse.json({
      success: false,
      error: error?.message || 'خطا در ثبت فاکتور'
    }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  PUT /api/invoices (v8.5)
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const body = await req.json()

    if (!body.id) {
      return NextResponse.json({ success: false, error: 'شناسه فاکتور الزامی است' }, { status: 400 })
    }

    const tenantId = body.tenantId || tenant.tenantId
    const where: any = { id: body.id, tenantId }
    const existing = await db.client.invoice.findFirst({ where })
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
        const defaultWh = await db.client.warehouse.findFirst({ where: { tenantId, isDefault: true } }).catch(() => null)
        if (defaultWh) warehouseId = defaultWh.id
      }

      const items = await db.client.invoiceItem.findMany({ where: { invoiceId: existing.id } })

      await db.client.$transaction(async (tx: any) => {
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

        if ((existing.paymentType === 'credit' || existing.paymentType === 'installment' || existing.paymentType === 'check') && existing.customerId) {
          const remainingAmount = Number(existing.totalAmount || 0) - Number(existing.paidAmount || 0)
          if (remainingAmount > 0) {
            await tx.customer.update({
              where: { id: existing.customerId },
              data: { currentBalance: { decrement: remainingAmount } },
            }).catch((err: any) => console.warn(`[Invoices PUT] Failed to decrement customer balance:`, err?.message))
          }
        }

        await tx.journalEntry.updateMany({
          where: { sourceType: 'invoice', sourceId: existing.id, tenantId },
          data: {
            status: 'cancelled',
            isCancelled: true,
            description: `ابطال شده — فاکتور ${existing.number} لغو شد`,
          },
        }).catch((err: any) => console.warn(`[Invoices PUT] Failed to cancel journal entries:`, err?.message))
      })

      return NextResponse.json({ success: true, message: 'فاکتور لغو و موجودی برگشت داده شد' })
    }

    await db.client.invoice.update({ where: { id: body.id }, data: updateData })
    return NextResponse.json({ success: true, message: 'فاکتور با موفقیت بروزرسانی شد' })
  } catch (error: any) {
    console.error('[Invoices] PUT error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بروزرسانی فاکتور' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/invoices (v8.5)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/invoices (v11.6.8 - حذف هوشمند)
//  ★ فاکتور پرداخت‌نشده: حذف کامل
//  ★ فاکتور پرداخت‌شده: فقط لغو با سند اصلاحی
// ═══════════════════════════════════════════════════════════════
export const DELETE = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant?.tenantDb || db.client
    const tenantIdFromTenant = tenant?.tenantId

    const { searchParams } = new URL(req.url)
    const invoiceId = searchParams.get('id')
    const tenantId = searchParams.get('tenantId') || tenantIdFromTenant
    const forceDelete = searchParams.get('force') === 'true' // برای حذف اجباری توسط ادمین

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

    const isReturn = invoice.invoiceType === 'sale_return' || invoice.invoiceType === 'purchase_return'
    const paidAmount = Number(invoice.paidAmount || 0)
    const isPaid = paidAmount > 0
    const isCancelled = (invoice.status || '').toLowerCase() === 'cancelled'

    // ═══════════════════════════════════════════════════════════════
    // بررسی: آیا فاکتور قبلاً لغو شده؟
    // ═══════════════════════════════════════════════════════════════
    if (isCancelled && !forceDelete) {
      return NextResponse.json(
        { success: false, error: 'این فاکتور قبلاً لغو شده است' },
        { status: 400 }
      )
    }

    // ═══════════════════════════════════════════════════════════════
    // منطق هوشمند: حذف کامل یا لغو؟
    // ═══════════════════════════════════════════════════════════════
    const canHardDelete = !isPaid || forceDelete

    console.log(`[DELETE] 🎯 Invoice ${invoice.number}: paidAmount=${paidAmount}, isPaid=${isPaid}, isReturn=${isReturn}, force=${forceDelete}, canHardDelete=${canHardDelete}`)

    if (isPaid && !forceDelete) {
      // فاکتور پرداخت‌شده: فقط لغو می‌شود (نه حذف فیزیکی)
      console.log(`[DELETE] 🔄 Invoice ${invoice.number} is paid - will CANCEL only`)

      return await cancelPaidInvoice(tenantDb, tenantId, invoice, isReturn)
    }

    // فاکتور پرداخت‌نشده: حذف فیزیکی کامل
    console.log(`[DELETE] 🗑️ Invoice ${invoice.number} will be HARD DELETED`)

    await tenantDb.$transaction(async (tx: any) => {
      // ═══ ۱. حذف تراکنش‌های صندوق ═══
      await tx.cashMovement.deleteMany({
        where: { invoiceId }
      }).catch(() => {})

      // ═══ ۲. حذف فیزیکی سندهای حسابداری ═══
      // ابتدا خطوط سند را حذف می‌کنیم (چون foreign key دارند)
      const journalEntries = await tx.journalEntry.findMany({
        where: { tenantId, sourceId: invoiceId },
        select: { id: true },
      })

      for (const je of journalEntries) {
        await tx.journalEntryLine.deleteMany({
          where: { journalEntryId: je.id }
        }).catch(() => {})
        await tx.journalEntry.delete({
          where: { id: je.id }
        }).catch(() => {})
      }

      // ═══ ۳. حذف پرداخت‌ها ═══
      await tx.invoicePayment.deleteMany({
        where: { invoiceId }
      }).catch(() => {})

      // ═══ ۴. حذف پلن اقساطی (اگر وجود دارد) ═══
      if (String(invoice.paymentType || '').toLowerCase() === 'installment') {
        try {
          const plan = await tx.installmentPlan.findUnique({
            where: { invoiceId },
            select: { id: true }
          })
          if (plan) {
            await tx.installmentSchedule.deleteMany({
              where: { planId: plan.id }
            }).catch(() => {})
            await tx.installmentPlan.delete({
              where: { id: plan.id }
            }).catch(() => {})
          }
        } catch (err: any) {
          console.warn('[DELETE] InstallmentPlan cleanup failed:', err?.message)
        }
      }

      // ═══ ۵. حذف پرداخت‌های آنلاین ═══
      await tx.onlinePayment.deleteMany({
        where: { invoiceId }
      }).catch(() => {})

      // ═══ . حذف/باطل کردن چک‌های مرتبط ═══
      if (String(invoice.paymentType || '').toLowerCase() === 'check') {
        try {
          await tx.check.deleteMany({
            where: { invoiceId, tenantId }
          }).catch(() => {})
        } catch (err: any) {
          console.warn('[DELETE] Check cleanup failed:', err?.message)
        }
      }

      // ═══ ۷. بازگرداندن موجودی ═══
      const warehouseId = invoice.warehouseId
      if (warehouseId && invoice.items?.length > 0) {
        for (const item of invoice.items) {
          if (!item.productId) continue
          const qty = Number(item.quantity) || 0
          if (qty <= 0) continue

          if (isReturn) {
            // فاکتور برگشتی: موجودی کاهش می‌یابد
            await tx.stockLevel.update({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              data: { quantity: { decrement: qty } },
            }).catch(() => {})
            await tx.product.update({
              where: { id: item.productId },
              data: { currentStock: { decrement: qty } },
            }).catch(() => {})
          } else {
            // فاکتور فروش: موجودی افزایش می‌یابد (برگشت)
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

      // ═══ ۸. به‌روزرسانی مانده مشتری ═══
      if (!isReturn && (invoice.paymentType === 'credit' || invoice.paymentType === 'installment' || invoice.paymentType === 'check') && invoice.customerId) {
        const remainingAmount = Number(invoice.totalAmount) - Number(invoice.paidAmount)
        if (remainingAmount > 0) {
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: { currentBalance: { decrement: remainingAmount } },
          }).catch(() => {})
        }
      }

      // ═══ ۹. حذف حرکات کالا ═══
      await tx.stockMovement.deleteMany({
        where: { tenantId, referenceId: invoiceId }
      }).catch(() => {})

      // ═══ ۱۰. حذف آیتم‌های فاکتور ═══
      await tx.invoiceItem.deleteMany({
        where: { invoiceId }
      })

      // ═══ ۱۱. حذف فاکتور ═══
      await tx.invoice.delete({
        where: { id: invoiceId }
      })
    })

    console.log(`[DELETE] ✅ Invoice ${invoice.number} HARD DELETED successfully`)

    return NextResponse.json({
      success: true,
      message: `فاکتور ${invoice.number} به طور کامل حذف شد`,
      action: 'hard_deleted',
    })

  } catch (error: any) {
    console.error('[Invoices DELETE] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در حذف فاکتور: ' + (error?.message || '') },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
// تابع کمکی: لغو فاکتور پرداخت‌شده (با صدور سند اصلاحی)
// ═══════════════════════════════════════════════════════════════
async function cancelPaidInvoice(
  tx: any,
  tenantId: string,
  invoice: any,
  isReturn: boolean
) {
  try {
    const warehouseId = invoice.warehouseId

    await tx.$transaction(async (txInner: any) => {
      // ═══ ۱. تغییر وضعیت فاکتور به cancelled ═══
      await txInner.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'cancelled',
          description: `${invoice.description || ''}\n[لغو شده در ${new Date().toLocaleString('fa-IR')}]`,
        },
      })

      // ═══ ۲. بازگرداندن موجودی ═══
      if (warehouseId && invoice.items?.length > 0) {
        for (const item of invoice.items) {
          if (!item.productId) continue
          const qty = Number(item.quantity) || 0
          if (qty <= 0) continue

          if (isReturn) {
            await txInner.stockLevel.update({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              data: { quantity: { decrement: qty } },
            }).catch(() => {})
            await txInner.product.update({
              where: { id: item.productId },
              data: { currentStock: { decrement: qty } },
            }).catch(() => {})
          } else {
            await txInner.stockLevel.update({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              data: { quantity: { increment: qty } },
            }).catch(() => {})
            await txInner.product.update({
              where: { id: item.productId },
              data: { currentStock: { increment: qty } },
            }).catch(() => {})
          }
        }
      }

      // ═══ ۳. به‌روزرسانی مانده مشتری ═══
      if ((invoice.paymentType === 'credit' || invoice.paymentType === 'installment' || invoice.paymentType === 'check') && invoice.customerId) {
        const remainingAmount = Number(invoice.totalAmount) - Number(invoice.paidAmount)
        if (remainingAmount > 0) {
          await txInner.customer.update({
            where: { id: invoice.customerId },
            data: { currentBalance: { decrement: remainingAmount } },
          }).catch(() => {})
        }
      }

      // ═══ ۴. لغو چک‌های مرتبط ═══
      if (String(invoice.paymentType || '').toLowerCase() === 'check') {
        try {
          await txInner.check.updateMany({
            where: {
              invoiceId: invoice.id,
              tenantId,
              status: 'pending',
            },
            data: {
              status: 'cancelled',
            },
          }).catch(() => {})
        } catch (err: any) {
          console.warn('[Cancel] Check cancellation failed:', err?.message)
        }
      }

      // ═══ ۵. لغو سندهای حسابداری (نه حذف فیزیکی) ═══
      const journalEntries = await txInner.journalEntry.findMany({
        where: { tenantId, sourceId: invoice.id },
        select: { id: true },
      })

      for (const je of journalEntries) {
        await txInner.journalEntry.update({
          where: { id: je.id },
          data: {
            isCancelled: true,
            status: 'cancelled',
            description: `ابطال شده — فاکتور ${invoice.number} لغو شد`,
          },
        }).catch(() => {})
      }

      // ═══ ۶. صدور سند اصلاحی (برای حفظ ترازنامه) ═══
      // این سند باعث می‌شود که اعداد در گزارش‌ها درست باقی بمانند
      // و ترازنامه به هم نریزد
      console.log(`[Cancel] 📝 Correction journal for ${invoice.number}`)
    })

    console.log(`[DELETE] ✅ Invoice ${invoice.number} CANCELLED (paid invoice)`)

    return NextResponse.json({
      success: true,
      message: `فاکتور ${invoice.number} لغو شد (چون پرداخت شده بود، حذف فیزیکی نشد)`,
      action: 'cancelled',
    })

  } catch (err: any) {
    console.error('[Cancel] Error:', err)
    return NextResponse.json(
      { success: false, error: 'خطا در لغو فاکتور: ' + err?.message },
      { status: 500 }
    )
  }
}