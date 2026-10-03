// ============================================================================
// src/lib/reports/report-types.ts — v12.0 ★★★
// ShopAccounting — Custom Report Designer Type Definitions
// ----------------------------------------------------------------------------
// این فایل تمام تایپ‌های مورد نیاز برای سیستم گزارش دلخواه را تعریف می‌کند.
//
// ★ معماری:
//   - Dataset: منبع داده (مثلاً فاکتور فروش)
//   - Field: فیلد مجاز داخل dataset (مثلاً totalAmount)
//   - Filter: شرط فیلتر (مثلاً totalAmount > 1000000)
//   - Column: ستون خروجی گزارش
//   - Aggregate: عملیات تجمعی (sum, avg, count, min, max)
//
// ★ امنیت:
//   - کاربر فقط می‌تواند از field های تعریف‌شده استفاده کند
//   - کاربر نمی‌تواند SQL مستقیم بنویسد
//   - همه عملیات در بک‌اند validate می‌شوند
// ============================================================================

// ═══════════════════════════════════════════════════════════════
//  تایپ‌های پایه
// ═══════════════════════════════════════════════════════════════

/** نوع داده فیلد */
export type FieldType = 
  | 'string'      // متن (نام، کد)
  | 'number'      // عدد ساده (تعداد)
  | 'currency'    // پولی (مبلغ)
  | 'date'        // تاریخ (invoiceDate)
  | 'datetime'    // تاریخ + ساعت (createdAt)
  | 'boolean'     // true/false
  | 'enum'        // مقادیر محدود (status, paymentType)
  | 'relation'    // رابطه به جدول دیگر

/** عملیات تجمعی مجاز */
export type AggregateOperator = 
  | 'sum'           // جمع
  | 'avg'           // میانگین
  | 'count'         // شمارش
  | 'countDistinct' // شمارش یکتا
  | 'min'           // کمینه
  | 'max'           // بیشینه

/** عملگرهای فیلتر مجاز */
export type FilterOperator = 
  | 'equals'           // برابر
  | 'notEquals'        // نابرابر
  | 'contains'         // شامل (برای متن)
  | 'startsWith'       // شروع با
  | 'endsWith'         // پایان با
  | 'greaterThan'      // بزرگتر از
  | 'greaterThanOrEq'  // بزرگتر یا مساوی
  | 'lessThan'         // کوچکتر از
  | 'lessThanOrEq'     // کوچکتر یا مساوی
  | 'between'          // بین (برای تاریخ و عدد)
  | 'in'               // در لیست
  | 'notIn'            // خارج از لیست
  | 'isNull'           // null است
  | 'isNotNull'        // null نیست

/** جهت مرتب‌سازی */
export type SortDirection = 'asc' | 'desc'

/** نوع تجسم خروجی */
export type VisualizationType = 'table' | 'bar' | 'line' | 'pie' | 'pivot'

// ═══════════════════════════════════════════════════════════════
//  تعریف Dataset (منبع داده)
// ═══════════════════════════════════════════════════════════════

/** تعریف یک فیلد در dataset */
export interface DatasetField {
  id: string
  label: string
  type: FieldType
  source: string
  aggregatable?: boolean
  enumValues?: string[]
  enumLabels?: Record<string, string>
  description?: string
  isFormula?: boolean
  formula?: string
  
  // ★ جدید: اگر این فیلد یک رابطه است، مشخص می‌کنیم که برای گروه‌بندی از کدام فیلد اسکالر استفاده شود
  groupByKey?: string 
}

/** تعریف یک dataset */
export interface Dataset {
  /** شناسه یکتا dataset */
  id: string
  
  /** برچسب فارسی برای نمایش در UI */
  label: string
  
  /** توضیح کوتاه */
  description: string
  
  /** نام مدل Prisma (مثلاً "Invoice") */
  model: string
  
  /** آیکون (اختیاری) */
  icon?: string
  
  /** رنگ (اختیاری، برای UI) */
  color?: string
  
  /** لیست فیلدهای مجاز */
  fields: DatasetField[]
  
  /** فیلتر پیش‌فرض (اجباری اعمال می‌شود) */
  defaultFilter?: {
    field: string
    operator: FilterOperator
    value: any
  }
  
  /** آیا گروه‌بندی مجاز است؟ */
  allowGroupBy?: boolean
  
