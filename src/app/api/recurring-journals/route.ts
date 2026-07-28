// ============================================================================
// src/app/api/recurring-journals/route.ts — GET/POST (v5.3 ★★★ Phase 4)
// ShopAccounting — Recurring Journals API (CRUD)
// ----------------------------------------------------------------------------
// ★ اسناد تکرارشونده برای هزینه‌های ثابت ماهانه (اجاره، حقوق، بیمه)
//
// GET  /api/recurring-journals          → لیست تمام الگوها
// POST /api/recurring-journals          → ایجاد الگوی جدید
//
// ★ نیاز به پلن حرفه‌ای+ (canViewAccounts) و توکن معتبر
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  Helper: محاسبه تاریخ اجرای بعدی
// ═══════════════════════════════════════════════════════════════

function calculateNextExecutionDate(
  frequency: string,
  dayOfMonth: number | null,
  dayOfWeek: number | null,
  monthOfYear: number | null,
  fromDate: Date = new Date()
): Date {
  const next = new Date(fromDate)
  next.setHours(0, 0, 0, 0)

  switch (frequency) {
    case 'weekly': {
      // ★ روز هفته (۰=یکشنبه، ۶=شنبه)
      const targetDay = dayOfWeek ?? 1 // پیش‌فرض: دوشنبه
      const currentDay = next.getDay()
      let diff = targetDay - currentDay
      if (diff <= 0) diff += 7 // هفته بعد
      next.setDate(next.getDate() + diff)
      break
    }

    case 'monthly': {
      // ★ روز ماه (۱-۳۱)
      const targetDay = dayOfMonth ?? 1
      next.setDate(targetDay)
      // ★ اگر تاریخ گذشته است، ماه بعد
      if (next <= fromDate) {
        next.setMonth(next.getMonth() + 1)
        // ★ بررسی روزهای ناموجود (مثلاً ۳۱ در بهمن)
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
        if (targetDay > maxDay) {
          next.setDate(maxDay)
        } else {
          next.setDate(targetDay)
        }
      }
      break
    }

    case 'quarterly': {
      // ★ هر ۳ ماه یک‌بار
      const targetDay = dayOfMonth ?? 1
      next.setDate(targetDay)
      if (next <= fromDate) {
        next.setMonth(next.getMonth() + 3)
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
        if (targetDay > maxDay) {
          next.setDate(maxDay)
        } else {
          next.setDate(targetDay)
        }
      }
      break
    }

    case 'yearly': {
      // ★ روز خاصی از سال
      const targetMonth = monthOfYear ?? 1 // پیش‌فرض: فروردین
      const targetDay = dayOfMonth ?? 1
      next.setMonth(targetMonth - 1) // ماه‌ها ۰-based
      next.setDate(targetDay)
      if (next <= fromDate) {
        next.setFullYear(next.getFullYear() + 1)
      }
      break
    }

    default:
      // ★ پیش‌فرض: ماهانه روز ۱
      next.setDate(1)
      next.setMonth(next.getMonth() + 1)
  }

  return next
}

// ═══════════════════════════════════════════════════════════════
//  GET — لیست تمام الگوهای تکرارشونده
// ═══════════════════════════════════════════════════════════════

