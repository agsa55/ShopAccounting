// ============================================================================
// src/app/api/recurring-journals/[id]/route.ts — PUT/DELETE (v6.1 Jalali Utils)
// ShopAccounting — Recurring Journals API (Update/Delete)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import {
  calculateNextExecutionDate,
  findFiscalYearForDateFromList,
  parseLocalDate,
  startOfDay,
} from '@/lib/jalali-utils'
import {
  buildFiscalYearPayload,
  getActiveOpenFiscalYear,
  getFiscalYears,
  validateAndNormalizeLines,
} from '../route'

function apiError(message: string, status = 400) {
  const err: any = new Error(message)
  err.status = status
  return err
}

// ═══════════════════════════════════════════════════════════════
//  PUT — به‌روزرسانی الگو (فعال/غیرفعال، ویرایش)
// ═══════════════════════════════════════════════════════════════

export const PUT = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const params = await Promise.resolve(ctx?.params)
      const id = params?.id

      if (!id) {
        throw apiError('شناسه الزامی است')
      }

      const features = getFeaturesByPlanName(tenant.planTierName)
      if (!features?.canViewAccounts) {
        return NextResponse.json(
          {
            success: false,
            error: 'اسناد تکرارشونده فقط در پلن حرفه‌ای+ در دسترس است',
          },
          { status: 403 }
        )
      }

      const body = await req.json()

      const existing = await tenantDb.recurringJournal.findFirst({
        where: { id, tenantId },
      })

      if (!existing) {
        throw apiError('الگو یافت نشد', 404)
      }

      const updateData: any = {}

      if (body.title !== undefined) {
        if (!String(body.title).trim()) {
          throw apiError('عنوان نمی‌تواند خالی باشد')
        }
        updateData.title = String(body.title).trim()
      }

      if (body.description !== undefined) {
        updateData.description = body.description
          ? String(body.description)
          : null
      }

      if (body.isActive !== undefined) {
        updateData.isActive = Boolean(body.isActive)
      }

      if (body.autoPost !== undefined) {
        updateData.autoPost = Boolean(body.autoPost)
      }

      if (body.endDate !== undefined) {
        if (body.endDate) {
          const parsedEnd = parseLocalDate(body.endDate)
          if (!parsedEnd) throw apiError('تاریخ پایان نامعتبر است')
          updateData.endDate = parsedEnd
        } else {
          updateData.endDate = null
        }
      }

      if (body.startDate !== undefined) {
        if (body.startDate) {
          const parsedStart = parseLocalDate(body.startDate)
          if (!parsedStart) throw apiError('تاریخ شروع نامعتبر است')
          updateData.startDate = parsedStart
        }
      }

      let frequencyChanged = false

      if (body.frequency !== undefined) {
        const validFrequencies = ['weekly', 'monthly', 'quarterly', 'yearly']
        if (!validFrequencies.includes(body.frequency)) {
          throw apiError('دوره تکرار نامعتبر است')
        }

        if (body.frequency !== existing.frequency) {
          frequencyChanged = true
        }

        updateData.frequency = body.frequency
      }

      if (body.dayOfMonth !== undefined) {
        if (body.dayOfMonth !== null) {
          const d = Number(body.dayOfMonth)
          if (!Number.isFinite(d) || d < 1 || d > 31) {
            throw apiError('روز ماه باید بین ۱ تا ۳۱ باشد')
          }
          updateData.dayOfMonth = Math.floor(d)
        } else {
          updateData.dayOfMonth = null
        }
      }

      if (body.dayOfWeek !== undefined) {
        if (body.dayOfWeek !== null) {
          const d = Number(body.dayOfWeek)
          if (!Number.isFinite(d) || d < 0 || d > 6) {
            throw apiError('روز هفته نامعتبر است')
          }
          updateData.dayOfWeek = Math.floor(d)
        } else {
          updateData.dayOfWeek = null
        }
      }

      if (body.monthOfYear !== undefined) {
        if (body.monthOfYear !== null) {
          const m = Number(body.monthOfYear)
          if (!Number.isFinite(m) || m < 1 || m > 12) {
            throw apiError('ماه سال باید بین ۱ تا ۲ باشد')
          }
          updateData.monthOfYear = Math.floor(m)
        } else {
          updateData.monthOfYear = null
        }
      }

      if (body.lines !== undefined) {
        const normalizedLines = await validateAndNormalizeLines(
          tenantDb,
          tenantId,
          body.lines
        )
        updateData.journalLines = JSON.stringify(normalizedLines)
      }

      const scheduleChanged =
        frequencyChanged ||
        body.dayOfMonth !== undefined ||
        body.dayOfWeek !== undefined ||
        body.monthOfYear !== undefined ||
        body.startDate !== undefined

      if (scheduleChanged) {
        const finalFrequency = updateData.frequency ?? existing.frequency
        const finalDayOfMonth =
          updateData.dayOfMonth !== undefined
            ? updateData.dayOfMonth
            : existing.dayOfMonth
        const finalDayOfWeek =
          updateData.dayOfWeek !== undefined
            ? updateData.dayOfWeek
            : existing.dayOfWeek
        const finalMonthOfYear =
          updateData.monthOfYear !== undefined
            ? updateData.monthOfYear
            : existing.monthOfYear

        const now = startOfDay(new Date())
        const startDateValue =
          updateData.startDate ?? existing.startDate
        const start = startDateValue ? startOfDay(new Date(startDateValue)) : now
        const baseDate = start > now ? start : now

        updateData.nextExecutionDate = calculateNextExecutionDate(
          finalFrequency,
          finalDayOfMonth ?? null,
          finalDayOfWeek ?? null,
          finalMonthOfYear ?? null,
          baseDate
        )
      }

      // اعتبارسنجی تاریخ شروع/پایان در سال مالی
      const fiscalYears = await getFiscalYears(tenantDb, tenantId)
      const activeFy = getActiveOpenFiscalYear(fiscalYears)

      const effectiveStartDate =
        updateData.startDate ?? existing.startDate
      const effectiveEndDate =
        updateData.endDate !== undefined
          ? updateData.endDate
          : existing.endDate

      if (effectiveStartDate) {
        const startFy = findFiscalYearForDateFromList(
          fiscalYears,
          effectiveStartDate
        )

        if (!startFy) {
          throw apiError(
            'برای تاریخ شروع این الگو، سال مالی تعریف نشده است.'
          )
        }

        if (startFy.isClosed) {
          throw apiError(
            `سال مالی «${startFy.name}» بسته شده است و امکان تنظیم تاریخ شروع در آن وجود ندارد.`
          )
        }
      }

      if (effectiveEndDate && effectiveStartDate) {
        const end = new Date(effectiveEndDate)
        const start = new Date(effectiveStartDate)
        if (end < start) {
          throw apiError('تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد')
        }
      }

      const shouldBeActive =
        updateData.isActive !== undefined
          ? updateData.isActive
          : existing.isActive

      const mustValidateNext =
        updateData.isActive === true || scheduleChanged

      if (mustValidateNext && shouldBeActive) {
        const nextDate =
          updateData.nextExecutionDate ?? existing.nextExecutionDate

        if (!nextDate) {
          throw apiError('تاریخ اجرای بعدی مشخص نیست')
        }

        const nextFy = findFiscalYearForDateFromList(fiscalYears, nextDate)

        if (!nextFy) {
          throw apiError(
            'برای تاریخ اجرای بعدی این الگو، سال مالی تعریف نشده است.'
          )
        }

        if (nextFy.isClosed) {
          throw apiError(
            `سال مالی «${nextFy.name}» بسته شده است و امکان فعال کردن یا زمان‌بندی این الگو وجود ندارد.`
          )
        }

        if (!nextFy.isActive) {
          throw apiError(
            `سال مالی «${nextFy.name}» فعال نیست و امکان اجرای خودکار این الگو وجود ندارد.`
          )
        }
      }

      if (shouldBeActive && !activeFy) {
        throw apiError(
          'سال مالی فعال و بازی وجود ندارد. امکان فعال‌سازی یا اجرای خودکار الگو نیست.'
        )
      }

      const updated = await tenantDb.recurringJournal.update({
        where: { id },
        data: updateData,
      })

      const nextFy = updated.nextExecutionDate
        ? findFiscalYearForDateFromList(
            fiscalYears,
            updated.nextExecutionDate
          )
        : null

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          title: updated.title,
          isActive: updated.isActive,
          nextExecutionDate: updated.nextExecutionDate,
          nextExecutionFiscalYear: buildFiscalYearPayload(nextFy),
        },
        message: 'الگو با موفقیت به‌روزرسانی شد',
      })
    } catch (error: any) {
      console.error('[RecurringJournals PUT] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در به‌روزرسانی الگو',
        },
        { status: error?.status || 500 }
      )
    }
  }
)

// ═══════════════════════════════════════════════════════════════
//  DELETE — حذف الگو
// ═══════════════════════════════════════════════════════════════

export const DELETE = withTenantAndPermission('accounting')(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const params = await Promise.resolve(ctx?.params)
      const id = params?.id

      if (!id) {
        throw apiError('شناسه الزامی است')
      }

      const existing = await tenantDb.recurringJournal.findFirst({
        where: { id, tenantId },
      })

      if (!existing) {
        throw apiError('الگو یافت نشد', 404)
      }

      await tenantDb.recurringJournal.delete({
        where: { id },
      })

      return NextResponse.json({
        success: true,
        message: 'الگو با موفقیت حذف شد',
      })
    } catch (error: any) {
      console.error('[RecurringJournals DELETE] Error:', error)

      return NextResponse.json(
        {
          success: false,
          error: error?.message || 'خطا در حذف الگو',
        },
        { status: error?.status || 500 }
      )
    }
  }
)