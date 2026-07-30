// ============================================================================
// src/app/api/backup/restore/route.ts — بازیابی بکاپ
// ============================================================================
// ⚠️ این API داده‌های فعلی Tenant را پاک کرده و داده‌های بکاپ را جایگزین می‌کند
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantIsolation } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'
import { gunzip } from 'zlib'
import { promisify } from 'util'

const gunzipAsync = promisify(gunzip)

export const POST = withTenantIsolation(
  async (req: NextRequest, ctx: any, tenant: any) => {
    try {
      const tenantId = tenant.tenantId
      const { backupId } = await req.json()

      if (!backupId) {
        return NextResponse.json(
          { success: false, error: 'شناسه بکاپ الزامی است' },
          { status: 400 }
        )
      }

      // ۱. دریافت بکاپ
      const backup = await db.client.backup.findFirst({
        where: { id: backupId, tenantId },
      })

      if (!backup || !backup.data) {
        return NextResponse.json(
          { success: false, error: 'بکاپ یافت نشد' },
          { status: 404 }
        )
      }

      // ۲. باز کردن فشرده‌سازی
      const buffer = Buffer.from(backup.data, 'base64')
      const decompressed = await gunzipAsync(buffer)
      const backupData = JSON.parse(decompressed.toString('utf8'))

      // ۳. پاک کردن داده‌های فعلی Tenant (به ترتیب معکوس وابستگی)
      console.log(`[Restore] Clearing current data for tenant: ${tenantId}`)
      
      const clearOrder = [...TABLES_TO_BACKUP].reverse()
      for (const tableName of clearOrder) {
        try {
          // @ts-ignore
          const model = db.client[tableName.charAt(0).toLowerCase() + tableName.slice(1)]
          if (model) {
            await model.deleteMany({ where: { tenantId } })
          }
        } catch (err: any) {
          console.warn(`[Restore] Error clearing ${tableName}:`, err.message)
        }
      }

      // ۴. درج داده‌های بکاپ (به ترتیب وابستگی)
      console.log(`[Restore] Restoring data from backup...`)
      let restoredCount = 0

      for (const tableName of TABLES_TO_BACKUP) {
        const records = backupData[tableName]
        if (!records || records.length === 0) continue

        try {
          // @ts-ignore
          const model = db.client[tableName.charAt(0).toLowerCase() + tableName.slice(1)]
          if (!model) continue

          // حذف tenantId از داده‌ها (چون در create مشخص می‌کنیم) و درج دسته‌ای
          const cleanedRecords = records.map((r: any) => {
            const { tenantId: _, ...rest } = r
            return { ...rest, tenantId }
          })

          // درج دسته‌ای در گروه‌های ۱۰۰ تایی
          for (let i = 0; i < cleanedRecords.length; i += 100) {
            const batch = cleanedRecords.slice(i, i + 100)
            // @ts-ignore
            await model.createMany({ data: batch, skipDuplicates: true })
          }

          restoredCount += records.length
          console.log(`[Restore] ${tableName}: ${records.length} records restored`)
        } catch (err: any) {
          console.error(`[Restore] Error restoring ${tableName}:`, err.message)
        }
      }

      console.log(`[Restore] ✅ Restore completed: ${restoredCount} records`)

      return NextResponse.json({
        success: true,
        data: { restoredCount },
      })
    } catch (error: any) {
      console.error('[Restore] Error:', error)
      return NextResponse.json(
        { success: false, error: 'خطا در بازیابی: ' + error.message },
        { status: 500 }
      )
    }
  }
)

// لیست جداول (همانند backup/route.ts)
const TABLES_TO_BACKUP = [
  'StoreSetting', 'SmsSettings', 'MoidianSettings', 'PaymentGateway', 'PosDevice',
  'Branch', 'Warehouse', 'Category', 'Unit', 'Account',
  'Customer', 'Supplier', 'Product', 'StockLevel',
  'FiscalYear', 'JournalEntry', 'JournalEntryLine', 'InitialBalance', 'FixedAsset',
  'Invoice', 'InvoiceItem', 'InvoicePayment', 'InstallmentPlan', 'InstallmentSchedule',
  'PurchaseInvoice', 'PurchaseInvoiceItem',
  'StockMovement', 'StockCount', 'StockCountItem',
  'Check', 'CardPayment', 'OnlinePayment',
  'StoreUser', 'Ticket', 'TicketMessage', 'SmsLog', 'RecurringJournal', 'AuditLog',
] as const