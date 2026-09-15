'use client';

import { useEffect, useState } from 'react';
import {
  Trash2, RefreshCw, Loader2, AlertTriangle, CheckCircle2, XCircle,
  Shield, Clock, Database, Eye, Zap, Calendar
} from 'lucide-react';

const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰';
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

const formatPersianDateTime = (dateStr: string | null): string => {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(dateStr));
  } catch {
    return '—';
  }
};

export default function AutoCleanupPage() {
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [days, setDays] = useState(7);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  
  // نتایج حذف
  const [deleteResults, setDeleteResults] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dryRunMode, setDryRunMode] = useState(true);

  // بارگذاری کاندیدها
  const loadCandidates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/auto-cleanup?days=${days}`);
      const data = await res.json();
      
      if (data.success) {
        setCandidates(data.data || []);
        setStats(data.stats);
        setLastFetched(new Date().toISOString());
      } else {
        alert('خطا: ' + data.error);
      }
    } catch (error) {
      console.error('[AutoCleanup] Load error:', error);
      alert('خطای شبکه');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCandidates() }, []);

  // اجرای حذف خودکار
  const runAutoCleanup = async () => {
    if (!dryRunMode) {
      if (!confirm(
        `⚠️ هشدار جدی!\n\n` +
        `در حال حذف دائمی ${toFaNum(candidates.length)} فروشگاه هستید.\n` +
        `این عمل غیرقابل بازگشت است.\n\n` +
        `آیا مطمئن هستید؟`
      )) return;
    }

    setIsDeleting(true);
    setDeleteResults(null);
    
    try {
      const res = await fetch('/api/admin/tenants/auto-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days, dryRun: dryRunMode }),
      });
      const data = await res.json();
      
      if (data.success) {
        setDeleteResults(data.data);
        // بعد از حذف واقعی، لیست را رفرش کن
        if (!dryRunMode) {
          setTimeout(() => loadCandidates(), 1000);
        }
      } else {
        alert('خطا: ' + data.error);
      }
    } catch (error) {
      console.error('[AutoCleanup] Execute error:', error);
      alert('خطای شبکه');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 p-4 sm:p-6" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* ═══════════════════════ هدر ═══════════════════════ */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/20">
              <Trash2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">
                مدیریت <span className="bg-gradient-to-l from-red-500 to-rose-600 bg-clip-text text-transparent">حذف خودکار</span>
              </h1>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <Shield className="w-3 h-3" />
                پاک‌سازی فروشگاه‌های بدون استفاده
                {lastFetched && (
                  <>
                    <span className="text-gray-300">•</span>
                    <Clock className="w-3 h-3" />
                    آخرین بروزرسانی: {formatPersianDateTime(lastFetched)}
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={loadCandidates}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all text-xs font-medium shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'در حال...' : 'به‌روزرسانی'}
          </button>
        </div>

        {/* ═══════════════════════ هشدار و تنظیمات ═══════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* تنظیمات */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#7C7BEB]" />
              تنظیمات حذف
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                  تعداد روز بدون فعالیت:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={days}
                    onChange={(e) => setDays(parseInt(e.target.value) || 7)}
                    className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition text-sm text-center"
                  />
                  <span className="text-xs text-gray-500">روز</span>
                  <div className="flex gap-1 mr-auto">
                    {[3, 7, 14, 30, 60, 90].map(d => (
                      <button
                        key={d}
                        onClick={() => setDays(d)}
                        className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                          days === d 
                            ? 'bg-[#7C7BEB] text-white' 
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {toFaNum(d)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dryRunMode}
                    onChange={(e) => setDryRunMode(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#7C7BEB] focus:ring-[#7C7BEB]"
                  />
                  <span className="text-xs text-gray-700">حالت تست (فقط پیش‌نمایش، حذف واقعی نمی‌شود)</span>
                </label>
              </div>
            </div>
          </div>

          {/* آمار */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-[#7C7BEB]" />
              آمار کلی
            </h3>
            
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-center">
                <p className="text-[10px] text-red-700 font-medium">کاندید حذف</p>
                <p className="text-lg font-black text-red-800" dir="ltr">
                  {stats ? toFaNum(stats.totalCandidates) : '—'}
                </p>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
                <p className="text-[10px] text-amber-700 font-medium">رکوردهای در معرض حذف</p>
                <p className="text-lg font-black text-amber-800" dir="ltr">
                  {stats ? toFaNum(stats.totalRecordsAtRisk) : '—'}
                </p>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center">
                <p className="text-[10px] text-blue-700 font-medium">قدیمی‌ترین فعالیت</p>
                <p className="text-[10px] font-bold text-blue-800" dir="ltr">
                  {stats?.oldestLastActivity ? formatPersianDateTime(stats.oldestLastActivity) : '—'}
                </p>
              </div>
            </div>

            <button
              onClick={runAutoCleanup}
              disabled={loading || isDeleting || candidates.length === 0}
              className={`w-full mt-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                dryRunMode
                  ? 'bg-gradient-to-l from-blue-500 to-indigo-600 text-white hover:shadow-lg'
                  : 'bg-gradient-to-l from-red-600 to-red-800 text-white hover:shadow-lg'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال پردازش...</span>
                </>
              ) : (
                <>
                  {dryRunMode ? <Eye className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                  <span>
                    {dryRunMode 
                      ? `پیش‌نمایش ${toFaNum(candidates.length)} فروشگاه کاندید`
                      : `حذف دائمی ${toFaNum(candidates.length)} فروشگاه`
                    }
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ═══════════════════════ نتایج حذف ═══════════════════════ */}
        {deleteResults && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-l from-[#7C7BEB] to-[#5B5AC7] px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="text-sm font-black">
                  {deleteResults.dryRun ? 'نتایج پیش‌نمایش' : 'نتایج حذف'}
                </h3>
              </div>
            </div>
            
            <div className="p-4">
              {deleteResults.dryRun ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-800 mb-2">
                    <strong>حالت تست:</strong> {toFaNum(deleteResults.totalProcessed)} فروشگاه کاندید حذف شناسایی شدند (حذف واقعی انجام نشد)
                  </p>
                  {deleteResults.candidates?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {deleteResults.candidates.map((c: any) => (
                        <div key={c.id} className="bg-white rounded px-2 py-1.5 text-[11px] flex items-center justify-between">
                          <span className="font-bold">{c.companyName}</span>
                          <span className="text-gray-500">
                            {toFaNum(c.productsCount)} محصول • {toFaNum(c.customersCount)} مشتری • {toFaNum(c.invoicesCount)} فاکتور
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" />
                      موفق: <strong>{toFaNum(deleteResults.successful)}</strong>
                    </span>
                    {deleteResults.failed > 0 && (
                      <span className="flex items-center gap-1 text-red-700">
                        <XCircle className="w-4 h-4" />
                        ناموفق: <strong>{toFaNum(deleteResults.failed)}</strong>
                      </span>
                    )}
                    <span className="text-gray-500 mr-auto">
                      زمان: {toFaNum(deleteResults.durationMs)} میلی‌ثانیه
                    </span>
                  </div>

                  {deleteResults.failures?.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-xs text-red-800 font-bold mb-2">خطاها:</p>
                      {deleteResults.failures.map((f: any) => (
                        <div key={f.tenantId} className="text-[11px] text-red-700">
                          <strong>{f.companyName}:</strong> {f.error}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════ لیست کاندیدها ═══════════════════════ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-l from-slate-50 to-red-50/30 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              فروشگاه‌های کاندید حذف ({toFaNum(candidates.length)})
            </h3>
          </div>

          {candidates.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-green-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-gray-700 text-sm font-bold mb-1">
                هیچ فروشگاهی برای حذف یافت نشد
              </p>
              <p className="text-gray-500 text-xs">
                {days} روز بدون فعالیت در میان فروشگاه‌های واجد شرایط وجود ندارد
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-[11px] font-bold text-gray-700">فروشگاه</th>
                    <th className="px-4 py-2 text-[11px] font-bold text-gray-700 hidden md:table-cell">ساب‌دامین</th>
                    <th className="px-4 py-2 text-[11px] font-bold text-gray-700">روزهای بدون فعالیت</th>
                    <th className="px-4 py-2 text-[11px] font-bold text-gray-700 hidden lg:table-cell">آخرین فعالیت</th>
                    <th className="px-4 py-2 text-[11px] font-bold text-gray-700">داده‌ها</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {candidates.map((c: any) => (
                    <tr key={c.id} className="hover:bg-red-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center text-white font-bold text-xs">
                            {(c.companyName || 'ف')[0]}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-900 truncate">{c.companyName}</p>
                            <p className="text-[10px] text-gray-500 font-mono" dir="ltr">{c.ownerMobile}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-[10px] text-gray-700 font-mono bg-gray-100 px-2 py-0.5 rounded" dir="ltr">
                          {c.subDomain}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                          c.daysWithoutActivity > 30 
                            ? 'bg-red-100 text-red-700 border border-red-200' 
                            : c.daysWithoutActivity > 14 
                              ? 'bg-orange-100 text-orange-700 border border-orange-200' 
                              : 'bg-amber-100 text-amber-700 border border-amber-200'
                        }`}>
                          <Clock className="w-3 h-3" />
                          {toFaNum(c.daysWithoutActivity)} روز
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <p className="text-[10px] text-gray-600">
                          {formatPersianDateTime(c.lastActivityAt)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-[10px] text-gray-600">
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded" title="محصولات">
                            📦 {toFaNum(c._count?.Products || 0)}
                          </span>
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded" title="مشتریان">
                            👥 {toFaNum(c._count?.Customers || 0)}
                          </span>
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded" title="فاکتورها">
                            🧾 {toFaNum(c._count?.Invoices || 0)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ═══════════════════════ فوتر ═══════════════════════ */}
        <div className="text-center text-[9px] text-gray-400 pt-3 border-t border-gray-100">
          <p>مدیریت حذف خودکار — نسخه {toFaNum('11.5.0')}</p>
        </div>

      </div>
    </div>
  );
}