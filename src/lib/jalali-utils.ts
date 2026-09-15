// ============================================================================
// src/lib/jalali-utils.ts
// ShopAccounting — توابع کمکی تبدیل تاریخ شمسی-میلادی
// منبع: jalaali-js (MIT License)
// ============================================================================

// ★ توابع کمکی ریاضی
function _div(a: number, b: number): number {
  return ~~(a / b)
}

function _rem(a: number, b: number): number {
  return a - ~~(a / b) * b
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
    gd - 34840408
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
  return _g2d(r.gy, 3, r.march) + (jm - 1) * 31 - _div(jm, 7) * (jm - 7) + jd - 1
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

// تبدیل تاریخ شمسی (jy, jm, jd) به میلادی ISO (YYYY-MM-DD)
export function jalaliToGregorianISO(jy: number, jm: number, jd: number): string {
  try {
    const r = _d2g(_j2d(jy, jm, jd))
    return (
      String(r.gy).padStart(4, '0') + '-' +
      String(r.gm).padStart(2, '0') + '-' +
      String(r.gd).padStart(2, '0')
    )
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
export function parseJalaliString(jalali: string): string | null {
  const normalized = jalali
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim()
  const m = normalized.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (!m) return null
  const jy = parseInt(m[1], 10)
  const jm = parseInt(m[2], 10)
  const jd = parseInt(m[3], 10)
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null
  return jalaliToGregorianISO(jy, jm, jd)
}

// گرفتن تاریخ امروز به ISO میلادی
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// گرفتن تاریخ امروز به شمسی «۱۴۰۳/۰۵/۱۲»
export function todayJalali(): string {
  const iso = todayISO()
  const j = gregorianISOToJalali(iso)
  if (!j) return ''
  const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  const toFa = (n: number, len = 2) =>
    String(n).padStart(len, '0').replace(/\d/g, (d) => faDigits[parseInt(d, 10)])
  return `${toFa(j[0], 4)}/${toFa(j[1])}/${toFa(j[2])}`
}

// تبدیل ISO به شمسی فارسی «۱۴۰۳/۰۵/۱۲»
export function isoToJalaliFa(iso: string | null | undefined): string {
  if (!iso) return '—'
  const j = gregorianISOToJalali(iso.slice(0, 10))
  if (!j) return '—'
  const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  const toFa = (n: number, len = 2) =>
    String(n).padStart(len, '0').replace(/\d/g, (d) => faDigits[parseInt(d, 10)])
  return `${toFa(j[0], 4)}/${toFa(j[1])}/${toFa(j[2])}`
}

// تبدیل اعداد به فارسی
export const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰'
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}