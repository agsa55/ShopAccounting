// src/app/api/invoices/route.ts — v6.6 ★★★ COGS FIX
// ----------------------------------------------------------------------------
// ★★★ v6.6 — اصلاح محاسبه COGS:
//   ★ مشکل قبلی: اگه StockLevel.averageCost = 0 بود، COGS صفر می‌شد
//   ★ حالا: fallback به Product.purchasePrice و سپس Product.salePrice
//   ★ لاگ دقیق برای debug
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { requireSubscriptionAndLimit } from '@/lib/plan-guard'
import { getTenantPlanInfo } from '@/lib/plan-limits'
import { resolvePlanTier, type PlanTier } from '@/lib/plan-features'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { autoSubmitInvoiceIfNeeded } from '@/lib/moidian'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'

function generatePortalToken(): string {
  const uuid = randomUUID().replace(/-/g, '')
  const ts = Date.now().toString(36)
  return `${uuid}${ts}`.slice(0, 40)
}

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
    } catch (err: any) {
      console.warn('[Invoices] Could not find/seed accounts:', err?.message)
    }

    const lines: any[] = []
    const isCreditOrInstallment = paymentType === 'credit' || paymentType === 'installment'
    const netSales = invoice.subTotal - invoice.discountAmount

    const debitAccountId = isCreditOrInstallment ? (receivablesAccountId || cashAccountId) : cashAccountId
    if (debitAccountId) lines.push({ accountId: debitAccountId, debit: totalAmount, credit: 0, description: 'بدهکار: بابت فاکتور فروش' })

    if (salesAccountId) lines.push({ accountId: salesAccountId, debit: 0, credit: netSales, description: 'بستانکار: درآمد فروش' })

    if (invoice.taxAmount > 0 && taxAccountId) {
      lines.push({ accountId: taxAccountId, debit: 0, credit: invoice.taxAmount, description: 'بستانکار: مالیات فروش' })
    }

    if (totalCogs > 0 && cogsAccountId && inventoryAccountId) {
      lines.push({ accountId: cogsAccountId, debit: totalCogs, credit: 0, description: 'بدهکار: بهای تمام شده کالای فروش رفته' })
      lines.push({ accountId: inventoryAccountId, debit: 0, credit: totalCogs, description: 'بستانکار: خروج از موجودی کالا' })
    }

    if (lines.length >= 2) {
      const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0)
      const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0)

      await db.client.journalEntry.create({
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

export const GET = withTenantAndPermission('pos')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const paramsObj: any =
      ctx?.params && typeof ctx.params?.then === 'function'
        ? await ctx.params
        : ctx?.params || {}
    const invoiceId = paramsObj?.id

    if (!invoiceId) {
      return NextResponse.json({ success: false, error: 'شناسه فاکتور الزامی است' }, { status: 400 })
    }

    const invoice = await tenantDb.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        items: true,  // ← اینجا!
        payments: true,
        customer: { select: { id: true, firstName: true, lastName: true, mobile: true, portalToken: true } },
        cashier: { select: { id: true, username: true } },
        installmentPlan: { include: { schedules: { orderBy: { installmentNumber: 'asc' } } } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'فاکتور یافت نشد' }, { status: 404 })
    }

    const customerName = invoice.customer
      ? `${invoice.customer.firstName || ''} ${invoice.customer.lastName || ''}`.trim()
      : null

    const items = (invoice.items || []).map((item: any) => ({
      ...item,
      totalAmount: item.lineTotal || item.totalAmount || 0,
    }))

    return NextResponse.json({
      success: true,
      data: {
        ...invoice,
        invoiceNumber: invoice.number,
        customerName,
        finalAmount: invoice.totalAmount || 0,
        items,
      },
    })
  } catch (error: any) {
    console.error('[Invoices [id]] GET error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری فاکتور' },
      { status: 500 }
    )
  }
})
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
          ...(warehouseId ? { warehouseId } : {}),
        },
      })

      for (const item of invoiceItems) {
        await tx.invoiceItem.create({
          data: { invoiceId: inv.id, productId: item.productId || null, productName: item.productName || '', quantity: item.quantity, unitPrice: item.unitPrice, discountAmount: item.discountAmount || 0, taxAmount: item.taxAmount || 0, lineTotal: item.lineTotal || 0 },
        })
      }

      for (const pay of invoicePayments) {
        await tx.invoicePayment.create({
          data: { invoiceId: inv.id, amount: pay.amount || 0, paymentType: pay.paymentType || 'cash', paymentRef: pay.paymentRef || null, paidAt: pay.paidAt || new Date(), tenantId },
        })
      }

      // ★★★ v6.6: محاسبه COGS با fallback چندمرحله‌ای
      let totalCogs = 0
      const cogsBreakdown: any[] = []

      for (const item of invoiceItems) {
        if (!item.productId) continue

        let itemCogs = 0
        let cogsSource = 'unknown'

        // ★ کاهش Product.currentStock
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: item.quantity } },
        }).catch((err: any) => console.warn(`[Invoices] Product.currentStock decrement failed:`, err?.message))

        // ★★★ محاسبه COGS با اولویت: StockLevel.averageCost → Product.purchasePrice → Product.salePrice
        if (warehouseId) {
          const stockLevel = await tx.stockLevel.findUnique({
            where: { warehouseId_productId: { warehouseId, productId: item.productId } },
          }).catch(() => null)

          if (stockLevel) {
            const avgCost = Number(stockLevel.averageCost) || 0
            if (avgCost > 0) {
              itemCogs = item.quantity * avgCost
              cogsSource = 'StockLevel.averageCost'
            } else {
              // fallback: اگه averageCost صفر بود، از Product استفاده کن
              const product = await tx.product.findUnique({ where: { id: item.productId } }).catch(() => null)
              if (product) {
                const purchasePrice = Number(product.purchasePrice) || 0
                if (purchasePrice > 0) {
                  itemCogs = item.quantity * purchasePrice
                  cogsSource = 'Product.purchasePrice (fallback)'
                } else {
                  // last resort: از قیمت فروش (نادرست ولی بهتر از صفر)
                  const salePrice = Number(product.salePrice) || Number(item.unitPrice) || 0
                  itemCogs = item.quantity * salePrice
                  cogsSource = 'Product.salePrice (last resort)'
                }
              }
            }

            // کاهش موجودی انبار
            await tx.stockLevel.update({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              data: { quantity: { decrement: item.quantity } },
            }).catch((err: any) => console.warn(`[Invoices] StockLevel decrement failed:`, err?.message))

            // ثبت حرکت کالا
            await tx.stockMovement.create({
              data: {
                tenantId,
                productId: item.productId,
                fromWarehouseId: warehouseId,
                quantity: item.quantity,
                unitCost: avgCost || (itemCogs / item.quantity),
                movementType: 'sale',
                referenceType: 'invoice',
                referenceId: inv.id,
                description: `فاکتور فروش ${invoiceNumber}`,
              },
            }).catch((err: any) => console.warn(`[Invoices] StockMovement create failed:`, err?.message))
          } else {
            // StockLevel پیدا نشد — fallback کامل به Product
            const product = await tx.product.findUnique({ where: { id: item.productId } }).catch(() => null)
            if (product) {
              const purchasePrice = Number(product.purchasePrice) || 0
              if (purchasePrice > 0) {
                itemCogs = item.quantity * purchasePrice
                cogsSource = 'Product.purchasePrice (no StockLevel)'
              } else {
                const salePrice = Number(product.salePrice) || Number(item.unitPrice) || 0
                itemCogs = item.quantity * salePrice
                cogsSource = 'Product.salePrice (no StockLevel + no purchasePrice)'
              }
            }
          }
        } else {
          // انبار نامعتبر — fallback به Product
          const product = await tx.product.findUnique({ where: { id: item.productId } }).catch(() => null)
          if (product) {
            const purchasePrice = Number(product.purchasePrice) || 0
            if (purchasePrice > 0) {
              itemCogs = item.quantity * purchasePrice
              cogsSource = 'Product.purchasePrice (no warehouse)'
            } else {
              const salePrice = Number(product.salePrice) || Number(item.unitPrice) || 0
              itemCogs = item.quantity * salePrice
              cogsSource = 'Product.salePrice (no warehouse + no purchasePrice)'
            }
          }
        }

        totalCogs += itemCogs
        cogsBreakdown.push({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitCost: item.quantity > 0 ? itemCogs / item.quantity : 0,
          itemCogs,
          cogsSource,
        })
      }

      console.log(`[Invoices POST] COGS calculated for ${invoiceNumber}:`, {
        totalCogs,
        breakdown: cogsBreakdown,
      })

      // ذخیره COGS در فاکتور
      try {
        await tx.invoice.update({
          where: { id: inv.id },
          data: { cogsAmount: totalCogs } as any,
        })
      } catch (err: any) {
        console.warn('[Invoices] cogsAmount field not found in schema:', err?.message)
      }

      return { invoice: inv, totalCogs }
    })

    const { invoice: createdInvoice, totalCogs } = invoice

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
        console.warn('[Invoices] Portal token generation failed:', err?.message)
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
      } catch (err: any) { console.warn('[Invoices] Customer balance update failed:', err?.message) }
    } else if (invoiceData.customerId) {
      try {
        await tenantDb.customer.update({ where: { id: invoiceData.customerId }, data: { lastPurchaseAt: new Date() } })
      } catch { /* ignore */ }
    }

    let createdInstallmentPlan: any = null
    if (invoiceData.paymentType === 'installment' && installmentPlanData) {
      createdInstallmentPlan = await createInstallmentPlan(tenantId, createdInvoice, installmentPlanData)
    }

    try {
      const planInfo = await getTenantPlanInfo(tenantId)
      const planTier = resolvePlanTier(planInfo.tierName)
      await createAutoJournalEntry(tenantId, createdInvoice, invoiceItems, invoiceData.paymentType || 'cash', planTier, totalCogs)
    } catch (jeErr: any) {
      console.warn('[Invoices] Auto journal entry failed:', jeErr?.message)
    }

    try {
      await autoSubmitInvoiceIfNeeded(tenantId, createdInvoice.id)
    } catch (moidianErr: any) {
      console.warn('[Invoices] Moidian submission failed:', moidianErr?.message)
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
      console.log(`[Invoices PUT] لغو فاکتور ${existing.number} — برگشت موجودی`)

      let warehouseId = existing.warehouseId || null
      if (!warehouseId) {
        const defaultWh = await tenantDb.warehouse.findFirst({ where: { tenantId, isDefault: true } }).catch(() => null)
        if (defaultWh) warehouseId = defaultWh.id
      }

      const items = await tenantDb.invoiceItem.findMany({ where: { invoiceId: existing.id } })

      for (const item of items) {
        if (!item.productId) continue

        await tenantDb.product.update({
          where: { id: item.productId },
          data: { currentStock: { increment: item.quantity } },
        }).catch((err: any) => console.warn(`[Invoices PUT] Product.currentStock increment failed:`, err?.message))

        if (warehouseId) {
          const stockLevel = await tenantDb.stockLevel.findUnique({
            where: { warehouseId_productId: { warehouseId, productId: item.productId } },
          }).catch(() => null)

          if (stockLevel) {
            await tenantDb.stockLevel.update({
              where: { warehouseId_productId: { warehouseId, productId: item.productId } },
              data: { quantity: { increment: item.quantity } },
            }).catch((err: any) => console.warn(`[Invoices PUT] StockLevel increment failed:`, err?.message))
          } else {
            await tenantDb.stockLevel.create({
              data: {
                tenantId, warehouseId, productId: item.productId,
                quantity: item.quantity,
                averageCost: 0,
              },
            }).catch((err: any) => console.warn(`[Invoices PUT] StockLevel create failed:`, err?.message))
          }

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
          }).catch((err: any) => console.warn(`[Invoices PUT] StockMovement create failed:`, err?.message))
        }

        if ((existing.paymentType === 'credit' || existing.paymentType === 'installment') && existing.customerId) {
          const remainingAmount = existing.totalAmount - existing.paidAmount
          if (remainingAmount > 0) {
            await tenantDb.customer.update({
              where: { id: existing.customerId },
              data: { currentBalance: { decrement: remainingAmount } },
            }).catch((err: any) => console.warn(`[Invoices PUT] Customer balance decrement failed:`, err?.message))
          }
        }
      }

      try {
        await db.client.journalEntry.updateMany({
          where: { sourceType: 'invoice', sourceId: existing.id, tenantId },
          data: { status: 'cancelled', description: `ابطال شده — فاکتور ${existing.number} لغو شد` },
        })
      } catch (err: any) {
        console.warn(`[Invoices PUT] Journal entry cancellation failed:`, err?.message)
      }
    }

    await tenantDb.invoice.update({ where: { id: body.id }, data: updateData })

    return NextResponse.json({ success: true, message: 'فاکتور با موفقیت بروزرسانی شد' })
  } catch (error: any) {
    console.error('[Invoices] PUT error:', error)
    return NextResponse.json({ success: false, error: 'خطا در بروزرسانی فاکتور' }, { status: 500 })
  }
})

