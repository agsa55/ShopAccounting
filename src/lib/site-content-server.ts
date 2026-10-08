// ============================================================================
// src/lib/site-content-server.ts (v1.0 ★★★)
// ShopAccounting — Server-side Site Content Reader
// ----------------------------------------------------------------------------
// ★ این فایل مخصوص سمت سرور است و نباید داخل کامپوننت‌های Client استفاده شود.
// ★ data/site-content.json را می‌خواند و قیمت پلن‌ها را برای APIهای پرداخت provides می‌کند.
// ★ از کش کوتاه‌مدت ۱۰ ثانیه‌ای استفاده می‌کند تا فشار filesystem کم شود.
// ============================================================================

import fs from 'fs'
import path from 'path'
import { DEFAULT_SITE_CONTENT } from '@/lib/site-content.types'

type AnyObject = Record<string, any>

let cachedRaw: string | null = null
let cachedParsed: AnyObject | null = null
let cachedAt = 0

const CACHE_TTL_MS = 10_000

// ═══════════════════════════════════════════════════════════════
//  مسیر فایل داده
// ═══════════════════════════════════════════════════════════════

function getDataFilePath(): string {
  return path.join(process.cwd(), 'data', 'site-content.json')
}

// ═══════════════════════════════════════════════════════════════
//  پاک‌سازی کش — اختیاری برای استفاده بعد از ذخیره پنل ادمین
// ═══════════════════════════════════════════════════════════════

export function clearSiteContentServerCache(): void {
  cachedRaw = null
  cachedParsed = null
  cachedAt = 0
}

// ═══════════════════════════════════════════════════════════════
//  خواندن Site Content از فایل JSON
// ═══════════════════════════════════════════════════════════════

export function readSiteContentServer(): AnyObject {
  const now = Date.now()

  if (cachedParsed && now - cachedAt < CACHE_TTL_MS) {
    return cachedParsed
  }

  const defaults = (DEFAULT_SITE_CONTENT ?? {}) as AnyObject

  try {
    const filePath = getDataFilePath()

    if (!fs.existsSync(filePath)) {
      cachedParsed = { ...defaults }
      cachedRaw = null
      cachedAt = now
      return cachedParsed
    }

    const raw = fs.readFileSync(filePath, 'utf-8')

    if (raw !== cachedRaw || !cachedParsed) {
      let parsed: AnyObject = {}

      try {
        parsed = JSON.parse(raw) as AnyObject
      } catch (parseErr: any) {
        console.warn('[SiteContentServer] Invalid JSON in site-content.json:', parseErr?.message)
        parsed = {}
      }

      cachedParsed = {
        ...defaults,
        ...parsed,
      }

      cachedRaw = raw
    }
  } catch (err: any) {
    console.warn('[SiteContentServer] Failed to read site-content.json:', err?.message)
    cachedParsed = { ...defaults }
    cachedRaw = null
  }

  cachedAt = now
  return cachedParsed || { ...defaults }
}

// ═══════════════════════════════════════════════════════════════
//  Helpers عددی امن
// ═══════════════════════════════════════════════════════════════

function asPositiveNumber(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n)
}

function asPercent(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

// ═══════════════════════════════════════════════════════════════
//  دریافت محتوای یک پلن از Site Content
// ═══════════════════════════════════════════════════════════════

export function getServerPlanContent(planName: string): AnyObject | null {
  const content = readSiteContentServer()
  const plans = Array.isArray((content as any)?.plans) ? (content as any).plans : []

  const normalized = String(planName || '').trim()
  if (!normalized) return null

  return (
    plans.find((plan: any) => String(plan?.name || '').trim() === normalized) ||
    null
  )
}

// ═══════════════════════════════════════════════════════════════
//  دریافت قیمت پایه پلن از Site Content
//
// اولویت:
// 1. updatePrice
// 2. برای lifetime → lifetimePrice سپس annualPrice
// 3. برای annual → annualPrice سپس lifetimePrice
// ═══════════════════════════════════════════════════════════════

export function getServerPlanBasePrice(
  planName: string,
  billingCycle: 'annual' | 'lifetime'
): number {
  const plan = getServerPlanContent(planName)
  if (!plan) return 0

  const updatePrice = asPositiveNumber(plan.updatePrice)
  if (updatePrice > 0) return updatePrice

  const lifetimePrice = asPositiveNumber(plan.lifetimePrice)
  const annualPrice = asPositiveNumber(plan.annualPrice)

  if (billingCycle === 'lifetime') {
    return lifetimePrice || annualPrice || 0
  }

  return annualPrice || lifetimePrice || 0
}

// ═══════════════════════════════════════════════════════════════
//  دریافت درصد تخفیف پلن از Site Content
// ═══════════════════════════════════════════════════════════════

export function getServerPlanDiscountPercent(planName: string): number {
  const plan = getServerPlanContent(planName)
  if (!plan) return 0

  return asPercent(plan.discountPercent)
}