'use client';

import { ReactNode, useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

// ★ تابع کمکی برای تبدیل اعداد به فارسی
const toFaNum = (n: number | string): string => {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

// ★ تابع دریافت تاریخ شمسی با ترتیب دقیق و اعداد فارسی (روش تضمینی)
const getPersianDate = (): string => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('fa-IR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const year = parts.find(p => p.type === 'year')?.value || '';
  
  return `${toFaNum(weekday)} ${toFaNum(day)} ${toFaNum(month)} ${toFaNum(year)}`;
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  
  // ★ وضعیت‌های جدید
  const [sidebarOpen, setSidebarOpen] = useState(false); // برای موبایل
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true); // برای دسکتاپ
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false); // برای منوی کاربر
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // بستن منوی کاربر با کلیک بیرون از آن
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    { href: '/admin/change-password', label: 'تغییر رمز عبور', icon: '🔒' },
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
        fixed top-0 right-0 h-full bg-white border-l border-gray-200 z-40
        transform transition-all duration-300 ease-in-out
        lg:static lg:z-20 flex flex-col shadow-lg lg:shadow-sm overflow-hidden
        ${sidebarOpen ? 'translate-x-0 w-64' : 'translate-x-full w-64 lg:translate-x-0'}
        ${isDesktopSidebarOpen ? 'lg:w-64 lg:opacity-100' : 'lg:w-0 lg:opacity-0 lg:border-l-0'}
      `}>
        {/* هدر سایدبار */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 whitespace-nowrap">
            <div className="w-9 h-9 bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] rounded-lg flex items-center justify-center text-white font-bold text-base shadow-md shadow-purple-200 shrink-0">
              S
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-800 leading-tight">پنل مدیریت</h1>
              <p className="text-[10px] text-gray-400">ShopAccounting v8.8</p>
            </div>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition shrink-0"
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
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium whitespace-nowrap ${
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
        <div className="p-3 border-t border-gray-100 shrink-0">
          <p className="text-[10px] text-gray-400 text-center">
            © {toFaNum(new Date().getFullYear())} تمامی حقوق محفوظ است
          </p>
        </div>
      </aside>

      {/* محتوای اصلی */}
      <main className="flex-1 min-h-screen flex flex-col w-full">
        {/* هدر اصلی */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            {/* ★ دکمه باز/بسته کردن سایدبار در دسکتاپ */}
            <button 
              onClick={() => setIsDesktopSidebarOpen(!isDesktopSidebarOpen)}
              className="hidden lg:flex w-9 h-9 items-center justify-center text-gray-600 hover:bg-gray-100 rounded-lg transition"
              title={isDesktopSidebarOpen ? 'بستن منو' : 'باز کردن منو'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* دکمه باز کردن سایدبار در موبایل */}
            <button 
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            <h2 className="text-sm font-semibold text-gray-700 hidden sm:block">مدیریت کلان سیستم</h2>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* ★ نمایش تاریخ شمسی با ترتیب دقیق و اعداد فارسی (روش تضمینی) */}
            <div className="hidden md:flex items-center gap-1.5 bg-white/80 px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm" dir="rtl">
              <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap text-right" dir="rtl">
                {getPersianDate()}
              </span>
            </div>

            {/* ★ منوی کشویی کاربر */}
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="flex items-center gap-2 hover:bg-gray-50 p-1.5 rounded-lg transition"
              >
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-medium text-gray-800">مدیر ارشد</p>
                  <p className="text-[10px] text-green-600 flex items-center gap-1 justify-end">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                    آنلاین
                  </p>
                </div>
                <div className="w-9 h-9 bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md shadow-purple-200 shrink-0">
                  A
                </div>
              </button>

              {/* محتوای منوی کشویی */}
              {isUserDropdownOpen && (
                <div className="absolute left-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-2 border-b border-gray-100 mb-1.5">
                    <p className="text-xs font-bold text-gray-800">مدیر ارشد</p>
                    <p className="text-[10px] text-gray-500">admin@shopaccounting.com</p>
                  </div>
                  
                  <Link 
                    href="/admin/change-password" 
                    onClick={() => setIsUserDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
                  >
                    <span>🔒</span>
                    <span>تغییر رمز عبور</span>
                  </Link>
                  
                  <div className="border-t border-gray-100 my-1.5"></div>
                  
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition text-right"
                  >
                    <span>🚪</span>
                    <span>خروج از حساب</span>
                  </button>
                </div>
              )}
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