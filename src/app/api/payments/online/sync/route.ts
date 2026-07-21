// src/app/api/payments/online/sync/route.ts
// ShopAccounting v8.5 — همگام‌سازی پرداخت‌های آنلاین زرین‌پال
// ============================================================================
// ★★★ این endpoint پرداخت‌های آنلاینی که در زرین‌پال موفق بودن ولی
// در سیستم ثبت نشدن رو پیدا و ثبت می‌کنه.
//
// ★★★ نحوه کار ★★★
//
// ۱. تمام authority‌های pending رو از دیتابیس می‌گیره
// ۲. برای هر کدوم، زرین‌پال رو verify می‌کنه
// ۳. اگه موفق بود، پرداخت رو ثبت می‌کنه
// ۴. سند حسابداری هم می‌سازه
//
// ★★★ نحوه فراخوانی ★★★
//
// - دستی: GET /api/payments/online/sync
// - خودکار: با Windows Task Scheduler (فایل sync-zarinpal.bat)
//
// ★★★ امنیت ★★★
//
// این endpoint با یه API Key محافظت می‌شه (نه با JWT)
// چون قراره از Task Scheduler فراخوانی بشه
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ★ API Key برای دسترسی خودکار
const SYNC_API_KEY = process.env.SYNC_API_KEY || 'shopaccounting-sync-secret-key-2024'

export async function GET(req: NextRequest) {
  try {
    // ★ بررسی API Key
    const authHeader = req.headers.get('authorization')
    const apiKey = req.headers.get('x-api-key')
    const queryKey = new URL(req.url).searchParams.get('key')

    const providedKey = apiKey || queryKey || (authHeader?.replace('Bearer ', '') || '')

    if (providedKey !== SYNC_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز — API Key نامعتبر' },
        { status: 401 }
      )
    }

    console.log('[Sync Zarinpal] شروع همگام‌سازی...')

    const results = {
      checked: 0,
      verified: 0,
      failed: 0,
      skipped: 0,
      details: [] as any[],
    }

    // ★ ۱. پیدا کردن تمام tenantها که درگاه زرین‌پال فعال دارن
    const tenants = await db.client.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, companyName: true },
    }).catch(() => [])

    console.log(`[Sync Zarinpal] ${tenants.length} tenant فعال`)

    for (const tenant of tenants) {
      const tenantId = tenant.id

      // ★ ۲. پیدا کردن درگاه زرین‌پال فعال این tenant
      const gateway = await db.client.paymentGateway.findFirst({
        where: { tenantId, isActive: true, type: 'zarinpal' },
      }).catch(() => null)

      if (!gateway || !gateway.merchantId) {
        results.skipped++
        continue
      }

      // ★ ۳. پیدا کردن پرداخت‌های pending
      const pendingPayments = await db.client.onlinePayment.findMany({
        where: {
          tenantId,
          status: 'pending',
        },
        include: {
          Invoice: { select: { id: true, number: true, customerId: true } },
        },
      }).catch(() => [])

      console.log(`[Sync Zarinpal] Tenant ${tenant.companyName}: ${pendingPayments.length} پرداخت pending`)

      for (const payment of pendingPayments) {
        results.checked++

        try {
          // ★ ۴. verify کردن با زرین‌پال
          const verifyResult = await verifyWithZarinpal(
            gateway.merchantId,
            payment.authority,
            payment.amount,
            gateway.sandbox || false
          )

          if (verifyResult.success) {
            // ★ ۵. ثبت پرداخت موفق
            await db.client.onlinePayment.update({
              where: { id: payment.id },
              data: {
                status: 'successful',
                refId: verifyResult.refId,
                verifiedAt: new Date(),
              },
            }).catch(() => {})

            // ★ ۶. به‌روزرسانی فاکتور
            if (payment.Invoice) {
              const invoice = await db.client.invoice.findFirst({
                where: { id: payment.Invoice.id },
              }).catch(() => null)

              if (invoice) {
                const newPaid = (invoice.paidAmount || 0) + payment.amount
                const newRemaining = Math.max(0, (invoice.totalAmount || 0) - newPaid)

                await db.client.invoice.update({
                  where: { id: invoice.id },
                  data: {
                    paidAmount: newPaid,
                    remainingAmount: newRemaining,
                    status: newRemaining <= 0 ? 'paid' : 'partial',
                  },
                }).catch(() => {})
              }
            }

            // ★ ۷. ایجاد سند حسابداری
            try {
              let cashAccount = await db.client.account.findFirst({
                where: { tenantId, type: 'asset', code: { startsWith: '101' } },
              }).catch(() => null)

              if (!cashAccount) {
                cashAccount = await db.client.account.findFirst({
                  where: { tenantId, type: 'asset' },
                }).catch(() => null)
              }

              let revenueAccount = await db.client.account.findFirst({
                where: { tenantId, type: 'revenue' },
              }).catch(() => null)

              if (cashAccount && revenueAccount) {
                const journalNumber = `ONLINE-${Date.now()}-${Math.floor(Math.random() * 10000)}`
                const journalEntry = await db.client.journalEntry.create({
                  data: {
                    number: journalNumber,
                    date: new Date(),
                    description: `پرداخت آنلاین - ${verifyResult.refId}`,
                    status: 'posted',
                    sourceType: 'online_payment',
                    sourceId: payment.id,
                    tenantId,
                  },
                }).catch(() => null)

                if (journalEntry) {
                  await db.client.journalEntryLine.createMany({
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
                }
              }
            } catch {}

            results.verified++
            results.details.push({
              tenant: tenant.companyName,
              authority: payment.authority,
              refId: verifyResult.refId,
              amount: payment.amount,
              status: 'verified',
            })

            console.log(`[Sync Zarinpal] ✓ پرداخت تایید شد: ${verifyResult.refId}`)
          } else {
            results.skipped++
          }
        } catch (err: any) {
          results.failed++
          results.details.push({
            tenant: tenant.companyName,
            authority: payment.authority,
            error: err?.message || 'خطای ناشناخته',
            status: 'error',
          })
          console.error(`[Sync Zarinpal] ✗ خطا: ${err?.message}`)
        }

        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    console.log(`[Sync Zarinpal] پایان — بررسی: ${results.checked}, موفق: ${results.verified}, خطا: ${results.failed}`)

    return NextResponse.json({
      success: true,
      data: {
        ...results,
        message: `${results.verified} پرداخت تایید شد از ${results.checked} پرداخت بررسی‌شده`,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    console.error('[Sync Zarinpal] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در همگام‌سازی' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════
//  Verify with Zarinpal API
// ═══════════════════════════════════════════════════════════════

async function verifyWithZarinpal(
  merchantId: string,
  authority: string,
  amount: number,
  sandbox: boolean
): Promise<{ success: boolean; refId?: string }> {
  try {
    const baseUrl = sandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json'
      : 'https://api.zarinpal.com/pg/v4/payment/verify.json'

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: merchantId,
        authority,
        amount,
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      return { success: false }
    }

    const data = await res.json()

    if (data?.data?.code === 100 || data?.data?.code === 101) {
      return {
        success: true,
        refId: data?.data?.ref_id || String(data?.data?.ref_id || ''),
      }
    }

    return { success: false }
  } catch (err) {
    console.error('[Zarinpal Verify] Error:', err)
    return { success: false }
  }
}
