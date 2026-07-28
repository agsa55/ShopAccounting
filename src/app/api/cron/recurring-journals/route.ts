// ============================================================================
// src/app/api/cron/recurring-journals/route.ts — GET/POST (v5.3 ★★★ Phase 4)
// ShopAccounting — Cron Job: Auto-generate Journal Entries from Recurring Templates
// ----------------------------------------------------------------------------
// این API توسط یک cron job روزانه صدا زده می‌شود و برای تمام الگوهای
// تکرارشونده که nextExecutionDate <= today است، یک سند حسابداری تولید می‌کند.
//
// محافظت:
//   - هدر X-Cron-Secret یا query param ?secret=CRON_SECRET
//
// منطق:
//   ۱. پیدا کردن تمام الگوهای فعال که nextExecutionDate <= today
//   ۲. برای هر الگو:
//      a. ایجاد JournalEntry با خطوط تعریف‌شده
//      b. به‌روزرسانی nextExecutionDate و lastExecutedAt
//   ۳. گزارش نهایی
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { calculateNextExecutionDate } from '@/app/api/recurring-journals/route'

export async function GET(req: NextRequest) {
  return handleCron(req)
}

export async function POST(req: NextRequest) {
  return handleCron(req)
}

async function handleCron(req: NextRequest) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log('║  [Cron Recurring Journals] STARTED at', new Date().toISOString(), '  ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  // ─── ۱. بررسی secret ──────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[Cron Recurring] CRON_SECRET not set')
    return NextResponse.json(
      { success: false, error: 'CRON_SECRET not configured' },
      { status: 500 }
    )
  }

  const secretFromHeader = req.headers.get('x-cron-secret')
  const { searchParams } = new URL(req.url)
  const secretFromQuery = searchParams.get('secret')
  const forceRun = searchParams.get('force') === 'true'

  if (secretFromHeader !== cronSecret && secretFromQuery !== cronSecret) {
    console.warn('[Cron Recurring] Unauthorized access attempt')
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const startTime = Date.now()
  const stats = {
    templatesFound: 0,
    entriesCreated: 0,
    errors: [] as string[],
  }

  try {
    const now = new Date()
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)

    // ─── ۲. پیدا کردن تمام الگوهای فعال ─────────────────────────
    //   که nextExecutionDate <= today
    const where: any = {
      isActive: true,
    }

    if (!forceRun) {
      where.nextExecutionDate = { lte: now }
    }

    // ★ بررسی endDate (اگر گذشته است، skip)
    const recurringTemplates = await db.client.recurringJournal.findMany({
      where,
    })

    console.log(`[Cron Recurring] Found ${recurringTemplates.length} templates to process`)

    // ★ فیلتر کردن الگوهایی که endDate گذشته
    const activeTemplates = recurringTemplates.filter((t: any) => {
      if (t.endDate && new Date(t.endDate) < today) {
        console.log(`[Cron Recurring] Template "${t.title}" has passed endDate, skipping`)
        return false
      }
      return true
    })

    stats.templatesFound = activeTemplates.length

    // ★ group by tenantId برای بررسی tenant فعال
    const byTenant = new Map<string, any[]>()
    for (const template of activeTemplates) {
      if (!byTenant.has(template.tenantId)) {
        byTenant.set(template.tenantId, [])
      }
      byTenant.get(template.tenantId)!.push(template)
    }

    for (const [tenantId, templates] of byTenant) {
      // ★ بررسی tenant فعال
      try {
        const tenant = await db.client.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true, status: true, subDomain: true, expiresAt: true },
        })

        if (!tenant || tenant.status !== 'active') {
          console.log(`[Cron Recurring] Tenant ${tenantId} not active, skipping ${templates.length} templates`)
          continue
        }

        if (tenant.expiresAt && new Date(tenant.expiresAt) < now) {
          console.log(`[Cron Recurring] Tenant ${tenant.subDomain} expired, skipping`)
          continue
        }

        console.log(`[Cron Recurring] Processing tenant: ${tenant.subDomain} (${templates.length} templates)`)

        for (const template of templates) {
          try {
            // ★ parse lines
            let lines: any[] = []
            try {
              lines = typeof template.journalLines === 'string'
                ? JSON.parse(template.journalLines)
                : template.journalLines
            } catch {
              console.warn(`[Cron Recurring] Failed to parse lines for template "${template.title}"`)
              stats.errors.push(`Template "${template.title}": invalid lines JSON`)
              continue
            }

            if (!Array.isArray(lines) || lines.length < 2) {
              console.warn(`[Cron Recurring] Template "${template.title}" has insufficient lines`)
              stats.errors.push(`Template "${template.title}": less than 2 lines`)
              continue
            }

            // ★ محاسبه totalDebit و totalCredit
            const totalDebit = lines.reduce((sum: number, l: any) => sum + (Number(l.debit) || 0), 0)
            const totalCredit = lines.reduce((sum: number, l: any) => sum + (Number(l.credit) || 0), 0)

            // ★ تولید شماره سند
            let journalNumber: string
            try {
              const count = await db.client.journalEntry.count({ where: { tenantId } })
              journalNumber = `JE-${(count + 1).toString().padStart(6, '0')}`
            } catch {
              journalNumber = `JE-${Date.now().toString().slice(-6)}`
            }

            // ★ ایجاد سند حسابداری
            const executionDate = forceRun ? now : template.nextExecutionDate

            const journalEntry = await db.client.journalEntry.create({
              data: {
                number: journalNumber,
                date: executionDate,
                description: template.description || template.title,
                status: template.autoPost ? 'posted' : 'draft',
                sourceType: 'recurring',
                sourceId: template.id,
                totalDebit,
                totalCredit,
                createdBy: null,
                tenantId,
                lines: {
                  create: lines.map((line: any) => ({
                    accountId: line.accountId || null,
                    description: line.description || null,
                    debit: Number(line.debit) || 0,
                    credit: Number(line.credit) || 0,
                  })),
                },
              },
            })

            console.log(`[Cron Recurring] ✅ Created JE "${journalNumber}" for template "${template.title}"`)

            // ★ به‌روزرسانی الگو
            const nextDate = calculateNextExecutionDate(
              template.frequency,
              template.dayOfMonth,
              template.dayOfWeek,
              template.monthOfYear,
              executionDate
            )

            await db.client.recurringJournal.update({
              where: { id: template.id },
              data: {
                lastExecutedAt: now,
                nextExecutionDate: nextDate,
              },
            })

            console.log(`[Cron Recurring] Next execution for "${template.title}": ${nextDate.toISOString()}`)

            stats.entriesCreated++
          } catch (err: any) {
            console.error(`[Cron Recurring] Error processing template "${template.title}":`, err?.message)
            stats.errors.push(`Template "${template.title}": ${err?.message}`)
          }
        }
      } catch (err: any) {
        console.error(`[Cron Recurring] Error processing tenant ${tenantId}:`, err?.message)
        stats.errors.push(`Tenant ${tenantId}: ${err?.message}`)
      }
    }

    const durationMs = Date.now() - startTime
    console.log('\n╔══════════════════════════════════════════════════════════════╗')
    console.log('║  [Cron Recurring Journals] COMPLETED in', durationMs, 'ms')
    console.log('║  Stats:', JSON.stringify(stats))
    console.log('╚══════════════════════════════════════════════════════════════╝\n')

    return NextResponse.json({
      success: true,
      data: {
        ...stats,
        durationMs,
        executedAt: new Date().toISOString(),
        forceRun,
      },
    })
  } catch (error: any) {
    console.error('[Cron Recurring] Fatal error:', error)
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
