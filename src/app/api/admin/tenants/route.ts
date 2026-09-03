import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ★ تابع کمکی برای تبدیل اعداد به فارسی
const toFaNum = (n: number | string): string => {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

// ★★★ محاسبه دقیق مدت استفاده (سال/ماه/روز) از تاریخ ثبت‌نام تا امروز
function calculateUsageDuration(createdAt: Date): {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  text: string;
  shortText: string;
} {
  const start = new Date(createdAt);
  const now = new Date();

  // محاسبه کل روزها
  const totalDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  // محاسبه دقیق سال/ماه/روز
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  // ساخت متن فارسی
  const parts: string[] = [];
  if (years > 0) parts.push(`${toFaNum(years)} سال`);
  if (months > 0) parts.push(`${toFaNum(months)} ماه`);
  if (days > 0 || parts.length === 0) parts.push(`${toFaNum(days)} روز`);

  const text = parts.join(' و ');

  // متن کوتاه‌تر برای نمایش فشرده
  let shortText = '';
  if (years > 0) {
    shortText = `${toFaNum(years)}س ${toFaNum(months)}م`;
  } else if (months > 0) {
    shortText = `${toFaNum(months)}م ${toFaNum(days)}ر`;
  } else {
    shortText = `${toFaNum(days)} روز`;
  }

  return { years, months, days, totalDays, text, shortText };
}

export async function GET(request: NextRequest) {
  try {
    const tenants = await db.client.tenant.findMany({
      select: {
        id: true,
        companyName: true,
        subDomain: true,
        ownerMobile: true,
        status: true,
        planName: true,
        billingCycle: true,
        expiresAt: true,
        createdAt: true, // ★ برای محاسبه مدت استفاده
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

      // ★ محاسبه مدت استفاده از سیستم
      const usage = calculateUsageDuration(t.createdAt);

      const faMobile = t.ownerMobile ? toFaNum(t.ownerMobile) : '—';

      return {
        ...t,
        ownerMobile: faMobile,
        remainingDays,
        remainingTimeText,
        isExpired: remainingDays <= 0 && t.billingCycle !== 'lifetime',
        // ★ فیلدهای جدید مدت استفاده
        usageDays: usage.totalDays,
        usageYears: usage.years,
        usageMonths: usage.months,
        usageDurationDays: usage.days,
        usageText: usage.text,       // "۲ سال و ۳ ماه و ۱۵ روز"
        usageShortText: usage.shortText, // "۲س ۳م"
      };
    });

    return NextResponse.json({ success: true, data: formattedTenants });
  } catch (error) {
    console.error('[Admin Tenants GET] Error:', error);
    return NextResponse.json({ success: false, error: 'خطای داخلی سرور' }, { status: 500 });
  }
}