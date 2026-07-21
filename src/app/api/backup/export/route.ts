// ============================================================================
// src/app/api/backup/export/route.ts — GET /api/backup/export (v3.1)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★★★ v3.1: خروجی JSON از داده‌های فروشگاه (فیلتر شده با tenantId)
//   ★ هر فروشگاه فقط اطلاعات خودش رو دانلود می‌کنه
//   ★ خروجی به‌صورت فایل JSON در کامپیوتر کاربر ذخیره می‌شه
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromRequest } from '@/lib/jwt'

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

    const tenantDb = db.client

    // ─── جمع‌آوری تمام داده‌های فروشگاه ───
    const backup: any = {
      _meta: {
        exportDate: new Date().toISOString(),
        tenantId,
        version: '3.1',
        exportedBy: user.username,
      },
      tenant: null,
      storeSettings: [],
      products: [],
      categories: [],
      units: [],
      customers: [],
      invoices: [],
      invoiceItems: [],
      invoicePayments: [],
      installmentPlans: [],
      installmentSchedules: [],
      journalEntries: [],
      journalEntryLines: [],
      accounts: [],
      storeUsers: [],
      paymentGateways: [],
      posDevices: [],
    }

    // ★ Tenant info
    try {
      backup.tenant = await tenantDb.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true, subDomain: true, companyName: true, ownerName: true,
          ownerMobile: true, ownerEmail: true, address: true,
          registrationNumber: true, logoUrl: true, planName: true,
          billingCycle: true, expiresAt: true, status: true,
        },
      })
    } catch (err: any) {
      console.warn('[Backup] Tenant fetch failed:', err?.message)
    }

    // ★ Store Settings
    try {
      backup.storeSettings = await tenantDb.storeSetting.findMany({ where: { tenantId } })
    } catch {}

    // ★ Categories
    try {
      backup.categories = await tenantDb.category.findMany({ where: { tenantId } })
    } catch {}

    // ★ Units
    try {
      backup.units = await tenantDb.unit.findMany({ where: { tenantId } })
    } catch {}

    // ★ Products
    try {
      backup.products = await tenantDb.product.findMany({ where: { tenantId } })
    } catch {}

    // ★ Customers
    try {
      backup.customers = await tenantDb.customer.findMany({ where: { tenantId } })
    } catch {}

    // ★ Invoices + Items + Payments
    try {
      backup.invoices = await tenantDb.invoice.findMany({ where: { tenantId } })

      // ★ Get items for all invoices
      const invoiceIds = backup.invoices.map((inv: any) => inv.id)
      if (invoiceIds.length > 0) {
        try {
          backup.invoiceItems = await tenantDb.invoiceItem.findMany({
            where: { invoiceId: { in: invoiceIds } },
          })
        } catch {}
      }

      // ★ Get payments
      try {
        backup.invoicePayments = await tenantDb.invoicePayment.findMany({ where: { tenantId } })
      } catch {}
    } catch {}

    // ★ Installment Plans + Schedules
    try {
      backup.installmentPlans = await tenantDb.installmentPlan.findMany({ where: { tenantId } })

      const planIds = backup.installmentPlans.map((p: any) => p.id)
      if (planIds.length > 0) {
        try {
          backup.installmentSchedules = await tenantDb.installmentSchedule.findMany({
            where: { planId: { in: planIds } },
          })
        } catch {}
      }
    } catch {}

    // ★ Journal Entries + Lines
    try {
      backup.journalEntries = await tenantDb.journalEntry.findMany({ where: { tenantId } })

      const jeIds = backup.journalEntries.map((je: any) => je.id)
      if (jeIds.length > 0) {
        try {
          backup.journalEntryLines = await tenantDb.journalEntryLine.findMany({
            where: { journalEntryId: { in: jeIds } },
          })
        } catch {}
      }
    } catch {}

    // ★ Accounts
    try {
      backup.accounts = await tenantDb.account.findMany({ where: { tenantId } })
    } catch {}

    // ★ Store Users (بدون رمز عبور)
    try {
      backup.storeUsers = await tenantDb.storeUser.findMany({
        where: { tenantId },
        select: {
          id: true, username: true, role: true, mobile: true,
          permissions: true, isActive: true, storeId: true, storeName: true,
          lastLoginAt: true, createdAt: true,
          // ★ password intentionally excluded
        },
      })
    } catch {}

    // ★ Payment Gateways
    try {
      backup.paymentGateways = await tenantDb.paymentGateway.findMany({ where: { tenantId } })
    } catch {}

    // ★ POS Devices
    try {
      backup.posDevices = await tenantDb.posDevice.findMany({ where: { tenantId } })
    } catch {}

    // ─── محاسبه آمار ───
    const stats = {
      products: backup.products.length,
      customers: backup.customers.length,
      invoices: backup.invoices.length,
      invoiceItems: backup.invoiceItems.length,
      installmentPlans: backup.installmentPlans.length,
      journalEntries: backup.journalEntries.length,
      categories: backup.categories.length,
      storeUsers: backup.storeUsers.length,
    }

    console.log('[Backup/Export] Backup generated', { tenantId, stats })

    // ─── ساخت فایل JSON برای دانلود ───
    const jsonContent = JSON.stringify(backup, null, 2)
    const fileName = `backup-${tenantId.substring(0, 12)}-${new Date().toISOString().split('T')[0]}.json`

    return new NextResponse(jsonContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': Buffer.byteLength(jsonContent, 'utf-8').toString(),
      },
    })
  } catch (error: any) {
    console.error('[Backup/Export] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در ایجاد پشتیبان' },
      { status: 500 }
    )
  }
}
