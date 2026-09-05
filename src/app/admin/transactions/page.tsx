'use client';

import { useEffect, useState } from 'react';
import {
  Wallet, CreditCard, DollarSign, RefreshCw, Calendar, Clock,
  Search, Download, ChevronDown, Filter, TrendingUp, CheckCircle2,
  XCircle, Clock3, Banknote, Store, X,
  Activity, Zap, Shield, ChevronRight, ChevronLeft,
  Award
} from 'lucide-react';

// ★ تابع کمکی برای تبدیل اعداد به فارسی
const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰';
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

// ★ فرمت عدد با جداکننده هزارگان فارسی
const formatNumberFa = (num: number | string | null | undefined): string => {
  const n = typeof num === 'string' ? parseInt(num, 10) || 0 : (num || 0);
  return toFaNum(n.toLocaleString('en-US'));
};

// ★ تاریخ شمسی دقیق
const getPersianDate = (): string => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('fa-IR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const year = parts.find(p => p.type === 'year')?.value || '';
  return `${toFaNum(weekday)} ${toFaNum(day)} ${toFaNum(month)} ${toFaNum(year)}`;
};

const getPersianTime = (): string => {
  const now = new Date();
  const hh = toFaNum(String(now.getHours()).padStart(2, '0'));
  const mm = toFaNum(String(now.getMinutes()).padStart(2, '0'));
  return `${hh}:${mm}`;
};

const formatPersianDateTime = (isoDate: string | Date | null | undefined): { date: string; time: string } => {
  if (!isoDate) return { date: '—', time: '—' };
  try {
    const d = new Date(isoDate);
    const date = d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
    const time = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    return { date: toFaNum(date), time: toFaNum(time) };
  } catch {
    return { date: '—', time: '—' };
  }
};

// ★ v11.3: پلن‌ها (پایه، پیشرفته، حرفه‌ای)
const getPlanInfo = (planName: string): { label: string; icon: string; color: string; bg: string; border: string } => {
  const p = (planName || '').toLowerCase();
  if (p.includes('enterprise') || p.includes('حرفه') || p.includes('سازمانی')) return {
    label: 'حرفه‌ای', icon: '🥇', color: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-200'
  };
  if (p.includes('professional') || p.includes('پیشرفته')) return {
    label: 'پیشرفته', icon: '🥈', color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-200'
  };
  return {
    label: 'پایه', icon: '🥉', color: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200'
  };
};

// ★ وضعیت تراکنش
const getStatusInfo = (t: any): { label: string; color: string; bg: string; border: string; icon: any } => {
  if (t.isPaid) return {
    label: 'موفق', color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200', icon: CheckCircle2
  };
  if (t.status === 'failed') return {
    label: 'ناموفق', color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-200', icon: XCircle
  };
  if (t.status === 'cancelled') return {
    label: 'لغو شده', color: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200', icon: XCircle
  };
  return {
    label: 'در انتظار', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200', icon: Clock3
  };
};

