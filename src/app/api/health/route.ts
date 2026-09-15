// ============================================================================
// src/app/api/health/route.ts — GET /api/health
// ============================================================================
// ★ v2.0: بررسی واقعی اتصال دیتابیس + زمان پاسخ‌دهی
//   قبلاً فقط { status: 'ok' } برمی‌گرداند بدون هیچ بررسی واقعی.
//   حالا PostgreSQL را پینگ می‌کند تا وضعیت واقعی مشخص شود.
// ============================================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const start = Date.now()

  try {
    // ★ پینگ واقعی PostgreSQL
    await db.client.$queryRaw`SELECT 1`

    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - start,
    })
  } catch (error: any) {
    console.error('[Health] Database ping failed:', error?.message)

    // سرور زنده است ولی DB قطع است — هنوز 200 برمی‌گردانیم
    // چون خود سرور پاسخ می‌دهد (connectivity module از این تشخیص استفاده می‌کند)
    return NextResponse.json({
      status: 'degraded',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - start,
      error: error?.message || 'unknown',
    })
  }
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 })
}