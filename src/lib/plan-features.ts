// src/lib/plan-features.ts — Centralized Plan-Based Feature Gating (v9.0)
// ============================================================================
// ★★★ v9.0: تغییر ساختار پلن‌ها
//   - حذف پلن ماهانه
//   - فقط دو دوره: annual (سالانه — ۳۶۵ روز) + lifetime (مادام‌العمر)
//   - تغییر نام فارسی پلن‌ها:
//       simple       → "پایه"      (قبلاً "ساده")
//       professional → "پیشرفته"   (قبلاً "حرفه‌ای")
//       enterprise   → "حرفه‌ای"   (قبلاً "سازمانی")
//   - نام کد (PlanName / PlanTier) ثابت می‌ماند تا با کد موجود سازگار باشد.
//   - قوانین ارتقا:
//       پایه (سالانه/مادام‌العمر) → پیشرفته (سالانه/مادام‌العمر) یا حرفه‌ای (سالانه/مادام‌العمر)
//       پیشرفته → فقط حرفه‌ای (نمی‌تواند به پایه برگردد)
//       حرفه‌ای → هیچ تنزل‌ای ندارد
//       همه پلن‌های سالانه می‌توانند به پلن مادام‌العمر همان سطح ارتقا پیدا کنند
//   - قیمت‌ها (تومان):
//       پایه      سالانه: ۱,۵۹۰,۰۰۰   مادام‌العمر: ۱۶,۰۰۰,۰۰۰
//       پیشرفته   سالانه: ۲,۷۶۰,۰۰۰   مادام‌العمر: ۲۸,۰۰۰,۰۰۰
//       حرفه‌ای   سالانه: ۳,۵۵۰,۰۰۰   مادام‌العمر: ۳۶,۰۰۰,۰۰۰
//
// ★★★ v9.1: تغییرات جدید
//   - پلن پایه: افزودن نسیه و اقساط (فقط پرداخت حضوری، بدون درگاه)
//   - پلن پیشرفته: غیرفعال کردن درگاه پرداخت و اعلان SMS
//   - پلن پیشرفته: فعال کردن کارتخوان (POS integration)
// ============================================================================

export type PlanTier = 'basic' | 'professional' | 'enterprise'
export type PlanName = 'simple' | 'professional' | 'enterprise'

// ★★★ v9.0: حذف monthly، اضافه شدن lifetime
export type BillingCycle = 'annual' | 'lifetime'

export interface ResolvedPlan {
  planName: PlanName
  tier: PlanTier
  label: string
  labelEn: string
  isPaid: boolean
  isIsolated: boolean
  features: PlanFeatureSet
}

export interface PlanFeatureSet {
  tier: PlanTier
  label: string
  labelEn: string

  posPaymentTypes: ('cash' | 'card' | 'credit' | 'installment' | 'check')[]
  canEditTax: boolean
  canDeleteInvoice: boolean
  canPrintInvoice: boolean

  canViewSimpleReport: boolean
  canViewJournals: boolean
  canViewAccounts: boolean
  canCreateJournal: boolean
  canCreateAccount: boolean
  canTrialBalance: boolean
  canGeneralLedger: boolean
  canJournalBook: boolean

  canAccessInstallments: boolean
  canAccessCredit: boolean

  canMultiBranch: boolean
  canConsolidatedReports: boolean
  canCloseFiscalYear: boolean
  canFiscalYearManagement: boolean
  canMoidianIntegration: boolean
  canMultiCashRegister: boolean
  canOnlinePayment: boolean
  
  // ★★★ v9.1: قابلیت جدید برای کنترل تب اعلان SMS (جدا از اقساط)
  canAccessSmsNotifications: boolean

  // ★★★ v6.1: قابلیت‌های جدید انبارداری و خرید
  canPurchaseInvoice: boolean       // فاکتور خرید + تامین‌کنندگان
  canMultiWarehouse: boolean        // چند انبار
  canStockTransfer: boolean         // انتقال بین انبارها
  canStockCount: boolean            // ★★★ v6.5: انبار گردانی
  maxWarehouses: number             // ۱=پایه، ۲=پیشرفته، ۰=نامحدود (حرفه‌ای)

  upgradeMessage: string
}

