'use client';

import { ReactNode, useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

const toFaNum = (n: number | string): string => {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

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

const getSiteUrl = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || '/';
};

const navItems = [
  {
    href: '/admin/dashboard',
    label: 'داشبورد',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/admin/tenants',
    label: 'فروشگاه‌ها',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    href: '/admin/tickets',
    label: 'تیکت‌های پشتیبانی',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
      </svg>
    ),
  },
  {
    href: '/admin/transactions',
    label: 'تراکنش‌های مالی',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    href: '/admin/site-content',
    label: 'محتوای سایت',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
  },
  {
    href: '/admin/change-password',
    label: 'تغییر رمز عبور',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [persianDate, setPersianDate] = useState('');
  const [siteUrl, setSiteUrl] = useState('/');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentTime(getPersianTime());
    setPersianDate(getPersianDate());
    setSiteUrl(getSiteUrl());
    setMounted(true);

    const timer = setInterval(() => {
      setCurrentTime(getPersianTime());
      setPersianDate(getPersianDate());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (e) {
      console.warn('[Logout] API call failed:', e);
    }

    const cookieNames = ['token', 'admin_token', 'admin-token'];
    cookieNames.forEach(name => {
      document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0;`;
      document.cookie = `${name}=; Path=/admin; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0;`;
      document.cookie = `${name}=; Path=/; Max-Age=-1;`;
    });

    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      sessionStorage.clear();
    }

    router.replace('/admin/login');
    setTimeout(() => {
      window.location.href = '/admin/login';
    }, 100);
  };

  const currentPageTitle = navItems.find(i => i.href === pathname)?.label || 'پنل مدیریت';
  const isCollapsed = !isDesktopSidebarOpen;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/20 flex font-['Peyda'] text-sm" dir="rtl">

      {/* ═══════════════════════ OVERLAY موبایل ═══════════════════════ */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 lg:hidden animate-in fade-in duration-200"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ═══════════════════════ سایدبار تیره ═══════════════════════ */}
      <aside className={`
        fixed top-0 right-0 h-full z-40
        bg-gradient-to-b from-slate-900 via-slate-800 to-indigo-950
        transform transition-all duration-300 ease-in-out
        lg:sticky lg:top-0 lg:right-auto lg:h-screen lg:self-start lg:z-20
        flex flex-col shadow-2xl overflow-hidden
        ${sidebarOpen ? 'translate-x-0 w-64' : 'translate-x-full w-64 lg:translate-x-0'}
        ${isDesktopSidebarOpen ? 'lg:w-64' : 'lg:w-20'}
      `}>

        <div className={`p-4 border-b border-white/10 flex items-center shrink-0 transition-all duration-300 ${
          isCollapsed ? 'lg:justify-center lg:p-3' : 'justify-between'
        }`}>
          <div className={`flex items-center gap-3 whitespace-nowrap ${isCollapsed ? 'lg:justify-center' : ''}`}>
            <div className="relative w-10 h-10 bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] rounded-xl flex items-center justify-center text-white font-black text-base shadow-lg shadow-purple-500/30 shrink-0">
              S
            </div>
            <div className={`${isCollapsed ? 'lg:hidden' : ''}`}>
              <h1 className="text-sm font-black text-white leading-tight">پنل مدیریت</h1>
              <p className="text-[10px] text-purple-300 font-medium">حسابداری رهگشا</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className={`flex-1 overflow-y-auto scrollbar-thin transition-all duration-300 ${
          isCollapsed ? 'lg:p-2' : 'p-3'
        }`}>
          <div className="space-y-1">
            {navItems.map(item => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  title={item.label}
                  className={`group relative flex items-center rounded-lg transition-all duration-200 text-sm font-medium whitespace-nowrap overflow-hidden ${
                    isCollapsed ? 'lg:justify-center lg:px-0 lg:py-2.5' : 'gap-3 px-3 py-2.5'
                  } ${
                    isActive
                      ? 'bg-gradient-to-l from-[#7C7BEB] to-[#5B5AC7] text-white shadow-lg shadow-purple-500/20'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {isActive && (
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-l-full" />
                  )}

                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-slate-400 group-hover:text-white group-hover:bg-white/10'
                  }`}>
                    {item.icon}
                  </div>

                  {!isCollapsed && (
                    <span className="flex-1">{item.label}</span>
                  )}

                  {isCollapsed && (
                    <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap z-50 hidden lg:block">
                      {item.label}
                      <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className={`p-3 border-t border-white/10 shrink-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
          <p className="text-[10px] text-slate-400 text-center">
            © {toFaNum(new Date().getFullYear())} سیستم حسابداری رهگشا
          </p>
        </div>
      </aside>

      {/* ═══════════════════════ محتوای اصلی ═══════════════════════ */}
      <main className="flex-1 min-h-screen flex flex-col w-full min-w-0">

        {/* ═══════════════════════ هدر اصلی (★ v11.3: هماهنگ با سایدبار) ═══════════════════════ */}
        <header className="bg-gradient-to-l from-slate-800 via-slate-800 to-indigo-900 backdrop-blur-xl border-b border-white/10 px-4 sm:px-6 py-3 flex justify-between items-center sticky top-0 z-10 shadow-lg shadow-slate-900/10">
          <div className="flex items-center gap-3">
            {/* دکمه toggle سایدبار */}
            <button
              onClick={() => setIsDesktopSidebarOpen(!isDesktopSidebarOpen)}
              className={`hidden lg:flex w-10 h-10 items-center justify-center rounded-xl transition-all ${
                isCollapsed
                  ? 'bg-white text-indigo-900 shadow-md'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
              title={isDesktopSidebarOpen ? 'بستن منو' : 'باز کردن منو'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isCollapsed ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* دکمه منو موبایل */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-10 h-10 flex items-center justify-center text-slate-300 hover:bg-white/10 hover:text-white rounded-xl transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* عنوان صفحه */}
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center shrink-0 shadow-md shadow-purple-500/30">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] text-purple-200/70 font-medium">صفحه فعلی</p>
                <h2 className="text-sm font-bold text-white leading-tight">{currentPageTitle}</h2>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">

            {/* جستجو */}
            <div className="relative hidden md:block" ref={searchRef}>
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className="w-10 h-10 flex items-center justify-center text-slate-300 hover:bg-white/10 hover:text-white rounded-xl transition-all"
                title="جستجو"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              {isSearchOpen && (
                <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="relative">
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      autoFocus
                      placeholder="جستجو در پنل..."
                      className="w-full pr-10 pl-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:bg-white focus:border-[#7C7BEB] outline-none transition"
                    />
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-[10px] text-gray-400 font-bold mb-1.5">دسترسی سریع</p>
                    <div className="space-y-0.5">
                      {navItems.slice(0, 4).map(item => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsSearchOpen(false)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition"
                        >
                          <div className="w-6 h-6 rounded-md bg-purple-50 flex items-center justify-center text-purple-600">
                            {item.icon}
                          </div>
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ★ v11.3: تاریخ و ساعت با استایل تیره هماهنگ */}
            <div className="hidden lg:flex items-center gap-2 bg-white/5 backdrop-blur-sm px-3 py-2 rounded-xl border border-white/10 shadow-sm min-w-[240px]" dir="rtl">
              <div className="flex items-center gap-1.5 flex-1">
                <svg className="w-3.5 h-3.5 text-purple-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-[11px] font-bold text-slate-100 whitespace-nowrap" suppressHydrationWarning>
                  {mounted ? persianDate : '\u00A0'}
                </span>
              </div>
              <span className="text-white/20">|</span>
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-amber-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[11px] font-bold text-slate-100 font-mono min-w-[40px]" dir="ltr" suppressHydrationWarning>
                  {mounted ? currentTime : '\u00A0'}
                </span>
              </div>
            </div>

            {/* ★ v11.3: دکمه مشاهده سایت با رنگ هماهنگ */}
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 backdrop-blur-sm border border-emerald-400/30 text-emerald-300 rounded-xl hover:bg-emerald-500/20 hover:border-emerald-400/50 hover:text-emerald-200 transition-all text-xs font-bold"
              title="مشاهده سایت"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              سایت
              <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            {/* اعلان‌ها */}
            <button className="relative w-10 h-10 flex items-center justify-center text-slate-300 hover:bg-white/10 hover:text-white rounded-xl transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-slate-800 animate-pulse"></span>
            </button>

            {/* منوی کاربر */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="flex items-center gap-2.5 hover:bg-white/10 p-1.5 pr-2 rounded-xl transition-all border border-transparent hover:border-white/10"
              >
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-bold text-white leading-tight">مدیر ارشد</p>
                  <p className="text-[10px] text-emerald-400 flex items-center gap-1 justify-end font-medium">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                    </span>
                    آنلاین
                  </p>
                </div>
                <div className="relative w-10 h-10 bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] rounded-xl flex items-center justify-center text-white font-black text-sm shadow-lg shadow-purple-500/30 shrink-0">
                  A
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-800"></span>
                </div>
                <svg className={`w-4 h-4 text-slate-300 transition-transform hidden sm:block ${isUserDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* منوی کشویی کاربر (سفید برای خوانایی) */}
              {isUserDropdownOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl shadow-purple-500/10 border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">

                  <div className="px-4 py-3 bg-gradient-to-l from-slate-50 to-purple-50/50 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] rounded-xl flex items-center justify-center text-white font-black text-sm shadow-md">
                        A
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800">مدیر ارشد</p>
                        <p className="text-[11px] text-gray-500 truncate">admin@shopaccounting.com</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px]">
                      <span className="px-2 py-0.5 bg-gradient-to-l from-[#7C7BEB] to-[#5B5AC7] text-white rounded-md font-black">
                        SUPER ADMIN
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md font-bold flex items-center gap-1">
                        <span className="w-1 h-1 bg-emerald-500 rounded-full"></span>
                        آنلاین
                      </span>
                    </div>
                  </div>

                  <div className="py-1.5">
                    <Link
                      href="/admin/change-password"
                      onClick={() => setIsUserDropdownOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">تغییر رمز عبور</p>
                        <p className="text-[10px] text-gray-500">به‌روزرسانی اطلاعات ورود</p>
                      </div>
                    </Link>

                    <a
                      href={siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsUserDropdownOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">مشاهده سایت</p>
                        <p className="text-[10px] text-gray-500">باز کردن در تب جدید</p>
                      </div>
                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>

                    <Link
                      href="/admin/site-content"
                      onClick={() => setIsUserDropdownOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600 group-hover:bg-purple-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">تنظیمات</p>
                        <p className="text-[10px] text-gray-500">پیکربندی سیستم</p>
                      </div>
                    </Link>
                  </div>

                  <div className="px-2 pt-1.5 border-t border-gray-100">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition rounded-xl group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                      </div>
                      <span className="font-bold">خروج از حساب</span>
                    </button>
                  </div>
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

      <style jsx>{`
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(124, 123, 235, 0.3);
          border-radius: 10px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: rgba(124, 123, 235, 0.5); }

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-in { animation: fade-in 0.2s ease-out; }

        @keyframes slide-in-from-top {
          from { transform: translateY(-8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .slide-in-from-top-2 { animation: slide-in-from-top 0.2s ease-out; }
      `}</style>
    </div>
  );
}