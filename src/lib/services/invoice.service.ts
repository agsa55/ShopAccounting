/**
 * Invoice Service
 * 
 * Business logic for invoice operations.
 * Extracted from API routes for:
 * - Testability
 * - Reusability across routes and background jobs
 * - Separation of concerns
 * - Easier optimization (caching, queuing)
 */

import { db } from '@/lib/db'
import { cacheService, getCachedProducts } from '@/lib/cache'
import { CacheKeys, CacheTTL } from '@/lib/redis'
import { dbLogger, logBusinessEvent, PerformanceTimer } from '@/lib/logger'
import type { CreateInvoiceInput, InvoiceQueryInput } from '@/lib/validations/invoice'

// ============================================
// Types
// ============================================

interface InvoiceListResult {
  data: unknown[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

interface InvoiceCreateResult {
  success: boolean
  data?: unknown
  error?: string
}

// ============================================
// Invoice List (with caching)
// ============================================

/**
 * Get paginated invoice list with caching
 * Cache key includes: tenantId, page, filters
 */
export async function getInvoices(query: InvoiceQueryInput): Promise<InvoiceListResult> {
  const timer = new PerformanceTimer('getInvoices')
  const { tenantId, page, limit, search, status, paymentType, dateFrom, dateTo } = query

  // Build cache key
  const cacheKey = `shopaccounting:${tenantId}:invoices:${page}:${limit}:${search}:${status}:${paymentType}:${dateFrom}:${dateTo}`

  try {
    const result = await cacheService.getOrSet<InvoiceListResult>(
      cacheKey,
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: Record<string, any> = { tenantId }

        if (search) {
          where.OR = [
            { number: { contains: search } },
            { description: { contains: search } },
          ]
        }

        if (status) where.status = status
        if (paymentType) where.paymentType = paymentType

        if (dateFrom || dateTo) {
          const dateFilter: Record<string, Date> = {}
          if (dateFrom) dateFilter.gte = new Date(dateFrom)
          if (dateTo) dateFilter.lte = new Date(dateTo)
          where.invoiceDate = dateFilter
        }

        const [data, total] = await Promise.all([
          db.invoice.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            include: {
              customer: true,
              cashier: true,
              items: true,
              payments: true,
              installmentPlan: {
                include: { installments: true },
              },
            },
            orderBy: { invoiceDate: 'desc' },
          }),
          db.invoice.count({ where }),
        ])

        const enrichedData = data.map(inv => ({
          ...inv,
          customerName: inv.customer
            ? `${inv.customer.firstName} ${inv.customer.lastName}`
            : null,
          cashierName: inv.cashier?.username || null,
        }))

        return {
          data: enrichedData,
          total,
          page,
          limit,
          hasMore: page * limit < total,
        }
      },
      { ttl: CacheTTL.SHORT } // Short TTL for invoices (they change frequently)
    )

    timer.end({ tenantId, page, count: result.data.length })
    return result
  } catch (error) {
    dbLogger.error({ error, tenantId }, 'Failed to get invoices')
    timer.end({ tenantId, error: true })
    throw error
  }
}

// ============================================
// Invoice Creation (heavy operation - split into steps)
// ============================================

/**
 * Create invoice - Step 1: Core invoice data
 * This is the synchronous part that must complete before returning to user
 */
