'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Store, Loader2, Phone, RefreshCw, Calendar, Clock,
  ArrowLeft, Filter, SlidersHorizontal, Crown, Star, Building2,
  CheckCircle2, XCircle, AlertTriangle, TrendingUp, Users,
  Eye, Settings, MoreVertical, Download, ChevronDown, Zap,
  LayoutDashboard, Activity
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

// ★ محاسبه روزهای باقی‌مانده
const getDaysRemaining = (expiryDate: string): number => {
  try {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
};

// ★ تعیین پلن بر اساس نام
const getPlanInfo = (planName: string): { label: string; color: string; bg: string; border: string; icon: any } => {
  const p = (planName || '').toLowerCase();
  if (p.includes('enterprise') || p.includes('سازمانی')) return {
    label: 'سازمانی', color: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-200', icon: '🥇'
  };
  if (p.includes('professional') || p.includes('حرفه') || p.includes('پیشرفته')) return {
    label: 'حرفه‌ای', color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-200', icon: '🥈'
  };
  if (p.includes('trial') || p.includes('تست') || p.includes('دمو')) return {
    label: 'آزمایشی', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200', icon: '🎁'
  };
  return {
    label: 'ساده', color: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200', icon: '🥉'
  };
};

// ★ وضعیت فروشگاه
const getStatusInfo = (status: string): { label: string; color: string; bg: string } => {
  if (status === 'active') return { label: 'فعال', color: 'text-emerald-700', bg: 'bg-emerald-100' };
  if (status === 'suspended' || status === 'expired') return { label: 'منقضی', color: 'text-red-700', bg: 'bg-red-100' };
  if (status === 'trial') return { label: 'آزمایشی', color: 'text-amber-700', bg: 'bg-amber-100' };
  return { label: 'نامشخص', color: 'text-gray-700', bg: 'bg-gray-100' };
};

export default function AdminTenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(getPersianTime());

  // ★ آپدیت ساعت هر دقیقه
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getPersianTime()), 60000);
    return () => clearInterval(timer);
  }, []);

  // ★ بارگذاری داده‌ها
  const loadData = async () => {
    try {
      const res = await fetch('/api/admin/tenants');
      const data = await res.json();
      if (data.success) setTenants(data.data || []);
    } catch (err) {
      console.error('[Tenants] loadData error:', err);
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

  // ★ فیلتر فروشگاه‌ها
  const filteredTenants = useMemo(() => {
    return tenants.filter(t => {
      // فیلتر جستجو
      const matchSearch = searchTerm === '' ||
        t.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.subDomain?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.ownerMobile?.includes(searchTerm) ||
        t.ownerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.email?.toLowerCase().includes(searchTerm.toLowerCase());

      // فیلتر پلن
      const matchPlan = planFilter === 'all' || t.planName === planFilter;

      // فیلتر وضعیت
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;

      return matchSearch && matchPlan && matchStatus;
    });
  }, [tenants, searchTerm, planFilter, statusFilter]);

  // ★ محاسبه آمار
  const stats = useMemo(() => {
    const trialCount = tenants.filter(t =>
      t.planName === 'trial' || t.status === 'trial'
    ).length;
    const basicCount = tenants.filter(t =>
      t.planName === 'simple' || t.planName === 'basic'
    ).length;
    const proCount = tenants.filter(t =>
      t.planName === 'professional'
    ).length;
    const enterpriseCount = tenants.filter(t =>
      t.planName === 'enterprise'
    ).length;
    const activeCount = tenants.filter(t => t.status === 'active').length;
    const expiringCount = tenants.filter(t => {
      const days = getDaysRemaining(t.subscriptionEnd || t.expiresAt || t.planEndDate || '');
      return days <= 7 && days > 0;
    }).length;

    return {
      total: tenants.length,
      active: activeCount,
      expiring: expiringCount,
      trial: trialCount,
      basic: basicCount,
      professional: proCount,
      enterprise: enterpriseCount,
    };
  }, [tenants]);

  // ★ ورود به پنل فروشگاه
  const handleImpersonate = async (tenantId: string, subDomain: string) => {
    setImpersonatingId(tenantId);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/impersonate`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        window.location.href = `/${subDomain}/dashboard`;
      } else {
        alert(data.error || 'خطا در ورود به پنل');
        setImpersonatingId(null);
      }
    } catch (error) {
      console.error('Impersonate failed:', error);
      alert('خطای شبکه. لطفاً دوباره تلاش کنید.');
      setImpersonatingId(null);
    }
  };

  // ★ خروجی CSV
  const handleExportCSV = () => {
    const headers = ['نام فروشگاه', 'ساب‌دامین', 'شماره تماس', 'پلن', 'وضعیت', 'روزهای باقی‌مانده'];
    const rows = filteredTenants.map(t => [
      t.companyName || '',
      t.subDomain || '',
      t.ownerMobile || '',
      getPlanInfo(t.planName).label,
      getStatusInfo(t.status).label,
      t.remainingDays || getDaysRemaining(t.subscriptionEnd || t.expiresAt || t.planEndDate || '')
    ]);

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tenants-${Date.now()}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-purple-50/30">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-purple-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-[#7C7BEB] animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Store className="w-8 h-8 text-[#7C7BEB]" />
            </div>
          </div>
          <h3 className="text-base font-bold text-gray-700 mb-1">در حال بارگذاری فروشگاه‌ها...</h3>
          <p className="text-xs text-gray-500">لطفاً چند لحظه صبر کنید</p>
        </div>
      </div>
    );
  }

  // ★ کارت‌های آماری
  const statCards = [
    {
      title: 'کل فروشگاه‌ها',
      value: stats.total,
      icon: Store,
      gradient: 'from-[#7C7BEB] to-[#5B5AC7]',
      subtitle: 'مجموع کل',
    },
    {
      title: 'فروشگاه‌های فعال',
      value: stats.active,
      icon: CheckCircle2,
      gradient: 'from-emerald-500 to-teal-600',
      subtitle: `${toFaNum(Math.round((stats.active / Math.max(stats.total, 1)) * 100))}٪ از کل`,
    },
    {
      title: 'انقضای نزدیک',
      value: stats.expiring,
      icon: AlertTriangle,
      gradient: stats.expiring > 0 ? 'from-orange-500 to-red-500' : 'from-gray-400 to-gray-500',
      subtitle: stats.expiring > 0 ? 'نیاز به پیگیری' : 'همه فعال',
    },
    {
      title: 'پلن سازمانی',
      value: stats.enterprise,
      icon: Crown,
      gradient: 'from-purple-500 to-pink-500',
      subtitle: 'برترین پلن',
    },
    {
      title: 'پلن حرفه‌ای',
      value: stats.professional,
      icon: Star,
      gradient: 'from-blue-500 to-indigo-600',
      subtitle: 'پلن پیشرفته',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 p-4 sm:p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ═══════════════════════ هدر ═══════════════════════ */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">
                مدیریت <span className="bg-gradient-to-l from-[#7C7BEB] to-[#5B5AC7] bg-clip-text text-transparent">فروشگاه‌ها</span>
              </h1>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <Calendar className="w-3 h-3" />
                {getPersianDate()}
                <span className="text-gray-300">•</span>
                <Clock className="w-3 h-3" />
                ساعت {currentTime}
                <span className="text-gray-300">•</span>
                <span className="text-gray-600">{toFaNum(filteredTenants.length)} فروشگاه</span>
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
          {statCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className="group relative bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300 overflow-hidden"
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
                    <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight" dir="ltr">
                      {formatNumberFa(card.value)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1 leading-tight">{card.subtitle}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══════════════════════ کارت‌های پلن ═══════════════════════ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center shrink-0 text-lg">🎁</div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-amber-700 font-medium truncate">آزمایشی</p>
              <p className="text-base font-black text-amber-800" dir="ltr">{formatNumberFa(stats.trial)}</p>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center shrink-0 text-lg">🥉</div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-gray-600 font-medium truncate">ساده</p>
              <p className="text-base font-black text-gray-800" dir="ltr">{formatNumberFa(stats.basic)}</p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center shrink-0 text-lg">🥈</div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-blue-700 font-medium truncate">حرفه‌ای</p>
              <p className="text-base font-black text-blue-800" dir="ltr">{formatNumberFa(stats.professional)}</p>
            </div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center shrink-0 text-lg">🥇</div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-purple-700 font-medium truncate">سازمانی</p>
              <p className="text-base font-black text-purple-800" dir="ltr">{formatNumberFa(stats.enterprise)}</p>
            </div>
          </div>
        </div>

        {/* ═══════════════════════ فیلترها ═══════════════════════ */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row gap-3">
            {/* جستجو */}
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="جستجو بر اساس نام، ساب‌دامین، شماره تماس یا ایمیل..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition text-sm bg-gray-50/50 focus:bg-white"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* فیلتر پلن */}
            <div className="relative">
              <SlidersHorizontal className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="w-full md:w-40 pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition text-sm bg-gray-50/50 focus:bg-white appearance-none cursor-pointer"
              >
                <option value="all">همه پلن‌ها</option>
                <option value="trial">آزمایشی</option>
                <option value="basic">ساده</option>
                <option value="simple">ساده</option>
                <option value="professional">حرفه‌ای</option>
                <option value="enterprise">سازمانی</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* فیلتر وضعیت */}
            <div className="relative">
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full md:w-40 pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition text-sm bg-gray-50/50 focus:bg-white appearance-none cursor-pointer"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="active">فعال</option>
                <option value="suspended">منقضی</option>
                <option value="trial">آزمایشی</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* شمارنده نتایج */}
          {(searchTerm || planFilter !== 'all' || statusFilter !== 'all') && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-[11px] text-gray-600">
                <span className="font-bold text-[#7C7BEB]">{toFaNum(filteredTenants.length)}</span> فروشگاه از مجموع{' '}
                <span className="font-bold">{toFaNum(tenants.length)}</span> فروشگاه یافت شد
              </p>
              <button
                onClick={() => { setSearchTerm(''); setPlanFilter('all'); setStatusFilter('all'); }}
                className="text-[10px] font-medium text-[#7C7BEB] hover:text-[#5B5AC7] flex items-center gap-1"
              >
                <XCircle className="w-3 h-3" />
                پاک کردن فیلترها
              </button>
            </div>
          )}
        </div>

        {/* ═══════════════════════ جدول فروشگاه‌ها ═══════════════════════ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-gradient-to-l from-slate-50 to-purple-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700">فروشگاه</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden sm:table-cell">ساب‌دامین</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden md:table-cell">تماس</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700">پلن</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700">وضعیت</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden lg:table-cell">زمان باقی‌مانده</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden xl:table-cell text-center">تیکت‌ها</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTenants.map((tenant: any) => {
                  const plan = getPlanInfo(tenant.planName || '');
                  const status = getStatusInfo(tenant.status || '');
                  const daysLeft = tenant.remainingDays !== undefined
                    ? tenant.remainingDays
                    : getDaysRemaining(tenant.subscriptionEnd || tenant.expiresAt || tenant.planEndDate || '');
                  const isImpersonating = impersonatingId === tenant.id;

                  return (
                    <tr key={tenant.id} className="hover:bg-gray-50/70 transition-colors group">
                      {/* نام فروشگاه + صاحب */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center text-white font-bold text-xs shrink-0">
                            {(tenant.companyName || tenant.name || 'ف')[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{tenant.companyName || 'بدون نام'}</p>
                            <p className="text-[10px] text-gray-500 truncate">
                              {tenant.ownerName || tenant.owner?.name || tenant.email || '—'}
                            </p>
                          </div>
                        </div>
                        {/* نمایش ساب‌دامین در موبایل */}
                        <p className="text-[10px] text-gray-400 sm:hidden font-mono mt-1 mr-11.5">{tenant.subDomain}</p>
                      </td>

                      {/* ساب‌دامین */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-[11px] text-gray-700 font-mono bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
                          {tenant.subDomain}
                        </span>
                      </td>

                      {/* شماره تماس */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-1.5 text-xs text-gray-700 font-mono" dir="ltr">
                          <Phone className="w-3 h-3 text-gray-400" />
                          {tenant.ownerMobile || '—'}
                        </div>
                      </td>

                      {/* پلن */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border ${plan.bg} ${plan.color} ${plan.border}`}>
                          <span className="text-xs">{plan.icon}</span>
                          {plan.label}
                        </span>
                      </td>

                      {/* وضعیت */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-md ${status.bg} ${status.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            tenant.status === 'active' ? 'bg-emerald-500' :
                            tenant.status === 'suspended' ? 'bg-red-500' : 'bg-amber-500'
                          }`}></span>
                          {status.label}
                        </span>
                      </td>

                      {/* زمان باقی‌مانده */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {tenant.remainingTimeText ? (
                          <span className={`text-xs font-bold ${
                            tenant.remainingTimeText === 'منقضی شده' ? 'text-red-600' :
                            tenant.remainingTimeText === 'مادام‌العمر' ? 'text-emerald-600' :
                            daysLeft <= 7 ? 'text-orange-600' : 'text-gray-700'
                          }`}>
                            {tenant.remainingTimeText}
                          </span>
                        ) : (
                          <span className={`text-xs font-bold ${
                            daysLeft <= 0 ? 'text-red-600' :
                            daysLeft <= 7 ? 'text-orange-600' : 'text-gray-700'
                          }`}>
                            {daysLeft <= 0 ? 'منقضی شده' : `${toFaNum(daysLeft)} روز`}
                          </span>
                        )}
                      </td>

                      {/* تعداد تیکت‌ها */}
                      <td className="px-4 py-3 hidden xl:table-cell text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-purple-50 text-purple-700 text-xs font-bold">
                          {toFaNum(tenant._count?.Tickets || 0)}
                        </span>
                      </td>

                      {/* دکمه عملیات */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleImpersonate(tenant.id, tenant.subDomain)}
                          disabled={isImpersonating}
                          className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all ${
                            isImpersonating
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'text-[#7C7BEB] hover:text-white bg-[#EEEDFD] hover:bg-[#7C7BEB] hover:shadow-md'
                          }`}
                        >
                          {isImpersonating ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>در حال...</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3" />
                              <span>ورود</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* خالی بودن لیست */}
          {filteredTenants.length === 0 && (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Store className="w-8 h-8 text-[#7C7BEB]" />
              </div>
              <p className="text-gray-700 text-sm font-bold mb-1">
                {searchTerm || planFilter !== 'all' || statusFilter !== 'all'
                  ? 'نتیجه‌ای برای فیلترهای شما یافت نشد'
                  : 'هنوز هیچ فروشگاهی ثبت‌نام نکرده است'}
              </p>
              <p className="text-gray-500 text-xs">
                {searchTerm || planFilter !== 'all' || statusFilter !== 'all'
                  ? 'لطفاً فیلترها را تغییر دهید یا پاک کنید'
                  : 'به محض ثبت‌نام اولین فروشگاه، در اینجا نمایش داده می‌شود'}
              </p>
            </div>
          )}
        </div>

        {/* ═══════════════════════ فوتر ═══════════════════════ */}
        <div className="text-center text-[9px] text-gray-400 pt-3 border-t border-gray-100">
          <p>مدیریت فروشگاه‌ها — نسخه {toFaNum('10.0.0')}</p>
        </div>

      </div>
    </div>
  );
}