// ============================================================================
// src/app/api/plan-prices/route.ts — GET (v3.0)
// ============================================================================

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { PLAN_LIMITS, TIER_FA_INFO } from '@/lib/plan-limits';

interface PlanPriceResponse {
  id: number;
  billingCycle: string;
  price: number;
  currency?: string;
  durationDays: number;
  discountPercent: number;
  isPopular: boolean;
  isActive: boolean;
}

interface PlanTierResponse {
  id: number;
  name: string;
  nameFa: string;
  description: string;
  maxUsers: number;
  maxProducts: number;
  maxInvoices: number;
  isTrial: boolean;
  trialDays: number;
  dbType: string;
  isActive: boolean;
  sortOrder: number;
  features: string[];
  prices: PlanPriceResponse[];
}

export async function GET() {
  try {
    const tiers = await db.client.planTier.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });

    if (!tiers || tiers.length === 0) {
      const fallbackPlans: PlanTierResponse[] = Object.entries(PLAN_LIMITS).map(([name, limits], index) => {
        const faInfo = TIER_FA_INFO[name] || { nameFa: name, description: '', monthlyPrice: 0, annualPrice: 0 };
        return {
          id: index + 1,
          name,
          nameFa: faInfo.nameFa,
          description: faInfo.description,
          maxUsers: limits.maxUsers,
          maxProducts: limits.maxProducts,
          maxInvoices: limits.maxInvoices,
          isTrial: false,
          trialDays: 0,
          dbType: 'shared',
          isActive: true,
          sortOrder: index + 1,
          features: limits.features,
          prices: [
            { id: 1, billingCycle: 'monthly', price: faInfo.monthlyPrice, durationDays: 30, discountPercent: 0, isPopular: false, isActive: true },
            { id: 2, billingCycle: 'annual', price: faInfo.annualPrice, durationDays: 365, discountPercent: 0, isPopular: true, isActive: true },
          ],
        };
      });
      return NextResponse.json({ success: true, data: fallbackPlans });
    }

    const result: PlanTierResponse[] = [];

    for (const tier of tiers) {
      let prices: any[] = [];
      try {
        prices = await db.client.planPrice.findMany({
          where: { planTierId: tier.id },
          orderBy: { billingCycle: 'asc' },
        });
      } catch {
        prices = [];
      }

      const tierLimits = PLAN_LIMITS[tier.name] || PLAN_LIMITS.simple
      const tierInfo = TIER_FA_INFO[tier.name] || { nameFa: tier.name, description: '', monthlyPrice: 0, annualPrice: 0 }

      result.push({
        id: tier.id,
        name: tier.name,
        nameFa: tier.nameFa || tierInfo.nameFa || tier.name,
        description: tier.description || tierInfo.description,
        maxUsers: tier.maxUsers ?? tierLimits.maxUsers,
        maxProducts: tier.maxProducts ?? tierLimits.maxProducts,
        maxInvoices: tier.maxInvoices ?? tierLimits.maxInvoices,
        isTrial: false,
        trialDays: 0,
        dbType: 'shared',
        isActive: tier.isActive,
        sortOrder: tier.sortOrder || 0,
        features: tierLimits.features,
        prices: prices.map((p: any) => ({
          id: p.id,
          billingCycle: p.billingCycle,
          price: p.price,
          currency: p.currency,
          durationDays: p.durationDays,
          discountPercent: p.discountPercent || 0,
          isPopular: p.isPopular || false,
          isActive: p.isActive,
        })),
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[PlanPrices] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'خطا در دریافت اطلاعات پلن‌ها' },
      { status: 500 }
    );
  }
}
