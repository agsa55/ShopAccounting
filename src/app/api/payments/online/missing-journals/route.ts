// src/app/api/payments/online/missing-journals/route.ts
// ShopAccounting v8.4 — بازیابی اسناد گم‌شده (سازگار با اسکیما v10.0 - Decimal)

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const GET = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    let payments: any[] = []

    try {
      const onlinePayments = await tenantDb.onlinePayment.findMany({
        where: { tenantId, status: 'successful' },
      }).catch(() => [])

      for (const payment of onlinePayments) {
        try {
          const journalEntry = await tenantDb.journalEntry.findFirst({
            where: { tenantId, sourceType: 'online_payment', sourceId: payment.id },
          }).catch(() => null)

          if (!journalEntry) {
            // ★ اصلاح تایپ‌اسکریپت: تعریف صریح نوع متغیرها برای جلوگیری از خطای Type 'string | null'
            let invoiceNumber: string | null = null
            let customerName: string | null = null
            
            if (payment.invoiceId) {
              const invoice = await tenantDb.invoice.findFirst({
                where: { id: payment.invoiceId },
                select: { number: true, customerId: true },
              }).catch(() => null)
              
              invoiceNumber = invoice?.number ?? null
              
              if (invoice?.customerId) {
                const customer = await tenantDb.customer.findFirst({
                  where: { id: invoice.customerId },
                  select: { firstName: true, lastName: true },
                }).catch(() => null)
                
                if (customer) {
                  const name = `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
                  customerName = name || null
                }
              }
            }

            // ★ سازگاری با Decimal v10.0: تبدیل به Number برای محاسبات جاوااسکریپت
            const amount = Number(payment.amount) || 0
            
            payments.push({
              id: payment.id,
              paidAt: payment.paidAt,
              amount,
              refId: payment.refId ?? null,
              authority: payment.authority ?? null,
              invoiceId: payment.invoiceId ?? null,
              invoiceNumber,
              customerName,
              gatewayFee: 0,
              netSettledAmount: amount,
            })
          }
        } catch (err) {
          // خطای تک‌پرداخت نادیده گرفته می‌شود تا کل فرآیند متوقف نشود
        }
      }
    } catch (err: any) {
      console.warn('[Missing Journals] Query failed:', err?.message)
    }

    const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const totalGatewayFee = payments.reduce((sum, p) => sum + (p.gatewayFee || 0), 0)
    const totalNetSettled = payments.reduce((sum, p) => sum + (p.netSettledAmount || p.amount || 0), 0)

    return NextResponse.json({
      success: true,
      data: {
        payments,
        missingCount: payments.length,
        totalAmount,
        totalGatewayFee,
        totalNetSettled,
        message: payments.length === 0
          ? 'همه پرداخت‌های آنلاین سند حسابداری دارند ✓'
          : `${payments.length} پرداخت بدون سند حسابداری یافت شد`,
      },
    })
  } catch (error: any) {
    console.error('[Missing Journals GET] Error:', error?.message || error)
    return NextResponse.json({
      success: true,
      data: {
        payments: [],
        missingCount: 0,
        totalAmount: 0,
        totalGatewayFee: 0,
        totalNetSettled: 0,
        message: 'خطا در بررسی — مجدداً تلاش کنید',
      },
    })
  }
})