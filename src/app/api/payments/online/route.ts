// ============================================================================
// src/app/api/payments/online/route.ts — GET (v8.2 ★★★)
// ShopAccounting — Online Payments List & Report API
// ----------------------------------------------------------------------------
// ★★★ v8.2: گزارش پرداخت‌های آنلاین با تفکیک کارمزدها
//
// ★ پارامترهای Query:
//   - page, limit          : صفحه‌بندی
//   - status               : فیلتر بر اساس status (pending | paid | failed | cancelled)
//   - settlementStatus     : فیلتر بر اساس settlement (pending | settled | failed)
//   - startDate, endDate   : فیلتر تاریخ (paidAt)
//   - invoiceId            : فیلتر بر اساس فاکتور خاص
//   - summary              : اگر true باشد، خلاصه آماری برمی‌گرداند
//
// ★ پاسخ:
//   - data.payments[]      : لیست پرداخت‌ها با اطلاعات فاکتور و مشتری
//   - data.summary         : خلاصه (در صورت summary=true)
//   - pagination           : اطلاعات صفحه‌بندی
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const GET = withTenantAndPermission('dashboard')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)
      const page = parseInt(searchParams.get('page') || '1')
      const limit = parseInt(searchParams.get('limit') || '50')
      const status = searchParams.get('status')
      const settlementStatus = searchParams.get('settlementStatus')
      const startDate = searchParams.get('startDate')
      const endDate = searchParams.get('endDate')
      const invoiceId = searchParams.get('invoiceId')
      const includeSummary = searchParams.get('summary') === 'true'

      // ★ ساخت شرط فیلتر
      const where: any = { tenantId }

      if (status) {
        where.status = status
      }

      if (settlementStatus) {
        // ★ runtime field detection
        const fieldsRaw = (tenantDb.onlinePayment as any).fields as unknown
        const fields = (fieldsRaw || {}) as Record<string, unknown>
        if ('settlementStatus' in fields) {
          where.settlementStatus = settlementStatus
        }
      }

      if (invoiceId) {
        where.invoiceId = invoiceId
      }

      // ★ فیلتر تاریخ
      if (startDate || endDate) {
        where.paidAt = {}
        if (startDate) where.paidAt.gte = new Date(startDate)
        if (endDate) where.paidAt.lte = new Date(endDate)
      }

      // ★ دریافت پرداخت‌ها
      let payments: any[] = []
      let total = 0

      try {
        payments = await tenantDb.onlinePayment.findMany({
          where,
          include: {
            invoice: {
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
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        })
        total = await tenantDb.onlinePayment.count({ where })
      } catch (err: any) {
        // ★ fallback: بدون include
        try {
          payments = await tenantDb.onlinePayment.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          })
          total = await tenantDb.onlinePayment.count({ where })

          // ★ دریافت فاکتور و مشتری به‌صورت دستی
          const invoiceIds = [...new Set(payments.map(p => p.invoiceId).filter(Boolean))]
          if (invoiceIds.length > 0) {
            const invoices = await tenantDb.invoice.findMany({
              where: { id: { in: invoiceIds }, tenantId },
              select: {
                id: true, number: true, customerId: true,
                customer: { select: { id: true, firstName: true, lastName: true, mobile: true } },
              },
            })
            const invoiceMap = new Map(invoices.map(i => [i.id, i]))
            payments = payments.map(p => ({
              ...p,
              invoice: invoiceMap.get(p.invoiceId) || null,
            }))
          }
        } catch (fallbackErr: any) {
          console.error('[OnlinePayments GET] Fallback failed:', fallbackErr?.message)
          return NextResponse.json(
            { success: false, error: 'خطا در بارگذاری پرداخت‌های آنلاین' },
            { status: 500 }
          )
        }
      }

      // ★ تبدیل داده‌ها به فرمت استاندارد
      const formattedPayments = payments.map(p => {
        const invoice = p.invoice || {}
        const customer = invoice.customer || {}
        const customerName = customer.firstName || customer.lastName
          ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
          : null

        return {
          id: p.id,
          invoiceId: p.invoiceId,
          invoiceNumber: invoice.number || null,
          customerId: invoice.customerId || null,
          customerName,
          customerMobile: customer.mobile || null,
          amount: Number(p.amount) || 0,
          status: p.status,
          refId: p.refId,
          authority: p.authority,
          gatewayType: p.gatewayType,
          description: p.description,
          paidAt: p.paidAt,
          createdAt: p.createdAt,
          installmentId: p.installmentId || null,
          // ★ v8.2: فیلدهای تسویه
          gatewayFee: Number(p.gatewayFee) || 0,
          platformCommission: Number(p.platformCommission) || 0,
          netSettledAmount: Number(p.netSettledAmount) || 0,
          settlementStatus: p.settlementStatus || null,
          settlementDate: p.settlementDate || null,
          cardPan: p.cardPan || null,
          feeType: p.feeType || null,
          journalEntryId: p.journalEntryId || null,
          // ★ محاسبه فیلدهای مشتق
          hasJournalEntry: !!p.journalEntryId,
        }
      })

      // ★ محاسبه خلاصه (در صورت درخواست)
      let summary = null
      if (includeSummary) {
        try {
          const allPayments = await tenantDb.onlinePayment.findMany({
            where: { ...where, status: 'paid' },
            select: {
              amount: true,
              gatewayFee: true,
              platformCommission: true,
              netSettledAmount: true,
            },
          })

          summary = {
            totalPayments: allPayments.length,
            totalAmount: allPayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0),
            totalGatewayFee: allPayments.reduce((sum: number, p: any) => sum + (Number(p.gatewayFee) || 0), 0),
            totalPlatformCommission: allPayments.reduce((sum: number, p: any) => sum + (Number(p.platformCommission) || 0), 0),
            totalNetSettled: allPayments.reduce((sum: number, p: any) => sum + (Number(p.netSettledAmount) || 0), 0),
          }
        } catch (sumErr: any) {
          console.warn('[OnlinePayments GET] Summary calculation failed:', sumErr?.message)
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          payments: formattedPayments,
          summary,
        },
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    } catch (error: any) {
      console.error('[OnlinePayments GET] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در بارگذاری پرداخت‌های آنلاین' },
        { status: 500 }
      )
    }
  }
)
