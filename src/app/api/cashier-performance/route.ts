// ============================================================================
// src/app/api/cashier-performance/route.ts — v11.6.3
// ★ API گزارش عملکرد صندوق‌داران
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation';
import { db } from '@/lib/db';

export const GET = withTenantAndPermission('pos')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId') || tenant.tenantId;
    const period = searchParams.get('period') || 'today'; // today | week | month
    
    let startDate: Date;
    const endDate = new Date();

    if (period === 'week') {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      // امروز
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    }

    // دریافت همه تراکنش‌های دوره
    const movements = await db.client.cashMovement.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        cashier: {
          select: { id: true, username: true, mobile: true },
        },
      },
    });

    // گروه‌بندی بر اساس صندوق‌دار
    const cashierStats: Record<string, any> = {};

    for (const m of movements) {
      const cashierId = m.cashierId || 'unknown';
      
      if (!cashierStats[cashierId]) {
        cashierStats[cashierId] = {
          cashierId,
          cashierName: m.cashier?.username || 'نامشخص',
          cashierMobile: m.cashier?.mobile || '',
          totalSales: 0,
          totalPurchases: 0,
          totalServices: 0,
          totalInstallments: 0,
          totalChecks: 0,
          totalWithdrawals: 0,
          totalDeposits: 0,
          totalExpenses: 0,
          totalCashIn: 0,
          totalCashOut: 0,
          transactionCount: 0,
        };
      }

      const stats = cashierStats[cashierId];
      const amount = Number(m.amount);

      stats.transactionCount++;

      // بر اساس نوع تراکنش
     // بر اساس نوع تراکنش
if (m.transactionType === 'sale') {
  stats.totalSales += amount;
}
else if (m.transactionType === 'purchase') {
  stats.totalPurchases += amount;
}
// ★ v11.6.7: خدمات و تعمیرات هر دو در دسته "خدمات"
else if (['service', 'repair'].includes(m.transactionType)) {
  stats.totalServices += amount;
}
else if (m.transactionType === 'installment') {
  stats.totalInstallments += amount;
}
else if (m.transactionType === 'check') {
  stats.totalChecks += amount;
}
else if (m.transactionType === 'withdrawal') {
  stats.totalWithdrawals += amount;
}
else if (m.transactionType === 'deposit') {
  stats.totalDeposits += amount;
}
else if (m.transactionType === 'expense') {
  stats.totalExpenses += amount;
}

      // بر اساس جهت
      if (m.type === 'in') stats.totalCashIn += amount;
      else if (m.type === 'out') stats.totalCashOut += amount;
    }

    // تبدیل به آرایه و مرتب‌سازی
    const result = Object.values(cashierStats).sort(
      (a: any, b: any) => b.totalSales - a.totalSales
    );

    return NextResponse.json({
      success: true,
      data: result,
      period: {
        type: period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[CashierPerformance] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'خطا در دریافت گزارش عملکرد' },
      { status: 500 }
    );
  }
});