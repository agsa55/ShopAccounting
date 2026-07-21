/**
 * API Health Check Endpoint
 * مسیر: src/app/api/health/route.ts
 *
 * این endpoint برای پینگ سلامت سرور استفاده می‌شه
 * OnlineDetector هر ۳۰ ثانیه این رو صدا می‌زنه
 */

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 })
}
