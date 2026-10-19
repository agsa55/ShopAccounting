// ============================================================================
// src/app/api/reports/designer/preview/route.ts — v12.9 ★★★
// ShopAccounting — Report Preview API (Railway Compatible)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { extractTenantId } from '@/lib/reports/report-auth'
import { getDataset, getDatasetField } from '@/lib/reports/report-datasets'
import type {
  Dataset,
  ReportDefinition,
  ReportResultRow,
  ReportResultColumn,
  ReportResultMeta,
  AggregateOperator,
  FilterOperator,
} from '@/lib/reports/report-types'
import { db } from '@/lib/db'
import { getTenantInfo } from '@/lib/reports/report-auth'
import { getFeaturesByPlanName } from '@/lib/plan-features'

function resolveTenantPlanName(tenant: any): string {
  return (
    tenant?.planName ||
    tenant?.planTierName ||
    tenant?.plan?.name ||
    'basic'
  )
}
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ═══════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════

const MAX_PREVIEW_ROWS = 5000
const DEFAULT_PREVIEW_ROWS = 100
const MAX_SCAN_ROWS = 50000
const ALL_YEARS_WARNING =
  'این گزارش همه سال‌های مالی را شامل می‌شود و فقط برای بررسی مدیریتی است. برای گزارش رسمی، یک سال مالی انتخاب کنید.'
function resolveRuntimeFiscalIntent(payload: any, definition: ReportDefinition) {
  const policy: any = (definition as any).fiscalYearPolicy
  const hasPolicy =
    policy &&
    typeof policy === 'object' &&
    typeof policy.mode === 'string'

  const mode = hasPolicy ? policy.mode : null

  if (hasPolicy) {
    if (mode === 'all') {
      return {
        mode,
        allYears: true,
        fiscalYearId: null,
        policyControlled: true,
      }
    }

    if (mode === 'active') {
      return {
        mode,
        allYears: false,
        fiscalYearId: null,
        policyControlled: true,
      }
    }

    if (mode === 'selected') {
      const fiscalYearId = String(policy.fiscalYearId || '').trim() || null

      return {
        mode,
        allYears: false,
        fiscalYearId,
        policyControlled: true,
      }
    }

    if (mode === 'none') {
      return {
        mode,
        allYears: true,
        fiscalYearId: null,
        policyControlled: true,
      }
    }
  }

  const allYears =
    payload.allYears === true || payload.allYears === 'true'

  const fiscalYearId = String(payload.fiscalYearId || '').trim() || null

  return {
    mode: allYears ? 'all' : fiscalYearId ? 'selected' : 'active',
    allYears,
    fiscalYearId,
    policyControlled: false,
  }
}

function setNestedWhere(target: any, path: string[], value: any): void {
  let current = target

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]

    if (
      !current[key] ||
      typeof current[key] !== 'object' ||
      Array.isArray(current[key])
    ) {
      current[key] = {}
    }

    current = current[key]
  }

  const lastKey = path[path.length - 1]

  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    current[lastKey] &&
    typeof current[lastKey] === 'object' &&
    !Array.isArray(current[lastKey])
  ) {
    current[lastKey] = {
      ...current[lastKey],
      ...value,
    }
  } else {
    current[lastKey] = value
  }
}

function addAndCondition(where: any, condition: any): void {
  if (!condition) return

  if (!where.AND) {
    where.AND = []
  }

  if (Array.isArray(where.AND)) {
    where.AND.push(condition)
  } else {
    where.AND = [where.AND, condition]
  }
}

