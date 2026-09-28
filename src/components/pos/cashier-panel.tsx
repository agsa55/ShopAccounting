'use client';

// ============================================================================
// src/components/pos/cashier-panel.tsx — v12.3.2 ★★★ ULTRA COMPACT + SMART DETAILS
// ★ v12.3.2:
//   - نوار وضعیت فوق‌فشرده برای صفحه صندوق
//   - دکمه جزئیات یک ردیف دوم بازشونده ایجاد می‌کند
//   - آیتم‌های صفر در جزئیات نمایش داده نمی‌شوند
//   - آیکون آنلاین به CreditCard تغییر کرد
//   - آیتم آنلاین فقط وقتی مقدار دارد نمایش داده می‌شود
//   - حفظ کامل تراکنش دستی و گزارش عملکرد
// ★ v12.3.1:
//   - chip های کوچک جای کارت‌های بزرگ
//   - تفکیک بهتر نقدی صندوق و آنلاین/درگاه
// ★ v12.3.0:
//   - تفکیک بهتر ورودی نقدی و آنلاین
//   - تغییر برچسب‌های گمراه‌کننده
// ★ v12.2.1:
//   - نمایش سود امروز و سود کل صندوق‌دار
//   - نمایش صحیح‌تر موجودی واقعی صندوق
//   - رنگ‌بندی سود منفی/مثبت
// ★ v12.1.0: تفکیک پیش‌پرداخت فروش اقساطی
// ★ پنل یکپارچه صندوق‌دار (نوار وضعیت + تراکنش دستی + گزارش)
// ★ v11.7.2: نمایش موجودی اولیه و ابتدای روز
// ★ v11.9.1: لاگ‌های سیستمی + API جدید cashier-dashboard
// ★ v11.9.8: نمایش صحیح برگشتی‌ها و خالص فروش
// ★ فقط یک خط در pos-page.tsx اضافه می‌شود: <CashierPanel />
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PlusCircle,
  BarChart3,
  Loader2,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  Calendar,
  RotateCcw,
  Clock,
  Users,
  CircleDollarSign,
  ChevronDown,
  ChevronUp,
  CreditCard,
} from 'lucide-react';
import { logger } from '@/lib/system-logger';

// ═══════════════════════════════════════════════════════════════
// توابع کمکی
// ═══════════════════════════════════════════════════════════════

const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰';
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

const num = (value: any): number => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const formatPrice = (value: any): string => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '۰';
  return toFaNum(Math.round(n).toLocaleString('en-US'));
};

// ★ فقط مواردی که واقعاً مقدار دارند نمایش داده شوند
function hasAmount(value: any): boolean {
  return Math.abs(Number(value || 0)) >= 1;
}

// ═══════════════════════════════════════════════════════════════
// نرمال‌سازی خلاصه صندوق‌دار
// ★ هدف: جدا کردن نقدی صندوق از آنلاین/درگاه
// ═══════════════════════════════════════════════════════════════

