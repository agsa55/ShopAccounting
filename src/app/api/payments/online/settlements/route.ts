// ============================================================================
// src/app/api/payments/online/settlements/route.ts — GET (v8.6 ★★★)
// ShopAccounting — Settlements Report API
// ----------------------------------------------------------------------------
// ★★★ v8.6: این API گزارش تسویه‌های پرداخت آنلاین را ارائه می‌دهد.
//
// ★ پارامترها:
//   - status: pending | settled | delayed | failed (اختیاری)
//   - dateFrom, dateTo: بازه تاریخ paidAt
//   - summary: اگر true باشد، فقط خلاصه برمی‌گرداند
//
// ★ خروجی:
//   {
//     success: true,
//     data: {
//       summary: { total, settled, pending, delayed, failed, totalAmount, ... },
//       payments: [...]
//     }
//   }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { getSettlementSummary } from '@/lib/zarinpal/settlement'

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)
      const statusFilter = searchParams.get('status')
      const dateFrom = searchParams.get('dateFrom')
      const dateTo = searchParams.get('dateTo')
      const includeSummary = searchParams.get('summary') !== 'false'

      // ★ بررسی پشتیبانی Prisma Client
      const isSettlementStatusSupported = (() => {
        try {
          const fieldsRaw = (db.client.onlinePayment as any).fields as unknown
          const fields = (fieldsRaw || {}) as Record<string, unknown>
          return 'settlementStatus' in fields
        } catch {
          return false
        }
      })()

      if (!isSettlementStatusSupported) {
        return NextResponse.json(
          {
            success: false,
            error: 'فیلد settlementStatus در Prisma Client موجود نیست. لطفاً migration v8.2 را اجرا و npx prisma generate کنید.',
            code: 'SCHEMA_NOT_UPDATED',
          },
          { status: 400 }
        )
      }

      // ★ ساخت شرط فیلتر
      const where: any = {
        tenantId,
        status: 'paid',
      }

      if (statusFilter) {
        where.settlementStatus = statusFilter
      }

      if (dateFrom || dateTo) {
        where.paidAt = {}
        if (dateFrom) where.paidAt.gte = new Date(dateFrom)
        if (dateTo) where.paidAt.lte = new Date(dateTo)
      }

      // ★ دریافت پرداخت‌ها
      const payments = await db.client.onlinePayment.findMany({
        where,
        include: {
          Invoice: {
            select: {
              id: true,
              number: true,
              customerId: true,
              customer: {
                select: { id: true, firstName: true, lastName: true, mobile: true },
              },
            },
          },
        },
        orderBy: { paidAt: 'desc' },
      })

      // ★ نرمال‌سازی داده‌ها (Invoice → invoice)
      const formattedPayments = payments.map((p: any) => {
        const invoice = p.Invoice || p.invoice || {}
        const customer = invoice.customer || {}
        const customerName = customer.firstName || customer.lastName
          ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
          : null

        const paidAt = p.paidAt ? new Date(p.paidAt) : null
        const settlementDate = p.settlementDate ? new Date(p.settlementDate) : null

        // ★ محاسبه سن تسویه (روز)
        let settlementAgeDays: number | null = null
        if (paidAt) {
          const refDate = settlementDate || new Date()
          settlementAgeDays = Math.floor((refDate.getTime() - paidAt.getTime()) / (1000 * 60 * 60 * 24))
        }

        return {
          id: p.id,
          invoiceId: p.invoiceId,
          invoiceNumber: invoice.number || null,
          customerId: invoice.customerId || null,
          customerName,
          customerMobile: customer.mobile || null,
          amount: Number(p.amount) || 0,
          refId: p.refId,
          authority: p.authority,
          paidAt: paidAt?.toISOString() || null,
          settlementStatus: p.settlementStatus || 'pending',
          settlementDate: settlementDate?.toISOString() || null,
          settlementReferenceId: p.settlementReferenceId || null,
          gatewayFee: Number(p.gatewayFee) || 0,
          platformCommission: Number(p.platformCommission) || 0,
          netSettledAmount: Number(p.netSettledAmount) || 0,
          settlementAgeDays,
        }
      })

      // ★ محاسبه خلاصه
      let summary = null
      if (includeSummary) {
        summary = await getSettlementSummary(tenantId)
      }

      return NextResponse.json({
        success: true,
        data: {
          payments: formattedPayments,
          summary,
        },
      })
    } catch (error: any) {
      console.error('[Settlements Report] Error:', error?.message || error)
      return NextResponse.json(
        { success: false, error: 'خطا در بارگذاری گزارش تسویه‌ها: ' + (error?.message || 'نامشخص') },
        { status: 500 }
      )
    }
  }
)
