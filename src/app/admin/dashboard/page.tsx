'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Store, CheckCircle2, AlertTriangle, Ticket, ArrowLeft } from 'lucide-react';

// ★ تابع کمکی برای تبدیل اعداد به فارسی
const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰';
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({ total: 0, active: 0, expiring: 0, tickets: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/tenants')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const tenants = data.data;
          setStats({
            total: tenants.length,
            active: tenants.filter((t: any) => t.status === 'active').length,
            expiring: tenants.filter((t: any) => t.remainingDays <= 7 && t.remainingDays > 0).length,
            tickets: tenants.reduce((acc: number, t: any) => acc + (t._count?.Tickets || 0), 0)
          });
        }
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#7C7BEB] mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">در حال بارگذاری آمار...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { title: 'کل فروشگاه‌ها', value: stats.total, icon: Store, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { title: 'فروشگاه‌های فعال', value: stats.active, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
    { title: 'انقضای نزدیک', value: stats.expiring, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
    { title: 'تیکت‌های باز', value: stats.tickets, icon: Ticket, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
  ];

  return (
    <div className="space-y-6">
      {/* هدر */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">نمای کلی سیستم</h1>
          <p className="text-sm text-gray-500 mt-1">خلاصه وضعیت فروشگاه‌ها و تیکت‌های پشتیبانی</p>
        </div>
        <span className="text-xs text-gray-500 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm flex items-center gap-1.5">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          آخرین به‌روزرسانی: همین الان
        </span>
      </div>
      
      {/* کارت‌های آماری */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div key={idx} className={`bg-white p-5 rounded-xl border ${card.border} shadow-sm hover:shadow-md transition-all duration-200 group`}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-12 h-12 rounded-xl ${card.bg} ${card.color} flex items-center justify-center transition-transform group-hover:scale-110`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
              <p className="text-gray-500 text-xs mb-1 font-medium">{card.title}</p>
              <p className="text-2xl font-bold text-gray-800">{toFaNum(card.value)}</p>
            </div>
          );
        })}
      </div>

      {/* دسترسی سریع */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-sm font-bold mb-4 text-gray-700 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4 text-[#7C7BEB]" />
          دسترسی سریع
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link 
            href="/admin/tenants" 
            className="flex items-center gap-4 px-5 py-4 bg-gradient-to-r from-[#7C7BEB] to-[#5B5AC7] text-white rounded-xl hover:shadow-lg hover:shadow-purple-200 transition-all duration-200 group"
          >
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm">مدیریت فروشگاه‌ها</p>
              <p className="text-[11px] text-purple-100 mt-0.5">مشاهده، ویرایش و مدیریت همه فروشگاه‌ها</p>
            </div>
          </Link>
          <Link 
            href="/admin/tickets" 
            className="flex items-center gap-4 px-5 py-4 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 group"
          >
            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center group-hover:bg-purple-100 transition">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm">پاسخ به تیکت‌ها</p>
              <p className="text-[11px] text-gray-500 mt-0.5">مدیریت و پیگیری تیکت‌های پشتیبانی</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}