async function resolveReportFiscalYear(
  client: any,
  tenantId: string,
  fiscalYearId: string | null
): Promise<any> {
  if (fiscalYearId) {
    const fy = await client.fiscalYear.findFirst({
      where: {
        id: fiscalYearId,
        tenantId,
      },
    })

    if (!fy) {
      throw new Error('سال مالی انتخابی یافت نشد.')
    }

    return fy
  }

  const fy = await client.fiscalYear.findFirst({
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

function buildFiscalYearFilter(
  dataset: Dataset,
  fy: any,
  effectiveFiscalYearId: string | null,
  allYears: boolean
): any | null {
  const cfg = dataset.fiscalYear

  if (!cfg || cfg.strategy === 'none') return null
  if (allYears || !effectiveFiscalYearId || !fy) return null

  if (cfg.strategy === 'direct') {
    const field = cfg.field || 'fiscalYearId'

    return {
      mode: 'and',
      condition: {
        [field]: effectiveFiscalYearId,
      },
    }
  }

  if (cfg.strategy === 'relation') {
    const path = (cfg.relationPath || 'invoice.fiscalYearId').split('.')

    return {
      mode: 'nested',
      path,
      value: effectiveFiscalYearId,
    }
  }

  if (cfg.strategy === 'date') {
    const field = cfg.dateField || 'createdAt'

const from = parseDateBound(fy.startDate, false)
const to = parseDateBound(fy.endDate, true)

if (!from || !to) return null

    return {
      mode: 'and',
      condition: {
        [field]: {
          gte: from,
          lte: to,
        },
      },
    }
  }

  return null
}

// ═══════════════════════════════════════════════════════════════
//  v13.0 Helpers
// ═══════════════════════════════════════════════════════════════

function parseDateBound(value: any, endOfDay = false): Date | null {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null

    const d = new Date(value.getTime())
    if (endOfDay) {
      d.setHours(23, 59, 59, 999)
    } else {
      d.setHours(0, 0, 0, 0)
    }
    return d
  }

  const raw = String(value ?? '').trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null

  if (endOfDay) {
    d.setHours(23, 59, 59, 999)
  } else {
    d.setHours(0, 0, 0, 0)
  }

  return d
}

function toNumericOrNull(value: any): number | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (value && typeof value.toNumber === 'function') {
    const n = value.toNumber()
    return Number.isFinite(n) ? n : null
  }

  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function isUnsupportedTextCaseError(error: any): boolean {
  const msg = String(error?.message || '').toLowerCase()

  return (
    msg.includes('mode') ||
    msg.includes('insensitive') ||
    msg.includes('unknown arg') ||
    msg.includes('invalid `prisma') ||
    msg.includes('cannot use `mode`')
  )
}

function stripInsensitive(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(stripInsensitive)
  }

  if (obj && typeof obj === 'object' && !(obj instanceof Date)) {
    const out: any = {}

    for (const [key, value] of Object.entries(obj)) {
      if (key === 'mode' && String(value).toLowerCase() === 'insensitive') {
        continue
      }

      out[key] = stripInsensitive(value)
    }

    return out
  }

  return obj
}

async function safeFindMany(client: any, modelKey: string, args: any) {
  try {
    return await client[modelKey].findMany(args)
  } catch (error: any) {
    if (isUnsupportedTextCaseError(error)) {
      console.warn(
        '[Preview API v13.0] insensitive mode unsupported, retrying without mode:',
        error?.message
      )

      return await client[modelKey].findMany({
        ...args,
        where: stripInsensitive(args.where),
      })
    }

    throw error
  }
}

async function safeCount(client: any, modelKey: string, args: any) {
  try {
    return await client[modelKey].count(args)
  } catch (error: any) {
    if (isUnsupportedTextCaseError(error)) {
      console.warn(
        '[Preview API v13.0] insensitive mode unsupported in count, retrying without mode:',
        error?.message
      )

      return await client[modelKey].count({
        ...args,
        where: stripInsensitive(args.where),
      })
    }

    throw error
  }
}

function getDefaultCollectionRelationRoots(): Set<string> {
  return new Set([
    'items',
    'lines',
    'payments',
    'schedules',
    'installments',
    'invoiceItems',
    'orderItems',
    'journalLines',
    'movementLines',
  ])
}

function getCollectionRelationRoots(dataset?: Dataset | null): Set<string> {
  const defaults = getDefaultCollectionRelationRoots()

  const extra = (dataset as any)?.collectionRelations

  if (Array.isArray(extra)) {
    for (const item of extra) {
      if (typeof item === 'string' && item.trim()) {
        defaults.add(item.trim())
      }
    }
  }

  return defaults
}

function isCollectionPath(parts: string[], dataset?: Dataset | null): boolean {
  if (parts.length <= 1) return false

  const roots = getCollectionRelationRoots(dataset)
  return roots.has(parts[0])
}

function validatePreviewDefinition(
  definition: ReportDefinition,
  dataset: Dataset
): string[] {
  const errors: string[] = []

  if (!definition || typeof definition !== 'object') {
    return ['تعریف گزارش نامعتبر است.']
  }

  if (!definition.datasetId) {
    errors.push('datasetId الزامی است.')
  }

  if (!Array.isArray(definition.columns) || definition.columns.length === 0) {
    errors.push('حداقل یک ستون الزامی است.')
  } else if (definition.columns.length > 30) {
    errors.push('حداکثر ۳۰ ستون در preview مجاز است.')
  }

  if (definition.filters && !Array.isArray(definition.filters)) {
    errors.push('filters باید آرایه باشد.')
  } else if (Array.isArray(definition.filters) && definition.filters.length > 30) {
    errors.push('حداکثر ۳۰ فیلتر در preview مجاز است.')
  }

  if (definition.groupBy && !Array.isArray(definition.groupBy)) {
    errors.push('groupBy باید آرایه باشد.')
  } else if (Array.isArray(definition.groupBy) && definition.groupBy.length > 8) {
    errors.push('حداکثر ۸ فیلد گروه‌بندی در preview مجاز است.')
  }

  if (definition.orderBy && !Array.isArray(definition.orderBy)) {
    errors.push('orderBy باید آرایه باشد.')
  } else if (Array.isArray(definition.orderBy) && definition.orderBy.length > 8) {
    errors.push('حداکثر ۸ فیلد مرتب‌سازی در preview مجاز است.')
  }

  if (
    definition.limit !== undefined &&
    (typeof definition.limit !== 'number' ||
      definition.limit < 1 ||
      definition.limit > MAX_PREVIEW_ROWS)
  ) {
    errors.push(`limit باید عددی بین ۱ تا ${MAX_PREVIEW_ROWS} باشد.`)
  }

  const hasAggregate = (definition.columns || []).some((c) => !!c.aggregate)
  const hasNonAggregate = (definition.columns || []).some((c) => !c.aggregate)
  const hasGroupBy = Array.isArray(definition.groupBy) && definition.groupBy.length > 0

  if (hasAggregate && hasNonAggregate && !hasGroupBy) {
    errors.push(
      'اگر هم‌زمان ستون aggregate و غیرaggregate دارید، groupBy الزامی است.'
    )
  }

  for (const col of definition.columns || []) {
    const field = getDatasetField(definition.datasetId, col.field)

    if (!field) {
      errors.push(`فیلد '${col.field}' در dataset وجود ندارد.`)
      continue
    }

    if (col.aggregate && !field.aggregatable) {
      errors.push(`فیلد '${col.field}' نمی‌تواند aggregate شود.`)
    }

    const validAggregates = [
      'sum',
      'avg',
      'count',
      'countDistinct',
      'min',
      'max',
    ]

    if (col.aggregate && !validAggregates.includes(col.aggregate)) {
      errors.push(`عملیات aggregate '${col.aggregate}' نامعتبر است.`)
    }
  }

  for (const filter of definition.filters || []) {
    const field = getDatasetField(definition.datasetId, filter.field)

    if (!field) {
      errors.push(`فیلد فیلتر '${filter.field}' یافت نشد.`)
    }
  }

  for (const gb of definition.groupBy || []) {
    const field = getDatasetField(definition.datasetId, gb.field)

    if (!field) {
      errors.push(`فیلد گروه‌بندی '${gb.field}' یافت نشد.`)
    }
  }

  for (const ob of definition.orderBy || []) {
    const field = getDatasetField(definition.datasetId, ob.field)

    if (!field) {
      errors.push(`فیلد مرتب‌سازی '${ob.field}' یافت نشد.`)
    }

    if (ob.direction && !['asc', 'desc'].includes(ob.direction)) {
      errors.push(`جهت مرتب‌سازی '${ob.direction}' نامعتبر است.`)
    }
  }

  if (dataset.fiscalYear?.strategy === 'none') {
    const policy: any = (definition as any).fiscalYearPolicy

    if (policy?.mode === 'active' || policy?.mode === 'selected') {
      errors.push(
        'این دیتاست سال‌محور نیست؛ fiscalYearPolicy نمی‌تواند active یا selected باشد.'
      )
    }
  }

  return errors
}
  // ═══════════════════════════════════════════════════════════════
//  Helper: Extract formula field names
// ═══════════════════════════════════════════════════════════════

function extractFormulaFields(formula: string): string[] {
  return formula
    .replace(/[+\-*/()]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token))
}

