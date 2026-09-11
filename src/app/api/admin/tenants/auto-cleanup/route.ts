// ============================================================================
// src/app/api/admin/tenants/auto-cleanup/route.ts — v11.5
// ★ API حذف خودکار فروشگاه‌های بدون استفاده
// ★ GET: پیش‌نمایش فروشگاه‌های کاندید حذف (حذف نمی‌کند)
// ★ POST: اجرای حذف خودکار (با امکان حالت تست)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { 
  deleteTenantCompletely, 
  findAutoDeleteCandidates 
} from '@/lib/tenant-deletion';

// ★ تنظیمات پیش‌فرض
const DEFAULT_DAYS_WITHOUT_ACTIVITY = 7;

// ═══════════════════════════════════════════════════════════════
// GET: پیش‌نمایش فروشگاه‌های کاندید حذف
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // خواندن پارامترهای کوئری
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || String(DEFAULT_DAYS_WITHOUT_ACTIVITY), 10);
    
    console.log(`\n[AutoCleanup] 📥 GET request (preview mode)`);
    console.log(`[AutoCleanup] Days without activity: ${days}`);

    // پیدا کردن کاندیدها
    const candidates = await findAutoDeleteCandidates(days);

    // محاسبه روزهای بدون فعالیت برای هر فروشگاه
    const now = new Date();
    const enrichedCandidates = candidates.map(t => {
      const daysWithoutActivity = t.lastActivityAt 
        ? Math.floor((now.getTime() - new Date(t.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      
      return {
        ...t,
        daysWithoutActivity,
        lastActivityAt: t.lastActivityAt?.toISOString() || null,
        createdAt: t.createdAt?.toISOString() || null,
        trialEndAt: t.trialEndAt?.toISOString() || null,
      };
    });

    // آمار کلی
    const stats = {
      totalCandidates: candidates.length,
      totalRecordsAtRisk: candidates.reduce((sum, t) => {
        return sum + 
          (t._count?.Products || 0) + 
          (t._count?.Customers || 0) + 
          (t._count?.Invoices || 0);
      }, 0),
      oldestLastActivity: candidates.length > 0 
        ? candidates[0].lastActivityAt?.toISOString() 
        : null,
    };

    const durationMs = Date.now() - startTime;
    console.log(`[AutoCleanup] ✅ Preview: ${candidates.length} candidates in ${durationMs}ms`);

    return NextResponse.json({
      success: true,
      data: enrichedCandidates,
      stats,
      config: {
        daysWithoutActivity: days,
        autoDeleteEnabled: process.env.AUTO_DELETE_ENABLED === 'true',
      },
    });
  } catch (error: any) {
    console.error('[AutoCleanup] ❌ GET error:', error.message);
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور: ' + error.message },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// POST: اجرای حذف خودکار
// ═══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const results: any[] = [];
  
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // اگر body خالی بود، از مقادیر پیش‌فرض استفاده کن
    }

    const days = body.days || DEFAULT_DAYS_WITHOUT_ACTIVITY;
    const dryRun = body.dryRun !== false; // پیش‌فرض: حالت تست
    
    console.log(`\n[AutoCleanup] 📥 POST request`);
    console.log(`[AutoCleanup] Days without activity: ${days}`);
    console.log(`[AutoCleanup] Mode: ${dryRun ? '🧪 DRY RUN (test)' : '⚠️ REAL DELETE'}`);

    // پیدا کردن کاندیدها
    const candidates = await findAutoDeleteCandidates(days);

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'هیچ فروشگاهی برای حذف خودکار یافت نشد',
        data: {
          totalProcessed: 0,
          successful: 0,
          failed: 0,
          results: [],
        },
      });
    }

    // حالت تست: فقط لیست را برگردان
    if (dryRun) {
      const durationMs = Date.now() - startTime;
      console.log(`[AutoCleanup] 🧪 DRY RUN completed in ${durationMs}ms`);
      
      return NextResponse.json({
        success: true,
        message: `حالت تست: ${candidates.length} فروشگاه کاندید حذف شناسایی شدند (حذف واقعی انجام نشد)`,
        data: {
          dryRun: true,
          totalProcessed: candidates.length,
          candidates: candidates.map(t => ({
            id: t.id,
            companyName: t.companyName,
            subDomain: t.subDomain,
            lastActivityAt: t.lastActivityAt?.toISOString(),
            productsCount: t._count?.Products || 0,
            customersCount: t._count?.Customers || 0,
            invoicesCount: t._count?.Invoices || 0,
          })),
        },
      });
    }

    // حالت واقعی: حذف کامل
    console.log(`[AutoCleanup] ⚠️ Starting REAL deletion of ${candidates.length} tenants...`);

    for (const candidate of candidates) {
      console.log(`[AutoCleanup] 🗑️ Deleting: ${candidate.companyName} (${candidate.id})`);
      
   try {
  const result = await deleteTenantCompletely(candidate.id, 'auto-cleanup');
  results.push({
    ...result,                           // ← اول spread
    companyName: candidate.companyName,  // ← سپس فیلدهای اضافی
  });
        
        if (result.success) {
          console.log(`[AutoCleanup] ✅ Deleted: ${candidate.companyName}`);
        } else {
          console.error(`[AutoCleanup] ❌ Failed: ${candidate.companyName} - ${result.error}`);
        }
      } catch (error: any) {
        console.error(`[AutoCleanup] ❌ Error deleting ${candidate.id}:`, error.message);
        results.push({
          tenantId: candidate.id,
          companyName: candidate.companyName,
          success: false,
          error: error.message,
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    const durationMs = Date.now() - startTime;

    console.log(`\n[AutoCleanup] ✅ Completed in ${durationMs}ms`);
    console.log(`[AutoCleanup] 📊 Successful: ${successful}, Failed: ${failed}`);

    return NextResponse.json({
      success: true,
      message: `حذف خودکار انجام شد: ${successful} موفق، ${failed} ناموفق`,
      data: {
        dryRun: false,
        totalProcessed: results.length,
        successful,
        failed,
        durationMs,
        results: results.filter(r => r.success).map(r => ({
          tenantId: r.tenantId,
          companyName: r.companyName,
          totalDeleted: r.totalDeleted,
          durationMs: r.durationMs,
        })),
        failures: results.filter(r => !r.success).map(r => ({
          tenantId: r.tenantId,
          companyName: r.companyName,
          error: r.error,
        })),
      },
    });
  } catch (error: any) {
    console.error('[AutoCleanup] ❌ POST error:', error.message);
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور: ' + error.message },
      { status: 500 }
    );
  }
}