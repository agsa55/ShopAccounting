// src/lib/pos-adapters/types.ts
// ShopAccounting v8.0 — Universal POS Adapter Types
// ============================================================================
// ★★★ این فایل تمام تایپ‌های مشترک بین adapter‌ها رو تعریف می‌کنه
// هر adapter (manual / keyboard-hid / web-serial / network-tcp) اینترفیس
// PosAdapter رو پیاده‌سازی می‌کنه تا از بیرون یکدست به نظر برسه.
// ============================================================================

/**
 * ★★★ v8.3: نوع اتصال کارتخوان ★★★
 *
 * - 'manual'         ورودی دستی شماره پیرو
 * - 'keyboard-hid'   حالت کیبورد (کارتخوان داده رو تایپ می‌کنه)
 * - 'web-serial'     اتصال USB/Serial با Web Serial API
 * - 'network-tcp'    اتصال TCP/IP به کارتخوان تحت شبکه
 * - 'network-http'   اتصال HTTP REST API (کارتخوان‌های مدرن)
 */
export type TerminalType =
  | 'manual'
  | 'keyboard-hid'
  | 'web-serial'
  | 'network-tcp'
  | 'network-http'


/** برند کارتخوان */
export type TerminalBrand =
  | 'verifone'
  | 'ingenico'
  | 'pax'
  | 'fannipars'
  | 'kavosh'
  | 'palch'
  | 'nikan'

  | 'generic'

/** وضعیت اتصال adapter */
export type AdapterStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

/** نتیجه تست اتصال */
export interface ConnectionTestResult {
  success: boolean
  message: string
  deviceInfo?: {
    terminalId?: string
    serialNumber?: string
    firmwareVersion?: string
    merchantId?: string
  }
  durationMs?: number
}

/** درخواست پرداخت کارتی */
export interface CardPaymentRequest {
  amount: number                    // مبلغ به ریال
  invoiceId?: string                // آیدی فاکتور (در صورت وجود)
  invoiceNumber?: string            // شماره فاکتور (برای چاپ رسید)
  customerId?: string
  customerName?: string
  description?: string
  timeoutMs?: number                // مدت زمان انتظار (پیش‌فرض ۶۰ ثانیه)
}

/**
 * ★★★ v8.1: نوع کد مرجع تراکنش ★★★
 *
 * هر کارتخوان رسیدش فرمت متفاوتی داره. این enum به کاربر کمک می‌کنه
 * مشخص کنه کدوم فیلد روی رسید هست.
 *
 * - 'rrn'           شماره پیرو (Retrieval Reference Number) - 6 تا 12 رقم
 * - 'unique_code'   کد یکتا - معمولاً 9 رقم (در رسیدهای بانک ملت)
 * - 'trace'         کد پیگیری / شماره مرجع - معمولاً 6 تا 8 رقم
 * - 'terminal'      شماره پایانه - معمولاً 7 تا 8 رقم (در رسیدهای فنی‌پارس/کاوش)
 * - 'auth_code'     کد تأیید (Authorization Code) - معمولاً 6 رقم
 * - 'stan'          شماره تراکنش (STAN) - معمولاً 6 رقم متوالی
 * - 'other'         سایر - هر کد دیگه‌ای که روی رسید هست
 */
export type ReferenceCodeType =
  | 'rrn'
  | 'unique_code'
  | 'trace'
  | 'terminal'
  | 'auth_code'
  | 'stan'
  | 'other'

/** نتیجه پرداخت کارتی */
export interface CardPaymentResult {
  success: boolean
  status: 'pending' | 'successful' | 'failed' | 'reversed' | 'timeout' | 'cancelled'
  amount: number
  referenceNumber?: string          // شماره پیرو (RRN)
  referenceType?: ReferenceCodeType // ★★★ v8.1: نوع کد مرجع
  traceNumber?: string              // شماره پیگیری
  cardNumber?: string               // ۴ رقم آخر کارت
  cardType?: string                 // melli | saderat | ...
  authorizationCode?: string        // کد تأیید
  errorMessage?: string
  receiptData?: {                   // داده‌های خام برای چاپ رسید
    terminalId?: string
    merchantId?: string
    acceptorCode?: string
    dateTime?: string
  }
  paidAt?: Date
}

