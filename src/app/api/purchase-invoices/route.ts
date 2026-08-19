// ============================================================================
// src/app/api/purchase-invoices/route.ts — v8.9.3 (Fixed Check Display After Refresh)
// ★ v8.9.3: رفع باگ عدم نمایش اطلاعات چک بعد از رفرش (Manual Join تضمینی)
// ★ v8.9.2: رفع باگ عدم نمایش اطلاعات چک بعد از رفرش
// ★ v8.9.0: پشتیبانی از خرید با چک + سند حسابداری خودکار
// ★ استفاده از حساب ۲۰۵۰ (چک‌های پرداختنی) برای جلوگیری از سند تکراری
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import {
  ensureDefaultAccounts,
  getStandardAccountIds,
} from '@/lib/accounts-auto-seed'

// ★ v8.9.3: جلوگیری از کش Next.js (علت اصلی عدم نمایش بعد از رفرش)
export const dynamic = 'force-dynamic'
export const revalidate = 0

// ═══════════════════════════════════════════════════════════════
//  GET
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const { searchParams } = new URL(req.url)
      const page       = parseInt(searchParams.get('page')       || '1')
      const limit      = parseInt(searchParams.get('limit')      || '50')
      const status     = searchParams.get('status')
      const supplierId = searchParams.get('supplierId')
      const search     = (searchParams.get('search') || '').trim()

      const where: any = { tenantId }
      if (status)     where.status     = status
      if (supplierId) where.supplierId = supplierId
      if (search) {
        where.OR = [
          { number:      { contains: search } },
          { description: { contains: search } },
        ]
      }

      let invoices: any[] = []

      try {
        // ★ v8.9.3: حذف Checks از include و استفاده از Manual Join تضمینی
        // این کار از خطای Prisma (به دلیل named relation) جلوگیری می‌کند
        const rawInvoices = await tenantDb.purchaseInvoice.findMany({
          where,
          include: {
            Supplier: {
              select: { id: true, name: true, code: true }
            },
            Warehouse: {
              select: { id: true, name: true, code: true }
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        })

        invoices = rawInvoices.map((inv: any) => ({
          ...inv,
          supplier: inv.Supplier || null,
          warehouse: inv.Warehouse || null,
        }))
      } catch (err: any) {
        console.error('[PurchaseInvoices GET] findMany with include error:', err?.message)
        // Fallback: بدون include
        try {
          const rawFallback = await tenantDb.purchaseInvoice.findMany({
            where,
            select: {
              id: true, number: true, invoiceDate: true, status: true,
              paymentType: true, totalAmount: true, paidAmount: true,
              supplierId: true, warehouseId: true, description: true, createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          })
          invoices = rawFallback
        } catch (err2: any) {
          console.error('[PurchaseInvoices GET] select fallback also failed:', err2?.message)
          invoices = []
        }
      }

      const total = await tenantDb.purchaseInvoice.count({ where })

      // ★ v8.9.3: اگر supplier یا warehouse در include نبود (یعنی fallback اجرا شد)، دستی join کن
      if (invoices.length > 0 && invoices[0].supplier === undefined) {
        console.log('[PurchaseInvoices GET] Manual join for supplier and warehouse...')
        const supplierIds  = [...new Set(invoices.map((inv: any) => inv.supplierId).filter(Boolean))]
        const warehouseIds = [...new Set(invoices.map((inv: any) => inv.warehouseId).filter(Boolean))]

        let suppliers: any[] = []
        if (supplierIds.length > 0) {
          suppliers = await tenantDb.supplier.findMany({
            where: { id: { in: supplierIds } },
            select: { id: true, name: true, code: true }
          })
        }

        let warehouses: any[] = []
        if (warehouseIds.length > 0) {
          warehouses = await tenantDb.warehouse.findMany({
            where: { id: { in: warehouseIds } },
            select: { id: true, name: true, code: true }
          })
        }

        const supplierMap  = new Map(suppliers.map((s: any) => [s.id, s]))
        const warehouseMap = new Map(warehouses.map((w: any) => [w.id, w]))

        invoices = invoices.map((inv: any) => ({
          ...inv,
          supplier:  inv.supplierId  ? supplierMap.get(inv.supplierId)   || null : null,
          warehouse: inv.warehouseId ? warehouseMap.get(inv.warehouseId) || null : null,
        }))
      }

      // ═══════════════════════════════════════════════════════════════
      // ★ v8.9.3: Manual Join تضمینی برای چک‌ها
      // این بخش حتی اگر include با خطا مواجه شود، چک‌ها را مستقیماً fetch می‌کند
      // ═══════════════════════════════════════════════════════════════
      const invoiceIds = invoices.map((inv: any) => inv.id).filter(Boolean)
      const checksMap = new Map()

      if (invoiceIds.length > 0) {
        try {
          const checks = await tenantDb.check.findMany({
            where: {
              purchaseInvoiceId: { in: invoiceIds },
              tenantId,
            },
            select: {
              id: true,
              status: true,
              checkNumber: true,
              bankName: true,
              branchName: true,
              dueDate: true,
              payeeName: true,
              amount: true,
              purchaseInvoiceId: true,
            },
            orderBy: { createdAt: 'desc' },
          })

          for (const c of checks) {
            if (c.purchaseInvoiceId && !checksMap.has(c.purchaseInvoiceId)) {
              checksMap.set(c.purchaseInvoiceId, c)
            }
          }
          console.log(`[PurchaseInvoices GET] ✅ Found ${checks.length} checks for ${invoiceIds.length} invoices`)
        } catch (err: any) {
          console.warn('[PurchaseInvoices GET] ⚠️ Failed to fetch checks manually:', err?.message)
        }
      }

      // ★ v8.9.3: اتصال چک‌ها به فاکتورها
      const invoicesWithCheckStatus = invoices.map((inv: any) => {
        const check = checksMap.get(inv.id) || null
        return {
          ...inv,
          checkStatus: check?.status || null,
          checkInfo: check
            ? {
                id: check.id,
                status: check.status,
                checkNumber: check.checkNumber,
                bankName: check.bankName,
                branchName: check.branchName,
                dueDate: check.dueDate instanceof Date
                  ? check.dueDate.toISOString().split('T')[0]
                  : (typeof check.dueDate === 'string' ? check.dueDate.substring(0, 10) : check.dueDate),
                payeeName: check.payeeName,
                amount: check.amount,
              }
            : null,
        }
      })

      return NextResponse.json({
        success: true,
        data: invoicesWithCheckStatus,
        pagination: {
          page, limit, total,
          totalPages: Math.ceil(total / limit),
        },
      })
    } catch (error: any) {
      console.error('[PurchaseInvoices GET] error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در بارگذاری فاکتورهای خرید' },
        { status: 500 }
      )
    }
  }
)

