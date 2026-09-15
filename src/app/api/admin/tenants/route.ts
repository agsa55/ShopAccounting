// ============================================================================
// src/app/api/admin/tenants/route.ts — v11.3.1 (Safe Version)
// ★ فقط فیلدهای قطعی موجود را select می‌کند
// ★ لاگ‌گیری دقیق برای عیب‌یابی
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const toFaNum = (n: number | string): string => {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

function calculateUsageDuration(createdAt: Date) {
  const start = new Date(createdAt);
  const now = new Date();
  const totalDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

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

  const parts: string[] = [];
  if (years > 0) parts.push(`${toFaNum(years)} سال`);
  if (months > 0) parts.push(`${toFaNum(months)} ماه`);
  if (days > 0 || parts.length === 0) parts.push(`${toFaNum(days)} روز`);

  return {
    totalDays,
    text: parts.join(' و '),
    shortText: years > 0 ? `${toFaNum(years)}س ${toFaNum(months)}م` : 
               months > 0 ? `${toFaNum(months)}م ${toFaNum(days)}ر` : 
               `${toFaNum(days)} روز`,
  };
}

export async function GET(request: NextRequest) {
  console.log('[Admin Tenants] 📥 GET request received');
  
  try {
    // ★ فقط فیلدهای قطعی موجود را select می‌کنیم
    const tenants = await db.client.tenant.findMany({
  select: {
  id: true,
  companyName: true,
  subDomain: true,
  ownerMobile: true,
  ownerNationalCode: true,
  ownerEmail: true,
  ownerName: true,
  status: true,
  planName: true,
  planTierId: true,
  billingCycle: true,
  isPaid: true,
  expiresAt: true,
  trialStartAt: true,
  trialEndAt: true,
  identityVerified: true,
  identityVerifiedAt: true,
  createdAt: true,
  // ★ v11.4: فیلدهای قفل (مهم!)
  isLocked: true,
  lockedAt: true,
  lockReason: true,
  lockedByAdmin: true,
  _count: {
    select: {
      StoreUsers: true,
      Tickets: true,
    }
  }
},
      orderBy: { createdAt: 'desc' }
    });

    console.log(`[Admin Tenants] ✅ Found ${tenants.length} tenants`);

    const formattedTenants = tenants.map(t => {
      // محاسبه زمان باقی‌مانده
      let remainingTimeText = '';
      let remainingDays = 0;

      if (t.billingCycle === 'lifetime' || !t.expiresAt) {
        remainingTimeText = 'مادام‌العمر';
        remainingDays = 9999;
      } else {
        const now = new Date();
        const expires = new Date(t.expiresAt);
        remainingDays = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (remainingDays <= 0) {
          remainingTimeText = 'منقضی شده';
          remainingDays = 0;
        } else {
          const months = Math.floor(remainingDays / 30);
          const days = remainingDays % 30;
          remainingTimeText = months > 0 && days > 0 
            ? `${toFaNum(months)} ماه و ${toFaNum(days)} روز`
            : months > 0 ? `${toFaNum(months)} ماه` : `${toFaNum(days)} روز`;
        }
      }

      const usage = calculateUsageDuration(t.createdAt);
      const faMobile = t.ownerMobile ? toFaNum(t.ownerMobile) : '—';
      const faNationalCode = t.ownerNationalCode ? toFaNum(t.ownerNationalCode) : '—';

      // تشخیص وضعیت کلی
      let overallStatus: 'active' | 'trial' | 'expired' | 'locked' | 'pending' = 'active';
      if (t.status === 'deleted') overallStatus = 'locked';
      else if (t.status === 'pending_payment') overallStatus = 'pending';
      else if (t.trialEndAt && !t.isPaid) {
        const daysLeft = Math.ceil((new Date(t.trialEndAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysLeft > 0) overallStatus = 'trial';
        else overallStatus = 'expired';
      }

      return {
        ...t,
        ownerMobile: faMobile,
        ownerNationalCode: faNationalCode,
        remainingDays,
        remainingTimeText,
        usageDays: usage.totalDays,
        usageText: usage.text,
        usageShortText: usage.shortText,
        overallStatus,
        identityVerified: t.identityVerified || false,
        isPaid: t.isPaid || false,
         isLocked: t.isLocked || false,
  lockedAt: t.lockedAt?.toISOString() || null,
  lockReason: t.lockReason || null,
  lockedByAdmin: t.lockedByAdmin || null,
      };
    });

    // آمار کلی
    const stats = {
      total: formattedTenants.length,
      active: formattedTenants.filter(t => t.overallStatus === 'active').length,
      trial: formattedTenants.filter(t => t.overallStatus === 'trial').length,
      expired: formattedTenants.filter(t => t.overallStatus === 'expired').length,
      plans: {
        simple: formattedTenants.filter(t => t.planName?.toLowerCase().includes('simple')).length,
        professional: formattedTenants.filter(t => t.planName?.toLowerCase().includes('professional')).length,
        enterprise: formattedTenants.filter(t => t.planName?.toLowerCase().includes('enterprise')).length,
      },
      identity: {
        verified: formattedTenants.filter(t => t.identityVerified).length,
        unverified: formattedTenants.filter(t => !t.identityVerified && t.ownerNationalCode && t.ownerNationalCode !== '—').length,
        noNationalCode: formattedTenants.filter(t => !t.ownerNationalCode || t.ownerNationalCode === '—').length,
      },
    };

    console.log('[Admin Tenants] 📊 Stats:', JSON.stringify(stats, null, 2));

    return NextResponse.json({ 
      success: true, 
      data: formattedTenants,
      stats 
    });
  } catch (error: any) {
    console.error('[Admin Tenants] ❌ ERROR:', error.message);
    console.error('[Admin Tenants] Stack:', error.stack);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    }, { status: 500 });
  }
}