/**
 * ★★★ v8.1: انواع کد مرجع برای نمایش در UI ★★★
 *
 * هر کارتخوان بانکی فرمت رسید متفاوتی داره. این لیست به کاربر کمک می‌کنه
 * مشخص کنه روی رسیدش کدوم فیلد وجود داره.
 */
export const REFERENCE_CODE_TYPES: {
  value: ReferenceCodeType
  label: string
  description: string
  example: string
  commonBanks: string[]
}[] = [
  {
    value: 'rrn',
    label: 'شماره پیرو (RRN)',
    description: 'بعد از کلمه «پیرو» یا «RRN» نوشته شده — ۶ تا ۱۲ رقم',
    example: 'پیرو: 1234567',
    commonBanks: ['بانک ملت', 'بانک صادرات', 'بانک پارسیان', 'بانک پاسارگاد'],
  },
  {
    value: 'unique_code',
    label: 'کد یکتا',
    description: 'بعد از کلمه «کد یکتا» نوشته شده — معمولاً ۹ رقم',
    example: 'کد یکتا: 123456789',
    commonBanks: ['بانک ملت', 'بانک صادرات', 'بانک کشاورزی'],
  },
  {
    value: 'trace',
    label: 'کد پیگیری / شماره مرجع',
    description: 'بعد از کلمه «پیگیری» یا «مرجع» نوشته شده — معمولاً ۶ تا ۸ رقم',
    example: 'پیگیری: 890123',
    commonBanks: ['بانک سپه', 'بانک ملی', 'بانک رفاه'],
  },
  {
    value: 'terminal',
    label: 'شماره پایانه',
    description: 'بعد از کلمه «پایانه» یا «ترمینال» نوشته شده — معمولاً ۷ تا ۸ رقم',
    example: 'پایانه: 1234567',
    commonBanks: ['فنی‌پارس', 'کاوش', 'پالچ', 'نیکان'],
  },
  {
    value: 'auth_code',
    label: 'کد تأیید (Authorization)',
    description: 'بعد از کلمه «تأیید» یا «Auth» یا «APP CODE» — معمولاً ۶ رقم',
    example: 'APP CODE: 654321',
    commonBanks: ['بانک ملت', 'بانک پاسارگاد', 'بانک پارسیان'],
  },
  {
    value: 'stan',
    label: 'شماره تراکنش (STAN)',
    description: 'بعد از کلمه «تراکنش» یا «STAN» — معمولاً ۶ رقم متوالی',
    example: 'STAN: 000123',
    commonBanks: ['بانک صادرات', 'بانک ملی'],
  },
  {
    value: 'other',
    label: 'سایر / کد روی رسید',
    description: 'هر کد دیگه‌ای که روی رسید هست (مثلاً شماره فاکتور بانک)',
    example: 'هر کد عددی روی رسید',
    commonBanks: ['عمومی'],
  },
]

/** کانفیگ پایه adapter */
export interface PosAdapterConfig {
  terminalType: TerminalType
  brand?: TerminalBrand
  name: string
  // web-serial
  serialPort?: string               // مثلاً "COM3" یا "/dev/ttyUSB0"
  baudRate?: number                 // معمولاً 115200 یا 9600
  // network-tcp
  ipAddress?: string
  port?: number
  // network-http
  apiBaseUrl?: string
  apiKey?: string
  // عمومی
  merchantId?: string
  acceptorCode?: string
  terminalId?: string
  terminalSerial?: string
  bankName?: string
  // پیشرفته (JSON)
  advanced?: {
    autoReconnect?: boolean
    timeoutMs?: number
    retryCount?: number
    shaparakVerify?: boolean        // تأیید تراکنش با شاپرک
    shaparakMerchantCode?: string
    receiptPrinterWidth?: number    // 58mm | 80mm
    receiptFooter?: string
  }
}

/**
 * ★★★ اینترفیس پایه که همه adapter‌ها باید پیاده‌سازی کنند ★★★
 *
 * هر adapter فقط این متدها رو expose می‌کنه. فراخوان‌کننده نمی‌دونه
 * پشت صحنه چه پروتکلی داره استفاده می‌شه — فقط می‌دونه connect / disconnect
 * / pay رو داره.
 */