const PLAN_FEATURES: Record<PlanTier, PlanFeatureSet> = {
  basic: {
     tier: 'basic', label: 'پایه', labelEn: 'Basic',
  // ★★★ v9.2: پلن پایه می‌تواند با چک خرید و فروش کند
  posPaymentTypes: ['cash', 'credit', 'installment', 'check'],
    canEditTax: false, canDeleteInvoice: false, canPrintInvoice: true,
    canViewSimpleReport: true, canViewJournals: true,
    canViewAccounts: false, canCreateJournal: false, canCreateAccount: false,
    canTrialBalance: false, canGeneralLedger: false, canJournalBook: false,
    // ★★★ v9.1: پلن پایه نسیه و اقساط دارد (فقط پرداخت حضوری)
    canAccessInstallments: true,
    canAccessCredit: true,
    canMultiBranch: false, canConsolidatedReports: false,
    canCloseFiscalYear: false, canFiscalYearManagement: false,
    canMoidianIntegration: false,
    canMultiCashRegister: false,
    // ★★★ v9.1: پلن پایه درگاه پرداخت الکترونیکی ندارد
    canOnlinePayment: false,
    // ★★★ v9.1: پلن پایه اعلان SMS ندارد
    canAccessSmsNotifications: false,
    // ★★★ v6.1: انبارداری پایه
    canPurchaseInvoice: true,       // ★ پایه هم فاکتور خرید دارد
    canMultiWarehouse: false,       // ★ فقط ۱ انبار
    canStockTransfer: false,        // ★ انتقال ندارد
    canStockCount: false,           // ★★★ v6.5: انبار گردانی ندارد
    maxWarehouses: 1,
    upgradeMessage: 'این قابلیت در پلن پیشرفته یا حرفه‌ای در دسترس است',
  },
  professional: {
    tier: 'professional', label: 'پیشرفته', labelEn: 'Advanced',
    // ★★★ v9.1: پلن پیشرفته همه روش‌های پرداخت را دارد (شامل کارتخوان)
    posPaymentTypes: ['cash', 'card', 'credit', 'installment', 'check'],
    canEditTax: true, canDeleteInvoice: true, canPrintInvoice: true,
    canViewSimpleReport: true, canViewJournals: true,
    canViewAccounts: true, canCreateJournal: true, canCreateAccount: true,
    canTrialBalance: true, canGeneralLedger: true, canJournalBook: true,
    canAccessInstallments: true, canAccessCredit: true,
    canMultiBranch: false, canConsolidatedReports: false,
    canCloseFiscalYear: true, canFiscalYearManagement: true, // ★★★ v6.7: فعال برای پیشرفته
    canMoidianIntegration: true,
    // ★★★ v9.1: پلن پیشرفته کارتخوان را فعال می‌کند
    canMultiCashRegister: true,
    // ★★★ v9.1: پلن پیشرفته درگاه پرداخت الکترونیکی ندارد
    canOnlinePayment: false,
    // ★★★ v9.1: پلن پیشرفته اعلان SMS ندارد
    canAccessSmsNotifications: false,
    // ★★★ v6.1: انبارداری پیشرفته
    canPurchaseInvoice: true,
    canMultiWarehouse: true,        // ★ ۲ انبار
    canStockTransfer: true,         // ★ انتقال بین ۲ انبار
    canStockCount: true,            // ★★★ v6.5: انبار گردانی
    maxWarehouses: 2,
    upgradeMessage: 'این قابلیت در پلن حرفه‌ای در دسترس است',
  },
  enterprise: {
    tier: 'enterprise', label: 'حرفه‌ای', labelEn: 'Professional',
    posPaymentTypes: ['cash', 'card', 'credit', 'installment', 'check'],
    canEditTax: true, canDeleteInvoice: true, canPrintInvoice: true,
    canViewSimpleReport: true, canViewJournals: true,
    canViewAccounts: true, canCreateJournal: true, canCreateAccount: true,
    canTrialBalance: true, canGeneralLedger: true, canJournalBook: true,
    canAccessInstallments: true, canAccessCredit: true,
    canMultiBranch: true, canConsolidatedReports: true,
    canCloseFiscalYear: true, canFiscalYearManagement: true,
    canMoidianIntegration: true,
    canMultiCashRegister: true,
    canOnlinePayment: true,
    // ★★★ v9.1: پلن حرفه‌ای اعلان SMS دارد
    canAccessSmsNotifications: true,
    // ★★★ v6.1: انبارداری حرفه‌ای
    canPurchaseInvoice: true,
    canMultiWarehouse: true,        // ★ نامحدود
    canStockTransfer: true,
    canStockCount: true,            // ★★★ v6.5: انبار گردانی
    maxWarehouses: 0,               // 0 = نامحدود
    upgradeMessage: '',
  },
}

