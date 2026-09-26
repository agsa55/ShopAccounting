// src/app/api/payments/online/verify/route.ts — v9.2 ★★★
// ============================================================================
// Verify/Callback برای پرداخت آنلاین (زرین‌پال و ای‌دی‌پی)
// ----------------------------------------------------------------------------
// ★★★ v9.2 تغییرات:
//   ★ پشتیبانی از portalToken در callback URL
//   ★ redirect مستقیم به پورتال مشتری (به جای صفحه result)
//   ★ تجربه کاربری بهتر: مشتری بلافاصله به پورتال برگردد
// ★★★ v9.1 تغییرات:
//   ★ اصلاح مبلغ زرین‌پال verify: تبدیل ریال به تومان (مطابق با create)
//   ★ رفع خطای -50 زرین‌پال (Session is not valid, amounts not the same)
//   ★ لاگ‌های بیشتر برای عیب‌یابی
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


// ═══════════════════════════════════════════════════════════════
// ★ Helper: پیدا کردن حساب دریافتنی از روی سند فروش همان فاکتور
// ★ v9.3.1: رفع خطای TypeScript برای accountId nullable
// ═══════════════════════════════════════════════════════════════
async function resolveReceivableAccountIdFromInvoiceJournal(
  tenantId: string | null,
  invoiceId: string | null
): Promise<string | null> {
  const safeTenantId = String(tenantId || '').trim()
  const safeInvoiceId = String(invoiceId || '').trim()

  if (!safeTenantId || !safeInvoiceId) {
    console.warn('[Verify] Missing tenantId or invoiceId for receivable resolution')
    return null
  }

  try {
    const entries: any[] = await db.client.journalEntry.findMany({
      where: {
        tenantId: safeTenantId,
        sourceId: safeInvoiceId,
      },
      select: {
        id: true,
        sourceType: true,
        status: true,
        date: true,
      },
      orderBy: {
        date: 'asc',
      },
    })

    if (!entries || entries.length === 0) {
      return null
    }

    const postedEntries = entries.filter((entry: any) => {
      const status = String(entry.status || '').toLowerCase().trim()
      return status === 'posted'
    })

    if (postedEntries.length === 0) {
      return null
    }

    const saleEntries = postedEntries.filter((entry: any) => {
      const sourceType = String(entry.sourceType || '').toLowerCase().trim()
      return sourceType !== 'invoice_payment' && sourceType !== 'online_payment'
    })

    const targetEntries = saleEntries.length > 0 ? saleEntries : postedEntries

    const entryIds: string[] = targetEntries
      .map((entry: any) => String(entry.id || '').trim())
      .filter(Boolean)

    if (entryIds.length === 0) {
      return null
    }

    const lines: any[] = await db.client.journalEntryLine.findMany({
      where: {
        journalEntryId: { in: entryIds },
      },
      select: {
        accountId: true,
        debit: true,
        credit: true,
      },
    })

    const debitLines = lines.filter((line: any) => {
      return Number(line.debit || 0) > 0 && line.accountId
    })

    if (debitLines.length === 0) {
      return null
    }

    const accountIds: string[] = Array.from(
      new Set(
        debitLines
          .map((line: any) => String(line.accountId || '').trim())
          .filter(Boolean)
      )
    )

    if (accountIds.length === 0) {
      return null
    }

    const accountModel: any =
      (db.client as any).account || (db.client as any).Account

    if (!accountModel) {
      console.warn('[Verify] Account model not found for receivable resolution')
      return null
    }

    const accounts: any[] = await accountModel.findMany({
      where: {
        id: { in: accountIds },
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
    })

    const accountMap = new Map<string, any>(
      accounts.map((account: any) => [String(account.id || '').trim(), account])
    )

    let bestAccountId: string | null = null
    let bestScore = 0

    for (const line of debitLines) {
      const accountId = String(line.accountId || '').trim()

      if (!accountId) {
        continue
      }

      const account = accountMap.get(accountId)

      if (!account) {
        continue
      }

      const code = String(account.code || '').trim()
      const name = String(account.name || '')
      const type = String(account.type || '')

      let score = 0

      if (code === '1300') {
        score = 100
      } else if (code === '1310') {
        score = 90
      } else if (code.startsWith('13')) {
        score = 80
      }

      if (
        name.includes('حساب‌های دریافتنی') ||
        name.includes('حساب های دریافتنی') ||
        name.includes('دریافتنی')
      ) {
        score = Math.max(score, 70)
      }

      if (name.includes('بدهکاران تجاری')) {
        score = Math.max(score, 60)
      }

      if (type.includes('دریافتنی')) {
        score = Math.max(score, 50)
      }

      if (score > bestScore) {
        bestScore = score
        bestAccountId = accountId
      }
    }

    if (bestAccountId && bestScore >= 50) {
      console.log('[Verify] ✅ Receivable account resolved from sale journal:', {
        invoiceId: safeInvoiceId,
        accountId: bestAccountId,
        score: bestScore,
      })

      return bestAccountId
    }

    console.log('[Verify] ℹ️ No receivable account found in sale journal:', {
      invoiceId: safeInvoiceId,
      checkedAccounts: accounts.map((a: any) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
      })),
    })

    return null
  } catch (err: any) {
    console.warn(
      '[Verify] resolveReceivableAccountIdFromInvoiceJournal failed:',
      err?.message
    )

    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// ★ Helper: تلاش برای غیردستی کردن سند حسابداری
// بعضی schemaها فیلد isManual دارند و default آن true است.
// اگر فیلد وجود نداشت، خطا نمی‌دهد.
// ═══════════════════════════════════════════════════════════════
async function tryMarkJournalAsAuto(tx: any, journalId: string) {
  try {
    await tx.journalEntry.update({
      where: { id: journalId },
      data: { isManual: false } as any,
    })
  } catch {
    // اگر فیلد isManual در schema وجود نداشت، نادیده گرفته می‌شود
  }
}

export async function GET(req: NextRequest) {
  console.log('[Online Payment Verify] 📥 Callback received')
  try {
    const { searchParams } = new URL(req.url)

    // ★ پارامترهای مشترک
    const tenantId = searchParams.get('tenantId')
    const paymentId = searchParams.get('paymentId')

    // ★★★ v9.2: خواندن portalToken از URL (برای redirect مستقیم به پورتال)
    const portalToken = searchParams.get('portalToken')

    // ★ پارامترهای زرین‌پال
    const authority = searchParams.get('Authority') || searchParams.get('authority')
    const zarinpalStatus = searchParams.get('Status') || searchParams.get('status')

    // ★ پارامترهای ای‌دی‌پی (POST میاد ولی ما GET هم هندل می‌کنیم)
    const idpayId = searchParams.get('id')
    const idpayStatus = searchParams.get('status')
    const idpayTrackId = searchParams.get('track_id')

    console.log('[Verify] 📋 Parameters:', {
      tenantId: tenantId?.substring(0, 15) + '...',
      paymentId: paymentId?.substring(0, 8) + '...',
      authority: authority?.substring(0, 12) + '...',
      zarinpalStatus,
      idpayId: idpayId?.substring(0, 8) + '...',
      hasPortalToken: !!portalToken,
    })

    if (!tenantId) {
      console.error('[Verify] ❌ Missing tenantId')
      if (portalToken) {
        return NextResponse.redirect(
          new URL(`/portal/${portalToken}?payment=error&reason=missing_tenant`, req.url)
        )
      }
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
      console.error('[Verify] ❌ Online payment not found')
      if (portalToken) {
        return NextResponse.redirect(
          new URL(`/portal/${portalToken}?payment=error&reason=not_found`, req.url)
        )
      }
      return NextResponse.redirect(
        new URL('/payment-result?status=error&reason=not_found', req.url)
      )
    }

    console.log('[Verify] ✅ Online payment found:', {
      id: onlinePayment.id,
      status: onlinePayment.status,
      amount: onlinePayment.amount,
      gatewayType: onlinePayment.gatewayType,
      installmentId: onlinePayment.installmentId || 'none',
    })

    // ★ اگه قبلاً پرداخت شده، idempotent
    if (onlinePayment.status === 'paid') {
      console.log('[Verify] ℹ️ Already paid:', onlinePayment.id)
      if (portalToken) {
        return NextResponse.redirect(
          new URL(`/portal/${portalToken}?payment=already_paid&paymentId=${onlinePayment.id}`, req.url)
        )
      }
      return NextResponse.redirect(
        new URL(`/payment-result?status=already_paid&paymentId=${onlinePayment.id}`, req.url)
      )
    }

    // ★ پیدا کردن درگاه
    if (!onlinePayment.gatewayId) {
      console.error('[Verify] ❌ No gatewayId on online payment')
      if (portalToken) {
        return NextResponse.redirect(
          new URL(`/portal/${portalToken}?payment=error&reason=no_gateway`, req.url)
        )
      }
      return NextResponse.redirect(
        new URL('/payment-result?status=error&reason=no_gateway', req.url)
      )
    }

    const gateway: any = await db.client.paymentGateway.findFirst({
      where: { id: onlinePayment.gatewayId, tenantId },
    })

    if (!gateway) {
      console.error('[Verify] ❌ Gateway not found')
      if (portalToken) {
        return NextResponse.redirect(
          new URL(`/portal/${portalToken}?payment=error&reason=gateway_not_found`, req.url)
        )
      }
      return NextResponse.redirect(
        new URL('/payment-result?status=error&reason=gateway_not_found', req.url)
      )
    }

    console.log('[Verify] ✅ Gateway found:', {
      type: gateway.type,
      sandbox: gateway.sandbox,
      merchantId: gateway.merchantId?.substring(0, 8) + '...',
    })

    // ★ بررسی لغو پرداخت
    const isZarinpalCancelled = gateway.type === 'zarinpal' && zarinpalStatus !== 'OK'
    const isIdpayCancelled = gateway.type === 'idpay' && idpayStatus !== '10'

    if (isZarinpalCancelled || isIdpayCancelled) {
      console.log('[Verify] ⚠️ Payment cancelled by user')
      await db.client.onlinePayment.update({
        where: { id: onlinePayment.id },
        data: { status: 'cancelled' },
      })
      if (portalToken) {
        return NextResponse.redirect(
          new URL(`/portal/${portalToken}?payment=cancelled&paymentId=${onlinePayment.id}`, req.url)
        )
      }
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

      // ★★★ v9.1: مبلغ باید به تومان باشد (همان مقداری که در create ارسال شد)
      const amountInRial = Number(onlinePayment.amount)
      const amountInToman = Math.round(amountInRial / 10)

      console.log('[Verify] 🔍 Calling Zarinpal verify:', {
        url: apiVerifyUrl,
        authority: onlinePayment.authority,
        amountInRial,
        amountInToman,
        sandbox: gateway.sandbox,
      })

      const verifyRes = await fetch(apiVerifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          merchant_id: gateway.merchantId,
          authority: onlinePayment.authority,
          amount: amountInToman,
        }),
      })

      const verifyData = await verifyRes.json()
      console.log('[Verify] 📥 Zarinpal verify response:', verifyData)

      if (verifyData?.data && [100, 101].includes(verifyData.data.code)) {
        verifySuccess = true
        refId = String(verifyData.data.ref_id || verifyData.data.refId || '')
        console.log('[Verify] ✅ Zarinpal verify successful:', {
          refId,
          fee: verifyData.data.fee,
          feeType: verifyData.data.fee_type,
        })
      } else {
        console.error('[Verify] ❌ Zarinpal verify failed:', {
          code: verifyData?.data?.code,
          message: verifyData?.errors?.message,
          validations: verifyData?.errors?.validations,
        })
      }
    } else if (gateway.type === 'idpay') {
      // ─── ای‌دی‌پی verify ──────────────────────────────────────
      if (!gateway.apiKey) {
        console.error('[Verify] ❌ IDPay api key missing')
        if (portalToken) {
          return NextResponse.redirect(
            new URL(`/portal/${portalToken}?payment=error&reason=no_apikey`, req.url)
          )
        }
        return NextResponse.redirect(
          new URL('/payment-result?status=error&reason=no_apikey', req.url)
        )
      }

      const apiVerifyUrl = gateway.sandbox
        ? 'https://stg.api.idpay.ir/v1.1/payment/verify'
        : 'https://api.idpay.ir/v1.1/payment/verify'

      console.log('[Verify] 🔍 Calling IDPay verify:', {
        url: apiVerifyUrl,
        id: onlinePayment.authority,
        order_id: onlinePayment.id,
        sandbox: gateway.sandbox,
      })

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
      console.log('[Verify] 📥 IDPay verify response:', verifyData)

      if (verifyData?.status === 100) {
        verifySuccess = true
        refId = String(verifyData.track_id || verifyData.payment?.track_id || '')
        console.log('[Verify] ✅ IDPay verify successful:', {
          refId,
          amount: verifyData.amount,
        })
      } else {
        console.error('[Verify] ❌ IDPay verify failed:', {
          status: verifyData?.status,
          error_code: verifyData?.error_code,
          error_message: verifyData?.error_message,
        })
      }
    }

    if (!verifySuccess) {
      console.error('[Verify] ❌ Verification failed overall')
      await db.client.onlinePayment.update({
        where: { id: onlinePayment.id },
        data: { status: 'failed' },
      })
      if (portalToken) {
        return NextResponse.redirect(
          new URL(`/portal/${portalToken}?payment=failed&paymentId=${onlinePayment.id}`, req.url)
        )
      }
      return NextResponse.redirect(
        new URL(`/payment-result?status=failed&paymentId=${onlinePayment.id}`, req.url)
      )
    }

    // ═══════════════════════════════════════════════════════════════
    // ★★★ v8.8: گرفتن حساب‌های استاندارد قبل از transaction
    // ═══════════════════════════════════════════════════════════════
     const safeTenantId = String(tenantId || '')
    const safeInvoiceId = String(onlinePayment.invoiceId || '')

    if (!safeTenantId || !safeInvoiceId) {
      console.error('[Verify] ❌ Missing tenantId or invoiceId for journal resolution:', {
        safeTenantId: safeTenantId || null,
        safeInvoiceId: safeInvoiceId || null,
        onlinePaymentId: onlinePayment.id,
      })

      if (portalToken) {
        return NextResponse.redirect(
          new URL(`/portal/${portalToken}?payment=error&reason=missing_invoice`, req.url)
        )
      }

      return NextResponse.redirect(
        new URL('/payment-result?status=error&reason=missing_invoice', req.url)
      )
    }

    await getStandardAccountIds(safeTenantId).catch(() => ({} as any))
    const accIds = await getStandardAccountIds(safeTenantId)

    // ★ مهم‌ترین اصلاح: اول حساب دریافتنی از سند فروش همان فاکتور پیدا می‌شود
    const saleReceivableAccountId = await resolveReceivableAccountIdFromInvoiceJournal(
      safeTenantId,
      safeInvoiceId
    ).catch(() => null)

    const bankAccountId = accIds.bankAccountId || accIds.cashAccountId

    const receivablesAccountId =
      saleReceivableAccountId ||
      accIds.receivablesAccountId ||
      accIds.tradeReceivableId

    const salesAccountId = accIds.salesAccountId

    const now = new Date()

    console.log('[Verify] 🧾 Journal account selection:', {
      invoiceId: safeInvoiceId,
      paymentMethod: 'online',
      bankAccountId,
      saleReceivableAccountId: saleReceivableAccountId || null,
      accIdsReceivablesAccountId: accIds.receivablesAccountId || null,
      accIdsTradeReceivableId: accIds.tradeReceivableId || null,
      finalReceivablesAccountId: receivablesAccountId,
      salesAccountId,
    })

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

      console.log('[Verify] ✅ OnlinePayment updated to paid')

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

      console.log('[Verify] ✅ InvoicePayment created')

      // ۳. به‌روزرسانی فاکتور
      const invoice: any = await tx.invoice.findUnique({
        where: { id: onlinePayment.invoiceId },
        include: { installmentPlan: { include: { schedules: { orderBy: { installmentNumber: 'asc' } } } } },
      })

      if (invoice) {
        const newPaidAmount = Number(invoice.paidAmount || 0) + Number(onlinePayment.amount)
        const newRemaining = Math.max(0, Number(invoice.totalAmount) - newPaidAmount)
        const newStatus = newRemaining <= 0 ? 'paid' : 'partial'

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaidAmount,
            remainingAmount: newRemaining,
            status: newStatus,
          },
        })

        console.log('[Verify] ✅ Invoice updated:', {
          number: invoice.number,
          newPaidAmount,
          newRemaining,
          newStatus,
        })

        const isCredit = invoice.paymentType === 'credit' || invoice.paymentType === 'installment'

        // ═══════════════════════════════════════════════════════════════
        // ★★★ v9.0: هندل InstallmentSchedule — هدف‌گذاری قسط خاص یا FIFO
        // ═══════════════════════════════════════════════════════════════
        if (invoice.paymentType === 'installment' && invoice.installmentPlan) {
          const plan = invoice.installmentPlan
          let remainingPayment = Number(onlinePayment.amount) || 0
          let newlyPaidInstallments = 0

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

                console.log(`[Verify] ✅ Targeted installment ${targetSchedule.installmentNumber} paid:`, {
                  paid: paymentForThis,
                  newStatus: newScheduleStatus,
                })
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

              console.log(`[Verify] ✅ FIFO installment ${schedule.installmentNumber} paid:`, {
                paid: paymentForThisSchedule,
                newStatus: newScheduleStatus,
              })
            }
          }

                 // ★ v9.3: به‌جای جمع بستن روی عدد قبلی، دوباره شمارش دقیق انجام می‌شود
          const paidInstallmentsCount = await tx.installmentSchedule.count({
            where: {
              planId: plan.id,
              tenantId,
              status: 'paid',
            },
          })

          const totalPaidAgg = await tx.installmentSchedule.aggregate({
            where: {
              planId: plan.id,
              tenantId,
            },
            _sum: {
              paidAmount: true,
            },
          })

          const firstUnpaidSchedule = await tx.installmentSchedule.findFirst({
            where: {
              planId: plan.id,
              tenantId,
              status: { not: 'paid' },
            },
            orderBy: {
              installmentNumber: 'asc' as const,
            },
          })

          const nextDueDate = firstUnpaidSchedule?.dueDate || null

          const planInstallmentCount = Number(plan.numberOfInstallments || 0)
          const isPlanCompleted =
            (planInstallmentCount > 0 && paidInstallmentsCount >= planInstallmentCount) ||
            newRemaining <= 0

          await tx.installmentPlan.update({
            where: { id: plan.id },
            data: {
              paidInstallments: paidInstallmentsCount,
              totalPaidAmount: Number(totalPaidAgg._sum.paidAmount || 0),
              nextDueDate,
              status: isPlanCompleted ? 'completed' : 'active',
            },
          })

          console.log(`[Verify] ✅ InstallmentPlan recalculated:`, {
            planId: plan.id,
            targeted: !!targetInstallmentId,
            newlyPaidInThisPayment: newlyPaidInstallments,
            paidInstallmentsCount,
            totalPaidAmount: Number(totalPaidAgg._sum.paidAmount || 0),
            nextDueDate,
            isPlanCompleted,
          })
        }

        // ═══════════════════════════════════════════════════════════════
        // ۴. سند حسابداری — Dr بانک / Cr مطالبات (نسیه/قسطی)
        // ═══════════════════════════════════════════════════════════════
             // ═══════════════════════════════════════════════════════════════
        // ۴. سند حسابداری — Dr بانک / Cr حساب دریافتنی صحیح
        // ═══════════════════════════════════════════════════════════════
        try {
          if (bankAccountId && (!isCredit || receivablesAccountId)) {
            const jeCount = await tx.journalEntry.count({ where: { tenantId } })
            const jeNumber = `JE-${(jeCount + 1).toString().padStart(6, '0')}`

            // ★ اگر پرداخت مربوط به قسط خاص است، شماره قسط را در شرح بیانداز
            const targetScheduleForLabel = onlinePayment.installmentId
              ? invoice.installmentPlan?.schedules?.find(
                  (s: any) => s.id === onlinePayment.installmentId
                )
              : null

            const installmentLabel = targetScheduleForLabel
              ? ` — قسط ${targetScheduleForLabel.installmentNumber}`
              : ''

            const lines: any[] = [
              {
                accountId: bankAccountId,
                debit: onlinePayment.amount,
                credit: 0,
                description: `بدهکار: دریافت آنلاین${installmentLabel} — فاکتور ${invoice.number} — کد پیگیری ${refId || '—'}`,
              },
            ]

            if (isCredit && receivablesAccountId) {
              lines.push({
                accountId: receivablesAccountId,
                debit: 0,
                credit: onlinePayment.amount,
                description: `بستانکار: تسویه بدهی مشتری${installmentLabel} — فاکتور ${invoice.number}`,
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

            const journalEntry = await tx.journalEntry.create({
              data: {
                number: jeNumber,
                date: now,
                description: `سند خودکار — دریافت آنلاین${installmentLabel} فاکتور ${invoice.number}`,
                status: 'posted',
                sourceType: 'online_payment',
                sourceId: onlinePayment.id,
                totalDebit,
                totalCredit,
                tenantId,
                lines: { create: lines },
              },
            })

            // ★ اگر schema فیلد isManual دارد، آن را false کن تا در UI «دستی» نمایش داده نشود
            await tryMarkJournalAsAuto(tx, journalEntry.id)

            console.log('[Verify] ✅ Journal entry created:', {
              number: jeNumber,
              journalEntryId: journalEntry.id,
              totalDebit,
              totalCredit,
              isCredit,
              receivablesAccountId,
              bankAccountId,
              installmentLabel: installmentLabel || null,
            })
          } else {
            console.warn('[Verify] ⚠️ Missing accounts for journal entry:', {
              bankAccountId,
              receivablesAccountId,
              salesAccountId,
              isCredit,
            })
          }
        } catch (jeErr: any) {
          console.warn('[Verify] ⚠️ Journal entry failed (non-blocking):', jeErr?.message)
        }
        // ۵. در صورت نسیه/قسطی، کاهش طلب از مشتری
        if (isCredit && invoice.customerId) {
          try {
            await tx.customer.update({
              where: { id: invoice.customerId },
              data: {
                currentBalance: { decrement: onlinePayment.amount },
                ...(newRemaining <= 0 ? { lastPurchaseAt: now } : {}),
              },
            })

            console.log('[Verify] ✅ Customer balance decremented:', {
              customerId: invoice.customerId,
              amount: onlinePayment.amount,
            })
          } catch (err: any) {
            console.warn('[Verify] ⚠️ Failed to update customer balance:', err?.message)
          }
        }
      }
    })

    console.log('[Verify] 🎉 Payment verified successfully:', {
      paymentId: onlinePayment.id,
      invoiceId: onlinePayment.invoiceId,
      refId,
      amount: onlinePayment.amount,
      portalToken: portalToken ? 'yes' : 'no',
    })

    // ═══════════════════════════════════════════════════════════════
    // ★★★ v9.2: Redirect مستقیم به پورتال مشتری (با پیام موفقیت)
    // ═══════════════════════════════════════════════════════════════
    if (portalToken) {
      console.log('[Verify] 🚪 Redirecting to portal with success message')
      return NextResponse.redirect(
        new URL(
          `/portal/${portalToken}?payment=success&refId=${refId || ''}&paymentId=${onlinePayment.id}`,
          req.url
        )
      )
    }

    // Fallback: اگر portalToken نبود، به صفحه result برو
    return NextResponse.redirect(
      new URL(
        `/payment-result?status=success&paymentId=${onlinePayment.id}&refId=${refId}`,
        req.url
      )
    )
  } catch (error: any) {
    console.error('[Verify] ❌ Error:', error?.message || error)
    console.error('[Verify] Stack:', error?.stack)
    
    // تلاش برای redirect با portalToken در صورت خطا
    try {
      const { searchParams } = new URL(req.url)
      const portalToken = searchParams.get('portalToken')
      if (portalToken) {
        return NextResponse.redirect(
          new URL(`/portal/${portalToken}?payment=error&reason=exception`, req.url)
        )
      }
    } catch {}
    
    return NextResponse.redirect(
      new URL('/payment-result?status=error&reason=exception', req.url)
    )
  }
}