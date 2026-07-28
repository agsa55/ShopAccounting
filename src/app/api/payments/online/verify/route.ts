// src/app/api/payments/online/verify/route.ts — v8.7
// ============================================================================
// Verify/Callback برای پرداخت آنلاین (زرین‌پال و ای‌دی‌پی)
// ----------------------------------------------------------------------------
// این endpoint عمومی است (نیاز به توکن نداره) چون درگاه کاربر رو بدون توکن برمی‌گردونه
// ★ proxy.ts باید این مسیر رو در لیست مسیرهای عمومی قرار بده
//
// نحوه کار:
//   ۱. دریافت authority (زرین‌پال) یا id (ای‌دی‌پی) + status از query
//   ۲. پیدا کردن OnlinePayment با authority
//   ۳. پیدا کردن درگاه از OnlinePayment.gatewayId
//   ۴. ارسال درخواست verify به درگاه
//   ۵. در صورت موفقیت: ثبت پرداخت فاکتور + ایجاد سند حسابداری
//   ۶. هدایت کاربر به صفحه نتیجه
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  console.log('[Online Payment Verify] Callback received')
  try {
    const { searchParams } = new URL(req.url)

    // ★ پارامترهای مشترک
    const tenantId = searchParams.get('tenantId')
    const paymentId = searchParams.get('paymentId')

    // ★ پارامترهای زرین‌پال
    const authority = searchParams.get('Authority') || searchParams.get('authority')
    const zarinpalStatus = searchParams.get('Status') || searchParams.get('status')

    // ★ پارامترهای ای‌دی‌پی (POST میاد ولی ما GET هم هندل می‌کنیم)
    const idpayId = searchParams.get('id')
    const idpayStatus = searchParams.get('status')
    const idpayTrackId = searchParams.get('track_id')

    if (!tenantId) {
      console.error('[Verify] Missing tenantId')
      return NextResponse.redirect(
        new URL('/payment-result?status=error&reason=missing_tenant', req.url)
      )
    }

    // ★ پیدا کردن رکورد OnlinePayment
    let onlinePayment: any = null

    if (paymentId) {
      onlinePayment = await db.client.onlinePayment.findFirst({
        where: { id: paymentId, tenantId },
      })
    } else if (authority) {
      onlinePayment = await db.client.onlinePayment.findFirst({
        where: { authority, tenantId },
      })
    } else if (idpayId) {
      onlinePayment = await db.client.onlinePayment.findFirst({
        where: { authority: idpayId, tenantId },
      })
    }

    if (!onlinePayment) {
      console.error('[Verify] Online payment not found')
      return NextResponse.redirect(
        new URL('/payment-result?status=error&reason=not_found', req.url)
      )
    }

    // ★ اگه قبلاً پرداخت شده، idempotent
    if (onlinePayment.status === 'paid') {
      console.log('[Verify] Already paid:', onlinePayment.id)
      return NextResponse.redirect(
        new URL(`/payment-result?status=already_paid&paymentId=${onlinePayment.id}`, req.url)
      )
    }

    // ★ پیدا کردن درگاه
    if (!onlinePayment.gatewayId) {
      console.error('[Verify] No gatewayId on online payment')
      return NextResponse.redirect(
        new URL('/payment-result?status=error&reason=no_gateway', req.url)
      )
    }

    const gateway: any = await db.client.paymentGateway.findFirst({
      where: { id: onlinePayment.gatewayId, tenantId },
    })

    if (!gateway) {
      console.error('[Verify] Gateway not found')
      return NextResponse.redirect(
        new URL('/payment-result?status=error&reason=gateaway_not_found', req.url)
      )
    }

    // ★ بررسی لغو پرداخت
    // زرین‌پال: Status=NOK
    // ای‌دی‌پی: status != 10 (10 = OK)
    const isZarinpalCancelled = gateway.type === 'zarinpal' && zarinpalStatus !== 'OK'
    const isIdpayCancelled = gateway.type === 'idpay' && idpayStatus !== '10' && idpayStatus !== 10

    if (isZarinpalCancelled || isIdpayCancelled) {
      console.log('[Verify] Payment cancelled by user')
      await db.client.onlinePayment.update({
        where: { id: onlinePayment.id },
        data: { status: 'cancelled' },
      })
      return NextResponse.redirect(
        new URL(`/payment-result?status=cancelled&paymentId=${onlinePayment.id}`, req.url)
      )
    }

    // ★ Verify با درگاه
    let verifySuccess = false
    let refId: string | null = null

    if (gateway.type === 'zarinpal') {
      // ─── زرین‌پال verify ─────────────────────────────────────
      const apiVerifyUrl = gateway.sandbox
        ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json'
        : 'https://api.zarinpal.com/pg/v4/payment/verify.json'

      const verifyRes = await fetch(apiVerifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          merchant_id: gateway.merchantId,
          authority: onlinePayment.authority,
          amount: Math.round(onlinePayment.amount),
        }),
      })

      const verifyData = await verifyRes.json()

      // ★ کد 100 یا 101 (101 = قبلاً verify شده) موفقیت‌آمیز است
      if (verifyData?.data && [100, 101].includes(verifyData.data.code)) {
        verifySuccess = true
        refId = String(verifyData.data.ref_id || verifyData.data.refId || '')
      } else {
        console.error('[Verify] Zarinpal verify failed:', verifyData)
      }
    } else if (gateway.type === 'idpay') {
      // ─── ای‌دی‌پی verify ──────────────────────────────────────
      if (!gateway.apiKey) {
        console.error('[Verify] IDPay api key missing')
        return NextResponse.redirect(
          new URL('/payment-result?status=error&reason=no_apikey', req.url)
        )
      }

      const apiVerifyUrl = gateway.sandbox
        ? 'https://stg.api.idpay.ir/v1.1/payment/verify'
        : 'https://api.idpay.ir/v1.1/payment/verify'

      const verifyRes = await fetch(apiVerifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': gateway.apiKey,
          'X-SANDBOX': gateway.sandbox ? '1' : '0',
        },
        body: JSON.stringify({
          id: onlinePayment.authority,
          order_id: onlinePayment.id,
        }),
      })

      const verifyData = await verifyRes.json()

      // ★ status 100 = موفق
      if (verifyData?.status === 100) {
        verifySuccess = true
        refId = String(verifyData.track_id || verifyData.payment?.track_id || '')
      } else {
        console.error('[Verify] IDPay verify failed:', verifyData)
      }
    }

    if (!verifySuccess) {
      console.error('[Verify] Verification failed')
      await db.client.onlinePayment.update({
        where: { id: onlinePayment.id },
        data: { status: 'failed' },
      })
      return NextResponse.redirect(
        new URL(`/payment-result?status=failed&paymentId=${onlinePayment.id}`, req.url)
      )
    }

    // ══════ پرداخت موفق — ثبت در دیتابیس ══════
    const txClient = db.client
    await txClient.$transaction(async (tx: any) => {
      // ۱. به‌روزرسانی OnlinePayment
      await tx.onlinePayment.update({
        where: { id: onlinePayment.id },
        data: {
          status: 'paid',
          refId,
          paidAt: new Date(),
        },
      })

      // ۲. ثبت InvoicePayment
      await tx.invoicePayment.create({
        data: {
          invoiceId: onlinePayment.invoiceId,
          amount: onlinePayment.amount,
          paymentType: 'online',
          paymentRef: refId || onlinePayment.authority,
          paidAt: new Date(),
          tenantId,
        },
      })

      // ۳. به‌روزرسانی فاکتور
      const invoice: any = await tx.invoice.findUnique({
        where: { id: onlinePayment.invoiceId },
      })

      if (invoice) {
        const newPaidAmount = invoice.paidAmount + onlinePayment.amount
        const newRemaining = Math.max(0, invoice.totalAmount - newPaidAmount)
        const newStatus = newRemaining <= 0 ? 'paid' : 'partial'

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaidAmount,
            remainingAmount: newRemaining,
            status: newStatus,
          },
        })

        // ۴. سند حسابداری (صندوق بدهکار، فروش بستانکار — چون پرداخت نقدی آنلاین است)
        try {
          const accounts = await tx.account.findMany({ where: { tenantId } })
          let cashAccountId: string | null = null
          let receivablesAccountId: string | null = null

          for (const acc of accounts) {
            const code = (acc.code || '').toLowerCase()
            const type = (acc.type || '').toLowerCase()
            const name = (acc.name || '').toLowerCase()

            if (!cashAccountId && (type === 'cash' || type === 'bank' || code.startsWith('110') || name.includes('صندوق') || name.includes('بانک'))) {
              cashAccountId = acc.id
            }
            if (!receivablesAccountId && (type === 'receivable' || code.startsWith('130') || name.includes('طلب') || name.includes('بدهکار'))) {
              receivablesAccountId = acc.id
            }
          }

          // ★ اگه فاکتور نسیه بوده، صندوق بدهکار و بدهکاران تجاری بستانکار
          // ★ اگه فاکتور نقدی بوده، صندوق بدهکار و فروش بستانکار
          //   (ولی چون فروش قبلاً ثبت شده، فقط صندوق بدهکار/بدهکاران بستانکار ثبت می‌کنیم)
          const isCredit = invoice.paymentType === 'credit' || invoice.paymentType === 'installment'

          if (cashAccountId && (!isCredit || receivablesAccountId)) {
            const jeCount = await tx.journalEntry.count({ where: { tenantId } })
            const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

            const lines: any[] = [
              {
                accountId: cashAccountId,
                debit: onlinePayment.amount,
                credit: 0,
                description: `بدهکار: دریافت آنلاین — فاکتور ${invoice.number} — کد پیگیری ${refId}`,
              },
            ]

            if (isCredit && receivablesAccountId) {
              lines.push({
                accountId: receivablesAccountId,
                debit: 0,
                credit: onlinePayment.amount,
                description: `بستانکار: تسویه بدهکاری مشتری — فاکتور ${invoice.number}`,
              })
            }

            const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
            const totalCredit = lines.reduce((s, l) => s + l.credit, 0)

            await tx.journalEntry.create({
              data: {
                number: jeNumber,
                date: new Date(),
                description: `سند خودکار — دریافت آنلاین فاکتور ${invoice.number}`,
                status: 'posted',
                sourceType: 'online_payment',
                sourceId: onlinePayment.id,
                totalDebit,
                totalCredit,
                tenantId,
                lines: { create: lines },
              },
            })
          }
        } catch (jeErr: any) {
          console.warn('[Verify] Journal entry failed (non-blocking):', jeErr?.message)
        }

        // ۵. در صورت نسیه، کاهش طلب از مشتری
        if (isCredit && invoice.customerId) {
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: { currentBalance: { decrement: onlinePayment.amount } },
          }).catch(() => {})
        }
      }
    })

    console.log('[Verify] Payment verified successfully:', onlinePayment.id)
    return NextResponse.redirect(
      new URL(`/payment-result?status=success&paymentId=${onlinePayment.id}&refId=${refId}`, req.url)
    )
  } catch (error: any) {
    console.error('[Verify] Error:', error?.message || error)
    return NextResponse.redirect(
      new URL('/payment-result?status=error&reason=exception', req.url)
    )
  }
}