export interface PlanInfo {
  planName: PlanName
  tier: PlanTier
  label: string
  labelEn: string
  isPaid: boolean
  isIsolated: boolean
  description: string
  // ★★★ v9.0: حذف monthlyPrice، اضافه شدن lifetimePrice
  annualPrice: number
  lifetimePrice: number
  maxProducts: number
  maxInvoicesPerMonth: number
  maxUsers: number
  billingCycles: BillingCycle[]
}

// ★★★ v9.0: قیمت‌های جدید
const PLAN_PRICES = {
  simple: { annual: 1_590_000, lifetime: 16_000_000 },
  professional: { annual: 2_760_000, lifetime: 28_000_000 },
  enterprise: { annual: 3_550_000, lifetime: 36_000_000 },
}

export const PLANS: Record<PlanName, PlanInfo> = {
  simple: {
    planName: 'simple', tier: 'basic', label: 'پایه', labelEn: 'Basic',
    isPaid: true, isIsolated: false,
    // ★★★ v9.1: تغییر توضیحات پلن پایه
    description: 'حسابداری پایه با فروش نقدی، نسیه و اقساط (فقط پرداخت حضوری). مناسب خرده‌فروش‌های کوچک و مغازه‌های محلی.',
    annualPrice: PLAN_PRICES.simple.annual,
    lifetimePrice: PLAN_PRICES.simple.lifetime,
    maxProducts: 0, maxInvoicesPerMonth: 0, maxUsers: 2,  // ★ تغییر: محصولات و فاکتور نامحدود
    billingCycles: ['annual', 'lifetime'],
  },
  professional: {
    planName: 'professional', tier: 'professional', label: 'پیشرفته', labelEn: 'Advanced',
    isPaid: true, isIsolated: false,
    // ★★★ v9.1: تغییر توضیحات پلن پیشرفته
    description: 'حسابداری دوطرفه کامل، ثبت خودکار بهای تمام شده، مدیریت طلب و بدهی، تراز آزمایشی، دفتر کل و روزنامه، اتصال به سامانه مودیان، انبارداری دوگانه، کارتخوان. مناسب فروشگاه‌های متوسط.',
    annualPrice: PLAN_PRICES.professional.annual,
    lifetimePrice: PLAN_PRICES.professional.lifetime,
    maxProducts: 0, maxInvoicesPerMonth: 0, maxUsers: 5,  // ★ تغییر: محصولات و فاکتور نامحدود
    billingCycles: ['annual', 'lifetime'],
  },
  enterprise: {
    planName: 'enterprise', tier: 'enterprise', label: 'حرفه‌ای', labelEn: 'Professional',
    isPaid: true, isIsolated: false,
    description: 'تمام موارد پیشرفته + حسابداری شعب و انبارهای متعدد، گزارش‌های تلفیقی، بستن خودکار سال مالی، درگاه پرداخت آنلاین، اعلان SMS. مناسب سازمان‌ها و فروشگاه‌های بزرگ.',
    annualPrice: PLAN_PRICES.enterprise.annual,
    lifetimePrice: PLAN_PRICES.enterprise.lifetime,
    maxProducts: 0, maxInvoicesPerMonth: 0, maxUsers: 0,  // بدون تغییر (نامحدود)
    billingCycles: ['annual', 'lifetime'],
  },
}

// ★★★ v9.0: resolvePlanName — همچنان نام‌های فارسی قدیمی را هم می‌پذیرد
//   تا tenant‌های قدیمی که در DB "ساده"/"حرفه‌ای"/"سازمانی" ذخیره شده‌اند درست تشخیص داده شوند.
//   اما نام‌های فارسی جدید ("پایه"/"پیشرفته"/"حرفه‌ای" جدید) اولویت دارند.
export function resolvePlanName(planName: string | null | undefined): PlanName {
  if (!planName) return 'simple'
  const lower = planName.toLowerCase().trim()
  if (lower.includes('_')) {
    const parts = lower.split('_')
    const tier = parts[0]
    if (tier === 'enterprise' || tier === 'organization') return 'enterprise'
    if (tier === 'professional' || tier === 'standard') return 'professional'
    if (tier === 'simple' || tier === 'starter' || tier === 'basic' || tier === 'free' || tier === 'trial') return 'simple'
  }
  if (lower === 'enterprise' || lower === 'organization') return 'enterprise'
  if (lower === 'professional' || lower === 'standard') return 'professional'
  if (lower === 'simple' || lower === 'starter' || lower === 'basic') return 'simple'
  // ★ نام فارسی جدید v9.0:
  //   "حرفه‌ای" جدید = enterprise (سطح بالا)
  //   "پیشرفته" = professional
  //   "پایه" = simple
  // ★ اما "حرفه‌ای" در داده‌های قدیمی ممکن است به professional اشاره داشته باشد.
  //   برای رفع ابهام: "سازمانی" همیشه enterprise است.
  if (lower.includes('سازمانی')) return 'enterprise'
  if (lower.includes('پیشرفته')) return 'professional'
  if (lower.includes('پایه')) return 'simple'
  // ★ "حرفه‌ای" در v9.0 به enterprise اشاره دارد (نام جدید)
  if (lower.includes('حرفه')) return 'enterprise'
  if (lower.includes('استاندارد')) return 'professional'
  if (lower.includes('ساده') || lower.includes('رایگان')) return 'simple'
  if (lower.includes('enterprise') || lower.includes('organization')) return 'enterprise'
  if (lower.includes('professional') || lower.includes('standard')) return 'professional'
  return 'simple'
}

