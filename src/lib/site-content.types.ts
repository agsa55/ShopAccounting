// ============================================================================
// src/lib/site-content.types.ts
// Types و Defaults — قابل استفاده در Server و Client
// ============================================================================

export interface PlanTierData {
  id: string
  name: string
  nameFa: string
  description: string
  annualPrice: number
  lifetimePrice: number
  discountPercent: number
  icon: string              // ★ اضافه شد: نام آیکون (Zap, Crown, Building2)
  popular?: boolean
  color: string             // ★ اضافه شد: رنگ متن (text-blue-600)
  bgColor: string           // ★ اضافه شد: رنگ پس‌زمینه (bg-blue-50)
  borderColor: string       // ★ اضافه شد: رنگ حاشیه (border-blue-200)
  gradient: string          // ★ اضافه شد: گرادیانت (from-blue-500 to-cyan-500)
  features: string[]
  order: number
}

export interface FeatureData {
  id: string
  iconName: string
  title: string
  desc: string
  color: string
  grad: string
  light: string
  order: number
}

export interface StatData {
  id: string
  value: number
  suffix: string
  label: string
  iconName: string
  compact?: boolean
  order: number
}

export interface TestimonialData {
  id: string
  name: string
  role: string
  text: string
  avatar: string
  color: string
  rating: number
  order: number
}

export interface TrustBadgeData {
  id: string
  iconName: string
  label: string
  order: number
}

export interface SiteContent {
  plans: PlanTierData[]
  features: FeatureData[]
  stats: StatData[]
  testimonials: TestimonialData[]
  trustBadges: TrustBadgeData[]
  tickerItems: string[]
  updatedAt: string
}