// ═══════════════════════════════════════════════════════════════
//  Helper: Safe formula evaluation
// ═══════════════════════════════════════════════════════════════

function evaluateFormula(formula: string, row: any, datasetId: string): any {
  try {
    const fields = extractFormulaFields(formula)
    let expression = formula
    let hasStringValue = false

    for (const fieldName of fields) {
      const fieldDef = getDatasetField(datasetId, fieldName)
      if (!fieldDef) continue

      const parts = fieldDef.source.split('.')
      let value: any = row
      for (const part of parts) {
        value = value?.[part]
      }

      if (fieldDef.type === 'string' || typeof value === 'string') {
        hasStringValue = true
        const strValue = String(value || '')
        expression = expression.replace(
          new RegExp(`\\b${fieldName}\\b`, 'g'),
          JSON.stringify(strValue)
        )
      } else {
        const numValue =
          value && typeof value.toNumber === 'function'
            ? value.toNumber()
            : Number(value || 0)

        expression = expression.replace(
          new RegExp(`\\b${fieldName}\\b`, 'g'),
          String(numValue || 0)
        )
      }
    }

    if (hasStringValue) {
      if (!/^("[^"]*"|'[^']*'|\+|\s|\(|\))+$/i.test(expression)) {
        return ''
      }
    } else {
      if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
        return 0
      }
    }

    const result = Function(`"use strict"; return (${expression})`)()

    if (hasStringValue) {
      return typeof result === 'string' ? result : ''
    }

    return typeof result === 'number' && isFinite(result) ? result : 0
  } catch {
    return 0
  }
}

// ═══════════════════════════════════════════════════════════════
//  Helper: Convert model name to Prisma client property
// ═══════════════════════════════════════════════════════════════

function getPrismaModelKey(modelName: string): string {
  if (!modelName) return ''
  return modelName.charAt(0).toLowerCase() + modelName.slice(1)
}

// ═══════════════════════════════════════════════════════════════
//  Helper: Add field to select object
// ═══════════════════════════════════════════════════════════════