export interface PosAdapter {
  readonly type: TerminalType
  readonly displayName: string

  /** اتصال به کارتخوان */
  connect(): Promise<ConnectionTestResult>

  /** قطع اتصال */
  disconnect(): Promise<void>

  /** تست اتصال (بدون نگه‌داشتن ارتباط) */
  testConnection(): Promise<ConnectionTestResult>

  /** شروع پرداخت — منتظر می‌مونه تا کارت بکشه و نتیجه رو برمی‌گردونه */
  pay(request: CardPaymentRequest): Promise<CardPaymentResult>

  /** لغو پرداخت در حال انجام */
  cancelPayment(): Promise<void>

  /** گرفتن وضعیت فعلی adapter */
  getStatus(): AdapterStatus

  /** گوش دادن به رویدادها (تغییر وضعیت، لاگ) */
  on(event: 'statusChange' | 'log' | 'paymentProgress', listener: (data: any) => void): void
  off(event: string, listener: (data: any) => void): void
}

/** شماره‌گذاری رویدادهای adapter برای دیباگ */
export const ADAPTER_EVENTS = {
  STATUS_CHANGE: 'statusChange',
  LOG: 'log',
  PAYMENT_PROGRESS: 'paymentProgress',
} as const

/** تولید UUID ساده برای adapter session */
export function generateSessionId(): string {
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** برند کارتخوان‌های شناخته‌شده — برای نمایش در UI */
export const TERMINAL_BRANDS: { value: TerminalBrand; label: string; note?: string }[] = [
  { value: 'ingenico', label: 'اینجنیکو (Ingenico)', note: 'iCT220, iWL250' },
  { value: 'pax', label: 'پکس (PAX)', note: 'S920, D210' },
  { value: 'fannipars', label: 'فنی‌پارس', note: 'ترمینال‌های ایرانی' },
  { value: 'kavosh', label: 'کاوش', note: 'ترمینال‌های ایرانی' },
  { value: 'palch', label: 'پالچ', note: 'ترمینال‌های ایرانی' },
  { value: 'nikan', label: 'نیکان', note: 'ترمینال‌های ایرانی' },
  { value: 'generic', label: 'سایر / عمومی', note: 'هر کارتخوان دیگه' },
]

/** انواع اتصال — برای نمایش در UI */
export const TERMINAL_TYPES: {
  value: TerminalType
  label: string
  description: string
  icon: string
  browserSupport: 'all' | 'chrome-only' | 'limited'
}[] = [
  {
    value: 'manual',
    label: 'ورودی دستی',
    description: 'صندوق‌دار شماره پیرو و ۴ رقم آخر کارت رو دستی وارد می‌کنه. ساده‌ترین حالت — با همه کارتخوان‌ها کار می‌کنه.',
    icon: '✏️',
    browserSupport: 'all',
  },
  {
    value: 'keyboard-hid',
    label: 'حالت کیبورد (HID)',
    description: 'کارتخوان در حالت کیبورد تنظیم می‌شه و شماره پیرو رو مستقیم در فیلد تایپ می‌کنه. رایج در ترمینال‌های ایرانی.',
    icon: '⌨️',
    browserSupport: 'all',
  },
  {
    value: 'web-serial',
    label: 'اتصال USB/سریال',
    description: 'اتصال مستقیم از طریق پورت USB با Web Serial API. برای کارتخوان‌هایی که پروتکل سریال دارن.',
    icon: '🔌',
    browserSupport: 'chrome-only',
  },
  {
    value: 'network-tcp',
    label: 'اتصال شبکه (TCP)',
    description: 'اتصال TCP/IP به کارتخوان‌های تحت شبکه. برای ترمینال‌های مدرن با IP.',
    icon: '🌐',
    browserSupport: 'limited',
  },
  {
    value: 'network-http',
    label: 'API تحت شبکه (HTTP)',
    description: 'اتصال به REST API کارتخوان. برای کارتخوان‌های هوشمند با وب‌سرویس.',
    icon: '🔗',
    browserSupport: 'all',
  },
]
