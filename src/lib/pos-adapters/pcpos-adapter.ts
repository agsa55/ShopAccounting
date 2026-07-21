// src/lib/pos-adapters/pcpos-adapter.ts
// ShopAccounting v8.3 — PC-POS Adapter (Agent-based)
// ============================================================================
// ★★★ این Adapter برای کارتخوان‌های PC-POS با SDK اختصاصی طراحی شده ★★★
//
// کارتخوان‌های پشتیبانی‌شده:
//   - آسان‌پرداخت (asanpardakht)
//   - تومان (toman)
//   - فینوتک (finotech)
//   - بهپاد / بانک ملت (behpad)
//   - بانک صادرات (saderat)
//
// ★★★ نحوه کار ★★★
//
// ۱. فروشگاه ShopAccounting Agent رو روی کامپیوتر صندوق نصب می‌کنه
// ۲. Agent روی localhost:3821 اجرا می‌شه
// ۳. این Adapter از طریق HTTP به Agent وصل می‌شه
// ۴. Agent با SDK اختصاصی بانک به کارتخوان فرمان می‌ده
// ۵. مبلغ خودکار به کارتخوان می‌ره، شماره پیرو خودکار برمی‌گرده
//
// ★★★ نصب Agent ★★★
//
// فروشگاه باید:
// ۱. فایل ShopAccountingAgent.exe رو دانلود کنه
// ۲. روی کامپیوتر صندوق نصب کنه
// ۳. Terminal ID و Merchant ID خودش رو وارد کنه
// ۴. Agent به‌صورت خودکار با ویندوز اجرا می‌شه
//
// ★★★ مزایا ★★★
//
// ✓ مبلغ خودکار به کارتخوان ارسال می‌شه
// ✓ شماره پیرو خودکار برمی‌گرده
// ✓ ۴ رقم آخر کارت خودکار
// ✓ کد تأیید خودکار
// ✓ بدون ورود دستی
// ✓ اتوماسیون کامل
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

export class PcPosAdapter implements PosAdapter {
  readonly type: TerminalType
  readonly displayName: string

  private config: PosAdapterConfig
  private status: AdapterStatus = 'disconnected'
  private emitter = new AdapterEventEmitter()
  private pollTimer: any = null
  private pendingPayment: {
    amount: number
    resolve: (result: CardPaymentResult) => void
    timeoutId?: any
  } | null = null

  constructor(config: PosAdapterConfig) {
    this.config = config
    this.type = config.terminalType
    this.displayName = this.getDisplayName()
  }

  /**
   * ★ URL Agent محلی — پیش‌فرض localhost:3821
   */
  private get agentUrl(): string {
    return this.config.apiBaseUrl || 'http://localhost:3821'
  }

  /**
   * ★ نام نمایشی بر اساس نوع کارتخوان
   */
  private getDisplayName(): string {
    const names: Record<string, string> = {
      asanpardakht: 'آسان‌پرداخت (PC-POS)',
      toman: 'تومان (PC-POS)',
      finotech: 'فینوتک (PC-POS)',
      behpad: 'بهپاد / بانک ملت (PC-POS)',
      saderat: 'بانک صادرات (PC-POS)',
    }
    return names[this.type] || 'PC-POS'
  }

  /**
   * ★ اتصال به Agent — بررسی می‌کنه که Agent در حال اجراست یا نه
   */
  async connect(): Promise<ConnectionTestResult> {
    const start = Date.now()
    try {
      this.status = 'connecting'
      this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'connecting' })

