// ============================================================================
// src/lib/jalali-utils.ts
// ShopAccounting — توابع کمکی تبدیل تاریخ شمسی-میلادی + زمان‌بندی شمسی
// منبع اصلی تبدیل: jalaali-js (MIT License)
// ============================================================================

// ★ توابع کمکی ریاضی
function _div(a: number, b: number): number {
  return ~~(a / b)
}

function _rem(a: number, b: number): number {
  return a - ~~(a / b) * b
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function pad4(n: number): string {
  return String(n).padStart(4, '0')
}

// ★ الگوریتم اصلی jalCal
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

// ★ تبدیل میلادی به Julian Day Number
function _g2d(gy: number, gm: number, gd: number): number {
  let d =
    _div((gy + _div(gm - 8, 6) + 100100) * 1461, 4) +
    _div(153 * _rem(gm + 9, 12) + 2, 5) +
    gd -
    34840408
  d = d - _div(_div(gy + 100100 + _div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

// ★ تبدیل Julian Day Number به میلادی
function _d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631
  j = j + _div(_div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = _div(_rem(j, 1461), 4) * 5 + 308
  const gd = _div(_rem(i, 153), 5) + 1
  const gm = _rem(_div(i, 153), 12) + 1
  const gy = _div(j, 1461) - 100100 + _div(8 - gm, 6)
  return { gy, gm, gd }
}

// ★ تبدیل شمسی به Julian Day Number
function _j2d(jy: number, jm: number, jd: number): number {
  const r = _jalCal(jy)
  return (
    _g2d(r.gy, 3, r.march) +
    (jm - 1) * 31 -
    _div(jm, 7) * (jm - 7) +
    jd -
    1
  )
}

// ★ تبدیل Julian Day Number به شمسی
function _d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = _d2g(jdn).gy
  let jy = gy - 621
  const r = _jalCal(jy)
  const jdn1f = _g2d(gy, 3, r.march)

  let k = jdn - jdn1f
  if (k >= 0) {
    if (k <= 185) {
      const jm = 1 + _div(k, 31)
      const jd = _rem(k, 31) + 1
      return { jy, jm, jd }
    } else {
      k -= 186
    }
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }

  const jm = 7 + _div(k, 30)
  const jd = _rem(k, 30) + 1
  return { jy, jm, jd }
}

// ═══════════════════════════════════════════════════════════════
// توابع عمومی (Public API)
// ═══════════════════════════════════════════════════════════════

export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
]

export const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

// تبدیل تاریخ شمسی (jy, jm, jd) به میلادی ISO (YYYY-MM-DD)
export function jalaliToGregorianISO(jy: number, jm: number, jd: number): string {
  try {
    const r = _d2g(_j2d(jy, jm, jd))
    return `${pad4(r.gy)}-${pad2(r.gm)}-${pad2(r.gd)}`
  } catch {
    return ''
  }
}

// تبدیل ISO میلادی (YYYY-MM-DD) به شمسی [jy, jm, jd]
export function gregorianISOToJalali(iso: string): [number, number, number] | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const gy = parseInt(m[1], 10)
  const gm = parseInt(m[2], 10)
  const gd = parseInt(m[3], 10)
  try {
    const r = _d2j(_g2d(gy, gm, gd))
    return [r.jy, r.jm, r.jd]
  } catch {
    return null
  }
}

// تبدیل رشته شمسی «1403/05/12» یا «۱۴۰۳/۰۵/۱۲» به ISO میلادی
// ★ فقط سال‌های شمسی معقول را می‌پذیرد تا میلادی اشتباه تبدیل نشود
export function parseJalaliString(jalali: string): string | null {
  const normalized = String(jalali || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٤٥٦٨٩'.indexOf(d)))
    .trim()

  const m = normalized.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (!m) return null

  const jy = parseInt(m[1], 10)
  const jm = parseInt(m[2], 10)
  const jd = parseInt(m[3], 10)

  if (jy < 1000 || jy > 1700) return null
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null

  return jalaliToGregorianISO(jy, jm, jd)
}

// گرفتن تاریخ امروز به ISO میلادی
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// تبدیل اعداد به فارسی
export const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰'
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

// نسخه سازگار با کامپوننت‌ها
export const toPersianDigits = (
  val: string | number | null | undefined
): string => {
  if (val === null || val === undefined) return '—'
  return String(val).replace(/\d/g, (d) => '۰۱۳۴۵۷۸۹'[parseInt(d)])
}

// گرفتن تاریخ امروز به شمسی «۱۴۰۳/۰۵/۱۲»
export function todayJalali(): string {
  const iso = todayISO()
  const j = gregorianISOToJalali(iso)
  if (!j) return ''
  return `${toFaNum(j[0])}/${toFaNum(pad2(j[1]))}/${toFaNum(pad2(j[2]))}`
}

// تبدیل ISO به شمسی فارسی «۱۴۳/۰۵/۱۲»
export function isoToJalaliFa(iso: string | null | undefined): string {
  if (!iso) return '—'
  const j = gregorianISOToJalali(String(iso).slice(0, 10))
  if (!j) return '—'
  return `${toFaNum(j[0])}/${toFaNum(pad2(j[1]))}/${toFaNum(pad2(j[2]))}`
}

// ═══════════════════════════════════════════════════════════════
// توابع کمکی تاریخ/زمان محلی
// ═══════════════════════════════════════════════════════════════

function localISODate(d: Date): string {
  return `${pad4(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}`
}

function toEnglishDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

// نرمال‌سازی ورودی‌های مختلف به ISO میلادی YYYY-MM-DD
export function normalizeDateToISO(value: any): string | null {
  if (value === null || value === undefined || value === '') return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return localISODate(value)
  }

  const raw = String(value).trim()
  if (!raw) return null

  const en = toEnglishDigits(raw)

  // YYYY-MM-DD یا YYYY/MM/DD
  const ymd = en.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (ymd) {
    const y = Number(ymd[1])
    const m = Number(ymd[2])
    const d = Number(ymd[3])

    // میلادی معاصر
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${pad4(y)}-${pad2(m)}-${pad2(d)}`
    }

    // شمسی
    if (y >= 1000 && y <= 1700) {
      const jalaliIso = parseJalaliString(en)
      if (jalaliIso) return jalaliIso
    }
  }

  // timestamp میلی‌ثانیه
  if (/^\d{10,}$/.test(en)) {
    const d = new Date(Number(en))
    if (!Number.isNaN(d.getTime())) return localISODate(d)
  }

  // تلاش نهایی با Date
  const d = new Date(raw)
  if (!Number.isNaN(d.getTime())) return localISODate(d)

  return null
}

// شروع روز محلی
export function startOfDay(value: any): Date {
  const iso = normalizeDateToISO(value)

  if (iso) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  const d = value instanceof Date ? new Date(value) : new Date(value)
  if (!Number.isNaN(d.getTime())) {
    d.setHours(0, 0, 0, 0)
    return d
  }

  return new Date(NaN)
}

// پارس امن تاریخ به Date محلی
export function parseLocalDate(value: any): Date | null {
  const d = startOfDay(value)
  return Number.isNaN(d.getTime()) ? null : d
}

// ═══════════════════════════════════════════════════════════════
// تقویم شمسی کمکی
// ═══════════════════════════════════════════════════════════════

export function isJalaliLeapYear(jy: number): boolean {
  try {
    return _jalCal(jy).leap === 0
  } catch {
    return false
  }
}

export function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm < 1 || jm > 12) return 0
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isJalaliLeapYear(jy) ? 30 : 29
}

function addJalaliMonths(
  jy: number,
  jm: number,
  months: number
): [number, number] {
  const total = jy * 12 + (jm - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return [ny, nm]
}

function jalaliToDate(jy: number, jm: number, jd: number): Date {
  const maxDay = daysInJalaliMonth(jy, jm)
  const safeDay = Math.max(1, Math.min(jd, maxDay || 1))

  try {
    const r = _d2g(_j2d(jy, jm, safeDay))
    return new Date(r.gy, r.gm - 1, r.gd)
  } catch {
    return new Date(NaN)
  }
}

// اولین روز شمسی دوره‌ای >= تاریخ مبنا
export function nextJalaliPeriodicDay(
  from: Date,
  day: number,
  intervalMonths: number
): Date {
  const start = startOfDay(from)
  if (Number.isNaN(start.getTime())) return start

  const iso = localISODate(start)
  const j = gregorianISOToJalali(iso)
  if (!j) return start

  let [jy, jm] = j
  const requestedDay = Math.max(1, Math.min(31, Math.floor(day || 1)))

  let candidate = jalaliToDate(jy, jm, requestedDay)
  let guard = 0

  while (
    (Number.isNaN(candidate.getTime()) || candidate < start) &&
    guard < 240
  ) {
    const [ny, nm] = addJalaliMonths(jy, jm, intervalMonths)
    jy = ny
    jm = nm
    candidate = jalaliToDate(jy, jm, requestedDay)
    guard++
  }

  return candidate
}

// اولین تاریخ سالانه شمسی >= تاریخ مبنا
export function nextJalaliYearlyDate(
  from: Date,
  monthOfYear: number,
  dayOfMonth: number
): Date {
  const start = startOfDay(from)
  if (Number.isNaN(start.getTime())) return start

  const iso = localISODate(start)
  const j = gregorianISOToJalali(iso)
  if (!j) return start

  let jy = j[0]
  const jm = Math.max(1, Math.min(12, Math.floor(monthOfYear || 1)))
  const jd = Math.max(1, Math.min(31, Math.floor(dayOfMonth || 1)))

  let candidate = jalaliToDate(jy, jm, jd)
  let guard = 0

  while (
    (Number.isNaN(candidate.getTime()) || candidate < start) &&
    guard < 20
  ) {
    jy++
    candidate = jalaliToDate(jy, jm, jd)
    guard++
  }

  return candidate
}

// ═══════════════════════════════════════════════════════════════
// محاسبه تاریخ اجرای بعدی اسناد تکرارشونده
// ═══════════════════════════════════════════════════════════════

export function calculateNextExecutionDate(
  frequency: string,
  dayOfMonth: number | null,
  dayOfWeek: number | null,
  monthOfYear: number | null,
  fromDate: Date = new Date()
): Date {
  const from = startOfDay(fromDate)
  const base = Number.isNaN(from.getTime()) ? startOfDay(new Date()) : from

  switch (frequency) {
    case 'weekly': {
      const targetDay = typeof dayOfWeek === 'number' ? dayOfWeek : 1
      const currentDay = base.getDay()
      let diff = targetDay - currentDay
      if (diff < 0) diff += 7

      const next = new Date(base)
      next.setDate(next.getDate() + diff)
      return startOfDay(next)
    }

    case 'monthly':
      return nextJalaliPeriodicDay(base, dayOfMonth ?? 1, 1)

    case 'quarterly':
      return nextJalaliPeriodicDay(base, dayOfMonth ?? 1, 3)

    case 'yearly':
      return nextJalariYearlyDate(base, monthOfYear ?? 1, dayOfMonth ?? 1)

    default:
      return nextJalaliPeriodicDay(base, 1, 1)
  }
}

// alias امن در صورت typo
function nextJalariYearlyDate(
  from: Date,
  monthOfYear: number,
  dayOfMonth: number
): Date {
  return nextJalaliYearlyDate(from, monthOfYear, dayOfMonth)
}

// ═══════════════════════════════════════════════════════════════
// سال مالی
// ═══════════════════════════════════════════════════════════════

export function findFiscalYearForDateFromList(
  fys: any[],
  date: any
): any | null {
  if (!Array.isArray(fys) || fys.length === 0) return null

  const d = startOfDay(date)
  if (Number.isNaN(d.getTime())) return null

  const t = d.getTime()

  return (
    fys.find((fy: any) => {
      const s = startOfDay(fy?.startDate)
      const e = startOfDay(fy?.endDate)

      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false

      return s.getTime() <= t && t <= e.getTime()
    }) || null
  )
}

// ═══════════════════════════════════════════════════════════════
// فرمت نمایشی
// ═══════════════════════════════════════════════════════════════

export function formatDateJalali(value: any): string {
  const iso = normalizeDateToISO(value)
  return isoToJalaliFa(iso)
}

export function formatDateLongJalali(value: any): string {
  const iso = normalizeDateToISO(value)
  if (!iso) return '—'

  const j = gregorianISOToJalali(iso)
  if (!j) return '—'

  const monthName = JALALI_MONTHS[j[1] - 1] || ''
  return `${toPersianDigits(j[2])} ${monthName} ${toPersianDigits(j[0])}`
}