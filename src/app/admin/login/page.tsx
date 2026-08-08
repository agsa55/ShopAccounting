'use client';

// ============================================================================
// src/app/admin/login/page.tsx (v2.0 — Smart Redirect + Security)
// صفحه ورود پنل ادمین با پشتیبانی از پارامتر redirect
// ============================================================================

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Lock, User, Eye, EyeOff, Shield, AlertCircle, CheckCircle2,
  Sparkles, ArrowLeft, Loader2
} from 'lucide-react';

// ★ تبدیل اعداد به فارسی
const toFaNum = (n: number | string): string => {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

// ★ تاریخ شمسی
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

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [persianDate, setPersianDate] = useState('');

  // ★ مسیر قبلی برای redirect (ست شده توسط middleware)
  const redirectTo = searchParams.get('redirect');

  // ★ بارگذاری تاریخ شمسی (جلوگیری از hydration mismatch)
  useEffect(() => {
    setPersianDate(getPersianDate());
    setMounted(true);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  //  ★ اعتبارسنجی مسیر redirect — فقط مسیرهای امن /admin/*
  // ═══════════════════════════════════════════════════════════════
  const getSafeRedirectUrl = (): string => {
    // اگر redirect ست نشده باشد
    if (!redirectTo) return '/admin/dashboard';

    // بررسی امنیتی: فقط مسیرهای /admin/* مجاز هستند
    if (
      redirectTo.startsWith('/admin/') &&
      redirectTo !== '/admin/login' &&
      !redirectTo.includes('..') &&
      !redirectTo.includes('//')
    ) {
      return redirectTo;
    }

    return '/admin/dashboard';
  };

  // ═══════════════════════════════════════════════════════════════
  //  ★ تابع ترجمه کد خطا به پیام فارسی
  // ═══════════════════════════════════════════════════════════════
  const getErrorMessage = (errorCode?: string, message?: string): string => {
    switch (errorCode) {
      case 'INVALID_CREDENTIALS':
        return 'نام کاربری یا رمز عبور اشتباه است';
      case 'USER_NOT_FOUND':
        return 'کاربری با این نام کاربری یافت نشد';
      case 'ACCOUNT_LOCKED':
        return 'حساب کاربری شما قفل شده است. لطفاً بعداً تلاش کنید';
      case 'TOO_MANY_ATTEMPTS':
        return 'تعداد تلاش‌های شما بیش از حد مجاز است. ۵ دقیقه صبر کنید';
      case 'INVALID_INPUT':
        return 'لطفاً نام کاربری و رمز عبور را وارد کنید';
      case 'UNAUTHORIZED':
        return 'شما دسترسی به این بخش را ندارید';
      default:
        return message || 'خطا در ورود به حساب کاربری';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // ★ اعتبارسنجی اولیه
    if (!username.trim() || !password.trim()) {
      setError('لطفاً نام کاربری و رمز عبور را وارد کنید');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // مهم: برای ارسال کوکی
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (data.success) {
        // ★ هدایت به مسیر امن (قبلی یا داشبورد)
        const safeRedirect = getSafeRedirectUrl();
        
        // Force reload برای پاک کردن state و بارگذاری مجدد با cookie جدید
        window.location.href = safeRedirect;
      } else {
        setError(getErrorMessage(data.errorCode, data.error));
      }
    } catch (err: any) {
      console.error('[Login] Error:', err);
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setError('خطای شبکه. لطفاً اتصال اینترنت خود را بررسی کنید.');
      } else {
        setError('خطای غیرمنتظره. لطفاً دوباره تلاش کنید.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50/30 to-indigo-50/20 p-4 relative overflow-hidden font-['Peyda']" dir="rtl">
      
      {/* ═══════════════════════ پس‌زمینه دکوراتیو ═══════════════════════ */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-200/30 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-200/30 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] bg-violet-200/20 rounded-full blur-[80px]" />
        
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(124, 123, 235, 0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative w-full max-w-md z-10">

        {/* ═══════════════════════ تاریخ فارسی ═══════════════════════ */}
        {mounted && persianDate && (
          <div className="text-center mb-4 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/70 backdrop-blur-sm border border-white/60 rounded-full shadow-sm">
              <svg className="w-3.5 h-3.5 text-[#7C7BEB]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[11px] font-bold text-gray-700">{persianDate}</span>
            </div>
          </div>
        )}

        {/* ═══════════════════════ لوگو و عنوان ═══════════════════════ */}
        <div className="text-center mb-6 animate-in fade-in slide-in-from-top-2 duration-700">
          <div className="inline-flex items-center justify-center relative mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] rounded-3xl shadow-2xl shadow-purple-300/50 flex items-center justify-center transform hover:scale-105 transition-transform duration-300">
              <span className="text-4xl font-black text-white">S</span>
            </div>
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full border-4 border-white shadow-md" />
            <span className="absolute -bottom-1 -left-1 w-6 h-6 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full border-4 border-white shadow-md flex items-center justify-center">
              <Shield className="w-3 h-3 text-white" />
            </span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-1">
            پنل مدیریت <span className="bg-gradient-to-l from-[#7C7BEB] to-[#5B5AC7] bg-clip-text text-transparent">کلان</span>
          </h1>
          <p className="text-xs text-gray-500 flex items-center justify-center gap-1.5">
            <Sparkles className="w-3 h-3 text-amber-500" />
            ShopAccounting نسخه {toFaNum('8.8.5')}
          </p>

          {/* ★ پیام خوش‌آمد ویژه هنگام redirect */}
          {redirectTo && redirectTo !== '/admin/dashboard' && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-[11px] font-bold">
              <AlertCircle className="w-3.5 h-3.5" />
              برای دسترسی به این صفحه، ابتدا وارد شوید
            </div>
          )}
        </div>

        {/* ═══════════════════════ کارت فرم ═══════════════════════ */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl shadow-purple-500/10 border border-white/60 p-6 sm:p-8 animate-in fade-in slide-in-from-top-4 duration-700">
          
          {/* هدر فرم */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-l from-[#EEEDFD] to-[#F5F4FF] rounded-full text-[11px] font-bold text-[#7C7BEB] mb-3">
              <Lock className="w-3 h-3" />
              ورود امن
            </div>
            <h2 className="text-base font-black text-gray-900">به پنل خود خوش آمدید</h2>
            <p className="text-[11px] text-gray-500 mt-1">برای ادامه، اطلاعات کاربری خود را وارد کنید</p>
          </div>

          {/* پیام خطا */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-100 flex items-start gap-2 animate-in fade-in shake duration-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* نام کاربری */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-1.5">
                <User className="w-3.5 h-3.5 text-[#7C7BEB]" />
                نام کاربری
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 pr-10 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-[#7C7BEB]/10 focus:border-[#7C7BEB] outline-none transition text-sm bg-gray-50/50 focus:bg-white disabled:opacity-60"
                  placeholder="نام کاربری خود را وارد کنید"
                  required
                  disabled={loading}
                  autoComplete="username"
                  autoFocus
                />
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* رمز عبور */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-1.5">
                <Lock className="w-3.5 h-3.5 text-[#7C7BEB]" />
                رمز عبور
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-10 pl-10 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-[#7C7BEB]/10 focus:border-[#7C7BEB] outline-none transition text-sm bg-gray-50/50 focus:bg-white disabled:opacity-60"
                  placeholder="رمز عبور خود را وارد کنید"
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#7C7BEB] transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'مخفی کردن رمز' : 'نمایش رمز'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* دکمه ورود */}
            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="w-full bg-gradient-to-l from-[#7C7BEB] to-[#5B5AC7] hover:shadow-xl hover:shadow-purple-300/50 hover:-translate-y-0.5 text-white font-black py-3.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none text-sm flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال ورود...</span>
                </>
              ) : (
                <>
                  <span>ورود به پنل</span>
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* اطلاعات امنیتی */}
          <div className="mt-6 pt-5 border-t border-gray-100">
            <div className="flex items-center justify-center gap-4 text-[10px] text-gray-500">
              <div className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-500" />
                <span>اتصال امن SSL</span>
              </div>
              <span className="text-gray-300">•</span>
              <div className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-[#7C7BEB]" />
                <span>رمزنگاری JWT</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════ فوتر ═══════════════════════ */}
        <div className="text-center mt-6 space-y-1">
          <p className="text-[11px] text-gray-500">
            © {toFaNum(new Date().getFullYear())} ShopAccounting — تمامی حقوق محفوظ است
          </p>
          <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            سیستم حسابداری فروشگاهی هوشمند
          </p>
        </div>
      </div>

      {/* ═══════════════════════ استایل‌های کمکی ═══════════════════════ */}
      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-in { animation: fade-in 0.3s ease-out; }

        @keyframes slide-in-from-top-2 {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .slide-in-from-top-2 { animation: slide-in-from-top-2 0.5s ease-out; }

        @keyframes slide-in-from-top-4 {
          from { opacity: 0; transform: translateY(-16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .slide-in-from-top-4 { animation: slide-in-from-top-4 0.7s ease-out; }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .shake { animation: shake 0.3s ease-in-out; }
      `}</style>
    </div>
  );
}