// ═══════════════════════════════════════════════════════════════
//  DEFAULTS — دقیقاً مطابق مقادیر لاندینگ پیج اصلی
// ═══════════════════════════════════════════════════════════════
export const DEFAULT_SITE_CONTENT: SiteContent = {
 plans: [
  {
    id: 'p1', name: 'simple', nameFa: 'پایه',
    description: 'مناسب فروشگاه‌های کوچک و فردی',
    annualPrice: 1590000, lifetimePrice: 16000000,
    discountPercent: 0, icon: 'Zap', popular: false,
    color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200',
    gradient: 'from-blue-500 to-cyan-500', order: 1,
    features: ['تا ۲ کاربر', 'محصول نامحدود', 'فاکتور نامحدود', '۱ انبار', 'داشبورد مالی', 'مدیریت اقساط'],  // ★ تغییر
  },
  {
    id: 'p2', name: 'professional', nameFa: 'پیشرفته',
    description: 'فروشگاه‌های متوسط و در حال رشد',
    annualPrice: 2760000, lifetimePrice: 28000000,
    discountPercent: 0, icon: 'Crown', popular: true,
    color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-300',
    gradient: 'from-emerald-500 to-teal-500', order: 2,
    features: ['تا ۵ کاربر', 'محصول نامحدود', 'فاکتور نامحدود', '۲ انبار', 'حسابداری دوطرفه', 'گزارشات مالی', 'درگاه پرداخت', 'پشتیبانی اولویت‌دار'],  // ★ تغییر
  },
  {
    id: 'p3', name: 'enterprise', nameFa: 'حرفه‌ای',
    description: 'کسب‌وکارهای بزرگ و سازمان‌ها',
    annualPrice: 3550000, lifetimePrice: 36000000,
    discountPercent: 0, icon: 'Building2', popular: false,
    color: 'text-purple-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-200',
    gradient: 'from-purple-500 to-fuchsia-500', order: 3,
    features: ['کاربر نامحدود', 'محصول نامحدود', 'فاکتور نامحدود', 'انبار نامحدود', 'تمام امکانات پیشرفته', 'حسابداری شعب', 'اتصال سامانه مودیان', 'پشتیبانی ۲۴/۷ اختصاصی'],  // ★ تغییر
  },
],

  features: [
    { id: 'f1', iconName: 'ShoppingCart', title: 'صندوق فروش', desc: 'ثبت سریع فاکتور، مدیریت نقدی و نسیه با رابطی روان', color: 'bg-violet-100 text-violet-600', grad: 'from-violet-500 to-purple-600', light: 'bg-violet-50', order: 1 },
    { id: 'f2', iconName: 'Package', title: 'مدیریت محصولات', desc: 'کنترل موجودی، قیمت‌گذاری و دسته‌بندی هوشمند', color: 'bg-blue-100 text-blue-600', grad: 'from-blue-500 to-indigo-600', light: 'bg-blue-50', order: 2 },
    { id: 'f3', iconName: 'Users', title: 'مشتریان', desc: 'مدیریت مشتریان، گردش حساب و تاریخچه خرید', color: 'bg-cyan-100 text-cyan-600', grad: 'from-cyan-500 to-sky-500', light: 'bg-cyan-50', order: 3 },
    { id: 'f4', iconName: 'CreditCard', title: 'اقساط', desc: 'مدیریت فروش قسطی، سررسیدها و یادآوری‌ها', color: 'bg-amber-100 text-amber-600', grad: 'from-amber-500 to-orange-500', light: 'bg-amber-50', order: 4 },
    { id: 'f5', iconName: 'BookOpen', title: 'حسابداری', desc: 'اسناد خودکار و دستی، تراز آزمایشی دقیق', color: 'bg-purple-100 text-purple-600', grad: 'from-purple-500 to-fuchsia-600', light: 'bg-purple-50', order: 5 },
    { id: 'f6', iconName: 'BarChart3', title: 'گزارش‌ها', desc: 'گزارش فروش، سود و زیان، خروجی Excel حرفه‌ای', color: 'bg-pink-100 text-pink-600', grad: 'from-pink-500 to-rose-500', light: 'bg-pink-50', order: 6 },
  ],

  stats: [
    { id: 's1', value: 12000, suffix: '+', label: 'فروشگاه فعال', iconName: 'Building2', compact: false, order: 1 },
    { id: 's2', value: 8500000, suffix: '+', label: 'فاکتور صادر شده', iconName: 'ShoppingCart', compact: true, order: 2 },
    { id: 's3', value: 99, suffix: '٪', label: 'رضایت مشتریان', iconName: 'Star', compact: false, order: 3 },
    { id: 's4', value: 24, suffix: '/7', label: 'پشتیبانی آنلاین', iconName: 'Clock', compact: false, order: 4 },
  ],

  testimonials: [
    { id: 't1', name: 'محمد رضایی', role: 'صاحب فروشگاه لوازم خانگی', text: 'بعد از استفاده از ShopAccounting، سرعت صدور فاکتورم ۳ برابر شده و مدیریت اقساطم کاملاً شفاف شده.', avatar: 'م', color: 'from-violet-500 to-purple-600', rating: 5, order: 1 },
    { id: 't2', name: 'فاطمه حسینی', role: 'مدیر فروشگاه پوشاک', text: 'گزارش‌های مالی دقیق و داشبورد عالی. حالا می‌تونم تصمیمات فروشم رو بر اساس داده واقعی بگیرم.', avatar: 'ف', color: 'from-fuchsia-500 to-pink-600', rating: 5, order: 2 },
    { id: 't3', name: 'علی کریمی', role: 'مدیر عامل فروشگاه زنجیره‌ای', text: 'پلن سازمانی برای مدیریت چند شعبه ما فوق‌العاده است. پشتیبانی سریع و کاملاً حرفه‌ای.', avatar: 'ع', color: 'from-blue-500 to-indigo-600', rating: 5, order: 3 },
  ],

  trustBadges: [
    { id: 'tb1', iconName: 'ShieldCheck', label: 'پرداخت امن ۱۰۰٪', order: 1 },
    { id: 'tb2', iconName: 'CheckCircle2', label: 'بدون هزینه پنهان', order: 2 },
    { id: 'tb3', iconName: 'Clock', label: 'راه‌اندازی زیر ۵ دقیقه', order: 3 },
    { id: 'tb4', iconName: 'Star', label: 'پشتیبانی ۲۴/۷', order: 4 },
  ],

  tickerItems: [
    'فروشگاه لوازم خانگی', 'پوشاک و مد', 'داروخانه', 'لوازم یدکی',
    'سوپرمارکت', 'طلافروشی', 'موبایل‌فروشی', 'عطر و آرایشی',
    'کتاب‌فروشی', 'لوازم‌التحریر',
  ],

  updatedAt: new Date().toISOString(),
}