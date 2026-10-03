// ============================================================================
// src/lib/check-printer/sayadi-template.ts
// ShopAccounting — قالب چک صیادی (۱۷۰×۸۷mm) - نسخه نهایی با تصحیح دستی
// ★ تغییرات اعمال شده:
// 1. تاریخ به حروف: 6 میلی‌متر بالاتر رفت (Y کاهش یافت)
// 2. در وجه: 3 میلی‌متر بالاتر رفت (Y کاهش یافت)
// 3. کد ملی: 20 میلی‌متر به سمت راست منتقل شد (X افزایش یافت)
// 4. مبلغ به عدد: 9 میلی‌متر به سمت چپ منتقل شد (X کاهش یافت)
// ============================================================================

export interface CheckField {
  id: string
  label: string
  /** فاصله از لبه چپ کاغذ (میلی‌متر) */
  x: number
  /** فاصله از لبه بالای کاغذ (میلی‌متر) */
  y: number
  /** عرض مجاز برای متن/خانه‌ها (میلی‌متر) */
  width: number
  height?: number
  fontSize: number
  fontWeight: 'normal' | 'bold' | 'black'
  align: 'left' | 'center' | 'right'
  type: 'text' | 'number' | 'date' | 'words' | 'digits'
  digitWidth?: number
  digitHeight?: number
  maxDigits?: number
}

export interface CheckTemplate {
  id: string
  name: string
  description: string
  width: number
  height: number
  fontFamily: string
  fields: CheckField[]
}

const W = 170 // عرض کل چک
const H = 87  // ارتفاع کل چک

// ─── پارامترهای ثابت (با تصحیح‌های کاربر) ──────────────────

// ۱. تاریخ: بالا 21mm، راست 35mm
// ★★ اصلاح کاربر: 6 میلی‌متر بالاتر => Y جدید = 21 - 6 = 15 mm
const DATE_Y = 15 
const DATE_RIGHT_MARGIN = 35 
const DATE_X = 0
const DATE_WIDTH = W - DATE_RIGHT_MARGIN // 135mm
const DATE_FONT_SIZE = 7

// ۲. مبلغ حروف: بالا 32mm، راست 45mm
// (بدون تغییر عمودی یا افقی طبق درخواست اخیر)
const AMOUNT_WORDS_Y = 32
const AMOUNT_WORDS_RIGHT_MARGIN = 45
const AMOUNT_WORDS_X = 0
const AMOUNT_WORDS_WIDTH = W - AMOUNT_WORDS_RIGHT_MARGIN // 125mm
const AMOUNT_WORDS_FONT_SIZE = 9

// ۳. در وجه: بالا 42mm، راست 20mm
// ★★ اصلاح کاربر: 3 میلی‌متر بالاتر => Y جدید = 42 - 3 = 39 mm
const PAYEE_Y = 39 
const PAYEE_RIGHT_MARGIN = 20
// موقعیت افقی در وجه تغییری نکرد، اما چون کد ملی جابجا شد، باید مطمئن شویم تداخل نداشته باشند.
// کد ملی قبلا تا x=35 بود. حالا 20mm به راست رفته => تا x=55.
// پس در وجه باید از x=55 شروع شود تا روی کد ملی نیفتد.
const PAYEE_START_X = 55 
const PAYEE_END_X = W - PAYEE_RIGHT_MARGIN // 150mm
const PAYEE_WIDTH = PAYEE_END_X - PAYEE_START_X // 95mm
const PAYEE_FONT_SIZE = 9

// ۴. کد ملی / شناسه ملی
// شرط اصلی: لبه راست بلوک در 35mm از چپ بود (یعنی 135mm از راست).
// ★★ اصلاح کاربر: 20 میلی‌متر به سمت راست => X جدید = 35 + 20 = 55 mm (لبه راست)
// اگر لبه راست در 55mm باشد و عرض بلوک 33mm باشد:
// لبه چپ (x) = 55 - 33 = 22 mm.
const NATIONAL_ID_Y = 42 // ارتفاع کد ملی تغییر نکرد (همان خط اصلی)، اما چون در وجه بالا رفت، شاید بهتر باشد کد ملی هم کمی پایین بیاید؟
// خیر، کاربر گفت فقط "به سمت راست هدایت بشه". پس Y ثابت می‌ماند مگر اینکه بگوید.
// اما توجه کنید: در وجه الان در Y=39 است. کد ملی در Y=42 است.
// یعنی کد ملی 3 میلی‌متر پایین‌تر از در وجه قرار می‌گیرد. این خوب است و تداخل ندارند.
const NATIONAL_ID_DIGIT_WIDTH = 3.0
const NATIONAL_ID_MAX_DIGITS = 11
const NATIONAL_ID_TOTAL_WIDTH = NATIONAL_ID_DIGIT_WIDTH * NATIONAL_ID_MAX_DIGITS // 33mm
// محاسبه X جدید:
// لبه راست قدیمی = 35.
// حرکت به راست = +20.
// لبه راست جدید = 55.
// لبه چپ جدید (x) = 55 - 33 = 22.
const NATIONAL_ID_X = 22 
const NATIONAL_ID_FONT_SIZE = 7.5

