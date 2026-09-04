'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Store, CheckCircle2, AlertTriangle, Ticket, ArrowLeft,
  Clock, Calendar, RefreshCw,
  ArrowUpRight, ArrowDownRight,
  LayoutDashboard, Building2, Crown, XCircle, PlusCircle,
  Zap, Activity, Rocket, BadgeCheck
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

// ★ محاسبه روزهای باقی‌مانده تا انقضا
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

// ★ تعیین پلن بر اساس نام (★ v11.2: پایه / پیشرفته / حرفه‌ای)
const getPlanBadge = (planName: string): { label: string; color: string; bg: string; icon: string } => {
  const p = (planName || '').toLowerCase();
  if (p.includes('enterprise') || p.includes('سازمانی') || p.includes('حرفه')) return {
    label: 'حرفه‌ای', color: 'text-purple-700', bg: 'bg-purple-100', icon: '🥇'
  };
  if (p.includes('professional') || p.includes('پیشرفته')) return {
    label: 'پیشرفته', color: 'text-blue-700', bg: 'bg-blue-100', icon: '🥈'
  };
  return {
    label: 'پایه', color: 'text-gray-700', bg: 'bg-gray-100', icon: '🥉'
  };
};

// ★ تعیین وضعیت بر اساس مدت استفاده (★ v11.2)
const getUsageStatus = (usageDays: number): { label: string; color: string; bg: string; icon: string } => {
  if (usageDays <= 90) {
    return { label: 'سه ماهه شروع', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: '🚀' };
  }
  return { label: 'به روز رسانی شده', color: 'text-blue-700', bg: 'bg-blue-100', icon: '✅' };
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    expiring: 0,
    tickets: 0,
    suspended: 0,
    trialPeriodUsers: 0,  // ★ v11.2: سه ماهه شروع
    renewedUsers: 0,       // ★ v11.2: به روز رسانی شده
    needsRenewal: 0,       // ★ v11.2: نیاز به به‌روزرسانی (بالای ۹۰ روز ولی تمدید نکرده)
    monthlyRevenue: 0,
    newThisMonth: 0,
    // ★ v11.2: آمار پلن‌ها
    basic: 0,
    professional: 0,
    enterprise: 0,
  });
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      if (data.success) {
        const tenantList: any[] = data.data || [];
        setTenants(tenantList);

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const activeTenants = tenantList.filter((t: any) => t.status === 'active');
        const expiringTenants = tenantList.filter((t: any) => {
          const days = getDaysRemaining(t.subscriptionEnd || t.expiresAt || t.planEndDate || '');
          return days <= 7 && days > 0;
        });
        const suspendedTenants = tenantList.filter((t: any) => t.status === 'suspended' || t.status === 'expired');
        
        // ★ v11.2: وضعیت بر اساس مدت استفاده
        const trialPeriodTenants = tenantList.filter((t: any) => (t.usageDays || 0) <= 90);
        const renewedTenants = tenantList.filter((t: any) => (t.usageDays || 0) > 90);
        
        // فروشگاه‌هایی که بالای ۹۰ روز هستند ولی هنوز وضعیت به‌روزرسانی ندارند (نیاز به پیگیری)
        const needsRenewalTenants = tenantList.filter((t: any) => {
          const days = t.usageDays || 0;
          return days > 90 && days <= 120; // ۹۰ تا ۱۲۰ روز — دوره بحرانی تمدید
        });
        
        const newThisMonth = tenantList.filter((t: any) => {
          const d = new Date(t.createdAt);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });

        // ★ v11.2: آمار پلن‌ها
        const basicCount = tenantList.filter(t => {
          const p = (t.planName || '').toLowerCase();
          return p.includes('simple') || p.includes('basic') || p.includes('پایه');
        }).length;
        const proCount = tenantList.filter(t => {
          const p = (t.planName || '').toLowerCase();
          return p.includes('professional') || p.includes('پیشرفته');
        }).length;
        const enterpriseCount = tenantList.filter(t => {
          const p = (t.planName || '').toLowerCase();
          return p.includes('enterprise') || p.includes('سازمانی') || p.includes('حرفه');
        }).length;

        setStats({
          total: tenantList.length,
          active: activeTenants.length,
          expiring: expiringTenants.length,
          tickets: tenantList.reduce((acc: number, t: any) => acc + (t._count?.Tickets || 0), 0),
          suspended: suspendedTenants.length,
          trialPeriodUsers: trialPeriodTenants.length,
          renewedUsers: renewedTenants.length,
          needsRenewal: needsRenewalTenants.length,
          monthlyRevenue: tenantList.reduce((acc: number, t: any) => acc + (Number(t.monthlyFee) || 0), 0),
          newThisMonth: newThisMonth.length,
          basic: basicCount,
          professional: proCount,
          enterprise: enterpriseCount,
        });
      }
    } catch (err) {
      console.error('[Dashboard] loadData error:', err);
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

  // ★ محاسبه درصد رشد
  const growthRate = useMemo(() => {
    if (stats.total === 0) return 0;
    return Math.round((stats.newThisMonth / Math.max(stats.total - stats.newThisMonth, 1)) * 100);
  }, [stats]);

  // ★ آخرین فروشگاه‌ها (۵ تای آخر)
  const recentTenants = useMemo(() => {
    return [...tenants]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [tenants]);

  // ★ فروشگاه‌هایی که انقضای نزدیک دارند (۵ تای اول)
  const expiringTenants = useMemo(() => {
    return tenants
      .map((t: any) => ({ ...t, daysRemaining: getDaysRemaining(t.subscriptionEnd || t.expiresAt || t.planEndDate || '') }))
      .filter((t: any) => t.daysRemaining <= 7 && t.daysRemaining > 0)
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 5);
  }, [tenants]);

  // ★ v11.2: فروشگاه‌هایی که نیاز به به‌روزرسانی دارند (۹۰-۱۲۰ روز)
  const needsRenewalTenants = useMemo(() => {
    return tenants
      .filter((t: any) => {
        const days = t.usageDays || 0;
        return days > 90 && days <= 120;
      })
      .sort((a, b) => (b.usageDays || 0) - (a.usageDays || 0))
      .slice(0, 6);
  }, [tenants]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-purple-50/30">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-purple-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-[#7C7BEB] animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <LayoutDashboard className="w-8 h-8 text-[#7C7BEB]" />
            </div>
          </div>
          <h3 className="text-base font-bold text-gray-700 mb-1">در حال بارگذاری داشبورد...</h3>
          <p className="text-xs text-gray-500">لطفاً چند لحظه صبر کنید</p>
        </div>
      </div>
    );
  }

  // ★ کارت‌های آماری اصلی
  const mainStatCards = [
    {
      title: 'کل فروشگاه‌ها',
      value: stats.total,
      icon: Store,
      gradient: 'from-blue-500 to-indigo-600',
      trend: growthRate,
      trendLabel: 'ماه جاری',
      subtitle: `${toFaNum(stats.newThisMonth)} فروشگاه جدید`,
    },
    {
      title: 'فروشگاه‌های فعال',
      value: stats.active,
      icon: CheckCircle2,
      gradient: 'from-emerald-500 to-teal-600',
      trend: Math.round((stats.active / Math.max(stats.total, 1)) * 100),
      trendLabel: 'از کل',
      subtitle: `${toFaNum(stats.active)} فعال از ${toFaNum(stats.total)}`,
    },
    {
      title: 'انقضای نزدیک (۷ روز)',
      value: stats.expiring,
      icon: AlertTriangle,
      gradient: stats.expiring > 0 ? 'from-orange-500 to-red-500' : 'from-gray-400 to-gray-500',
      trend: null,
      trendLabel: '',
      subtitle: stats.expiring > 0 ? 'نیاز به پیگیری' : 'همه فعال هستند',
    },
    {
      title: 'تیکت‌های پشتیبانی',
      value: stats.tickets,
      icon: Ticket,
      gradient: 'from-purple-500 to-pink-500',
      trend: null,
      trendLabel: '',
      subtitle: `${toFaNum(stats.suspended)} فروشگاه غیرفعال`,
    },
  ];

  // ★ v11.2: کارت‌های ثانویه (بدون آزمایشی، با وضعیت‌های جدید)
  const secondaryCards = [
    {
      title: 'سه ماهه شروع',
      value: stats.trialPeriodUsers,
      icon: Rocket,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      subtitle: 'در دوره رایگان',
    },
    {
      title: 'به روز رسانی شده',
      value: stats.renewedUsers,
      icon: BadgeCheck,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      subtitle: 'تمدید کرده‌اند',
    },
    {
      title: 'ثبت‌نام‌های ماه جاری',
      value: stats.newThisMonth,
      icon: PlusCircle,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
      subtitle: 'کاربران جدید',
    },
  ];

  // ★ v11.2: کارت‌های پلن
  const planCards = [
    {
      title: 'پلن پایه',
      value: stats.basic,
      icon: '🥉',
      color: 'text-gray-700',
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      percent: Math.round((stats.basic / Math.max(stats.total, 1)) * 100),
    },
    {
      title: 'پلن پیشرفته',
      value: stats.professional,
      icon: '🥈',
      color: 'text-blue-700',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      percent: Math.round((stats.professional / Math.max(stats.total, 1)) * 100),
    },
    {
      title: 'پلن حرفه‌ای',
      value: stats.enterprise,
      icon: '🥇',
      color: 'text-purple-700',
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      percent: Math.round((stats.enterprise / Math.max(stats.total, 1)) * 100),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 p-4 sm:p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ═══════════════════════ هدر ═══════════════════════ */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center shadow-lg shadow-purple-500/20">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">
                سلام، <span className="bg-gradient-to-l from-[#7C7BEB] to-[#5B5AC7] bg-clip-text text-transparent">مدیر سیستم</span> 👋
              </h1>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <Calendar className="w-3 h-3" />
                {getPersianDate()}
                <span className="text-gray-300">•</span>
                <Clock className="w-3 h-3" />
                ساعت {currentTime}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all text-xs font-medium shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'در حال به‌روزرسانی...' : 'به‌روزرسانی'}
            </button>
            <div className="px-3 py-2 bg-white rounded-xl border border-gray-200 shadow-sm flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-medium text-gray-700">سیستم آنلاین</span>
            </div>
          </div>
        </div>

        {/* ═══════════════════════ کارت‌های اصلی ═══════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {mainStatCards.map((card, idx) => {
            const Icon = card.icon;
            const isPositive = card.trend !== null && card.trend >= 0;
            return (
              <div
                key={idx}
                className="group relative bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300 overflow-hidden"
              >
                <div className={`h-1 bg-gradient-to-l ${card.gradient}`}></div>

                <div className="p-3.5">
                  <div className="flex items-start justify-between mb-2.5">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-4.5 h-4.5 text-white" style={{ width: '18px', height: '18px' }} />
                    </div>
                    {card.trend !== null && (
                      <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {isPositive ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                        {toFaNum(Math.abs(card.trend))}٪
                      </div>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-[10px] text-gray-500 font-medium leading-tight">{card.title}</p>
                    <div className="flex items-baseline gap-1.5">
                      <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight" dir="ltr">
                        {formatNumberFa(card.value)}
                      </p>
                      {card.trend !== null && (
                        <span className="text-[9px] text-gray-400 font-medium">{card.trendLabel}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 leading-tight">{card.subtitle}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══════════════════════ کارت‌های ثانویه (★ v11.2) ═══════════════════════ */}
        <div className="grid grid-cols-3 gap-2.5">
          {secondaryCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div key={idx} className={`${card.bg} ${card.border} border rounded-lg p-3 flex items-center gap-2.5 hover:shadow-md transition-all`}>
                <div className={`w-8 h-8 rounded-lg bg-white/80 ${card.color} flex items-center justify-center shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-600 font-medium truncate leading-tight">{card.title}</p>
                  <p className="text-base sm:text-lg font-black text-gray-900 leading-tight" dir="ltr">{formatNumberFa(card.value)}</p>
                  <p className="text-[9px] text-gray-500 truncate">{card.subtitle}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══════════════════════ کارت‌های پلن (★ v11.2) ═══════════════════════ */}
        <div className="grid grid-cols-3 gap-2.5">
          {planCards.map((card, idx) => (
            <div key={idx} className={`${card.bg} ${card.border} border rounded-lg p-3 hover:shadow-md transition-all`}>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center shrink-0 text-lg">
                  {card.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-600 font-medium truncate leading-tight">{card.title}</p>
                  <p className="text-base sm:text-lg font-black text-gray-900 leading-tight" dir="ltr">{formatNumberFa(card.value)}</p>
                </div>
              </div>
              <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    card.border.replace('border-', 'bg-')
                  }`}
                  style={{ width: `${card.percent}%` }}
                ></div>
              </div>
              <p className="text-[9px] text-gray-500 mt-1.5 text-left" dir="ltr">
                {toFaNum(card.percent)}٪ از کل
              </p>
            </div>
          ))}
        </div>

        {/* ═══════════════════════ بخش‌های اصلی ═══════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* آخرین فروشگاه‌ها */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">آخرین فروشگاه‌های ثبت شده</h3>
                  <p className="text-[9px] text-gray-500">{toFaNum(recentTenants.length)} فروشگاه اخیر</p>
                </div>
              </div>
              <Link
                href="/admin/tenants"
                className="text-[10px] font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                مشاهده همه
                <ArrowLeft className="w-3 h-3" />
              </Link>
            </div>

            <div className="divide-y divide-gray-50">
              {recentTenants.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-xs">
                  <Store className="w-7 h-7 mx-auto mb-2 text-gray-300" />
                  <p>هنوز فروشگاهی ثبت نشده است</p>
                </div>
              ) : (
                recentTenants.map((tenant: any, idx: number) => {
                  const plan = getPlanBadge(tenant.planName || '');
                  const usageDays = tenant.usageDays || 0;
                  const usageStatus = getUsageStatus(usageDays);
                  return (
                    <div key={tenant.id || idx} className="p-3 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0`}>
                          {(tenant.companyName || tenant.name || 'ف')[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-xs font-bold text-gray-900 truncate">
                              {tenant.companyName || tenant.name || 'فروشگاه'}
                            </p>
                            <span className={`w-1.5 h-1.5 rounded-full ${usageDays <= 90 ? 'bg-emerald-500' : 'bg-blue-500'} shrink-0`}></span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[8px] px-1.5 py-0.5 rounded ${plan.bg} ${plan.color} font-bold`}>
                              {plan.icon} {plan.label}
                            </span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded ${usageStatus.bg} ${usageStatus.color} font-bold`}>
                              {usageStatus.icon} {usageStatus.label}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-500 truncate mt-0.5">
                            {tenant.ownerName || tenant.owner?.name || tenant.email || 'بدون اطلاعات'}
                          </p>
                        </div>
                        <div className="text-left shrink-0">
                          <p className="text-[9px] text-gray-400">
                            {toFaNum(usageDays)} روز
                          </p>
                          <p className={`text-[9px] font-bold ${usageDays <= 90 ? 'text-emerald-600' : 'text-blue-600'}`}>
                            {usageStatus.label}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* آمار عملکرد سیستم (★ v11.2) */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">آمار عملکرد سیستم</h3>
                  <p className="text-[9px] text-gray-500">شاخص‌های کلیدی سلامت</p>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* نرخ فعال بودن */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[11px] font-medium text-gray-700">نرخ فعال بودن</span>
                  </div>
                  <span className="text-sm font-black text-emerald-700" dir="ltr">
                    {toFaNum(Math.round((stats.active / Math.max(stats.total, 1)) * 100))}٪
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-emerald-500 to-teal-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.round((stats.active / Math.max(stats.total, 1)) * 100)}%` }}
                  ></div>
                </div>
                <p className="text-[9px] text-gray-500 mt-1.5">
                  {toFaNum(stats.active)} فروشگاه فعال از {toFaNum(stats.total)} فروشگاه کل
                </p>
              </div>

              {/* نرخ تمدید (★ v11.2: جایگزین نرخ رشد) */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-1.5">
                    <BadgeCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-[11px] font-medium text-gray-700">نرخ تمدید</span>
                  </div>
                  <span className="text-sm font-black text-blue-700" dir="ltr">
                    {toFaNum(Math.round((stats.renewedUsers / Math.max(stats.total, 1)) * 100))}٪
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-l from-blue-500 to-indigo-500 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.min(Math.round((stats.renewedUsers / Math.max(stats.total, 1)) * 100), 100)}%` }}
                  ></div>
                </div>
                <p className="text-[9px] text-gray-500 mt-1.5">
                  {toFaNum(stats.renewedUsers)} فروشگاه تمدید کرده‌اند
                </p>
              </div>

              {/* خلاصه آمار (★ v11.2: بدون آزمایشی) */}
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100">
                <div className="bg-emerald-50/50 rounded-lg p-2.5 border border-emerald-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded bg-emerald-100 flex items-center justify-center">
                      <Rocket className="w-3 h-3 text-emerald-600" />
                    </div>
                    <span className="text-[9px] font-medium text-emerald-700">سه ماهه شروع</span>
                  </div>
                  <p className="text-base font-black text-emerald-700" dir="ltr">{formatNumberFa(stats.trialPeriodUsers)}</p>
                </div>
                <div className="bg-blue-50/50 rounded-lg p-2.5 border border-blue-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center">
                      <BadgeCheck className="w-3 h-3 text-blue-600" />
                    </div>
                    <span className="text-[9px] font-medium text-blue-700">به‌روز شده</span>
                  </div>
                  <p className="text-base font-black text-blue-700" dir="ltr">{formatNumberFa(stats.renewedUsers)}</p>
                </div>
                <div className="bg-amber-50/50 rounded-lg p-2.5 border border-amber-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded bg-amber-100 flex items-center justify-center">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                    </div>
                    <span className="text-[9px] font-medium text-amber-700">انقضا</span>
                  </div>
                  <p className="text-base font-black text-amber-700" dir="ltr">{formatNumberFa(stats.expiring)}</p>
                </div>
                <div className="bg-red-50/50 rounded-lg p-2.5 border border-red-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded bg-red-100 flex items-center justify-center">
                      <XCircle className="w-3 h-3 text-red-600" />
                    </div>
                    <span className="text-[9px] font-medium text-red-700">غیرفعال</span>
                  </div>
                  <p className="text-base font-black text-red-700" dir="ltr">{formatNumberFa(stats.suspended)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════ نیاز به به‌روزرسانی (★ v11.2) ═══════════════════════ */}
        {needsRenewalTenants.length > 0 && (
          <div className="bg-gradient-to-l from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-amber-900">نیاز به پیگیری تمدید</h3>
                  <p className="text-[9px] text-amber-700">
                    {toFaNum(needsRenewalTenants.length)} فروشگاه دوره سه ماهه را گذرانده و باید تمدید کنند
                  </p>
                </div>
              </div>
              <Link
                href="/admin/tenants"
                className="text-[10px] font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-lg border border-amber-200"
              >
                پیگیری
                <ArrowLeft className="w-3 h-3" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {needsRenewalTenants.map((tenant: any, idx: number) => (
                <div key={idx} className="bg-white/70 backdrop-blur-sm rounded-lg p-2.5 border border-amber-100 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-[10px] shrink-0">
                    {(tenant.companyName || tenant.name || 'ف')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-gray-800 truncate">{tenant.companyName || tenant.name || 'فروشگاه'}</p>
                    <p className="text-[9px] text-amber-700 font-medium">
                      {toFaNum(tenant.usageDays || 0)} روز از ثبت‌نام
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════ انقضای نزدیک ═══════════════════════ */}
        {expiringTenants.length > 0 && (
          <div className="bg-gradient-to-l from-orange-50 to-red-50 border border-orange-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-orange-900">فروشگاه‌های در حال انقضا</h3>
                  <p className="text-[9px] text-orange-700">{toFaNum(expiringTenants.length)} فروشگاه در ۷ روز آینده منقضی می‌شوند</p>
                </div>
              </div>
              <Link
                href="/admin/tenants?filter=expiring"
                className="text-[10px] font-bold text-orange-700 hover:text-orange-900 flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-lg border border-orange-200"
              >
                پیگیری
                <ArrowLeft className="w-3 h-3" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {expiringTenants.slice(0, 6).map((tenant: any, idx: number) => (
                <div key={idx} className="bg-white/70 backdrop-blur-sm rounded-lg p-2.5 border border-orange-100 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center text-orange-700 font-bold text-[10px] shrink-0">
                    {(tenant.companyName || tenant.name || 'ف')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-gray-800 truncate">{tenant.companyName || tenant.name || 'فروشگاه'}</p>
                    <p className="text-[9px] text-orange-700 font-medium">
                      {toFaNum(tenant.daysRemaining)} روز باقی‌مانده
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════ فوتر ═══════════════════════ */}
        <div className="text-center text-[9px] text-gray-400 pt-3 border-t border-gray-100">
          <p>پنل مدیریت سیستم فروشگاهی — نسخه {toFaNum('11.2.0')}</p>
          <p className="mt-0.5">تمامی حقوق محفوظ است © {toFaNum(new Date().getFullYear())}</p>
        </div>

      </div>
    </div>
  );
}