function addFieldToSelect(
  selectObj: any,
  field: any,
  datasetId: string
): void {
  if (field.isFormula && field.formula) {
    const formulaFields = extractFormulaFields(field.formula)
    for (const ff of formulaFields) {
      const formulaFieldDef = getDatasetField(datasetId, ff)
      if (formulaFieldDef) {
        addFieldToSelect(selectObj, formulaFieldDef, datasetId)
      }
    }
    return
  }

  const parts = field.source.split('.')

  if (parts.length === 1) {
    selectObj[parts[0]] = true
  } else {
    let current = selectObj
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = { select: {} }
      }
      current = current[parts[i]].select
    }
    current[parts[parts.length - 1]] = true
  }
}

// ═══════════════════════════════════════════════════════════════
//  Helper: Build where clause from filters
// ═══════════════════════════════════════════════════════════════

function buildWhereClause(
  filters: any[],
  datasetId: string,
  dataset?: Dataset | null
): any {
  if (!filters || filters.length === 0) return {}

  const conditions: any[] = []

  const notNullFields = [
    'id',
    'number',
    'status',
    'paymentType',
    'invoiceType',
    'subTotal',
    'discountAmount',
    'taxAmount',
    'totalAmount',
    'paidAmount',
    'remainingAmount',
    'cogsAmount',
    'tenantId',
    'invoiceDate',
    'createdAt',
    'updatedAt',
    'code',
    'firstName',
    'lastName',
    'name',
    'isActive',
    'currentStock',
    'minStock',
    'purchasePrice',
    'salePrice',
    'quantity',
    'unitPrice',
    'lineTotal',
    'amount',
    'paidAt',
    'issueDate',
    'dueDate',
  ]

  for (const filter of filters) {
    const { field, operator, value } = filter

    const fieldDef = getDatasetField(datasetId, field)
    if (!fieldDef) continue

    const source = fieldDef.source
    const isRelation = source.includes('.')
    const parts = source.split('.')

    const isEmpty =
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) &&
        value.every((v) => v === null || v === undefined || v === ''))

    const needsValue = !['isNull', 'isNotNull'].includes(operator)
    if (needsValue && isEmpty) continue

    const convertValue = (v: any, position?: 'from' | 'to'): any => {
      if (v === null || v === undefined || v === '') return null

      if (fieldDef.type === 'number' || fieldDef.type === 'currency') {
        const n = Number(v)
        return isNaN(n) ? null : n
      }

      if (fieldDef.type === 'date' || fieldDef.type === 'datetime') {
        if (v instanceof Date) {
          const d = new Date(v.getTime())

          if (fieldDef.type === 'date') {
            const endOfDay =
              operator === 'lessThanOrEq' ||
              (operator === 'between' && position === 'to')

            if (endOfDay) d.setHours(23, 59, 59, 999)
            else d.setHours(0, 0, 0, 0)
          }

          return d
        }

        const endOfDay =
          operator === 'lessThanOrEq' ||
          (operator === 'between' && position === 'to')

        return parseDateBound(v, fieldDef.type === 'date' ? endOfDay : false)
      }

      if (fieldDef.type === 'boolean') {
        return v === true || v === 'true' || v === '1'
      }

      return String(v)
    }

    let prismaCondition: any

    switch (operator as FilterOperator) {
      case 'equals': {
        const v = convertValue(value)
        if (v === null) continue

        if (fieldDef.type === 'date' && v instanceof Date) {
          const from = new Date(v.getTime())
          const to = new Date(v.getTime())

          from.setHours(0, 0, 0, 0)
          to.setHours(23, 59, 59, 999)

          prismaCondition = { gte: from, lte: to }
        } else {
          prismaCondition = { equals: v }
        }

        break
      }

      case 'notEquals': {
        const v = convertValue(value)
        if (v === null) continue
        prismaCondition = { not: v }
        break
      }

      case 'contains': {
        prismaCondition = { contains: String(value), mode: 'insensitive' }
        break
      }

      case 'startsWith': {
        prismaCondition = { startsWith: String(value), mode: 'insensitive' }
        break
      }

      case 'endsWith': {
        prismaCondition = { endsWith: String(value), mode: 'insensitive' }
        break
      }

      case 'greaterThan': {
        const v = convertValue(value, 'from')
        if (v === null) continue
        prismaCondition = { gt: v }
        break
      }

      case 'greaterThanOrEq': {
        const v = convertValue(value, 'from')
        if (v === null) continue
        prismaCondition = { gte: v }
        break
      }

      case 'lessThan': {
        const v = convertValue(value, 'to')
        if (v === null) continue
        prismaCondition = { lt: v }
        break
      }

      case 'lessThanOrEq': {
        const v = convertValue(value, 'to')
        if (v === null) continue
        prismaCondition = { lte: v }
        break
      }

      case 'between': {
        if (!Array.isArray(value) || value.length !== 2) continue

        const from = convertValue(value[0], 'from')
        const to = convertValue(value[1], 'to')

        if (from === null && to === null) continue

        if (from !== null && to !== null) {
          prismaCondition = { gte: from, lte: to }
        } else if (from !== null) {
          prismaCondition = { gte: from }
        } else if (to !== null) {
          prismaCondition = { lte: to }
        } else {
          continue
        }

        break
      }

      case 'in': {
        if (!Array.isArray(value)) continue

        const arr = value
          .map((v) => convertValue(v))
          .filter((v) => v !== null)

        if (arr.length === 0) continue
        prismaCondition = { in: arr }
        break
      }

      case 'notIn': {
        if (!Array.isArray(value)) continue

        const arr = value
          .map((v) => convertValue(v))
          .filter((v) => v !== null)

        if (arr.length === 0) continue
        prismaCondition = { notIn: arr }
        break
      }

     case 'isNull': {
  const fieldName = parts[parts.length - 1]
  const nullable = (fieldDef as any).nullable

  if (nullable === false) continue
  if (nullable === undefined && notNullFields.includes(fieldName)) continue

  prismaCondition = { equals: null }
  break
}

case 'isNotNull': {
  const fieldName = parts[parts.length - 1]
  const nullable = (fieldDef as any).nullable

  if (nullable === false) continue
  if (nullable === undefined && notNullFields.includes(fieldName)) continue

  prismaCondition = { not: null }
  break
}

      default:
        continue
    }

    if (prismaCondition === undefined) continue

    let conditionObj: any

    if (isRelation) {
      const collection = isCollectionPath(parts, dataset)

      let current: any = {}
      let pointer = current

      if (collection) {
        pointer[parts[0]] = { some: {} }
        pointer = pointer[parts[0]].some

        for (let i = 1; i < parts.length - 1; i++) {
          pointer[parts[i]] = {}
          pointer = pointer[parts[i]]
        }
      } else {
        for (let i = 0; i < parts.length - 1; i++) {
          pointer[parts[i]] = {}
          pointer = pointer[parts[i]]
        }
      }

      pointer[parts[parts.length - 1]] = prismaCondition
      conditionObj = current
    } else {
      conditionObj = { [source]: prismaCondition }
    }

    conditions.push(conditionObj)
  }

  return conditions.length > 0 ? { AND: conditions } : {}
}
// ═══════════════════════════════════════════════════════════════
//  POST Handler
// ═══════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const tenantId = await extractTenantId(req)
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'tenantId یافت نشد' },
        { status: 401 }
      )
    }
