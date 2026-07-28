// ============================================================================
// src/app/api/tenants/resolve/route.ts — GET /api/tenants/resolve?slug=xxx
// ShopAccounting v4.0 — Multi-tenant SaaS Platform
// ============================================================================
// v3 — سازگار با هر دو schema قدیمی و جدید
// ★ از hasNewSchemaFields() قبل از کوئری استفاده می‌کنه — بدون prisma:error
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hasNewSchemaFields } from '@/lib/plan-limits';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'پارامتر slug الزامی است' },
        { status: 400 }
      );
    }

    // ─── تشخیص schema قبل از کوئری ───
    const isNewSchema = await hasNewSchemaFields();

    // ─── پیدا کردن tenant ───
    // ★ فقط فیلدهای موجود رو کوئری می‌کنیم — هیچ prisma:error نخواهد بود ★
    let tenant: any;
    let planTier: any = null;

    if (isNewSchema) {
      try {
        tenant = await db.master.tenant.findFirst({
          where: { subDomain: slug },
          include: {
            planTier: {
              select: {
                id: true,
                name: true,
                nameFa: true,
                maxUsers: true,
                maxProducts: true,
                maxInvoices: true,
                isTrial: true,
                trialDays: true,
                dbType: true,
                sortOrder: true,
              },
            },
          } as any,
        });
        planTier = tenant?.planTier || null;
      } catch {
        // اگر include شکست خورد (نباید با hasNewSchemaFields رخ بده ولی احتیاط)
        tenant = await db.master.tenant.findFirst({
          where: { subDomain: slug },
        });
      }
    } else {
      // ★ Schema قدیمی — فقط فیلدهای موجود ★
      tenant = await db.master.tenant.findFirst({
        where: { subDomain: slug },
      });
    }

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'فروشگاه یافت نشد' },
        { status: 404 }
      );
    }

    // ─── اگر planTier از include نیامد، سعی کنیم جداگانه بخوانیم ───
    const planTierId = (tenant as any).planTierId;
    if (!planTier && planTierId && isNewSchema) {
      try {
        planTier = await (db.master as any).planTier.findUnique({
          where: { id: planTierId },
        });
      } catch (e: any) {
        console.warn('[Tenants/Resolve] planTier findUnique failed:', e.message);
      }
    }

    // ─── محاسبه وضعیت اشتراک ───
    const now = new Date();
    const expiresAt = (tenant as any).expiresAt || null;
    const isExpired = expiresAt ? new Date(expiresAt) < now : false;
    const daysRemaining = expiresAt
      ? Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : 999;

    // ─── پیدا کردن قیمت دوره فعلی ───
    const billingCycle = (tenant as any).billingCycle || null;
    let currentPrice: any = null;

    if (planTierId && billingCycle && isNewSchema) {
      try {
        currentPrice = await (db.master as any).planPrice.findUnique({
          where: {
            planTierId_billingCycle: {
              planTierId,
              billingCycle,
            },
          },
        });
      } catch (e: any) {
        console.warn('[Tenants/Resolve] planPrice findUnique failed:', e.message);
        currentPrice = null;
      }
    }

    // ─── مقادیر fallback برای فیلدهای قدیمی ───
    const isIsolated = (tenant as any).isIsolated || false;
    const soldAt = tenant.soldAt || (tenant as any).soldAt || null;

    // اگر planTier از هیچ جا نیامد، از planName قدیمی استخراج کن
    let tierName = planTier?.name || 'free';
    let tierNameFa = planTier?.nameFa || 'رایگان';
    let maxUsers = planTier?.maxUsers || 1;
    let maxProducts = planTier?.maxProducts || 50;
    let maxInvoices = planTier?.maxInvoices || 100;
    let isTrial = planTier?.isTrial || false;

    if (!planTier && tenant.planName) {
      // استخراج از planName قدیمی
      const tierPart = tenant.planName.split('_')[0];
      const TIER_MAP: Record<string, any> = {
        trial:         { name: 'free',         nameFa: 'رایگان',   maxUsers: 1,   maxProducts: 50,   maxInvoices: 100,   isTrial: true },
        free:          { name: 'free',         nameFa: 'رایگان',   maxUsers: 1,   maxProducts: 50,   maxInvoices: 100,   isTrial: true },
        simple:        { name: 'simple',       nameFa: 'ساده',    maxUsers: 3,   maxProducts: 500,  maxInvoices: 1000,  isTrial: false },
        professional:  { name: 'professional', nameFa: 'حرفه‌ای', maxUsers: 10,  maxProducts: 5000, maxInvoices: 10000, isTrial: false },
        enterprise:    { name: 'enterprise',   nameFa: 'سازمانی', maxUsers: 999, maxProducts: 99999,maxInvoices: 99999, isTrial: false },
        full_purchase: { name: 'enterprise',   nameFa: 'سازمانی', maxUsers: 999, maxProducts: 99999,maxInvoices: 99999, isTrial: false },
      };
      const legacyTier = TIER_MAP[tierPart] || TIER_MAP.free;
      tierName = legacyTier.name;
      tierNameFa = legacyTier.nameFa;
      maxUsers = legacyTier.maxUsers;
      maxProducts = legacyTier.maxProducts;
      maxInvoices = legacyTier.maxInvoices;
      isTrial = legacyTier.isTrial;
    }

    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'shopaccounting.ir';
    const isDev = request.headers.get('host')?.startsWith('localhost');

    return NextResponse.json({
      success: true,
      data: {
        // اطلاعات tenant
        id: tenant.id,
        subDomain: tenant.subDomain,
        companyName: tenant.companyName,
        ownerName: tenant.ownerName,
        logoUrl: tenant.logoUrl,
        status: tenant.status,
        isIsolated,

        // ─── اطلاعات پلن ───
        planTierId: planTierId || 1,
        planTierName: tierName,
        planTierNameFa: tierNameFa,
        billingCycle: billingCycle || 'monthly',
        tier: tierName,
        isTrial,

        // محدودیت‌ها
        maxUsers,
        maxProducts,
        maxInvoices,

        // وضعیت اشتراک
        soldAt,
        expiresAt,
        isExpired,
        daysRemaining: Math.max(0, daysRemaining),

        // قیمت فعلی
        currentPrice: currentPrice
          ? {
              price: currentPrice.price,
              discountPercent: currentPrice.discountPercent,
              durationDays: currentPrice.durationDays,
            }
          : null,

        // URL ها
        urls: {
          production: `https://${tenant.subDomain}.${rootDomain}`,
          development: `http://localhost:3000/${tenant.subDomain}`,
          login: isDev
            ? `http://localhost:3000/${tenant.subDomain}/login`
            : `https://${tenant.subDomain}.${rootDomain}/login`,
        },
      },
    });
  } catch (error: any) {
    console.error('[Tenants/Resolve] Error:', error);
    return NextResponse.json(
      { success: false, error: 'خطا در دریافت اطلاعات فروشگاه' },
      { status: 500 }
    );
  }
}