export const GET = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      // ★ بررسی پلن
      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features.canViewAccounts) {
        return NextResponse.json(
          { success: false, error: 'اسناد تکرارشونده فقط در پلن حرفه‌ای و سازمانی در دسترس است' },
          { status: 403 }
        )
      }

      const { searchParams } = new URL(req.url)
      const includeInactive = searchParams.get('includeInactive') === 'true'

      const where: any = { tenantId }
      if (!includeInactive) {
        where.isActive = true
      }

      const recurringJournals = await tenantDb.recurringJournal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })

      // ★ enrich با اطلاعات حساب‌ها
      const allAccountIds: string[] = []
      for (const rj of recurringJournals) {
        try {
          const lines = typeof rj.journalLines === 'string'
            ? JSON.parse(rj.journalLines)
            : rj.journalLines
          if (Array.isArray(lines)) {
            for (const line of lines) {
              if (line.accountId) allAccountIds.push(line.accountId)
            }
          }
        } catch {}
      }

      const accountMap = new Map<string, { code: string; name: string }>()
      if (allAccountIds.length > 0) {
        try {
          const accounts = await tenantDb.account.findMany({
            where: { id: { in: [...new Set(allAccountIds)] }, tenantId },
            select: { id: true, code: true, name: true },
          })
          for (const acc of accounts) {
            accountMap.set(acc.id, { code: acc.code || '-', name: acc.name || '-' })
          }
        } catch {}
      }

      // ★ enrich با تعداد اسناد تولیدشده
      const enriched = await Promise.all(
        recurringJournals.map(async (rj: any) => {
          let generatedCount = 0
          try {
            generatedCount = await tenantDb.journalEntry.count({
              where: {
                tenantId,
                sourceType: 'recurring',
                sourceId: rj.id,
              },
            })
          } catch {}

          let lines: any[] = []
          try {
            lines = typeof rj.journalLines === 'string'
              ? JSON.parse(rj.journalLines)
              : rj.journalLines
          } catch {}

          return {
            id: rj.id,
            title: rj.title,
            description: rj.description,
            frequency: rj.frequency,
            dayOfMonth: rj.dayOfMonth,
            dayOfWeek: rj.dayOfWeek,
            monthOfYear: rj.monthOfYear,
            startDate: rj.startDate,
            endDate: rj.endDate,
            nextExecutionDate: rj.nextExecutionDate,
            lastExecutedAt: rj.lastExecutedAt,
            isActive: rj.isActive,
            autoPost: rj.autoPost,
            lines: lines.map((line: any) => ({
              ...line,
              accountName: accountMap.get(line.accountId)?.name || '-',
              accountCode: accountMap.get(line.accountId)?.code || '-',
            })),
            generatedCount,
            createdAt: rj.createdAt,
          }
        })
      )

      return NextResponse.json({
        success: true,
        data: enriched,
      })
    } catch (error: any) {
      console.error('[RecurringJournals GET] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در بارگذاری اسناد تکرارشونده' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  POST — ایجاد الگوی تکرارشونده جدید
// ═══════════════════════════════════════════════════════════════

export const POST = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      // ★ بررسی پلن
      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features.canViewAccounts) {
        return NextResponse.json(
          { success: false, error: 'اسناد تکرارشونده فقط در پلن حرفه‌ای و سازمانی در دسترس است' },
          { status: 403 }
        )
      }

      const body = await req.json()
      const {
        title,
        description,
        frequency,
        dayOfMonth,
        dayOfWeek,
        monthOfYear,
        startDate,
        endDate,
        lines,
        autoPost = true,
      } = body

      // ★ اعتبارسنجی
      if (!title || !title.trim()) {
        return NextResponse.json(
          { success: false, error: 'عنوان الزامی است' },
          { status: 400 }
        )
      }

      const validFrequencies = ['weekly', 'monthly', 'quarterly', 'yearly']
      if (!validFrequencies.includes(frequency)) {
        return NextResponse.json(
          { success: false, error: 'دوره تکرار نامعتبر است' },
          { status: 400 }
        )
      }

      if (!lines || !Array.isArray(lines) || lines.length < 2) {
        return NextResponse.json(
          { success: false, error: 'حداقل دو ردیف سند الزامی است' },
          { status: 400 }
        )
      }

      // ★ بررسی تراز سند
      const totalDebit = lines.reduce((sum: number, l: any) => sum + (Number(l.debit) || 0), 0)
      const totalCredit = lines.reduce((sum: number, l: any) => sum + (Number(l.credit) || 0), 0)

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return NextResponse.json(
          { success: false, error: `سند تراز نیست. بدهکار: ${totalDebit}, بستانکار: ${totalCredit}` },
          { status: 400 }
        )
      }

      // ★ محاسبه تاریخ اجرای بعدی
      const start = startDate ? new Date(startDate) : new Date()
      const nextExecutionDate = calculateNextExecutionDate(
        frequency,
        dayOfMonth ?? null,
        dayOfWeek ?? null,
        monthOfYear ?? null,
        start
      )

      // ★ ایجاد الگو
      const recurringJournal = await tenantDb.recurringJournal.create({
        data: {
          tenantId,
          title: title.trim(),
          description: description || null,
          frequency,
          dayOfMonth: dayOfMonth ?? null,
          dayOfWeek: dayOfWeek ?? null,
          monthOfYear: monthOfYear ?? null,
          startDate: start,
          endDate: endDate ? new Date(endDate) : null,
          nextExecutionDate,
          journalLines: JSON.stringify(lines.map((l: any) => ({
            accountId: l.accountId || null,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            description: l.description || null,
          }))),
          isActive: true,
          autoPost,
        },
      })

      console.log('[RecurringJournals POST] Created:', {
        id: recurringJournal.id,
        title: recurringJournal.title,
        frequency: recurringJournal.frequency,
        nextExecutionDate: recurringJournal.nextExecutionDate,
      })

      return NextResponse.json({
        success: true,
        data: {
          id: recurringJournal.id,
          title: recurringJournal.title,
          frequency: recurringJournal.frequency,
          nextExecutionDate: recurringJournal.nextExecutionDate,
          isActive: recurringJournal.isActive,
        },
        message: 'الگوی تکرارشونده با موفقیت ایجاد شد',
      }, { status: 201 })
    } catch (error: any) {
      console.error('[RecurringJournals POST] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در ایجاد الگوی تکرارشونده' },
        { status: 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  PUT — به‌روزرسانی الگو (در فایل [id]/route.ts)
//  DELETE — حذف الگو (در فایل [id]/route.ts)
// ═══════════════════════════════════════════════════════════════

export { calculateNextExecutionDate }