function normalizeCashierSummary(summary: any) {
  const currentBalance = num(summary?.currentBalance ?? summary?.realCashBalance);
  const openingBalance = num(summary?.openingBalance);
  const startOfDayBalance = num(summary?.startOfDayBalance ?? summary?.openingBalance);

  const cashSalesRaw = num(summary?.cashSales);

  // ★ اگر API فیلد آنلاین جدا داشت، از همان استفاده می‌کنیم.
  const explicitOnlineCandidates = [
    summary?.onlineSales,
    summary?.onlineReceived,
    summary?.gatewaySales,
    summary?.cardSales,
    summary?.onlineAmount,
  ];

  const explicitOnline = explicitOnlineCandidates.find(
    (v) => v !== undefined && v !== null
  );

  const hasExplicitOnline = explicitOnline !== undefined;
  const onlineFromApi = hasExplicitOnline ? num(explicitOnline) : 0;

  // ★ اگر فیلد آنلاین نبود، موجودی نقدی امروز را از تغییر صندوق برآورد می‌کنیم.
  const estimatedPhysicalCashToday = Math.max(0, currentBalance - startOfDayBalance);

  const cashReceived = hasExplicitOnline
    ? Math.max(0, cashSalesRaw - onlineFromApi)
    : Math.min(cashSalesRaw, estimatedPhysicalCashToday);

  const onlineReceived = hasExplicitOnline
    ? onlineFromApi
    : Math.max(0, cashSalesRaw - cashReceived);

  const totalReceivedToday = cashReceived + onlineReceived;

  const netSales =
    summary?.netSales !== undefined
      ? num(summary.netSales)
      : num(summary?.totalSales);

  const returns = num(summary?.returns);
  const returnsCount = num(summary?.returnsCount);

  const profitToday = num(summary?.profitToday);
  const profitTotal = num(summary?.profitTotal);

  const creditSales = num(summary?.creditSales);

  const installmentSales = num(summary?.installmentSales);
  const installmentRemaining = num(
    summary?.installmentRemaining ?? summary?.installmentSales
  );
  const installmentReceived = num(
    summary?.installmentPrepaid ?? summary?.downPayment
  );

  // ★ اگر API بعداً مبلغ کل فاکتور اقساطی را جدا داد، از آن استفاده می‌کند.
  const installmentInvoiceTotal = num(
    summary?.installmentInvoiceTotal ??
      summary?.installmentSalesTotal ??
      summary?.installmentTotal
  );

  const checkSales = num(summary?.checkSales);

  const totalPurchases = num(summary?.totalPurchases);
  const totalServices = num(summary?.totalServices);

  return {
    currentBalance,
    openingBalance,
    startOfDayBalance,

    cashSalesRaw,
    cashReceived,
    onlineReceived,
    totalReceivedToday,
    hasExplicitOnline,

    netSales,
    returns,
    returnsCount,

    profitToday,
    profitTotal,

    creditSales,

    installmentSales,
    installmentRemaining,
    installmentReceived,
    installmentInvoiceTotal,

    checkSales,

    totalPurchases,
    totalServices,
  };
}

// ═══════════════════════════════════════════════════════════════
// کامپوننت chip بسیار کوچک
// ═══════════════════════════════════════════════════════════════

