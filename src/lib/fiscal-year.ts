// ============================================================================
// src/lib/fiscal-year.ts — v2.0 ★★★ COMPLETE
// ShopAccounting — Fiscal Year Management + Event Coordination
// ============================================================================

export type FiscalYearRef = {
  id: string
  name: string
  startDate: Date
  endDate: Date
  isActive: boolean
  isClosed: boolean
}

// ─── Server-side functions (برای API routes) ───────────────────

export async function getActiveFiscalYear(
  client: any,
  tenantId: string
): Promise<FiscalYearRef> {
  const fy = await client.fiscalYear.findFirst({
    where: { tenantId, isActive: true, isClosed: false },
    orderBy: { startDate: 'desc' },
  })

  if (!fy) {
    throw new Error('سال مالی فعالی برای این فروشگاه تعریف نشده است.')
  }

  return fy
}

export async function getFiscalYearById(
  client: any,
  tenantId: string,
  fiscalYearId: string
): Promise<FiscalYearRef> {
  const fy = await client.fiscalYear.findFirst({
    where: { id: fiscalYearId, tenantId },
  })

  if (!fy) {
    throw new Error('سال مالی انتخابی یافت نشد.')
  }

  return fy
}

export async function resolveFiscalYear(
  client: any,
  tenantId: string,
  fiscalYearId?: string | null
): Promise<FiscalYearRef> {
  if (fiscalYearId) {
    return getFiscalYearById(client, tenantId, fiscalYearId)
  }
  return getActiveFiscalYear(client, tenantId)
}

export function validateDateInFiscalYear(
  date: Date,
  fy: Pick<FiscalYearRef, 'name' | 'startDate' | 'endDate'>
) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) {
    throw new Error('تاریخ نامعتبر است.')
  }

  const start = new Date(fy.startDate)
  const end = new Date(fy.endDate)
  d.setHours(0, 0, 0, 0)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)

  if (d < start || d > end) {
    throw new Error(
      `تاریخ انتخابی (${d.toLocaleDateString('fa-IR')}) خارج از بازه سال مالی «${fy.name}» است.`
    )
  }
}

// ─── Client-side functions (برای هماهنگی UI) ───────────────────

export type FiscalYearEventType =
  | 'created'
  | 'activated'
  | 'closed'
  | 'deleted'
  | 'updated'
  | 'list-changed'

export interface FiscalYearEventDetail {
  type: FiscalYearEventType
  timestamp: number
  yearId?: string
  yearName?: string
  startDate?: string
  endDate?: string
  closedYearId?: string
  closedYearName?: string
  suggestedNextYearName?: string
  closingEntryNumber?: string
  netProfit?: number
}

/**
 * Dispatch a fiscal year event globally.
 * Used by:
 *   - fiscal-year-tab (after closing year)
 *   - setup-wizard (after creating new year)
 *   - Any component that changes fiscal years
 */
export function dispatchFiscalYearEvent(
  type: FiscalYearEventType,
  detail?: Omit<FiscalYearEventDetail, 'type' | 'timestamp'>
) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent('fiscal-year-changed', {
        detail: {
          type,
          timestamp: Date.now(),
          ...(detail || {}),
        },
      })
    )
  } catch (err) {
    console.warn('[fiscal-year] Failed to dispatch event:', err)
  }
}

/**
 * Trigger the renewal setup wizard.
 * Called after a fiscal year is closed to open the new year wizard.
 */
export function triggerRenewalSetup() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new Event('trigger-renewal-setup'))
  } catch {}
}

/**
 * Listen to fiscal year changes.
 * Used by:
 *   - FiscalYearSelector (header filter)
 *   - setup-wizard (to open after year closed)
 *   - Any component that needs to react to fiscal year changes
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
  return () => window.removeEventListener('fiscal-year-changed', listener)
}

// ─── Utility functions ─────────────────────────────────────────

/**
 * Generate next year name from current year name.
 * Example: "سال مالی ۱۴۰۳" → "سال مالی ۱۴۰۴"
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
  fy: Pick<FiscalYearRef, 'startDate' | 'endDate'>
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
  fy: Pick<FiscalYearRef, 'endDate'>
): number {
  const end = new Date(fy.endDate)
  const now = new Date()
  const diffMs = end.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}