export function resolvePlanTier(planName: string | null | undefined): PlanTier {
  const resolved = resolvePlanName(planName)
  return PLANS[resolved].tier
}

export function resolvePlan(planName: string | null | undefined): ResolvedPlan {
  const planNameResolved = resolvePlanName(planName)
  const planInfo = PLANS[planNameResolved]
  const features = PLAN_FEATURES[planInfo.tier]
  return {
    planName: planNameResolved,
    tier: planInfo.tier,
    label: planInfo.label,
    labelEn: planInfo.labelEn,
    isPaid: planInfo.isPaid,
    isIsolated: false,
    features,
  }
}

export function getPlanFeatures(tier: PlanTier): PlanFeatureSet {
  return PLAN_FEATURES[tier]
}

export function getFeaturesByPlanName(planName: string | null | undefined): PlanFeatureSet {
  const tier = resolvePlanTier(planName)
  return PLAN_FEATURES[tier]
}

export function getPlanInfo(planName: string | null | undefined): PlanInfo {
  const resolved = resolvePlanName(planName)
  return PLANS[resolved]
}

export function hasFeature(
  planName: string | null | undefined,
  feature: keyof PlanFeatureSet
): boolean {
  const features = getFeaturesByPlanName(planName)
  const value = features[feature]
  return typeof value === 'boolean' ? value : false
}

export function isPlanAtLeast(tier1: PlanTier, tier2: PlanTier): boolean {
  const levels: Record<PlanTier, number> = { basic: 0, professional: 1, enterprise: 2 }
  return levels[tier1] >= levels[tier2]
}

export function isPaidPlan(_planName: string | null | undefined): boolean { return true }
export function isIsolatedPlan(_planName: string | null | undefined): boolean { return false }

export const PLAN_TIERS: { tier: PlanTier; label: string; labelEn: string; description: string }[] = [
  { tier: 'basic', label: 'پایه', labelEn: 'Basic', description: 'تک‌دفتری: درآمد/هزینه، سود و زیان ساده، فروش نسیه و اقساط (فقط حضوری)، بدون بهای تمام شده خودکار.' },
  { tier: 'professional', label: 'پیشرفته', labelEn: 'Advanced', description: 'حسابداری دوطرفه کامل، ثبت خودکار بهای تمام شده، مدیریت طلب و بدهی، تراز آزمایشی، دفتر کل و روزنامه، اتصال به سامانه مودیان، انبارداری دوگانه، کارتخوان.' },
  { tier: 'enterprise', label: 'حرفه‌ای', labelEn: 'Professional', description: 'تمام موارد پیشرفته + حسابداری شعب و انبارهای متعدد، گزارش‌های تلفیقی، بستن خودکار سال مالی، درگاه پرداخت آنلاین، اعلان SMS.' },
]

export const PLAN_LIST: PlanInfo[] = Object.values(PLANS)

export function getNextTier(current: PlanTier): PlanTier | null {
  if (current === 'basic') return 'professional'
  if (current === 'professional') return 'enterprise'
  return null
}

export function getNextPlan(currentPlanName: string | null | undefined): PlanName | null {
  const resolved = resolvePlanName(currentPlanName)
  if (resolved === 'simple') return 'professional'
  if (resolved === 'professional') return 'enterprise'
  return null
}

