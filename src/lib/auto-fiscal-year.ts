// ============================================================================
// src/lib/auto-fiscal-year.ts — Auto Fiscal Year Creation (v3.29 ★★★)
// ============================================================================
// ★★★ v3.29: این helper برای ایجاد خودکار سال مالی هنگام ثبت‌نام Tenant استفاده می‌شود
//
// قواعد:
//   - پلن سازمانی (enterprise): الزامی است — سال مالی خودکار ساخته می‌شود
//   - پلن حرفه‌ای (professional): اختیاری — سال مالی ساخته نمی‌شود (کاربر بعداً می‌سازد)
//   - پلن ساده (basic): نیازی نیست
//
// نحوه استفاده:
//   import { ensureFiscalYearForTenant } from '@/lib/auto-fiscal-year'
//   await ensureFiscalYearForTenant(db.client, tenantId, 'enterprise')
// ============================================================================

import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════
//  توابع کمکی تاریخ شمسی (همان الگوریتم jalaali-js)
// ═══════════════════════════════════════════════════════════════

function _div(a: number, b: number): number {
  return ~~(a / b)
}

function _rem(a: number, b: number): number {
  return a - ~~(a / b) * b
}

function _jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181,
    1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
    2456, 3178,
  ]
  const bl = breaks.length
  const gy = jy + 621
  let leapJ = -14
  let jp = breaks[0]

  if (jy < jp || jy >= breaks[bl - 1]) {
    throw new Error('Invalid Jalaali year ' + jy)
  }

  let jump = 0
  let jm = 0
  for (let i = 1; i < bl; i += 1) {
    jm = breaks[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + _div(jump, 33) * 8 + _div(_rem(jump, 33), 4)
    jp = jm
  }
  let n = jy - jp
  leapJ = leapJ + _div(n, 33) * 8 + _div(_rem(n, 33) + 3, 4)
  if (_rem(jump, 33) === 4 && jump - n === 4) leapJ += 1

  const leapG = _div(gy, 4) - _div((_div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG

  if (jump - n < 6) n = n - jump + _div(jump + 4, 33) * 33
  let leap = _rem(_rem(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4

  return { leap, gy, march }
}

function isJalaliLeapYear(jy: number): boolean {
  try {
    return _jalCal(jy).leap === 0
  } catch {
    return false
  }
}

function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  const r = _jalCal(jy)
  const gy = r.gy
  const march = r.march
  const days = (jm <= 7 ? (jm - 1) * 31 : (jm - 1) * 30 + 6) + jd - 1
  let gd = march + days
  const isLeapG = gy % 4 === 0 && (gy % 100 !== 0 || gy % 400 === 0)
  const gDaysInMonth = [31, 28 + (isLeapG ? 1 : 0), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let gm = 1
  for (let i = 0; i < 12; i++) {
    if (gd <= gDaysInMonth[i]) {
      gm = i + 1
      break
    }
    gd -= gDaysInMonth[i]
  }
  return [gy, gm, gd]
}

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  function _g2d(gy: number, gm: number, gd: number): number {
    let d =
      _div((gy + _div(gm - 8, 6) + 100100) * 1461, 4) +
      _div(153 * _rem(gm + 9, 12) + 2, 5) +
      gd - 34840408
    d = d - _div(_div(gy + 100100 + _div(gm - 8, 6), 100) * 3, 4) + 752
    return d
  }
  function _d2j(jdn: number): { jy: number; jm: number; jd: number } {
    function _d2g(jdn: number): { gy: number; gm: number; gd: number } {
      let j = 4 * jdn + 139361631
      j = j + _div(_div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
      const i = _div(_rem(j, 1461), 4) * 5 + 308
      const gd = _div(_rem(i, 153), 5) + 1
      const gm = _rem(_div(i, 153), 12) + 1
      const gy = _div(j, 1461) - 100100 + _div(8 - gm, 6)
      return { gy, gm, gd }
    }
    const r = _d2g(jdn)
    let jy = r.gy - 621
    const r2 = _jalCal(jy)
    const jdn1f = _g2d(r.gy, 3, r2.march)
    let k = jdn - jdn1f
    if (k >= 0) {
      if (k <= 185) {
        return { jy, jm: 1 + _div(k, 31), jd: _rem(k, 31) + 1 }
      }
      k -= 186
    } else {
      jy -= 1
      k += 179
      if (r2.leap === 1) k += 1
    }
    return { jy, jm: 7 + _div(k, 30), jd: _rem(k, 30) + 1 }
  }
  const r = _d2j(_g2d(gy, gm, gd))
  return [r.jy, r.jm, r.jd]
}

function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isJalaliLeapYear(jy) ? 30 : 29
}

function toFaNum(n: number | string): string {
  const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  return String(n).replace(/\d/g, (d) => faDigits[parseInt(d, 10)])
}

// ═══════════════════════════════════════════════════════════════
//  تابع اصلی: ensureFiscalYearForTenant
// ═══════════════════════════════════════════════════════════════

/**
 * ایجاد خودکار سال مالی برای Tenant
 *
 * قواعد:
 * - enterprise: سال مالی خودکار ساخته می‌شود (الزامی)
 * - professional: اختیاری — چیزی ساخته نمی‌شود
 * - basic: نیازی نیست
 *
 * @param prismaClient - Prisma Client (db.client)
 * @param tenantId - شناسه Tenant
 * @param planTierName - نام پلن ('enterprise' | 'professional' | 'simple')
 * @returns { created: boolean; year?: any; reason?: string }
 */
export async function ensureFiscalYearForTenant(
  prismaClient: any,
  tenantId: string,
  planTierName: string
): Promise<{ created: boolean; year?: any; reason?: string }> {
  // ★ فقط پلن سازمانی نیاز به سال مالی خودکار دارد
  if (planTierName !== 'enterprise') {
    return {
      created: false,
      reason: planTierName === 'professional'
        ? 'پلن حرفه‌ای — سال مالی اختیاری است'
        : 'پلن ساده — نیازی به سال مالی نیست',
    }
  }

  // ★ بررسی وجود مدل fiscalYear در Prisma Client
  if (!prismaClient || !prismaClient.fiscalYear) {
    console.warn('[AutoFiscalYear] fiscalYear model not available — skipping')
    return { created: false, reason: 'مدل FiscalYear در Prisma Client موجود نیست' }
  }

  // ★ بررسی اینکه آیا سال مالی فعالی وجود دارد
  let existingActive: any = null
  try {
    existingActive = await prismaClient.fiscalYear.findFirst({
      where: { tenantId, isActive: true, isClosed: false },
    })
  } catch (err: any) {
    console.warn('[AutoFiscalYear] Cannot query fiscalYear:', err?.message)
    return { created: false, reason: 'خطا در query دیتابیس' }
  }

  if (existingActive) {
    return {
      created: false,
      reason: 'سال مالی فعال از قبل وجود دارد',
      year: existingActive,
    }
  }

  // ★ محاسبه تاریخ شروع و پایان سال مالی
  // استراتژی: شروع از امروز شمسی، پایان = آخرین روز سال شمسی جاری
  const now = new Date()
  const [currentJy, currentJm, currentJd] = gregorianToJalali(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate()
  )

  // ★ نام سال: «سال مالی YYYY» (با سال شمسی فارسی)
  const yearName = `سال مالی ${toFaNum(currentJy)}`

  // ★ تاریخ شروع: امروز شمسی → میلادی ISO
  const [startGy, startGm, startGd] = jalaliToGregorian(currentJy, currentJm, currentJd)
  const startDate = new Date(
    Date.UTC(startGy, startGm - 1, startGd, 0, 0, 0, 0)
  )

  // ★ تاریخ پایان: آخرین روز سال شمسی جاری (۲۹ یا ۳۰ اسفند)
  const lastDayOfEsfand = daysInJalaliMonth(currentJy, 12)
  const [endGy, endGm, endGd] = jalaliToGregorian(currentJy, 12, lastDayOfEsfand)
  const endDate = new Date(
    Date.UTC(endGy, endGm - 1, endGd, 23, 59, 59, 999)
  )

  // ★ بررسی نام تکراری (اگر کاربر قبلاً سالی با همین نام ساخته و حذف نکرده)
  let finalName = yearName
  try {
    const existingWithName = await prismaClient.fiscalYear.findFirst({
      where: { tenantId, name: yearName },
    })
    if (existingWithName) {
      // ★ به‌جای خطا، نام را با ماه شروع اضافه می‌کنیم
      const JALALI_MONTHS = [
        'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
        'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
      ]
      finalName = `سال مالی ${toFaNum(currentJy)} (شروع از ${JALALI_MONTHS[currentJm - 1]})`
    }
  } catch (err: any) {
    console.warn('[AutoFiscalYear] Cannot check duplicate name:', err?.message)
  }

  // ★ ایجاد سال مالی
  try {
    const newYear = await prismaClient.fiscalYear.create({
      data: {
        tenantId,
        name: finalName,
        startDate,
        endDate,
        isActive: true,
        isClosed: false,
        notes: `ایجاد خودکار هنگام ثبت‌نام (${now.toISOString().split('T')[0]})`,
      },
    })

    console.log('[AutoFiscalYear] ✅ Created for tenant:', tenantId, {
      name: newYear.name,
      startDate: newYear.startDate,
      endDate: newYear.endDate,
    })

    return { created: true, year: newYear }
  } catch (err: any) {
    console.error('[AutoFiscalYear] ❌ Creation failed:', err?.message)
    return { created: false, reason: err?.message || 'خطا در ایجاد سال مالی' }
  }
}

/**
 * helper ساده برای استفاده در API routes
 * این تابع در شروع API صدا زده می‌شود تا مطمئن شویم سال مالی فعال وجود دارد
 *
 * @example
 * ```ts
 * import { getOrCreateActiveFiscalYear } from '@/lib/auto-fiscal-year'
 * const fiscalYear = await getOrCreateActiveFiscalYear(db.client, tenantId, 'enterprise')
 * ```
 */
export async function getOrCreateActiveFiscalYear(
  prismaClient: any,
  tenantId: string,
  planTierName: string
): Promise<any | null> {
  // ★ اول تلاش کن سال فعال را پیدا کن
  try {
    if (!prismaClient || !prismaClient.fiscalYear) return null

    const existing = await prismaClient.fiscalYear.findFirst({
      where: { tenantId, isActive: true, isClosed: false },
    })
    if (existing) return existing
  } catch {
    // ignore
  }

  // ★ اگر نبود، تلاش کن یکی بساز (فقط برای enterprise)
  const result = await ensureFiscalYearForTenant(prismaClient, tenantId, planTierName)
  return result.year || null
}
