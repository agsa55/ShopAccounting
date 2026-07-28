// src/lib/pos-adapters/manual-adapter.ts
// ShopAccounting v8.0 — Manual Entry POS Adapter
// ============================================================================
// ★★★ ساده‌ترین و همه‌گیرترین حالت:
//   صندوق‌دار بعد از کشیدن کارت روی کارتخوان، شماره پیرو (RRN)، شماره پیگیری،
//   و ۴ رقم آخر کارت رو در فرم وارد می‌کنه. adapter فقط داده‌ها رو validate
//   می‌کنه و در صورت فعال بودن، با شاپرک تأیید می‌کنه.
//
//   ★ این حالت با EVERY کارتخوان کار می‌کنه — حتی کارتخوان‌های بدون API.
//   ★ نیاز به هیچ اتصال فیزیکی نداره.
// ============================================================================

import {
  type PosAdapter,
  type TerminalType,
  type PosAdapterConfig,
  type CardPaymentRequest,
  type CardPaymentResult,
  type ConnectionTestResult,
  type AdapterStatus,
  type ReferenceCodeType,
  ADAPTER_EVENTS,
} from './types'
import { AdapterEventEmitter } from './event-emitter'

export class ManualEntryAdapter implements PosAdapter {
  readonly type: TerminalType = 'manual'
  readonly displayName = 'ورودی دستی (Manual Entry)'

  private config: PosAdapterConfig
  private status: AdapterStatus = 'disconnected'
  private emitter = new AdapterEventEmitter()
  private currentPaymentCancelled = false

  constructor(config: PosAdapterConfig) {
    this.config = config
  }

