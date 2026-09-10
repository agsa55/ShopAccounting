// ============================================================================
// src/lib/shahkar.ts — v11.1
// ★ کتابخانه احراز هویت شاهکار
// ★ تطبیق کد ملی با شماره موبایل
// ★ پشتیبانی از نسخه‌های لایت، اصلی و پرو
// ============================================================================

// ─── تنظیمات ────────────────────────────────────────────────────────────────
const API_IR_BASE_URL = 'https://s.api.ir'
const SHAHKAR_TIMEOUT = 10000 // 10 ثانیه

// ─── نوع‌های خروجی ────────────────────────────────────────────────────────
export interface ShahkarResult {
  valid: boolean        // آیا تطبیق برقرار شد؟
  success: boolean      // آیا استعلام موفق بود؟
  message: string       // پیام قابل نمایش به کاربر
  code?: number         // کد وضعیت
  attemptsUsed?: number // تعداد تلاش‌های استفاده شده
}

// ─── اعتبارسنجی فرمت کد ملی ایرانی ────────────────────────────────────────
export function validateIranianNationalCode(code: string): {
  valid: boolean
  message: string
} {
  // حذف فاصله‌ها و کاراکترهای اضافی
  const cleaned = String(code || '').replace(/[\s-]/g, '')
  
  // بررسی طول (باید ۱۰ رقم باشد)
  if (!cleaned || cleaned.length !== 10) {
    return { valid: false, message: 'کد ملی باید ۱۰ رقم باشد' }
  }
  
  // بررسی اینکه فقط عدد باشد
  if (!/^\d{10}$/.test(cleaned)) {
    return { valid: false, message: 'کد ملی فقط باید شامل اعداد باشد' }
  }
  
  // بررسی کدهای نامعتبر (همه رقم یکسان)
  if (/^(\d)\1{9}$/.test(cleaned)) {
    return { valid: false, message: 'کد ملی نامعتبر است' }
  }
  
  // الگوریتم اعتبارسنجی کد ملی ایرانی
  const check = parseInt(cleaned[9], 10)
  const sum = cleaned
    .slice(0, 9)
    .split('')
    .reduce((acc, digit, index) => {
      return acc + parseInt(digit, 10) * (10 - index)
    }, 0) % 11
  
  const isValid = sum < 2 ? check === sum : check + sum === 11
  
  if (!isValid) {
    return { valid: false, message: 'کد ملی نامعتبر است (الگوریتم)' }
  }
  
  return { valid: true, message: 'کد ملی معتبر است' }
}

// ─── اعتبارسنجی فرمت شماره موبایل ایرانی ──────────────────────────────────
export function validateIranianMobile(mobile: string): {
  valid: boolean
  message: string
} {
  const cleaned = String(mobile || '').replace(/[\s-]/g, '')
  
  // بررسی فرمت ایرانی: 09xxxxxxxxx
  if (!/^09\d{9}$/.test(cleaned)) {
    return { valid: false, message: 'شماره موبایل نامعتبر است (مثال: 09121112222)' }
  }
  
  return { valid: true, message: 'شماره موبایل معتبر است' }
}

// ─── تعیین آدرس سرویس شاهکار بر اساس نسخه ─────────────────────────────────
function getShahkarEndpoint(): string {
  const mode = process.env.SHAHKAR_MODE || 'lite'
  
  switch (mode) {
    case 'main':
      return `${API_IR_BASE_URL}/api/sw1/Shahkar`
    case 'pro':
      return `${API_IR_BASE_URL}/api/sw1/ShahkarPro`
    case 'lite':
    default:
      return `${API_IR_BASE_URL}/api/sw1/ShahkarLite`
  }
}

