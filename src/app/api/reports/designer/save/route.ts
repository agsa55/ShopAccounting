// ============================================================================
// src/app/api/reports/designer/save/route.ts — v12.0 ★★★
// ShopAccounting — Save Custom Report API
// ----------------------------------------------------------------------------
// این API گزارش طراحی‌شده را در جدول CustomReports ذخیره می‌کند.
//
// ★ قابلیت‌ها:
//   - ساخت گزارش جدید
//   - ویرایش گزارش موجود (با ارسال id)
//   - بررسی محدودیت تعداد گزارش بر اساس پلن
//   - validate کردن definition قبل از ذخیره
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { extractTenantId, getTenantInfo, prisma } from '@/lib/reports/report-auth'
import { getDataset, getDatasetField } from '@/lib/reports/report-datasets'
import { getFeaturesByPlanName } from '@/lib/plan-features'
import type { ReportDefinition } from '@/lib/reports/report-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ═══════════════════════════════════════════════════════════════
//  Helper: Validate report definition
// ═══════════════════════════════════════════════════════════════

function validateDefinition(definition: ReportDefinition): string[] {
  const errors: string[] = []

  if (!definition || typeof definition !== 'object') {
    return ['تعریف گزارش نامعتبر است.']
  }

  if (!definition.datasetId || typeof definition.datasetId !== 'string') {
    errors.push('datasetId الزامی است.')
    return errors
  }

  const dataset = getDataset(definition.datasetId)
  if (!dataset) {
    errors.push(`dataset '${definition.datasetId}' یافت نشد.`)
    return errors
  }

  if (!Array.isArray(definition.columns) || definition.columns.length === 0) {
    errors.push('حداقل یک ستون باید انتخاب شود.')
    return errors
  }

  if (definition.columns.length > 30) {
    errors.push('حداکثر ۳۰ ستون در یک گزارش مجاز است.')
  }

  // Validate columns
  for (const col of definition.columns) {
    if (!col.field || typeof col.field !== 'string') {
      errors.push('هر ستون باید field معتبر داشته باشد.')
      continue
    }

    const field = getDatasetField(definition.datasetId, col.field)
    if (!field) {
      errors.push(`فیلد '${col.field}' در dataset وجود ندارد.`)
      continue
    }

    if (col.aggregate && !field.aggregatable) {
      errors.push(`فیلد '${col.field}' نمی‌تواند aggregate شود.`)
    }

    const validAggregates = ['sum', 'avg', 'count', 'countDistinct', 'min', 'max']
    if (col.aggregate && !validAggregates.includes(col.aggregate)) {
      errors.push(`عملیات aggregate '${col.aggregate}' نامعتبر است.`)
    }
  }

  // Validate filters
  if (definition.filters) {
    if (!Array.isArray(definition.filters)) {
      errors.push('filters باید آرایه باشد.')
    } else {
      for (const filter of definition.filters) {
        const field = getDatasetField(definition.datasetId, filter.field)
        if (!field) {
          errors.push(`فیلد فیلتر '${filter.field}' یافت نشد.`)
        }
      }
    }
  }

  // Validate groupBy
  if (definition.groupBy) {
    if (!Array.isArray(definition.groupBy)) {
      errors.push('groupBy باید آرایه باشد.')
    } else {
      for (const gb of definition.groupBy) {
        const field = getDatasetField(definition.datasetId, gb.field)
        if (!field) {
          errors.push(`فیلد گروه‌بندی '${gb.field}' یافت نشد.`)
        }
      }
    }
  }

  // Validate orderBy
  if (definition.orderBy) {
    if (!Array.isArray(definition.orderBy)) {
      errors.push('orderBy باید آرایه باشد.')
    } else {
      for (const ob of definition.orderBy) {
        const field = getDatasetField(definition.datasetId, ob.field)
        if (!field) {
          errors.push(`فیلد مرتب‌سازی '${ob.field}' یافت نشد.`)
        }
        if (ob.direction && !['asc', 'desc'].includes(ob.direction)) {
          errors.push(`جهت مرتب‌سازی '${ob.direction}' نامعتبر است.`)
        }
      }
    }
  }

  // Validate limit
  if (definition.limit !== undefined) {
    if (typeof definition.limit !== 'number' || definition.limit < 1 || definition.limit > 50000) {
      errors.push('limit باید عددی بین ۱ تا ۵۰۰۰۰ باشد.')
    }
  }

  return errors
}

