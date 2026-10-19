// ============================================================================
// src/app/api/installment-plans/route.ts — GET (v5.2 Cross-Year Fiscal Scope + Legacy Safe)
// ShopAccounting — Installment Plans API
// ----------------------------------------------------------------------------
// ★★★ v5.2:
//   - رفع مشکل timezone در parse تاریخ‌ها
//   - پشتیبانی از فاکتورهای قدیمی بدون fiscalYearId ولی داخل سال مالی
//   - پشتیبانی از fiscalYearId روی خود installmentPlan در صورت وجود
//   - پشتیبانی از fiscalYearId روی installmentSchedule در صورت وجود
//   - افزودن invoiceDate به select فاکتور برای منطق legacy-safe
//   - بهبود diagnostics برای عیب‌یابی
//   - حفظ منطق cross-year برای اقساطی که فاکتورشان سال قبل است ولی قسطشان امسال است
//
// ★★★ v5.1:
//   - رفع باگ عدم نمایش اقساط بین‌سالی
//   - منطق OR دقیق:
//     1. فاکتور مادر در سال انتخابی باشد.
//     2. OR حداقل یکی از اقساط (Schedules) در بازه زمانی سال انتخابی سررسید داشته باشد.
//     3. OR تاریخ ایجاد طرح (createdAt) در بازه باشد (برای طرح‌های بدون فاکتور).
//   - استفاده از JS Filter برای دقت ۱۰۰٪ (به جای WHERE پیچیده Prisma)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import {
  isFieldSupported,
  resolveEffectiveFiscalYear,
  safeNum,
} from '@/lib/fiscal-year-reporting'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'

// ─── Date Helpers ───────────────────────────────────────────────

/**
 * تبدیل امن تاریخ به Date با تنظیم ساعت شروع/پایان روز
 * ★ از جابه‌جایی تاریخ به دلیل UTC جلوگیری می‌کند.
 */
function parseDateBound(value: any, endOfDay = false): Date | null {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null

    const d = new Date(value.getTime())
    if (endOfDay) {
      d.setHours(23, 59, 59, 999)
    } else {
      d.setHours(0, 0, 0, 0)
    }
    return d
  }

  const raw = String(value ?? '').trim()
  if (!raw) return null

  // اگر فقط تاریخ بود، مثل 2026-10-18، به وقت محلی سرور تبدیل شود
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null

  if (endOfDay) {
    d.setHours(23, 59, 59, 999)
  } else {
    d.setHours(0, 0, 0, 0)
  }

  return d
}

/**
 * تبدیل تاریخ سال مالی به محدوده زمانی دقیق (Start of Day to End of Day)
 */
function fiscalBounds(fy: any) {
  if (!fy || !fy.startDate || !fy.endDate) return null

  const start = parseDateBound(fy.startDate, false)
  const end = parseDateBound(fy.endDate, true)

  if (!start || !end) return null

  return { start, end }
}

/**
 * ★ منطق نهایی تشخیص تعلق طرح به سال مالی (v5.2)
 *
 * یک طرح باید نمایش داده شود اگر حداقل یکی از این conditions true باشد:
 *
 * 1. فاکتور مادر مستقیماً به همان fiscalYearId تعلق داشته باشد.
 * 2. خود installmentPlan fiscalYearId داشته باشد و به همان سال تعلق داشته باشد.
 * 3. فاکتور مادر fiscalYearId نداشته باشد ولی invoiceDate داخل بازه سال مالی باشد.
 * 4. حداقل یکی از اقساط fiscalYearId مستقیم به همان سال داشته باشد.
 * 5. حداقل یکی از اقساط dueDate داخل بازه سال مالی داشته باشد.
 * 6. اگر طرح بدون فاکتور است، createdAt داخل بازه سال مالی باشد.
 */
