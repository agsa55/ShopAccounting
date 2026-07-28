// src/lib/pos-adapters/index.ts
// ShopAccounting v8.0 — Universal POS Adapter Factory
// ============================================================================
// ★★★ این فایل نقطه ورود به سیستم adapter‌هاست.
//   فراخوان‌کننده فقط createPosAdapter(config) رو صدا می‌زنه و نوع مناسب adapter
//   بر اساس config.terminalType ساخته می‌شه.
// ============================================================================

export * from './types'
export { AdapterEventEmitter } from './event-emitter'
export { ManualEntryAdapter } from './manual-adapter'
export { KeyboardHidAdapter } from './keyboard-hid-adapter'
export { WebSerialAdapter } from './web-serial-adapter'
export { NetworkTcpAdapter } from './network-tcp-adapter'

import type { PosAdapter, PosAdapterConfig, TerminalType } from './types'
import { ManualEntryAdapter } from './manual-adapter'
import { KeyboardHidAdapter } from './keyboard-hid-adapter'
import { WebSerialAdapter } from './web-serial-adapter'
import { NetworkTcpAdapter } from './network-tcp-adapter'

/**
 * ★★★ Factory — ساخت adapter مناسب بر اساس terminalType
 *
 * @example
 * ```ts
 * const adapter = createPosAdapter({
 *   terminalType: 'manual',
 *   name: 'کارتخوان آسان‌پرداخت',
 *   merchantId: '123456789',
 *   terminalId: 'TERM001',
 *   apiBaseUrl: 'http://localhost:3821',
 * })
 * const result = await adapter.testConnection()
 * if (result.success) {
 *   const payment = await adapter.pay({ amount: 100000 })
 *   console.log(payment.referenceNumber)
 * }
 * ```
 */
export function createPosAdapter(config: PosAdapterConfig): PosAdapter {
  switch (config.terminalType as TerminalType) {
    case 'manual':
      return new ManualEntryAdapter(config)

    case 'keyboard-hid':
      return new KeyboardHidAdapter(config)

    case 'web-serial':
      return new WebSerialAdapter(config)

    case 'network-tcp':
    case 'network-http':
      return new NetworkTcpAdapter(config)

    default:
      console.warn(`[POS Adapter] Unknown terminalType "${config.terminalType}", falling back to manual`)
      return new ManualEntryAdapter(config)
  }
}

/**
 * ★ بررسی پشتیبانی مرورگر از هر نوع اتصال
 */
export function checkBrowserSupport(terminalType: TerminalType): {
  supported: boolean
  message?: string
} {
  if (typeof window === 'undefined') return { supported: true }

  switch (terminalType) {
    case 'manual':
    case 'keyboard-hid':
    case 'network-tcp':
    case 'network-http':
      return { supported: true }

    case 'web-serial':
      if (!(navigator as any).serial) {
        return {
          supported: false,
          message: 'مرورگر شما از Web Serial API پشتیبانی نمی‌کند. از Chrome یا Edge نسخه ۸۹+ استفاده کنید.',
        }
      }
      return { supported: true }

    default:
      return { supported: true }
  }
}

/**
 * ★ تولید ID امن برای ترمینال
 */
export function generateTerminalId(): string {
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