// ═══════════════════════════════════════════════════════════════
//  POST: Save / Update report
// ═══════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    // 1. Extract tenantId
    const tenantId = await extractTenantId(req)
    if (!tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'tenantId یافت نشد. لطفاً دوباره وارد شوید.',
        },
        { status: 401 }
      )
    }

    // 2. Parse body
    const body = await req.json().catch(() => ({}))
    const {
      id,
      name,
      description,
      datasetId,
      definition,
      isFavorite,
    } = body

    // 3. Validate basic fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'نام گزارش الزامی است.',
        },
        { status: 400 }
      )
    }

    const trimmedName = name.trim().slice(0, 200)

    if (description && typeof description === 'string' && description.length > 500) {
      return NextResponse.json(
        {
          success: false,
          error: 'توضیحات گزارش نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.',
        },
        { status: 400 }
      )
    }

    // 4. Validate definition
    const reportDefinition: ReportDefinition = definition || { datasetId, columns: [] }
    const validationErrors = validateDefinition(reportDefinition)

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'تعریف گزارش نامعتبر است.',
          validationErrors,
        },
        { status: 400 }
      )
    }

    // 5. Get tenant info for plan check
    const tenant = await getTenantInfo(tenantId)
    if (!tenant) {
      return NextResponse.json(
        {
          success: false,
          error: 'فروشگاه یافت نشد.',
        },
        { status: 404 }
      )
    }

    // 6. Check plan permissions
    const features = getFeaturesByPlanName(tenant.planName)

    if (!features.canUseCustomReportDesigner) {
      return NextResponse.json(
        {
          success: false,
          error: 'طراحی گزارش دلخواه در پلن فعلی شما در دسترس نیست. لطفاً پلن خود را ارتقا دهید.',
        },
        { status: 403 }
      )
    }

    // 7. If updating, check ownership
    if (id) {
      const existing = await prisma.customReport.findFirst({
        where: {
          id,
          tenantId,
        },
      })

      if (!existing) {
        return NextResponse.json(
          {
            success: false,
            error: 'گزارش یافت نشد یا به این فروشگاه تعلق ندارد.',
          },
          { status: 404 }
        )
      }

      // Update existing
      const updated = await prisma.customReport.update({
        where: { id },
        data: {
          name: trimmedName,
          description: description?.trim() || null,
          datasetId: reportDefinition.datasetId,
          definition: reportDefinition as any,
          isFavorite: typeof isFavorite === 'boolean' ? isFavorite : existing.isFavorite,
        },
      })

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          datasetId: updated.datasetId,
          definition: updated.definition,
          isFavorite: updated.isFavorite,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
        message: 'گزارش با موفقیت ویرایش شد.',
      })
    }

    // 8. Check max saved reports limit (only for new reports)
    const currentCount = await prisma.customReport.count({
      where: { tenantId },
    })

    const maxAllowed = features.maxSavedCustomReports || 0

    if (currentCount >= maxAllowed) {
      return NextResponse.json(
        {
          success: false,
          error: `شما به حداکثر تعداد گزارش‌های ذخیره‌شده (${maxAllowed}) رسیده‌اید. لطفاً یک گزارش قدیمی را حذف کنید یا پلن خود را ارتقا دهید.`,
        },
        { status: 403 }
      )
    }

    // 9. Create new report
    const created = await prisma.customReport.create({
      data: {
        tenantId,
        name: trimmedName,
        description: description?.trim() || null,
        datasetId: reportDefinition.datasetId,
        definition: reportDefinition as any,
        isFavorite: typeof isFavorite === 'boolean' ? isFavorite : false,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        name: created.name,
        description: created.description,
        datasetId: created.datasetId,
        definition: created.definition,
        isFavorite: created.isFavorite,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
      message: 'گزارش با موفقیت ذخیره شد.',
    })

  } catch (error: any) {
    console.error('[Save Report API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'خطای داخلی سرور',
      },
      { status: 500 }
    )
  }
}