// ─── تابع اصلی احراز هویت شاهکار ──────────────────────────────────────────
export async function verifyShahkar(
  nationalCode: string,
  mobile: string,
  isCompany: boolean = false
): Promise<ShahkarResult> {
  try {
    // ۱. اعتبارسنجی فرمت کد ملی
    const codeValidation = validateIranianNationalCode(nationalCode)
    if (!codeValidation.valid) {
      return {
        valid: false,
        success: false,
        message: codeValidation.message,
      }
    }
    
    // ۲. اعتبارسنجی فرمت شماره موبایل
    const mobileValidation = validateIranianMobile(mobile)
    if (!mobileValidation.valid) {
      return {
        valid: false,
        success: false,
        message: mobileValidation.message,
      }
    }
    
    // ۳. بررسی وجود کلید شاهکار
    const apiToken = process.env.API_IR_TOKEN
    if (!apiToken) {
      console.error('[Shahkar] ❌ API_IR_TOKEN is not set')
      return {
        valid: false,
        success: false,
        message: 'خطا در پیکربندی سرویس احراز هویت',
      }
    }
    
    // ۴. ساخت بدنه درخواست بر اساس نسخه
    const mode = process.env.SHAHKAR_MODE || 'lite'
    const requestBody: Record<string, string | boolean> = {
      nationalCode: nationalCode.trim(),
      mobile: mobile.trim(),
    }
    
    // نسخه‌های اصلی و پرو فیلد isCompany دارند
    if (mode === 'main' || mode === 'pro') {
      requestBody.isCompany = isCompany
    }
    
    // ۵. فراخوانی سرویس شاهکار با تایم‌اوت
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), SHAHKAR_TIMEOUT)
    
    let response: Response
    try {
      response = await fetch(getShahkarEndpoint(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
    
    // ۶. بررسی وضعیت پاسخ
    if (!response.ok) {
      console.error('[Shahkar] ❌ API error:', response.status, response.statusText)
      
      let errorMessage = 'خطا در استعلام احراز هویت'
      
      // پیام‌های خاص برای کدهای وضعیت
      if (response.status === 401) {
        errorMessage = 'خطا در احراز هویت سرویس (توکن نامعتبر)'
      } else if (response.status === 403) {
        errorMessage = 'دسترسی به سرویس احراز هویت مجاز نیست'
      } else if (response.status === 429) {
        errorMessage = 'تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً کمی صبر کنید'
      } else if (response.status === 503) {
        errorMessage = 'سرویس احراز هویت موقتاً در دسترس نیست'
      }
      
      return {
        valid: false,
        success: false,
        message: errorMessage,
        code: response.status,
      }
    }
    
    // ۷. تجزیه پاسخ
    const data = await response.json()
    
    console.log('[Shahkar] ✅ Response received:', {
      success: data.success,
      data: data.data,
      message: data.message,
      code: data.code,
    })
    
    // ۸. بررسی نتیجه
    if (!data.success) {
      return {
        valid: false,
        success: false,
        message: data.message || 'خطا در استعلام احراز هویت',
        code: data.code,
      }
    }
    
    // ۹. نتیجه نهایی: تطبیق برقرار شد یا نه؟
    const isMatch = data.data === true
    
    return {
      valid: isMatch,
      success: true,
      message: isMatch 
        ? 'احراز هویت با موفقیت انجام شد' 
        : 'کد ملی با شماره موبایل تطبیق ندارد',
      code: data.code,
    }
    
  } catch (error: any) {
    // مدیریت خطاهای خاص
    if (error?.name === 'AbortError') {
      console.error('[Shahkar] ❌ Timeout: request took too long')
      return {
        valid: false,
        success: false,
        message: 'زمان استعلام به پایان رسید. لطفاً دوباره تلاش کنید',
      }
    }
    
    console.error('[Shahkar] ❌ Unexpected error:', error?.message)
    return {
      valid: false,
      success: false,
      message: 'خطای غیرمنتظره در احراز هویت. لطفاً دوباره تلاش کنید',
    }
  }
}

// ─── تابع تست (برای استفاده در توسعه) ─────────────────────────────────────
export async function testShahkarConnection(): Promise<{
  connected: boolean
  message: string
}> {
  try {
    const apiToken = process.env.API_IR_TOKEN
    if (!apiToken) {
      return { connected: false, message: 'API_IR_TOKEN تنظیم نشده است' }
    }
    
    const response = await fetch(`${API_IR_BASE_URL}/api/Sandbox/Echo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Rahgosha Test' }),
    })
    
    if (!response.ok) {
      return { 
        connected: false, 
        message: `خطا در اتصال: ${response.status}` 
      }
    }
    
    const data = await response.json()
    return {
      connected: data.success === true,
      message: data.success ? 'اتصال موفق' : 'اتصال ناموفق',
    }
  } catch (error: any) {
    return {
      connected: false,
      message: `خطا: ${error?.message || 'نامشخص'}`,
    }
  }
}