function planMatchesFiscalScopeV51(
  plan: any,
  invoice: any,
  fyBounds: { start: Date; end: Date } | null,
  effectiveFiscalYearId: string | null
): boolean {
  // اگر فیلتر سال مالی فعال نیست، همه را قبول کن
  if (!effectiveFiscalYearId || !fyBounds) return true

  // ۱. فاکتور مادر مستقیماً به این سال مالی تعلق دارد
  if (invoice?.fiscalYearId === effectiveFiscalYearId) {
    return true
  }

  // ۲. خود طرح قسطی fiscalYearId دارد
  if (plan?.fiscalYearId === effectiveFiscalYearId) {
    return true
  }

  // ۳. فاکتور قدیمی بدون fiscalYearId ولی تاریخ فاکتور داخل سال مالی است
  if (!invoice?.fiscalYearId && invoice?.invoiceDate) {
    const invoiceDate = parseDateBound(invoice.invoiceDate, false)

    if (
      invoiceDate &&
      invoiceDate >= fyBounds.start &&
      invoiceDate <= fyBounds.end
    ) {
      return true
    }
  }

  // ۴ و . بررسی اقساط: fiscalYearId مستقیم یا dueDate داخل سال مالی
  if (plan?.schedules && Array.isArray(plan.schedules)) {
    for (const schedule of plan.schedules) {
      // اگر schedule خودش fiscalYearId دارد
      if (schedule?.fiscalYearId === effectiveFiscalYearId) {
        return true
      }

      // اگر سررسید قسط داخل بازه سال مالی است
      if (schedule?.dueDate) {
        const due = parseDateBound(schedule.dueDate, false)

        if (due && due >= fyBounds.start && due <= fyBounds.end) {
          return true
        }
      }
    }
  }

  // ۶. Fallback برای طرح‌های بدون فاکتور
  if (!invoice && plan?.createdAt) {
    const created = parseDateBound(plan.createdAt, false)

    if (created && created >= fyBounds.start && created <= fyBounds.end) {
      return true
    }
  }

  return false
}

