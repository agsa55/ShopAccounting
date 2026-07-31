'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (formData.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' });
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setMessage({ type: 'error', text: 'رمز عبور جدید و تکرار آن مطابقت ندارند.' });
      return;
    }

    setIsLoading(true);

    try {
      // ★ حذف کامل localStorage. ما به کوکی اعتماد می‌کنیم چون لاگین جدید فقط کوکی می‌سازد.
      // مرورگر به صورت خودکار کوکی 'token' را در درخواست‌های هم‌اصل (same-origin) ارسال می‌کند.
      
      const res = await fetch('/api/admin/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // ★ اطمینان از ارسال کوکی‌ها
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'خطا در تغییر رمز عبور');
      }

      setMessage({ type: 'success', text: 'رمز عبور با موفقیت تغییر کرد.' });
      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });

      setTimeout(() => router.push('/admin/dashboard'), 2000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'خطا در تغییر رمز عبور.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto" dir="rtl">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] rounded-lg flex items-center justify-center shrink-0 shadow-sm shadow-purple-200">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-800 leading-tight">تغییر رمز عبور</h1>
            <p className="text-[11px] text-gray-500 mt-0.5">به‌روزرسانی رمز عبور حساب کاربری</p>
          </div>
        </div>

        {message && (
          <div className={`px-3 py-2 rounded-lg text-xs mb-4 flex items-center gap-2 border ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            <span className="text-sm leading-none">{message.type === 'success' ? '✓' : '⚠'}</span>
            <span className="font-medium">{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">رمز عبور فعلی</label>
            <input
              type="password"
              name="currentPassword"
              value={formData.currentPassword}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition text-sm bg-gray-50/50 focus:bg-white"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">رمز عبور جدید</label>
            <input
              type="password"
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              required
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition text-sm bg-gray-50/50 focus:bg-white"
              placeholder="حداقل ۶ کاراکتر"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">تکرار رمز جدید</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition text-sm bg-gray-50/50 focus:bg-white"
              placeholder="••••••••"
            />
          </div>

          <div className="pt-2 flex gap-2">
            <Link
              href="/admin/dashboard"
              className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-xs font-medium text-center"
            >
              انصراف
            </Link>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-3 py-2 bg-[#7C7BEB] text-white rounded-lg hover:bg-[#6a69d9] transition text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-sm shadow-purple-200"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>در حال پردازش...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>ذخیره تغییرات</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <p className="text-[10px] text-gray-400 text-center mt-3">
        پس از تغییر رمز، به صورت خودکار به داشبورد هدایت می‌شوید
      </p>
    </div>
  );
}