      const res = await fetch(`${this.agentUrl}/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      })

      if (!res.ok) {
        throw new Error(`Agent خطای ${res.status}`)
      }

      const data = await res.json()

      if (!data.running) {
        throw new Error('Agent در حال اجرا نیست')
      }

      this.status = 'connected'
      this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'connected' })
      this.emitter.emit(ADAPTER_EVENTS.LOG, {
        level: 'info',
        message: `متصل به Agent ${this.displayName}`,
      })

      return {
        success: true,
        message: `Agent ${this.displayName} متصل است. کارتخوان آماده استفاده.`,
        deviceInfo: {
          terminalId: data.terminalId || this.config.terminalId,
          merchantId: data.merchantId || this.config.merchantId,
        },
        durationMs: Date.now() - start,
      }
    } catch (err: any) {
      this.status = 'error'
      this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'error' })

      const errorMsg = err?.name === 'TimeoutError'
        ? `Agent در ${this.agentUrl} پاسخ نداد. مطمئن شوید Agent نصب و در حال اجراست.`
        : `خطا در اتصال به Agent: ${err?.message || err}`

      this.emitter.emit(ADAPTER_EVENTS.LOG, {
        level: 'error',
        message: errorMsg,
      })

      return {
        success: false,
        message: errorMsg,
        durationMs: Date.now() - start,
      }
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling()
    this.status = 'disconnected'
    this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'disconnected' })
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return this.connect()
  }

  /**
   * ★★★ شروع پرداخت — مبلغ رو به Agent می‌فرسته، Agent به کارتخوان ★★★
   */
  async pay(request: CardPaymentRequest): Promise<CardPaymentResult> {
    if (this.status !== 'connected') {
      const connectResult = await this.connect()
      if (!connectResult.success) {
        return {
          success: false,
          status: 'failed',
          amount: request.amount,
          errorMessage: connectResult.message,
        }
      }
    }

    this.emitter.emit(ADAPTER_EVENTS.PAYMENT_PROGRESS, {
      stage: 'sending_to_terminal',
      amount: request.amount,
      message: `ارسال مبلغ ${request.amount.toLocaleString('fa-IR')} ریال به کارتخوان ${this.displayName}...`,
    })

    try {
      // ★ ارسال درخواست پرداخت به Agent
      const res = await fetch(`${this.agentUrl}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: request.amount,
          invoiceId: request.invoiceId,
          invoiceNumber: request.invoiceNumber,
          terminalType: this.type,
        }),
        signal: AbortSignal.timeout(request.timeoutMs || 60000),
      })

      if (!res.ok) {
        throw new Error(`Agent خطای ${res.status}`)
      }

      const data = await res.json()

      // ★ اگه Agent pending برگردوند، شروع polling برای دریافت نتیجه
      if (data.pending) {
        this.emitter.emit(ADAPTER_EVENTS.PAYMENT_PROGRESS, {
          stage: 'waiting_card',
          message: 'کارت را بکشید... (مبلغ روی کارتخوان نمایش داده شد)',
        })

        return new Promise<CardPaymentResult>((resolve) => {
          const timeoutMs = request.timeoutMs || 60000
          const timeoutId = setTimeout(() => {
            if (this.pendingPayment) {
              this.pendingPayment.resolve({
                success: false,
                status: 'timeout',
                amount: request.amount,
                errorMessage: `کارتخوان در ${timeoutMs / 1000} ثانیه پاسخ نداد`,
              })
              this.pendingPayment = null
            }
          }, timeoutMs)

          this.pendingPayment = {
            amount: request.amount,
            resolve,
            timeoutId,
          }

          // ★ شروع polling برای دریافت نتیجه
          this.startPolling()
        })
      }

      // ★ پاسخ فوری
      return this.parseAgentResponse(data, request.amount)
    } catch (err: any) {
      return {
        success: false,
        status: 'failed',
        amount: request.amount,
        errorMessage: `خطا در ارتباط با Agent: ${err?.message || err}`,
      }
    }
  }

  async cancelPayment(): Promise<void> {
    if (this.pendingPayment) {
      clearTimeout(this.pendingPayment.timeoutId)

      // ★ ارسال فرمان لغو به Agent
      try {
        await fetch(`${this.agentUrl}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      } catch {}

      this.pendingPayment.resolve({
        success: false,
        status: 'cancelled',
        amount: this.pendingPayment.amount,
        errorMessage: 'پرداخت توسط کاربر لغو شد',
      })
      this.pendingPayment = null
    }

    this.stopPolling()
    this.emitter.emit(ADAPTER_EVENTS.LOG, {
      level: 'info',
      message: 'پرداخت لغو شد',
    })
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
  //  Private helpers
  // ═══════════════════════════════════════════════════════════════

  private startPolling(): void {
    if (this.pollTimer) return
    this.pollTimer = setInterval(() => this.pollPaymentStatus(), 1500)
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async pollPaymentStatus(): Promise<void> {
    if (!this.pendingPayment) return

    try {
      const res = await fetch(`${this.agentUrl}/payment-status`)
      if (!res.ok) return

      const data = await res.json()

      // ★ اگه پرداخت نتیجه داشت
      if (data.result) {
        this.stopPolling()

        const result = this.parseAgentResponse(data.result, this.pendingPayment.amount)

        clearTimeout(this.pendingPayment.timeoutId)
        this.pendingPayment.resolve(result)
        this.pendingPayment = null
      }

      // ★ به‌روزرسانی وضعیت Agent
      if (data.connected === false) {
        this.emitter.emit(ADAPTER_EVENTS.LOG, {
          level: 'warn',
          message: 'اتصال Agent به کارتخوان قطع شد',
        })
      }
    } catch (err) {
      // ★ خطای polling — silent
    }
  }

  /**
   * ★ پارس پاسخ Agent به CardPaymentResult
   */
  private parseAgentResponse(data: any, amount: number): CardPaymentResult {
    const success = data.success === true || data.status === 'successful'

    if (success) {
      this.emitter.emit(ADAPTER_EVENTS.PAYMENT_PROGRESS, {
        stage: 'completed',
        message: `پرداخت موفق! شماره پیرو: ${data.referenceNumber || data.rrn || '-'}`,
      })
    } else {
      this.emitter.emit(ADAPTER_EVENTS.PAYMENT_PROGRESS, {
        stage: 'failed',
        message: data.errorMessage || 'پرداخت ناموفق',
      })
    }

    return {
      success,
      status: data.status || (success ? 'successful' : 'failed'),
      amount: data.amount || amount,
      referenceNumber: data.referenceNumber || data.rrn,
      traceNumber: data.traceNumber || data.trace,
      cardNumber: data.cardNumber || data.cardLast4,
      cardType: data.cardType || 'unknown',
      authorizationCode: data.authorizationCode || data.authCode,
      errorMessage: data.errorMessage,
      receiptData: {
        terminalId: this.config.terminalId,
        merchantId: this.config.merchantId,
        acceptorCode: this.config.acceptorCode,
        dateTime: data.dateTime || new Date().toISOString(),
      },
      paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
    }
  }
}