export const GET = withTenantAndPermission('pos')(
  async (req: NextRequest, _ctx: any, tenant: any) => {
    console.log(
      '[InstallmentPlans v5.2] ★★★ VERSION LOADED — CROSS-YEAR + LEGACY SAFE'
    )

    try {
      const tenantDb = tenant.tenantDb
      const tenantId = tenant.tenantId

      const { searchParams } = new URL(req.url)

      const status = searchParams.get('status')
      const search = searchParams.get('search')
      const planId = searchParams.get('id')

      const fiscalYearIdParam = (searchParams.get('fiscalYearId') || '').trim()
      const allYears = searchParams.get('allYears') === 'true'

      let fy: any = null
      let effectiveFiscalYearId: string | null = null
      let fyBounds: { start: Date; end: Date } | null = null

      // ═══════════════════════════════════════════════════════════════
      // ۱. تعیین سال مالی مؤثر
      // ═══════════════════════════════════════════════════════════════
      if (!allYears) {
        try {
          fy = await resolveEffectiveFiscalYear(
            tenantDb,
            tenantId,
            fiscalYearIdParam || null
          )
          effectiveFiscalYearId = fy.id
          fyBounds = fiscalBounds(fy)
        } catch (err: any) {
          return NextResponse.json(
            {
              success: false,
              error:
                err?.message ||
                (fiscalYearIdParam
                  ? 'سال مالی انتخابی یافت نشد.'
                  : 'سال مالی فعالی برای این فروشگاه تعریف نشده است.'),
              code: fiscalYearIdParam
                ? 'INVALID_FISCAL_YEAR'
                : 'NO_ACTIVE_FISCAL_YEAR',
            },
            { status: 400 }
          )
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // ۲. حالت دریافت تک‌طرح (Single Plan Fetch)
      // ═══════════════════════════════════════════════════════════════
      if (planId) {
        return await getSinglePlanV51(
          tenantDb,
          tenantId,
          planId,
          fy,
          effectiveFiscalYearId,
          fyBounds
        )
      }

      // ═══════════════════════════════════════════════════════════════
      // ۳. ساخت Where Clause اولیه
      // ═══════════════════════════════════════════════════════════════
      const where: any = { tenantId }

      if (status) {
        where.status = status
      }

      // ★ نکته مهم: ما اینجا فیلتر سال مالی را سخت‌گیرانه روی DB اعمال نمی‌کنیم
      // چون ممکن است اقساطی داشته باشیم که فاکتورش سال قبل است ولی قسطش امسال است.
      // بنابراین ابتدا همه طرح‌ها (یا فیلتر وضعیت) را می‌گیریم و بعد در JS فیلتر می‌کنیم.

      let plansRaw: any[] = []

      try {
        // تلاش اول: استفاده از Include استاندارد Prisma
        plansRaw = await tenantDb.installmentPlan.findMany({
          where,
          include: {
            schedules: {
              orderBy: { installmentNumber: 'asc' },
            },
            invoice: {
              select: {
                id: true,
                number: true,
                invoiceDate: true, // ★ v5.2 برای پشتیبانی از فاکتورهای قدیمی بدون fiscalYearId
                fiscalYearId: true,
                customer: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    mobile: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      } catch (includeErr: any) {
        console.warn(
          '[InstallmentPlans v5.2] Standard Include failed, switching to Manual Join:',
          includeErr?.message
        )

        // تلاش دوم: Fallback به Manual Join (برای سازگاری با تغییرات Schema)
        const basePlans = await tenantDb.installmentPlan.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        })

        plansRaw = []

        for (const plan of basePlans) {
          let invoiceData: any = null
          let schedulesData: any[] = []

          // دریافت فاکتور
          if ((plan as any).invoiceId) {
            try {
              invoiceData = await tenantDb.invoice.findFirst({
                where: { id: (plan as any).invoiceId, tenantId },
                select: {
                  id: true,
                  number: true,
                  invoiceDate: true, // ★ v5.2
                  fiscalYearId: true,
                  customer: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      mobile: true,
                    },
                  },
                },
              })
            } catch {
              invoiceData = null
            }
          }

          // دریافت اقساط
          try {
            schedulesData = await tenantDb.installmentSchedule.findMany({
              where: { planId: (plan as any).id },
              orderBy: { installmentNumber: 'asc' },
            })
          } catch {
            schedulesData = []
          }

          plansRaw.push({
            ...plan,
            invoice: invoiceData,
            schedules: schedulesData,
          })
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // ۴. پردازش، فیلتر سال مالی و نرمال‌سازی خروجی
      // ═══════════════════════════════════════════════════════════════
      const processedPlans = plansRaw
        .map((plan: any) => {
          const invoice = plan.invoice

          // ★ اعمال فیلتر سال مالی v5.2 (Cross-Year + Legacy Safe Logic)
          const isInScope = planMatchesFiscalScopeV51(
            plan,
            invoice,
            fyBounds,
            effectiveFiscalYearId
          )

          // اگر خارج از دامنه بود، null برگردان تا بعداً فیلتر شود
          if (!isInScope) return null

          const customerName = invoice?.customer
            ? `${invoice.customer.firstName || ''} ${invoice.customer.lastName || ''}`.trim()
            : plan.customerId
              ? `مشتری ${String(plan.customerId).substring(0, 8)}...`
              : 'بدون مشتری'

          const invoiceNumber = invoice?.number || '---'

          const schedules = (plan.schedules || []).map((s: any) => ({
            id: s.id,
            installmentNumber: s.installmentNumber,
            amount: safeNum(s.amount),
            dueDate: s.dueDate,
            status: s.status,
            paidAmount: safeNum(s.paidAmount),
            paidAt: s.paidAt,
            paymentRef: s.paymentRef,
            paymentType: s.paymentType,
            notes: s.notes,
            fiscalYearId: s.fiscalYearId || null,
          }))

          const paidCount = schedules.filter(
            (s: any) => String(s.status || '').toUpperCase() === 'PAID'
          ).length

          const totalCount = schedules.length

          const schedulePaidSum = schedules.reduce(
            (sum: number, s: any) => sum + safeNum(s.paidAmount),
            0
          )

          const dynamicTotalPaid = safeNum(plan.downPayment) + schedulePaidSum
          const dynamicRemaining = Math.max(
            0,
            safeNum(plan.totalAmount) - dynamicTotalPaid
          )

          const overdueCount = schedules.filter((s: any) => {
            if (String(s.status || '').toUpperCase() === 'PAID') return false
            const due = parseDateBound(s.dueDate, false)
            if (!due) return false
            return due < new Date()
          }).length

          return {
            id: plan.id,
            invoiceId: plan.invoiceId,
            invoiceNumber,
            invoiceDate: invoice?.invoiceDate || null,
            invoiceFiscalYearId: invoice?.fiscalYearId || null,
            planFiscalYearId: plan.fiscalYearId || null,
            customerId: plan.customerId,
            customerName,
            totalAmount: safeNum(plan.totalAmount),
            downPayment: safeNum(plan.downPayment),
            remainingAmount: dynamicRemaining,
            totalPaidAmount: dynamicTotalPaid,
            interestRate: safeNum(plan.interestRate),
            totalWithInterest: safeNum(plan.totalWithInterest),
            numberOfInstallments: plan.numberOfInstallments,
            installmentAmount: safeNum(plan.installmentAmount),
            installmentPeriod: plan.installmentPeriod,
            status: plan.status,
            paidInstallments: plan.paidInstallments || paidCount,
            nextDueDate: plan.nextDueDate,
            description: plan.description,
            createdAt: plan.createdAt,
            updatedAt: plan.updatedAt,
            schedules,
            totalInstallments: totalCount,
            paidCount,
            overdueCount,
            progressPct:
              totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0,
          }
        })
        .filter(Boolean) as any[] // حذف null ها

      // ═══════════════════════════════════════════════════════════════
      // ۵. فیلتر جستجو (Search)
      // ═══════════════════════════════════════════════════════════════
      let filtered = processedPlans

      if (search) {
        const q = search.toLowerCase()
        filtered = processedPlans.filter(
          (p: any) =>
            String(p.customerName || '')
              .toLowerCase()
              .includes(q) ||
            String(p.invoiceNumber || '')
              .toLowerCase()
              .includes(q)
        )
      }

      // ═══════════════════════════════════════════════════════════════
      // ۶. محاسبه Summary
      // ═══════════════════════════════════════════════════════════════
      const summary = {
        totalPlans: filtered.length,
        activePlans: filtered.filter(
          (p: any) => String(p.status || '').toLowerCase() === 'active'
        ).length,
        completedPlans: filtered.filter(
          (p: any) => String(p.status || '').toLowerCase() === 'completed'
        ).length,
        overduePlans: filtered.filter((p: any) => p.overdueCount > 0).length,
        totalRemaining: filtered.reduce(
          (sum: number, p: any) => sum + safeNum(p.remainingAmount),
          0
        ),
        totalOverdueInstallments: filtered.reduce(
          (sum: number, p: any) => sum + safeNum(p.overdueCount),
          0
        ),
      }

      console.log('[InstallmentPlans v5.2] Final Result', {
        tenantId,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        rawCount: plansRaw.length,
        finalCount: filtered.length,
        summary,
      })

      return NextResponse.json({
        success: true,
        fiscalYearId: effectiveFiscalYearId,
        fiscalYearName: fy?.name || null,
        allYears,
        warning: allYears ? ALL_YEARS_WARNING : undefined,
        data: filtered,
        summary,
        diagnostics: {
          fiscalYearApplied: Boolean(effectiveFiscalYearId && !allYears),
          requestedFiscalYearId: fiscalYearIdParam || null,
          allYearsRequested: allYears,
          scopeMethod: 'cross-year-schedule-check-v5.2',
          installmentsHaveFiscalYearId: isFieldSupported(
            tenantDb.installmentPlan,
            'fiscalYearId'
          ),
          schedulesHaveFiscalYearId: isFieldSupported(
            tenantDb.installmentSchedule,
            'fiscalYearId'
          ),
          rawPlanCount: plansRaw.length,
          finalPlanCount: filtered.length,
        },
      })
    } catch (error: any) {
      console.error('[InstallmentPlans v5.2] GET error:', error)

      return NextResponse.json(
        {
          success: false,
          error:
            'خطا در بارگذاری طرح‌های قسطی: ' + (error?.message || 'نامشخص'),
        },
        { status: 500 }
      )
    }
  }
)

/**
 * دریافت تک‌طرح با رعایت منطق سال مالی v5.2
 */
async function getSinglePlanV51(
  tenantDb: any,
  tenantId: string,
  planId: string,
  fy: any,
  effectiveFiscalYearId: string | null,
  fyBounds: { start: Date; end: Date } | null
) {
  try {
    // ابتدا طرح را همراه با جداول وابسته بخوان
    const plan = await tenantDb.installmentPlan.findFirst({
      where: { id: planId, tenantId },
      include: {
        schedules: {
          orderBy: { installmentNumber: 'asc' },
        },
        invoice: {
          select: {
            id: true,
            number: true,
            invoiceDate: true, // ★ v5.2
            fiscalYearId: true,
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                mobile: true,
              },
            },
          },
        },
      },
    })

    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'طرح قسطی یافت نشد' },
        { status: 404 }
      )
    }

    // ★ بررسی تعلق به سال مالی با منطق v5.2
    const isInScope = planMatchesFiscalScopeV51(
      plan,
      (plan as any).invoice,
      fyBounds,
      effectiveFiscalYearId
    )

    if (!isInScope) {
      return NextResponse.json(
        {
          success: false,
          error:
            'این طرح قسطی به سال مالی انتخابی تعلق ندارد (نه فاکتورش، نه اقساطش و نه خود طرح).',
          code: 'PLAN_NOT_IN_FISCAL_YEAR',
        },
        { status: 404 }
      )
    }

    const invoice = (plan as any).invoice

    const customerName = invoice?.customer
      ? `${invoice.customer.firstName || ''} ${invoice.customer.lastName || ''}`.trim()
      : 'بدون مشتری'

    const schedules = ((plan as any).schedules || []).map((s: any) => ({
      id: s.id,
      installmentNumber: s.installmentNumber,
      amount: safeNum(s.amount),
      dueDate: s.dueDate,
      status: s.status,
      paidAmount: safeNum(s.paidAmount),
      paidAt: s.paidAt,
      paymentRef: s.paymentRef,
      paymentType: s.paymentType,
      notes: s.notes,
      fiscalYearId: s.fiscalYearId || null,
    }))

    const paidCount = schedules.filter(
      (s: any) => String(s.status || '').toUpperCase() === 'PAID'
    ).length

    const schedulePaidSum = schedules.reduce(
      (sum: number, s: any) => sum + safeNum(s.paidAmount),
      0
    )

    const dynamicTotalPaid = safeNum((plan as any).downPayment) + schedulePaidSum
    const dynamicRemaining = Math.max(
      0,
      safeNum((plan as any).totalAmount) - dynamicTotalPaid
    )

    const overdueCount = schedules.filter((s: any) => {
      if (String(s.status || '').toUpperCase() === 'PAID') return false
      const due = parseDateBound(s.dueDate, false)
      if (!due) return false
      return due < new Date()
    }).length

    return NextResponse.json({
      success: true,
      fiscalYearId: effectiveFiscalYearId,
      fiscalYearName: fy?.name || null,
      allYears: !effectiveFiscalYearId,
      data: {
        id: (plan as any).id,
        invoiceId: (plan as any).invoiceId,
        invoiceNumber: invoice?.number || '---',
        invoiceDate: invoice?.invoiceDate || null,
        invoiceFiscalYearId: invoice?.fiscalYearId || null,
        planFiscalYearId: (plan as any).fiscalYearId || null,
        customerId: (plan as any).customerId,
        customerName,
        totalAmount: safeNum((plan as any).totalAmount),
        downPayment: safeNum((plan as any).downPayment),
        remainingAmount: dynamicRemaining,
        totalPaidAmount: dynamicTotalPaid,
        interestRate: safeNum((plan as any).interestRate),
        totalWithInterest: safeNum((plan as any).totalWithInterest),
        numberOfInstallments: (plan as any).numberOfInstallments,
        installmentAmount: safeNum((plan as any).installmentAmount),
        installmentPeriod: (plan as any).installmentPeriod,
        status: (plan as any).status,
        paidInstallments: (plan as any).paidInstallments || paidCount,
        nextDueDate: (plan as any).nextDueDate,
        description: (plan as any).description,
        createdAt: (plan as any).createdAt,
        updatedAt: (plan as any).updatedAt,
        schedules,
        paidCount,
        overdueCount,
        totalInstallments: schedules.length,
        progressPct:
          schedules.length > 0
            ? Math.round((paidCount / schedules.length) * 100)
            : 0,
      },
      diagnostics: {
        fiscalYearApplied: Boolean(effectiveFiscalYearId),
        scopeMethod: 'cross-year-schedule-check-v5.2',
        installmentsHaveFiscalYearId: isFieldSupported(
          tenantDb.installmentPlan,
          'fiscalYearId'
        ),
        schedulesHaveFiscalYearId: isFieldSupported(
          tenantDb.installmentSchedule,
          'fiscalYearId'
        ),
        scopeCheckPassed: true,
      },
    })
  } catch (error: any) {
    console.error('[InstallmentPlans v5.2] GET single error:', error)

    return NextResponse.json(
      {
        success: false,
        error:
          'خطا در بارگذاری طرح قسطی: ' + (error?.message || 'نامشخص'),
      },
      { status: 500 }
    )
  }
}