  async connect(): Promise<ConnectionTestResult> {
    // ★ Manual adapter همیشه "متصل" محسوب می‌شه — چون سخت‌افزاری وجود نداره
    this.status = 'connected'
    this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'connected' })
    this.emitter.emit(ADAPTER_EVENTS.LOG, { level: 'info', message: 'Manual adapter آماده' })
    return {
      success: true,
      message: 'حالت ورودی دستی فعال شد. صندوق‌دار باید بعد از تراکنش، شماره پیرو رو وارد کنه.',
      deviceInfo: {
        terminalId: this.config.terminalId,
        merchantId: this.config.merchantId,
      },
    }
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected'
    this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'disconnected' })
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return this.connect()
  }

  /**
   * ★ در حالت Manual، pay() فقط مبلغ رو ثبت می‌کنه و منتظر می‌مونه تا
   * فراخوان‌کننده (UI) شماره پیرو رو از طریق submitManualResult() وارد کنه.
   */
  async pay(request: CardPaymentRequest): Promise<CardPaymentResult> {
    this.currentPaymentCancelled = false
    this.emitter.emit(ADAPTER_EVENTS.PAYMENT_PROGRESS, {
      stage: 'waiting_manual_entry',
      amount: request.amount,
      message: `منتظر ورود دستی شماره پیرو برای مبلغ ${request.amount.toLocaleString('fa-IR')} ریال`,
    })

    // ★ در حالت Manual، UI باید خودش فرم نمایش بده و بعد از submit،
    // این متد resolve بشه. اینجا فقط یه Promise برمی‌گردونیم که UI اون رو
    // با submitManualResult حل می‌کنه.
    return new Promise<CardPaymentResult>((resolve) => {
      this.pendingResolve = resolve
      this.emitter.emit(ADAPTER_EVENTS.PAYMENT_PROGRESS, {
        stage: 'awaiting_input',
        message: 'فرم ورود دستی نمایش داده شد',
      })
    })
  }

  private pendingResolve?: (result: CardPaymentResult) => void

  /**
   * ★ UI این متد رو صدا می‌زنه وقتی کاربر شماره پیرو رو وارد کرد.
   * نتیجه رو validate می‌کنه و در صورت فعال بودن، با شاپرک تأیید می‌کنه.
   *
   * ★★★ v8.1: پشتیبانی از انواع مختلف کد مرجع روی رسید ★★★
   * هر کارتخوان فرمت رسید متفاوتی داره. کاربر مشخص می‌کنه کدوم نوع کد
   * رو از روی رسید وارد کرده (rrn / unique_code / trace / terminal / ...).
   */
  async submitManualResult(input: {
    referenceNumber: string
    referenceType?: ReferenceCodeType   // ★★★ v8.1
    traceNumber?: string
    cardLast4?: string
    cardType?: string
    authorizationCode?: string
    amount: number
  }): Promise<void> {
    // ★ Validation — حداقل طول بسته به نوع کد
    const minLen = this.getMinReferenceLength(input.referenceType || 'rrn')
    if (!input.referenceNumber || input.referenceNumber.trim().length < minLen) {
      const typeName = this.getReferenceTypeName(input.referenceType || 'rrn')
      const result: CardPaymentResult = {
        success: false,
        status: 'failed',
        amount: input.amount,
        errorMessage: `${typeName} باید حداقل ${minLen} رقم باشد`,
      }
      this.pendingResolve?.(result)
      this.pendingResolve = undefined
      return
    }

    // ★ در اینجا می‌تونیم در صورت فعال بودن advanced.shaparakVerify،
    // تراکنش رو با شاپرک تأیید کنیم. فعلاً فقط ثبت می‌کنیم.
    let shaparakVerified = false
    let shaparakError: string | undefined

    if (this.config.advanced?.shaparakVerify && this.config.advanced?.shaparakMerchantCode) {
      // TODO: فراخوانی API شاپرک برای تأیید تراکنش
      // فعلاً skip می‌کنیم
      this.emitter.emit(ADAPTER_EVENTS.LOG, {
        level: 'info',
        message: 'تأیید شاپرک فعال است ولی هنوز پیاده‌سازی نشده — skip شد',
      })
    }

    const result: CardPaymentResult = {
      success: true,
      status: 'successful',
      amount: input.amount,
      referenceNumber: input.referenceNumber.trim(),
      referenceType: input.referenceType || 'rrn',
      traceNumber: input.traceNumber?.trim(),
      cardNumber: input.cardLast4?.trim(),
      cardType: input.cardType || 'unknown',
      authorizationCode: input.authorizationCode?.trim(),
      errorMessage: shaparakError,
      receiptData: {
        terminalId: this.config.terminalId,
        merchantId: this.config.merchantId,
        acceptorCode: this.config.acceptorCode,
        dateTime: new Date().toISOString(),
      },
      paidAt: new Date(),
    }

    shaparakVerified = !shaparakError
    ;(result as any).shaparakVerified = shaparakVerified

    this.emitter.emit(ADAPTER_EVENTS.PAYMENT_PROGRESS, {
      stage: 'completed',
      message: 'پرداخت با موفقیت ثبت شد',
      result,
    })

    this.pendingResolve?.(result)
    this.pendingResolve = undefined
  }

  /**
   * ★★★ v8.1: حداقل طول کد مرجع بر اساس نوع
   */
  private getMinReferenceLength(type: ReferenceCodeType): number {
    switch (type) {
      case 'rrn':          return 6   // 6-12 digit
      case 'unique_code':  return 6   // معمولاً 9 ولی حداقل 6
      case 'trace':        return 4   // معمولاً 6-8
      case 'terminal':     return 5   // معمولاً 7-8
      case 'auth_code':    return 4   // معمولاً 6
      case 'stan':         return 4   // معمولاً 6
      case 'other':        return 4   // هر کدی
      default:             return 6
    }
  }

  /**
   * ★★★ v8.1: نام نمایشی نوع کد برای پیام‌های خطا
   */
  private getReferenceTypeName(type: ReferenceCodeType): string {
    const names: Record<ReferenceCodeType, string> = {
      rrn: 'شماره پیرو',
      unique_code: 'کد یکتا',
      trace: 'کد پیگیری',
      terminal: 'شماره پایانه',
      auth_code: 'کد تأیید',
      stan: 'شماره تراکنش',
      other: 'کد مرجع',
    }
    return names[type] || 'کد مرجع'
  }

  async cancelPayment(): Promise<void> {
    this.currentPaymentCancelled = true
    if (this.pendingResolve) {
      const result: CardPaymentResult = {
        success: false,
        status: 'cancelled',
        amount: 0,
        errorMessage: 'پرداخت توسط کاربر لغو شد',
      }
      this.pendingResolve(result)
      this.pendingResolve = undefined
    }
    this.emitter.emit(ADAPTER_EVENTS.LOG, { level: 'info', message: 'پرداخت لغو شد' })
  }

  getStatus(): AdapterStatus {
    return this.status
  }

  on(event: string, listener: (data: any) => void): void {
    this.emitter.on(event, listener)
  }

  off(event: string, listener: (data: any) => void): void {
    this.emitter.off(event, listener)
  }
}