export function getFeatureLabel(feature: keyof PlanFeatureSet): string {
  const labels: Record<keyof PlanFeatureSet, string> = {
    tier: 'سطح پلن', label: 'نام پلن', labelEn: 'نام انگلیسی',
    posPaymentTypes: 'روش‌های پرداخت', canEditTax: 'ویرایش مالیات',
    canDeleteInvoice: 'حذف فاکتور', canPrintInvoice: 'چاپ فاکتور',
    canViewSimpleReport: 'گزارش ساده درآمد/هزینه', canViewJournals: 'مشاهده اسناد حسابداری',
    canViewAccounts: 'چارت حساب‌ها', canCreateJournal: 'ایجاد سند دستی',
    canCreateAccount: 'ایجاد حساب جدید', canTrialBalance: 'تراز آزمایشی',
    canGeneralLedger: 'دفتر کل', canJournalBook: 'دفتر روزنامه',
    canAccessInstallments: 'مدیریت اقساط', canAccessCredit: 'فروش نسیه',
    canMultiBranch: 'حسابداری شعب', canConsolidatedReports: 'گزارش‌های تلفیقی',
    canCloseFiscalYear: 'بستن سال مالی', canFiscalYearManagement: 'مدیریت سال مالی',
    canMoidianIntegration: 'اتصال سامانه مودیان',
    canMultiCashRegister: 'مدیریت چند صندوق', canOnlinePayment: 'درگاه پرداخت آنلاین',
    canAccessSmsNotifications: 'اعلان پیامکی',
    canPurchaseInvoice: 'فاکتور خرید و تامین‌کنندگان',
    canMultiWarehouse: 'چند انباری',
    canStockTransfer: 'انتقال بین انبارها',
    canStockCount: 'انبار گردانی',
    maxWarehouses: 'حداکثر تعداد انبار',
    upgradeMessage: 'پیام ارتقا',
  }
  return labels[feature] || feature
}

// ★★★ v9.0: getPlanPrice برای دوره‌های annual و lifetime
export function getPlanPrice(planName: PlanName, cycle: BillingCycle): number {
  const plan = PLANS[planName]
  return cycle === 'lifetime' ? plan.lifetimePrice : plan.annualPrice
}

// ★★★ v9.0: getCycleDurationDays — lifetime = 0 (یعنی بدون انقضا)
export function getCycleDurationDays(cycle: BillingCycle): number {
  if (cycle === 'lifetime') return 0 // 0 = نامحدود / بدون انقضا
  return 365 // annual
}

// ★★★ v9.0: getCycleLabel
export function getCycleLabel(cycle: BillingCycle): string {
  if (cycle === 'lifetime') return 'مادام‌العمر'
  return 'سالانه'
}

// ★★★ v9.0: isLifetimeCycle — آیا این دوره مادام‌العمر است؟
export function isLifetimeCycle(cycle: string | null | undefined): boolean {
  if (!cycle) return false
  const lower = cycle.toLowerCase().trim()
  return lower === 'lifetime' || lower === 'مادام‌العمر' || lower === 'مادام‌العمر '
}

// ═══════════════════════════════════════════════════════════════
//  ★★★ v9.0: قوانین ارتقا و تنزل پلن‌ها
// ═══════════════════════════════════════════════════════════════
//
//  سطح‌بندی پلن‌ها (از پایین به بالا):
//    basic (پایه)        < professional (پیشرفته) < enterprise (حرفه‌ای)
//
//  قوانین:
//    ۱. هیچ tenant ای نمی‌تواند به سطح پایین‌تر از سطح فعلی خود تنزل کند.
//       (مثلاً پیشرفته → پایه مجاز نیست، حرفه‌ای → پایه/پیشرفته مجاز نیست)
//    ۲. tenant می‌تواند به سطح بالاتر ارتقا پیدا کند:
//       پایه → پیشرفته یا حرفه‌ای
//       پیشرفته → حرفه‌ای
//    ۳. در هر سطح، tenant می‌تواند از دوره سالانه به دوره مادام‌العمر ارتقا کند.
//       (اما از مادام‌العمر به سالانه تنزل دوره مجاز نیست — مگر اینکه سطح پلن ارتقا کند)
//    ۴. tenant با پلن مادام‌العمر در همان سطح، نمی‌تواند به پلن سالانه همان سطح برگردد.
//
//  ماتریس مجاز بودن ارتقا (target در سطر، current در ستون):
//                                            target
//                          | پایه-سالانه | پایه-عمر | پیشرفته-سالانه | پیشرفته-عمر | حرفه‌ای-سالانه | حرفه‌ای-عمر
//   current پایه-سالانه     |     —      |    ✓    |       ✓       |     ✓     |       ✓       |     ✓
//   current پایه-عمر        |     ✗      |    —    |       ✓       |     ✓     |       ✓       |     ✓
//   current پیشرفته-سالانه   |     ✗      |    ✗    |       —       |     ✓     |       ✓       |     ✓
//   current پیشرفته-عمر      |     ✗      |    ✗    |       ✗       |     —     |       ✓       |     ✓
//   current حرفه‌ای-سالانه    |     ✗      |    ✗    |       ✗       |     ✗     |       —       |     ✓
//   current حرفه‌ای-عمر       |     ✗      |    ✗    |       ✗       |     ✗     |       ✗       |     —
//
//  یادداشت: تنزل دوره (مثلاً پیشرفته-عمر → پیشرفته-سالانه) مجاز نیست.
// ═══════════════════════════════════════════════════════════════