// ★ تشخیص درگاه پرداخت
const getGatewayInfo = (gateway: string, method: string): { label: string; icon: any; color: string; bg: string } => {
  const g = (gateway || '').toLowerCase();
  const m = (method || '').toLowerCase();

  if (g === 'zarinpal' || m.includes('zarinpal')) {
    return { label: 'زرین‌پال', icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-50' };
  }
  if (g === 'idpay' || m.includes('idpay')) {
    return { label: 'آی‌دی‌پی', icon: CreditCard, color: 'text-purple-600', bg: 'bg-purple-50' };
  }
  if (m.includes('wallet') || m.includes('کیف پول')) {
    return { label: 'کیف پول', icon: Wallet, color: 'text-purple-600', bg: 'bg-purple-50' };
  }
  if (m.includes('transfer') || m.includes('حواله') || m.includes('bank')) {
    return { label: 'حواله بانکی', icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50' };
  }
  return { label: method || 'نامشخص', icon: CreditCard, color: 'text-gray-600', bg: 'bg-gray-50' };
};

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    totalRevenue: 0, monthlyRevenue: 0, todayRevenue: 0,
    todayCount: 0, totalCount: 0, avgTransaction: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1, pageSize: 20, totalCount: 0, totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [currentTime, setCurrentTime] = useState(getPersianTime());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getPersianTime()), 60000);
    return () => clearInterval(timer);
  }, []);

  // ★ v11.3: بارگذاری با پشتیبانی از صفحه‌بندی و فیلتر
  const loadData = async (pageNum = 1, size = pagination.pageSize) => {
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        pageSize: String(size),
      });

      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (planFilter !== 'all') params.set('plan', planFilter);
      if (timeFilter !== 'all') params.set('time', timeFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      const res = await fetch(`/api/admin/transactions?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setTransactions(data.data || []);
        if (data.pagination) setPagination(data.pagination);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('[Transactions] loadData error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData() }, []);

  // ★ v11.3: بارگذاری مجدد هنگام تغییر فیلترها (با ریست به صفحه ۱)
  useEffect(() => {
    if (!loading) loadData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, planFilter, timeFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData(pagination.page);
  };

  const handleExportCSV = () => {
    // ★ v11.3: حذف ستون "دوره" از CSV
    const headers = [
      'فروشگاه', 'ساب‌دامین', 'موبایل', 'پلن',
      'مبلغ (تومان)', 'درگاه پرداخت', 'وضعیت', 'تاریخ', 'کد پیگیری زرین‌پال'
    ];
    const rows = transactions.map(t => [
      t.tenantName || '',
      t.tenantSubdomain || '',
      t.tenantMobile || '',
      getPlanInfo(t.tierName).label,
      Number(t.amount) || 0,
      getGatewayInfo(t.gateway, t.paymentMethod).label,
      getStatusInfo(t).label,
      formatPersianDateTime(t.paidAt || t.createdAt).date,
      t.paymentRef || ''
    ]);

    const csv = [headers, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ★ کارت‌های آماری اصلی
  const mainStatCards = [
    {
      title: 'درآمد کل',
      value: stats.totalRevenue,
      icon: DollarSign,
      gradient: 'from-emerald-500 to-teal-600',
      subtitle: 'مجموع همه پرداخت‌های موفق',
    },
    {
      title: 'درآمد ماه جاری',
      value: stats.monthlyRevenue,
      icon: TrendingUp,
      gradient: 'from-blue-500 to-indigo-600',
      subtitle: 'پرداخت‌های این ماه',
    },
    {
      title: 'درآمد امروز',
      value: stats.todayRevenue,
      icon: Zap,
      gradient: 'from-amber-500 to-orange-500',
      subtitle: `${toFaNum(stats.todayCount)} تراکنش امروز`,
    },
    {
      title: 'تراکنش‌های موفق',
      value: stats.totalCount,
      icon: CheckCircle2,
      gradient: 'from-emerald-500 to-green-600',
      subtitle: 'تعداد کل پرداخت‌های موفق',
      isCount: true,
    },
    {
      title: 'میانگین هر تراکنش',
      value: stats.avgTransaction,
      icon: Activity,
      gradient: 'from-purple-500 to-pink-500',
      subtitle: 'میانگین مبلغ پرداختی',
    },
  ];

  // ★ v11.3: محاسبه startIndex و endIndex
  const startIndex = (pagination.page - 1) * pagination.pageSize;
  const endIndex = Math.min(startIndex + pagination.pageSize, pagination.totalCount);

  // ★ تولید شماره صفحات
  const getPageNumbers = () => {
    const { totalPages, page } = pagination;
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');

      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);

      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50/30">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-emerald-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Wallet className="w-8 h-8 text-emerald-500" />
            </div>
          </div>
          <h3 className="text-base font-bold text-gray-700 mb-1">در حال بارگذاری تراکنش‌ها...</h3>
          <p className="text-xs text-gray-500">لطفاً چند لحظه صبر کنید</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 p-4 sm:p-6" dir="rtl">
      <div className="max-w-[1600px] mx-auto space-y-5">

        {/* ═══════════════════════ هدر ═══════════════════════ */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">
                تراکنش‌های <span className="bg-gradient-to-l from-emerald-600 to-teal-600 bg-clip-text text-transparent">مالی</span>
              </h1>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <Calendar className="w-3 h-3" />
                {getPersianDate()}
                <span className="text-gray-300">•</span>
                <Clock className="w-3 h-3" />
                {currentTime}
                <span className="text-gray-300">•</span>
                <span className="text-gray-600">{toFaNum(pagination.totalCount)} تراکنش</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all text-xs font-medium shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              خروجی CSV
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all text-xs font-medium shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'در حال...' : 'به‌روزرسانی'}
            </button>
          </div>
        </div>

        {/* ═══════════════════════ کارت‌های آماری ═══════════════════════ */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {mainStatCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className="group relative bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 overflow-hidden"
              >
                <div className={`h-1 bg-gradient-to-l ${card.gradient}`}></div>
                <div className="p-3.5">
                  <div className="flex items-start justify-between mb-2">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-4.5 h-4.5 text-white" style={{ width: '18px', height: '18px' }} />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-gray-500 font-medium leading-tight">{card.title}</p>
                    <div className="flex items-baseline gap-1">
                      <p className="text-base sm:text-lg font-black text-gray-900 tracking-tight" dir="ltr">
                        {formatNumberFa(card.value)}
                      </p>
                      {!card.isCount && (
                        <span className="text-[9px] text-gray-400 font-medium">تومان</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 leading-tight">{card.subtitle}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══════════════════════ فیلترها (★ v11.3: بدون فیلتر دوره) ═══════════════════════ */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="جستجوی فروشگاه، ساب‌دامین، موبایل یا کد پیگیری..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadData(1)}
                className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-sm bg-gray-50/50 focus:bg-white"
              />
              {searchTerm && (
                <button
                  onClick={() => { setSearchTerm(''); setTimeout(() => loadData(1), 100); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="relative shrink-0">
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full md:w-40 pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-sm bg-gray-50/50 focus:bg-white appearance-none cursor-pointer"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="paid">✅ موفق</option>
                <option value="pending">⏳ در انتظار</option>
                <option value="failed">❌ ناموفق</option>
                <option value="cancelled">🚫 لغو شده</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative shrink-0">
              <Store className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="w-full md:w-40 pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-sm bg-gray-50/50 focus:bg-white appearance-none cursor-pointer"
              >
                <option value="all">همه پلن‌ها</option>
                <option value="simple">🥉 پایه</option>
                <option value="professional">🥈 پیشرفته</option>
                <option value="enterprise">🥇 حرفه‌ای</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative shrink-0">
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="w-full md:w-40 pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-sm bg-gray-50/50 focus:bg-white appearance-none cursor-pointer"
              >
                <option value="all">همه زمان‌ها</option>
                <option value="today">امروز</option>
                <option value="week">هفته اخیر</option>
                <option value="month">ماه اخیر</option>
                <option value="year">سال اخیر</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {(searchTerm || statusFilter !== 'all' || planFilter !== 'all' || timeFilter !== 'all') && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-[11px] text-gray-600">
                  <span className="font-bold text-emerald-600">{toFaNum(pagination.totalCount)}</span> تراکنش یافت شد
                </p>
                <div className="h-3 w-px bg-gray-200"></div>
                <p className="text-[11px] text-gray-600">
                  مجموع این صفحه: <span className="font-bold text-gray-900" dir="ltr">
                    {formatNumberFa(transactions.filter(t => t.isPaid).reduce((s, t) => s + (t.amount || 0), 0))}
                  </span> تومان
                </p>
              </div>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setPlanFilter('all');
                  setTimeFilter('all');
                }}
                className="text-[10px] font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                پاک کردن فیلترها
              </button>
            </div>
          )}
        </div>

        {/* ═══════════════════════ جدول تراکنش‌ها ═══════════════════════ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-gradient-to-l from-slate-50 to-emerald-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700">فروشگاه</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden md:table-cell">پلن</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700">مبلغ</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden lg:table-cell">درگاه</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700">وضعیت</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden xl:table-cell">تاریخ</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden 2xl:table-cell">کد پیگیری</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map(t => {
                  const plan = getPlanInfo(t.tierName || '');
                  const status = getStatusInfo(t);
                  const gateway = getGatewayInfo(t.gateway, t.paymentMethod);
                  const StatusIcon = status.icon;
                  const GatewayIcon = gateway.icon;
                  const { date, time } = formatPersianDateTime(t.paidAt || t.createdAt);

                  return (
                    <tr key={t.id} className="hover:bg-gray-50/70 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${
                            t.isPaid ? 'from-emerald-500 to-teal-600' :
                            t.status === 'failed' ? 'from-red-500 to-rose-600' :
                            'from-amber-500 to-orange-500'
                          } flex items-center justify-center text-white font-bold text-xs shrink-0`}>
                            {(t.tenantName || 'ف')[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{t.tenantName || 'بدون نام'}</p>
                            <p className="text-[10px] text-gray-500 font-mono truncate">{t.tenantSubdomain || '—'}</p>
                            {t.tenantMobile && (
                              <p className="text-[9px] text-gray-400 font-mono truncate" dir="ltr">{t.tenantMobile}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* ★ v11.3: ستون فقط پلن (بدون دوره) */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border w-fit ${plan.bg} ${plan.color} ${plan.border}`}>
                          <span className="text-xs">{plan.icon}</span>
                          {plan.label}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-gray-900" dir="ltr">
                            {formatNumberFa(t.amount)}
                          </span>
                          <span className="text-[9px] text-gray-400">تومان</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${gateway.bg}`}>
                          <GatewayIcon className={`w-3.5 h-3.5 ${gateway.color}`} />
                          <span className={`text-[11px] font-medium ${gateway.color}`}>{gateway.label}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border ${status.bg} ${status.color} ${status.border}`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                      </td>

                      <td className="px-4 py-3 hidden xl:table-cell">
                        <div className="flex flex-col">
                          <span className="text-[11px] text-gray-700 font-medium">{date}</span>
                          <span className="text-[9px] text-gray-400">{time}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 hidden 2xl:table-cell">
                        {t.paymentRef && t.isPaid ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-mono bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                            <Shield className="w-3 h-3" />
                            {t.paymentRef}
                          </span>
                        ) : t.paymentRef ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
                            <Clock3 className="w-3 h-3" />
                            {t.paymentRef.substring(0, 12)}...
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ═══════════════════════ صفحه‌بندی ═══════════════════════ */}
          {pagination.totalCount > 0 && (
            <div className="px-4 py-4 bg-gradient-to-l from-slate-50 to-emerald-50/50 border-t border-gray-100">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-gray-600">
                    نمایش <span className="font-bold text-emerald-600">{toFaNum(startIndex + 1)}</span> تا{' '}
                    <span className="font-bold text-emerald-600">{toFaNum(endIndex)}</span> از{' '}
                    <span className="font-bold">{toFaNum(pagination.totalCount)}</span> تراکنش
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">تعداد در هر صفحه:</span>
                    <select
                      value={pagination.pageSize}
                      onChange={(e) => {
                        const newSize = Number(e.target.value);
                        setPagination(p => ({ ...p, pageSize: newSize }));
                        loadData(1, newSize);
                      }}
                      className="px-2 py-1 border border-gray-200 rounded-md text-xs font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition bg-white cursor-pointer"
                    >
                      <option value={10}>۱۰</option>
                      <option value={20}>۲۰</option>
                      <option value={30}>۳۰</option>
                      <option value={50}>۵۰</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => loadData(Math.max(1, pagination.page - 1))}
                    disabled={pagination.page === 1}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    title="صفحه قبل"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </button>

                  <div className="flex items-center gap-1">
                    {getPageNumbers().map((page, idx) => {
                      if (page === '...') {
                        return (
                          <span key={`ellipsis-${idx}`} className="px-2 text-gray-400 text-xs">
                            ...
                          </span>
                        );
                      }
                      const pageNum = page as number;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => loadData(pageNum)}
                          className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold transition-all ${
                            pagination.page === pageNum
                              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                              : 'border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                          }`}
                        >
                          {toFaNum(pageNum)}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => loadData(Math.min(pagination.totalPages, pagination.page + 1))}
                    disabled={pagination.page === pagination.totalPages}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    title="صفحه بعد"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {transactions.length === 0 && (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Wallet className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-gray-700 text-sm font-bold mb-1">
                {searchTerm || statusFilter !== 'all' || planFilter !== 'all' || timeFilter !== 'all'
                  ? 'تراکنشی با این فیلترها یافت نشد'
                  : 'هنوز هیچ تراکنشی ثبت نشده است'}
              </p>
              <p className="text-gray-500 text-xs">
                {searchTerm || statusFilter !== 'all' || planFilter !== 'all' || timeFilter !== 'all'
                  ? 'لطفاً فیلترها را تغییر دهید یا پاک کنید'
                  : 'به محض اولین پرداخت از طریق درگاه زرین‌پال، تراکنش‌ها در اینجا نمایش داده می‌شوند'}
              </p>
            </div>
          )}
        </div>

        <div className="text-center text-[9px] text-gray-400 pt-3 border-t border-gray-100">
          <p>مدیریت تراکنش‌های مالی — نسخه {toFaNum('11.3.0')} — درگاه زرین‌پال</p>
        </div>

      </div>
    </div>
  );
}