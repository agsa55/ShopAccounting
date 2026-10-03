// ============================================================================
// src/app/api/reports/saved/route.ts — v12.0 ★★★
// ShopAccounting — List Saved Custom Reports API
// ----------------------------------------------------------------------------
// این API لیست گزارش‌های ذخیره‌شده یک tenant را برمی‌گرداند.
//
// ★ قابلیت‌ها:
//   - فقط گزارش‌های tenant فعلی برگردانده می‌شوند
//   - مرتب‌سازی: favoriteها اول، سپس بر اساس تاریخ به‌روزرسانی
//   - فیلتر بر اساس datasetId (اختیاری)
//   - جستجو بر اساس نام (اختیاری)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { extractTenantId, prisma } from '@/lib/reports/report-auth'
import { getDataset } from '@/lib/reports/report-datasets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
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

    // 2. Get optional filters
    const datasetId = req.nextUrl.searchParams.get('datasetId')
    const search = req.nextUrl.searchParams.get('search')
    const onlyFavorites = req.nextUrl.searchParams.get('onlyFavorites') === 'true'

    // 3. Build where clause
    const where: any = { tenantId }

    if (datasetId && datasetId.trim()) {
      where.datasetId = datasetId.trim()
    }

    if (search && search.trim()) {
      where.name = {
        contains: search.trim(),
        mode: 'insensitive',
      }
    }

    if (onlyFavorites) {
      where.isFavorite = true
    }

    // 4. Fetch reports
    const reports = await prisma.customReport.findMany({
      where,
      orderBy: [
        { isFavorite: 'desc' },
        { updatedAt: 'desc' },
      ],
      select: {
        id: true,
        name: true,
        description: true,
        datasetId: true,
        isFavorite: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // 5. Add dataset label
    const reportsWithLabel = reports.map((r) => {
      const dataset = getDataset(r.datasetId)
      return {
        ...r,
        datasetLabel: dataset?.label || r.datasetId,
        datasetIcon: dataset?.icon || 'FileText',
        datasetColor: dataset?.color || 'gray',
      }
    })

    // 6. Return
    return NextResponse.json({
      success: true,
      data: {
        reports: reportsWithLabel,
        total: reportsWithLabel.length,
      },
    })

  } catch (error: any) {
    console.error('[List Saved Reports API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'خطای داخلی سرور',
      },
      { status: 500 }
    )
  }
}