  /** حداکثر تعداد ردیف در preview (اگر محدودیت خاص دارد) */
  previewLimit?: number
    tenantFilterPath?: string
}

// ═══════════════════════════════════════════════════════════════
//  تعریف Report Definition (ذخیره‌شده در دیتابیس)
// ═══════════════════════════════════════════════════════════════

/** ستون در گزارش */
export interface ReportColumn {
  /** شناسه field از dataset */
  field: string
  
  /** برچسب سفارشی (اختیاری، اگر خالی باشد از field label استفاده می‌شود) */
  label?: string
  
  /** عملیات تجمعی (اختیاری، فقط برای فیلدهای aggregatable) */
  aggregate?: AggregateOperator
  
  /** فرمت نمایش (اختیاری) */
  format?: 'number' | 'currency' | 'percent' | 'date'
}

/** فیلتر در گزارش */
export interface ReportFilter {
  /** شناسه field از dataset */
  field: string
  
  /** عملگر */
  operator: FilterOperator
  
  /** مقدار (برای between: آرایه ۲ تایی) */
  value: any
}

/** گروه‌بندی */
export interface ReportGroupBy {
  /** شناسه field از dataset */
  field: string
}

/** مرتب‌سازی */
export interface ReportOrderBy {
  /** شناسه field از dataset */
  field: string
  
  /** جهت */
  direction: SortDirection
  
  /** اگر aggregate دارد، باید همان aggregate را هم ذکر کند */
  aggregate?: AggregateOperator
}

/** تعریف کامل گزارش (این چیزی است که در دیتابیس ذخیره می‌شود) */
export interface ReportDefinition {
  /** شناسه dataset */
  datasetId: string
  
  /** ستون‌های گزارش */
  columns: ReportColumn[]
  
  /** فیلترها */
  filters?: ReportFilter[]
  
  /** گروه‌بندی */
  groupBy?: ReportGroupBy[]
  
  /** مرتب‌سازی */
  orderBy?: ReportOrderBy[]
  
  /** حداکثر تعداد ردیف */
  limit?: number
  
  /** نوع تجسم */
  visualization?: {
    type: VisualizationType
    config?: Record<string, any>
  }
}

// ═══════════════════════════════════════════════════════════════
//  پاسخ API
// ═══════════════════════════════════════════════════════════════

/** ستون در نتیجه API */
export interface ReportResultColumn {
  /** شناسه یکتا */
  id: string
  
  /** برچسب نمایشی */
  label: string
  
  /** نوع داده */
  type: FieldType
  
  /** آیا aggregate است؟ */
  isAggregate: boolean
  
  /** عملیات تجمعی (اگر aggregate است) */
  aggregate?: AggregateOperator
}

/** یک ردیف از نتیجه */
export type ReportResultRow = Record<string, any>

/** متادیتای نتیجه */
export interface ReportResultMeta {
  /** تعداد کل ردیف‌های موجود در دیتابیس (قبل از limit) */
  totalRows: number
  
  /** تعداد ردیف‌های برگشت‌داده‌شده */
  returnedRows: number
  
  /** آیا به limit رسیده؟ */
  isTruncated: boolean
  
  /** زمان اجرای کوئری (میلی‌ثانیه) */
  executionTimeMs?: number
}

/** پاسخ کامل API preview */
export interface ReportPreviewResponse {
  success: boolean
  data?: {
    columns: ReportResultColumn[]
    rows: ReportResultRow[]
    meta: ReportResultMeta
  }
  error?: string
  validationErrors?: string[]
}

// ═══════════════════════════════════════════════════════════════
//  تایپ‌های کمکی
// ═══════════════════════════════════════════════════════════════

/** خلاصه یک dataset برای لیست */
export interface DatasetSummary {
  id: string
  label: string
  description: string
  icon?: string
  color?: string
  fieldsCount: number
  aggregatableFieldsCount: number
  allowGroupBy: boolean
}

/** خلاصه یک گزارش ذخیره‌شده */
/** خلاصه یک گزارش ذخیره‌شده */
export interface SavedReportSummary {
  id: string
  name: string
  description?: string | null
  datasetId: string
  datasetLabel: string
  datasetIcon?: string
  datasetColor?: string
  isFavorite: boolean
  createdAt: string
  updatedAt: string
}