const payload = await req.json().catch(() => ({}))

const definition: ReportDefinition = payload.definition || payload

const runtimeIntent = resolveRuntimeFiscalIntent(payload, definition)

const requestedFiscalYearId = runtimeIntent.fiscalYearId
const allYearsRequested = runtimeIntent.allYears
const fiscalPolicyMode = runtimeIntent.mode
const fiscalPolicyControlled = runtimeIntent.policyControlled

    // Debug log
    console.log('[Preview API] Received definition:', JSON.stringify({
      datasetId: definition.datasetId,
      columns: definition.columns?.map(c => ({ field: c.field, aggregate: c.aggregate })),
      groupBy: definition.groupBy,
      filters: definition.filters?.length || 0,
      orderBy: definition.orderBy,
    }, null, 2))

    if (!definition.datasetId) {
      return NextResponse.json(
        { success: false, error: 'datasetId الزامی است' },
        { status: 400 }
      )
    }

    const dataset = getDataset(definition.datasetId)
    if (!dataset) {
      return NextResponse.json(
        { success: false, error: 'دیتاست یافت نشد' },
        { status: 404 }
      )
    }

    if (!definition.columns || definition.columns.length === 0) {
      return NextResponse.json(
        { success: false, error: 'حداقل یک ستون الزامی است' },
        { status: 400 }
      )
    }
const tenant = await getTenantInfo(tenantId)

if (!tenant) {
  return NextResponse.json(
    {
      success: false,
      error: 'فروشگاه یافت نشد.',
    },
    { status: 404 }
  )
}

const planName = resolveTenantPlanName(tenant)
const features = getFeaturesByPlanName(planName)

if (!(features as any).canUseCustomReportDesigner) {
  return NextResponse.json(
    {
      success: false,
      error:
        'طراحی گزارش دلخواه در پلن فعلی شما در دسترس نیست. لطفاً پلن خود را ارتقا دهید.',
    },
    { status: 403 }
  )
}

const previewErrors = validatePreviewDefinition(definition, dataset)

if (previewErrors.length > 0) {
  return NextResponse.json(
    {
      success: false,
      error: 'تعریف گزارش برای preview نامعتبر است.',
      validationErrors: previewErrors,
    },
    { status: 400 }
  )
}
const prismaClient = db.client as any
const fiscalCfg = dataset.fiscalYear

let fy: any = null
let effectiveFiscalYearId: string | null = null
let scopeAllYears = allYearsRequested

