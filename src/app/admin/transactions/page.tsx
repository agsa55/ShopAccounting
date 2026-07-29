'use client';

import { useEffect, useState } from 'react';
import StatCard from '@/components/admin/stat-card';

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalRevenue: 0, paidCount: 0, totalCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/transactions')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTransactions(data.data);
          setStats(data.stats);
        }
        setLoading(false);
      });
  }, []);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fa-IR').format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#7C7BEB] mx-auto mb-3"></div>
          <p className="text-gray-500 text-xs">در حال بارگذاری تراکنش‌ها...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* هدر */}
      <div>
        <h1 className="text-lg font-bold text-gray-800">تراکنش‌های مالی</h1>
        <p className="text-[11px] text-gray-500 mt-0.5">مدیریت پرداخت‌های اشتراک فروشگاه‌ها</p>
      </div>

      {/* کارت‌های آماری فشرده */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <StatCard
          title="درآمد کل"
          value={`${formatAmount(stats.totalRevenue)} ریال`}
          icon="💰"
          gradient="from-emerald-400 to-emerald-600"
          subtitle="مجموع پرداخت‌های موفق"
        />
        <StatCard
          title="تراکنش‌های موفق"
          value={stats.paidCount}
          icon="✅"
          gradient="from-blue-400 to-blue-600"
          subtitle="پرداخت‌های تأیید شده"
        />
        <StatCard
          title="کل تراکنش‌ها"
          value={stats.totalCount}
          icon="📊"
          gradient="from-purple-400 to-purple-600"
          subtitle="شامل در انتظار و ناموفق"
        />
      </div>

      {/* جدول تراکنش‌ها */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-[#F9F8FF] border-b border-gray-100">
              <tr>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB]">فروشگاه</th>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB] hidden sm:table-cell">پلن</th>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB]">مبلغ</th>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB] hidden md:table-cell">روش پرداخت</th>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB]">وضعیت</th>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB] hidden lg:table-cell">تاریخ</th>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB] hidden lg:table-cell">کد پیگیری</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.map(t => (
                <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="text-xs font-medium text-gray-800">{t.tenantName}</div>
                    <div className="text-[10px] text-gray-400 font-mono sm:hidden">{t.tenantSubdomain}</div>
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <span className="text-[11px] text-gray-700">{t.planName}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-bold text-gray-800">{formatAmount(t.amount)} <span className="text-[9px] text-gray-400">ریال</span></span>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell">
                    <span className="text-[11px] text-gray-600">{t.paymentMethod}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`flex items-center gap-1 text-[10px] font-medium ${
                      t.isPaid ? 'text-green-600' : t.status === 'failed' ? 'text-red-600' : 'text-yellow-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        t.isPaid ? 'bg-green-500' : t.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                      }`}></span>
                      {t.isPaid ? 'موفق' : t.status === 'failed' ? 'ناموفق' : 'در انتظار'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 hidden lg:table-cell">
                    <span className="text-[10px] text-gray-500">
                      {new Date(t.paidAt || t.createdAt).toLocaleDateString('fa-IR')}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 hidden lg:table-cell">
                    <span className="text-[10px] text-gray-500 font-mono">
                      {t.paymentRef || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {transactions.length === 0 && (
          <div className="p-10 text-center">
            <div className="text-3xl mb-2">💳</div>
            <p className="text-gray-400 text-xs">هنوز تراکنشی ثبت نشده است</p>
          </div>
        )}
      </div>
    </div>
  );
}