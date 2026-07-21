// ============================================================================
// src/app/api/backup/route.ts — GET/POST/DELETE (v3.1)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.1:
//   ★ تمام query ها با tenantId فیلتر می‌شن
//   ★ هنگام ایجاد پشتیبان، tenantId ذخیره می‌شه
//   ★ هر فروشگاه فقط پشتیبان‌های خودش رو می‌بینه
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromRequest } from '@/lib/jwt'

// ═══════════════════════════════════════════════════════════════
//  GET /api/backup — لیست پشتیبان‌های فروشگاه
// ═══════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز' },
        { status: 401 }
      )
    }

    const tenantId = user.tenantId
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فروشگاه نامشخص' },
        { status: 400 }
      )
    }

    // ★★★ v3.1: فیلتر با tenantId
    const backups = await db.client.backup.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const formattedBackups = backups.map((b: any) => ({
      id: b.id,
      fileName: b.fileName,
      fileSize: b.fileSize,
      recordCount: b.recordCount,
      size: formatFileSize(b.fileSize),
      createdAt: b.createdAt.toISOString(),
    }))

    return NextResponse.json({
      success: true,
      data: { backups: formattedBackups },
    })
  } catch (error: any) {
    console.error('[Backup GET] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری پشتیبان‌ها' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════
//  POST /api/backup — ایجاد پشتیبان جدید
// ═══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز' },
        { status: 401 }
      )
    }

    const tenantId = user.tenantId
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'شناسه فروشگاه نامشخص' },
        { status: 400 }
      )
    }

    const tenantDb = db.client

    // ─── جمع‌آوری داده‌ها برای پشتیبان ───
    const backupData: any = {
      _meta: {
        exportDate: new Date().toISOString(),
        tenantId,
        version: '3.1',
      },
      products: [],
      customers: [],
      invoices: [],
      invoiceItems: [],
      invoicePayments: [],
      installmentPlans: [],
      installmentSchedules: [],
      journalEntries: [],
      categories: [],
      accounts: [],
      storeSettings: [],
    }

    let totalRecords = 0

    try {
      backupData.products = await tenantDb.product.findMany({ where: { tenantId } })
      totalRecords += backupData.products.length
    } catch {}

    try {
      backupData.customers = await tenantDb.customer.findMany({ where: { tenantId } })
      totalRecords += backupData.customers.length
    } catch {}

    try {
      backupData.invoices = await tenantDb.invoice.findMany({ where: { tenantId } })
      totalRecords += backupData.invoices.length

      const invoiceIds = backupData.invoices.map((inv: any) => inv.id)
      if (invoiceIds.length > 0) {
        try {
          backupData.invoiceItems = await tenantDb.invoiceItem.findMany({
            where: { invoiceId: { in: invoiceIds } },
          })
          totalRecords += backupData.invoiceItems.length
        } catch {}
      }
    } catch {}

    try {
      backupData.invoicePayments = await tenantDb.invoicePayment.findMany({ where: { tenantId } })
      totalRecords += backupData.invoicePayments.length
    } catch {}

    try {
      backupData.installmentPlans = await tenantDb.installmentPlan.findMany({ where: { tenantId } })
      totalRecords += backupData.installmentPlans.length

      const planIds = backupData.installmentPlans.map((p: any) => p.id)
      if (planIds.length > 0) {
        try {
          backupData.installmentSchedules = await tenantDb.installmentSchedule.findMany({
            where: { planId: { in: planIds } },
          })
          totalRecords += backupData.installmentSchedules.length
        } catch {}
      }
    } catch {}

    try {
      backupData.journalEntries = await tenantDb.journalEntry.findMany({ where: { tenantId } })
      totalRecords += backupData.journalEntries.length
    } catch {}

    try {
      backupData.categories = await tenantDb.category.findMany({ where: { tenantId } })
      totalRecords += backupData.categories.length
    } catch {}

    try {
      backupData.accounts = await tenantDb.account.findMany({ where: { tenantId } })
      totalRecords += backupData.accounts.length
    } catch {}

    try {
      backupData.storeSettings = await tenantDb.storeSetting.findMany({ where: { tenantId } })
      totalRecords += backupData.storeSettings.length
    } catch {}

    const jsonContent = JSON.stringify(backupData, null, 2)
    const fileSize = Buffer.byteLength(jsonContent, 'utf-8')
    const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)}.json`

    // ★★★ v3.1: ذخیره در دیتابیس با tenantId
    const backup = await db.client.backup.create({
      data: {
        id: `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        fileName,
        fileSize,
        recordCount: totalRecords,
        data: jsonContent,
        tenantId,  // ★★★ این فیلد حتماً باید ست بشه
      },
    })

    console.log('[Backup POST] Backup created', {
      id: backup.id,
      tenantId,
      fileName,
      fileSize,
      recordCount: totalRecords,
    })

    return NextResponse.json({
      success: true,
      data: {
        id: backup.id,
        fileName,
        fileSize,
        recordCount: totalRecords,
        size: formatFileSize(fileSize),
        createdAt: backup.createdAt.toISOString(),
      },
    })
  } catch (error: any) {
    console.error('[Backup POST] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در ایجاد پشتیبان' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/backup — حذف پشتیبان
// ═══════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'دسترسی غیرمجاز' },
        { status: 401 }
      )
    }

    const tenantId = user.tenantId

    // ★★★ v3.1: قبول backupId از query param یا body
    const { searchParams } = new URL(request.url)
    let backupId = searchParams.get('id')

    if (!backupId) {
      try {
        const body = await request.json()
        backupId = body.backupId || body.id
      } catch { /* body وجود نداره */ }
    }

    if (!backupId) {
      return NextResponse.json(
        { success: false, error: 'شناسه پشتیبان الزامی است' },
        { status: 400 }
      )
    }

    // ★★★ v3.1: بررسی tenantId
    const existing = await db.client.backup.findFirst({
      where: { id: backupId, tenantId },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'پشتیبان یافت نشد' },
        { status: 404 }
      )
    }

    await db.client.backup.delete({
      where: { id: backupId },
    })

    console.log('[Backup DELETE] Deleted', { backupId, tenantId })

    return NextResponse.json({
      success: true,
      message: 'پشتیبان با موفقیت حذف شد',
    })
  } catch (error: any) {
    console.error('[Backup DELETE] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در حذف پشتیبان' },
      { status: 500 }
    )
  }
}

// ─── Helper ───
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
