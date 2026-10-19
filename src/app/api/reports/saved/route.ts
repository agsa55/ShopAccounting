// ============================================================================
// src/app/api/reports/saved/route.ts — v12.1
// ShopAccounting — List Saved Custom Reports API
// ----------------------------------------------------------------------------
// ★★★ v12.1:
//   - رفع مشکل جستجوی insensitive در دیتابیس‌های غیر Postgres
//   - parse امن definition اگر رشته JSON باشد
//   - حذف کامنت‌های تکراری
//   - fallback امن برای خطای Prisma
//   - حفظ metadata سال مالی برای هر dataset
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { extractTenantId, prisma } from '@/lib/reports/report-auth'
import { getDataset } from '@/lib/reports/report-datasets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseDefinition(value: any): any {
  if (!value) return null

  if (typeof value === 'object') return value

  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  return null
}

export async function GET(req: NextRequest) {
  try {
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

    const datasetId = (req.nextUrl.searchParams.get('datasetId') || '').trim() || null
    const search = (req.nextUrl.searchParams.get('search') || '').trim() || null
    const onlyFavorites = req.nextUrl.searchParams.get('onlyFavorites') === 'true'

    const where: any = { tenantId }

    if (datasetId) {
      where.datasetId = datasetId
    }

    if (onlyFavorites) {
      where.isFavorite = true
    }

    const select = {
      id: true,
      name: true,
      description: true,
      datasetId: true,
      definition: true,
      isFavorite: true,
      createdAt: true,
      updatedAt: true,
    }

    const orderBy = [
      { isFavorite: 'desc' as const },
      { updatedAt: 'desc' as const },
    ]

    let reports: any[] = []

    if (search) {
      try {
        reports = await prisma.customReport.findMany({
          where: {
            ...where,
            name: {
              contains: search,
              mode: 'insensitive' as any,
            },
          },
          orderBy,
          select,
        })
      } catch (err: any) {
        console.warn(
          '[SavedReports v12.1] insensitive search failed, falling back to plain contains:',
          err?.message
        )

        reports = await prisma.customReport.findMany({
          where: {
            ...where,
            name: {
              contains: search,
            },
          },
          orderBy,
          select,
        })
      }
    } else {
      reports = await prisma.customReport.findMany({
        where,
        orderBy,
        select,
      })
    }

    const reportsWithLabel = reports.map((r: any) => {
      const dataset = getDataset(r.datasetId)

      const definition = parseDefinition(r.definition)

      const fiscalYearPolicy = definition?.fiscalYearPolicy || null
      const fiscalYearStrategy = dataset?.fiscalYear?.strategy || 'none'

      const {
        definition: _definition,
        ...rest
      } = r

      return {
        ...rest,
        datasetLabel: dataset?.label || r.datasetId,
        datasetIcon: dataset?.icon || 'FileText',
        datasetColor: dataset?.color || 'gray',
        fiscalYearStrategy,
        fiscalYearPolicy,
        allowsFiscalYearFilter: fiscalYearStrategy !== 'none',
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        reports: reportsWithLabel,
        total: reportsWithLabel.length,
      },
    })
  } catch (error: any) {
    console.error('[SavedReports v12.1] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'خطای داخلی سرور',
      },
      { status: 500 }
    )
  }
}