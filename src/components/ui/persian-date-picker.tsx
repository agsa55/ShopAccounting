// ============================================================================
// src/components/ui/persian-date-picker.tsx — Persian (Jalali) Date Picker
// ============================================================================
// ★★★ v3.27: بازنویسی با inline styles (مطابق reports-page.tsx)
//
// این نسخه از inline styles استفاده می‌کند (نه Tailwind classes) تا بدون
// وابستگی به تنظیمات tailwind.config.js کار کند.
//
// ویژگی‌ها:
//   - تقویم شمسی کامل با الگوریتم تبدیل معتبر (jalCal)
//   - ناوبری ماه/سال قبل و بعد
//   - اعتبارسنجی minDate / maxDate
//   - دکمه «امروز»
//   - نمایش روز جمعه با رنگ متمایز
//   - تم رنگی lilac/lavender (مطابق reports-page.tsx)
//   - پشتیبانی از بازه (from / to) در PersianDateRangePicker
//   - بدون وابستگی به کتابخانه خارجی
// ============================================================================

'use client'

import * as React from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
//  ثابت‌ها
// ═══════════════════════════════════════════════════════════════

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد',
  'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر',
  'دی', 'بهمن', 'اسفند',
] as const

export const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const

// ★ تم رنگی lilac/lavender (مطابق reports-page.tsx) — با inline styles
export const LILAC = {
  popupBg: '#faf7ff',
  popupBgSolid: '#ffffff',
  headerBg: '#ede9fe',
  weekendBg: '#f5f0ff',
  textPrimary: '#4c1d95',
  textSecondary: '#7c3aed',
  textMuted: '#a78bfa',
  textDisabled: '#d1d5db',
  textOnAccent: '#ffffff',
  border: '#e9d5ff',
  borderSelected: '#7c3aed',
  accent: '#7c3aed',
  accentHover: '#6d28d9',
  accentLight: '#ede9fe',
  accentSoft: '#ddd6fe',
  todayBorder: '#a78bfa',
  todayText: '#6d28d9',
}

// استایل دکمه‌های ناوبری ماه
export const navBtnStyle: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: 4,
  border: 'none',
  background: 'transparent',
  color: LILAC.textSecondary,
  fontSize: 12,
  cursor: 'pointer',
  transition: 'background-color 0.1s',
  lineHeight: 1,
}

// ═══════════════════════════════════════════════════════════════
//  توابع کمکی تبدیل تاریخ
// ═══════════════════════════════════════════════════════════════

export function toFaNum(n: number | string): string {
  const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  return String(n).replace(/\d/g, (d) => faDigits[parseInt(d, 10)])
}

export function fromFaNum(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
}

// ============================================================================
//  ★★★ الگوریتم صحیح تبدیل تاریخ شمسی-میلادی (Jalaali.js v1.1.0)
//
//  منبع: https://github.com/jalaali/jalaali-js
//  نویسنده: Behrang Noruzi Niya
//  لایسنس: MIT
//
//  این الگوریتم از Julian Day Number (JDN) استفاده می‌کند که دقیق‌ترین
//  روش تبدیل تاریخ است. نسخه قبلی که از محاسبه دستی march استفاده می‌کرد،
//  در پایان سال شمسی (اسفند) دچار خطای یک‌روزه/یک‌ساله می‌شد.
// ============================================================================

// ★ توابع کمکی ریاضی (مطابق jalaali-js)
function div(a: number, b: number): number {
  return ~~(a / b)
}

function rem(a: number, b: number): number {
  return a - ~~(a / b) * b
}

// ★ الگوریتم اصلی jalCal (محاسبه march و leap)
function jalCal(jy: number): { leap: number; gy: number; march: number } {
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
    leapJ = leapJ + div(jump, 33) * 8 + div(rem(jump, 33), 4)
    jp = jm
  }
  let n = jy - jp

  leapJ = leapJ + div(n, 33) * 8 + div(rem(n, 33) + 3, 4)
  if (rem(jump, 33) === 4 && jump - n === 4) leapJ += 1

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = rem(rem(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4

  return { leap, gy, march }
}

export function isJalaliLeapYear(jy: number): boolean {
  try {
    return jalCal(jy).leap === 0
  } catch {
    return false
  }
}

// ★ تبدیل میلادی به Julian Day Number
function g2d(gy: number, gm: number, gd: number): number {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * rem(gm + 9, 12) + 2, 5) + gd - 34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

// ★ تبدیل Julian Day Number به میلادی
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(rem(j, 1461), 4) * 5 + 308
  const gd = div(rem(i, 153), 5) + 1
  const gm = rem(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

// ★ تبدیل شمسی به Julian Day Number
function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy)
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
}

