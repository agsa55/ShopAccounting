// ============================================================================
// src/lib/fiscal-year-reporting.ts — v1.0
// ShopAccounting — Shared Fiscal-Year Helpers for Operational Reports
// ----------------------------------------------------------------------------
// ★ استفاده:
//   - cash-movements
//   - cashier-performance
//   - cashier-dashboard
//   - checks
//   - installments
//   - customer statement
// ============================================================================

export function safeNum(val: any): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

export function normalizeToken(value: any): string {
  return String(value ?? '').toLowerCase().trim()
}

export function isFieldSupported(model: any, fieldName: string): boolean {
  try {
    const fields = ((model as any).fields || {}) as Record<string, unknown>
    return fieldName in fields
  } catch {
    return false
  }
}

/**
 * جهت تراکنش صندوق را از فیلد type/direction یا transactionType استنتاج می‌کند.
 *★★ مهم: بعضی نسخه‌های CashMovement فیلد type/direction ندارند.
 */
export function inferCashMovementDirection(movement: any): 'in' | 'out' | null {
  const explicit = normalizeToken(movement?.type || movement?.direction)

  if (['in', 'income', 'incoming', 'deposit'].includes(explicit)) return 'in'
  if (['out', 'expense', 'outgoing', 'withdrawal'].includes(explicit)) return 'out'

  const t = normalizeToken(movement?.transactionType)
  if (!t) return null

  // ورودی صندوق
  if (
    t === 'deposit' ||
    t.includes('deposit') ||
    t.includes('واریز') ||
    t === 'sale' ||
    t.includes('sale') ||
    t.includes('فروش') ||
    t === 'service' ||
    t.includes('service') ||
    t.includes('خدمات') ||
    t === 'installment' ||
    t.includes('installment') ||
    t.includes('قسط') ||
    t === 'check' ||
    t.includes('check') ||
    t.includes('چک') ||
    t === 'online' ||
    t === 'card' ||
    t === 'cash' ||
    t.includes('cash') ||
    t.includes('نقد')
  ) {
    return 'in'
  }

  // خروجی صندوق
  if (
    t === 'purchase' ||
    t.includes('purchase') ||
    t.includes('خرید') ||
    t === 'withdrawal' ||
    t.includes('withdrawal') ||
    t.includes('برداشت') ||
    t === 'expense' ||
    t.includes('expense') ||
    t.includes('هزینه') ||
    t === 'repair' ||
    t.includes('repair') ||
    t.includes('تعمیر') ||
    t.includes('refund') ||
    t.includes('return') ||
    t.includes('مرجوع')
  ) {
    return 'out'
  }

  return null
}

export async function resolveEffectiveFiscalYear(
  tenantDb: any,
  tenantId: string,
  fiscalYearIdParam: string | null
): Promise<any> {
  if (fiscalYearIdParam) {
    const fy = await tenantDb.fiscalYear.findFirst({
      where: {
        id: fiscalYearIdParam,
        tenantId,
      },
    })

    if (!fy) {
      throw new Error('سال مالی انتخابی یافت نشد.')
    }

    return fy
  }

  const fy = await tenantDb.fiscalYear.findFirst({
    where: {
      tenantId,
      isActive: true,
      isClosed: false,
    },
    orderBy: {
      startDate: 'desc',
    },
  })

  if (!fy) {
    throw new Error('سال مالی فعالی برای این فروشگاه تعریف نشده است.')
  }

  return fy
}

export function clampDateRange(
  fy: any | null,
  from: Date | null,
  to: Date | null
): {
  from: Date | null
  to: Date | null
  valid: boolean
} {
  if (!fy) {
    const valid = !from || !to || from.getTime() <= to.getTime()
    return { from, to, valid }
  }

  const fyStart = new Date(fy.startDate)
  const fyEnd = new Date(fy.endDate)

  fyStart.setHours(0, 0, 0, 0)
  fyEnd.setHours(23, 59, 59, 999)

  const f = from
    ? new Date(Math.max(from.getTime(), fyStart.getTime()))
    : new Date(fyStart)

  const t = to
    ? new Date(Math.min(to.getTime(), fyEnd.getTime()))
    : new Date(fyEnd)

  f.setHours(0, 0, 0, 0)
  t.setHours(23, 59, 59, 999)

  return {
    from: f,
    to: t,
    valid: f.getTime() <= t.getTime(),
  }
}