export async function createInvoiceCore(input: CreateInvoiceInput): Promise<InvoiceCreateResult> {
  const timer = new PerformanceTimer('createInvoiceCore')
  const { tenantId } = input

  try {
    // Calculate totals from items
    let subTotal = 0
    let taxAmount = 0
    let discountAmount = 0

    const invoiceItems = input.items.map((item) => {
      const lineTotal = item.quantity * item.unitPrice * (1 - item.discount / 100) * (1 + item.taxRate / 100)
      const lineDiscountAmount = item.quantity * item.unitPrice * (item.discount / 100)
      const lineTaxAmount = item.quantity * item.unitPrice * (1 - item.discount / 100) * (item.taxRate / 100)

      subTotal += item.quantity * item.unitPrice
      taxAmount += lineTaxAmount
      discountAmount += lineDiscountAmount

      return {
        productId: item.productId || null,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        taxRate: item.taxRate,
        lineTotal: Math.round(lineTotal),
      }
    })

    const totalAmount = Math.round(subTotal - discountAmount + taxAmount)
    const paidAmount = input.payments?.reduce((sum, p) => sum + p.amount, 0) || 0
    const remainingAmount = totalAmount - paidAmount

    // Determine initial status
    let status = 'Draft'
    if (paidAmount >= totalAmount) status = 'Paid'
    else if (paidAmount > 0) status = 'PartiallyPaid'

    // Calculate due date
    let dueDate = null
    if (input.paymentType === 'Credit' || input.paymentType === 'Installment') {
      dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + (input.paymentType === 'Installment' ? (input.numberOfInstallments || 3) * (input.intervalDays || 30) : 30))
    }

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(tenantId)

    // Create invoice with items in a transaction
    const invoice = await db.$transaction(async (tx) => {
      // Create invoice
      const inv = await tx.invoice.create({
        data: {
          number: invoiceNumber,
          customerId: input.customerId || null,
          invoiceDate: new Date(),
          dueDate,
          status,
          paymentType: input.paymentType,
          subTotal: Math.round(subTotal),
          discountAmount: Math.round(discountAmount),
          taxAmount: Math.round(taxAmount),
          totalAmount,
          paidAmount: Math.round(paidAmount),
          remainingAmount: Math.round(remainingAmount),
          cashierId: input.cashierId || null,
          description: input.description || null,
          tenantId,
          items: { create: invoiceItems },
        },
        include: {
          customer: true,
          cashier: true,
          items: true,
        },
      })

      // Create payments
      if (input.payments && input.payments.length > 0) {
        for (const payment of input.payments) {
          await tx.invoicePayment.create({
            data: {
              invoiceId: inv.id,
              amount: payment.amount,
              paymentType: payment.paymentType,
              reference: payment.reference || null,
              paidAt: new Date(),
              receivedBy: input.cashierId || null,
            },
          })
        }
      }

      // Create installment plan if needed
      if (input.paymentType === 'Installment' && input.numberOfInstallments) {
        const perInstallment = Math.floor(totalAmount / input.numberOfInstallments)
        const remainder = totalAmount - perInstallment * input.numberOfInstallments

        const plan = await tx.installmentPlan.create({
          data: {
            invoiceId: inv.id,
            totalAmount,
            numberOfInstallments: input.numberOfInstallments,
            startDate: new Date(),
            intervalDays: input.intervalDays || 30,
            interestRate: input.interestRate || 0,
            tenantId,
          },
        })

        for (let i = 1; i <= input.numberOfInstallments; i++) {
          const installmentDueDate = new Date()
          installmentDueDate.setDate(installmentDueDate.getDate() + i * (input.intervalDays || 30))

          await tx.installment.create({
            data: {
              planId: plan.id,
              number: i,
              dueDate: installmentDueDate,
              amount: i === input.numberOfInstallments ? perInstallment + remainder : perInstallment,
              status: 'Pending',
              paidAmount: 0,
            },
          })
        }
      }

      return inv
    })

    // Invalidate cache
    await cacheService.invalidateEntity(tenantId, 'invoices')
    await cacheService.invalidateEntity(tenantId, 'dashboard')

    // Log business event
    logBusinessEvent('invoice_created', tenantId, input.cashierId || 'system', {
      invoiceId: invoice.id,
      invoiceNumber,
      totalAmount,
      paymentType: input.paymentType,
    })

    timer.end({ tenantId, invoiceId: invoice.id, totalAmount })

    return {
      success: true,
      data: {
        ...invoice,
        customerName: invoice.customer
          ? `${invoice.customer.firstName} ${invoice.customer.lastName}`
          : null,
        cashierName: invoice.cashier?.username || null,
      },
    }
  } catch (error) {
    dbLogger.error({ error, tenantId }, 'Failed to create invoice')
    timer.end({ tenantId, error: true })
    return {
      success: false,
      error: 'خطا در ایجاد فاکتور',
    }
  }
}

/**
 * Create invoice - Step 2: Post-creation async operations
 * These run in background (via BullMQ) after invoice is created
 * - Update product stock
 * - Update customer balance
 * - Generate journal entry
 */
