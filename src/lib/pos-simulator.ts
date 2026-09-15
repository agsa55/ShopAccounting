// ============================================================================
// src/lib/pos-simulator.ts
// ShopAccounting v11.1 — POS Simulator (بدون نیاز به دستگاه فیزیکی)
// ============================================================================

export interface SimulatedTransaction {
  success: boolean
  amount: number
  referenceNumber: string
  traceNumber: string
  cardNumber: string
  cardType: string
  timestamp: Date
  status: 'successful' | 'failed' | 'cancelled'
  errorMessage?: string
}

// ─── تولید شماره‌های تصادفی مثل دستگاه واقعی ─────────────────
function generateReferenceNumber(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function generateTraceNumber(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function generateCardNumber(): string {
  const prefixes = ['6037', '6221', '6274', '6279', '5022']
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
  const rest = String(Math.floor(100000000000 + Math.random() * 899999999999))
  return prefix + rest
}

function getCardTypeFromPrefix(cardNumber: string): string {
  const prefix = cardNumber.substring(0, 4)
  const types: Record<string, string> = {
    '6037': 'بانک ملی',
    '6221': 'بانک سپه',
    '6274': 'بانک صادرات',
    '6279': 'بانک ملت',
    '5022': 'بانک پاسارگاد',
  }
  return types[prefix] || 'بانک نامشخص'
}

// ─── شبیه‌سازی تراکنش موفق ───────────────────────────────────
export function simulateSuccessfulTransaction(amount: number): SimulatedTransaction {
  const cardNumber = generateCardNumber()
  return {
    success: true,
    amount,
    referenceNumber: generateReferenceNumber(),
    traceNumber: generateTraceNumber(),
    cardNumber: cardNumber.slice(-4),
    cardType: getCardTypeFromPrefix(cardNumber),
    timestamp: new Date(),
    status: 'successful',
  }
}

// ─── شبیه‌سازی تراکنش ناموفق ─────────────────────────────────
export function simulateFailedTransaction(amount: number, reason: string = 'عدم موجودی کافی'): SimulatedTransaction {
  const cardNumber = generateCardNumber()
  return {
    success: false,
    amount,
    referenceNumber: '',
    traceNumber: generateTraceNumber(),
    cardNumber: cardNumber.slice(-4),
    cardType: getCardTypeFromPrefix(cardNumber),
    timestamp: new Date(),
    status: 'failed',
    errorMessage: reason,
  }
}

// ─── شبیه‌سازی لغو تراکنش ───────────────────────────────────
export function simulateCancelledTransaction(amount: number): SimulatedTransaction {
  return {
    success: false,
    amount,
    referenceNumber: '',
    traceNumber: '',
    cardNumber: '',
    cardType: '',
    timestamp: new Date(),
    status: 'cancelled',
    errorMessage: 'تراکنش توسط کاربر لغو شد',
  }
}

// ─── شبیه‌سازی کامل فرآیند پرداخت ──────────────────────────
export async function simulatePaymentProcess(
  amount: number,
  options: {
    delayMs?: number
    successRate?: number // 0-100 (پیش‌فرض ۹۰٪ موفق)
    onProgress?: (stage: string, message: string) => void
  } = {}
): Promise<SimulatedTransaction> {
  const { delayMs = 3000, successRate = 90, onProgress } = options

  // مرحله ۱: اتصال
  onProgress?.('connecting', 'در حال اتصال به کارتخوان...')
  await new Promise(resolve => setTimeout(resolve, 800))

  // مرحله ۲: ارسال مبلغ
  onProgress?.('sending_amount', `مبلغ ${amount.toLocaleString('fa-IR')} ریال به کارتخوان ارسال شد`)
  await new Promise(resolve => setTimeout(resolve, 1000))

  // مرحله ۳: انتظار برای کشیدن کارت
  onProgress?.('waiting_card', 'لطفاً کارت را بکشید و رمز را وارد کنید...')
  await new Promise(resolve => setTimeout(resolve, delayMs))

  // مرحله ۴: پردازش تراکنش
  onProgress?.('processing', 'در حال پردازش تراکنش...')
  await new Promise(resolve => setTimeout(resolve, 1500))

  // مرحله ۵: نتیجه
  const isSuccess = Math.random() * 100 < successRate
  
  if (isSuccess) {
    onProgress?.('success', '✅ تراکنش موفق!')
    return simulateSuccessfulTransaction(amount)
  } else {
    const errors = [
      'عدم موجودی کافی',
      'رمز اشتباه است',
      'کارت منقضی شده است',
      'خطا در ارتباط با بانک',
    ]
    const randomError = errors[Math.floor(Math.random() * errors.length)]
    onProgress?.('failed', `❌ تراکنش ناموفق: ${randomError}`)
    return simulateFailedTransaction(amount, randomError)
  }
}