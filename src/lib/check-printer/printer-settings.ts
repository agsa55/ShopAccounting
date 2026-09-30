// ============================================================================
// src/lib/check-printer/printer-settings.ts
// ShopAccounting — مدیریت تنظیمات چاپگر برای چک صیادی
// ============================================================================

export type PrinterType = 'laser_a4' | 'inkjet' | 'check_printer'

export interface PrinterProfile {
  id: PrinterType
  name: string
  description: string
  icon: string
  /** margin بالای صفحه (میلی‌متر) — برای چاپگر A4 */
  marginTop: number
  /** margin چپ صفحه (میلی‌متر) — برای چاپگر A4 */
  marginLeft: number
  /** فاصله بین دو چک در A4 (میلی‌متر) */
  verticalGap: number
  /** تعداد چک در هر صفحه A4 */
  checksPerPage: number
  /** offset X برای تنظیم چاپگر (میلی‌متر) */
  offsetX: number
  /** offset Y برای تنظیم چاپگر (میلی‌متر) */
  offsetY: number
  /** scale factor (برای اصلاح اندازه چاپ) */
  scale: number
   // ★ جدید: تنظیمات ظاهر فیلدها
  fontFamily: string
  fontScale: number
  fontColor: string
  fontWeight: 'normal' | 'bold' | 'black'
}

const STORAGE_KEY = 'check_printer_settings_v1'

/**
 * پروفایل‌های پیش‌فرض چاپگرها
 */
export const PRINTER_PROFILES: Record<PrinterType, PrinterProfile> = {
  laser_a4: {
    id: 'laser_a4',
    name: 'چاپگر لیزری A4',
    description: 'چاپگر لیزری معمولی با کاغذ A4 — رایج‌ترین نوع',
    icon: '🖨️',
    marginTop: 10,
    marginLeft: 10,
    verticalGap: 5,
    checksPerPage: 3,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  fontFamily: 'Tahoma, Arial, sans-serif',
    fontScale: 1,
    fontColor: '#000000',
    fontWeight: 'normal',
  },
  inkjet: {
    id: 'inkjet',
    name: 'چاپگر جوهرافشان',
    description: 'چاپگر جوهرافشان معمولی با کاغذ A4',
    icon: '💧',
    marginTop: 12,
    marginLeft: 12,
    verticalGap: 5,
    checksPerPage: 3,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
fontFamily: 'Tahoma, Arial, sans-serif',
    fontScale: 1,
    fontColor: '#000000',
    fontWeight: 'normal',
  },
  check_printer: {
    id: 'check_printer',
    name: 'چاپگر مخصوص چک',
    description: 'چاپگرهای مخصوص چاپ چک (OKI, Epson و ...)',
    icon: '🏦',
    marginTop: 0,
    marginLeft: 0,
    verticalGap: 0,
    checksPerPage: 1,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
fontFamily: 'Tahoma, Arial, sans-serif',
    fontScale: 1,
    fontColor: '#000000',
    fontWeight: 'bold',
  },
}

export interface CheckPrinterSettings {
  selectedPrinter: PrinterType
  profiles: Record<PrinterType, PrinterProfile>
  lastCalibration?: string
}

/**
 * بارگذاری تنظیمات از localStorage
 */
/**
 * بارگذاری تنظیمات از localStorage
 * ★ v2: ادغام با مقادیر پیش‌فرض برای فیلدهای جدید (جلوگیری از NaN)
 */
export function loadCheckPrinterSettings(): CheckPrinterSettings {
  const defaults: CheckPrinterSettings = {
    selectedPrinter: 'laser_a4',
    profiles: { ...PRINTER_PROFILES },
  }

  if (typeof window === 'undefined') {
    return defaults
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return defaults
    }
    const parsed = JSON.parse(raw) as CheckPrinterSettings

    // ★ ادغام با مقادیر پیش‌فرض برای فیلدهای جدید
    const mergedProfiles: Record<PrinterType, PrinterProfile> = { ...PRINTER_PROFILES }
    for (const key of Object.keys(PRINTER_PROFILES) as PrinterType[]) {
      if (parsed.profiles?.[key]) {
        mergedProfiles[key] = {
          ...PRINTER_PROFILES[key],
          ...parsed.profiles[key],
        }
      }
    }

    return {
      selectedPrinter: parsed.selectedPrinter || 'laser_a4',
      profiles: mergedProfiles,
      lastCalibration: parsed.lastCalibration,
    }
  } catch {
    return defaults
  }
}

/**
 * ذخیره تنظیمات در localStorage
 */
export function saveCheckPrinterSettings(settings: CheckPrinterSettings): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {
    console.warn('[CheckPrinter] Failed to save settings:', e)
  }
}

/**
 * به‌روزرسانی offset یک پروفایل (برای کالیبراسیون)
 */
export function updatePrinterOffset(
  printerType: PrinterType,
  offsetX: number,
  offsetY: number,
  scale: number = 1
): void {
  const settings = loadCheckPrinterSettings()
  settings.profiles[printerType] = {
    ...settings.profiles[printerType],
    offsetX,
    offsetY,
    scale,
  }
  settings.lastCalibration = new Date().toISOString()
  saveCheckPrinterSettings(settings)
}

/**
 * دریافت پروفایل فعال
 */
export function getActivePrinterProfile(): PrinterProfile {
  const settings = loadCheckPrinterSettings()
  return settings.profiles[settings.selectedPrinter] || PRINTER_PROFILES.laser_a4
}

/**
 * انتخاب چاپگر فعال
 */
export function selectPrinter(printerType: PrinterType): void {
  const settings = loadCheckPrinterSettings()
  settings.selectedPrinter = printerType
  saveCheckPrinterSettings(settings)
}

/**
 * لیست همه چاپگرها
 */
export function getAllPrinterProfiles(): PrinterProfile[] {
  return Object.values(PRINTER_PROFILES)
}

/** لیست فونت‌های موجود برای چاپ چک */
/** لیست فونت‌های موجود برای چاپ چک (فونت‌های وب مطمئن) */
/** لیست فونت‌های موجود برای چاپ چک صیادی */
export const AVAILABLE_FONTS = [
  { value: 'Tahoma, Arial, sans-serif', label: 'Tahoma (پیش‌فرض)' },
  { value: 'Vazirmatn, Tahoma, sans-serif', label: 'وزیرمتن (فارسی)' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Times New Roman, Times, serif', label: 'Times New Roman' },
  { value: 'Courier New, Courier, monospace', label: 'Courier New' },
]