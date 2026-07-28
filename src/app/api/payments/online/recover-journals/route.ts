// src/app/api/payments/online/recover-journals/route.ts
// ShopAccounting v8.4 — بازیابی اسناد گم‌شده (POST endpoint)

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

export const POST = withTenantAndPermission('accounting')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    const body = await req.json()
    const { paymentIds, dryRun = false } = body

    if (!paymentIds || !Array.isArray(paymentIds) || paymentIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'هیچ پرداختی انتخاب نشده است',
      }, { status: 400 })
    }

    const results: any[] = []
    let successCount = 0
    let failedCount = 0
    let skippedCount = 0

    for (const paymentId of paymentIds) {
      try {
        const payment = await tenantDb.onlinePayment.findFirst({
          where: { id: paymentId, tenantId },
        }).catch(() => null)

        if (!payment) {
          results.push({
            paymentId,
            amount: 0,
            invoiceNumber: null,
            status: 'skipped',
            reason: 'پرداخت یافت نشد',
          })
          skippedCount++
          continue
        }

        // ★ بررسی وجود سند قبلی
        const existingJournal = await tenantDb.journalEntry.findFirst({
          where: { tenantId, sourceType: 'online_payment', sourceId: payment.id },
        }).catch(() => null)

        if (existingJournal) {
          results.push({
            paymentId,
            amount: payment.amount,
            invoiceNumber: null,
            status: 'skipped',
            reason: 'سند قبلاً صادر شده',
          })
          skippedCount++
          continue
        }

        // ★ پیدا کردن شماره فاکتور
        let invoiceNumber = null
        if (payment.invoiceId) {
          const invoice = await tenantDb.invoice.findFirst({
            where: { id: payment.invoiceId },
            select: { number: true },
          }).catch(() => null)
          invoiceNumber = invoice?.number
        }

        // ★ اگه dryRun=true، فقط گزارش بده
        if (dryRun) {
          results.push({
            paymentId,
            amount: payment.amount,
            invoiceNumber,
            status: 'success',
            journalNumber: '(شبیه‌سازی)',
          })
          successCount++
          continue
        }

        // ★ پیدا کردن حساب‌ها
        let cashAccount = await tenantDb.account.findFirst({
          where: { tenantId, type: 'asset', code: { startsWith: '101' } },
        }).catch(() => null)

        if (!cashAccount) {
          cashAccount = await tenantDb.account.findFirst({
            where: { tenantId, type: 'asset' },
          }).catch(() => null)
        }

        let revenueAccount = await tenantDb.account.findFirst({
          where: { tenantId, type: 'revenue', code: { startsWith: '401' } },
        }).catch(() => null)

        if (!revenueAccount) {
          revenueAccount = await tenantDb.account.findFirst({
            where: { tenantId, type: 'revenue' },
          }).catch(() => null)
        }

        if (!cashAccount || !revenueAccount) {
          results.push({
            paymentId,
            amount: payment.amount,
            invoiceNumber,
            status: 'failed',
            error: 'حساب صندوق یا درآمد یافت نشد',
          })
          failedCount++
          continue
        }

        // ★ ایجاد سند
        const journalNumber = `RECOV-${Date.now()}-${Math.floor(Math.random() * 10000)}`
        const journalEntry = await tenantDb.journalEntry.create({
          data: {
            number: journalNumber,
            date: payment.paidAt || new Date(),
            description: `بازیابی پرداخت آنلاین - ${payment.refId || payment.authority || paymentId}`,
            status: 'posted',
            sourceType: 'online_payment',
            sourceId: payment.id,
            tenantId,
          },
        }).catch(() => null)

        if (!journalEntry) {
          results.push({
            paymentId,
            amount: payment.amount,
            invoiceNumber,
            status: 'failed',
            error: 'خطا در ایجاد سند',
          })
          failedCount++
          continue
        }

        // ★ ایجاد ردیف‌های سند
        await tenantDb.journalEntryLine.createMany({
          data: [
            {
              journalEntryId: journalEntry.id,
              accountId: cashAccount.id,
              debit: payment.amount,
              credit: 0,
              description: 'دریافت نقدی آنلاین',
              tenantId,
            },
            {
              journalEntryId: journalEntry.id,
              accountId: revenueAccount.id,
              debit: 0,
              credit: payment.amount,
              description: 'فروش - پرداخت آنلاین',
              tenantId,
            },
          ],
        }).catch(() => {})

        results.push({
          paymentId,
          amount: payment.amount,
          invoiceNumber,
          status: 'success',
          journalNumber,
        })
        successCount++
      } catch (err: any) {
        results.push({
          paymentId,
          amount: 0,
          invoiceNumber: null,
          status: 'failed',
          error: err?.message || 'خطای ناشناخته',
        })
        failedCount++
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        results,
        totalProcessed: results.length,
        successCount,
        failedCount,
        skippedCount,
        message: dryRun
          ? `شبیه‌سازی: ${successCount} سند ساخته خواهد شد`
          : `${successCount} سند ساخته شد${failedCount > 0 ? `، ${failedCount} خطا` : ''}`,
      },
    })
  } catch (error: any) {
    console.error('[Recover Journals POST] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: 'خطا در بازیابی اسناد',
    }, { status: 500 })
  }
})