if (fiscalCfg?.strategy === 'none') {
  if (
    fiscalPolicyControlled &&
    (fiscalPolicyMode === 'active' || fiscalPolicyMode === 'selected')
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'این دیتاست سال‌محور نیست و نمی‌توان برای آن سیاست سال مالی active/selected تعریف کرد.',
        code: 'DATASET_NOT_FISCAL_YEAR_SCOPED',
      },
      { status: 400 }
    )
  }

  scopeAllYears = true
} else {
  if (
    fiscalPolicyControlled &&
    fiscalPolicyMode === 'selected' &&
    !requestedFiscalYearId
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'سیاست سال مالی این گزارش selected است، اما fiscalYearId مشخص نشده است.',
        code: 'INVALID_FISCAL_YEAR_POLICY',
      },
      { status: 400 }
    )
  }

  if (!scopeAllYears) {
    try {
      fy = await resolveReportFiscalYear(
        prismaClient,
        tenantId,
        requestedFiscalYearId
      )

      effectiveFiscalYearId = fy.id
    } catch (err: any) {
      return NextResponse.json(
        {
          success: false,
          error:
            err?.message ||
            (requestedFiscalYearId
              ? 'سال مالی انتخابی یافت نشد.'
              : 'سال مالی فعالی برای این فروشگاه تعریف نشده است.'),
          code: requestedFiscalYearId
            ? 'INVALID_FISCAL_YEAR'
            : 'NO_ACTIVE_FISCAL_YEAR',
        },
        { status: 400 }
      )
    }
  }
}

    // Build where clause
const filterConditions = buildWhereClause(
  definition.filters || [],
  definition.datasetId,
  dataset
)
    const where: any = { ...filterConditions }

    const tenantFilterPath = dataset.tenantFilterPath || 'tenantId'
    const tenantPathParts = tenantFilterPath.split('.')

    if (tenantPathParts.length === 1) {
      where[tenantPathParts[0]] = tenantId
    } else {
      let current = where
      for (let i = 0; i < tenantPathParts.length - 1; i++) {
        if (!current[tenantPathParts[i]]) {
          current[tenantPathParts[i]] = {}
        }
        current = current[tenantPathParts[i]]
      }
      current[tenantPathParts[tenantPathParts.length - 1]] = tenantId
    }

    if (dataset.defaultFilter) {
   const defaultWhere = buildWhereClause(
  [dataset.defaultFilter],
  definition.datasetId,
  dataset
)
      Object.assign(where, defaultWhere)
    }

    const fiscalFilter = buildFiscalYearFilter(
  dataset,
  fy,
  effectiveFiscalYearId,
  scopeAllYears
)

