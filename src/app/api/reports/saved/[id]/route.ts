// ============================================================================
// src/app/api/reports/saved/[id]/route.ts — v12.0 ★★★
// ShopAccounting — Single Saved Custom Report API
// ----------------------------------------------------------------------------
// این API عملیات زیر را روی یک گزارش ذخیره‌شده انجام می‌دهد:
//
//   GET    → خواندن جزئیات کامل گزارش (شامل definition)
//   PATCH  → به‌روزرسانی جزئی (مثلاً favorite، نام، توضیحات)
//   DELETE → حذف گزارش
//
// ★ امنیت:
//   - فقط گزارش‌های متعلق به tenant فعلی قابل دسترسی هستند
//   - هیچ‌گاه گزارش tenant دیگر برگردانده نمی‌شود
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { extractTenantId, prisma } from '@/lib/reports/report-auth'
import { getDataset } from '@/lib/reports/report-datasets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ═══════════════════════════════════════════════════════════════
//  GET: Get single report
// ═══════════════════════════════════════════════════════════════

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'شناسه گزارش الزامی است.',
        },
        { status: 400 }
      )
    }

    const report = await prisma.customReport.findFirst({
      where: {
        id,
        tenantId,
      },
    })

    if (!report) {
      return NextResponse.json(
        {
          success: false,
          error: 'گزارش یافت نشد یا به این فروشگاه تعلق ندارد.',
        },
        { status: 404 }
      )
    }

    const dataset = getDataset(report.datasetId)

    return NextResponse.json({
      success: true,
      data: {
        ...report,
        datasetLabel: dataset?.label || report.datasetId,
        datasetIcon: dataset?.icon || 'FileText',
        datasetColor: dataset?.color || 'gray',
      },
    })

  } catch (error: any) {
    console.error('[Get Report API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'خطای داخلی سرور',
      },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════
//  PATCH: Partial update
// ═══════════════════════════════════════════════════════════════

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'شناسه گزارش الزامی است.',
        },
        { status: 400 }
      )
    }

    // Check ownership
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

    // Parse body
    const body = await req.json().catch(() => ({}))
    const { name, description, isFavorite } = body

    // Build update data
    const updateData: any = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'نام گزارش نامعتبر است.',
          },
          { status: 400 }
        )
      }
      updateData.name = name.trim().slice(0, 200)
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== 'string') {
        return NextResponse.json(
          {
            success: false,
            error: 'توضیحات گزارش نامعتبر است.',
          },
          { status: 400 }
        )
      }
      updateData.description = description === null ? null : description.trim().slice(0, 500)
    }

    if (isFavorite !== undefined) {
      if (typeof isFavorite !== 'boolean') {
        return NextResponse.json(
          {
            success: false,
            error: 'isFavorite باید boolean باشد.',
          },
          { status: 400 }
        )
      }
      updateData.isFavorite = isFavorite
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'هیچ فیلدی برای به‌روزرسانی ارسال نشده است.',
        },
        { status: 400 }
      )
    }

    const updated = await prisma.customReport.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'گزارش با موفقیت به‌روزرسانی شد.',
    })

  } catch (error: any) {
    console.error('[Update Report API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'خطای داخلی سرور',
      },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════
//  DELETE: Remove report
// ═══════════════════════════════════════════════════════════════

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: 'شناسه گزارش الزامی است.',
        },
        { status: 400 }
      )
    }

    // Check ownership
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

    await prisma.customReport.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: 'گزارش با موفقیت حذف شد.',
    })

  } catch (error: any) {
    console.error('[Delete Report API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'خطای داخلی سرور',
      },
      { status: 500 }
    )
  }
}