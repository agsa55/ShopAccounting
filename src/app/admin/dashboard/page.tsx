'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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
          <p className="text-gray-500 text-xs">در حال بارگذاری آمار...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { title: 'کل فروشگاه‌ها', value: stats.total, icon: '🏪', color: 'from-blue-500 to-blue-600', bg: 'bg-blue-50' },
    { title: 'فروشگاه‌های فعال', value: stats.active, icon: '✅', color: 'from-green-500 to-green-600', bg: 'bg-green-50' },
    { title: 'انقضای نزدیک', value: stats.expiring, icon: '⚠️', color: 'from-orange-500 to-orange-600', bg: 'bg-orange-50' },
    { title: 'تیکت‌های باز', value: stats.tickets, icon: '🎫', color: 'from-purple-500 to-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <div className="space-y-5">
      {/* هدر */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-800">نمای کلی سیستم</h1>
          <p className="text-[11px] text-gray-500 mt-0.5">خلاصه وضعیت فروشگاه‌ها و تیکت‌ها</p>
        </div>
        <span className="text-[10px] text-gray-400 bg-white px-3 py-1.5 rounded-full border border-gray-200">
          آخرین به‌روزرسانی: همین الان
        </span>
      </div>
      
      {/* کارت‌های آماری */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card, idx) => (
          <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-start justify-between mb-2">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} bg-opacity-10 flex items-center justify-center text-lg shadow-sm`}>
                {card.icon}
              </div>
            </div>
            <p className="text-gray-500 text-[10px] mb-1 font-medium">{card.title}</p>
            <p className="text-xl sm:text-2xl font-bold text-gray-800">{card.value}</p>
          </div>
        ))}
      </div>

      {/* دسترسی سریع */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-sm font-semibold mb-4 text-gray-700 border-b border-gray-50 pb-3">دسترسی سریع</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link 
            href="/admin/tenants" 
            className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[#7C7BEB] to-[#5B5AC7] text-white rounded-lg hover:shadow-lg transition-all duration-200 shadow-md shadow-purple-200"
          >
            <span className="text-xl">🏪</span>
            <div>
              <p className="font-medium text-sm">مدیریت فروشگاه‌ها</p>
              <p className="text-[10px] opacity-90">مشاهده و مدیریت همه فروشگاه‌ها</p>
            </div>
          </Link>
          <Link 
            href="/admin/tickets" 
            className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
          >
            <span className="text-xl">🎫</span>
            <div>
              <p className="font-medium text-sm">پاسخ به تیکت‌ها</p>
              <p className="text-[10px] text-gray-500">مدیریت تیکت‌های پشتیبانی</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}