// ★ تبدیل Julian Day Number به شمسی
function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = d2g(jdn).gy
  let jy = gy - 621
  const r = jalCal(jy)
  const jdn1f = g2d(gy, 3, r.march)

  let k = jdn - jdn1f
  if (k >= 0) {
    if (k <= 185) {
      const jm = 1 + div(k, 31)
      const jd = rem(k, 31) + 1
      return { jy, jm, jd }
    } else {
      k -= 186
    }
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }

  const jm = 7 + div(k, 30)
  const jd = rem(k, 30) + 1
  return { jy, jm, jd }
}

// ★ توابع عمومی (API قدیمی حفظ شده برای backward compatibility)
export function jalCalExport(jy: number): { leap: number; gy: number; march: number } {
  return jalCal(jy)
}

export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const r = d2j(g2d(gy, gm, gd))
  return [r.jy, r.jm, r.jd]
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  const r = d2g(j2d(jy, jm, jd))
  return [r.gy, r.gm, r.gd]
}

export function daysInJalaliMonth(jy: number, jm: number): number {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isJalaliLeapYear(jy) ? 30 : 29
}

// تبدیل ISO (YYYY-MM-DD) به شمسی
export function isoToJalali(iso: string | null | undefined): { jy: number; jm: number; jd: number } | null {
  if (!iso) return null
  try {
    // ★★★ اصلاح باگ یک روز عقب افتادن:
    // اگر رشته زمان (T) نداشت، ساعت ۱۲ ظهر را به آن اضافه می‌کنیم تا 
    // تبدیل UTC به Local Time باعث عقب رفتن روز نشود.
    const safeDateStr = iso.includes('T') ? iso : `${iso}T12:00:00`
    
    const d = new Date(safeDateStr)
    if (isNaN(d.getTime())) return null
    
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    return { jy, jm, jd }
  } catch {
    return null
  }
}

