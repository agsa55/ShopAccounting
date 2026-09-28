// ============================================================================
// src/app/api/reports/designer/preview/route.ts — v12.9 ★★★
// ShopAccounting — Report Preview API (Railway Compatible)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { extractTenantId } from '@/lib/reports/report-auth'
import { getDataset, getDatasetField } from '@/lib/reports/report-datasets'
import type {
  ReportDefinition,
  ReportResultRow,
  ReportResultColumn,
  ReportResultMeta,
  AggregateOperator,
  FilterOperator,
} from '@/lib/reports/report-types'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ═══════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════

const MAX_PREVIEW_ROWS = 5000
const DEFAULT_PREVIEW_ROWS = 100
const MAX_SCAN_ROWS = 50000

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

function buildWhereClause(filters: any[], datasetId: string): any {
  if (!filters || filters.length === 0) return {}

  const conditions: any[] = []

  const notNullFields = [
    'id', 'number', 'status', 'paymentType', 'invoiceType',
    'subTotal', 'discountAmount', 'taxAmount', 'totalAmount',
    'paidAmount', 'remainingAmount', 'cogsAmount', 'tenantId',
    'invoiceDate', 'createdAt', 'updatedAt',
    'code', 'firstName', 'lastName', 'name',
    'isActive', 'currentStock', 'minStock',
    'purchasePrice', 'salePrice', 'quantity', 'unitPrice', 'lineTotal',
    'amount', 'paidAt', 'issueDate', 'dueDate',
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

    const convertValue = (v: any): any => {
      if (v === null || v === undefined || v === '') return null
      if (fieldDef.type === 'number' || fieldDef.type === 'currency') {
        const n = Number(v)
        return isNaN(n) ? null : n
      }
      if (fieldDef.type === 'date' || fieldDef.type === 'datetime') {
        if (v instanceof Date) return v
        const d = new Date(v)
        return isNaN(d.getTime()) ? null : d
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
        prismaCondition = { equals: v }
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
        const v = convertValue(value)
        if (v === null) continue
        prismaCondition = { gt: v }
        break
      }
      case 'greaterThanOrEq': {
        const v = convertValue(value)
        if (v === null) continue
        prismaCondition = { gte: v }
        break
      }
      case 'lessThan': {
        const v = convertValue(value)
        if (v === null) continue
        prismaCondition = { lt: v }
        break
      }
      case 'lessThanOrEq': {
        const v = convertValue(value)
        if (v === null) continue
        prismaCondition = { lte: v }
        break
      }
      case 'between': {
        if (!Array.isArray(value) || value.length !== 2) continue
        const from = convertValue(value[0])
        const to = convertValue(value[1])
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
        const arr = value.map(convertValue).filter((v) => v !== null)
        if (arr.length === 0) continue
        prismaCondition = { in: arr }
        break
      }
      case 'notIn': {
        if (!Array.isArray(value)) continue
        const arr = value.map(convertValue).filter((v) => v !== null)
        if (arr.length === 0) continue
        prismaCondition = { notIn: arr }
        break
      }
      case 'isNull': {
        const fieldName = source.split('.')[0]
        if (notNullFields.includes(fieldName)) continue
        prismaCondition = { equals: null }
        break
      }
      case 'isNotNull': {
        const fieldName = source.split('.')[0]
        if (notNullFields.includes(fieldName)) continue
        prismaCondition = { not: null }
        break
      }
      default:
        continue
    }

    if (prismaCondition === undefined) continue

    let conditionObj: any

    if (isRelation) {
      let current: any = {}
      let pointer = current
      for (let i = 0; i < parts.length - 1; i++) {
        pointer[parts[i]] = {}
        pointer = pointer[parts[i]]
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

    const definition: ReportDefinition = await req.json()

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

    // Build where clause
    const filterConditions = buildWhereClause(
      definition.filters || [],
      definition.datasetId
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
        definition.datasetId
      )
      Object.assign(where, defaultWhere)
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
    const prismaClient = db.client as any
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

      const rawRows = await prismaClient[modelKey].findMany({
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
              min: null as number | null,
              max: null as number | null,
              distinct: new Set<string>(),
            }
          }

          const acc = group.__agg[aggKey]

          if (value !== null && value !== undefined) {
            acc.count += 1

            const num = toNum(value)
            const isNonNumeric = typeof value === 'string' && isNaN(Number(value)) && value.trim() !== ''

            if (col.aggregate === 'sum' || col.aggregate === 'avg') {
              if (isNonNumeric) {
                acc.sum += 1
              } else {
                acc.sum += num
              }
            }

            if (col.aggregate === 'countDistinct') {
              acc.distinct.add(String(value))
            }

            if (acc.min === null || num < acc.min) {
              acc.min = num
            }

            if (acc.max === null || num > acc.max) {
              acc.max = num
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
              out[aggKey] = acc.count ? acc.sum / acc.count : 0
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

      const simpleResult = await prismaClient[modelKey].findMany(simpleQuery)

      totalRows = await prismaClient[modelKey].count({ where })

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

    return NextResponse.json({
      success: true,
      data: {
        columns: responseColumns,
        rows,
        meta,
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