// ============================================================================
// src/lib/tenant-deletion.ts — v11.5.1
// ★ تابع مشترک حذف کامل فروشگاه با تمام اطلاعات مرتبط
// ★ استفاده در:
//    - /api/admin/tenants/[id]/delete (حذف دستی)
//    - /api/admin/tenants/auto-cleanup (حذف خودکار)
// ★ v11.5.1: اضافه شدن InvoiceItems و ترتیب صحیح حذف
// ============================================================================

import { db } from '@/lib/db';

// ★ تابع کمکی برای حذف امن
async function safeDelete(name: string, fn: () => Promise<any>): Promise<number> {
  try {
    const result = await fn();
    const count = result?.count ?? 0;
    if (count > 0) {
      console.log(`[TenantDeletion] ✓ ${name}: ${count} rows`);
    }
    return count;
  } catch (e: any) {
    console.warn(`[TenantDeletion] ⚠ ${name} skip:`, e.message);
    return 0;
  }
}

// ★ نتیجه حذف
export interface DeletionResult {
  success: boolean;
  tenantId: string;
  companyName?: string;
  totalDeleted: number;
  durationMs: number;
  deleteLog: { table: string; count: number }[];
  error?: string;
}

/**
 * ★ حذف کامل فروشگاه با تمام اطلاعات مرتبط
 * @param tenantId شناسه فروشگاه
 * @param reason دلیل حذف (برای لاگ)
 */