export async function processInvoicePostCreation(
  invoiceId: string,
  tenantId: string,
  items: Array<{ productId?: string | null; quantity: number; productName: string }>,
  customerId?: string | null,
  paymentType?: string,
  invoiceNumber?: string,
  totalAmount?: number,
  cashierId?: string | null
): Promise<void> {
  const timer = new PerformanceTimer('processInvoicePostCreation')

  try {
    // 1. Update product stock
    for (const item of items) {
      if (item.productId) {
        const product = await db.product.findUnique({ where: { id: item.productId } })
        if (product) {
          const newStock = Math.max(0, product.currentStock - Math.floor(item.quantity))
          await db.product.update({
            where: { id: item.productId },
            data: { currentStock: newStock },
          })
          await db.stockMovement.create({
            data: {
              productId: item.productId,
              movementType: 'Out',
              quantity: Math.floor(item.quantity),
              reference: `فاکتور ${invoiceNumber || invoiceId}`,
              beforeStock: product.currentStock,
              afterStock: newStock,
              userId: cashierId || null,
              tenantId,
            },
          })

          // Invalidate product cache
          await cacheService.del(CacheKeys.product(tenantId, item.productId))

          // Check low stock alert
          if (newStock <= product.minStock && product.minStock > 0) {
            dbLogger.warn({
              tenantId,
              productId: item.productId,
              currentStock: newStock,
              minStock: product.minStock,
            }, 'Low stock alert')
          }
        }
      }
    }

    // Invalidate products cache
    await cacheService.invalidateEntity(tenantId, 'products')

    // 2. Update customer balance
    if (customerId && (paymentType === 'Credit' || paymentType === 'Installment')) {
      const invoice = await db.invoice.findUnique({ where: { id: invoiceId } })
      if (invoice) {
        await db.customer.update({
          where: { id: customerId },
          data: { currentBalance: { increment: invoice.remainingAmount } },
        })
        await cacheService.invalidateEntity(tenantId, 'customers')
      }
    }

    // 3. Generate journal entry
    if (totalAmount && invoiceNumber) {
      await generateJournalEntry(invoiceId, invoiceNumber, tenantId, paymentType || 'Cash', totalAmount, cashierId)
    }

    timer.end({ tenantId, invoiceId })
  } catch (error) {
    dbLogger.error({ error, tenantId, invoiceId }, 'Failed to process invoice post-creation')
    timer.end({ tenantId, invoiceId, error: true })
    // Don't throw - this is a background operation
    // The invoice itself is already created
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Generate unique invoice number
 * Format: INV-YYMMDD## (e.g., INV-25031201)
 */
async function generateInvoiceNumber(tenantId: string): Promise<string> {
  const today = new Date()
  const dateStr = `${String(today.getFullYear() % 100)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
  
  const lastInvoice = await db.invoice.findFirst({
    where: { tenantId, number: { startsWith: `INV-${dateStr}` } },
    orderBy: { number: 'desc' },
  })

  let seq = 1
  if (lastInvoice) {
    const lastSeq = parseInt(lastInvoice.number.split('-').pop() || '0', 10)
    seq = lastSeq + 1
  }

  return `INV-${dateStr}${String(seq).padStart(2, '0')}`
}

/**
 * Generate journal entry for invoice
 */
async function generateJournalEntry(
  invoiceId: string,
  invoiceNumber: string,
  tenantId: string,
  paymentType: string,
  totalAmount: number,
  cashierId?: string | null
): Promise<void> {
  try {
    const [cashboxAccount, customersAccount, salesRevenueAccount] = await Promise.all([
      db.account.findFirst({ where: { code: '111', tenantId } }),
      db.account.findFirst({ where: { code: '121', tenantId } }),
      db.account.findFirst({ where: { code: '41', tenantId } }),
    ])

    if (!cashboxAccount || !salesRevenueAccount) {
      dbLogger.warn({ tenantId }, 'Journal entry accounts not found - skipping auto-entry')
      return
    }

    // Generate entry number
    const today = new Date()
    const dateStr = `${String(today.getFullYear() % 100)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    
    const lastEntry = await db.journalEntry.findFirst({
      where: { tenantId },
      orderBy: { number: 'desc' },
    })
    
    let entrySeq = 1
    if (lastEntry) {
      const lastEntrySeq = parseInt(lastEntry.number.split('-').pop() || '0', 10)
      entrySeq = lastEntrySeq + 1
    }
    const entryNumber = `JE-${dateStr}${String(entrySeq).padStart(2, '0')}`

    let debitAccountId = cashboxAccount.id
    let debitDescription = `دریافت نقدی فاکتور ${invoiceNumber}`

    if (paymentType === 'Credit' || paymentType === 'Installment') {
      if (customersAccount) {
        debitAccountId = customersAccount.id
        debitDescription = `بدهی مشتری - فاکتور ${invoiceNumber}`
      }
    }

    await db.journalEntry.create({
      data: {
        number: entryNumber,
        entryDate: new Date(),
        entryType: 'Automatic',
        description: `صدور فاکتور ${paymentType === 'Cash' ? 'نقدی' : 'نسیه'} ${invoiceNumber}`,
        referenceType: 'Invoice',
        referenceId: invoiceId,
        totalDebit: totalAmount,
        totalCredit: totalAmount,
        status: 'Confirmed',
        tenantId,
        lines: {
          create: [
            {
              accountId: debitAccountId,
              debit: totalAmount,
              credit: 0,
              description: debitDescription,
            },
            {
              accountId: salesRevenueAccount.id,
              debit: 0,
              credit: totalAmount,
              description: paymentType === 'Cash' ? 'درآمد فروش نقدی' : 'درآمد فروش نسیه',
            },
          ],
        },
      },
    })

    dbLogger.info({ tenantId, invoiceId, entryNumber }, 'Auto journal entry created')
  } catch (error) {
    dbLogger.error({ error, tenantId, invoiceId }, 'Failed to create auto journal entry')
  }
}

// ============================================
// Get Single Invoice (with caching)
// ============================================

export async function getInvoiceById(invoiceId: string, tenantId: string) {
  const cacheKey = CacheKeys.invoice(tenantId, invoiceId)
  
  return cacheService.getOrSet(
    cacheKey,
    async () => {
      const invoice = await db.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          customer: true,
          cashier: true,
          items: true,
          payments: true,
          installmentPlan: {
            include: { installments: true },
          },
        },
      })

      if (!invoice) return null

      return {
        ...invoice,
        customerName: invoice.customer
          ? `${invoice.customer.firstName} ${invoice.customer.lastName}`
          : null,
        cashierName: invoice.cashier?.username || null,
      }
    },
    { ttl: CacheTTL.MEDIUM }
  )
}
