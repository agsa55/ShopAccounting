// ============================================================================
// src/lib/sync-opening-balance.ts — v11.0
// ★ همگام‌سازی خودکار سند افتتاحیه با موجودی کالاها
// ★ هر بار که کالایی با موجودی اولیه ثبت یا فاکتور خرید ثبت می‌شود،
//   ارزش موجودی کالا در سند افتتاحیه به‌روزرسانی می‌شود
// ============================================================================

/**
 * همگام‌سازی ارزش موجودی کالاها با سند افتتاحیه
 * 
 * این تابع:
 * 1. ارزش کل موجودی کالاها را محاسبه می‌کند (Σ currentStock × purchasePrice)
 * 2. آیتم inventory در InitialBalance را آپدیت یا ایجاد می‌کند
 * 3. فقط اگر سند posted نباشد (draft باشد) کار می‌کند
 * 4. فقط برای سال مالی فعال کار می‌کند
 * 
 * @param tenantId - شناسه فروشگاه
 * @param tenantDb - دیتابیس tenant (برای tenant isolation)
 */
export async function syncOpeningBalanceWithInventory(
  tenantId: string,
  tenantDb: any
): Promise<{
  success: boolean
  message: string
  totalValue?: number
  updated?: boolean
}> {
  try {
    console.log('[SyncOpening] 🔄 Starting sync for tenant:', tenantId)

    // ═══════════════════════════════════════════════════════════════
    // ۱. چک: آیا سند افتتاحیه posted است؟
    // ═══════════════════════════════════════════════════════════════
    const postedInventory = await tenantDb.initialBalance.findFirst({
      where: {
        tenantId,
        type: 'inventory',
        isPosted: true,
      },
    })

    if (postedInventory) {
      console.log('[SyncOpening] ⚠️ Inventory balance already posted - skipping auto-update')
      return {
        success: true,
        message: 'سند افتتاحیه قبلاً صادر شده - به‌روزرسانی خودکار غیرفعال',
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ۲. پیدا کردن سال مالی فعال (اختیاری)
    // ═══════════════════════════════════════════════════════════════
    const activeFiscalYear = await tenantDb.fiscalYear.findFirst({
      where: {
        tenantId,
        isActive: true,
        isClosed: false,
      },
      orderBy: { startDate: 'desc' },
    })

    if (!activeFiscalYear) {
      console.log('[SyncOpening] ⚠️ No active fiscal year found - skipping sync')
      return {
        success: true,
        message: 'سال مالی فعال یافت نشد',
      }
    }

    console.log('[SyncOpening] ✅ Active fiscal year:', activeFiscalYear.name)

    // ═══════════════════════════════════════════════════════════════
    // ۳. محاسبه ارزش کل موجودی کالاها
    // ═══════════════════════════════════════════════════════════════
    const productsWithStock = await tenantDb.product.findMany({
      where: {
        tenantId,
        isActive: true,
        currentStock: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        currentStock: true,
        purchasePrice: true,
      },
    })

    const totalValue = productsWithStock.reduce((sum: number, p: any) => {
      const stock = Number(p.currentStock) || 0
      const price = Number(p.purchasePrice) || 0
      return sum + (stock * price)
    }, 0)

    console.log('[SyncOpening] 📊 Calculated inventory value:', {
      productsCount: productsWithStock.length,
      totalValue,
    })

    // ═══════════════════════════════════════════════════════════════
    // ۴. پیدا کردن آیتم inventory موجود (draft)
    // ═══════════════════════════════════════════════════════════════
    const existingInventory = await tenantDb.initialBalance.findFirst({
      where: {
        tenantId,
        type: 'inventory',
        isPosted: false,
      },
    })

    // ═══════════════════════════════════════════════════════════════
    // ۵. آپدیت یا ایجاد آیتم inventory
    // ═══════════════════════════════════════════════════════════════
    if (existingInventory) {
      // آیتم موجود است - فقط مقدار را آپدیت کن
      const oldAmount = Number(existingInventory.amount) || 0
      
      if (Math.abs(oldAmount - totalValue) < 0.01) {
        console.log('[SyncOpening] ℹ️ No change in inventory value - skipping update')
        return {
          success: true,
          message: 'ارزش موجودی تغییر نکرده',
          totalValue,
          updated: false,
        }
      }

      await tenantDb.initialBalance.update({
        where: { id: existingInventory.id },
        data: {
          amount: totalValue,
          description: `ارزش ${productsWithStock.length} کالای موجود در انبار (محاسبه خودکار - ${new Date().toLocaleDateString('fa-IR')})`,
        },
      })

      console.log('[SyncOpening] ✅ Updated existing inventory balance:', {
        oldAmount,
        newAmount: totalValue,
        difference: totalValue - oldAmount,
      })

      return {
        success: true,
        message: 'ارزش موجودی کالا در سند افتتاحیه به‌روزرسانی شد',
        totalValue,
        updated: true,
      }
    } else if (totalValue > 0) {
      // آیتم وجود ندارد و ارزش > 0 است - ایجاد کن
      await tenantDb.initialBalance.create({
        data: {
          tenantId,
          type: 'inventory',
          title: '📦 موجودی کالا (محاسبه خودکار)',
          amount: totalValue,
          description: `ارزش ${productsWithStock.length} کالای موجود در انبار`,
          isPosted: false,
        },
      })

      console.log('[SyncOpening] ✅ Created new inventory balance:', {
        totalValue,
        productsCount: productsWithStock.length,
      })

      return {
        success: true,
        message: 'آیتم موجودی کالا در سند افتتاحیه ایجاد شد',
        totalValue,
        updated: true,
      }
    } else if (existingInventory && totalValue === 0) {
      // همه کالاها موجودی صفر شدند - آیتم را حذف کن
      await tenantDb.initialBalance.delete({
        where: { id: existingInventory.id },
      })

      console.log('[SyncOpening] 🗑️ Deleted empty inventory balance')

      return {
        success: true,
        message: 'آیتم موجودی کالا حذف شد (همه کالاها موجودی صفر)',
        totalValue: 0,
        updated: true,
      }
    }

    console.log('[SyncOpening] ℹ️ No action needed')
    return {
      success: true,
      message: 'نیازی به به‌روزرسانی نیست',
      totalValue,
      updated: false,
    }
  } catch (error: any) {
    console.error('[SyncOpening] ❌ Error:', error?.message)
    console.error('[SyncOpening] ❌ Stack:', error?.stack)
    
    return {
      success: false,
      message: `خطا در همگام‌سازی: ${error?.message || 'نامشخص'}`,
    }
  }
}