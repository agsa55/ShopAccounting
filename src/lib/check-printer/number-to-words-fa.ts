// ============================================================================
// src/lib/check-printer/number-to-words-fa.ts
// ShopAccounting — تبدیل عدد به حروف فارسی برای چک صیادی
// ★ v3: اصلاح نهایی (حذف صحیح "یک" از ابتدای سال بدون حذف "هزار")
// ============================================================================

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون']

/**
 * تبدیل بخش سه رقمی به حروف
 */
function convertHundreds(num: number): string {
  if (num === 0) return ''
  
  const hundreds = Math.floor(num / 100)
  const remainder = num % 100
  
  let result = ''
  
  if (hundreds > 0) {
    result += HUNDREDS[hundreds]
  }
  
  if (remainder > 0) {
    if (result) result += ' و '
    
    if (remainder < 10) {
      result += ONES[remainder]
    } else if (remainder < 20) {
      result += TEENS[remainder - 10]
    } else {
      const tens = Math.floor(remainder / 10)
      const ones = remainder % 10
      result += TENS[tens]
      if (ones > 0) {
        result += ' و ' + ONES[ones]
      }
    }
  }
  
  return result
}

/**
 * تبدیل عدد به حروف فارسی
 * @param n عدد ورودی
 * @returns رشته حروف فارسی
 */
export function numberToWordsForCheck(n: number): string {
  if (n === 0) return 'صفر'
  if (n < 0) return 'منفی ' + numberToWordsForCheck(-n)
  
  // جدا کردن ارقام به گروه‌های سه تایی از راست
  const groups: number[] = []
  let temp = n
  while (temp > 0) {
    groups.unshift(temp % 1000)
    temp = Math.floor(temp / 1000)
  }
  
  let resultParts: string[] = []
  
  for (let i = 0; i < groups.length; i++) {
    const groupValue = groups[i]
    const scaleIndex = groups.length - 1 - i
    
    if (groupValue === 0) continue
    
    const words = convertHundreds(groupValue)
    const scale = SCALES[scaleIndex] || ''
    
    if (scale) {
      resultParts.push(`${words} ${scale}`)
    } else {
      resultParts.push(words)
    }
  }
  
  let finalResult = resultParts.join(' و ')
  
  // ★★ اصلاح حیاتی طبق درخواست کاربر:
  // اگر جمله با "یک هزار" شروع شد، فقط "یک " را حذف کن تا بشود "هزار..."
  // مثال: "یک هزار و چهارصد" -> "هزار و چهارصد"
  
  // روش امن: استفاده از replace با regex برای تطبیق دقیق ابتدای رشته
  // "^یک\s+هزار" یعنی: شروع رشته (^)، کلمه یک، حداقل یک فاصله (\s+)، کلمه هزار
  if (/^یک\s+هزار/.test(finalResult)) {
    // ما می‌خواهیم "یک " (به همراه فاصله‌اش) حذف شود و "هزار" باقی بماند.
    // پس "یک هزار" را با "هزار" جایگزین می‌کنیم.
    finalResult = finalResult.replace(/^یک\s+(هزار)/, '$1')
  }
  
  // پاکسازی نهایی: حذف فواصل اضافی
  finalResult = finalResult.replace(/\s+/g, ' ').trim()
  
  return finalResult
}