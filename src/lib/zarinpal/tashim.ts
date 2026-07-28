// ============================================================================
// src/lib/zarinpal/tashim.ts — Zarinpal تسهیم فردایی Helper (v8.2 ★★★)
// ----------------------------------------------------------------------------
// ★ این ماژول منطق محاسبه wages (سهم‌بندی) برای تسهیم فردایی زرین‌پال را مدیریت می‌کند.
//
// ★ سناریوی تسهیم:
//   ۱) مشتری مبلغ کامل فاکتور را به زرین‌پال پرداخت می‌کند.
//   ۲) زرین‌پال کارمزد خود را (بر اساس قرارداد پلتفرم) کسر می‌کند.
//   ۳) مبلغ باقی‌مانده بین پلتفرم و فروشگاه تسهیم می‌شود:
//        • سهم پلتفرم = درصد کارمزد پلتفرم × مبلغ فاکتور (+ مبلغ ثابت در صورت وجود)
//        • سهم فروشگاه = مبلغ فاکتور - سهم پلتفرم - کارمزد زرین‌پال
//   ۴) wages array به زرین‌پال ارسال می‌شود که سهم پلتفرم را به شبا پلتفرم هدایت می‌کند.
//      مبلغ باقی‌مانده (سهم فروشگاه منهای کارمزد زرین‌پال) به شبا فروشگاه واریز می‌شود.
//
// ★ نکته مهم:
//   زرین‌پال کارمزد خود را از مبلغی که قرار است به فروشگاه واریز شود کسر می‌کند.
//   یعنی در wages array فقط سهم پلتفرم را مشخص می‌کنیم — بقیه به شبا فروشگاه می‌رود.
//   زرین‌پال از این "بقیه" کارمزد خود را برمی‌دارد.
//
// ★ برای تأیید مقادیر نهایی، پس از پرداخت باید از API verify زرین‌پال استفاده کنیم
//   تا مبلغ واقعی کارمزد (fee) را استخراج کنیم.
// ============================================================================

// ═══════════════════════════════════════════════════════════════
//  تایپ‌ها
// ═══════════════════════════════════════════════════════════════

export interface TashimConfig {
  /** مبلغ کل فاکتور (ریال) */
  amount: number
  /** شبا فروشگاه (IR + 24 رقم) */
  merchantIban: string
  /** شبا پلتفرم (IR + 24 رقم) */
  platformIban: string
  /** درصد کارمزد پلتفرم (مثلاً 1.0 برای ۱٪) */
  platformCommissionRate: number
  /** مبلغ ثابت کارمزد پلتفرم (ریال، اختیاری) */
  platformCommissionFixed?: number
  /** شرح پرداخت */
  description: string
}

export interface TashimCalculation {
  /** مبلغ کل فاکتور */
  amount: number
  /** سهم پلتفرم (به ریال — بعلاوه مبلغ ثابت در صورت وجود) */
  platformCommission: number
  /** مبلغی که به شبا پلتفرم واریز می‌شود (در wages array) */
  platformWage: number
  /** مبلغی که به شبا فروشگاه واریز می‌شود (قبل از کسر کارمزد زرین‌پال) */
  merchantWage: number
  /** کارمزد تخمینی زرین‌پال (بر اساس قرارداد — در عمل از verify استخراج می‌شود) */
  estimatedGatewayFee: number
  /** مبلغ خالصی که انتظار می‌رود به فروشگاه واریز شود */
  estimatedNetToMerchant: number
  /** wages array قابل ارسال به زرین‌پال */
  wages: Array<{
    iban: string
    amount: number
    description: string
  }>
}

// ═══════════════════════════════════════════════════════════════
//  calculateTashim — محاسبه سهم‌بندی تسهیم فردایی
// ═══════════════════════════════════════════════════════════════

export function calculateTashim(config: TashimConfig): TashimCalculation {
  const {
    amount,
    merchantIban,
    platformIban,
    platformCommissionRate,
    platformCommissionFixed = 0,
    description,
  } = config

  // ★ ۱. محاسبه سهم پلتفرم
  const percentageCommission = Math.round((amount * platformCommissionRate) / 100)
  const platformCommission = percentageCommission + platformCommissionFixed

  // ★ ۲. سهم پلتفرم نباید بیشتر از مبلغ فاکتور باشد
  const safePlatformCommission = Math.min(platformCommission, amount - 100)

  // ★ ۳. محاسبه سهم فروشگاه (قبل از کسر کارمزد زرین‌پال)
  const merchantWage = amount - safePlatformCommission

  // ★ ۴. کارمزد تخمینی زرین‌پال (برای نمایش به فروشگاه)
  const estimatedGatewayFee = Math.round((amount * 1.5) / 100)

  // ★ ۵. مبلغ خالص تخمینی به فروشگاه
  const estimatedNetToMerchant = Math.max(0, merchantWage - estimatedGatewayFee)

  // ★ ۶. ساخت wages array
  const wages: Array<{ iban: string; amount: number; description: string }> = []

  if (safePlatformCommission > 0 && platformIban) {
    wages.push({
      iban: platformIban,
      amount: safePlatformCommission,
      description: `کارمزد پلتفرم ShopAccounting - ${description}`.substring(0, 100),
    })
  }

  if (merchantWage > 0 && merchantIban) {
    wages.push({
      iban: merchantIban,
      amount: merchantWage,
      description: `واریز به فروشگاه - ${description}`.substring(0, 100),
    })
  }

  return {
    amount,
    platformCommission: safePlatformCommission,
    platformWage: safePlatformCommission,
    merchantWage,
    estimatedGatewayFee,
    estimatedNetToMerchant,
    wages,
  }
}

