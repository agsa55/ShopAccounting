// src/lib/pos-adapters/web-serial-adapter.ts
// ShopAccounting v8.0 — Web Serial API POS Adapter
// ============================================================================
// ★★★ اتصال مستقیم USB/Serial به کارتخوان
//   از Web Serial API استفاده می‌کنه (فقط Chrome/Edge 89+).
//   مناسب کارتخوان‌هایی که پروتکل سریال دارن (Verifone, Ingenico, PAX, ...)
//
//   ★ این adapter به صورت frontend-only کار می‌کنه — نیازی به backend نداره.
//   ★ کاربر باید پورت رو با navigator.serial.requestPort() انتخاب کنه.
//
//   ★ توجه: پروتکل هر کارتخوان متفاوته. این adapter یه پروتکل عمومی پیاده‌سازی
//   می‌کنه. برای برندهای خاص، باید subclass ساخته بشه.
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

// ★ تایپ Web Serial API (در lib.dom نیست)
interface SerialPortLike {
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  getInfo(): { usbVendorId?: number; usbProductId?: number }
}

interface NavigatorSerialLike {
  requestPort(options?: { filters?: any[] }): Promise<SerialPortLike>
  getPorts(): Promise<SerialPortLike[]>
}

export class WebSerialAdapter implements PosAdapter {
  readonly type: TerminalType = 'web-serial'
  readonly displayName = 'اتصال USB/سریال (Web Serial)'

  private config: PosAdapterConfig
  private status: AdapterStatus = 'disconnected'
  private emitter = new AdapterEventEmitter()
  private port: SerialPortLike | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private readLoopActive = false
  private pendingPayment: {
    amount: number
    resolve: (result: CardPaymentResult) => void
    timeoutId?: any
  } | null = null
  private receiveBuffer = ''

  constructor(config: PosAdapterConfig) {
    this.config = config
  }

  async connect(): Promise<ConnectionTestResult> {
    const start = Date.now()
    try {
      if (typeof navigator === 'undefined' || !(navigator as any).serial) {
        return {
          success: false,
          message: 'مرورگر شما از Web Serial API پشتیبانی نمی‌کند. از Chrome یا Edge نسخه ۸۹+ استفاده کنید.',
        }
      }

      this.status = 'connecting'
      this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'connecting' })

      // ★ درخواست انتخاب پورت از کاربر
      const serial = (navigator as any).serial as NavigatorSerialLike
      this.port = await serial.requestPort()

      // ★ باز کردن پورت با baudRate از config
      const baudRate = this.config.baudRate || 115200
      await this.port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' })

