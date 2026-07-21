// ============================================================================
// src/app/api/plan-limits/route.ts — GET (v3.0)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { checkSubscriptionStatus, checkPlanLimit } from '@/lib/plan-limits'

export const GET = withTenantAndPermission('dashboard')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantId = tenant.tenantId
    const url = new URL(req.url)
    const feature = url.searchParams.get('feature')

    const subscription = await checkSubscriptionStatus(tenantId)

    if (feature && feature !== 'all') {
      const limitResult = await checkPlanLimit(tenantId, feature as 'users' | 'products' | 'invoices' | 'customers')

      const featureMap: Record<string, string> = {
        products: 'maxProducts',
        users: 'maxUsers',
        invoices: 'maxInvoices',
        customers: 'maxCustomers',
      }

      return NextResponse.json({
        success: true,
        data: {
          maxProducts: limitResult.limit,
          currentCount: limitResult.current,
          remaining: limitResult.remaining,
          canAdd: limitResult.allowed,
          planTierName: subscription.tierNameFa || subscription.tierName,
          limit: limitResult.limit,
          current: limitResult.current,
          allowed: limitResult.allowed,
          percentUsed: limitResult.percentUsed,
          resourceNameFa: limitResult.resourceNameFa,
          featureKey: featureMap[feature] || `max${feature.charAt(0).toUpperCase() + feature.slice(1)}`,
        },
        subscription: {
          isActive: subscription.isActive,
          isExpired: subscription.isExpired,
          isTrial: false,
          daysRemaining: subscription.daysRemaining,
          planTierName: subscription.tierName,
          planTierNameFa: subscription.tierNameFa,
        },
      })
    }

    const [users, products, invoices, customers] = await Promise.all([
      checkPlanLimit(tenantId, 'users'),
      checkPlanLimit(tenantId, 'products'),
      checkPlanLimit(tenantId, 'invoices'),
      checkPlanLimit(tenantId, 'customers'),
    ])

    const tenantRecord = await db.client.tenant.findUnique({
      where: { id: tenantId },
      include: { planTier: true },
    })

    return NextResponse.json({
      success: true,
      data: {
        subscription: {
          isActive: subscription.isActive,
          isExpired: subscription.isExpired,
          isTrial: false,
          daysRemaining: subscription.daysRemaining,
          expiresAt: subscription.expiresAt?.toISOString() || null,
          planTierName: subscription.tierName,
          planTierNameFa: subscription.tierNameFa,
          billingCycle: subscription.billingCycle,
          tier: subscription.tierName,
          messageFa: subscription.isExpired
            ? 'اشتراک شما منقضی شده است'
            : `فعال — ${subscription.daysRemaining} روز مانده`,
        },
        users: {
          current: users.current, max: users.limit, allowed: users.allowed,
          remaining: users.remaining, percentUsed: users.percentUsed,
        },
        products: {
          maxProducts: products.limit, currentCount: products.current, remaining: products.remaining,
          canAdd: products.allowed, planTierName: subscription.tierNameFa || subscription.tierName,
          current: products.current, limit: products.limit, allowed: products.allowed, percentUsed: products.percentUsed,
        },
        invoices: {
          current: invoices.current, max: invoices.limit, allowed: invoices.allowed,
          remaining: invoices.remaining, percentUsed: invoices.percentUsed,
        },
        customers: {
          current: customers.current, max: customers.limit, allowed: customers.allowed,
          remaining: customers.remaining, percentUsed: customers.percentUsed,
        },
        tenant: {
          isIsolated: false,
          dbType: 'shared',
          tenantDb: null,
          planTierId: tenantRecord?.planTierId || null,
        },
      },
    })
  } catch (error: any) {
    console.error('[PlanLimits GET] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری اطلاعات اشتراک' },
      { status: 500 }
    )
  }
})