function TinyChip({
  label,
  value,
  tone = 'gray',
  icon,
  title,
}: {
  label: string;
  value: string;
  tone?:
    | 'gray'
    | 'emerald'
    | 'blue'
    | 'purple'
    | 'orange'
    | 'cyan'
    | 'red'
    | 'violet'
    | 'indigo';
  icon?: any;
  title?: string;
}) {
  const tones: Record<string, string> = {
    gray: 'border-gray-200 bg-white text-gray-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    purple: 'border-purple-200 bg-purple-50 text-purple-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  };

  return (
    <span
      title={title}
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[9px] leading-none shadow-sm sm:text-[10px] ${
        tones[tone] || tones.gray
      }`}
    >
      {icon ? <span className="opacity-80">{icon}</span> : null}
      <span className="font-medium opacity-75">{label}</span>
      <span className="font-mono text-[10px] font-black sm:text-[11px]" dir="ltr">
        {value}
      </span>
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// انواع تراکنش دستی
// ═══════════════════════════════════════════════════════════════

const TRANSACTION_TYPES = [
  {
    value: 'deposit',
    label: 'واریز پول',
    icon: '💰',
    direction: 'in',
    description: 'ورود پول به صندوق',
    color: 'emerald',
  },
  {
    value: 'withdrawal',
    label: 'برداشت پول',
    icon: '💸',
    direction: 'out',
    description: 'خروج پول از صندوق',
    color: 'red',
  },
  {
    value: 'expense',
    label: 'هزینه متفرقه',
    icon: '🧾',
    direction: 'out',
    description: 'هزینه‌های جاری فروشگاه',
    color: 'orange',
  },
];

// ═══════════════════════════════════════════════════════════════
// کامپوننت اصلی
// ═══════════════════════════════════════════════════════════════

export default function CashierPanel() {
  // ─── استیت‌های کاربر ───
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentTenantId, setCurrentTenantId] = useState<string>('');

  // ─── استیت‌های نوار وضعیت ───
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // ─── استیت‌های مودال تراکنش دستی ───
  const [showManualModal, setShowManualModal] = useState(false);
  const [transactionType, setTransactionType] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ─── استیت‌های مودال گزارش ───
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('today');
  const [reportLoading, setReportLoading] = useState(false);
  const [cashiers, setCashiers] = useState<any[]>([]);

  // ═══════════════════════════════════════════════════════════════
  // بارگذاری اطلاعات کاربر
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const parsedUser = JSON.parse(userStr);
        setCurrentUser(parsedUser);
        setCurrentTenantId(parsedUser.tenantId || '');
      }
    } catch (e) {
      console.warn('[CashierPanel] Failed to load user:', e);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // بارگذاری خلاصه تراکنش‌های امروز
  // ═══════════════════════════════════════════════════════════════

  const loadSummary = useCallback(
    async (isRefresh = false) => {
      if (!currentUser?.id || !currentTenantId) return;

      if (isRefresh) setRefreshing(true);
      else setLoadingSummary(true);

      try {
        const today = new Date().toISOString().split('T')[0];
        const res = await fetch(
          `/api/cashier-dashboard?cashierId=${currentUser.id}&date=${today}&tenantId=${currentTenantId}`
        );
        const data = await res.json();

        if (data.success) {
          setSummary(data.summary);

          if (data.summary?.returns > 0) {
            logger.info('آمار فروش با برگشتی به‌روز شد', {
              totalSales: data.summary.totalSales,
              returns: data.summary.returns,
              netSales: data.summary.netSales,
              returnsCount: data.summary.returnsCount,
            });
          }
        }
      } catch (err) {
        console.error('[CashierPanel] Load summary error:', err);
      } finally {
        setLoadingSummary(false);
        setRefreshing(false);
      }
    },
    [currentUser?.id, currentTenantId]
  );

  useEffect(() => {
    loadSummary();

    const interval = setInterval(() => loadSummary(true), 5000);
    return () => clearInterval(interval);
  }, [loadSummary]);

  useEffect(() => {
    const handleFocus = () => {
      loadSummary(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadSummary(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );
    };
  }, [loadSummary]);

  // ═══════════════════════════════════════════════════════════════
  // بارگذاری گزارش عملکرد
  // ═══════════════════════════════════════════════════════════════

  const loadReport = useCallback(async () => {
    if (!currentTenantId) return;
    setReportLoading(true);

    try {
      const res = await fetch(
        `/api/cashier-performance?tenantId=${currentTenantId}&period=${reportPeriod}`
      );
      const data = await res.json();

      if (data.success) {
        setCashiers(data.data || []);
      }
    } catch (err) {
      console.error('[CashierPanel] Load report error:', err);
    } finally {
      setReportLoading(false);
    }
  }, [currentTenantId, reportPeriod]);

  useEffect(() => {
    if (showReportModal) {
      loadReport();
    }
  }, [showReportModal, loadReport]);

  // ═══════════════════════════════════════════════════════════════
  // ثبت تراکنش دستی
  // ═══════════════════════════════════════════════════════════════

  const handleSubmitManualTransaction = async () => {
    setError('');

    if (!amount || Number(amount) <= 0) {
      setError('مبلغ باید بیشتر از صفر باشد');
      return;
    }

    if (!description.trim()) {
      setError('توضیحات تراکنش الزامی است');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/cash-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: currentTenantId,
          cashierId: currentUser.id,
          transactionType,
          amount: Number(amount),
          description: description.trim(),
          paymentMethod: 'cash',
        }),
      });

      const data = await res.json();

      if (data.success) {
        logger.info('تراکنش دستی ثبت شد', {
          transactionType,
          amount: Number(amount),
          description: description.trim(),
          cashierId: currentUser?.id,
          cashierName: currentUser?.username,
          direction: transactionType === 'deposit' ? 'in' : 'out',
        });

        setShowManualModal(false);
        setTransactionType('deposit');
        setAmount('');
        setDescription('');
        setError('');
        loadSummary(true);
        alert('✅ تراکنش با موفقیت ثبت شد');
      } else {
        setError(data.error || 'خطا در ثبت تراکنش');
      }
    } catch (err) {
      setError('خطای شبکه. لطفاً دوباره تلاش کنید.');
    } finally {
      setSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // نرمال‌سازی داده‌ها
  // ═══════════════════════════════════════════════════════════════

  const m = useMemo(() => normalizeCashierSummary(summary), [summary]);

  const hasAnyDetails = useMemo(
    () =>
      hasAmount(m.totalReceivedToday) ||
      hasAmount(m.startOfDayBalance) ||
      hasAmount(m.openingBalance) ||
      hasAmount(m.profitTotal) ||
      hasAmount(m.returns) ||
      hasAmount(m.creditSales) ||
      hasAmount(m.installmentRemaining) ||
      hasAmount(m.installmentReceived) ||
      hasAmount(m.installmentInvoiceTotal || m.installmentSales) ||
      hasAmount(m.checkSales) ||
      hasAmount(m.totalPurchases) ||
      hasAmount(m.totalServices),
    [m]
  );

  useEffect(() => {
    if (!summary) return;

    console.log('[CashierPanel] Raw summary:', summary);
    console.log('[CashierPanel] Normalized summary:', m);
  }, [summary, m]);

  const selectedType = TRANSACTION_TYPES.find(
    (t) => t.value === transactionType
  );

  const periodLabels: Record<string, string> = {
    today: 'امروز',
    week: '۷ روز اخیر',
    month: '۳۰ روز اخیر',
  };

  // ═══════════════════════════════════════════════════════════════
  // رندر
  // ═══════════════════════════════════════════════════════════════

  if (!currentUser || !currentTenantId) {
    return null;
  }

  return (
    <>
      {/* ═══════════════════════ نوار وضعیت فوق‌فشرده با جزئیات بازشونده ═══════════════════════ */}
      <div className="border-b border-emerald-100 bg-gradient-to-l from-emerald-50 via-teal-50 to-cyan-50 px-2 py-1">
        {loadingSummary ? (
          <div className="flex h-7 items-center justify-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
            <span className="text-[10px] text-emerald-700">
              بارگذاری صندوق...
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            {/* ═══ ردیف اصلی: همیشه فشرده ═══ */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* هویت صندوق‌دار */}
              <div className="flex min-w-0 shrink-0 items-center gap-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-[10px] font-black text-white shadow-sm sm:h-7 sm:w-7 sm:text-xs">
                  {(currentUser.username || currentUser.storeName || 'ص')[0]}
                </div>

                <div className="hidden min-w-0 lg:block">
                  <p className="text-[8px] leading-none text-emerald-700">
                    صندوق‌دار
                  </p>
                  <p className="max-w-[90px] truncate text-[10px] font-bold leading-tight text-slate-800 sm:max-w-[130px]">
                    {currentUser.username ||
                      currentUser.storeName ||
                      'صندوق‌دار'}
                  </p>
                </div>
              </div>

              <div className="h-5 w-px shrink-0 bg-emerald-200" />

              {/* شاخص‌های اصلی */}
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <TinyChip
                  label="موجودی"
                  value={formatPrice(m.currentBalance)}
                  tone={m.currentBalance >= 0 ? 'emerald' : 'red'}
                  icon={<Wallet className="h-3 w-3" />}
                  title="موجودی فعلی صندوق نقدی"
                />

                <TinyChip
                  label="نقدی"
                  value={formatPrice(m.cashReceived)}
                  tone="emerald"
                  icon={<CircleDollarSign className="h-3 w-3" />}
                  title={
                    m.hasExplicitOnline
                      ? 'ورودی نقدی امروز'
                      : 'برآورد ورودی نقدی امروز از تغییر موجودی صندوق'
                  }
                />

                {/* ★ آیتم آنلاین فقط وقتی مقدار دارد نمایش داده می‌شود */}
                {hasAmount(m.onlineReceived) && (
                  <TinyChip
                    label="آنلاین"
                    value={formatPrice(m.onlineReceived)}
                    tone="blue"
                    icon={<CreditCard className="h-3 w-3" />}
                    title="ورودی آنلاین / درگاه پرداخت امروز"
                  />
                )}

                <TinyChip
                  label="فروش"
                  value={formatPrice(m.netSales)}
                  tone="indigo"
                  icon={<TrendingUp className="h-3 w-3" />}
                  title="خالص فروش امروز"
                />

                <TinyChip
                  label="سود"
                  value={formatPrice(m.profitToday)}
                  tone={m.profitToday >= 0 ? 'violet' : 'red'}
                  icon={
                    m.profitToday >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )
                  }
                  title="سود امروز"
                />
              </div>

              {/* دکمه جزئیات */}
              <button
                onClick={() => setShowDetails((v) => !v)}
                className="flex h-6 shrink-0 items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 text-[9px] font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 sm:text-[10px]"
                title={showDetails ? 'بستن جزئیات' : 'نمایش جزئیات'}
              >
                {showDetails ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                <span className="hidden sm:inline">
                  {showDetails ? 'بستن' : 'جزئیات'}
                </span>
              </button>

              {/* دکمه تراکنش دستی */}
              <button
                onClick={() => setShowManualModal(true)}
                className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-white px-1.5 text-[9px] font-bold text-emerald-700 shadow-sm transition-all hover:bg-emerald-50 sm:text-[10px]"
                title="ثبت تراکنش دستی"
              >
                <PlusCircle className="h-3 w-3" />
                <span className="hidden sm:inline">دستی</span>
              </button>

              {/* دکمه گزارش */}
              <button
                onClick={() => setShowReportModal(true)}
                className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-white px-1.5 text-[9px] font-bold text-blue-700 shadow-sm transition-all hover:bg-blue-50 sm:text-[10px]"
                title="گزارش عملکرد"
              >
                <BarChart3 className="h-3 w-3" />
                <span className="hidden sm:inline">گزارش</span>
              </button>

              {/* دکمه رفرش */}
              <button
                onClick={() => loadSummary(true)}
                disabled={refreshing}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50"
                title="به‌روزرسانی"
              >
                <RefreshCw
                  className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`}
                />
              </button>
            </div>

            {/* ═══ ردیف جزئیات: فقط آیتم‌های دارای مقدار ═══ */}
            {showDetails && (
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-emerald-100 bg-white/60 px-1.5 py-1 shadow-sm">
                {hasAnyDetails ? (
                  <>
                    {hasAmount(m.totalReceivedToday) && (
                      <TinyChip
                        label="دریافتی"
                        value={formatPrice(m.totalReceivedToday)}
                        tone="violet"
                        icon={<Receipt className="h-3 w-3" />}
                        title="جمع ورودی نقدی و آنلاین امروز"
                      />
                    )}

                    {hasAmount(m.startOfDayBalance) && (
                      <TinyChip
                        label="ابتدا"
                        value={formatPrice(m.startOfDayBalance)}
                        tone="gray"
                        title="موجودی ابتدای امروز"
                      />
                    )}

                    {hasAmount(m.openingBalance) && (
                      <TinyChip
                        label="اولیه"
                        value={formatPrice(m.openingBalance)}
                        tone="gray"
                        title="موجودی اولیه"
                      />
                    )}

                    {hasAmount(m.profitTotal) && (
                      <TinyChip
                        label="سود کل"
                        value={formatPrice(m.profitTotal)}
                        tone={m.profitTotal >= 0 ? 'violet' : 'red'}
                        icon={<TrendingUp className="h-3 w-3" />}
                        title="سود کل این صندوق‌دار"
                      />
                    )}

                    {hasAmount(m.returns) && (
                      <TinyChip
                        label={`برگشتی${
                          m.returnsCount > 0 ? ` (${toFaNum(m.returnsCount)})` : ''
                        }`}
                        value={formatPrice(m.returns)}
                        tone="red"
                        icon={<RotateCcw className="h-3 w-3" />}
                        title="برگشتی‌های امروز"
                      />
                    )}

                    {hasAmount(m.creditSales) && (
                      <TinyChip
                        label="نسیه"
                        value={formatPrice(m.creditSales)}
                        tone="orange"
                        icon={<Users className="h-3 w-3" />}
                        title="فروش نسیه امروز"
                      />
                    )}

                    {hasAmount(m.installmentRemaining) && (
                      <TinyChip
                        label="باقی اقساط"
                        value={formatPrice(m.installmentRemaining)}
                        tone="purple"
                        icon={<Clock className="h-3 w-3" />}
                        title="باقیمانده اقساط وصول‌نشده"
                      />
                    )}

                    {hasAmount(m.installmentReceived) && (
                      <TinyChip
                        label="پیش‌پرداخت"
                        value={formatPrice(m.installmentReceived)}
                        tone="blue"
                        icon={<Users className="h-3 w-3" />}
                        title="پیش‌پرداخت یا دریافتی از فاکتور اقساطی"
                      />
                    )}

                    {hasAmount(m.installmentInvoiceTotal || m.installmentSales) && (
                      <TinyChip
                        label="کل اقساط"
                        value={formatPrice(m.installmentInvoiceTotal || m.installmentSales)}
                        tone="purple"
                        icon={<Receipt className="h-3 w-3" />}
                        title="مبلغ کل فاکتور یا فروش اقساطی"
                      />
                    )}

                    {hasAmount(m.checkSales) && (
                      <TinyChip
                        label="چک"
                        value={formatPrice(m.checkSales)}
                        tone="cyan"
                        icon={<Receipt className="h-3 w-3" />}
                        title="فروش چکی امروز"
                      />
                    )}

                    {hasAmount(m.totalPurchases) && (
                      <TinyChip
                        label="خرید"
                        value={formatPrice(m.totalPurchases)}
                        tone="red"
                        icon={<TrendingDown className="h-3 w-3" />}
                        title="خریدهای امروز"
                      />
                    )}

                    {hasAmount(m.totalServices) && (
                      <TinyChip
                        label="خدمات"
                        value={formatPrice(m.totalServices)}
                        tone="blue"
                        icon={<PlusCircle className="h-3 w-3" />}
                        title="خدمات امروز"
                      />
                    )}
                  </>
                ) : (
                  <span className="text-[9px] text-gray-500 sm:text-[10px]">
                    جزئیات غیرصفری برای امروز ثبت نشده است.
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════ مودال تراکنش دستی ═══════════════════════ */}
      {showManualModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowManualModal(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-l from-emerald-500 to-teal-600 px-4 py-3 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  <h3 className="text-sm font-black">ثبت تراکنش دستی</h3>
                </div>
                <button
                  onClick={() => setShowManualModal(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div>
                <label className="mb-2 block text-[11px] font-bold text-gray-700">
                  نوع تراکنش:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {TRANSACTION_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setTransactionType(type.value)}
                      className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-all ${
                        transactionType === type.value
                          ? type.color === 'emerald'
                            ? 'border-emerald-500 bg-emerald-50'
                            : type.color === 'red'
                            ? 'border-red-500 bg-red-50'
                            : 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl">{type.icon}</span>
                      <span
                        className={`text-[10px] font-bold ${
                          transactionType === type.value
                            ? type.color === 'emerald'
                              ? 'text-emerald-700'
                              : type.color === 'red'
                              ? 'text-red-700'
                              : 'text-orange-700'
                            : 'text-gray-600'
                        }`}
                      >
                        {type.label}
                      </span>
                    </button>
                  ))}
                </div>
                {selectedType && (
                  <p className="mt-1.5 flex items-center gap-1 text-[9px] text-gray-500">
                    {selectedType.direction === 'in' ? (
                      <ArrowDownCircle className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <ArrowUpCircle className="h-3 w-3 text-red-500" />
                    )}
                    {selectedType.description}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold text-gray-700">
                  مبلغ (ریال): <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="مثلاً: 500000"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold text-gray-700">
                  توضیحات: <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    transactionType === 'deposit'
                      ? 'مثلاً: دریافت پول از مدیر'
                      : transactionType === 'withdrawal'
                      ? 'مثلاً: خرید ملزومات فروشگاه'
                      : 'مثلاً: هزینه برق'
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-[11px] text-red-700">{error}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 px-4 pb-4">
              <button
                onClick={() => setShowManualModal(false)}
                disabled={submitting}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                onClick={handleSubmitManualTransaction}
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-l from-emerald-500 to-teal-600 px-3 py-2.5 text-xs font-bold text-white transition-all hover:shadow-lg disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>در حال ثبت...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>ثبت تراکنش</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ مودال گزارش عملکرد ═══════════════════════ */}
      {showReportModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowReportModal(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-l from-blue-500 to-indigo-600 px-4 py-3 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  <h3 className="text-sm font-black">
                    گزارش عملکرد صندوق‌داران
                  </h3>
                </div>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
              <Calendar className="h-4 w-4 text-gray-500" />
              <div className="flex items-center gap-1.5">
                {Object.entries(periodLabels).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setReportPeriod(key)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                      reportPeriod === key
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {reportLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              ) : cashiers.length === 0 ? (
                <div className="py-12 text-center">
                  <BarChart3 className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                  <p className="text-sm text-gray-500">
                    هیچ تراکنشی در این دوره ثبت نشده است
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cashiers.map((cashier, index) => (
                    <div
                      key={cashier.cashierId}
                      className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50"
                    >
                      <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
                            {index + 1}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">
                              {cashier.cashierName}
                            </p>
                            <p
                              className="text-[10px] text-gray-500"
                              dir="ltr"
                            >
                              {cashier.cashierMobile || '—'}
                            </p>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="text-[9px] text-gray-500">
                            تعداد تراکنش‌ها
                          </p>
                          <p className="text-lg font-black text-blue-600">
                            {toFaNum(cashier.transactionCount)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
                        <div className="rounded-lg bg-emerald-50 p-2 text-center">
                          <TrendingUp className="mx-auto mb-1 h-4 w-4 text-emerald-600" />
                          <p className="text-[9px] text-emerald-700">فروش</p>
                          <p
                            className="text-xs font-bold text-emerald-800"
                            dir="ltr"
                          >
                            {formatPrice(cashier.totalSales)}
                          </p>
                        </div>

                        <div className="rounded-lg bg-red-50 p-2 text-center">
                          <TrendingDown className="mx-auto mb-1 h-4 w-4 text-red-600" />
                          <p className="text-[9px] text-red-700">برداشت</p>
                          <p
                            className="text-xs font-bold text-red-800"
                            dir="ltr"
                          >
                            {formatPrice(cashier.totalWithdrawals)}
                          </p>
                        </div>

                        <div className="rounded-lg bg-blue-50 p-2 text-center">
                          <Receipt className="mx-auto mb-1 h-4 w-4 text-blue-600" />
                          <p className="text-[9px] text-blue-700">خدمات</p>
                          <p
                            className="text-xs font-bold text-blue-800"
                            dir="ltr"
                          >
                            {formatPrice(cashier.totalServices)}
                          </p>
                        </div>

                        <div className="rounded-lg bg-purple-50 p-2 text-center">
                          <Wallet className="mx-auto mb-1 h-4 w-4 text-purple-600" />
                          <p className="text-[9px] text-purple-700">
                            ورودی کل
                          </p>
                          <p
                            className="text-xs font-bold text-purple-800"
                            dir="ltr"
                          >
                            {formatPrice(cashier.totalCashIn)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}