// ═══════════════════════════════════════════════════════════════
//  Helper: rollback کامل یک فاکتور فروش
//  ★ v11.6.9: پشتیبانی از فروش نقدی، نسیه، قسطی، چک و خدمات
// ═══════════════════════════════════════════════════════════════
async function rollbackSaleInvoice(
  tx: any,
  invoice: any,
  tenantId: string,
  options: { hardDeleteJournal?: boolean } = {}
) {
  const invoiceId = invoice.id
  const warehouseId = invoice.warehouseId
  const pt = (invoice.paymentType || 'cash').toLowerCase()
  const invoiceType = invoice.invoiceType || 'sale'
  const isReturn = invoiceType === 'sale_return'
  const isService = invoiceType === 'service'
  const hardDeleteJournal = options.hardDeleteJournal ?? false

  console.log(`[Rollback Sale] 🔄 شروع rollback فاکتور ${invoice.number} (type=${invoiceType}, paymentType=${pt}, hardDelete=${hardDeleteJournal})`)

  // ── ۱. حذف تراکنش‌های صندوق ─────────────────────────────
  try {
    const deletedCashMovements = await tx.cashMovement.deleteMany({
      where: {
        OR: [
          { invoiceId: invoiceId },
          { description: { contains: invoice.number } },
        ],
        tenantId,
      },
    })
    console.log(`[Rollback Sale] ✅ CashMovements حذف شد: ${deletedCashMovements.count} رکورد`)
  } catch (cashErr: any) {
    console.warn(`[Rollback Sale] ⚠️ CashMovement cleanup failed:`, cashErr?.message)
  }

  // ── ۲. حذف پرداخت‌های فاکتور ─────────────────────────────
  await tx.invoicePayment.deleteMany({
    where: { invoiceId },
  }).catch(() => {})

  // ── ۳. حذف پرداخت‌های آنلاین ─────────────────────────────
  await tx.onlinePayment.deleteMany({
    where: { invoiceId },
  }).catch(() => {})

  // ── ۴. حذف برنامه اقساط (اگر فاکتور قسطی است) ──────────────
  if (pt === 'installment') {
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
        console.log(`[Rollback Sale] ✅ InstallmentPlan حذف شد`)
      }
    } catch (err: any) {
      console.warn(`[Rollback Sale] ⚠️ InstallmentPlan cleanup failed:`, err?.message)
    }
  }

  // ── ۵. مدیریت چک دریافتنی (اگر فاکتور چکی است) ─────────────
  if (pt === 'check') {
    try {
      const relatedChecks = await tx.check.findMany({
        where: { invoiceId, tenantId },
      })
      for (const check of relatedChecks) {
        if (hardDeleteJournal) {
          await tx.check.delete({ where: { id: check.id } })
          console.log(`[Rollback Sale] ✓ چک ${check.checkNumber} فیزیکی حذف شد`)
        } else if (check.status === 'pending') {
          await tx.check.update({
            where: { id: check.id },
            data: {
              status: 'cancelled',
              description: `${check.description || ''} [باطل شده — فاکتور ${invoice.number} لغو شد]`,
            },
          })
          console.log(`[Rollback Sale] ✓ چک ${check.checkNumber} باطل شد`)
        }
      }
    } catch (err: any) {
      console.warn(`[Rollback Sale] Check rollback failed:`, err?.message)
    }
  }

  // ── ۶. بازگشت موجودی (فقط برای فاکتور کالایی، نه خدمات) ──────
  if (!isService && warehouseId && invoice.items?.length > 0) {
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
        // فاکتور فروش عادی: موجودی افزایش می‌یابد (برگشت)
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
    console.log(`[Rollback Sale] ✅ موجودی کالا بازگشت`)
  }

  // ── ۷. به‌روزرسانی مانده مشتری (برای نسیه/قسطی/چک) ─────────────
  if ((pt === 'credit' || pt === 'installment' || pt === 'check') && invoice.customerId && !isReturn) {
    const remainingAmount = Number(invoice.totalAmount) - Number(invoice.paidAmount)
    if (remainingAmount > 0) {
      await tx.customer.update({
        where: { id: invoice.customerId },
        data: { currentBalance: { decrement: remainingAmount } },
      }).catch(() => {})
      console.log(`[Rollback Sale] ✓ Customer.currentBalance -${remainingAmount}`)
    }
  }

  // ── ۸. مدیریت سند حسابداری ─────────────────────────────
  if (hardDeleteJournal) {
    // حذف فیزیکی سند (برای فاکتور پرداخت‌نشده)
    const journalEntries = await tx.journalEntry.findMany({
      where: { tenantId, sourceId: invoiceId },
      select: { id: true },
    })

    for (const je of journalEntries) {
      await tx.journalEntryLine.deleteMany({
        where: { journalEntryId: je.id },
      }).catch(() => {})
      await tx.journalEntry.delete({
        where: { id: je.id },
      }).catch(() => {})
    }
    console.log(`[Rollback Sale] ✅ Journal Entries فیزیکی حذف شد: ${journalEntries.length} سند`)
  } else {
    // فقط cancelled (برای فاکتور پرداخت‌شده)
    await tx.journalEntry.updateMany({
      where: {
        tenantId,
        sourceId: invoiceId,
        status: 'posted',
      },
      data: {
        isCancelled: true,
        cancelledAt: new Date(),
        status: 'cancelled',
        description: `ابطال شده — فاکتور ${invoice.number} لغو شد`,
      },
    }).catch(() => {})
    console.log(`[Rollback Sale] 📋 Journal Entries cancelled شدند`)
  }

  // ── ۹. حذف حرکات کالا ─────────────────────────────
  await tx.stockMovement.deleteMany({
    where: { tenantId, referenceId: invoiceId },
  }).catch(() => {})

  console.log(`[Rollback Sale] ✅ تکمیل rollback فاکتور ${invoice.number}`)
}

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/invoices?id=xxx (v11.6.9 - Smart Delete)
//  ★ منطق هوشمند:
//    - فاکتور پرداخت‌نشده → حذف فیزیکی کامل
//    - فاکتور پرداخت‌شده → فقط لغو (حفظ حسابرسی)
//    - فاکتور برگشتی → همیشه حذف فیزیکی (چون اصلاحی است)
//    - force=true → حذف فیزیکی اجباری (برای ادمین)
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
    const force = searchParams.get('force') === 'true'

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
    const isService = invoice.invoiceType === 'service'
    const paidAmount = Number(invoice.paidAmount || 0)
    const isPaid = paidAmount > 0
    const isCancelled = (invoice.status || '').toLowerCase() === 'cancelled'

    // ═══════════════════════════════════════════════════════════════
    // بررسی: آیا فاکتور قبلاً لغو شده؟
    // ═══════════════════════════════════════════════════════════════
    if (isCancelled && !force) {
      return NextResponse.json({
        success: false,
        error: 'این فاکتور قبلاً لغو شده است',
      }, { status: 400 })
    }

   // ═══════════════════════════════════════════════════════════════
