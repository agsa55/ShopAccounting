// ============================================================================
// src/app/api/purchase-invoices/route.ts — v8.8.6
// فاکتور خرید با سند حسابداری خودکار + موجودی + میانگین وزنی
// ★ v8.8.6: فیکس اساسی انتخاب حساب (استفاده صحیح از accounts-auto-seed)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import {
  ensureDefaultAccounts,
  getStandardAccountIds,
} from '@/lib/accounts-auto-seed'

// ═══════════════════════════════════════════════════════════════
//  Helper: لیست فاکتورها با relation
// ═══════════════════════════════════════════════════════════════
async function safeInvoiceFindMany(
  tenantDb: any,
  where: any,
  orderBy: any,
  skip: number,
  take: number
) {
  const invoices = await tenantDb.purchaseInvoice.findMany({
    where, orderBy, skip, take,
  })

  if (invoices.length === 0) return invoices

  const supplierIds = [
    ...new Set(invoices.map((i: any) => i.supplierId).filter(Boolean)),
  ]
  const warehouseIds = [
    ...new Set(invoices.map((i: any) => i.warehouseId).filter(Boolean)),
  ]

  const [suppliers, warehouses] = await Promise.all([
    supplierIds.length > 0
      ? tenantDb.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, name: true, code: true },
        })
      : [],
    warehouseIds.length > 0
      ? tenantDb.warehouse.findMany({
          where: { id: { in: warehouseIds } },
          select: { id: true, name: true },
        })
      : [],
  ])

  const suppliersMap  = new Map(suppliers.map((s: any)  => [s.id, s]))
  const warehousesMap = new Map(warehouses.map((w: any) => [w.id, w]))

  return invoices.map((inv: any) => ({
    ...inv,
    supplier:  inv.supplierId  ? suppliersMap.get(inv.supplierId)   ?? null : null,
    warehouse: inv.warehouseId ? warehousesMap.get(inv.warehouseId) ?? null : null,
  }))
}

// ═══════════════════════════════════════════════════════════════
//  Helper: شماره سند بعدی
// ═══════════════════════════════════════════════════════════════
async function nextJENumber(tenantId: string, tx: any): Promise<string> {
  const count = await tx.journalEntry.count({ where: { tenantId } })
  return `JE-${(count + 1).toString().padStart(6, '0')}`
}

// ═══════════════════════════════════════════════════════════════
//  Helper: ساخت و ذخیره سند حسابداری
// ═══════════════════════════════════════════════════════════════
async function buildAndSaveJournal(opts: {
  tenantId:    string
  tx:          any
  date:        Date
  description: string
  sourceType:  string
  sourceId:    string
  createdBy:   string | null
  lines: Array<{
    accountId:   string
    debit:       number
    credit:      number
    description: string
  }>
}): Promise<any> {
  const { tenantId, tx, date, description, sourceType, sourceId, createdBy, lines } = opts

  if (lines.length < 2) {
    throw new Error(`حداقل ۲ خط سند نیاز است (الان: ${lines.length})`)
  }

  const totalDebit  = lines.reduce((s, l) => s + (l.debit  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0)

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`عدم تراز سند: بدهکار=${totalDebit} بستانکار=${totalCredit}`)
  }

  const number = await nextJENumber(tenantId, tx)

  const entry = await tx.journalEntry.create({
    data: {
      tenantId,
      number,
      date,
      description,
      status:     'posted',
      sourceType,
      sourceId,
      totalDebit,
      totalCredit,
      createdBy,
      lines: { create: lines },
    },
  })

  console.log(
    `[Journal] ${number} ساخته شد — ${lines.length} خط` +
    ` — بدهکار: ${totalDebit} — بستانکار: ${totalCredit}`
  )

  return entry
}

