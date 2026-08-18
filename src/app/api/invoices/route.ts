// ============================================================================
// src/app/api/invoices/route.ts — v8.5 (Check Outside Transaction Fix)
// ★ استفاده از db.client مستقیم برای جلوگیری از مشکل tenant isolation در Railway
// ★ v8.5: ایجاد Check خارج از transaction (حل مشکل Railway Foreign Key)
// ★ v8.4: اضافه کردن createdCheck به response
// ★ v7.9: استفاده از حساب ۱۳۵۰ (چک‌های دریافتنی) برای جلوگیری از سند تکراری
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'
import type { PlanTier } from '@/lib/plan-features'

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
    
    const totalAmount = invoice.totalAmount || 0
    if (totalAmount <= 0) {
      console.log('[Invoices] ⏭️ Skipped: totalAmount <= 0')
      return
    }

    const jeCount = await tx.journalEntry.count({ where: { tenantId } })
    const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

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
    const netSales = invoice.subTotal - invoice.discountAmount
    const remainingAmount = totalAmount - paidAmount

    // ثبت پیش‌پرداخت
    if (paidAmount > 0 && cashAccountId) {
      lines.push({ 
        accountId: cashAccountId, 
        debit: paidAmount, 
        credit: 0, 
        description: 'بدهکار: دریافت نقد/پیش‌پرداخت فاکتور' 
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
        description = 'بدهکار: بدهکاران تجاری بابت فاکتور فروش'
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
    if (invoice.taxAmount > 0 && vatAccountId) {
      lines.push({ accountId: vatAccountId, debit: 0, credit: invoice.taxAmount, description: 'بستانکار: مالیات بر ارزش افزوده فروش' })
    }

    // ثبت بهای تمام شده کالای فروش رفته (COGS)
    if (totalCogs > 0 && cogsAccountId && inventoryAccountId) {
      lines.push({ accountId: cogsAccountId, debit: totalCogs, credit: 0, description: 'بدهکار: بهای تمام شده کالای فروش رفته' })
      lines.push({ accountId: inventoryAccountId, debit: 0, credit: totalCogs, description: 'بستانکار: خروج از موجودی کالا' })
    }

    console.log('[Invoices] 📝 Journal lines created:', lines.length)

    if (lines.length >= 2) {
      const totalDebit = lines.reduce((sum: number, l: any) => sum + l.debit, 0)
      const totalCredit = lines.reduce((sum: number, l: any) => sum + l.credit, 0)

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
    const { downPayment, numberOfInstallments, interestRate, installmentPeriod, totalWithInterest, installmentAmount, remainingAmount } = installmentData
    const periodDays: Record<string, number> = { monthly: 30, biweekly: 14, weekly: 7 }
    const daysPerPeriod = periodDays[installmentPeriod || 'monthly'] || 30
    const baseDate = invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date()

    console.log('[Invoices] Creating Installment Plan with data:', {
      numberOfInstallments,
      installmentAmount,
      downPayment,
      remainingAmount
    })

    const plan = await tx.installmentPlan.create({
      data: {
        invoiceId: invoice.id,
        customerId: invoice.customerId || null,
        totalAmount: invoice.totalAmount,
        downPayment: downPayment || 0,
        remainingAmount: remainingAmount || 0,
        interestRate: interestRate || 0,
        totalWithInterest: totalWithInterest || 0,
        numberOfInstallments: numberOfInstallments || 1,
        installmentAmount: installmentAmount || 0,
        installmentPeriod: installmentPeriod || 'monthly',
        status: 'active',
        paidInstallments: 0,
        totalPaidAmount: downPayment || 0,
        nextDueDate: new Date(baseDate.getTime() + daysPerPeriod * 24 * 60 * 60 * 1000),
        tenantId,
      },
    })

    for (let i = 1; i <= numberOfInstallments; i++) {
      const dueDate = new Date(baseDate.getTime() + i * daysPerPeriod * 24 * 60 * 60 * 1000)
      await tx.installmentSchedule.create({
        data: { 
          planId: plan.id, 
          installmentNumber: i, 
          amount: installmentAmount || 0, 
          dueDate, 
          status: 'pending', 
          paidAmount: 0, 
          tenantId 
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
//  GET /api/invoices (v8.5)
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const { searchParams } = new URL(req.url)
    
    const tenantId = searchParams.get('tenantId') || tenant.tenantId
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const status = searchParams.get('status')
    const paymentType = searchParams.get('paymentType')

    const where: any = { tenantId }
    
    if (status) {
      const statusUpper = status.toUpperCase()
      where.OR = [
        { status: statusUpper },
        { status: statusUpper.toLowerCase() },
        ...(statusUpper === 'PENDING' ? [{ paymentType: 'credit', status: { in: ['confirmed', 'Confirmed'] } }] : []),
        ...(statusUpper === 'PAID' ? [{ paymentType: { in: ['cash', 'Cash', 'card', 'Card', 'check', 'Check'] }, paidAmount: { gt: 0 } }] : []),
        ...(statusUpper === 'PARTIAL' ? [{ remainingAmount: { gt: 0 }, paidAmount: { gt: 0 } }] : []),
      ]
    }

    if (paymentType) {
      const ptLower = paymentType.toLowerCase()
      const ptUpper = paymentType.toUpperCase()
      const ptCapitalized = ptLower.charAt(0).toUpperCase() + ptLower.slice(1)
      
      where.paymentType = {
        in: [ptLower, ptUpper, ptCapitalized]
      }
      
      console.log('[Invoices GET] Filtering by paymentType:', where.paymentType)
    }

    let invoices: any[] = []
    try {
         invoices = await db.client.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, mobile: true, portalToken: true } },
          cashier: { select: { id: true, username: true } },
          items: true,
          payments: true,
          installmentPlan: { include: { schedules: { orderBy: { installmentNumber: 'asc' } } } },
          checks: {
            select: {
              id: true,
              status: true,
              checkNumber: true,
              bankName: true,
              dueDate: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      })
    } catch (err: any) {
      console.warn('[Invoices] Include failed, using fallback:', err?.message)
      invoices = await db.client.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, mobile: true, portalToken: true } },
          cashier: { select: { id: true, username: true } },
          items: true,
          payments: true,
          installmentPlan: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }).catch(() => [])
    }

       const result = invoices.map((inv: any) => {
      let paymentStatus = 'PENDING'
      if (inv.paidAmount >= inv.totalAmount && inv.totalAmount > 0) paymentStatus = 'PAID'
      else if (inv.paidAmount > 0) paymentStatus = 'PARTIAL'

      return {
        ...inv,
        invoiceNumber: inv.number,
        customerName: inv.customer ? `${inv.customer.firstName || ''} ${inv.customer.lastName || ''}`.trim() : null,
        finalAmount: inv.totalAmount || 0,
        paymentStatus,
        status: (inv.status || 'DRAFT').toUpperCase(),
        items: (inv.items || []).map((item: any) => ({ ...item, totalAmount: item.lineTotal || item.totalAmount || 0 })),
        installmentPlan: inv.installmentPlan || null,
        customerPortalToken: inv.customer?.portalToken || null,
        checkStatus: inv.checks?.[0]?.status || null,
        checkInfo: inv.checks?.[0] || null,
      }
    })
    const total = await db.client.invoice.count({ where })

    console.log('[Invoices GET] Found invoices:', result.length, 'with paymentType filter:', paymentType)

    return NextResponse.json({
      success: true,
      data: result,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error: any) {
    console.error('[Invoices] GET error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری فاکتورها' }, { status: 500 })
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

    console.log('\n=== 🚨 [Invoices POST v8.5] DEBUG RECEIVED DATA 🚨 ===')
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
    
    const paidAmount = Number(invoiceData.paidAmount) || 0
    const remainingAmount = totalAmount - paidAmount

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
      if (item.productId) {
        try {
          const product = await db.client.product.findFirst({ where: { id: item.productId, tenantId } })
          if (!product) continue

          if (item.quantity > product.currentStock) {
            return NextResponse.json(
              { success: false, error: `موجودی محصول "${product.name}" کافی نیست. موجودی فعلی: ${product.currentStock}، تعداد درخواستی: ${item.quantity}`, code: 'INSUFFICIENT_STOCK' },
              { status: 400 }
            )
          }

          if (warehouseId) {
            const stockLevel = await db.client.stockLevel.findUnique({
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
      })

      // ایجاد آیتم‌ها و به‌روزرسانی موجودی
      for (const item of items) {
        if (!item.productId) continue

        const product = await tx.product.findUnique({ 
          where: { id: item.productId },
          select: { name: true, purchasePrice: true }
        })

        const unitCost = Number(product?.purchasePrice || 0)
        const itemCogs = unitCost * item.quantity
        totalCogs += itemCogs

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

        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: item.quantity } },
        }).catch((err: any) => console.warn(`[Invoices POST] Failed to decrement Product.currentStock:`, err?.message))

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
                tenantId,
                warehouseId,
                productId: item.productId,
                quantity: item.quantity,
                averageCost: unitCost,
              },
            }).catch((err: any) => console.warn(`[Invoices POST] Failed to create StockLevel:`, err?.message))
          }

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

      // ثبت پرداخت‌ها
      const payments = invoiceData.payments || []
      
      if (paidAmount > 0 && payments.length === 0) {
        payments.push({
          amount: paidAmount,
          paymentType: invoiceData.downPaymentMethod || 'cash',
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

    // ★ v8.5: بازگشت response با createdCheck
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
          data: { status: 'cancelled', description: `ابطال شده — فاکتور ${existing.number} لغو شد` },
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

export const DELETE = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant?.tenantDb
    const tenantIdFromMiddleware = tenant?.tenantId

    if (!tenantDb && !db.client) {
      return NextResponse.json({ success: false, error: 'خطای پیکربندی tenant' }, { status: 500 })
    }

    const { searchParams } = new URL(req.url)
    const invoiceId = searchParams.get('id')
    const tenantId = searchParams.get('tenantId') || tenantIdFromMiddleware

    if (!invoiceId) {
      return NextResponse.json({ success: false, error: 'شناسه فاکتور الزامی است' }, { status: 400 })
    }

    const invoice: any = await db.client.invoice.findFirst({
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

    await db.client.$transaction(async (tx: any) => {
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

      if (!isReturn && (invoice.paymentType === 'credit' || invoice.paymentType === 'installment' || invoice.paymentType === 'check') && invoice.customerId) {
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
    console.error('[Invoices DELETE] Error:', error)
    return NextResponse.json({ success: false, error: 'خطا در حذف فاکتور: ' + (error?.message || '') }, { status: 500 })
  }
})