// ۵. مبلغ عددی: بالا 63mm، چپ 11mm
// ★★ اصلاح کاربر: 9 میلی‌متر به سمت چپ => X جدید = 11 - 9 = 2 mm
const AMOUNT_NUMBER_Y = 63
const AMOUNT_NUMBER_X = -1 // ★★ 3 میلی‌متر به سمت چپ (از 2 به -1)
const AMOUNT_NUMBER_DIGIT_WIDTH = 5 // ★★ دقیقاً 4 میلی‌متر
const AMOUNT_NUMBER_MAX_DIGITS = 15
const AMOUNT_NUMBER_TOTAL_WIDTH = AMOUNT_NUMBER_DIGIT_WIDTH * AMOUNT_NUMBER_MAX_DIGITS // 60mm
const AMOUNT_NUMBER_FONT_SIZE = 10


export const SAYADI_PURPLE_TEMPLATE: CheckTemplate = {
  id: 'sayadi-purple',
  name: 'چک صیادی',
  description: 'استاندارد ۱۷۰×۸۷ میلی‌متر',
  width: W,
  height: H,
  fontFamily: 'Tahoma, Arial, sans-serif',

  fields: [
    // ─── ۱. تاریخ به حروف ──────────────────────────────────────
    {
      id: 'date_words',
      label: 'تاریخ',
      x: DATE_X,
      y: DATE_Y, // 15 mm (6mm بالاتر از قبل)
      width: DATE_WIDTH,
      height: 6,
      fontSize: DATE_FONT_SIZE,
      fontWeight: 'bold',
      align: 'right',
      type: 'date',
    },

    // ─── ۲. مبلغ به حروف + ریال ───────────────────────────────
    {
      id: 'amount_words',
      label: 'مبلغ به حروف',
      x: AMOUNT_WORDS_X,
      y: AMOUNT_WORDS_Y,
      width: AMOUNT_WORDS_WIDTH,
      height: 7,
      fontSize: AMOUNT_WORDS_FONT_SIZE,
      fontWeight: 'bold',
      align: 'right',
      type: 'words',
    },

    // ─── ۳. در وجه ─────────────────────────────────────────────
    {
      id: 'payee',
      label: 'در وجه',
      x: PAYEE_START_X, // 55 mm (شروع بعد از کد ملی جدید)
      y: PAYEE_Y,       // 39 mm (3mm بالاتر از قبل)
      width: PAYEE_WIDTH,
      height: 7,
      fontSize: PAYEE_FONT_SIZE,
      fontWeight: 'bold',
      align: 'right',
      type: 'text',
    },

    // ─── ۴. کد ملی / شناسه ملی ─────────────────────────────────
    {
      id: 'national_id',
      label: 'کد ملی',
      x: NATIONAL_ID_X, // 22 mm (20mm به سمت راست از حالت قبلی)
      y: NATIONAL_ID_Y,
      width: NATIONAL_ID_TOTAL_WIDTH,
      height: 6,
      fontSize: NATIONAL_ID_FONT_SIZE,
      fontWeight: 'bold',
      align: 'left', 
      type: 'digits',
      digitWidth: NATIONAL_ID_DIGIT_WIDTH,
      digitHeight: 6,
      maxDigits: NATIONAL_ID_MAX_DIGITS,
    },

    // ─── ۵. مبلغ به عدد داخل خانه‌ها ──────────────────────────
    {
      id: 'amount_number',
      label: 'مبلغ به عدد',
      x: AMOUNT_NUMBER_X, // 2 mm (9mm به سمت چپ از حالت قبلی)
      y: AMOUNT_NUMBER_Y,
      width: AMOUNT_NUMBER_TOTAL_WIDTH,
      height: 6,
      fontSize: AMOUNT_NUMBER_FONT_SIZE,
      fontWeight: 'bold',
      align: 'left',
      type: 'digits',
      digitWidth: AMOUNT_NUMBER_DIGIT_WIDTH,
      digitHeight: 6,
      maxDigits: AMOUNT_NUMBER_MAX_DIGITS,
    },
  ],
}

export function getDefaultCheckTemplate(): CheckTemplate {
  return SAYADI_PURPLE_TEMPLATE
}