import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ★ تابع کمکی برای تبدیل اعداد به فارسی
const toFaNum = (n: number | string): string => {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

export async function GET(request: NextRequest) {
  try {
    // دریافت لیست فروشگاه‌ها به همراه آمار مرتبط و شماره تماس مالک
    const tenants = await db.client.tenant.findMany({
      select: {
        id: true,
        companyName: true,
        subDomain: true,
        ownerMobile: true, // ★ اضافه شد
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

    // محاسبه دقیق روزهای باقی‌مانده و فرمت‌دهی فارسی
    const formattedTenants = tenants.map(t => {
      let remainingTimeText = '';
      let remainingDays = 0;

      if (t.billingCycle === 'lifetime' || !t.expiresAt) {
        remainingTimeText = 'مادام‌العمر';
        remainingDays = 9999;
      } else {
        const now = new Date();
        const expires = new Date(t.expiresAt);
        const diffTime = expires.getTime() - now.getTime();
        remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (remainingDays <= 0) {
          remainingTimeText = 'منقضی شده';
          remainingDays = 0;
        } else {
          const months = Math.floor(remainingDays / 30);
          const days = remainingDays % 30;
          
          // تبدیل اعداد به فارسی برای نمایش زیبا
          const faMonths = toFaNum(months);
          const faDays = toFaNum(days);

          if (months > 0 && days > 0) {
            remainingTimeText = `${faMonths} ماه و ${faDays} روز`;
          } else if (months > 0) {
            remainingTimeText = `${faMonths} ماه`;
          } else {
            remainingTimeText = `${faDays} روز`;
          }
        }
      }

      // تبدیل شماره موبایل به فرمت فارسی (اگر وجود داشت)
      const faMobile = t.ownerMobile 
        ? toFaNum(t.ownerMobile)
        : '—';

      return {
        ...t,
        ownerMobile: faMobile, // بازنویسی با فرمت فارسی
        remainingDays,
        remainingTimeText, // ★ متن جدید و دقیق (مثلاً: "۱۱ ماه و ۱۵ روز")
        isExpired: remainingDays <= 0 && t.billingCycle !== 'lifetime',
      };
    });

    return NextResponse.json({ success: true, data: formattedTenants });
  } catch (error) {
    console.error('[Admin Tenants GET] Error:', error);
    return NextResponse.json({ success: false, error: 'خطای داخلی سرور' }, { status: 500 });
  }
}