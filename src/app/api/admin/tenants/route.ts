import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // دریافت لیست فروشگاه‌ها به همراه آمار مرتبط
    const tenants = await db.client.tenant.findMany({
      select: {
        id: true,
        companyName: true,
        subDomain: true,
        status: true,
        planName: true,
        billingCycle: true,
        expiresAt: true,
        createdAt: true,
        _count: {
          select: {
            StoreUsers: true,
            Tickets: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // محاسبه روزهای باقی‌مانده برای هر فروشگاه
    const formattedTenants = tenants.map(t => {
      let remainingDays = 0;
      if (t.billingCycle === 'lifetime' || !t.expiresAt) {
        remainingDays = 9999; // مادام‌العمر
      } else {
        const now = new Date();
        const expires = new Date(t.expiresAt);
        const diffTime = expires.getTime() - now.getTime();
        remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      return {
        ...t,
        remainingDays: remainingDays < 0 ? 0 : remainingDays,
        isExpired: remainingDays <= 0 && t.billingCycle !== 'lifetime',
      };
    });

    return NextResponse.json({ success: true, data: formattedTenants });
  } catch (error) {
    console.error('[Admin Tenants GET] Error:', error);
    return NextResponse.json({ success: false, error: 'خطای داخلی سرور' }, { status: 500 });
  }
}