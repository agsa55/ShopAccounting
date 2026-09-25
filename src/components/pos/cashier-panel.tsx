'use client';

// ============================================================================
// src/components/pos/cashier-panel.tsx — v12.2.1 ★★★
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

import { useEffect, useState, useCallback } from 'react';
import { 
  Wallet, TrendingUp, TrendingDown, PlusCircle, 
  BarChart3, Loader2, RefreshCw, X, CheckCircle2,
  AlertTriangle, ArrowDownCircle, ArrowUpCircle,
  Receipt, Calendar, RotateCcw
} from 'lucide-react';
import { logger } from '@/lib/system-logger'

// ═══════════════════════════════════════════════════════════════
// توابع کمکی
// ═══════════════════════════════════════════════════════════════
const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰';
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

const formatPrice = (num: number): string => {
  return toFaNum(Math.round(num).toLocaleString('en-US'));
};

// ═══════════════════════════════════════════════════════════════
// انواع تراکنش دستی
// ═══════════════════════════════════════════════════════════════
const TRANSACTION_TYPES = [
  { value: 'deposit', label: 'واریز پول', icon: '💰', direction: 'in', description: 'ورود پول به صندوق', color: 'emerald' },
  { value: 'withdrawal', label: 'برداشت پول', icon: '💸', direction: 'out', description: 'خروج پول از صندوق', color: 'red' },
  { value: 'expense', label: 'هزینه متفرقه', icon: '🧾', direction: 'out', description: 'هزینه‌های جاری فروشگاه', color: 'orange' },
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
  // ★ v11.9.8: دریافت netSales و returns از API
  // ═══════════════════════════════════════════════════════════════
  const loadSummary = useCallback(async (isRefresh = false) => {
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
        
        // ★ v11.9.8: لاگ آمار برگشتی‌ها (اگر وجود داشته باشد)
        if (data.summary.returns > 0) {
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
  }, [currentUser?.id, currentTenantId]);

  useEffect(() => {
    loadSummary();
    // ★ v11.6.5: رفرش هر ۵ ثانیه
    const interval = setInterval(() => loadSummary(true), 5000);
    return () => clearInterval(interval);
  }, [loadSummary]);

  // ★ v11.6.5: رفرش خودکار هنگام focus شدن صفحه
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
      window.removeEventListener('visibilitychange', handleVisibilityChange);
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
        // ★ v11.9.0: لاگ ثبت تراکنش دستی
        logger.info('تراکنش دستی ثبت شد', {
          transactionType: transactionType,
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
  // محاسبات
  // ═══════════════════════════════════════════════════════════════
  // ★ v11.9.8: موجودی فعلی از API دریافت می‌شود
// ═══════════════════════════════════════════════════════════════
// محاسبات — v11.9.9 سازگارتر با fallback
// ═══════════════════════════════════════════════════════════════

  // ★ v12.2.1: موجودی فعلی از API دریافت می‌شود (با fallback به realCashBalance)
  const currentBalance = summary?.currentBalance || summary?.realCashBalance || 0;

  // ★ v11.9.9: fallback برای netSales — اگر نبود از totalSales استفاده کن
  const netSales = summary?.netSales !== undefined 
    ? summary.netSales 
    : (summary?.totalSales || 0);

  const returns = summary?.returns || 0;
  const returnsCount = summary?.returnsCount || 0;

  // ★ v12.2.1: سود
  const profitToday = Number(summary?.profitToday || 0);
  const profitTotal = Number(summary?.profitTotal || 0);

  // ★ v12.2.1: لاگ کامل برای دیباگ
  console.log('[CashierPanel] Summary received:', {
    hasNetSales: summary?.netSales !== undefined,
    netSales: summary?.netSales,
    totalSales: summary?.totalSales,
    returns: summary?.returns,
    returnsCount: summary?.returnsCount,
    cashSales: summary?.cashSales,
    creditSales: summary?.creditSales,
    installmentSales: summary?.installmentSales,
    installmentPrepaid: summary?.installmentPrepaid,
    installmentRemaining: summary?.installmentRemaining,
    checkSales: summary?.checkSales,
    currentBalance: summary?.currentBalance,
    realCashBalance: summary?.realCashBalance,
    profitToday: summary?.profitToday,
    profitTotal: summary?.profitTotal,
    revenueToday: summary?.revenueToday,
    cogsToday: summary?.cogsToday,
  });

  const selectedType = TRANSACTION_TYPES.find(t => t.value === transactionType);

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
      {/* ═══════════════════════ نوار وضعیت ═══════════════════════ */}
      <div className="bg-gradient-to-l from-emerald-50 via-teal-50 to-cyan-50 border-b border-emerald-100 px-2 sm:px-3 py-1.5 sm:py-2">
        {loadingSummary ? (
          <div className="flex items-center justify-center gap-2 py-1">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span className="text-xs text-emerald-700">در حال بارگذاری وضعیت صندوق...</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            
            {/* بخش راست: اطلاعات صندوق‌دار */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                {(currentUser.username || currentUser.storeName || 'ص')[0]}
              </div>
              
              <div className="hidden sm:block">
                <p className="text-[10px] text-emerald-700 font-medium">صندوق‌دار فعال</p>
                <p className="text-xs font-bold text-slate-800">{currentUser.username || currentUser.storeName || 'صندوق‌دار'}</p>
              </div>

              <div className="w-px h-6 bg-emerald-200"></div>

              {/* ═══ موجودی اولیه (از سند افتتاحیه) ═══ */}
              <div className="flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5 text-blue-500" />
                <div>
                  <p className="text-[9px] text-slate-500">موجودی اولیه</p>
                  <p className="text-[11px] font-bold text-blue-600" dir="ltr">
                    {formatPrice(summary?.openingBalance || 0)}
                  </p>
                </div>
              </div>

              {/* ═══ موجودی ابتدای امروز ═══ */}
              <div className="hidden sm:flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                <div>
                  <p className="text-[9px] text-slate-500">ابتدای امروز</p>
                  <p className="text-[11px] font-bold text-indigo-600" dir="ltr">
                    {formatPrice(summary?.startOfDayBalance || 0)}
                  </p>
                </div>
              </div>

              <div className="w-px h-6 bg-emerald-200"></div>

              {/* ═══ موجودی فعلی ═══ */}
              <div className="flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-emerald-600" />
                <div>
                  <p className="text-[9px] text-emerald-700 font-medium">موجودی فعلی</p>
                  <p className={`text-xs sm:text-sm font-black ${currentBalance >= 0 ? 'text-emerald-700' : 'text-red-600'}`} dir="ltr">
                    {formatPrice(currentBalance)}
                  </p>
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* بخش وسط: آمار فروش با تفکیک نوع — v12.2.1 */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <div className="hidden md:flex items-center gap-3">
              {/* ═══ خالص فروش (به جای کل فروش) ═══ */}
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                <div>
                  <p className="text-[9px] text-slate-500">خالص فروش</p>
                  <p className="text-[11px] font-bold text-emerald-700" dir="ltr">
                    {formatPrice(netSales)}
                  </p>
                </div>
              </div>

              {/* ═══ سود امروز و سود کل ═══ */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1">
                  <TrendingUp className={`w-3.5 h-3.5 ${profitToday >= 0 ? 'text-violet-600' : 'text-red-600'}`} />
                  <div>
                    <p className="text-[9px] text-slate-500">سود امروز</p>
                    <p className={`text-[11px] font-bold ${profitToday >= 0 ? 'text-violet-700' : 'text-red-600'}`} dir="ltr">
                      {formatPrice(profitToday)}
                    </p>
                  </div>
                </div>

                {profitTotal !== 0 && (
                  <div
                    className="flex items-center gap-1 cursor-help"
                    title="سود کل این صندوق‌دار از ابتدای کار"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${profitTotal >= 0 ? 'bg-violet-400' : 'bg-red-400'}`}></div>
                    <span className="text-[8px] text-slate-500">سود کل:</span>
                    <span className={`text-[9px] font-bold ${profitTotal >= 0 ? 'text-violet-600' : 'text-red-600'}`} dir="ltr">
                      {formatPrice(profitTotal)}
                    </span>
                  </div>
                )}
              </div>

              {/* ═══ برگشتی‌ها ═══ */}
              {returns > 0 && (
                <div className="flex items-center gap-1 bg-red-50 px-2 py-1 rounded-lg border border-red-200">
                  <RotateCcw className="w-3.5 h-3.5 text-red-500" />
                  <div>
                    <p className="text-[9px] text-red-700">
                      برگشتی
                      {returnsCount > 0 && (
                        <span className="text-[8px] text-red-500 mr-1">({toFaNum(returnsCount)})</span>
                      )}
                    </p>
                    <p className="text-[11px] font-bold text-red-600" dir="ltr">
                      {formatPrice(returns)}
                    </p>
                  </div>
                </div>
              )}

              {/* ═══ تفکیک بر اساس نوع پرداخت (v12.1.0 — با پیش‌پرداخت) ═══ */}
              <div className="flex items-center gap-1">
                <div className="flex flex-col gap-0.5">
                  {/* فروش نقدی — شامل پیش‌پرداخت اقساطی */}
                  <div 
                    className="flex items-center gap-1 cursor-help"
                    title={
                      (summary?.installmentPrepaid || 0) > 0
                        ? `شامل ${formatPrice(Number(summary?.installmentPrepaid || 0))} پیش‌پرداخت اقساطی`
                        : 'فروش نقدی'
                    }
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    <span className="text-[8px] text-slate-500">نقدی:</span>
                    <span className="text-[9px] font-bold text-emerald-600" dir="ltr">
                      {formatPrice(summary?.cashSales || 0)}
                    </span>
                  </div>
                  
                  {/* فروش نسیه */}
                  {(summary?.creditSales || 0) > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                      <span className="text-[8px] text-slate-500">نسیه:</span>
                      <span className="text-[9px] font-bold text-orange-600" dir="ltr">
                        {formatPrice(summary?.creditSales || 0)}
                      </span>
                    </div>
                  )}
                  
                  {/* فروش اقساطی — فقط بخش اقساط (بدون پیش‌پرداخت) */}
                  {((summary?.installmentRemaining || summary?.installmentSales) || 0) > 0 && (
                    <div 
                      className="flex items-center gap-1 cursor-help"
                      title={
                        (summary?.installmentPrepaid || 0) > 0
                          ? `پیش‌پرداخت ${formatPrice(Number(summary?.installmentPrepaid || 0))} در نقدی لحاظ شده`
                          : 'اقساط'
                      }
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                      <span className="text-[8px] text-slate-500">اقساطی:</span>
                      <span className="text-[9px] font-bold text-purple-600" dir="ltr">
                        {formatPrice(summary?.installmentRemaining || summary?.installmentSales || 0)}
                      </span>
                    </div>
                  )}
                  
                  {/* فروش چکی */}
                  {(summary?.checkSales || 0) > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-500"></div>
                      <span className="text-[8px] text-slate-500">چکی:</span>
                      <span className="text-[9px] font-bold text-cyan-600" dir="ltr">
                        {formatPrice(summary?.checkSales || 0)}
                      </span>
                    </div>
                  )}

                  {/* ★ v12.1.0: پیش‌پرداخت اقساطی (نمایش جداگانه) */}
                  {(summary?.installmentPrepaid || 0) > 0 && (
                    <div 
                      className="flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 cursor-help"
                      title="پیش‌پرداخت فروش اقساطی — در بخش نقدی لحاظ شده است"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 ring-2 ring-purple-300"></div>
                      <span className="text-[7px] text-emerald-700">پیش‌پرداخت:</span>
                      <span className="text-[8px] font-bold text-emerald-700" dir="ltr">
                        {formatPrice(summary?.installmentPrepaid || 0)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                <div>
                  <p className="text-[9px] text-slate-500">خرید</p>
                  <p className="text-[11px] font-bold text-red-600" dir="ltr">
                    {formatPrice(summary?.totalPurchases || 0)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <PlusCircle className="w-3.5 h-3.5 text-blue-500" />
                <div>
                  <p className="text-[9px] text-slate-500">خدمات</p>
                  <p className="text-[11px] font-bold text-blue-600" dir="ltr">
                    {formatPrice(summary?.totalServices || 0)}
                  </p>
                </div>
              </div>
            </div>

            {/* بخش چپ: دکمه‌ها */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowManualModal(true)}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 bg-white border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 hover:border-emerald-300 transition-all text-[10px] sm:text-xs font-bold shadow-sm"
                title="ثبت تراکنش دستی"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">تراکنش دستی</span>
              </button>

              <button
                onClick={() => setShowReportModal(true)}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all text-[10px] sm:text-xs font-bold shadow-sm"
                title="گزارش عملکرد"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">گزارش</span>
              </button>

              <button
                onClick={() => loadSummary(true)}
                disabled={refreshing}
                className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50"
                title="به‌روزرسانی"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════ مودال تراکنش دستی ═══════════════════════ */}
      {showManualModal && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowManualModal(false)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-l from-emerald-500 to-teal-600 px-4 py-3 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5" />
                  <h3 className="text-sm font-black">ثبت تراکنش دستی</h3>
                </div>
                <button
                  onClick={() => setShowManualModal(false)}
                  className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="text-[11px] font-bold text-gray-700 mb-2 block">
                  نوع تراکنش:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {TRANSACTION_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setTransactionType(type.value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
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
                      <span className={`text-[10px] font-bold ${
                        transactionType === type.value
                          ? type.color === 'emerald'
                            ? 'text-emerald-700'
                            : type.color === 'red'
                            ? 'text-red-700'
                            : 'text-orange-700'
                          : 'text-gray-600'
                      }`}>
                        {type.label}
                      </span>
                    </button>
                  ))}
                </div>
                {selectedType && (
                  <p className="text-[9px] text-gray-500 mt-1.5 flex items-center gap-1">
                    {selectedType.direction === 'in' ? (
                      <ArrowDownCircle className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <ArrowUpCircle className="w-3 h-3 text-red-500" />
                    )}
                    {selectedType.description}
                  </p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                  مبلغ (ریال): <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="مثلاً: 500000"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-sm"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
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
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-sm"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <p className="text-[11px] text-red-700">{error}</p>
                </div>
              )}
            </div>

            <div className="px-4 pb-4 flex items-center gap-2">
              <button
                onClick={() => setShowManualModal(false)}
                disabled={submitting}
                className="flex-1 px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-xs font-bold disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                onClick={handleSubmitManualTransaction}
                disabled={submitting}
                className="flex-1 px-3 py-2.5 bg-gradient-to-l from-emerald-500 to-teal-600 text-white rounded-lg hover:shadow-lg transition-all text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>در حال ثبت...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
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
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowReportModal(false)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-l from-blue-500 to-indigo-600 px-4 py-3 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  <h3 className="text-sm font-black">گزارش عملکرد صندوق‌داران</h3>
                </div>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <div className="flex items-center gap-1.5">
                {Object.entries(periodLabels).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setReportPeriod(key)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                      reportPeriod === key
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
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
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              ) : cashiers.length === 0 ? (
                <div className="text-center py-12">
                  <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">هیچ تراکنشی در این دوره ثبت نشده است</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cashiers.map((cashier, index) => (
                    <div
                      key={cashier.cashierId}
                      className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden"
                    >
                      <div className="px-4 py-3 bg-white border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                            {index + 1}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">
                              {cashier.cashierName}
                            </p>
                            <p className="text-[10px] text-gray-500" dir="ltr">
                              {cashier.cashierMobile || '—'}
                            </p>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="text-[9px] text-gray-500">تعداد تراکنش‌ها</p>
                          <p className="text-lg font-black text-blue-600">
                            {toFaNum(cashier.transactionCount)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3">
                        <div className="bg-emerald-50 rounded-lg p-2 text-center">
                          <TrendingUp className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                          <p className="text-[9px] text-emerald-700">فروش</p>
                          <p className="text-xs font-bold text-emerald-800" dir="ltr">
                            {formatPrice(cashier.totalSales)}
                          </p>
                        </div>

                        <div className="bg-red-50 rounded-lg p-2 text-center">
                          <TrendingDown className="w-4 h-4 text-red-600 mx-auto mb-1" />
                          <p className="text-[9px] text-red-700">برداشت</p>
                          <p className="text-xs font-bold text-red-800" dir="ltr">
                            {formatPrice(cashier.totalWithdrawals)}
                          </p>
                        </div>

                        <div className="bg-blue-50 rounded-lg p-2 text-center">
                          <Receipt className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                          <p className="text-[9px] text-blue-700">خدمات</p>
                          <p className="text-xs font-bold text-blue-800" dir="ltr">
                            {formatPrice(cashier.totalServices)}
                          </p>
                        </div>

                        <div className="bg-purple-50 rounded-lg p-2 text-center">
                          <Wallet className="w-4 h-4 text-purple-600 mx-auto mb-1" />
                          <p className="text-[9px] text-purple-700">ورودی کل</p>
                          <p className="text-xs font-bold text-purple-800" dir="ltr">
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