// ═══════════════════════════════════════════════════════════════
//  GET — لیست فاکتورهای خرید
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, _ctx: any, tenant: any) => {
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

      const [invoices, total] = await Promise.all([
        safeInvoiceFindMany(
          tenantDb, where,
          { createdAt: 'desc' },
          (page - 1) * limit,
          limit
        ),
        tenantDb.purchaseInvoice.count({ where }),
      ])

      return NextResponse.json({
        success: true,
        data: invoices,
        pagination: {
          page, limit, total,
          totalPages: Math.ceil(total / limit),
        },
      })
    } catch (error: any) {
      console.error('[PurchaseInvoices GET]', error?.message)
      return NextResponse.json(
        { success: false, error: 'خطا در بارگذاری فاکتورهای خرید' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  POST — ایجاد فاکتور خرید
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, _ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const body     = await req.json()

      const {
        items,
        supplierId,
        warehouseId,
        paymentType,
        description,
        invoiceDate,
      } = body

      // ── اعتبارسنجی ─────────────────────────────────────────────
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

      const warehouse = await tenantDb.warehouse.findFirst({
        where: { id: warehouseId, tenantId },
      })
      if (!warehouse) {
        return NextResponse.json(
          { success: false, error: 'انبار یافت نشد' },
          { status: 400 }
        )
      }

      // ── شماره فاکتور ────────────────────────────────────────────
      const count         = await tenantDb.purchaseInvoice.count({ where: { tenantId } })
      const invoiceNumber = `PUR-${(count + 1).toString().padStart(5, '0')}`

      // ── محاسبه مبالغ ────────────────────────────────────────────
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
      const isCredit        = (paymentType || 'cash').toLowerCase() === 'credit'
      const paidAmount      = isCredit ? 0           : totalAmount
      const remainingAmount = isCredit ? totalAmount  : 0

      // ── ★★★ گرفتن حساب‌ها قبل از transaction ──────────────────
      // ensureDefaultAccounts اول seed می‌کنه، بعد getStandardAccountIds
      // می‌خونه — این تضمین می‌کنه همیشه حساب درست برگردونه
      await ensureDefaultAccounts(tenantId)
      const accIds = await getStandardAccountIds(tenantId)

      // ★★★ لاگ کامل برای debug
      console.log('[PurchaseInvoice POST] Resolved account IDs:', {
        cash:            accIds.cashAccountId,        // باید 1010 باشه
        inventory:       accIds.inventoryAccountId,   // باید 1200 باشه
        tradePayable:    accIds.tradePurchasableId,   // باید 2010 باشه (نسیه)
        generalPayable:  accIds.payablesAccountId,    // باید 2000 باشه
        tax:             accIds.taxAccountId,          // باید 2150 باشه
      })

      // ── Transaction ─────────────────────────────────────────────
      const txClient = (tenantDb as any).$transaction ? tenantDb : db.client

      const result = await txClient.$transaction(async (tx: any) => {

        // ─── ۱. ایجاد فاکتور ─────────────────────────────────────
        const invoice = await tx.purchaseInvoice.create({
          data: {
            tenantId,
            supplierId:      supplierId || null,
            number:          invoiceNumber,
            invoiceDate:     invoiceDate ? new Date(invoiceDate) : new Date(),
            status:          'confirmed',
            paymentType:     (paymentType || 'cash').toLowerCase(),
            subTotal,
            discountAmount,
            taxAmount,
            totalAmount,
            paidAmount,
            remainingAmount,
            warehouseId,
            description:     description || null,
            cashierId:       tenant.user?.id || null,
          },
        })

        // ─── ۲. آیتم‌ها + موجودی انبار ──────────────────────────
        for (const item of invoiceItems) {
          // ثبت آیتم فاکتور
          await tx.purchaseInvoiceItem.create({
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
            // ★ میانگین وزنی
            const netUnitCost =
              item.quantity > 0
                ? (item.unitPrice * item.quantity - item.discountAmount) / item.quantity
                : item.unitPrice

            const stockLevel = await tx.stockLevel.findUnique({
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

              await tx.stockLevel.update({
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
              await tx.stockLevel.create({
                data: {
                  tenantId,
                  warehouseId,
                  productId:   item.productId,
                  quantity:    item.quantity,
                  averageCost: netUnitCost,
                },
              })
            }

            // ★ حرکت انبار
            await tx.stockMovement.create({
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

            // ★ به‌روزرسانی Product
            await tx.product.update({
              where: { id: item.productId },
              data: {
                purchasePrice: netUnitCost,
                currentStock:  { increment: item.quantity },
              },
            })
          }
        }

        // ─── ۳. سند حسابداری خودکار ─────────────────────────────
        try {
          const lines: Array<{
            accountId: string
            debit: number
            credit: number
            description: string
          }> = []

          const netAmount = subTotal - discountAmount

          // ★★★ بدهکار: موجودی کالا (1200)
          if (!accIds.inventoryAccountId) {
            throw new Error('حساب موجودی کالا (1200) یافت نشد')
          }
          lines.push({
            accountId:   accIds.inventoryAccountId,
            debit:       netAmount,
            credit:      0,
            description: `بدهکار: خرید کالا — ${invoiceNumber}`,
          })

          // ★★★ بدهکار: مالیات (2150) — فقط اگه مالیات داشت
          if (taxAmount > 0 && accIds.taxAccountId) {
            lines.push({
              accountId:   accIds.taxAccountId,
              debit:       taxAmount,
              credit:      0,
              description: `بدهکار: مالیات خرید — ${invoiceNumber}`,
            })
          }

          // ★★★ بستانکار: انتخاب حساب درست
          //   نقدی  → 1010 صندوق فروشگاه (cashAccountId)
          //   نسیه  → 2010 بستانکاران تجاری (tradePurchasableId)
          //          fallback: 2000 پرداختنی (payablesAccountId)
          //          fallback نهایی: 1010 صندوق
          let creditAccountId: string | null = null
          let creditLabel = ''

          if (isCredit) {
            creditAccountId =
              accIds.tradePurchasableId   // 2010 بستانکاران تجاری ← درست
              ?? accIds.payablesAccountId // 2000 پرداختنی ← fallback
              ?? accIds.cashAccountId     // 1010 ← آخرین راه
            creditLabel = 'بستانکاران تجاری (نسیه)'
          } else {
            creditAccountId = accIds.cashAccountId  // 1010 صندوق ← همیشه
            creditLabel = 'صندوق فروشگاه'
          }

          if (!creditAccountId) {
            throw new Error(
              isCredit
                ? 'حساب بستانکاران تجاری (2010) یافت نشد'
                : 'حساب صندوق (1010) یافت نشد'
            )
          }

          lines.push({
            accountId:   creditAccountId,
            debit:       0,
            credit:      totalAmount,
            description: `بستانکار: ${creditLabel} — ${invoiceNumber}`,
          })

          console.log('[PurchaseInvoice POST] Journal lines:', lines.map(l => ({
            accountId: l.accountId,
            debit:     l.debit,
            credit:    l.credit,
          })))

          // ★ ساخت سند
          const journalEntry = await buildAndSaveJournal({
            tenantId,
            tx,
            date:        invoice.invoiceDate || new Date(),
            description: `سند خودکار — فاکتور خرید ${invoiceNumber}`,
            sourceType:  'purchase_invoice',
            sourceId:    invoice.id,
            createdBy:   tenant.user?.id || null,
            lines,
          })

          // ★ ربط سند به فاکتور
          await tx.purchaseInvoice.update({
            where: { id: invoice.id },
            data:  { journalEntryId: journalEntry.id },
          })

          console.log(
            `[PurchaseInvoice POST] سند ${journalEntry.number} ثبت شد:`,
            `Dr.1200(${netAmount}) / Cr.${isCredit ? '2010' : '1010'}(${totalAmount})`
          )

        } catch (jeErr: any) {
          // سند اختیاری — فاکتور ذخیره می‌شه
          console.warn(
            '[PurchaseInvoice POST] Journal failed (non-blocking):',
            jeErr?.message
          )
        }

        // ─── ۴. به‌روزرسانی مانده تامین‌کننده (نسیه) ────────────
        if (isCredit && supplierId) {
          try {
            await tx.supplier.update({
              where: { id: supplierId },
              data:  { currentBalance: { increment: totalAmount } },
            })
          } catch (supErr: any) {
            console.warn(
              '[PurchaseInvoice POST] Supplier balance failed:',
              supErr?.message
            )
          }
        }

        return invoice
      })

      return NextResponse.json({
        success: true,
        data:    result,
        message: `فاکتور خرید ${invoiceNumber} با موفقیت ثبت شد`,
      }, { status: 201 })

    } catch (error: any) {
      console.error('[PurchaseInvoices POST]', error?.message)
      return NextResponse.json(
        { success: false, error: error?.message || 'خطا در ایجاد فاکتور خرید' },
        { status: 500 }
      )
    }
  }
)