// تبدیل شمسی به ISO
export function jalaliToISO(jy: number, jm: number, jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd)
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`
}

// فرمت‌بندی کوتاه: ۱۴۰۳/۰۵/۱۲
export function formatJalali(iso: string | null | undefined): string {
  if (!iso) return '—'
  const j = isoToJalali(iso)
  if (!j) return '—'
  return `${toFaNum(j.jy)}/${toFaNum(j.jm).padStart(2, '۰')}/${toFaNum(j.jd).padStart(2, '۰')}`
}

// فرمت‌بندی طولانی: ۱۲ مرداد ۱۴۰۳
export function formatJalaliLong(iso: string | null | undefined): string {
  if (!iso) return '—'
  const j = isoToJalali(iso)
  if (!j) return '—'
  return `${toFaNum(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${toFaNum(j.jy)}`
}

// ═══════════════════════════════════════════════════════════════
//  PersianDatePicker — تک‌تاریخ با popup (inline styles)
// ═══════════════════════════════════════════════════════════════

export interface PersianDatePickerProps {
  /** ISO date (YYYY-MM-DD) یا null */
  value: string | null
  /** وقتی تاریخ انتخاب می‌شود (با ISO) یا پاک می‌شود (با null) */
  onChange: (iso: string | null) => void
  placeholder?: string
  /** برچسب بالای فیلد */
  label?: string
  minDate?: string | null  // ISO
  maxDate?: string | null  // ISO
  disabled?: boolean
  className?: string
  /** رنگ accent (پیش‌فرض: بنفش lilac) */
  theme?: typeof LILAC
}

export function PersianDatePicker({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ',
  label,
  minDate,
  maxDate,
  disabled,
  className,
  theme = LILAC,
}: PersianDatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const displayText = React.useMemo(() => {
    if (!value) return ''
    const j = isoToJalali(value)
    if (!j) return ''
    return `${toFaNum(j.jy)}/${toFaNum(j.jm).padStart(2, '۰')}/${toFaNum(j.jd).padStart(2, '۰')}`
  }, [value])

  const todayJalali = React.useMemo(() => {
    const now = new Date()
    const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
    return { jy, jm, jd, iso: now.toISOString().split('T')[0] }
  }, [])

  const initial = React.useMemo(() => {
    const j = value ? isoToJalali(value) : null
    return j || { jy: todayJalali.jy, jm: todayJalali.jm, jd: todayJalali.jd }
  }, [value, todayJalali])

  const [viewYear, setViewYear] = React.useState<number>(initial.jy)
  const [viewMonth, setViewMonth] = React.useState<number>(initial.jm)

  React.useEffect(() => {
    const j = value ? isoToJalali(value) : null
    if (j) {
      setViewYear(j.jy)
      setViewMonth(j.jm)
    }
  }, [value])

  // بستن popup با کلیک خارج
  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const daysCount = daysInJalaliMonth(viewYear, viewMonth)

  const firstDayOffset = React.useMemo(() => {
    const [gy, gm, gd] = jalaliToGregorian(viewYear, viewMonth, 1)
    const jsDay = new Date(gy, gm - 1, gd).getDay()
    return (jsDay + 1) % 7
  }, [viewYear, viewMonth])

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOffset; i++) cells.push(null)
  for (let d = 1; d <= daysCount; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedJalali = value ? isoToJalali(value) : null

  const isDayDisabled = (jd: number): boolean => {
    const cellIso = jalaliToISO(viewYear, viewMonth, jd)
    if (minDate && cellIso < minDate) return true
    if (maxDate && cellIso > maxDate) return true
    return false
  }

  const goPrevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }
  const goNextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }
  const goPrevYear = () => setViewYear((y) => y - 1)
  const goNextYear = () => setViewYear((y) => y + 1)

  const pickToday = () => {
    onChange(todayJalali.iso)
    setOpen(false)
  }

  const handleDayClick = (jd: number) => {
    if (isDayDisabled(jd)) return
    onChange(jalaliToISO(viewYear, viewMonth, jd))
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }} className={className}>
      {label && (
        <p style={{ fontSize: 10, color: theme.textMuted, marginBottom: 3, fontWeight: 500 }}>{label}</p>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          height: 32,
          padding: '0 10px',
          borderRadius: 6,
          border: `1px solid ${theme.border}`,
          backgroundColor: theme.popupBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 12,
          opacity: disabled ? 0.6 : 1,
          transition: 'border-color 0.15s, background-color 0.15s',
        }}
        onMouseEnter={(e) => {
          if (disabled) return
          e.currentTarget.style.borderColor = theme.accent
          e.currentTarget.style.backgroundColor = theme.accentLight
        }}
        onMouseLeave={(e) => {
          if (disabled) return
          e.currentTarget.style.borderColor = theme.border
          e.currentTarget.style.backgroundColor = theme.popupBg
        }}
      >
        <CalendarIcon style={{ width: 14, height: 14, color: theme.textMuted, flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            textAlign: 'right',
            fontFamily: 'monospace',
            color: displayText ? theme.textPrimary : theme.textMuted,
            fontSize: 11,
          }}
          dir="ltr"
        >
          {displayText || placeholder}
        </span>
      </button>

      {open && !disabled && (
        <>
          {/* overlay برای بستن با کلیک خارج */}
          <div
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 40,
            }}
            onClick={() => setOpen(false)}
          />
          <div
            dir="rtl"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 3,
              zIndex: 50,
              width: 240,
              backgroundColor: theme.popupBgSolid,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              boxShadow: '0 8px 24px -4px rgba(124, 58, 237, 0.18), 0 4px 8px -2px rgba(124, 58, 237, 0.1)',
              padding: 10,
              overflow: 'hidden',
            }}
          >
            {/* هدر ناوبری */}
            <div style={{
              background: `linear-gradient(135deg, ${theme.headerBg} 0%, ${theme.accentSoft} 100%)`,
              margin: -10,
              marginBottom: 8,
              padding: '8px 10px',
              borderRadius: '10px 10px 0 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <button type="button" onClick={goPrevYear} title="سال قبل" style={navBtnStyle}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>«</button>
              <button type="button" onClick={goPrevMonth} title="ماه قبل" style={navBtnStyle}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>‹</button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: theme.textPrimary }}>
                {JALALI_MONTHS[viewMonth - 1]} {toFaNum(viewYear)}
              </div>
              <button type="button" onClick={goNextMonth} title="ماه بعد" style={navBtnStyle}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>›</button>
              <button type="button" onClick={goNextYear} title="سال بعد" style={navBtnStyle}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.5)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>»</button>
            </div>

            {/* روزهای هفته */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
              {PERSIAN_WEEKDAYS.map((w, i) => (
                <div key={i} style={{
                  textAlign: 'center',
                  fontSize: 10,
                  fontWeight: 600,
                  color: i === 6 ? theme.textSecondary : theme.textMuted,
                  padding: '2px 0',
                }}>{w}</div>
              ))}
            </div>

            {/* روزهای ماه */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={i} style={{ height: 24 }} />
                const isSelected = selectedJalali &&
                  selectedJalali.jy === viewYear &&
                  selectedJalali.jm === viewMonth &&
                  selectedJalali.jd === d
                const isToday = todayJalali.jy === viewYear && todayJalali.jm === viewMonth && todayJalali.jd === d
                const isFriday = i % 7 === 6
                const dayDisabled = isDayDisabled(d)
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={dayDisabled}
                    onClick={() => handleDayClick(d)}
                    style={{
                      height: 24,
                      borderRadius: 5,
                      fontSize: 11,
                      border: isSelected ? 'none' : (isToday ? `1px solid ${theme.todayBorder}` : 'none'),
                      backgroundColor: isSelected
                        ? theme.accent
                        : (isToday ? theme.accentLight : 'transparent'),
                      color: isSelected
                        ? theme.textOnAccent
                        : (dayDisabled ? theme.textDisabled : (isToday ? theme.todayText : (isFriday ? theme.textSecondary : theme.textPrimary))),
                      cursor: dayDisabled ? 'not-allowed' : 'pointer',
                      fontWeight: isSelected ? 700 : (isToday ? 600 : (isFriday ? 500 : 400)),
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      if (dayDisabled || isSelected) return
                      e.currentTarget.style.backgroundColor = theme.accentSoft
                    }}
                    onMouseLeave={(e) => {
                      if (dayDisabled || isSelected) return
                      e.currentTarget.style.backgroundColor = isToday ? theme.accentLight : 'transparent'
                    }}
                  >
                    {toFaNum(d)}
                  </button>
                )
              })}
            </div>

            {/* فوتر */}
            <div style={{
              marginTop: 8,
              paddingTop: 6,
              borderTop: `1px dashed ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <button
                type="button"
                onClick={pickToday}
                style={{
                  fontSize: 10,
                  color: theme.accent,
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                امروز: {toFaNum(todayJalali.jd)} {JALALI_MONTHS[todayJalali.jm - 1]} {toFaNum(todayJalali.jy)}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  fontSize: 10,
                  color: theme.textMuted,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                بستن ✕
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  PersianDateRangePicker — بازه (from / to)
// ═══════════════════════════════════════════════════════════════

export interface PersianDateRangePickerProps {
  from: string | null
  to: string | null
  onChange: (from: string | null, to: string | null) => void
  fromLabel?: string
  toLabel?: string
  className?: string
  disabled?: boolean
}

export function PersianDateRangePicker({
  from,
  to,
  onChange,
  fromLabel = 'از تاریخ',
  toLabel = 'تا تاریخ',
  className,
  disabled,
}: PersianDateRangePickerProps) {
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
      <div style={{ flex: 1 }}>
        <PersianDatePicker
          value={from}
          onChange={(v) => onChange(v, to)}
          placeholder="از تاریخ"
          label={fromLabel}
          maxDate={to || undefined}
          disabled={disabled}
        />
      </div>
      <div style={{ flex: 1 }}>
        <PersianDatePicker
          value={to}
          onChange={(v) => onChange(from, v)}
          placeholder="تا تاریخ"
          label={toLabel}
          minDate={from || undefined}
          disabled={disabled}
        />
      </div>
    </div>
  )
}

export default PersianDatePicker
