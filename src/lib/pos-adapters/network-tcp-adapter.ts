// src/lib/pos-adapters/network-tcp-adapter.ts
// ShopAccounting v8.0 — Network TCP POS Adapter
// ============================================================================
// ★★★ اتصال TCP/IP به کارتخوان‌های تحت شبکه
//   برای ترمینال‌های مدرن که IP دارن و یه پروتکل TCP ساده ارائه می‌کنن.
//
//   ★ مهم: مرورگرها نمی‌تونن مستقیم TCP socket باز کنن. این adapter به یه
//   bridge نیاز داره — یا:
//     ۱) یه مینی‌سرویس Node.js روی همون کامپیوتر صندوق که TCP رو به HTTP proxy می‌کنه
//     ۲) یا WebSocket bridge (پیچیده‌تر)
//
//   ★ این adapter فرض می‌کنه یه bridge روی http://localhost:<port>/pos-tcp وجود داره
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

export class NetworkTcpAdapter implements PosAdapter {
  readonly type: TerminalType = 'network-tcp'
  readonly displayName = 'اتصال شبکه (TCP/IP)'

  private config: PosAdapterConfig
  private status: AdapterStatus = 'disconnected'
  private emitter = new AdapterEventEmitter()
  private sessionId: string | null = null
  private pollTimer: any = null
  private pendingPayment: {
    amount: number
    resolve: (result: CardPaymentResult) => void
    timeoutId?: any
  } | null = null

  constructor(config: PosAdapterConfig) {
    this.config = config
  }

  /**
   * ★ URL bridge — یه سرویس Node.js کوچک که TCP رو به HTTP proxy می‌کنه
   *   مسیر پیش‌فرض: http://localhost:3821/pos-tcp
   */
  private get bridgeUrl(): string {
    return this.config.apiBaseUrl || 'http://localhost:3821/pos-tcp'
  }

  async connect(): Promise<ConnectionTestResult> {
    const start = Date.now()
    try {
      this.status = 'connecting'
      this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'connecting' })

      // ★ درخواست اتصال به bridge
      const res = await fetch(`${this.bridgeUrl}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ipAddress: this.config.ipAddress,
          port: this.config.port,
          terminalId: this.config.terminalId,
        }),
      })

      if (!res.ok) {
        throw new Error(`bridge error: ${res.status}`)
      }

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.message || 'اتصال ناموفق')
      }

      this.sessionId = data.sessionId
      this.status = 'connected'
      this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'connected' })
      this.emitter.emit(ADAPTER_EVENTS.LOG, {
        level: 'info',
        message: `اتصال به ${this.config.ipAddress}:${this.config.port} برقرار شد`,
      })

      // ★ شروع polling برای دریافت نتیجه
      this.startPolling()

      return {
        success: true,
        message: data.message || 'اتصال برقرار شد',
        deviceInfo: data.deviceInfo,
        durationMs: Date.now() - start,
      }
    } catch (err: any) {
      this.status = 'error'
      this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'error' })
      return {
        success: false,
        message: `خطا در اتصال: ${err?.message || err}. مطمئن شوید bridge روی ${this.bridgeUrl} اجرا می‌شود.`,
        durationMs: Date.now() - start,
      }
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling()
    if (this.sessionId) {
      try {
        await fetch(`${this.bridgeUrl}/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: this.sessionId }),
        })
      } catch {}
      this.sessionId = null
    }
    this.status = 'disconnected'
    this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'disconnected' })
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const result = await this.connect()
    if (result.success) {
      await this.disconnect()
    }
    return result
  }

  async pay(request: CardPaymentRequest): Promise<CardPaymentResult> {
    if (this.status !== 'connected' || !this.sessionId) {
      return {
        success: false,
        status: 'failed',
        amount: request.amount,
        errorMessage: 'کارتخوان متصل نیست',
      }
    }

    this.emitter.emit(ADAPTER_EVENTS.PAYMENT_PROGRESS, {
      stage: 'sending_command',
      amount: request.amount,
      message: `ارسال درخواست پرداخت به ${this.config.ipAddress}`,
    })

    try {
      const res = await fetch(`${this.bridgeUrl}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          amount: request.amount,
          invoiceId: request.invoiceId,
          invoiceNumber: request.invoiceNumber,
        }),
      })

      if (!res.ok) {
        throw new Error(`bridge error: ${res.status}`)
      }

      const data = await res.json()
      if (!data.success && data.pending) {
        // ★ پرداخت در حال انجام — منتظر polling می‌مونیم
        return new Promise<CardPaymentResult>((resolve) => {
          const timeoutMs = request.timeoutMs || this.config.advanced?.timeoutMs || 60000
          const timeoutId = setTimeout(() => {
            if (this.pendingPayment) {
              this.pendingPayment.resolve({
                success: false,
                status: 'timeout',
                amount: request.amount,
                errorMessage: 'timeout',
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

      // ★ پاسخ فوری
      return this.parseBridgeResponse(data, request.amount)
    } catch (err: any) {
      return {
        success: false,
        status: 'failed',
        amount: request.amount,
        errorMessage: `خطا در ارتباط با bridge: ${err?.message || err}`,
      }
    }
  }

  async cancelPayment(): Promise<void> {
    if (this.pendingPayment && this.sessionId) {
      clearTimeout(this.pendingPayment.timeoutId)
      try {
        await fetch(`${this.bridgeUrl}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: this.sessionId }),
        })
      } catch {}
      this.pendingPayment.resolve({
        success: false,
        status: 'cancelled',
        amount: this.pendingPayment.amount,
        errorMessage: 'لغو شد',
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

  private startPolling(): void {
    if (this.pollTimer || !this.sessionId) return
    this.pollTimer = setInterval(() => this.pollStatus(), 1500)
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async pollStatus(): Promise<void> {
    if (!this.sessionId) return
    try {
      const res = await fetch(`${this.bridgeUrl}/status?sessionId=${this.sessionId}`)
      if (!res.ok) return
      const data = await res.json()

      // ★ اگه پرداخت در انتظار بود و نتیجه اومد
      if (this.pendingPayment && data.paymentResult) {
        const result = this.parseBridgeResponse(data.paymentResult, this.pendingPayment.amount)
        clearTimeout(this.pendingPayment.timeoutId)
        this.pendingPayment.resolve(result)
        this.pendingPayment = null
      }

      // ★ به‌روزرسانی وضعیت اتصال
      if (data.connected === false) {
        this.emitter.emit(ADAPTER_EVENTS.LOG, {
          level: 'warn',
          message: 'اتصال قطع شد',
        })
        this.status = 'disconnected'
        this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'disconnected' })
        this.stopPolling()
      }
    } catch (err) {
      // ★ خطای polling — silent
    }
  }

  private parseBridgeResponse(data: any, amount: number): CardPaymentResult {
    return {
      success: data.success || data.status === 'successful',
      status: data.status || (data.success ? 'successful' : 'failed'),
      amount: data.amount || amount,
      referenceNumber: data.referenceNumber || data.rrn,
      traceNumber: data.traceNumber,
      cardNumber: data.cardLast4 || data.cardNumber,
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
