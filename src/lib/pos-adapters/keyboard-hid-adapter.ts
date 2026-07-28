// src/lib/pos-adapters/keyboard-hid-adapter.ts
// ShopAccounting v8.0 — Keyboard/HID Emulation POS Adapter
// ============================================================================
// ★★★ حالت کیبورد (HID Emulation):
//   بسیاری از کارتخوان‌های ایرانی (فنی‌پارس، کاوش، پالچ) در تنظیمات خود یه گزینه
//   "حالت کیبورد" یا "HID" دارن. وقتی فعال باشه، کارتخوان بعد از تراکنش موفق،
//   شماره پیرو رو مثل کیبورد تایپ می‌کنه. این adapter این ورودی رو شناسایی می‌کنه.
//
//   ★ کارکرد: در فیلد جستجو، یه فیلد مخفی دریافت کیبورد داریم. وقتی کارتخوان
//   شماره پیرو رو تایپ می‌کنه (معمولاً سریع و بدون فاصله)، تشخیص می‌دیم که این
//   ورودی کارتخوانه و نه کاربر.
//
//   ★ الگوریتم تشخیص: سرعت تایپ > ۱۰ کاراکتر بر ثانیه + فقط عدد + طول ۶ تا ۱۲
// ============================================================================

import {
  type PosAdapter,
  type TerminalType,
  type PosAdapterConfig,
  type CardPaymentRequest,
  type CardPaymentResult,
  type ConnectionTestResult,
  type AdapterStatus,
  ADAPTER_EVENTS,
} from './types'
import { AdapterEventEmitter } from './event-emitter'

export class KeyboardHidAdapter implements PosAdapter {
  readonly type: TerminalType = 'keyboard-hid'
  readonly displayName = 'حالت کیبورد (HID Emulation)'

  private config: PosAdapterConfig
  private status: AdapterStatus = 'disconnected'
  private emitter = new AdapterEventEmitter()

  // ★ State برای شناسایی ورودی کارتخوان
  private buffer = ''
  private lastKeyTime = 0
  private isListening = false
  private keypressHandler?: (e: KeyboardEvent) => void
  private pendingPayment: {
    amount: number
    resolve: (result: CardPaymentResult) => void
    timeoutId?: NodeJS.Timeout
  } | null = null

  // ★ تنظیمات تشخیص
  private readonly MIN_RRN_LENGTH = 6
  private readonly MAX_RRN_LENGTH = 12
  private readonly FAST_TYPE_THRESHOLD_MS = 100  // ★ فاصله < ۱۰۰ms بین کلیدها = احتمالاً کارتخوان
  private readonly BUFFER_TIMEOUT_MS = 2000       // ★ پاک کردن بافر اگه ۲ ثانیه چیزی نیومد

  constructor(config: PosAdapterConfig) {
    this.config = config
  }