// ═══════════════════════════════════════════════════════════════
//  validateIban — اعتبارسنجی شبا
// ═══════════════════════════════════════════════════════════════

export function validateIban(iban: string): { valid: boolean; normalized: string; error?: string } {
  if (!iban) {
    return { valid: false, normalized: '', error: 'شبا خالی است' }
  }

  const normalized = iban.replace(/\s/g, '').toUpperCase()

  const ibanRegex = /^IR\d{24}$/
  if (!ibanRegex.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'فرمت شبا نامعتبر است. مثال درست: IR820570012880011411111111',
    }
  }

  return { valid: true, normalized }
}

// ═══════════════════════════════════════════════════════════════
//  Zarinpal API URLs
// ═══════════════════════════════════════════════════════════════

export function getZarinpalUrls(isSandbox: boolean) {
  return {
    request: isSandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json'
      : 'https://api.zarinpal.com/pg/v4/payment/request.json',
    verify: isSandbox
      ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json'
      : 'https://api.zarinpal.com/pg/v4/payment/verify.json',
    startPay: isSandbox
      ? 'https://sandbox.zarinpal.com/pg/StartPay/'
      : 'https://www.zarinpal.com/pg/StartPay/',
  }
}

// ═══════════════════════════════════════════════════════════════
//  ZarinpalVerifyResponse — تایپ پاسخ verify
// ═══════════════════════════════════════════════════════════════

export interface ZarinpalVerifyResponse {
  data?: {
    code: number
    ref_id: number
    fee_type?: string
    fee?: number
    card_pan?: string
    card_hash?: string
    order_id?: string
    status?: string
  }
  errors?: Array<{
    code: number
    message: string
    validations?: any
  }>
}

// ═══════════════════════════════════════════════════════════════
//  extractVerifyData — استخراج اطلاعات از پاسخ verify
// ═══════════════════════════════════════════════════════════════

export function extractVerifyData(verifyData: ZarinpalVerifyResponse): {
  success: boolean
  refId?: string
  fee?: number
  feeType?: string
  cardPan?: string
  cardHash?: string
  errorCode?: number
  errorMessage?: string
} {
  if (!verifyData) {
    return { success: false, errorMessage: 'پاسخ خالی از زرین‌پال' }
  }

  const code = verifyData.data?.code
  const refId = verifyData.data?.ref_id

  if (code === 100 || code === 200) {
    return {
      success: true,
      refId: refId ? String(refId) : undefined,
      fee: verifyData.data?.fee || 0,
      feeType: verifyData.data?.fee_type,
      cardPan: verifyData.data?.card_pan,
      cardHash: verifyData.data?.card_hash,
    }
  }

  const firstError = verifyData.errors?.[0]
  return {
    success: false,
    errorCode: code,
    errorMessage: firstError?.message || 'خطای ناشناخته از زرین‌پال',
  }
}

// ═══════════════════════════════════════════════════════════════
//  recalculateNetSettlement — محاسبه مجدد مبالغ نهایی پس از verify
// ═══════════════════════════════════════════════════════════════

export function recalculateNetSettlement(
  amount: number,
  platformCommission: number,
  actualGatewayFee: number
): {
  gatewayFee: number
  platformCommission: number
  netSettledAmount: number
  isBalanced: boolean
} {
  const netSettledAmount = Math.max(0, amount - platformCommission - actualGatewayFee)
  const sum = actualGatewayFee + platformCommission + netSettledAmount
  const isBalanced = Math.abs(amount - sum) <= 1

  if (!isBalanced) {
    console.warn('[Tashim] ⚠️ Settlement not balanced:', {
      amount, gatewayFee: actualGatewayFee, platformCommission, netSettledAmount, sum,
    })
  }

  return {
    gatewayFee: actualGatewayFee,
    platformCommission,
    netSettledAmount,
    isBalanced,
  }
}
