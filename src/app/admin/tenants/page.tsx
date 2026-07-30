'use client';

import { useEffect, useState } from 'react';
import StatCard from '@/components/admin/stat-card';
import { useRouter } from 'next/navigation'; // ← این خط اضافه شد

export default function AdminTenantsPage() {
  const router = useRouter(); // ← این خط اضافه شد
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null); // ← برای مدیریت لودینگ دکمه

  useEffect(() => {
    fetch('/api/admin/tenants')
      .then(res => res.json())
      .then(data => {
        if (data.success) setTenants(data.data);
        setLoading(false);
      });
  }, []);

  const filteredTenants = tenants.filter(t => 
    t.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.subDomain?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // آمار پلن‌ها (شامل trial)
  const stats = {
    total: tenants.length,
    trial: tenants.filter(t => t.planName === 'trial').length, // ← اضافه شد
    basic: tenants.filter(t => t.planName === 'simple' || t.planName === 'basic').length,
    professional: tenants.filter(t => t.planName === 'professional').length,
    enterprise: tenants.filter(t => t.planName === 'enterprise').length,
  };

  // ← تابع جدید برای ورود به جای مستاجر
  const handleImpersonate = async (tenantId: string, subDomain: string) => {
    setImpersonatingId(tenantId);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/impersonate`, {
        method: 'POST',
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        // ریدایرکت سخت (Hard Redirect) برای اعمال کوکی جدید
        // اگر ساختار روتینگ شما متفاوت است (مثلاً /dashboard)، آن را تغییر دهید
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#7C7BEB] mx-auto mb-3"></div>
          <p className="text-gray-500 text-xs">در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* هدر */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">مدیریت فروشگاه‌ها</h1>
          <p className="text-[11px] text-gray-500 mt-0.5">لیست کامل فروشگاه‌های ثبت‌نام شده</p>
        </div>
      </div>

      {/* کارت‌های آماری پلن‌ها */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5"> {/* ← تغییر به 5 ستون برای جای دادن پلن تستی */}
        <StatCard title="کل فروشگاه‌ها" value={stats.total} icon="🏪" gradient="from-[#7C7BEB] to-[#5B5AC7]" subtitle="همه پلن‌ها" />
        <StatCard title="پلن تستی" value={stats.trial} icon="🎁" gradient="from-green-400 to-green-600" subtitle="دمو ۳ روزه" />
        <StatCard title="پلن پایه" value={stats.basic} icon="🥉" gradient="from-gray-400 to-gray-500" subtitle="اشتراک ساده" />
        <StatCard title="پلن پیشرفته" value={stats.professional} icon="🥈" gradient="from-blue-400 to-blue-600" subtitle="اشتراک حرفه‌ای" />
        <StatCard title="پلن سازمانی" value={stats.enterprise} icon="🥇" gradient="from-purple-400 to-purple-600" subtitle="اشتراک سازمانی" />
      </div>

      {/* جستجو */}
      <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
        <input
          type="text"
          placeholder="جستجو بر اساس نام فروشگاه یا ساب‌دامین..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7C7BEB] focus:border-transparent outline-none transition text-xs"
        />
      </div>

      {/* جدول */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-[#F9F8FF] border-b border-gray-100">
              <tr>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB]">نام فروشگاه</th>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB] hidden sm:table-cell">ساب‌دامین</th>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB]">پلن</th>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB]">وضعیت</th>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB] hidden md:table-cell">روز باقی‌مانده</th>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB] hidden lg:table-cell">تیکت‌ها</th>
                <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB]">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTenants.map((tenant: any) => (
                <tr key={tenant.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="text-xs font-medium text-gray-800">{tenant.companyName || 'بدون نام'}</div>
                    <div className="text-[10px] text-gray-400 sm:hidden font-mono">{tenant.subDomain}</div>
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <span className="text-[10px] text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded">{tenant.subDomain}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    {/* ← اصلاح شرط نمایش نام پلن برای شامل شدن trial */}
                    <span className={`px-2 py-1 rounded-md text-[10px] font-medium border ${
                      tenant.planName === 'enterprise' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                      tenant.planName === 'professional' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                      tenant.planName === 'trial' ? 'bg-green-50 text-green-700 border-green-100' :
                      'bg-gray-50 text-gray-600 border-gray-100'
                    }`}>
                      {tenant.planName === 'enterprise' ? 'سازمانی' : 
                       tenant.planName === 'professional' ? 'پیشرفته' : 
                       tenant.planName === 'trial' ? 'تستی (دمو)' : 'پایه'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`flex items-center gap-1 text-[10px] font-medium ${
                      tenant.status === 'active' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${tenant.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                      {tenant.status === 'active' ? 'فعال' : 'غیرفعال'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell">
                    {tenant.billingCycle === 'lifetime' ? (
                      <span className="text-green-600 font-medium text-[10px] bg-green-50 px-2 py-1 rounded">مادام‌العمر</span>
                    ) : (
                      <span className={tenant.remainingDays <= 7 ? 'text-red-600 font-bold text-[10px]' : 'text-gray-600 text-[10px]'}>
                        {tenant.remainingDays} روز
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 text-[11px] text-center hidden lg:table-cell">{tenant._count?.Tickets || 0}</td>
                  <td className="px-3 py-2.5">
                    {/* ← دکمه با تابع onClick و حالت Loading */}
                    <button 
                      onClick={() => handleImpersonate(tenant.id, tenant.subDomain)}
                      disabled={impersonatingId === tenant.id}
                      className={`text-[10px] font-medium px-2.5 py-1.5 rounded-md transition flex items-center gap-1 ${
                        impersonatingId === tenant.id 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : 'text-[#7C7BEB] hover:text-[#6a69d9] bg-[#EEEDFD] hover:bg-[#E0DFFA]'
                      }`}
                    >
                      {impersonatingId === tenant.id ? (
                        <>
                          <span className="animate-spin h-3 w-3 border-2 border-[#7C7BEB] border-t-transparent rounded-full"></span>
                          در حال ورود...
                        </>
                      ) : (
                        'ورود به پنل'
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredTenants.length === 0 && (
          <div className="p-10 text-center">
            <div className="text-3xl mb-2">🏪</div>
            <p className="text-gray-400 text-xs">
              {searchTerm ? 'نتیجه‌ای یافت نشد' : 'هنوز هیچ فروشگاهی ثبت‌نام نکرده است'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}