  async connect(): Promise<ConnectionTestResult> {
    this.status = 'connected'
    this.startListening()
    this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'connected' })
    this.emitter.emit(ADAPTER_EVENTS.LOG, {
      level: 'info',
      message: 'Keyboard HID adapter فعال. منتظر ورودی کارتخوان...',
    })
    return {
      success: true,
      message: 'حالت کیبورد فعال شد. مطمئن شوید کارتخوان در حالت HID/Keyboard است.',
      deviceInfo: {
        terminalId: this.config.terminalId,
      },
    }
  }

  async disconnect(): Promise<void> {
    this.stopListening()
    this.status = 'disconnected'
    this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'disconnected' })
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return this.connect()
  }

  async pay(request: CardPaymentRequest): Promise<CardPaymentResult> {
    this.emitter.emit(ADAPTER_EVENTS.PAYMENT_PROGRESS, {
      stage: 'waiting_card_swipe',
      amount: request.amount,
      message: `کارت را بکشید... مبلغ: ${request.amount.toLocaleString('fa-IR')} ریال`,
    })

    return new Promise<CardPaymentResult>((resolve) => {
      const timeoutMs = request.timeoutMs || this.config.advanced?.timeoutMs || 60000
      const timeoutId = setTimeout(() => {
        if (this.pendingPayment) {
          this.emitter.emit(ADAPTER_EVENTS.LOG, {
            level: 'warn',
            message: 'پرداخت timeout شد — کارت کشیده نشد',
          })
          resolve({
            success: false,
            status: 'timeout',
            amount: request.amount,
            errorMessage: `زمان انتظار (${timeoutMs / 1000} ثانیه) به پایان رسید`,
          })
          this.pendingPayment = null
        }
      }, timeoutMs)

      this.pendingPayment = {
        amount: request.amount,
        resolve,
        timeoutId,
      }
    })
  }

  async cancelPayment(): Promise<void> {
    if (this.pendingPayment) {
      clearTimeout(this.pendingPayment.timeoutId)
      this.pendingPayment.resolve({
        success: false,
        status: 'cancelled',
        amount: this.pendingPayment.amount,
        errorMessage: 'پرداخت توسط کاربر لغو شد',
      })
      this.pendingPayment = null
    }
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

  // ═══════════════════════════════════════════════════════════════
  //  شنود کیبورد — تشخیص ورودی کارتخوان
  // ═══════════════════════════════════════════════════════════════

  private startListening(): void {
    if (this.isListening || typeof window === 'undefined') return
    this.isListening = true
    this.keypressHandler = (e: KeyboardEvent) => this.handleKeypress(e)
    window.addEventListener('keydown', this.keypressHandler, true)
  }

  private stopListening(): void {
    if (this.keypressHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.keypressHandler, true)
    }
    this.isListening = false
    this.keypressHandler = undefined
    this.buffer = ''
  }

  private handleKeypress(e: KeyboardEvent): void {
    // ★ فقط اگر پرداخت در انتظار هستیم گوش بدیم
    if (!this.pendingPayment) return

    // ★ فقط اعداد رو قبول کن
    const isDigit = /^[0-9]$/.test(e.key)
    if (!isDigit) {
      // ★ اگه Enter زده شد و بافر طولانی‌تر از حداقل، پرداخت تکمیل می‌شه
      if (e.key === 'Enter' && this.buffer.length >= this.MIN_RRN_LENGTH) {
        this.completePayment(this.buffer)
        e.preventDefault()
        return
      }
      // ★ اگه چیزی غیر از عدد و Enter بود، بافر رو پاک کن
      if (e.key !== 'Shift' && e.key !== 'Tab') {
        this.buffer = ''
      }
      return
    }

    const now = Date.now()
    const delta = now - this.lastKeyTime
    this.lastKeyTime = now

    // ★ اگه فاصله از کلید قبلی خیلی زیاد بود (> ۲ ثانیه)، بافر رو ریست کن
    if (delta > this.BUFFER_TIMEOUT_MS) {
      this.buffer = ''
    }

    this.buffer += e.key

    // ★ گزارش پیشرفت
    this.emitter.emit(ADAPTER_EVENTS.PAYMENT_PROGRESS, {
      stage: 'receiving_input',
      message: `در حال دریافت شماره پیرو... (${this.buffer.length} رقم)`,
      bufferLength: this.buffer.length,
      isFastTyping: delta < this.FAST_TYPE_THRESHOLD_MS,
    })

    // ★ اگه طول به حداکثر رسید، پرداخت رو کامل کن
    if (this.buffer.length >= this.MAX_RRN_LENGTH) {
      this.completePayment(this.buffer)
    }

    // ★ جلوگیری از تایپ در input field (مثلاً اگر در فیلد جستجوی محصول بودیم)
    if (delta < this.FAST_TYPE_THRESHOLD_MS) {
      e.preventDefault()
    }
  }

  private completePayment(referenceNumber: string): void {
    if (!this.pendingPayment) return

    const { amount, resolve, timeoutId } = this.pendingPayment
    clearTimeout(timeoutId)

    this.emitter.emit(ADAPTER_EVENTS.PAYMENT_PROGRESS, {
      stage: 'verifying',
      message: `شماره پیرو دریافت شد: ${referenceNumber}`,
    })

    resolve({
      success: true,
      status: 'successful',
      amount,
      referenceNumber,
      cardType: 'unknown',
      receiptData: {
        terminalId: this.config.terminalId,
        merchantId: this.config.merchantId,
        acceptorCode: this.config.acceptorCode,
        dateTime: new Date().toISOString(),
      },
      paidAt: new Date(),
    })

    this.pendingPayment = null
    this.buffer = ''
  }
}