// ★ v11.7.0: منطق استاندارد حسابداری
// حذف فیزیکی فقط برای ادمین با پارامتر force
// همه فاکتورهای ثبت‌شده فقط لغو می‌شوند
// ═══════════════════════════════════════════════════════════════
const isAdmin = tenant.user?.role === 'Admin' || tenant.user?.role === 'admin'
const canHardDelete = force && isAdmin  // فقط ادمین با تأیید ویژه

if (force && !isAdmin) {
  return NextResponse.json({
    success: false,
    error: 'حذف فیزیکی فقط توسط ادمین امکان‌پذیر است',
  }, { status: 403 })
}

    console.log(`[DELETE Sale] 🎯 Invoice ${invoice.number}: paidAmount=${paidAmount}, isPaid=${isPaid}, isReturn=${isReturn}, force=${force}, canHardDelete=${canHardDelete}`)

    if (canHardDelete) {
      // ═══ حذف فیزیکی کامل ═══
      console.log(`[DELETE Sale] 🗑️ HARD DELETE: فاکتور ${invoice.number}`)

      await tenantDb.$transaction(async (tx: any) => {
        // ۱. rollback کامل با حذف فیزیکی سند
        await rollbackSaleInvoice(tx, invoice, tenantId, { hardDeleteJournal: true })

        // ۲. حذف آیتم‌های فاکتور
        await tx.invoiceItem.deleteMany({
          where: { invoiceId },
        })

        // ۳. حذف خود فاکتور
        await tx.invoice.delete({
          where: { id: invoiceId },
        })
      })

      console.log(`[DELETE Sale] ✅ Invoice ${invoice.number} HARD DELETED`)

      return NextResponse.json({
        success: true,
        action: 'hard_deleted',
        message: `فاکتور ${invoice.number} به طور کامل حذف شد (فاکتور + سند حسابداری + تراکنش صندوق${isReturn ? ' + چک' : ''})`,
      })

    } else {
      // ═══ فقط لغو (فاکتور پرداخت‌شده) ═══
      console.log(`[DELETE Sale] ⚠️ CANCEL ONLY: فاکتور ${invoice.number} (پرداخت‌شده)`)

      await tenantDb.$transaction(async (tx: any) => {
        // ۱. rollback با cancelled کردن سند
        await rollbackSaleInvoice(tx, invoice, tenantId, { hardDeleteJournal: false })

        // ۲. تغییر وضعیت فاکتور به cancelled
        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: 'cancelled',
            description: `${invoice.description || ''}\n[لغو شده در ${new Date().toLocaleString('fa-IR')}]`,
          },
        })
      })

      console.log(`[DELETE Sale] ✅ Invoice ${invoice.number} CANCELLED (paid invoice)`)

      return NextResponse.json({
        success: true,
        action: 'cancelled',
        message: `فاکتور ${invoice.number} لغو شد. (چون پرداخت شده بود، برای حفظ حسابرسی حذف فیزیکی نشد ولی موجودی، چک و تراکنش صندوق برگشت خوردند)`,
      })
    }
  } catch (error: any) {
    console.error('[Invoices DELETE] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در حذف فاکتور: ' + (error?.message || '') },
      { status: 500 }
    )
  }
})