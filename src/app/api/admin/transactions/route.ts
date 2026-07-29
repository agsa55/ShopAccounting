import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
const transactions = await db.client.subscriptionPayments.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        Subscriptions: {
          include: {
            Tenant: {
              select: {
                companyName: true,
                subDomain: true,
                planName: true,
              }
            },
            Plans: {
              select: {
                nameFa: true,
                price: true,
              }
            }
          }
        }
      }
    });

    const formatted = transactions.map(t => ({
      id: t.id,
      tenantName: t.Subscriptions?.Tenant?.companyName || 'نامشخص',
      tenantSubdomain: t.Subscriptions?.Tenant?.subDomain || '',
      planName: t.Subscriptions?.Plans?.nameFa || t.Subscriptions?.Tenant?.planName || '',
      amount: t.amount,
      paymentMethod: t.paymentMethod || 'نامشخص',
      paymentRef: t.paymentRef,
      status: t.status,
      isPaid: t.isPaid,
      paidAt: t.paidAt,
      createdAt: t.createdAt,
    }));

    // محاسبه آمار
    const totalRevenue = formatted.filter(t => t.isPaid).reduce((sum, t) => sum + (t.amount || 0), 0);
    const paidCount = formatted.filter(t => t.isPaid).length;

    return NextResponse.json({ 
      success: true, 
      data: formatted,
      stats: {
        totalRevenue,
        paidCount,
        totalCount: formatted.length
      }
    });
  } catch (error: any) {
    console.error('[Admin Transactions GET] Error:', error);
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری تراکنش‌ها' }, { status: 500 });
  }
}