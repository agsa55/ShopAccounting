// ============================================================================
// src/lib/fiscal-year-events.ts — v1.0
// ShopAccounting — Fiscal Year Event Coordination System
// ============================================================================
// هماهنگی بین:
//   - fiscal-year-tab (بستن سال)
//   - setup-wizard (راه‌اندازی سال جدید)
//   - FiscalYearSelector (فیلتر هدر)
//   - هر کامپوننت دیگری که با سال مالی کار می‌کند
// ============================================================================

export type FiscalYearEventType =
  | 'created'        // سال جدید ساخته شد
  | 'activated'      // سال فعال شد
  | 'closed'         // سال بسته شد
  | 'deleted'        // سال حذف شد
  | 'updated'        // سال ویرایش شد
  | 'list-changed'   // لیست سال‌ها تغییر کرد (refresh عمومی)

export interface FiscalYearEventDetail {
  type: FiscalYearEventType
  timestamp: number
  // برای type='created' | 'activated' | 'updated'
  yearId?: string
  yearName?: string
  startDate?: string
  endDate?: string
  // برای type='closed'
  closedYearId?: string
  closedYearName?: string
  suggestedNextYearName?: string
  closingEntryNumber?: string
  netProfit?: number
  // برای type='deleted'
  deletedYearId?: string
  deletedYearName?: string
  // برای type='list-changed'
  reason?: string
}

/**
 * Dispatch a fiscal year event globally.
 * All components (header filter, setup wizard, fiscal-year-tab) listen to this.
 * 
 * @example
 * dispatchFiscalYearEvent('closed', {
 *   closedYearId: 'abc123',
 *   closedYearName: 'سال مالی ۱۴۰۳',
 *   suggestedNextYearName: 'سال مالی ۱۴۰۴',
 * })
 */
export function dispatchFiscalYearEvent(
  type: FiscalYearEventType,
  detail?: Omit<FiscalYearEventDetail, 'type' | 'timestamp'>
) {
  if (typeof window === 'undefined') return
  try {
    const event = new CustomEvent('fiscal-year-changed', {
      detail: {
        type,
        timestamp: Date.now(),
        ...(detail || {}),
      },
    })
    window.dispatchEvent(event)
    console.log(`[fiscal-year-events] ✅ Dispatched: ${type}`, detail)
  } catch (err) {
    console.warn('[fiscal-year-events] Failed to dispatch event:', err)
  }
}

/**
 * Trigger the renewal setup wizard directly.
 * Called after a fiscal year is closed to open the new year wizard.
 * 
 * @example
 * triggerRenewalSetup()
 */
export function triggerRenewalSetup() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new Event('trigger-renewal-setup'))
    console.log('[fiscal-year-events] 🔄 Triggered renewal setup')
  } catch (err) {
    console.warn('[fiscal-year-events] Failed to trigger renewal setup:', err)
  }
}

/**
 * Listen to fiscal year changes.
 * Returns a cleanup function to remove the listener.
 * 
 * @example
 * useEffect(() => {
 *   return onFiscalYearChanged((detail) => {
 *     if (detail.type === 'activated') {
 *       setSelectedFiscalYearId(detail.yearId)
 *     }
 *   })
 * }, [])
 */
export function onFiscalYearChanged(
  handler: (detail: FiscalYearEventDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => {}

  const listener = (e: Event) => {
    const detail = (e as CustomEvent<FiscalYearEventDetail>).detail
    handler(detail)
  }

  window.addEventListener('fiscal-year-changed', listener)
  return () => {
    window.removeEventListener('fiscal-year-changed', listener)
  }
}

/**
 * Listen to renewal setup trigger.
 * Returns a cleanup function to remove the listener.
 * 
 * @example
 * useEffect(() => {
 *   return onRenewalSetupTriggered(() => {
 *     // باز کردن wizard
 *   })
 * }, [])
 */
export function onRenewalSetupTriggered(
  handler: () => void
): () => void {
  if (typeof window === 'undefined') return () => {}

  window.addEventListener('trigger-renewal-setup', handler)
  return () => {
    window.removeEventListener('trigger-renewal-setup', handler)
  }
}

// ─── Utility functions ─────────────────────────────────────────

/**
 * Generate next year name from current year name.
 * Example: "سال مالی ۱۴۰۳" → "سال مالی ۱۴۰۴"
 * Example: "Fiscal Year 2024" → "Fiscal Year 2025"
 */
export function generateNextYearName(prevName: string): string {
  const faYearMatch = prevName.match(/([۰-۹]{4}|\d{4})/)

  if (faYearMatch) {
    const yearStr = faYearMatch[1]
    const isFa = /[۰-۹]/.test(yearStr)

    let year: number
    if (isFa) {
      year = parseInt(
        yearStr.replace(/[۰-۹]/g, (d) =>
          String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
        ),
        10
      )
    } else {
      year = parseInt(yearStr, 10)
    }

    const nextYear = year + 1
    const nextYearStr = isFa
      ? String(nextYear).replace(
          /\d/g,
          (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]
        )
      : String(nextYear)

    return prevName.replace(yearStr, nextYearStr)
  }

  return prevName + ' (بعدی)'
}

/**
 * Check if a date is within a fiscal year range.
 */
export function isDateInFiscalYear(
  date: Date,
  fy: { startDate: Date | string; endDate: Date | string }
): boolean {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return false

  const start = new Date(fy.startDate)
  const end = new Date(fy.endDate)
  d.setHours(0, 0, 0, 0)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)

  return d >= start && d <= end
}

/**
 * Get days remaining until fiscal year ends.
 */
export function getDaysUntilFiscalYearEnd(
  fy: { endDate: Date | string }
): number {
  const end = new Date(fy.endDate)
  const now = new Date()
  const diffMs = end.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}