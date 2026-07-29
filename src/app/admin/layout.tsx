'use client';

import { ReactNode, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // اگر در صفحه لاگین هستیم، فقط فرم لاگین را نمایش بده
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const handleLogout = () => {
    document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    router.push('/admin/login');
  };

  const navItems = [
    { href: '/admin/dashboard', label: 'داشبورد', icon: '📊' },
    { href: '/admin/tenants', label: 'فروشگاه‌ها', icon: '🏪' },
    { href: '/admin/tickets', label: 'تیکت‌های پشتیبانی', icon: '🎫' },
    { href: '/admin/transactions', label: 'تراکنش‌های مالی', icon: '💳' },
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex font-['Peyda'] text-sm" dir="rtl">
      {/* Overlay برای موبایل */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* سایدبار */}
      <aside className={`
        fixed top-0 right-0 h-full w-64 bg-white border-l border-gray-200 z-40
        transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:z-20
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        flex flex-col shadow-lg lg:shadow-sm
      `}>
        {/* هدر سایدبار */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] rounded-lg flex items-center justify-center text-white font-bold text-base shadow-md shadow-purple-200">
              S
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-800 leading-tight">پنل مدیریت</h1>
              <p className="text-[10px] text-gray-400">ShopAccounting v8.8</p>
            </div>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            ✕
          </button>
        </div>
        
        {/* منوی ناوبری */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200 text-xs font-medium ${
                pathname === item.href 
                  ? 'bg-[#EEEDFD] text-[#7C7BEB] shadow-sm' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* فوتر سایدبار */}
        <div className="p-3 border-t border-gray-100">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition text-xs font-medium border border-gray-200 hover:border-red-200"
          >
            <span>🚪</span>
            <span>خروج از حساب</span>
          </button>
        </div>
      </aside>

      {/* محتوای اصلی */}
      <main className="flex-1 min-h-screen flex flex-col">
        {/* هدر اصلی */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h2 className="text-sm font-semibold text-gray-700">مدیریت کلان سیستم</h2>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="text-left hidden sm:block">
              <p className="text-xs font-medium text-gray-800">مدیر ارشد</p>
              <p className="text-[10px] text-green-600 flex items-center gap-1 justify-end">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                آنلاین
              </p>
            </div>
            <div className="w-9 h-9 bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md shadow-purple-200">
              A
            </div>
          </div>
        </header>

        {/* محتوای صفحه */}
        <div className="p-4 sm:p-6 flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}