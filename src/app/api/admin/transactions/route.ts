import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ★ v11.3: parse کردن paymentMethod برای استخراج tier و cycle
function parsePaymentMethod(method: string | null | undefined): {
  gateway: string;
  tierName: string;
  billingCycle: string;
} {
  const methodStr = method || '';
  const gatewayMatch = methodStr.match(/^([a-z]+):/i);
  const tierMatch = methodStr.match(/tier=([a-z]+)/i);
  const cycleMatch = methodStr.match(/cycle=(monthly|annual|lifetime)/i);

  return {
    gateway: gatewayMatch ? gatewayMatch[1].toLowerCase() : 'unknown',
    tierName: tierMatch ? tierMatch[1].toLowerCase() : '',
    billingCycle: cycleMatch ? cycleMatch[1].toLowerCase() : '',
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // ── صفحه‌بندی ──────────────────────────────────
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));
    const skip = (page - 1) * pageSize;

    // ── فیلترها (★ v11.3: حذف cycleFilter) ─────────
    const status = searchParams.get('status');
    const planFilter = searchParams.get('plan');
    const timeFilter = searchParams.get('time');
    const search = searchParams.get('search');

    // ── ساخت where clause ────────────────────────────
    const where: any = {};

    // فیلتر وضعیت
    if (status && status !== 'all') {
      if (status === 'paid') {
        where.isPaid = true;
      } else if (status === 'failed') {
        where.status = 'failed';
      } else if (status === 'pending') {
        where.isPaid = false;
        where.status = { not: 'failed' };
      } else if (status === 'cancelled') {
        where.status = 'cancelled';
      }
    }

    // فیلتر جستجو
    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { paymentRef: { contains: term, mode: 'insensitive' } },
        { Subscriptions: { Tenant: { companyName: { contains: term, mode: 'insensitive' } } } },
        { Subscriptions: { Tenant: { subDomain: { contains: term, mode: 'insensitive' } } } },
        { Subscriptions: { Tenant: { ownerMobile: { contains: term } } } },
      ];
    }

    // فیلتر زمانی
    if (timeFilter && timeFilter !== 'all') {
      const now = new Date();
      let since: Date | null = null;

      if (timeFilter === 'today') {
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (timeFilter === 'week') {
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === 'month') {
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === 'year') {
        since = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      }

      if (since) where.createdAt = { gte: since };
    }

    // ── دریافت تراکنش‌ها با صفحه‌بندی ─────────────────
    const [transactions, totalCount] = await Promise.all([
      db.client.subscriptionPayments.findMany({
        where,
        take: pageSize,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          Subscriptions: {
            include: {
              Tenant: {
                select: {
                  id: true,
                  companyName: true,
                  subDomain: true,
                  planName: true,
                  ownerMobile: true,
                  ownerName: true,
                },
              },
              Plans: {
                select: {
                  nameFa: true,
                  price: true,
                },
              },
            },
          },
        },
      }),

      db.client.subscriptionPayments.count({ where }),
    ]);

    // ── آمار کلی (★ v11.3: ساده‌تر، بدون lifetime/annual) ──────
    const paidStats = await (async () => {
      const all = await db.client.subscriptionPayments.findMany({
        where: { isPaid: true },
        select: { amount: true, paidAt: true },
      });

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const amounts = all.map(t => Number(t.amount) || 0);
      const totalRevenue = amounts.reduce((sum, a) => sum + a, 0);

      const thisMonth = all.filter(t => {
        const d = new Date(t.paidAt || '');
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      const monthlyRevenue = thisMonth.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      const todayTx = all.filter(t => {
        const d = new Date(t.paidAt || '');
        return d >= today;
      });
      const todayRevenue = todayTx.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      return {
        totalRevenue,
        monthlyRevenue,
        todayRevenue,
        todayCount: todayTx.length,
        totalCount: all.length,
        avgTransaction: all.length > 0 ? Math.round(totalRevenue / all.length) : 0,
      };
    })();

    // ── فیلتر پلن (بعد از دریافت) ─────────────────────
    let filteredTransactions = transactions;
    if (planFilter && planFilter !== 'all') {
      filteredTransactions = transactions.filter(t => {
        const parsed = parsePaymentMethod(t.paymentMethod);
        const tenantPlan = t.Subscriptions?.Tenant?.planName || '';
        return parsed.tierName === planFilter || tenantPlan.toLowerCase().includes(planFilter.toLowerCase());
      });
    }

    // ── فرمت کردن تراکنش‌ها ───────────────────────────
    const formatted = filteredTransactions.map(t => {
      const parsed = parsePaymentMethod(t.paymentMethod);
      const tenant = t.Subscriptions?.Tenant;

      return {
        id: t.id,
        tenantId: tenant?.id || '',
        tenantName: tenant?.companyName || 'نامشخص',
        tenantSubdomain: tenant?.subDomain || '',
        tenantMobile: tenant?.ownerMobile || '',
        tenantOwner: tenant?.ownerName || '',
        tierName: parsed.tierName || tenant?.planName || '',
        planLabel: t.Subscriptions?.Plans?.nameFa || '',
        gateway: parsed.gateway,
        amount: Number(t.amount),
        paymentMethod: t.paymentMethod || '',
        paymentRef: t.paymentRef,
        status: t.status,
        isPaid: t.isPaid,
        paidAt: t.paidAt,
        createdAt: t.createdAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: formatted,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      stats: paidStats,
    });
  } catch (error: any) {
    console.error('[Admin Transactions GET] Error:', error);
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری تراکنش‌ها' }, { status: 500 });
  }
}