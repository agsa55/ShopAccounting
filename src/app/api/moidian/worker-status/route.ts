// ============================================================================
// src/app/api/moidian/worker-status/route.ts — GET: وضعیت Internal Scheduler
// ============================================================================
// ★ این endpoint وضعیت Worker داخلی را برای نمایش در UI برمی‌گرداند.
// ★ نیازی به احراز هویت tenant-specific نیست چون اطلاعات کلی است.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { moidianScheduler } from '@/lib/moidian/scheduler'

export const GET = async (req: NextRequest) => {
  try {
    const status = moidianScheduler.getStatus()

    return NextResponse.json({
      success: true,
      data: status,
    })
  } catch (error: any) {
    console.error('[Moidian Worker Status] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'خطا در دریافت وضعیت' },
      { status: 500 }
    )
  }
}