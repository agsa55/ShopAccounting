// ============================================================================
// src/app/api/admin/tenants/route.ts — v12.0 (Unified Payment Awareness)
// ShopAccounting — Admin Tenants List with Payment & Lock Status
// ----------------------------------------------------------------------------
// ★ v12.0: افزودن آمار پرداخت‌های OnlinePayments و SubscriptionPayments
// ★ v12.0: نمایش تعداد درخواست‌های کارت‌به‌کارت در انتظار بررسی
// ★ v12.0: حفظ کامل ساختار قبلی و اضافه کردن فیلدهای جدید
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
  console.log('[Admin Tenants v12.0] 📥 GET request received');
  
  try {
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

    console.log(`[Admin Tenants v12.0] ✅ Found ${tenants.length} tenants`);

    // ── آمار پرداخت‌های موفق از OnlinePayments ─────────────
    const paidOnline = await db.client.onlinePayment.groupBy({
      by: ['tenantId'],
      where: { status: 'paid' },
      _sum: { amount: true },
      _max: { paidAt: true },
    });

    // ── آمار پرداخت‌های موفق از SubscriptionPayments قدیمی ──
    const paidSubscriptions = await db.client.subscriptionPayments.groupBy({
      by: ['tenantId'],
      where: { isPaid: true },
      _sum: { amount: true },
      _max: { paidAt: true },
    });

    // ── درخواست‌های کارت‌به‌کارت در انتظار بررسی ─────────────
    const pendingManual = await db.client.onlinePayment.groupBy({
      by: ['tenantId'],
      where: {
        status: 'waiting_review',
        gatewayType: 'manual_card',
      },
      _count: { _all: true },
    });

    type PaidAggregate = { amount: number; lastPaidAt: Date | null };
    const paidMap = new Map<string, PaidAggregate>();

    const addPaid = (tenantId: string | null, amount: any, paidAt: any) => {
      if (!tenantId) return;

      const numericAmount = Number(amount || 0);
      const paidDate = paidAt ? new Date(paidAt) : null;

      const existing = paidMap.get(tenantId);

      if (!existing) {
        paidMap.set(tenantId, {
          amount: numericAmount,
          lastPaidAt: paidDate,
        });
        return;
      }

      existing.amount += numericAmount;

      if (paidDate && (!existing.lastPaidAt || paidDate > existing.lastPaidAt)) {
        existing.lastPaidAt = paidDate;
      }
    };

    for (const row of paidOnline) {
      addPaid(row.tenantId, row._sum.amount, row._max.paidAt);
    }

    for (const row of paidSubscriptions) {
      addPaid(row.tenantId, row._sum.amount, row._max.paidAt);
    }

    const pendingMap = new Map<string, number>();
    for (const row of pendingManual) {
      if (row.tenantId) {
        pendingMap.set(row.tenantId, Number(row._count._all || 0));
      }
    }

    const formattedTenants = tenants.map(t => {
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

      let overallStatus: 'active' | 'trial' | 'expired' | 'locked' | 'pending' = 'active';
      if (t.status === 'deleted') overallStatus = 'locked';
      else if (t.status === 'pending_payment') overallStatus = 'pending';
      else if (t.trialEndAt && !t.isPaid) {
        const daysLeft = Math.ceil((new Date(t.trialEndAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysLeft > 0) overallStatus = 'trial';
        else overallStatus = 'expired';
      }

      const paidInfo = paidMap.get(t.id);
      const pendingManualCount = pendingMap.get(t.id) || 0;

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
        totalPaidAmount: paidInfo?.amount || 0,
        lastPaidAt: paidInfo?.lastPaidAt ? paidInfo.lastPaidAt.toISOString() : null,
        pendingManualCount,
      };
    });

    const stats = {
      total: formattedTenants.length,
      active: formattedTenants.filter(t => t.overallStatus === 'active').length,
      trial: formattedTenants.filter(t => t.overallStatus === 'trial').length,
      expired: formattedTenants.filter(t => t.overallStatus === 'expired').length,
      locked: formattedTenants.filter(t => t.isLocked === true).length,
      pendingManual: formattedTenants.reduce((sum, t) => sum + (t.pendingManualCount || 0), 0),
      paidTenants: formattedTenants.filter(t => t.isPaid === true).length,
      lifetime: formattedTenants.filter(t => t.billingCycle === 'lifetime' || t.remainingDays >= 9999).length,
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

    console.log('[Admin Tenants v12.0] 📊 Stats:', JSON.stringify(stats, null, 2));

    return NextResponse.json({ 
      success: true, 
      data: formattedTenants,
      stats 
    });
  } catch (error: any) {
    console.error('[Admin Tenants v12.0] ❌ ERROR:', error.message);
    console.error('[Admin Tenants v12.0] Stack:', error.stack);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    }, { status: 500 });
  }
}