      this.status = 'connected'
      this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'connected' })
      this.emitter.emit(ADAPTER_EVENTS.LOG, {
        level: 'info',
        message: `اتصال به پورت سریال با baud rate ${baudRate} برقرار شد`,
      })

      // ★ شروع loop خواندن داده
      this.startReadLoop()

      return {
        success: true,
        message: 'اتصال برقرار شد',
        deviceInfo: {
          terminalId: this.config.terminalId,
        },
        durationMs: Date.now() - start,
      }
    } catch (err: any) {
      this.status = 'error'
      this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'error' })
      this.emitter.emit(ADAPTER_EVENTS.LOG, {
        level: 'error',
        message: `خطا در اتصال: ${err?.message || err}`,
      })
      return {
        success: false,
        message: `خطا در اتصال: ${err?.message || err}`,
        durationMs: Date.now() - start,
      }
    }
  }

  async disconnect(): Promise<void> {
    this.readLoopActive = false
    try {
      if (this.reader) {
        await this.reader.cancel()
        this.reader = null
      }
      if (this.writer) {
        await this.writer.close()
        this.writer = null
      }
      if (this.port) {
        await this.port.close()
        this.port = null
      }
    } catch (err) {
      this.emitter.emit(ADAPTER_EVENTS.LOG, {
        level: 'warn',
        message: `خطا در disconnect: ${err}`,
      })
    }
    this.status = 'disconnected'
    this.emitter.emit(ADAPTER_EVENTS.STATUS_CHANGE, { status: 'disconnected' })
  }

  async testConnection(): Promise<ConnectionTestResult> {
    // ★ در Web Serial، تست = connect + send ping + disconnect
    const result = await this.connect()
    if (result.success) {
      await this.disconnect()
    }
    return result
  }

  async pay(request: CardPaymentRequest): Promise<CardPaymentResult> {
    if (this.status !== 'connected' || !this.port) {
      return {
        success: false,
        status: 'failed',
        amount: request.amount,
        errorMessage: 'کارتخوان متصل نیست. ابتدا اتصال را برقرار کنید.',
      }
    }

    this.emitter.emit(ADAPTER_EVENTS.PAYMENT_PROGRESS, {
      stage: 'sending_command',
      amount: request.amount,
      message: `ارسال درخواست پرداخت ${request.amount.toLocaleString('fa-IR')} ریال به کارتخوان`,
    })

    // ★ ارسال فرمان پرداخت به کارتخوان
    // ★★★ توجه: فرمت فرمان به برند کارتخوان بستگی داره.
    //   اینجا یه فرمت عمومی (NAC ISO8583) استفاده می‌کنیم. برای برندهای خاص،
    //   باید subclass با فرمان اختصاصی ساخته بشه.
    const command = this.buildPaymentCommand(request.amount)
    await this.sendCommand(command)

    return new Promise<CardPaymentResult>((resolve) => {
      const timeoutMs = request.timeoutMs || this.config.advanced?.timeoutMs || 60000
      const timeoutId = setTimeout(() => {
        if (this.pendingPayment) {
          this.pendingPayment.resolve({
            success: false,
            status: 'timeout',
            amount: request.amount,
            errorMessage: `کارتخوان در زمان ${timeoutMs / 1000} ثانیه پاسخ نداد`,
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
      // ★ ارسال فرمان لغو به کارتخوان
      await this.sendCommand(this.buildCancelCommand())
      this.pendingPayment.resolve({
        success: false,
        status: 'cancelled',
        amount: this.pendingPayment.amount,
        errorMessage: 'پرداخت لغو شد',
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
  //  Private helpers
  // ═══════════════════════════════════════════════════════════════

  private startReadLoop(): void {
    if (!this.port?.readable || this.readLoopActive) return
    this.readLoopActive = true
    this.readLoop()
  }

  private async readLoop(): Promise<void> {
    if (!this.port?.readable) return
    this.reader = this.port.readable.getReader()

    try {
      while (this.readLoopActive) {
        const { done, value } = await this.reader.read()
        if (done) break
        if (value) {
          // ★ تبدیل Uint8Array به string
          const chunk = new TextDecoder().decode(value)
          this.receiveBuffer += chunk
          this.processReceivedData()
        }
      }
    } catch (err) {
      this.emitter.emit(ADAPTER_EVENTS.LOG, {
        level: 'error',
        message: `خطا در خواندن: ${err}`,
      })
    } finally {
      this.reader?.releaseLock()
      this.reader = null
    }
  }

  private processReceivedData(): void {
    // ★ پردازش پاسخ کارتخوان — معمولاً با \n یا STX/ETX جدا می‌شه
    const lines = this.receiveBuffer.split(/[\r\n]+/)
    this.receiveBuffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      this.parseResponse(trimmed)
    }
  }

  private parseResponse(line: string): void {
    this.emitter.emit(ADAPTER_EVENTS.LOG, {
      level: 'debug',
      message: `Received: ${line}`,
    })

    if (!this.pendingPayment) return

    // ★ پاسخ کارتخوان معمولاً شامل این فیلدهاست:
    //   00 = کد پاسخ (موفق)
    //   RRN = شماره پیرو
    //   CardNo = ۴ رقم آخر کارت
    //   AuthCode = کد تأیید

    // ★ الگوی ساده: اگر خط با 00 شروع شد و حداقل ۶ رقم داره = موفق
    if (/^00/.test(line) || /OK/i.test(line)) {
      const rrnMatch = line.match(/(?:RRN[:\s]*)?(\d{6,12})/)
      const cardMatch = line.match(/(?:Card|PAN)[:\s]*(\d{4})/i)
      const authMatch = line.match(/(?:Auth|Code)[:\s]*(\w+)/i)

      const referenceNumber = rrnMatch?.[1] || line.replace(/\D/g, '').slice(-12)
      const cardLast4 = cardMatch?.[1]
      const authCode = authMatch?.[1]

      if (referenceNumber && referenceNumber.length >= 6) {
        clearTimeout(this.pendingPayment.timeoutId)
        this.pendingPayment.resolve({
          success: true,
          status: 'successful',
          amount: this.pendingPayment.amount,
          referenceNumber,
          cardNumber: cardLast4,
          authorizationCode: authCode,
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
      }
    } else if (/^0[5-9]/.test(line) || /FAIL|DECLINE|ERROR/i.test(line)) {
      // ★ کدهای خطای رایج: 05, 06, ... یا خطا
      clearTimeout(this.pendingPayment.timeoutId)
      this.pendingPayment.resolve({
        success: false,
        status: 'failed',
        amount: this.pendingPayment.amount,
        errorMessage: `کارتخوان خطا برگرداند: ${line}`,
      })
      this.pendingPayment = null
    }
  }

  private async sendCommand(command: string): Promise<void> {
    if (!this.port?.writable) return
    this.writer = this.port.writable.getWriter()
    try {
      const data = new TextEncoder().encode(command + '\r\n')
      await this.writer.write(data)
    } finally {
      this.writer.releaseLock()
      this.writer = null
    }
  }

  /**
   * ★ ساخت فرمان پرداخت — فرمت به برند کارتخوان بستگی داره
   *   اینجا یه فرمت عمومی استفاده می‌کنیم. برای برندهای خاص، subclass بسازید.
   */
  private buildPaymentCommand(amount: number): string {
    const brand = this.config.brand || 'generic'
    // ★ مثال: فرمت ساده NAC
    //   PMT|<amount in rials>|<merchantId>|<terminalId>
    return `PMT|${Math.round(amount)}|${this.config.merchantId || ''}|${this.config.terminalId || ''}`
  }

  private buildCancelCommand(): string {
    return 'CANCEL'
  }
}
