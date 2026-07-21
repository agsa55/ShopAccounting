"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

// ============================================================================
// src/components/ui/switch.tsx — Switch Component (v3.27 — Fixed)
// ============================================================================
// ★★★ v3.27: اصلاح مشکل نمایش سویچ — رنگ‌های صریح به‌جای وابستگی به CSS variables
//
// مشکل قبلی:
//   - کلاس‌های data-[state=checked]:bg-primary به متغیر --primary وابسته بودند
//   - اگر --primary در globals.css تعریف نشده بود، سویچ همیشه سفید/شفاف می‌شد
//
// راه‌حل:
//   - استفاده از رنگ‌های صریح (#16a34a سبز برای فعال، #d1d5db خاکستری برای غیرفعال)
//   - پشتیبانی کامل از RTL (thumb به سمت چپ/راست حرکت می‌کند)
//   - انیمیشن نرم transition-colors و transition-transform
// ============================================================================

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
    /** رنگ وقتی فعال است (پیش‌فرض: سبز emerald) */
    activeColor?: string
  }
>(({ className, activeColor, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // ★ کلاس‌های پایه — ابعاد و شکل
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
      "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      // ★ رنگ‌های صریح (بدون وابستگی به --primary)
      //   فعال: سبز (#16a34a) | غیرفعال: خاکستری (#d1d5db)
      "data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-gray-300",
      className
    )}
    style={
      activeColor && props.checked
        ? { backgroundColor: activeColor }
        : undefined
    }
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // ★ Thumb — دایره سفید داخل سویچ
        "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0",
        "transition-transform",
        // ★ پشتیبانی از RTL:
        //   در LTR: فعال → translate-x-4 (به راست) | غیرفعال → translate-x-0
        //   در RTL: فعال → -translate-x-4 (به چپ) | غیرفعال → translate-x-0
        "data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
        "rtl:data-[state=checked]:-translate-x-4 rtl:data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
export default Switch
