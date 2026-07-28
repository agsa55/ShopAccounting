'use client'

// ============================================================================
// src/components/shared/sidebar-plan-card.tsx (v3.0)
// ShopAccounting — Unified Single Database Architecture
// ============================================================================
// ★ کارت نمایش پلن در سایدبار
// ============================================================================

import { useStore } from '@/lib/store'
import { resolvePlan } from '@/lib/plan-features'
import { Crown, ChevronLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export function SidebarPlanCard({ onClick }: { onClick?: () => void }) {
  const planName = useStore((s) => s.planName)
  const plan = resolvePlan(planName)

  return (
    <button
      onClick={onClick}
      className="w-full p-2.5 rounded-lg border border-emerald-200 bg-gradient-to-bl from-emerald-50 to-white hover:from-emerald-100 hover:to-emerald-50 transition-all text-right group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
            <Crown className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500">پلن فعلی</p>
            <p className="text-xs font-bold text-gray-900 truncate">{plan.label}</p>
          </div>
        </div>
        <ChevronLeft className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 transition-colors shrink-0" />
      </div>
    </button>
  )
}
