// src/lib/pos-adapters/event-emitter.ts
// ShopAccounting v8.0 — Simple Event Emitter for Adapters
// ============================================================================

type Listener = (data: any) => void

export class AdapterEventEmitter {
  private listeners: Map<string, Set<Listener>> = new Map()

  on(event: string, listener: Listener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener)
  }

  emit(event: string, data?: any): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(data)
      } catch (err) {
        console.error('[AdapterEventEmitter] listener error:', err)
      }
    })
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }
}
