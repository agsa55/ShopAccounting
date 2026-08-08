'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Wallet, CreditCard, DollarSign, RefreshCw, Calendar, Clock,
  Search, Download, ChevronDown, Filter, TrendingUp, CheckCircle2,
  XCircle, Clock3, Banknote, Store, X, SlidersHorizontal,
  LayoutDashboard, ArrowUpRight, ArrowDownRight, AlertCircle,
  Activity, PieChart as PieIcon, Zap, Shield
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

const formatPersianDateTime = (isoDate: string): { date: string; time: string } => {
  try {
    const d = new Date(isoDate);
    const date = d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
    const time = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    return { date: toFaNum(date), time: toFaNum(time) };
  } catch {
    return { date: '—', time: '—' };
  }
};

// ★ تعیین پلن
const getPlanInfo = (planName: string): { label: string; icon: string; color: string; bg: string; border: string } => {
  const p = (planName || '').toLowerCase();
  if (p.includes('enterprise') || p.includes('سازمانی')) return {
    label: 'سازمانی', icon: '🥇', color: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-200'
  };
  if (p.includes('professional') || p.includes('حرفه') || p.includes('پیشرفته')) return {
    label: 'حرفه‌ای', icon: '🥈', color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-200'
  };
  if (p.includes('trial') || p.includes('تست') || p.includes('دمو')) return {
    label: 'آزمایشی', icon: '🎁', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200'
  };
  return {
    label: 'ساده', icon: '🥉', color: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200'
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
  return {
    label: 'در انتظار', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200', icon: Clock3
  };
};

// ★ روش پرداخت
const getPaymentMethodInfo = (method: string): { label: string; icon: any; color: string } => {
  const m = (method || '').toLowerCase();
  if (m.includes('card') || m.includes('کارت') || m.includes('online') || m.includes('آنلاین')) {
    return { label: 'کارت بانکی', icon: CreditCard, color: 'text-blue-600' };
  }
  if (m.includes('wallet') || m.includes('کیف پول')) {
    return { label: 'کیف پول', icon: Wallet, color: 'text-purple-600' };
  }
  if (m.includes('transfer') || m.includes('حواله') || m.includes('bank')) {
    return { label: 'حواله بانکی', icon: Banknote, color: 'text-emerald-600' };
  }
  return { label: method || 'نامشخص', icon: CreditCard, color: 'text-gray-600' };
};

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
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

  const loadData = async () => {
    try {
      const res = await fetch('/api/admin/transactions');
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data || []);
      }
    } catch (err) {
      console.error('[Transactions] loadData error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData() }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // ★ محاسبه آمار
  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const today = new Date().toDateString();

    const paidTransactions = transactions.filter(t => t.isPaid);
    const failedTransactions = transactions.filter(t => t.status === 'failed');
    const pendingTransactions = transactions.filter(t => !t.isPaid && t.status !== 'failed');

    const monthlyRevenue = paidTransactions.filter(t => {
      const d = new Date(t.paidAt || t.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const todayTransactions = transactions.filter(t => {
      const d = new Date(t.paidAt || t.createdAt);
      return d.toDateString() === today;
    });

    const todayRevenue = todayTransactions
      .filter(t => t.isPaid)
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const totalRevenue = paidTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const avgTransaction = paidTransactions.length > 0
      ? Math.round(totalRevenue / paidTransactions.length)
      : 0;

    return {
      totalRevenue,
      monthlyRevenue,
      todayRevenue,
      paidCount: paidTransactions.length,
      failedCount: failedTransactions.length,
      pendingCount: pendingTransactions.length,
      totalCount: transactions.length,
      avgTransaction,
      todayCount: todayTransactions.length,
    };
  }, [transactions]);

  // ★ فیلتر و جستجو
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    return transactions.filter(t => {
      const matchSearch = searchTerm === '' ||
        t.tenantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.tenantSubdomain?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.paymentRef?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus = statusFilter === 'all' ||
        (statusFilter === 'paid' && t.isPaid) ||
        (statusFilter === 'failed' && t.status === 'failed') ||
        (statusFilter === 'pending' && !t.isPaid && t.status !== 'failed');

      const matchPlan = planFilter === 'all' ||
        (t.planName || '').toLowerCase().includes(planFilter.toLowerCase());

      let matchTime = true;
      if (timeFilter !== 'all') {
        const tDate = new Date(t.paidAt || t.createdAt);
        const diffDays = Math.floor((now.getTime() - tDate.getTime()) / 86400000);
        if (timeFilter === 'today') matchTime = diffDays === 0;
        else if (timeFilter === 'week') matchTime = diffDays <= 7;
        else if (timeFilter === 'month') matchTime = diffDays <= 30;
        else if (timeFilter === 'year') matchTime = diffDays <= 365;
      }

      return matchSearch && matchStatus && matchPlan && matchTime;
    }).sort((a, b) => new Date(b.paidAt || b.createdAt).getTime() - new Date(a.paidAt || a.createdAt).getTime());
  }, [transactions, searchTerm, statusFilter, planFilter, timeFilter]);

  const filteredStats = useMemo(() => {
    const paid = filteredTransactions.filter(t => t.isPaid);
    return {
      totalRevenue: paid.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
      count: filteredTransactions.length,
    };
  }, [filteredTransactions]);

  const handleExportCSV = () => {
    const headers = ['فروشگاه', 'ساب‌دامین', 'پلن', 'مبلغ (ریال)', 'روش پرداخت', 'وضعیت', 'تاریخ', 'کد پیگیری'];
    const rows = filteredTransactions.map(t => [
      t.tenantName || '',
      t.tenantSubdomain || '',
      getPlanInfo(t.planName).label,
      Number(t.amount) || 0,
      getPaymentMethodInfo(t.paymentMethod).label,
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

  // ★ کارت‌های آماری اصلی - همه مبالغ به ریال
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
      value: stats.paidCount,
      icon: CheckCircle2,
      gradient: 'from-emerald-500 to-green-600',
      subtitle: `${toFaNum(Math.round((stats.paidCount / Math.max(stats.totalCount, 1)) * 100))}٪ از کل`,
      isCount: true,
    },
    {
      title: 'تراکنش‌های در انتظار',
      value: stats.pendingCount,
      icon: Clock3,
      gradient: 'from-amber-500 to-yellow-500',
      subtitle: 'در صف تأیید',
      isCount: true,
    },
    {
      title: 'تراکنش‌های ناموفق',
      value: stats.failedCount,
      icon: XCircle,
      gradient: 'from-red-500 to-rose-600',
      subtitle: 'رد شده یا لغو شده',
      isCount: true,
    },
  ];

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
                <span className="text-gray-600">{toFaNum(transactions.length)} تراکنش</span>
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

        {/* ═══════════════════════ کارت‌های آماری (همه مبالغ به ریال) ═══════════════════════ */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
                        <span className="text-[9px] text-gray-400 font-medium">ریال</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 leading-tight">{card.subtitle}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══════════════════════ میانگین و آمار فشرده (همه مبالغ به ریال) ═══════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="bg-gradient-to-l from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-purple-700 font-medium truncate">میانگین هر تراکنش</p>
              <p className="text-sm font-black text-purple-800" dir="ltr">
                {formatNumberFa(stats.avgTransaction)}
                <span className="text-[9px] text-purple-600 mr-1">ریال</span>
              </p>
            </div>
          </div>
          <div className="bg-gradient-to-l from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-emerald-700 font-medium truncate">نرخ موفقیت پرداخت</p>
              <p className="text-base font-black text-emerald-800" dir="ltr">
                {toFaNum(Math.round((stats.paidCount / Math.max(stats.totalCount, 1)) * 100))}٪
              </p>
            </div>
          </div>
          <div className="bg-gradient-to-l from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-blue-700 font-medium truncate">تراکنش‌های امروز</p>
              <p className="text-base font-black text-blue-800" dir="ltr">
                {formatNumberFa(stats.todayCount)}
                <span className="text-[9px] text-blue-600 mr-1">تراکنش</span>
              </p>
            </div>
          </div>
        </div>

        {/* ═══════════════════════ فیلترها ═══════════════════════ */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="جستجوی فروشگاه، ساب‌دامین یا کد پیگیری..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-sm bg-gray-50/50 focus:bg-white"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
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
                <option value="paid">موفق</option>
                <option value="pending">در انتظار</option>
                <option value="failed">ناموفق</option>
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
                <option value="trial">آزمایشی</option>
                <option value="basic">ساده</option>
                <option value="professional">حرفه‌ای</option>
                <option value="enterprise">سازمانی</option>
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
                  <span className="font-bold text-emerald-600">{toFaNum(filteredTransactions.length)}</span> تراکنش یافت شد
                </p>
                <div className="h-3 w-px bg-gray-200"></div>
                <p className="text-[11px] text-gray-600">
                  مجموع: <span className="font-bold text-gray-900" dir="ltr">{formatNumberFa(filteredStats.totalRevenue)}</span> ریال
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
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden sm:table-cell">پلن</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700">مبلغ</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden md:table-cell">روش پرداخت</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700">وضعیت</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden lg:table-cell">تاریخ</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden xl:table-cell">کد پیگیری</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTransactions.map(t => {
                  const plan = getPlanInfo(t.planName || '');
                  const status = getStatusInfo(t);
                  const payment = getPaymentMethodInfo(t.paymentMethod);
                  const StatusIcon = status.icon;
                  const PaymentIcon = payment.icon;
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
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border ${plan.bg} ${plan.color} ${plan.border}`}>
                          <span className="text-xs">{plan.icon}</span>
                          {plan.label}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-gray-900" dir="ltr">
                            {formatNumberFa(t.amount)}
                          </span>
                          <span className="text-[9px] text-gray-400">ریال</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                            <PaymentIcon className={`w-3.5 h-3.5 ${payment.color}`} />
                          </div>
                          <span className="text-[11px] text-gray-700 font-medium">{payment.label}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border ${status.bg} ${status.color} ${status.border}`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                      </td>

                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-col">
                          <span className="text-[11px] text-gray-700 font-medium">{date}</span>
                          <span className="text-[9px] text-gray-400">{time}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 hidden xl:table-cell">
                        {t.paymentRef ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-700 font-mono bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
                            <Shield className="w-3 h-3 text-gray-500" />
                            {t.paymentRef}
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

          {filteredTransactions.length > 0 && (
            <div className="px-4 py-3 bg-gradient-to-l from-slate-50 to-emerald-50/50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <p className="text-[11px] text-gray-600">
                مجموع {toFaNum(filteredTransactions.length)} تراکنش نمایش داده شده
              </p>
              <p className="text-[11px] text-gray-600">
                درآمد کل: <span className="font-black text-emerald-700" dir="ltr">{formatNumberFa(filteredStats.totalRevenue)}</span> ریال
              </p>
            </div>
          )}

          {filteredTransactions.length === 0 && (
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
                  : 'به محض اولین پرداخت، تراکنش‌ها در اینجا نمایش داده می‌شوند'}
              </p>
            </div>
          )}
        </div>

        <div className="text-center text-[9px] text-gray-400 pt-3 border-t border-gray-100">
          <p>مدیریت تراکنش‌های مالی — نسخه {toFaNum('10.0.0')}</p>
        </div>

      </div>
    </div>
  );
}