// ============================================================================
// src/app/api/purchase-invoices/route.ts — v8.8.8 (مشابه Categories)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import {
  ensureDefaultAccounts,
  getStandardAccountIds,
} from '@/lib/accounts-auto-seed'

// ═══════════════════════════════════════════════════════════════
//  GET — دقیقاً مشابه Categories GET
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
        invoices = await tenantDb.purchaseInvoice.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        })
      } catch (err: any) {
        console.error('[PurchaseInvoices GET] findMany error:', err?.message)
        // اگر خطا داد، با select ساده امتحان کن
        try {
          invoices = await tenantDb.purchaseInvoice.findMany({
            where,
            select: {
              id: true,
              number: true,
              invoiceDate: true,
              status: true,
              paymentType: true,
              totalAmount: true,
              paidAmount: true,
              supplierId: true,
              warehouseId: true,
              description: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          })
        } catch (err2: any) {
          console.error('[PurchaseInvoices GET] select fallback also failed:', err2?.message)
          invoices = []
        }
      }

      const total = await tenantDb.purchaseInvoice.count({ where })

      return NextResponse.json({
        success: true,
        data: invoices,
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

// ═══════════════════════════════════════════════════════════════
//  POST — دقیقاً مشابه Categories POST (ساده‌تر)
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId
      const body = await req.json()

      const {
        items,
        supplierId,
        warehouseId,
        paymentType,
        description,
        invoiceDate,
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

      // ── شماره فاکتور ────────────────────────────────────────────
      const count = await tenantDb.purchaseInvoice.count({ where: { tenantId } })
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

      // ── ایجاد فاکتور (ساده، مشابه Categories) ──────────────────
      const invoice = await tenantDb.purchaseInvoice.create({
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
        },
      })

      console.log('[PurchaseInvoice POST] ✅ Invoice created:', {
        id: invoice.id,
        number: invoice.number,
        tenantId: invoice.tenantId,
      })

      // ── ایجاد آیتم‌ها ─────────────────────────────────────────
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

          // به‌روزرسانی موجودی (بدون transaction)
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

      return NextResponse.json({
        success: true,
        data: invoice,
        message: `فاکتور خرید ${invoiceNumber} با موفقیت ثبت شد`,
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