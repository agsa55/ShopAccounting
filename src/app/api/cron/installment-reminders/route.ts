// ============================================================================
// src/app/api/cron/installment-reminders/route.ts — GET/POST (v5.2 ★★★ Phase 4)
// ShopAccounting — Cron Job: Send Installment Reminder SMS
// ----------------------------------------------------------------------------
// این API توسط یک cron job روزانه صدا زده می‌شود (مثلاً هر روز ساعت ۹ صبح)
// و برای تمام tenantهای فعال که SMS فعال دارند، پیامک یادآوری ارسال می‌کند.
//
// محافظت:
//   - هدر X-Cron-Secret باید با CRON_SECRET در .env مطابقت داشته باشد
//   - یا query param ?secret=CRON_SECRET
//
// منطق:
//   ۱. پیدا کردن تمام tenantهای فعال (status='active')
//   ۲. برای هر tenant:
//      a. بررسی فعال بودن SMS (SmsSettings.isEnabled)
//      b. پیدا کردن اقساط سررسید‌شده یا نزدیک سررسید
//      c. برای هر قسط:
//         - بررسی اینکه امروز پیامک نشده (wasReminderSentToday)
//         - ارسال پیامک با sendInstallmentReminder
//   ۳. گزارش نهایی
//
// ★ این endpoint عمومی است (نیاز به توکن ندارد) ولی secret دارد
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSmsSettings,
  sendInstallmentReminder,
  wasReminderSentToday,
  formatAmountToToman,
} from '@/lib/sms/notification'

export async function GET(req: NextRequest) {
  return handleCron(req)
}

export async function POST(req: NextRequest) {
  return handleCron(req)
}