export async function deleteTenantCompletely(
  tenantId: string,
  reason: string = 'manual'
): Promise<DeletionResult> {
  const startTime = Date.now();
  const deleteLog: { table: string; count: number }[] = [];

  try {
    console.log(`\n[TenantDeletion] 🗑️ Starting deletion: ${tenantId} (reason: ${reason})`);

    // بررسی وجود فروشگاه
    const tenant = await db.client.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, companyName: true, status: true }
    });

    if (!tenant) {
      return {
        success: false,
        tenantId,
        totalDeleted: 0,
        durationMs: Date.now() - startTime,
        deleteLog,
        error: 'فروشگاه یافت نشد',
      };
    }

    // ═══════════════════════════════════════════════════════════════
    // گروه ۱: فرزندِ عمیق (بدون وابستگی به Invoice)
    // ═══════════════════════════════════════════════════════════════
    deleteLog.push({ table: 'invoicePayment', count: await safeDelete('invoicePayment', () => db.client.invoicePayment.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'installmentSchedule', count: await safeDelete('installmentSchedule', () => db.client.installmentSchedule.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'stockMovement', count: await safeDelete('stockMovement', () => db.client.stockMovement.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'stockLevel', count: await safeDelete('stockLevel', () => db.client.stockLevel.deleteMany({ where: { tenantId } })) });

    // ═══════════════════════════════════════════════════════════════
    // گروه ۱.۵: فرزندِ Invoice (مهم!) - قبل از حذف Invoice
    // این جداول invoiceId دارند و باید قبل از Invoice حذف شوند
    // ═══════════════════════════════════════════════════════════════
    
    // ★ InvoiceItems - آیتم‌های فاکتور (جدولی که فراموش شده بود!)
    deleteLog.push({ 
      table: 'invoiceItem', 
      count: await safeDelete('invoiceItem', () => 
        (db.client as any).invoiceItem?.deleteMany({ where: { tenantId } }) ?? Promise.resolve({ count: 0 })
      ) 
    });

    // CardPayments - پرداخت‌های کارتی وابسته به Invoice
    deleteLog.push({ table: 'cardPayment', count: await safeDelete('cardPayment', () => db.client.cardPayment.deleteMany({ where: { tenantId } })) });

    // OnlinePayments - پرداخت‌های آنلاین وابسته به Invoice
    deleteLog.push({ table: 'onlinePayment', count: await safeDelete('onlinePayment', () => db.client.onlinePayment.deleteMany({ where: { tenantId } })) });

    // Checks - چک‌های وابسته به Invoice
    deleteLog.push({ table: 'check', count: await safeDelete('check', () => db.client.check.deleteMany({ where: { tenantId } })) });

    // InstallmentPlans - قسط‌های وابسته به Invoice
    deleteLog.push({ table: 'installmentPlan', count: await safeDelete('installmentPlan', () => db.client.installmentPlan.deleteMany({ where: { tenantId } })) });

    // ═══════════════════════════════════════════════════════════════
    // گروه ۲: Invoice (بعد از همه فرزندانش)
    // ═══════════════════════════════════════════════════════════════
    deleteLog.push({ table: 'invoice', count: await safeDelete('invoice', () => db.client.invoice.deleteMany({ where: { tenantId } })) });

    // ═══════════════════════════════════════════════════════════════
    // گروه ۳: بقیه جداول عملیاتی
    // ═══════════════════════════════════════════════════════════════
    deleteLog.push({ table: 'journalEntry', count: await safeDelete('journalEntry', () => db.client.journalEntry.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'ticket', count: await safeDelete('ticket', () => db.client.ticket.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'initialBalance', count: await safeDelete('initialBalance', () => db.client.initialBalance.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'fixedAsset', count: await safeDelete('fixedAsset', () => db.client.fixedAsset.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'cashShift', count: await safeDelete('cashShift', () => db.client.cashShift.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'cashMovement', count: await safeDelete('cashMovement', () => db.client.cashMovement.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'recurringJournal', count: await safeDelete('recurringJournal', () => db.client.recurringJournal.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'purchaseInvoice', count: await safeDelete('purchaseInvoice', () => db.client.purchaseInvoice.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'stockCount', count: await safeDelete('stockCount', () => db.client.stockCount.deleteMany({ where: { tenantId } })) });

    // ═══════════════════════════════════════════════════════════════
    // گروه ۴: جداول پایه
    // ═══════════════════════════════════════════════════════════════
    deleteLog.push({ table: 'product', count: await safeDelete('product', () => db.client.product.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'category', count: await safeDelete('category', () => db.client.category.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'unit', count: await safeDelete('unit', () => db.client.unit.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'customer', count: await safeDelete('customer', () => db.client.customer.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'account', count: await safeDelete('account', () => db.client.account.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'warehouse', count: await safeDelete('warehouse', () => db.client.warehouse.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'supplier', count: await safeDelete('supplier', () => db.client.supplier.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'fiscalYear', count: await safeDelete('fiscalYear', () => db.client.fiscalYear.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'branch', count: await safeDelete('branch', () => db.client.branch.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'posDevice', count: await safeDelete('posDevice', () => db.client.posDevice.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'paymentGateway', count: await safeDelete('paymentGateway', () => db.client.paymentGateway.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'storeSetting', count: await safeDelete('storeSetting', () => db.client.storeSetting.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'smsLog', count: await safeDelete('smsLog', () => db.client.smsLog.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'smsSettings', count: await safeDelete('smsSettings', () => db.client.smsSettings.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'moidianSettings', count: await safeDelete('moidianSettings', () => db.client.moidianSettings.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'backup', count: await safeDelete('backup', () => db.client.backup.deleteMany({ where: { tenantId } })) });

    // ═══════════════════════════════════════════════════════════════
    // گروه ۵: کاربران و امنیت
    // ═══════════════════════════════════════════════════════════════
    deleteLog.push({ table: 'storeUser', count: await safeDelete('storeUser', () => db.client.storeUser.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'portalUsers', count: await safeDelete('portalUsers', () => db.client.portalUsers.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'userLookups', count: await safeDelete('userLookups', () => db.client.userLookups.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'otpCode', count: await safeDelete('otpCode', () => db.client.otpCode.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'auditLogs', count: await safeDelete('auditLogs', () => db.client.auditLogs.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'subscriptionPayments', count: await safeDelete('subscriptionPayments', () => db.client.subscriptionPayments.deleteMany({ where: { tenantId } })) });
    deleteLog.push({ table: 'subscriptions', count: await safeDelete('subscriptions', () => db.client.subscriptions.deleteMany({ where: { tenantId } })) });

    // ═══════════════════════════════════════════════════════════════
    // گروه ۶: IdentityRegistry
    // ═══════════════════════════════════════════════════════════════
    deleteLog.push({ table: 'identityRegistry', count: await safeDelete('identityRegistry', () => db.client.identityRegistry.deleteMany({ where: { tenantId } })) });

    // ═══════════════════════════════════════════════════════════════
    // گروه ۷: حذف خود فروشگاه
    // ═══════════════════════════════════════════════════════════════
    try {
      await db.client.tenant.delete({ where: { id: tenantId } });
      deleteLog.push({ table: 'tenant', count: 1 });
      console.log(`[TenantDeletion] ✓ tenant: 1 row`);
    } catch (e: any) {
      console.error('[TenantDeletion] ❌ Tenant delete failed:', e.message);
      return {
        success: false,
        tenantId,
        companyName: tenant.companyName,
        totalDeleted: deleteLog.reduce((sum, item) => sum + item.count, 0),
        durationMs: Date.now() - startTime,
        deleteLog,
        error: 'خطا در حذف فروشگاه: ' + e.message,
      };
    }

    const durationMs = Date.now() - startTime;
    const totalDeleted = deleteLog.reduce((sum, item) => sum + item.count, 0);

    console.log(`[TenantDeletion] ✅ Deleted: ${tenant.companyName}`);
    console.log(`[TenantDeletion] 📊 Total: ${totalDeleted} records in ${durationMs}ms`);

    return {
      success: true,
      tenantId,
      companyName: tenant.companyName,
      totalDeleted,
      durationMs,
      deleteLog: deleteLog.filter(l => l.count > 0),
    };
  } catch (error: any) {
    console.error(`[TenantDeletion] ❌ Error:`, error.message);
    return {
      success: false,
      tenantId,
      totalDeleted: deleteLog.reduce((sum, item) => sum + item.count, 0),
      durationMs: Date.now() - startTime,
      deleteLog,
      error: error.message,
    };
  }
}

/**
 * ★ پیدا کردن فروشگاه‌های کاندید حذف خودکار
 * @param daysWithoutActivity تعداد روز بدون فعالیت (پیش‌فرض: ۷)
 */
export async function findAutoDeleteCandidates(
  daysWithoutActivity: number = 7
): Promise<any[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysWithoutActivity);

  console.log(`[TenantDeletion] 🔍 Finding candidates for auto-delete:`);
  console.log(`[TenantDeletion]    Cutoff date: ${cutoffDate.toISOString()}`);
  console.log(`[TenantDeletion]    Days without activity: ${daysWithoutActivity}`);

  const candidates = await db.client.tenant.findMany({
    where: {
      lastActivityAt: {
        lt: cutoffDate,
      },
      isPaid: false,
      billingCycle: {
        not: 'lifetime',
      },
      isLocked: false,
      status: {
        in: ['active', 'trial'],
      },
    },
    select: {
      id: true,
      companyName: true,
      subDomain: true,
      ownerMobile: true,
      planName: true,
      createdAt: true,
      lastActivityAt: true,
      trialEndAt: true,
      _count: {
        select: {
          Products: true,
          Customers: true,
          Invoices: true,
          StoreUsers: true,
        }
      }
    },
    orderBy: {
      lastActivityAt: 'asc',
    }
  });

  console.log(`[TenantDeletion] 📊 Found ${candidates.length} candidates`);

  return candidates;
}