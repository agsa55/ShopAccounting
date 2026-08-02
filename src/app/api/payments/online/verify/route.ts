// src/app/api/payments/online/verify/route.ts — v9.0 ★★★
// ============================================================================
// Verify/Callback برای پرداخت آنلاین (زرین‌پال و ای‌دی‌پی)
// ----------------------------------------------------------------------------
// ★★★ v9.0 تغییرات:
//   ★ رفع خطای تایپ‌اسکریپت (مقایسه string با number در idpay)
//   ★ رفع scope متغیر isCredit
//   ★ پرداخت قسط هدف‌گذاری‌شده (installmentId) به‌جای FIFO کور
//   ★ محاسبه دقیق nextDueDate با استعلام مجدد
// ★★★ v8.8 (حفظ شد): پشتیبانی اقساط، getStandardAccountIds، تاریخ JE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getStandardAccountIds } from '@/lib/accounts-auto-seed'

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
    // ★ v9.0: رفع خطا — idpayStatus همیشه string است، مقایسه با number حذف شد
    const isZarinpalCancelled = gateway.type === 'zarinpal' && zarinpalStatus !== 'OK'
    const isIdpayCancelled = gateway.type === 'idpay' && idpayStatus !== '10'

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

    // ═══════════════════════════════════════════════════════════════
    // ★★★ v8.8: گرفتن حساب‌های استاندارد قبل از transaction
    // ═══════════════════════════════════════════════════════════════
    await getStandardAccountIds(tenantId).catch(() => ({} as any))
    const accIds = await getStandardAccountIds(tenantId)

    // ★★★ v8.8: برای پرداخت آنلاین از bankAccountId (1100) استفاده می‌کنیم
    const bankAccountId = accIds.bankAccountId || accIds.cashAccountId
    const receivablesAccountId = accIds.tradeReceivableId || accIds.receivablesAccountId
    const salesAccountId = accIds.salesAccountId

    const now = new Date()

    // ══════ پرداخت موفق — ثبت در دیتابیس ══════
    const txClient = db.client
    await txClient.$transaction(async (tx: any) => {
      // ۱. به‌روزرسانی OnlinePayment
      await tx.onlinePayment.update({
        where: { id: onlinePayment.id },
        data: {
          status: 'paid',
          refId,
          paidAt: now,
        },
      })

      // ۲. ثبت InvoicePayment
      await tx.invoicePayment.create({
        data: {
          invoiceId: onlinePayment.invoiceId,
          amount: onlinePayment.amount,
          paymentType: 'online',
          paymentRef: refId || onlinePayment.authority,
          paidAt: now,
          tenantId,
        },
      })

      // ۳. به‌روزرسانی فاکتور
      const invoice: any = await tx.invoice.findUnique({
        where: { id: onlinePayment.invoiceId },
        include: { installmentPlan: { include: { schedules: { orderBy: { installmentNumber: 'asc' } } } } },
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

        // ★ v9.0: تعریف isCredit در scope فاکتور (برای استفاده در بخش ۴ و ۵)
        //   قبلاً داخل try تعریف می‌شد و در بخش ۵ خارج از scope بود (خطا)
        const isCredit = invoice.paymentType === 'credit' || invoice.paymentType === 'installment'

        // ═══════════════════════════════════════════════════════════════
        // ★★★ v9.0: هندل InstallmentSchedule — هدف‌گذاری قسط خاص یا FIFO
        // ═══════════════════════════════════════════════════════════════
        if (invoice.paymentType === 'installment' && invoice.installmentPlan) {
          const plan = invoice.installmentPlan
          let remainingPayment = Number(onlinePayment.amount) || 0
          let newlyPaidInstallments = 0

          // ★ v9.0: اگر قسط خاصی هدف‌گذاری شده (installmentId)، فقط همان را پرداخت کن
          const targetInstallmentId = onlinePayment.installmentId

          if (targetInstallmentId) {
            // ─── پرداخت قسط خاص (هدف‌گذاری‌شده) ─────────────────
            const targetSchedule = plan.schedules.find((s: any) => s.id === targetInstallmentId)

            if (targetSchedule && targetSchedule.status !== 'paid') {
              const scheduleRemaining = Number(targetSchedule.amount) - Number(targetSchedule.paidAmount || 0)

              if (scheduleRemaining > 0) {
                const paymentForThis = Math.min(remainingPayment, scheduleRemaining)
                const newPaidForSchedule = Number(targetSchedule.paidAmount || 0) + paymentForThis
                const newScheduleStatus = newPaidForSchedule >= Number(targetSchedule.amount) ? 'paid' : 'partial'

                await tx.installmentSchedule.update({
                  where: { id: targetSchedule.id },
                  data: {
                    paidAmount: newPaidForSchedule,
                    status: newScheduleStatus,
                    paidAt: newScheduleStatus === 'paid' ? now : targetSchedule.paidAt,
                    paymentRef: refId || onlinePayment.authority,
                    paymentType: 'online',
                  },
                })

                if (newScheduleStatus === 'paid') newlyPaidInstallments++
                remainingPayment -= paymentForThis

                console.log(`[Verify] Targeted installment ${targetSchedule.installmentNumber} paid`)
              }
            }
          } else {
            // ─── پرداخت FIFO (به ترتیب اقساط) ───────────────────
            for (const schedule of plan.schedules) {
              if (remainingPayment <= 0) break
              if (schedule.status === 'paid') continue

              const scheduleRemaining = Number(schedule.amount) - Number(schedule.paidAmount || 0)
              if (scheduleRemaining <= 0) continue

              const paymentForThisSchedule = Math.min(remainingPayment, scheduleRemaining)
              const newPaidForSchedule = Number(schedule.paidAmount || 0) + paymentForThisSchedule
              const newScheduleStatus = newPaidForSchedule >= Number(schedule.amount) ? 'paid' : 'partial'

              await tx.installmentSchedule.update({
                where: { id: schedule.id },
                data: {
                  paidAmount: newPaidForSchedule,
                  status: newScheduleStatus,
                  paidAt: newScheduleStatus === 'paid' ? now : schedule.paidAt,
                  paymentRef: refId || onlinePayment.authority,
                  paymentType: 'online',
                },
              })

              if (newScheduleStatus === 'paid') newlyPaidInstallments++
              remainingPayment -= paymentForThisSchedule
            }
          }

          // ★ v9.0: محاسبه دقیق nextDueDate — استعلام اولین قسط غیر paid (پس از به‌روزرسانی)
          const firstUnpaidSchedule = await tx.installmentSchedule.findFirst({
            where: { planId: plan.id, status: { not: 'paid' } },
            orderBy: { installmentNumber: 'asc' },
          })
          const nextDueDate = firstUnpaidSchedule?.dueDate || null

          // ★ به‌روزرسانی InstallmentPlan
          await tx.installmentPlan.update({
            where: { id: plan.id },
            data: {
              paidInstallments: plan.paidInstallments + newlyPaidInstallments,
              totalPaidAmount: plan.totalPaidAmount + onlinePayment.amount,
              nextDueDate: nextDueDate,
              status: newRemaining <= 0 ? 'completed' : 'active',
            },
          })

          console.log(`[Verify] Installment updated — targeted: ${!!targetInstallmentId}, newly paid: ${newlyPaidInstallments}`)
        }

        // ═══════════════════════════════════════════════════════════════
        // ۴. سند حسابداری — Dr بانک / Cr مطالبات (نسیه/قسطی)
        // ═══════════════════════════════════════════════════════════════
        try {
          // ★ v9.0: isCredit اکنون در scope بالاتر تعریف شده (حذف از اینجا)

          if (bankAccountId && (!isCredit || receivablesAccountId)) {
            const jeCount = await tx.journalEntry.count({ where: { tenantId } })
            const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

            const lines: any[] = [
              {
                accountId: bankAccountId,
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
                description: `بستانکار: تسویه بدهکی مشتری — فاکتور ${invoice.number}`,
              })
            } else if (!isCredit && salesAccountId) {
              lines.push({
                accountId: salesAccountId,
                debit: 0,
                credit: onlinePayment.amount,
                description: `بستانکار: درآمد فروش — فاکتور ${invoice.number}`,
              })
            }

            const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
            const totalCredit = lines.reduce((s, l) => s + l.credit, 0)

            await tx.journalEntry.create({
              data: {
                number: jeNumber,
                date: now,
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
          } else {
            console.warn('[Verify] Missing accounts for journal entry:', {
              bankAccountId,
              receivablesAccountId,
              isCredit,
            })
          }
        } catch (jeErr: any) {
          console.warn('[Verify] Journal entry failed (non-blocking):', jeErr?.message)
        }

        // ۵. در صورت نسیه/قسطی، کاهش طلب از مشتری
        // ★ v9.0: isCredit اکنون در scope است (خطای قبلی رفع شد)
        if (isCredit && invoice.customerId) {
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: {
              currentBalance: { decrement: onlinePayment.amount },
              ...(newRemaining <= 0 ? { lastPurchaseAt: now } : {}),
            },
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