export interface PlanUpgradeTarget {
  planName: PlanName
  billingCycle: BillingCycle
}

const TIER_LEVEL: Record<PlanTier, number> = { basic: 0, professional: 1, enterprise: 2 }
const CYCLE_LEVEL: Record<BillingCycle, number> = { annual: 0, lifetime: 1 }

/**
 * بررسی می‌کند که آیا ارتقا از یک پلن به پلن دیگر مجاز است یا خیر.
 *
 * @param currentPlanName  نام پلن فعلی (مثلاً 'simple', 'professional', 'enterprise')
 * @param currentCycle     دوره فعلی ('annual' یا 'lifetime')
 * @param targetPlanName   نام پلن هدف
 * @param targetCycle      دوره هدف
 * @returns true اگر ارتقا مجاز است (یعنی target سطحي ≥ current و (سطح بالاتر است یا دوره بالاتر است))
 */
export function canUpgradePlan(
  currentPlanName: string | null | undefined,
  currentCycle: string | null | undefined,
  targetPlanName: PlanName,
  targetCycle: BillingCycle,
): boolean {
  const currentResolved = resolvePlanName(currentPlanName)
  const currentTier = PLANS[currentResolved].tier

  const targetTier = PLANS[targetPlanName].tier

  // ★ اگر سطح هدف پایین‌تر از سطح فعلی باشد → مجاز نیست
  if (TIER_LEVEL[targetTier] < TIER_LEVEL[currentTier]) {
    return false
  }

  // ★ اگر سطح هدف برابر با سطح فعلی باشد:
  //   - دوره هدف باید ≥ دوره فعلی باشد
  //   - یعنی از سالانه به مادام‌العمر مجاز است، اما برعکس مجاز نیست
  if (TIER_LEVEL[targetTier] === TIER_LEVEL[currentTier]) {
    const currentCycleResolved: BillingCycle =
      isLifetimeCycle(currentCycle) ? 'lifetime' : 'annual'
    // ★ همان پلن و همان دوره → مجاز نیست (تغییری لازم نیست)
    if (currentResolved === targetPlanName && currentCycleResolved === targetCycle) {
      return false
    }
    return CYCLE_LEVEL[targetCycle] >= CYCLE_LEVEL[currentCycleResolved]
  }

  // ★ اگر سطح هدف بالاتر از سطح فعلی باشد → همیشه مجاز است
  //   (چه دوره هدف سالانه باشد، چه مادام‌العمر)
  return true
}

/**
 * بررسی می‌کند که آیا tenant فعلاً روی پلن مادام‌العمر است یا خیر.
 */
export function isTenantOnLifetime(
  planName: string | null | undefined,
  billingCycle: string | null | undefined,
): boolean {
  return isLifetimeCycle(billingCycle)
}

/**
 * فهرست پلن‌های قابل ارتقا برای tenant فعلی.
 * (برای استفاده در UI — دکمه‌های ارتقا)
 */
export function getAvailableUpgrades(
  currentPlanName: string | null | undefined,
  currentCycle: string | null | undefined,
): PlanUpgradeTarget[] {
  const all: PlanUpgradeTarget[] = []
  const planNames: PlanName[] = ['simple', 'professional', 'enterprise']
  const cycles: BillingCycle[] = ['annual', 'lifetime']

  for (const pn of planNames) {
    for (const bc of cycles) {
      if (canUpgradePlan(currentPlanName, currentCycle, pn, bc)) {
        all.push({ planName: pn, billingCycle: bc })
      }
    }
  }
  return all
}

export default PLAN_FEATURES