if (fiscalFilter?.mode === 'nested') {
  setNestedWhere(where, fiscalFilter.path, fiscalFilter.value)
} else if (fiscalFilter?.mode === 'and') {
  addAndCondition(where, fiscalFilter.condition)
}
    const limit = Math.min(
      definition.limit || DEFAULT_PREVIEW_ROWS,
      MAX_PREVIEW_ROWS
    )

    const hasAggregates = definition.columns.some((col) => !!col.aggregate)
    const hasGroupBy =
      !!definition.groupBy && definition.groupBy.length > 0

    let rows: ReportResultRow[] = []
    let totalRows = 0

    const getValue = (obj: any, path: string): any => {
      return path.split('.').reduce((acc, part) => acc?.[part], obj)
    }

    const toNum = (v: any): number => {
      if (v === null || v === undefined) return 0
      if (typeof v === 'number') return isNaN(v) ? 0 : v
      if (v && typeof v.toNumber === 'function') {
        const n = v.toNumber()
        return isNaN(n) ? 0 : n
      }
      const n = Number(v)
      return isNaN(n) ? 0 : n
    }

    const startTime = Date.now()

    // ★ استفاده از db.client به جای prisma

    const modelKey = getPrismaModelKey(dataset.model)

    if (hasAggregates) {
      // ═══════════════════════════════════════════════════════
      //  JS-side aggregation
      // ═══════════════════════════════════════════════════════

      const scanLimit = hasGroupBy
        ? Math.min(MAX_SCAN_ROWS, Math.max(limit * 100, 5000))
        : MAX_SCAN_ROWS

      const neededFieldIds = new Set<string>()

      definition.columns.forEach((col) => {
        neededFieldIds.add(col.field)
      })

      if (hasGroupBy) {
        definition.groupBy!.forEach((gb) => {
          neededFieldIds.add(gb.field)
        })
      }

      const scanSelect: any = {}

      for (const fieldId of Array.from(neededFieldIds)) {
        const field = getDatasetField(definition.datasetId, fieldId)
        if (!field) continue
        addFieldToSelect(scanSelect, field, definition.datasetId)
      }

      const scanOrderBy: any[] = []

      if (definition.orderBy && definition.orderBy.length > 0) {
        for (const ob of definition.orderBy) {
          const field = getDatasetField(definition.datasetId, ob.field)
          if (field && !field.source.includes('.') && !ob.aggregate) {
            scanOrderBy.push({ [field.source]: ob.direction })
            break
          }
        }
      }

      if (scanOrderBy.length === 0) {
        const dateField = Array.from(neededFieldIds)
          .map((id) => getDatasetField(definition.datasetId, id))
          .find(
            (f) =>
              f &&
              (f.type === 'date' || f.type === 'datetime') &&
              !f.source.includes('.')
          )

        if (dateField) {
          scanOrderBy.push({ [dateField.source]: 'desc' })
        }
      }

  const rawRows = await safeFindMany(prismaClient, modelKey, {
        where,
        select: scanSelect,
        take: scanLimit,
        ...(scanOrderBy.length > 0 ? { orderBy: scanOrderBy } : {}),
      })

      const groupMap = new Map<string, any>()
      const SINGLE_GROUP_KEY = '__single_group__'

      for (const raw of rawRows) {
        let key = SINGLE_GROUP_KEY

        if (hasGroupBy) {
          const groupValues = definition.groupBy!.map((gb) => {
            const field = getDatasetField(definition.datasetId, gb.field)
            if (!field) return null
            return getValue(raw, field.source)
          })

          key = JSON.stringify(
            groupValues.map((v) => {
              if (v instanceof Date) return v.toISOString()
              if (
                v &&
                typeof v.toString === 'function' &&
                typeof v.toNumber === 'function'
              ) {
                return v.toString()
              }
              return v
            })
          )
        }

        let group = groupMap.get(key)

        if (!group) {
          group = {
            __count: 0,
            __agg: {} as Record<string, any>,
            __first: {} as Record<string, any>,
          }

          if (hasGroupBy) {
            for (const gb of definition.groupBy!) {
              const field = getDatasetField(definition.datasetId, gb.field)
              if (!field) continue
              group[gb.field] = getValue(raw, field.source)
            }
          }

          groupMap.set(key, group)
        }

        group.__count += 1

     for (const col of definition.columns) {
  const field = getDatasetField(definition.datasetId, col.field)
  if (!field) continue

  const value =
    field.isFormula && field.formula
      ? evaluateFormula(field.formula, raw, definition.datasetId)
      : getValue(raw, field.source)

  if (!col.aggregate) {
    if (group.__first[col.field] === undefined) {
      group.__first[col.field] = value
    }
    continue
  }

  const aggKey = `${col.field}_${col.aggregate}`

  if (!group.__agg[aggKey]) {
    group.__agg[aggKey] = {
      sum: 0,
      count: 0,
      numericCount: 0,
      min: null as number | null,
      max: null as number | null,
      distinct: new Set<string>(),
    }
  }

  const acc = group.__agg[aggKey]

  if (value !== null && value !== undefined && value !== '') {
    acc.count += 1

    const num = toNumericOrNull(value)

    if (num !== null) {
      acc.numericCount += 1

      if (col.aggregate === 'sum' || col.aggregate === 'avg') {
        acc.sum += num
      }

      if (acc.min === null || num < acc.min) {
        acc.min = num
      }

      if (acc.max === null || num > acc.max) {
        acc.max = num
      }
    }

    if (col.aggregate === 'countDistinct') {
      acc.distinct.add(String(value))
    }
  }
}
      }

      rows = Array.from(groupMap.values()).map((group) => {
        const out: ReportResultRow = {}

        if (hasGroupBy) {
          for (const gb of definition.groupBy!) {
            out[gb.field] = group[gb.field] ?? null
          }
        }

        for (const col of definition.columns) {
          if (!col.aggregate) {
            if (out[col.field] === undefined) {
              out[col.field] = group.__first[col.field] ?? null
            }
            continue
          }

          const aggKey = `${col.field}_${col.aggregate}`
          const acc = group.__agg[aggKey]

          if (!acc) {
            out[aggKey] = 0
            continue
          }

          switch (col.aggregate) {
            case 'sum':
              out[aggKey] = acc.sum
              break
        case 'avg':
  out[aggKey] = acc.numericCount ? acc.sum / acc.numericCount : 0
  break
            case 'count':
              out[aggKey] = acc.count
              break
            case 'countDistinct':
              out[aggKey] = acc.distinct.size
              break
          case 'min':
  out[aggKey] = acc.min ?? 0
  break
case 'max':
  out[aggKey] = acc.max ?? 0
  break
            default:
              out[aggKey] = 0
          }
        }

        return out
      })

      if (!hasGroupBy && rows.length === 0) {
        const emptyRow: ReportResultRow = {}

        for (const col of definition.columns) {
          if (col.aggregate) {
            emptyRow[`${col.field}_${col.aggregate}`] = 0
          } else {
            emptyRow[col.field] = null
          }
        }

        rows = [emptyRow]
      }

      if (definition.orderBy && definition.orderBy.length > 0) {
        const possibleAggregates: AggregateOperator[] = [
          'sum', 'avg', 'count', 'countDistinct', 'min', 'max',
        ]

        const normalizeSortValue = (v: any): any => {
          if (v instanceof Date) return v.getTime()
          if (v && typeof v.toNumber === 'function') return v.toNumber()
          return v
        }

        const getSortValue = (
          row: ReportResultRow,
          field: string,
          aggregate?: AggregateOperator
        ): any => {
          if (aggregate) {
            return normalizeSortValue(row[`${field}_${aggregate}`])
          }

          if (row[field] !== undefined) {
            return normalizeSortValue(row[field])
          }

          for (const op of possibleAggregates) {
            const key = `${field}_${op}`
            if (row[key] !== undefined) {
              return normalizeSortValue(row[key])
            }
          }

          return normalizeSortValue(row[field])
        }

        rows.sort((a, b) => {
          for (const ob of definition.orderBy!) {
            const av = getSortValue(a, ob.field, ob.aggregate)
            const bv = getSortValue(b, ob.field, ob.aggregate)

            if (av === bv) continue

            if (av === null || av === undefined) return 1
            if (bv === null || bv === undefined) return -1

            if (typeof av === 'number' && typeof bv === 'number') {
              return ob.direction === 'desc' ? bv - av : av - bv
            }

            const as = String(av)
            const bs = String(bv)

            return ob.direction === 'desc'
              ? bs.localeCompare(as, 'fa')
              : as.localeCompare(bs, 'fa')
          }

          return 0
        })
      }

      totalRows = rows.length

      if (hasGroupBy) {
        rows = rows.slice(0, limit)
      }
    } else {
      // ═══════════════════════════════════════════════════════
      //  Simple select without aggregates
      // ═══════════════════════════════════════════════════════

      const simpleSelect: any = {}

      for (const col of definition.columns) {
        const field = getDatasetField(definition.datasetId, col.field)
        if (!field) continue
        addFieldToSelect(simpleSelect, field, definition.datasetId)
      }

      const orderByArr: any[] = []

      if (definition.orderBy) {
        for (const ob of definition.orderBy) {
          const field = getDatasetField(definition.datasetId, ob.field)
          if (!field) continue

          const parts = field.source.split('.')

          if (parts.length === 1) {
            orderByArr.push({ [parts[0]]: ob.direction })
          } else {
            const orderByObj: any = {}
            let current = orderByObj
            for (let i = 0; i < parts.length - 1; i++) {
              current[parts[i]] = {}
              current = current[parts[i]]
            }
            current[parts[parts.length - 1]] = ob.direction
            orderByArr.push(orderByObj)
          }
        }
      }

      const simpleQuery: any = {
        where,
        select: simpleSelect,
        take: limit,
      }

      if (orderByArr.length > 0) {
        simpleQuery.orderBy = orderByArr
      }

   const simpleResult = await safeFindMany(prismaClient, modelKey, simpleQuery)

totalRows = await safeCount(prismaClient, modelKey, { where })

      rows = simpleResult.map((row: any) => {
        const flatRow: ReportResultRow = {}

        for (const col of definition.columns) {
          const field = getDatasetField(definition.datasetId, col.field)
          if (!field) continue

          if (field.isFormula && field.formula) {
            flatRow[col.field] = evaluateFormula(
              field.formula,
              row,
              definition.datasetId
            )
            continue
          }

          const parts = field.source.split('.')
          let value = row

          for (const part of parts) {
            value = value?.[part]
          }

          flatRow[col.field] = value
        }

        return flatRow
      })
    }

    const executionTimeMs = Date.now() - startTime

    const responseColumns: ReportResultColumn[] = []

    for (const col of definition.columns) {
      const field = getDatasetField(definition.datasetId, col.field)
      if (!field) continue

      if (col.aggregate) {
        responseColumns.push({
          id: `${col.field}_${col.aggregate}`,
          label: col.label || field.label,
          type: field.type,
          isAggregate: true,
          aggregate: col.aggregate,
        })
      } else {
        responseColumns.push({
          id: col.field,
          label: col.label || field.label,
          type: field.type,
          isAggregate: false,
        })
      }
    }

    const meta: ReportResultMeta = {
      returnedRows: rows.length,
      totalRows,
      executionTimeMs,
      isTruncated: rows.length >= limit,
    }

const warning =
  scopeAllYears && fiscalCfg?.strategy !== 'none'
    ? ALL_YEARS_WARNING
    : undefined

return NextResponse.json({
  success: true,
  fiscalYearId: effectiveFiscalYearId,
  fiscalYearName: fy?.name || null,
  allYears: scopeAllYears,
  warning,
  data: {
    columns: responseColumns,
    rows,
    meta,
    fiscalYearRange: fy
      ? {
          from: fy.startDate,
          to: fy.endDate,
        }
      : null,
diagnostics: {
  fiscalYearStrategy: fiscalCfg?.strategy || 'none',
  fiscalYearApplied: Boolean(effectiveFiscalYearId && !scopeAllYears),
  requestedFiscalYearId,
  allYearsRequested,
  scopeAllYears,
  fiscalPolicyMode,
  fiscalPolicyControlled,
},
  },
})
  } catch (error: any) {
    console.error('[Report Preview API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'خطای داخلی سرور',
      },
      { status: 500 }
    )
  }
}