// ─── ایجاد سند حسابداری خودکار برای خرید ────────────────────
async function createPurchaseAutoJournalEntry(
  tx: any,
  tenantId: string,
  invoice: any,
  paymentType: string,
  inventoryAccountId: string | null,
  payablesAccountId: string | null,
  checkPayableAccountId: string | null,
  cashAccountId: string | null,
  vatAccountId: string | null,
) {
  try {
    console.log('[PurchaseJE] 🚀 Creating auto journal entry for:', invoice.number, 'paymentType:', paymentType)
    const totalAmount = invoice.totalAmount || 0
    if (totalAmount <= 0) {
      console.log('[PurchaseJE] ⏭️ Skipped: totalAmount <= 0')
      return
    }
    const jeCount = await tx.journalEntry.count({ where: { tenantId } })
    const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`
    const lines: any[] = []
    const pt = (paymentType || 'cash').toLowerCase()
    const isCreditOrCheck = pt === 'credit' || pt === 'check'
    const netAmount = invoice.subTotal - invoice.discountAmount

    if (inventoryAccountId) {
      lines.push({
        accountId: inventoryAccountId,
        debit: netAmount,
        credit: 0,
        description: 'بدهکار: افزایش موجودی کالا بابت خرید',
      })
    }

    if (invoice.taxAmount > 0 && vatAccountId) {
      lines.push({
        accountId: vatAccountId,
        debit: invoice.taxAmount,
        credit: 0,
        description: 'بدهکار: مالیات بر ارزش افزوده خرید',
      })
    }

    if (isCreditOrCheck) {
      let creditAccountId: string | null = null
      let description = ''
      if (pt === 'check') {
        creditAccountId = checkPayableAccountId || payablesAccountId || null
        description = 'بستانکار: چک پرداختنی بابت فاکتور خرید'
        console.log('[PurchaseJE] 💳 Check payment - using account:', creditAccountId, '(2050 preferred)')
      } else {
        creditAccountId = payablesAccountId || null
        description = 'بستانکار: بستانکاران تجاری بابت فاکتور خرید'
        console.log('[PurchaseJE] 💰 Credit payment - using account:', creditAccountId)
      }
      if (creditAccountId) {
        lines.push({
          accountId: creditAccountId,
          debit: 0,
          credit: totalAmount,
          description,
        })
      }
    } else {
      if (cashAccountId) {
        lines.push({
          accountId: cashAccountId,
          debit: 0,
          credit: totalAmount,
          description: 'بستانکار: پرداخت نقدی بابت فاکتور خرید',
        })
      }
    }

    if (lines.length >= 2) {
      const totalDebit  = lines.reduce((sum: number, l: any) => sum + l.debit, 0)
      const totalCredit = lines.reduce((sum: number, l: any) => sum + l.credit, 0)
      console.log('[PurchaseJE] 💾 Creating journal entry:', {
        number: jeNumber, totalDebit, totalCredit,
        balanced: Math.abs(totalDebit - totalCredit) < 0.01,
        paymentType: pt,
      })
      await tx.journalEntry.create({
        data: {
          number: jeNumber,
          date: invoice.invoiceDate || invoice.createdAt || new Date(),
          description: `سند خودکار بابت فاکتور خرید ${invoice.number}${isCreditOrCheck ? ` (${pt === 'check' ? 'چک' : 'نسیه'})` : ''}`,
          status: 'posted',
          sourceType: 'purchase_invoice',
          sourceId: invoice.id,
          totalDebit,
          totalCredit,
          tenantId,
          lines: { create: lines },
        },
      })
      console.log('[PurchaseJE] ✅ Journal entry created successfully:', jeNumber)
    } else {
      console.warn('[PurchaseJE] ⚠️ Not enough lines to create journal entry:', lines.length)
    }
  } catch (error: any) {
    console.error('[PurchaseJE] ❌ Failed to create auto journal entry:', error?.message)
    console.error('[PurchaseJE] ❌ Error stack:', error?.stack)
  }
}

// ═══════════════════════════════════════════════════════════════
//  POST
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const body = await req.json()
      const {
        items, supplierId, warehouseId, paymentType,
        description, invoiceDate, checkData,
      } = body

      if (!items || items.length === 0) {
        return NextResponse.json(
          { success: false, error: 'حداقل یک آیتم الزامی است' },
          { status: 400 }
        )
      }
      if (!warehouseId) {
        return NextResponse.json(
          { success: false, error: 'انتخاب انبار الزامی است' },
          { status: 400 }
        )
      }

      const count = await tenantDb.purchaseInvoice.count({ where: { tenantId } })
      const invoiceNumber = `PUR-${(count + 1).toString().padStart(5, '0')}`

      let subTotal = 0, discountAmount = 0, taxAmount = 0
      const invoiceItems = items.map((item: any) => {
        const lineTotal =
          item.quantity * item.unitPrice
          - (item.discountAmount || 0)
          + (item.taxAmount      || 0)
        subTotal       += item.quantity * item.unitPrice
        discountAmount += item.discountAmount || 0
        taxAmount      += item.taxAmount      || 0
        return {
          productId:      item.productId      || null,
          productName:    item.productName    || '',
          quantity:       item.quantity,
          unitPrice:      item.unitPrice,
          discountAmount: item.discountAmount || 0,
          taxAmount:      item.taxAmount      || 0,
          lineTotal,
        }
      })

      const totalAmount     = subTotal - discountAmount + taxAmount
      const pt = (paymentType || 'cash').toLowerCase()
      const isCreditOrCheck = pt === 'credit' || pt === 'check'
      const paidAmount      = isCreditOrCheck ? 0           : totalAmount
      const remainingAmount = isCreditOrCheck ? totalAmount  : 0

      const invoice = await tenantDb.purchaseInvoice.create({
        data: {
          tenantId,
          supplierId:      supplierId || null,
          number:          invoiceNumber,
          invoiceDate:     invoiceDate ? new Date(invoiceDate) : new Date(),
          status:          'confirmed',
          paymentType:     pt,
          subTotal,
          discountAmount,
          taxAmount,
          totalAmount,
          paidAmount,
          remainingAmount,
          warehouseId,
          description:     description || null,
        },
      })

      console.log('[PurchaseInvoice POST] ✅ Invoice created:', {
        id: invoice.id, number: invoice.number, paymentType: pt,
      })

      for (const item of invoiceItems) {
        await tenantDb.purchaseInvoiceItem.create({
          data: {
            purchaseInvoiceId: invoice.id,
            productId:         item.productId,
            productName:       item.productName,
            quantity:          item.quantity,
            unitPrice:         item.unitPrice,
            discountAmount:    item.discountAmount,
            taxAmount:         item.taxAmount,
            lineTotal:         item.lineTotal,
          },
        })

        if (item.productId) {
          const netUnitCost =
            item.quantity > 0
              ? (item.unitPrice * item.quantity - item.discountAmount) / item.quantity
              : item.unitPrice
          try {
            const stockLevel = await tenantDb.stockLevel.findUnique({
              where: {
                warehouseId_productId: {
                  warehouseId,
                  productId: item.productId,
                },
              },
            })
            if (stockLevel) {
              const oldValue   = stockLevel.quantity * stockLevel.averageCost
              const newValue   = oldValue + item.quantity * netUnitCost
              const newQty     = stockLevel.quantity + item.quantity
              const newAvgCost = newQty > 0 ? newValue / newQty : netUnitCost
              await tenantDb.stockLevel.update({
                where: {
                  warehouseId_productId: {
                    warehouseId,
                    productId: item.productId,
                  },
                },
                data: {
                  quantity:    { increment: item.quantity },
                  averageCost: newAvgCost,
                },
              })
            } else {
              await tenantDb.stockLevel.create({
                data: {
                  tenantId,
                  warehouseId,
                  productId:   item.productId,
                  quantity:    item.quantity,
                  averageCost: netUnitCost,
                },
              })
            }
            await tenantDb.stockMovement.create({
              data: {
                tenantId,
                productId:     item.productId,
                toWarehouseId: warehouseId,
                quantity:      item.quantity,
                unitCost:      netUnitCost,
                movementType:  'purchase',
                referenceType: 'purchase_invoice',
                referenceId:   invoice.id,
                description:   `فاکتور خرید ${invoiceNumber}`,
              },
            })
            await tenantDb.product.update({
              where: { id: item.productId },
              data: {
                purchasePrice: netUnitCost,
                currentStock:  { increment: item.quantity },
              },
            })
          } catch (stockErr: any) {
            console.warn('[PurchaseInvoice POST] Stock update failed (non-blocking):', stockErr?.message)
          }
        }
      }

      try {
        await ensureDefaultAccounts(tenantId)
        const accountIds = await getStandardAccountIds(tenantId)
        await createPurchaseAutoJournalEntry(
          tenantDb, tenantId, invoice, pt,
          accountIds.inventoryAccountId,
          accountIds.payablesAccountId,
          accountIds.checkPayableAccountId || (accountIds as any).checkPayableId,
          accountIds.cashAccountId,
          accountIds.vatAccountId,
        )
      } catch (jeErr: any) {
        console.warn('[PurchaseInvoice POST] Auto journal failed (non-blocking):', jeErr?.message)
      }

      let createdCheck: any = null
      if (pt === 'check' && checkData) {
        try {
          let finalPayeeName = checkData.payeeName?.trim() || null
          if (!finalPayeeName && supplierId) {
            try {
              const supplier = await tenantDb.supplier.findUnique({
                where: { id: supplierId },
                select: { name: true }
              })
              if (supplier?.name) {
                finalPayeeName = supplier.name
              }
            } catch (err: any) {
              console.warn('[PurchaseInvoice POST] Failed to fetch supplier name:', err?.message || 'خطای نامشخص')
            }
          }
          createdCheck = await tenantDb.check.create({
            data: {
              tenantId,
              type: 'payable',
              checkNumber: checkData.checkNumber?.trim() || `CHK-${Date.now().toString().slice(-6)}`,
              bankName: checkData.bankName?.trim() || 'نامشخص',
              branchName: checkData.branchName?.trim() || null,
              amount: totalAmount,
              issueDate: checkData.issueDate ? new Date(checkData.issueDate) : new Date(),
              dueDate: checkData.dueDate ? new Date(checkData.dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              supplierId: supplierId || null,
              payeeName: finalPayeeName || 'تامین‌کننده',
              description: `چک پرداختنی بابت فاکتور خرید ${invoiceNumber}`,
              status: 'pending',
              purchaseInvoiceId: invoice.id,
            },
          })
          console.log('[PurchaseInvoice POST] ✅ Check created:', {
            id: createdCheck.id,
            checkNumber: createdCheck.checkNumber,
            payeeName: createdCheck.payeeName,
            amount: totalAmount,
          })
        } catch (checkErr: any) {
          console.error('[PurchaseInvoice POST] ❌ Check creation failed:', checkErr?.message)
          createdCheck = { error: true, errorMessage: checkErr?.message, errorCode: checkErr?.code, errorMeta: checkErr?.meta }
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          ...invoice,
          check: createdCheck,
        },
        message: `فاکتور خرید ${invoiceNumber} با موفقیت ثبت شد${createdCheck ? ' و چک پرداختنی ایجاد شد' : ''}`,
      }, { status: 201 })
    } catch (error: any) {
      console.error('[PurchaseInvoices POST] error:', error)
      return NextResponse.json(
        { success: false, error: error?.message || 'خطا در ایجاد فاکتور خرید' },
        { status: 500 }
      )
    }
  }
)