async function handleCron(req: NextRequest) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  [Cron Installment Reminders] STARTED at', new Date().toISOString(), '║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  // ─── ۱. بررسی secret ──────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET not set in .env')
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET not configured' },
      { status: 500 }
    )
  }

  const secretFromHeader = req.headers.get('x-cron-secret')
  const { searchParams } = new URL(req.url)
  const secretFromQuery = searchParams.get('secret')

  if (secretFromHeader !== cronSecret && secretFromQuery !== cronSecret) {
    console.warn('[Cron] Unauthorized access attempt')
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const startTime = Date.now()
  const stats = {
    tenantsProcessed: 0,
    tenantsWithSmsEnabled: 0,
    installmentsFound: 0,
    smsSent: 0,
    smsFailed: 0,
    smsSkipped: 0,
    mockSent: 0,
    errors: [] as string[],
  }

  try {
    // ─── ۲. پیدا کردن تمام tenantهای فعال ─────────────────────
    const tenants = await db.client.tenant.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        companyName: true,
        subDomain: true,
        expiresAt: true,
      },
    })

    console.log(`[Cron] Found ${tenants.length} active tenants`)

    const now = new Date()
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)

    // ★★★ v5.2.1: بررسی ساعت و دقیقه فعلی
    //   اگر فراخوانی دستی نباشد (force=true)، فقط در ساعت تنظیم‌شده اجرا شود
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()
    const forceRun = searchParams.get('force') === 'true'

    console.log(`[Cron] Current time: ${currentHour}:${currentMinute.toString().padStart(2, '0')}, force: ${forceRun}`)

    for (const tenant of tenants) {
      stats.tenantsProcessed++

      try {
        // ─── ۳. بررسی انقضای tenant ────────────────────────────
        if (tenant.expiresAt && new Date(tenant.expiresAt) < now) {
          console.log(`[Cron] Tenant ${tenant.subDomain} expired, skipping`)
          continue
        }

        // ─── ۴. دریافت تنظیمات SMS ────────────────────────────
        const smsSettings = await getSmsSettings(tenant.id)

        if (!smsSettings.isEnabled) {
          console.log(`[Cron] Tenant ${tenant.subDomain}: SMS disabled, skipping`)
          continue
        }

        // ★★★ v5.2.1: بررسی ساعت تنظیم‌شده (مگر با force=true)
        //   این کار باعث می‌شود cron job واقعی فقط در ساعت تنظیم‌شده اجرا شود
        //   و فراخوانی دستی (با force=true) همیشه کار کند
        if (!forceRun) {
          const settingsHour = smsSettings.sendHour ?? 9
          const settingsMinute = smsSettings.sendMinute ?? 30
          // ★ تلورانس ۱۵ دقیقه — یعنی اگر cron job بین HH:MM-15 تا HH:MM+15 اجرا شود، OK است
          const settingsTimeMinutes = settingsHour * 60 + settingsMinute
          const currentTimeMinutes = currentHour * 60 + currentMinute
          const diff = Math.abs(settingsTimeMinutes - currentTimeMinutes)

          if (diff > 15) {
            console.log(`[Cron] Tenant ${tenant.subDomain}: not scheduled time (setting: ${settingsHour}:${settingsMinute.toString().padStart(2, '0')}, current: ${currentHour}:${currentMinute.toString().padStart(2, '0')}), skipping`)
            continue
          }
        }

        stats.tenantsWithSmsEnabled++

        // ─── ۵. محاسبه بازه‌های سررسید ────────────────────────
        //   - daysBeforeDue روز قبل از سررسید
        //   - در روز سررسید (sendOnDueDate)
        //   - daysAfterDue روز بعد از سررسید
        const daysBefore = smsSettings.daysBeforeDue || 1
        const daysAfter = smsSettings.daysAfterDue || 3

        // ★ تاریخ‌های هدف:
        //   today - daysBefore  → قسط‌هایی که در این روز سررسید هستند (یادآوری قبل)
        //   today               → قسط‌هایی که امروز سررسید هستند
        //   today - daysAfter   → قسط‌هایی که N روز پیش سررسید بودند (یادآوری بعد)

        const beforeDate = new Date(today)
        beforeDate.setDate(beforeDate.getDate() + daysBefore)

        const afterDate = new Date(today)
        afterDate.setDate(afterDate.getDate() - daysAfter)

        // ★ ساخت لیست تاریخ‌های هدف برای جستجو
        const targetDates: Date[] = [beforeDate]
        if (smsSettings.sendOnDueDate) {
          targetDates.push(today)
        }
        if (daysAfter > 0) {
          targetDates.push(afterDate)
        }

        console.log(`[Cron] Tenant ${tenant.subDomain}: target dates:`, targetDates.map(d => d.toISOString().split('T')[0]))

        // ─── ۶. پیدا کردن اقساط هدف ───────────────────────────
        // ★ قسط‌هایی که:
        //   - tenantId = tenant.id
        //   - status in ['pending', 'partial'] (هنوز پرداخت نشده)
        //   - dueDate در یکی از تاریخ‌های هدف (با تلورانس ۱ روز)
        const targetDatesStart = new Date(Math.min(...targetDates.map(d => d.getTime())))
        targetDatesStart.setHours(0, 0, 0, 0)
        targetDatesStart.setDate(targetDatesStart.getDate() - 1) // ۱ روز قبل برای جستجوی بازه

        const targetDatesEnd = new Date(Math.max(...targetDates.map(d => d.getTime())))
        targetDatesEnd.setHours(23, 59, 59, 999)
        targetDatesEnd.setDate(targetDatesEnd.getDate() + 1) // ۱ روز بعد برای جستجوی بازه

        const installmentSchedules = await db.client.installmentSchedule.findMany({
          where: {
            tenantId: tenant.id,
            status: { in: ['pending', 'partial', 'Pending', 'Partial'] },
            dueDate: {
              gte: targetDatesStart,
              lte: targetDatesEnd,
            },
          },
          include: {
            plan: {
              select: {
                id: true,
                invoiceId: true,
              },
            },
          },
        })

        console.log(`[Cron] Tenant ${tenant.subDomain}: found ${installmentSchedules.length} installment schedules`)

        for (const schedule of installmentSchedules) {
          stats.installmentsFound++

          try {
            // ★ بررسی دقیق تاریخ سررسید با یکی از targetDates
            const dueDate = new Date(schedule.dueDate)
            dueDate.setHours(0, 0, 0, 0)

            const isTargetDate = targetDates.some(td => {
              const t = new Date(td)
              t.setHours(0, 0, 0, 0)
              return t.getTime() === dueDate.getTime()
            })

            if (!isTargetDate) {
              stats.smsSkipped++
              continue
            }

            // ★ بررسی اینکه امروز پیامک نشده
            const referenceId = `${schedule.plan?.invoiceId || 'unknown'}-${schedule.installmentNumber}`
            const alreadySent = await wasReminderSentToday(tenant.id, referenceId)

            if (alreadySent) {
              console.log(`[Cron] Skipping ${referenceId} — already sent today`)
              stats.smsSkipped++
              continue
            }

            // ★ دریافت اطلاعات فاکتور و مشتری
            let customer: any = null
            let invoice: any = null

            if (schedule.plan?.invoiceId) {
              try {
                invoice = await db.client.invoice.findFirst({
                  where: { id: schedule.plan.invoiceId, tenantId: tenant.id },
                  select: {
                    id: true,
                    number: true,
                    customerId: true,
                  },
                })

                if (invoice?.customerId) {
                  customer = await db.client.customer.findFirst({
                    where: { id: invoice.customerId, tenantId: tenant.id },
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      mobile: true,
                    },
                  })
                }
              } catch (err: any) {
                console.warn(`[Cron] Failed to load invoice/customer:`, err?.message)
              }
            }

            // ★ اگر مشتری یا موبایل ندارد، رد کن
            if (!customer || !customer.mobile) {
              console.log(`[Cron] Skipping — no customer/mobile for schedule ${schedule.id}`)
              stats.smsSkipped++
              continue
            }

            const customerName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'مشتری'

            // ★ مبلغ باقیمانده قسط (کل - پرداخت‌شده)
            const fullAmount = Number(schedule.amount) || 0
            const paidAmount = Number(schedule.paidAmount) || 0
            const remainingAmount = fullAmount - paidAmount

            if (remainingAmount <= 0) {
              stats.smsSkipped++
              continue
            }

            // ★ ارسال پیامک
            console.log(`[Cron] Sending reminder to ${customer.mobile} for invoice ${invoice?.number || 'unknown'}, installment ${schedule.installmentNumber}, amount ${formatAmountToToman(remainingAmount)} تومان`)

            const result = await sendInstallmentReminder({
              tenantId: tenant.id,
              customerName,
              customerMobile: customer.mobile,
              invoiceNumber: invoice?.number || 'نامشخص',
              installmentNumber: schedule.installmentNumber,
              amount: remainingAmount,
              dueDate: schedule.dueDate,
              portalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/portal/${customer.id}`,
            })

            if (result.success) {
              if (result.mockMode) {
                stats.mockSent++
              } else {
                stats.smsSent++
              }
            } else {
              stats.smsFailed++
              stats.errors.push(`${tenant.subDomain}/${referenceId}: ${result.message}`)
            }
          } catch (err: any) {
            console.error(`[Cron] Error processing schedule ${schedule.id}:`, err?.message)
            stats.smsFailed++
            stats.errors.push(`${tenant.subDomain}/${schedule.id}: ${err?.message}`)
          }
        }
      } catch (err: any) {
        console.error(`[Cron] Error processing tenant ${tenant.subDomain}:`, err?.message)
        stats.errors.push(`tenant ${tenant.subDomain}: ${err?.message}`)
      }
    }

    const durationMs = Date.now() - startTime
    console.log('\n╔══════════════════════════════════════════════════════════════╗')
    console.log('║  [Cron Installment Reminders] COMPLETED in', durationMs, 'ms')
    console.log('║  Stats:', JSON.stringify(stats, null, 2))
    console.log('╚══════════════════════════════════════════════════════════════╝\n')

    return NextResponse.json({
      success: true,
      data: {
        ...stats,
        durationMs,
        executedAt: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    console.error('[Cron] Fatal error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Internal server error',
        stats,
      },
      { status: 500 }
    )
  }
}
