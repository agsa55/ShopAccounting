'use client';

// ============================================================================
// src/components/admin/admin-transactions-page.tsx (v13.0 ★★★)
// ★ v13.0: نمایش مبلغ خالص، ناخالص، کارمزد، نوع تراکنش، وضعیت تست
// ★ v13.0: نمایش حمایت به‌جای پلن برای تراکنش‌های donation
// ★ v13.0: مودال جزئیات برای کارت، refId، authority، تسویه و توضیحات
// ============================================================================

import { useEffect, useState } from 'react';
import {
  Wallet, CreditCard, DollarSign, RefreshCw, Calendar, Clock,
  Search, Download, ChevronDown, Filter, TrendingUp, CheckCircle2,
  XCircle, Clock3, Banknote, Store, X,
  Activity, Zap, Shield, ChevronRight, ChevronLeft,
  Heart, Ban, ClipboardCheck, Loader2, FlaskConical, Receipt,
  Hash, Smartphone, Info, Undo2,
  ScanSearch,
  Copy,
} from 'lucide-react';

// ★ تابع کمکی برای تبدیل اعداد به فارسی
const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰';
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

// ★ فرمت عدد با جداکننده هزارگان فارسی
const formatNumberFa = (num: number | string | null | undefined): string => {
  const n = typeof num === 'string' ? parseInt(num, 10) || 0 : Math.round(Number(num) || 0);
  return toFaNum(n.toLocaleString('en-US'));
};

// ★ تاریخ شمسی دقیق
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

const formatPersianDateTime = (isoDate: string | Date | null | undefined): { date: string; time: string } => {
  if (!isoDate) return { date: '—', time: '—' };
  try {
    const d = new Date(isoDate);
    const date = d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
    const time = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    return { date: toFaNum(date), time: toFaNum(time) };
  } catch {
    return { date: '—', time: '—' };
  }
};

// ★ پلن‌ها
const getPlanInfo = (planName: string): { label: string; icon: string; color: string; bg: string; border: string } => {
  const p = (planName || '').toLowerCase();
  if (p.includes('enterprise') || p.includes('حرفه') || p.includes('سازمانی') || p.includes('شرکتی')) return {
    label: 'شرکتی', icon: '🥇', color: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-200'
  };
  if (p.includes('professional') || p.includes('پیشرفته') || p.includes('فروشگاهی')) return {
    label: 'فروشگاهی', icon: '🥈', color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-200'
  };
  return {
    label: 'پایه', icon: '🥉', color: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200'
  };
};

// ★ نوع تراکنش
const getTypeInfo = (t: any): { label: string; icon: any; color: string; bg: string; border: string } => {
  const type = String(t?.type || '').toLowerCase();

  if (type === 'manual_card') {
    return { label: 'کارت‌به‌کارت', icon: Banknote, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' };
  }

  if (type === 'donation') {
    return { label: 'حمایت', icon: Heart, color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' };
  }

  if (type === 'subscription_update') {
    return { label: 'به‌روزرسانی اشتراک', icon: RefreshCw, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' };
  }

  return { label: 'نامشخص', icon: Wallet, color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' };
};

const getStatusInfo = (t: any): { label: string; color: string; bg: string; border: string; icon: any } => {
  if (t.isPaid || t.status === 'paid') return {
    label: 'موفق',
    color: 'text-emerald-700',
    bg: 'bg-emerald-100',
    border: 'border-emerald-200',
    icon: CheckCircle2,
  };

  if (t.status === 'waiting_review') return {
    label: 'در انتظار بررسی',
    color: 'text-amber-700',
    bg: 'bg-amber-100',
    border: 'border-amber-200',
    icon: Clock3,
  };

  if (t.status === 'rejected') return {
    label: 'رد شده',
    color: 'text-red-700',
    bg: 'bg-red-100',
    border: 'border-red-200',
    icon: Ban,
  };

  if (t.status === 'failed') return {
    label: 'ناموفق',
    color: 'text-red-700',
    bg: 'bg-red-100',
    border: 'border-red-200',
    icon: XCircle,
  };

  if (t.status === 'cancelled') return {
    label: 'لغو شده',
    color: 'text-gray-700',
    bg: 'bg-gray-100',
    border: 'border-gray-200',
    icon: XCircle,
  };

  if (t.status === 'reversed') return {
    label: 'برگشت خورده',
    color: 'text-orange-700',
    bg: 'bg-orange-100',
    border: 'border-orange-200',
    icon: Undo2,
  };

  return {
    label: 'در انتظار',
    color: 'text-amber-700',
    bg: 'bg-amber-100',
    border: 'border-amber-200',
    icon: Clock3,
  };
};

// ★ تشخیص درگاه پرداخت
const getGatewayInfo = (t: any): { label: string; icon: any; color: string; bg: string } => {
  const gateway = String(t?.gatewayType || '').toLowerCase();
  const method = String(t?.paymentMethod || '').toLowerCase();
  const description = String(t?.description || '').toLowerCase();

  if (gateway === 'manual_card' || method.includes('manual_card') || description.includes('manual_card')) {
    return { label: 'کارت‌به‌کارت', icon: Banknote, color: 'text-amber-600', bg: 'bg-amber-50' };
  }

  if (gateway === 'zarinpal' || method.includes('zarinpal')) {
    return { label: 'زرین‌پال', icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-50' };
  }

  if (gateway === 'donation' || description.includes('donation')) {
    return { label: 'حمایت', icon: Heart, color: 'text-rose-600', bg: 'bg-rose-50' };
  }

  return { label: t?.gatewayType || method || 'نامشخص', icon: CreditCard, color: 'text-gray-600', bg: 'bg-gray-50' };
};

// ★ برچسب پلن/هدف تراکنش
function getPlanOrPurposeLabel(t: any) {
  if (String(t?.type || '').toLowerCase() === 'donation') {
    return {
      label: 'حمایت',
      icon: '❤️',
      color: 'text-rose-700',
      bg: 'bg-rose-100',
      border: 'border-rose-200',
    };
  }

  if (String(t?.type || '').toLowerCase() === 'manual_card') {
    const plan = getPlanInfo(t.tierName || t.tenantPlanName || '');
    return {
      label: plan.label && plan.label !== 'پایه' ? plan.label : 'کارت‌به‌کارت',
      icon: '🏦',
      color: 'text-amber-700',
      bg: 'bg-amber-100',
      border: 'border-amber-200',
    };
  }

  const plan = getPlanInfo(t.tierName || t.tenantPlanName || '');
  return {
    label: plan.label,
    icon: plan.icon,
    color: plan.color,
    bg: plan.bg,
    border: plan.border,
  };
}

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    totalRevenue: 0, monthlyRevenue: 0, todayRevenue: 0,
    todayCount: 0, totalCount: 0, avgTransaction: 0,
    pendingReviewCount: 0, totalFee: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1, pageSize: 20, totalCount: 0, totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [currentTime, setCurrentTime] = useState(getPersianTime());

  // ★ review modal state
  const [reviewPayment, setReviewPayment] = useState<any | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewUnlock, setReviewUnlock] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);

  // ★ details modal state
  const [detailPayment, setDetailPayment] = useState<any | null>(null);
const [inquiryBusyId, setInquiryBusyId] = useState<string | null>(null);
const [reverseBusyId, setReverseBusyId] = useState<string | null>(null);
const [inquiryResult, setInquiryResult] = useState<any | null>(null);

const [reverseModal, setReverseModal] = useState<{
  open: boolean;
  payment: any | null;
  phase: 'confirm' | 'processing' | 'success' | 'error';
  confirmText: string;
  result?: any;
  error?: string;
  hint?: string;
}>({
  open: false,
  payment: null,
  phase: 'confirm',
  confirmText: '',
});
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getPersianTime()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async (pageNum = 1, size = pagination.pageSize) => {
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        pageSize: String(size),
      });

      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (planFilter !== 'all') params.set('plan', planFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (timeFilter !== 'all') params.set('time', timeFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      const res = await fetch(`/api/admin/transactions?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setTransactions(data.data || []);
        if (data.pagination) setPagination(data.pagination);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('[Transactions] loadData error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData() }, []);

  useEffect(() => {
    if (!loading) loadData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, planFilter, typeFilter, timeFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData(pagination.page);
  };

  const openReviewModal = (payment: any, action: 'approve' | 'reject') => {
    setReviewPayment(payment);
    setReviewAction(action);
    setReviewNote('');
    setReviewUnlock(Boolean(payment?.tenantIsLocked));
  };

  const closeReviewModal = () => {
    setReviewPayment(null);
    setReviewNote('');
    setReviewUnlock(false);
    setReviewLoading(false);
  };

  const submitReview = async () => {
    if (!reviewPayment) return;

    setReviewLoading(true);
    try {
      const res = await fetch(`/api/admin/payments/${reviewPayment.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: reviewAction,
          note: reviewNote,
          unlock: reviewAction === 'approve' ? reviewUnlock : false,
        }),
      });

      const data = await res.json();

      if (data.success) {
        alert(data.message || 'عملیات با موفقیت انجام شد.');
        closeReviewModal();
        loadData(pagination.page);
      } else {
        alert(data.error || 'خطا در انجام عملیات.');
      }
    } catch (err) {
      console.error('[Review Payment] Error:', err);
      alert('خطای شبکه. لطفاً دوباره تلاش کنید.');
    } finally {
      setReviewLoading(false);
    }
  };

  const openDetails = (payment: any) => {
    setDetailPayment(payment);
  };

  const closeDetails = () => {
    setDetailPayment(null);
  };

  const handleExportCSV = () => {
 const headers = [
  'فروشگاه',
  'ساب‌دامین',
  'موبایل',
  'نوع تراکنش',
  'پلن/هدف',
  'محیط',
  'مبلغ ناخالص (تومان)',
  'کارمزد (تومان)',
  'مبلغ خالص (تومان)',
  'درگاه',
  'وضعیت',
  'تاریخ',
  'ساعت',
  'RefID',
  'Authority',
  'کارت واریزکننده',
  'توضیحات',
];

    const rows = transactions.map(t => {
      const type = getTypeInfo(t);
      const purpose = getPlanOrPurposeLabel(t);
      const gateway = getGatewayInfo(t);
      const status = getStatusInfo(t);
      const { date, time } = formatPersianDateTime(t.paidAt || t.verifiedAt || t.createdAt);

      return [
        t.tenantName || '',
        t.tenantSubdomain || '',
        t.tenantMobile || '',
        type.label,
        purpose.label,
        t.isSandbox ? 'تستی' : 'عملیاتی',
        Number(t.grossAmount || t.amount) || 0,
        Number(t.fee) || 0,
        Number(t.netAmount || t.amount) || 0,
        gateway.label,
        status.label,
        date,
        time,
       t.refId || t.paymentRef || '',
        t.authority || '',
        t.cardPan || '',
        (t.description || '').replace(/\n/g, ' '),
      ];
    });

    const csv = [headers, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `platform-transactions-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const mainStatCards: Array<{
    title: string;
    value: number | string;
    icon: any;
    gradient: string;
    subtitle: string;
    isCount?: boolean;
  }> = [
    {
      title: 'درآمد خالص کل',
      value: stats.totalRevenue,
      icon: DollarSign,
      gradient: 'from-emerald-500 to-teal-600',
      subtitle: 'مجموع مبالغ واریزی به حساب پس از کسر کارمزد',
    },
    {
      title: 'درآمد خالص ماه',
      value: stats.monthlyRevenue,
      icon: TrendingUp,
      gradient: 'from-blue-500 to-indigo-600',
      subtitle: 'پرداخت‌های موفق این ماه',
    },
    {
      title: 'درآمد خالص امروز',
      value: stats.todayRevenue,
      icon: Zap,
      gradient: 'from-amber-500 to-orange-500',
      subtitle: `${toFaNum(stats.todayCount)} تراکنش امروز`,
    },
    {
      title: 'تراکنش‌های موفق',
      value: stats.totalCount,
      icon: CheckCircle2,
      gradient: 'from-emerald-500 to-green-600',
      subtitle: 'تعداد کل پرداخت‌های موفق',
      isCount: true,
    },
    {
      title: 'در انتظار بررسی',
      value: stats.pendingReviewCount || 0,
      icon: Clock3,
      gradient: 'from-orange-500 to-amber-600',
      subtitle: 'پرداخت‌های کارت‌به‌کارت',
      isCount: true,
    },
    {
      title: 'مجموع کارمزد',
      value: stats.totalFee || 0,
      icon: Receipt,
      gradient: 'from-rose-500 to-pink-600',
      subtitle: 'کارمزد کسرشده از تراکنش‌های موفق',
    },
  ];

  const startIndex = (pagination.page - 1) * pagination.pageSize;
  const endIndex = Math.min(startIndex + pagination.pageSize, pagination.totalCount);

  const getPageNumbers = () => {
    const { totalPages, page } = pagination;
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');

      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);

      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50/30">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-emerald-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Wallet className="w-8 h-8 text-emerald-500" />
            </div>
          </div>
          <h3 className="text-base font-bold text-gray-700 mb-1">در حال بارگذاری تراکنش‌ها...</h3>
          <p className="text-xs text-gray-500">لطفاً چند لحظه صبر کنید</p>
        </div>
      </div>
    );
  }

const getInquiryTone = (
  status: string | null | undefined
): {
  label: string;
  icon: any;
  color: string;
  bg: string;
  border: string;
} => {
  const s = String(status || '').toUpperCase();

  if (s === 'VERIFIED') {
    return {
      label: 'تأیید شده',
      icon: CheckCircle2,
      color: 'text-emerald-700',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
    };
  }

  if (s === 'PAID') {
    return {
      label: 'پرداخت شده / تأیید نشده',
      icon: Clock3,
      color: 'text-amber-700',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
    };
  }

  if (s === 'IN_BANK') {
    return {
      label: 'در بانک / در حال پردازش',
      icon: CreditCard,
      color: 'text-blue-700',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
    };
  }

  if (s === 'FAILED') {
    return {
      label: 'ناموفق',
      icon: XCircle,
      color: 'text-red-700',
      bg: 'bg-red-50',
      border: 'border-red-200',
    };
  }

  if (s === 'REVERSED') {
    return {
      label: 'برگشت خورده',
      icon: Undo2,
      color: 'text-orange-700',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
    };
  }

  return {
    label: 'نامشخص',
    icon: Info,
    color: 'text-gray-700',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  };
};

  const getInquiryStatusLabel = (status: string | null | undefined): string => {
  const s = String(status || '').toUpperCase();

  if (s === 'VERIFIED') return 'تأیید شده';
  if (s === 'PAID') return 'پرداخت شده / تأیید نشده';
  if (s === 'IN_BANK') return 'در بانک / در حال پردازش';
  if (s === 'FAILED') return 'ناموفق';
  if (s === 'REVERSED') return 'برگشت خورده';

  return '—';
};

const getReverseEligibility = (t: any): {
  show: boolean;
  eligible: boolean;
  minutesElapsed: number | null;
  remainingMinutes: number | null;
  title: string;
} => {
  const isZarinpal = String(t?.gatewayType || '').toLowerCase() === 'zarinpal';
  const hasAuthority = Boolean(t?.authority);
  const isPaid = Boolean(t?.isPaid || t?.status === 'paid');
  const isReversed = t?.status === 'reversed';

  const show = isZarinpal && hasAuthority && isPaid && !isReversed;

  if (!show) {
    return {
      show: false,
      eligible: false,
      minutesElapsed: null,
      remainingMinutes: null,
      title: 'این تراکنش قابل ریورس نیست.',
    };
  }

  const candidates = [t.paidAt, t.verifiedAt, t.createdAt].filter(Boolean);

  if (candidates.length === 0) {
    return {
      show: true,
      eligible: false,
      minutesElapsed: null,
      remainingMinutes: null,
      title: 'زمان پرداخت مشخص نیست؛ امکان ریورس وجود ندارد.',
    };
  }

  const latest = candidates
    .map((d) => new Date(d as string))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const diffMs = Date.now() - latest.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const eligible = diffMinutes <= 30;
  const remainingMinutes = Math.max(0, 30 - diffMinutes);

  if (eligible) {
    return {
      show: true,
      eligible: true,
      minutesElapsed: diffMinutes,
      remainingMinutes,
      title:
        remainingMinutes === 0
          ? 'ریورس مجاز است — دقایق پایانی'
          : `ریورس مجاز است — ${toFaNum(remainingMinutes)} دقیقه فرصت باقی است`,
    };
  }

  return {
    show: true,
    eligible: false,
    minutesElapsed: diffMinutes,
    remainingMinutes: 0,
    title: `امکان ریورس وجود ندارد — ${toFaNum(diffMinutes)} دقیقه از پرداخت گذشته است. حداکثر مهلت ریورس ۳۰ دقیقه است.`,
  };
};

const canReversePayment = (t: any): boolean => {
  return getReverseEligibility(t).eligible;
};

const handleInquiry = async (payment: any) => {
  if (!payment?.id) return;

  setInquiryBusyId(payment.id);

  try {
    const res = await fetch(`/api/admin/payments/${payment.id}/inquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();

    if (data.success) {
      setInquiryResult({
        success: true,
        payment,
        result: data.data || {},
      });

      // جدول را به‌روز کن تا وضعیت استعلام در لیست هم دیده شود
      loadData(pagination.page);
    } else {
      setInquiryResult({
        success: false,
        payment,
        error: data.error || 'خطا در استعلام وضعیت.',
      });
    }
  } catch (err) {
    console.error('[Inquiry] Error:', err);
    setInquiryResult({
      success: false,
      payment,
      error: 'خطای شبکه در استعلام وضعیت.',
    });
  } finally {
    setInquiryBusyId(null);
  }
};
const openReverseModal = (payment: any) => {
  if (!canReversePayment(payment)) return;

  setReverseModal({
    open: true,
    payment,
    phase: 'confirm',
    confirmText: '',
    result: undefined,
    error: undefined,
    hint: undefined,
  });
};

const closeReverseModal = () => {
  setReverseModal({
    open: false,
    payment: null,
    phase: 'confirm',
    confirmText: '',
    result: undefined,
    error: undefined,
    hint: undefined,
  });
};

const submitReverse = async () => {
  const payment = reverseModal.payment;

  if (!payment?.id) return;
  if (reverseModal.confirmText.trim() !== 'REVERSE') return;

  setReverseModal((prev) => ({
    ...prev,
    phase: 'processing',
    error: undefined,
    hint: undefined,
  }));

  setReverseBusyId(payment.id);

  try {
    const res = await fetch(`/api/admin/payments/${payment.id}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmText: 'REVERSE' }),
    });

    const data = await res.json();

    if (data.success) {
      setReverseModal((prev) => ({
        ...prev,
        phase: 'success',
        result: data.data || {},
      }));

      loadData(pagination.page);
    } else {
      setReverseModal((prev) => ({
        ...prev,
        phase: 'error',
        error: data.error || 'خطا در ریورس تراکنش.',
        hint: data.data?.hint,
      }));
    }
  } catch (err) {
    console.error('[Reverse] Error:', err);

    setReverseModal((prev) => ({
      ...prev,
      phase: 'error',
      error: 'خطای شبکه در ریورس تراکنش.',
    }));
  } finally {
    setReverseBusyId(null);
  }
};
const copyText = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    alert(`${label} کپی شد.`);
  } catch {
    alert('کپی ممکن نبود.');
  }
};
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 p-4 sm:p-6" dir="rtl">
      <div className="max-w-[1800px] mx-auto space-y-5">

        {/* ═══════════════════════ هدر ═══════════════════════ */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">
                درآمد <span className="bg-gradient-to-l from-emerald-600 to-teal-600 bg-clip-text text-transparent">پلتفرم</span>
              </h1>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <Calendar className="w-3 h-3" />
                {getPersianDate()}
                <span className="text-gray-300">•</span>
                <Clock className="w-3 h-3" />
                {currentTime}
                <span className="text-gray-300">•</span>
                <span className="text-gray-600">{toFaNum(pagination.totalCount)} تراکنش</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all text-xs font-medium shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              خروجی CSV
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all text-xs font-medium shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'در حال...' : 'به‌روزرسانی'}
            </button>
          </div>
        </div>

        {/* ═══════════════════════ کارت‌های آماری ═══════════════════════ */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {mainStatCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className="group relative bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 overflow-hidden"
              >
                <div className={`h-1 bg-gradient-to-l ${card.gradient}`}></div>
                <div className="p-3.5">
                  <div className="flex items-start justify-between mb-2">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="text-white" style={{ width: '18px', height: '18px' }} />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-gray-500 font-medium leading-tight">{card.title}</p>
                    <div className="flex items-baseline gap-1">
                      <p className="text-base sm:text-lg font-black text-gray-900 tracking-tight" dir="ltr">
                        {formatNumberFa(card.value)}
                      </p>
                      {!card.isCount && (
                        <span className="text-[9px] text-gray-400 font-medium">تومان</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 leading-tight">{card.subtitle}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══════════════════════ فیلترها ═══════════════════════ */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="جستجوی فروشگاه، ساب‌دامین، موبایل، کد پیگیری یا کارت..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadData(1)}
                className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-sm bg-gray-50/50 focus:bg-white"
              />
              {searchTerm && (
                <button
                  onClick={() => { setSearchTerm(''); setTimeout(() => loadData(1), 100); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="relative shrink-0">
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full md:w-48 pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-sm bg-gray-50/50 focus:bg-white appearance-none cursor-pointer"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="paid">✅ موفق</option>
                <option value="waiting_review">⏳ در انتظار بررسی</option>
                <option value="pending">⏳ در انتظار</option>
                <option value="failed">❌ ناموفق</option>
                <option value="cancelled">🚫 لغو شده</option>
                <option value="rejected">⛔ رد شده</option>
                <option value="reversed">↩️ برگشت خورده</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative shrink-0">
              <Heart className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full md:w-48 pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-sm bg-gray-50/50 focus:bg-white appearance-none cursor-pointer"
              >
                <option value="all">همه انواع</option>
                <option value="donation">❤️ حمایت</option>
                <option value="subscription_update">🔄 به‌روزرسانی اشتراک</option>
                <option value="manual_card">🏦 کارت‌به‌کارت</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative shrink-0">
              <Store className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="w-full md:w-40 pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-sm bg-gray-50/50 focus:bg-white appearance-none cursor-pointer"
              >
                <option value="all">همه پلن‌ها</option>
                <option value="simple">🥉 پایه</option>
                <option value="professional">🥈 فروشگاهی</option>
                <option value="enterprise">🥇 شرکتی</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative shrink-0">
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="w-full md:w-40 pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-sm bg-gray-50/50 focus:bg-white appearance-none cursor-pointer"
              >
                <option value="all">همه زمان‌ها</option>
                <option value="today">امروز</option>
                <option value="week">هفته اخیر</option>
                <option value="month">ماه اخیر</option>
                <option value="year">سال اخیر</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {(searchTerm || statusFilter !== 'all' || planFilter !== 'all' || typeFilter !== 'all' || timeFilter !== 'all') && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-[11px] text-gray-600">
                  <span className="font-bold text-emerald-600">{toFaNum(pagination.totalCount)}</span> تراکنش یافت شد
                </p>
                <div className="h-3 w-px bg-gray-200"></div>
                <p className="text-[11px] text-gray-600">
                  مجموع خالص این صفحه: <span className="font-bold text-gray-900" dir="ltr">
                    {formatNumberFa(transactions.filter(t => t.isPaid || t.status === 'paid').reduce((s, t) => s + Number(t.netAmount || t.amount || 0), 0))}
                  </span> تومان
                </p>
              </div>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setPlanFilter('all');
                  setTypeFilter('all');
                  setTimeFilter('all');
                }}
                className="text-[10px] font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                پاک کردن فیلترها
              </button>
            </div>
          )}
        </div>

        {/* ═══════════════════════ جدول تراکنش‌ها ═══════════════════════ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-gradient-to-l from-slate-50 to-emerald-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700">فروشگاه / حمایت</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden md:table-cell">نوع</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden lg:table-cell">پلن / هدف</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700">مبلغ خالص</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden xl:table-cell">درگاه</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700">وضعیت</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden 2xl:table-cell">تاریخ و ساعت</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 hidden 2xl:table-cell">کد پیگیری / کارت</th>
                  <th className="px-4 py-3 font-bold text-[11px] text-gray-700 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map(t => {
                  const type = getTypeInfo(t);
                  const purpose = getPlanOrPurposeLabel(t);
                  const status = getStatusInfo(t);
                  const gateway = getGatewayInfo(t);
                  const StatusIcon = status.icon;
                  const TypeIcon = type.icon;
                  const GatewayIcon = gateway.icon;
                  const { date, time } = formatPersianDateTime(t.paidAt || t.verifiedAt || t.createdAt);

                  const gross = Number(t.grossAmount || t.amount || 0);
                  const net = Number(t.netAmount || t.amount || 0);
                  const fee = Number(t.fee || 0);

                  const canReview =
                    t.source === 'online' &&
                    String(t.gatewayType || '').toLowerCase() === 'manual_card' &&
                    t.status === 'waiting_review';
                    const reverseEligibility = getReverseEligibility(t);

                  return (
                    <tr key={`${t.source}-${t.id}`} className="hover:bg-gray-50/70 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${
                            t.isPaid || t.status === 'paid' ? 'from-emerald-500 to-teal-600' :
                            t.status === 'failed' || t.status === 'rejected' ? 'from-red-500 to-rose-600' :
                            t.status === 'waiting_review' ? 'from-amber-500 to-orange-500' :
                            'from-amber-500 to-orange-500'
                          } flex items-center justify-center text-white font-bold text-xs shrink-0`}>
                            {(t.tenantName || 'ح')[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-bold text-gray-900 truncate">
                                {t.type === 'donation' ? 'حمایت عمومی' : (t.tenantName || 'بدون نام')}
                              </p>
                              {t.isSandbox && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-purple-700 bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded">
                                  <FlaskConical className="w-3 h-3" />
                                  تستی
                                </span>
                              )}
                            </div>
                            {t.type !== 'donation' && (
                              <>
                                <p className="text-[10px] text-gray-500 font-mono truncate">{t.tenantSubdomain || '—'}</p>
                                {t.tenantMobile && (
                                  <p className="text-[9px] text-gray-400 font-mono truncate" dir="ltr">{t.tenantMobile}</p>
                                )}
                              </>
                            )}
                            {t.type === 'donation' && (
                              <p className="text-[10px] text-gray-500">پرداخت حمایتی از لندینگ پیج</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border w-fit ${type.bg} ${type.color} ${type.border}`}>
                          <TypeIcon className="w-3 h-3" />
                          {type.label}
                        </span>
                      </td>

                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border w-fit ${purpose.bg} ${purpose.color} ${purpose.border}`}>
                          <span className="text-xs">{purpose.icon}</span>
                          {purpose.label}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-gray-900" dir="ltr">
                            {formatNumberFa(net)}
                          </span>
                          <span className="text-[9px] text-gray-400">تومان خالص</span>
                          {fee > 0 && (
                            <div className="mt-1 text-[9px] text-gray-500 leading-tight">
                              <span dir="ltr">کل: {formatNumberFa(gross)}</span>
                              {' • '}
                              <span className="text-rose-600" dir="ltr">کارمزد: {formatNumberFa(fee)}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 hidden xl:table-cell">
                        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${gateway.bg}`}>
                          <GatewayIcon className={`w-3.5 h-3.5 ${gateway.color}`} />
                          <span className={`text-[11px] font-medium ${gateway.color}`}>{gateway.label}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border ${status.bg} ${status.color} ${status.border}`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                        {t.tenantIsLocked && t.type !== 'donation' && (
                          <p className="text-[9px] text-red-600 mt-1">فروشگاه قفل است</p>
                        )}
                        <p className="text-[9px] text-gray-400 mt-1 2xl:hidden">
                          {date} {time}
                        </p>
                      </td>

                      <td className="px-4 py-3 hidden 2xl:table-cell">
                        <div className="flex flex-col">
                          <span className="text-[11px] text-gray-700 font-medium">{date}</span>
                          <span className="text-[9px] text-gray-400">{time}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 hidden 2xl:table-cell">
                        <div className="flex flex-col gap-1">
                          {t.paymentRef ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-mono bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 max-w-[160px] truncate">
                              <Shield className="w-3 h-3 shrink-0" />
                              {t.paymentRef}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400">—</span>
                          )}

                          {t.cardPan && (
                            <span className="inline-flex items-center gap-1 text-[9px] text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded-md border border-gray-200 max-w-[160px] truncate" dir="ltr">
                              <Smartphone className="w-3 h-3 shrink-0" />
                              {t.cardPan}
                            </span>
                          )}
                        </div>
                      </td>

             <td className="px-4 py-3 text-center">
  <div className="inline-flex items-center gap-1">
    <button
      onClick={() => openDetails(t)}
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all text-gray-600 hover:text-white bg-gray-100 hover:bg-gray-700 hover:shadow-md"
      title="جزئیات کامل تراکنش"
    >
      <Info className="w-4 h-4" />
    </button>

    {String(t.gatewayType || '').toLowerCase() === 'zarinpal' && t.authority && (
      <button
        onClick={() => handleInquiry(t)}
        disabled={inquiryBusyId === t.id}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all text-blue-700 hover:text-white bg-blue-50 hover:bg-blue-600 hover:shadow-md disabled:opacity-50"
        title="استعلام وضعیت از زرین‌پال"
      >
        {inquiryBusyId === t.id ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ScanSearch className="w-4 h-4" />
        )}
      </button>
    )}

{reverseEligibility.show && (
  <button
    onClick={() => {
      if (reverseEligibility.eligible) {
        openReverseModal(t);
      }
    }}
    disabled={!reverseEligibility.eligible || reverseBusyId === t.id}
    className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all disabled:cursor-not-allowed ${
      reverseEligibility.eligible
        ? 'text-orange-700 hover:text-white bg-orange-50 hover:bg-orange-600 hover:shadow-md disabled:opacity-50'
        : 'text-gray-400 bg-gray-100 border border-gray-200 opacity-70'
    }`}
    title={reverseEligibility.title}
  >
    {reverseBusyId === t.id ? (
      <Loader2 className="w-4 h-4 animate-spin" />
    ) : (
      <Undo2 className="w-4 h-4" />
    )}
  </button>
)}
    {canReview && (
      <>
        <button
          onClick={() => openReviewModal(t, 'approve')}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all text-emerald-700 hover:text-white bg-emerald-50 hover:bg-emerald-600 hover:shadow-md"
          title="تأیید پرداخت کارت‌به‌کارت"
        >
          <ClipboardCheck className="w-4 h-4" />
        </button>
        <button
          onClick={() => openReviewModal(t, 'reject')}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all text-red-700 hover:text-white bg-red-50 hover:bg-red-600 hover:shadow-md"
          title="رد پرداخت کارت‌به‌کارت"
        >
          <Ban className="w-4 h-4" />
        </button>
      </>
    )}
  </div>
</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ═══════════════════════ صفحه‌بندی ═══════════════════════ */}
          {pagination.totalCount > 0 && (
            <div className="px-4 py-4 bg-gradient-to-l from-slate-50 to-emerald-50/50 border-t border-gray-100">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-gray-600">
                    نمایش <span className="font-bold text-emerald-600">{toFaNum(startIndex + 1)}</span> تا{' '}
                    <span className="font-bold text-emerald-600">{toFaNum(endIndex)}</span> از{' '}
                    <span className="font-bold">{toFaNum(pagination.totalCount)}</span> تراکنش
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">تعداد در هر صفحه:</span>
                    <select
                      value={pagination.pageSize}
                      onChange={(e) => {
                        const newSize = Number(e.target.value);
                        setPagination(p => ({ ...p, pageSize: newSize }));
                        loadData(1, newSize);
                      }}
                      className="px-2 py-1 border border-gray-200 rounded-md text-xs font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition bg-white cursor-pointer"
                    >
                      <option value={10}>۱۰</option>
                      <option value={20}>۲۰</option>
                      <option value={30}>۳۰</option>
                      <option value={50}>۵۰</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => loadData(Math.max(1, pagination.page - 1))}
                    disabled={pagination.page === 1}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    title="صفحه قبل"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </button>

                  <div className="flex items-center gap-1">
                    {getPageNumbers().map((page, idx) => {
                      if (page === '...') {
                        return (
                          <span key={`ellipsis-${idx}`} className="px-2 text-gray-400 text-xs">
                            ...
                          </span>
                        );
                      }
                      const pageNum = page as number;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => loadData(pageNum)}
                          className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold transition-all ${
                            pagination.page === pageNum
                              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                              : 'border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                          }`}
                        >
                          {toFaNum(pageNum)}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => loadData(Math.min(pagination.totalPages, pagination.page + 1))}
                    disabled={pagination.page === pagination.totalPages}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    title="صفحه بعد"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {transactions.length === 0 && (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Wallet className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-gray-700 text-sm font-bold mb-1">
                {searchTerm || statusFilter !== 'all' || planFilter !== 'all' || typeFilter !== 'all' || timeFilter !== 'all'
                  ? 'تراکنشی با این فیلترها یافت نشد'
                  : 'هنوز هیچ تراکنش پلتفرمی ثبت نشده است'}
              </p>
              <p className="text-gray-500 text-xs">
                {searchTerm || statusFilter !== 'all' || planFilter !== 'all' || typeFilter !== 'all' || timeFilter !== 'all'
                  ? 'لطفاً فیلترها را تغییر دهید یا پاک کنید'
                  : 'به محض اولین پرداخت حمایتی، اشتراکی یا کارت‌به‌کارت، تراکنش‌ها در اینجا نمایش داده می‌شوند'}
              </p>
            </div>
          )}
        </div>

        <div className="text-center text-[9px] text-gray-400 pt-3 border-t border-gray-100">
          <p>مدیریت درآمد پلتفرم — نسخه {toFaNum('13.0.0')} — زرین‌پال + کارت‌به‌کارت + حمایت</p>
        </div>

      </div>

      {/* ═══════════════════════ مودال جزئیات تراکنش ═══════════════════════ */}
{detailPayment && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    onClick={closeDetails}
  >
    <div
      className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sticky top-0 bg-gradient-to-l from-slate-800 to-slate-950 px-4 py-3 text-white z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            <h3 className="text-sm font-black">جزئیات کامل تراکنش</h3>
          </div>
          <button
            onClick={closeDetails}
            className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ═══ خلاصه وضعیت ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <DetailRow label="نوع تراکنش" value={getTypeInfo(detailPayment).label} />
          <DetailRow label="وضعیت داخلی" value={getStatusInfo(detailPayment).label} />
          <DetailRow
            label="محیط"
            value={detailPayment.isSandbox ? 'تستی / سندباکس' : 'عملیاتی / واقعی'}
          />
        </div>

        {/* ═══ مالی ═══ */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <p className="text-[11px] font-black text-emerald-900 mb-2">خلاصه مالی</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            <div>
              <p className="text-gray-600">مبلغ ناخالص</p>
              <p className="font-black text-gray-900" dir="ltr">
                {formatNumberFa(detailPayment.grossAmount || detailPayment.amount)} تومان
              </p>
            </div>
            <div>
              <p className="text-gray-600">کارمزد</p>
              <p className="font-black text-rose-700" dir="ltr">
                {formatNumberFa(detailPayment.fee || 0)} تومان
              </p>
            </div>
            <div>
              <p className="text-gray-600">مبلغ خالص دریافتی</p>
              <p className="font-black text-emerald-700" dir="ltr">
                {formatNumberFa(detailPayment.netAmount || detailPayment.amount)} تومان
              </p>
            </div>
          </div>
        </div>

        {/* ═══ هویت پرداخت‌کننده ═══ */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-[11px] font-black text-gray-900 mb-2">هویت پرداخت‌کننده</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DetailRow
              label="فروشگاه / حامی"
              value={
                detailPayment.type === 'donation'
                  ? (detailPayment.payerName || 'حمایت عمومی')
                  : detailPayment.tenantName
              }
            />

            <DetailRow
              label="ساب‌دامین"
              value={detailPayment.tenantSubdomain || '—'}
              mono
            />

            <DetailRow
              label="موبایل ثبت‌شده"
              value={
                detailPayment.type === 'donation'
                  ? (detailPayment.payerMobile || 'ثبت نشده')
                  : (detailPayment.tenantMobile || '—')
              }
              mono
            />

            <DetailRow
              label="ایمیل ثبت‌شده"
              value={
                detailPayment.type === 'donation'
                  ? (detailPayment.payerEmail || 'ثبت نشده')
                  : '—'
              }
              mono
            />

            <DetailRow
              label="کارت واریزکننده از زرین‌پال"
              value={detailPayment.cardPan || 'در دسترس نیست'}
              mono
            />

            <DetailRow
              label="نوع کارمزد"
              value={detailPayment.feeType || '—'}
            />
          </div>

          {detailPayment.cardHash && (
            <div className="mt-3 bg-white border border-gray-200 rounded-lg p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[10px] font-bold text-gray-600 flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  Card Hash
                </p>
                <button
                  onClick={() => copyText(detailPayment.cardHash, 'Card Hash')}
                  className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  کپی
                </button>
              </div>
              <p className="text-[10px] font-mono text-gray-700 break-all" dir="ltr">
                {detailPayment.cardHash}
              </p>
            </div>
          )}

          <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
            نکته: زرین‌پال شماره حساب یا شبا واریزکننده را نمی‌دهد. برای شناسایی کامل حمایت‌ها،
            باید فرم نام/موبایل/ایمیل اهداکننده قبل از پرداخت گرفته شود.
          </p>
        </div>

        {/* ═══ اطلاعات verify زرین‌پال ═══ */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-[11px] font-black text-blue-900 mb-2">اطلاعات تأیید / Verify</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DetailRow label="کد پاسخ Verify" value={String(detailPayment.verifyCode ?? '—')} mono />
            <DetailRow label="پیام Verify" value={detailPayment.verifyMessage || '—'} />
            <DetailRow label="RefID / کد رهگیری" value={detailPayment.refId || detailPayment.paymentRef || '—'} mono />
            <DetailRow label="Authority" value={detailPayment.authority || '—'} mono />
            <DetailRow
              label="Auto Verify"
              value={
                detailPayment.autoVerify === true
                  ? 'خودکار'
                  : detailPayment.autoVerify === false
                    ? 'غیرخودکار'
                    : 'تنظیم پنل / نامشخص'
              }
            />
            <DetailRow label="درگاه" value={getGatewayInfo(detailPayment).label} />
          </div>
        </div>

        {/* ═══ استعلام وضعیت ═══ */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <p className="text-[11px] font-black text-purple-900 mb-2">استعلام وضعیت / Inquiry</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DetailRow
              label="وضعیت در زرین‌پال"
              value={getInquiryStatusLabel(detailPayment.inquiryStatus)}
            />
            <DetailRow label="کد استعلام" value={String(detailPayment.inquiryCode ?? '—')} mono />
            <DetailRow label="پیام استعلام" value={detailPayment.inquiryMessage || '—'} />
            <DetailRow
              label="زمان استعلام"
              value={
                detailPayment.inquiryAt
                  ? `${formatPersianDateTime(detailPayment.inquiryAt).date} ${formatPersianDateTime(detailPayment.inquiryAt).time}`
                  : '—'
              }
            />
          </div>
        </div>

        {/* ═══ ریورس / برگشت ═══ */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <p className="text-[11px] font-black text-orange-900 mb-2">ریورس / برگشت تراکنش</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DetailRow
              label="وضعیت ریورس"
              value={detailPayment.status === 'reversed' ? 'برگشت خورده' : 'انجام نشده'}
              
            />
            <DetailRow
  label="مهلت ریورس"
  value={
    detailPayment.status === 'reversed'
      ? 'برگشت خورده'
      : getReverseEligibility(detailPayment).eligible
        ? `مجاز — ${toFaNum(getReverseEligibility(detailPayment).remainingMinutes ?? 0)} دقیقه باقی‌مانده`
        : 'منقضی شده — حداکثر ۳۰ دقیقه'
  }
/>
            <DetailRow label="کد ریورس" value={String(detailPayment.reverseCode ?? '—')} mono />
            <DetailRow label="پیام ریورس" value={detailPayment.reverseMessage || '—'} />
            <DetailRow
              label="زمان ریورس"
              value={
                detailPayment.reversedAt
                  ? `${formatPersianDateTime(detailPayment.reversedAt).date} ${formatPersianDateTime(detailPayment.reversedAt).time}`
                  : '—'
              }
            />
          </div>

          <p className="text-[10px] text-orange-800 mt-2 leading-relaxed">
            ریورس فقط تا ۳۰ دقیقه بعد از پرداخت موفق ممکن است و نیازمند ثبت IP سرور در پنل زرین‌پال است.
          </p>
        </div>

        {/* ═══ تسویه حساب ═══ */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-[11px] font-black text-slate-900 mb-2">وضعیت تسویه</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <DetailRow label="وضعیت تسویه" value={detailPayment.settlementStatus || 'pending'} />
            <DetailRow
              label="تاریخ تسویه"
              value={formatPersianDateTime(detailPayment.settlementDate).date}
            />
            <DetailRow
              label="کد تسویه"
              value={detailPayment.settlementReferenceId || '—'}
              mono
            />
          </div>
        </div>

        {/* ═══ زمانی ═══ */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-[11px] font-black text-gray-900 mb-2">رویدادهای زمانی</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DetailRow
              label="ایجاد درخواست"
              value={
                detailPayment.createdAt
                  ? `${formatPersianDateTime(detailPayment.createdAt).date} ${formatPersianDateTime(detailPayment.createdAt).time}`
                  : '—'
              }
            />
            <DetailRow
              label="پرداخت / paidAt"
              value={
                detailPayment.paidAt
                  ? `${formatPersianDateTime(detailPayment.paidAt).date} ${formatPersianDateTime(detailPayment.paidAt).time}`
                  : '—'
              }
            />
            <DetailRow
              label="تأیید / verifiedAt"
              value={
                detailPayment.verifiedAt
                  ? `${formatPersianDateTime(detailPayment.verifiedAt).date} ${formatPersianDateTime(detailPayment.verifiedAt).time}`
                  : '—'
              }
            />
            <DetailRow
              label="آخرین به‌روزرسانی"
              value={
                detailPayment.updatedAt
                  ? `${formatPersianDateTime(detailPayment.updatedAt).date} ${formatPersianDateTime(detailPayment.updatedAt).time}`
                  : '—'
              }
            />
          </div>
        </div>

        {/* ═══ توضیحات ═══ */}
        {detailPayment.description && (
          <div className="bg-gray-900 text-gray-100 rounded-lg p-3">
            <p className="text-[10px] font-bold text-gray-400 mb-1">توضیحات / متادیتا</p>
            <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono">
              {detailPayment.description}
            </pre>
          </div>
        )}
      </div>
    </div>
  </div>
)}

{/* ═══════════════════════ مودال نتیجه استعلام وضعیت ═══════════════════════ */}
{inquiryResult && (() => {
  const tone = getInquiryTone(inquiryResult.result?.inquiryStatus);
  const ToneIcon = tone.icon;
  const payment = inquiryResult.payment || {};
  const result = inquiryResult.result || {};

  const inquiryTime = result.inquiryAt
    ? formatPersianDateTime(result.inquiryAt)
    : { date: '—', time: '—' };

  const gross = Number(payment.grossAmount || payment.amount || 0);
  const fee = Number(payment.fee || 0);
  const net = Number(payment.netAmount || payment.amount || 0);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => setInquiryResult(null)}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`px-4 py-3 text-white ${
            inquiryResult.success
              ? 'bg-gradient-to-l from-blue-600 to-indigo-700'
              : 'bg-gradient-to-l from-red-600 to-rose-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScanSearch className="w-5 h-5" />
              <h3 className="text-sm font-black">
                {inquiryResult.success ? 'نتیجه استعلام وضعیت' : 'خطای استعلام وضعیت'}
              </h3>
            </div>
            <button
              onClick={() => setInquiryResult(null)}
              className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {inquiryResult.success ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-gray-600">
                  وضعیت در زرین‌پال
                </span>

                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold border ${tone.bg} ${tone.color} ${tone.border}`}
                >
                  <ToneIcon className="w-3.5 h-3.5" />
                  {result.inquiryStatusLabel || tone.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MiniField
                  label="کد پاسخ"
                  value={String(result.inquiryCode ?? '—')}
                  mono
                />

                <MiniField
                  label="وضعیت داخلی"
                  value={getStatusInfo(payment).label}
                />

                <MiniField
                  label="زمان استعلام"
                  value={`${inquiryTime.date} ${inquiryTime.time}`}
                />

                <MiniField
                  label="درگاه"
                  value={getGatewayInfo(payment).label}
                />

                <MiniField
                  label="Authority"
                  value={result.authority || payment.authority || '—'}
                  mono
                  span
                />

                <MiniField
                  label="RefID"
                  value={result.refId || payment.refId || payment.paymentRef || '—'}
                  mono
                  span
                />
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-[11px] font-black text-emerald-900 mb-2">
                  خلاصه مالی
                </p>

                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <p className="text-gray-600">ناخالص</p>
                    <p className="font-black text-gray-900" dir="ltr">
                      {formatNumberFa(gross)}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-600">کارمزد</p>
                    <p className="font-black text-rose-700" dir="ltr">
                      {formatNumberFa(fee)}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-600">خالص</p>
                    <p className="font-black text-emerald-700" dir="ltr">
                      {formatNumberFa(net)}
                    </p>
                  </div>
                </div>
              </div>

              {result.inquiryMessage && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-blue-800 mb-1">
                    پیام سرویس
                  </p>
                  <p className="text-[11px] text-blue-900 leading-relaxed break-words">
                    {result.inquiryMessage}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-[11px] font-black text-red-900 mb-1">
                خطا
              </p>
              <p className="text-[11px] text-red-800 leading-relaxed break-words">
                {inquiryResult.error}
              </p>
            </div>
          )}

          <button
            onClick={() => setInquiryResult(null)}
            className="w-full px-3 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all text-xs font-bold"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
})()}

{/* ═══════════════════════ مودال ریورس تراکنش ═══════════════════════ */}
{reverseModal.open && reverseModal.payment && (() => {
  const payment = reverseModal.payment as any;
  const result = reverseModal.result || {};
  const phase = reverseModal.phase;

  const isProcessing = phase === 'processing';
  const isSuccess = phase === 'success';
  const isError = phase === 'error';
  const isConfirm = phase === 'confirm';

const normalizedConfirmText = reverseModal.confirmText.trim().toLowerCase();

const canSubmit =
  ['بازگشت', 'reverse'].includes(normalizedConfirmText) &&
  !isProcessing;

  const gross = Number(payment.grossAmount || payment.amount || 0);
  const fee = Number(payment.fee || 0);
  const net = Number(payment.netAmount || payment.amount || 0);

  const paidTime = formatPersianDateTime(
    payment.paidAt || payment.verifiedAt || payment.createdAt
  );

  const reversedTime = result.reversedAt
    ? formatPersianDateTime(result.reversedAt)
    : { date: '—', time: '—' };

  const headerGradient = isError
    ? 'from-red-600 to-rose-700'
    : isSuccess
      ? 'from-emerald-600 to-teal-700'
      : isProcessing
        ? 'from-blue-600 to-indigo-700'
        : 'from-orange-500 to-amber-600';

  const HeaderIcon = isError
    ? XCircle
    : isSuccess
      ? CheckCircle2
      : isProcessing
        ? Loader2
        : Undo2;

  const showIpHint =
    isError &&
    (
      reverseModal.hint ||
      reverseModal.error ||
      ''
    ).toString().toLowerCase().includes('ip');

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
      onClick={isProcessing ? undefined : closeReverseModal}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`px-4 py-3 text-white bg-gradient-to-l ${headerGradient}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeaderIcon
                className={`w-5 h-5 ${isProcessing ? 'animate-spin' : ''}`}
              />
              <h3 className="text-sm font-black">
            {isConfirm && 'بازگشت تراکنش'}
       {isProcessing && 'در حال بازگشت تراکنش...'}
        {isSuccess && 'بازگشت موفق'}
             {isError && 'خطای بازگشت تراکنش'}
              </h3>
            </div>

            <button
              onClick={closeReverseModal}
              disabled={isProcessing}
              className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* ═══ حالت تأیید ═══ */}
          {isConfirm && (
            <>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-orange-900 leading-relaxed">
                    <p className="font-black mb-1">توجه مهم</p>
                    <ul className="list-disc pr-4 space-y-1">
                      <li>
                        ریورس فقط برای تراکنش‌های موفق زرین‌پال و حداکثر تا ۳۰ دقیقه
                        بعد از پرداخت ممکن است.
                      </li>
                      <li>
                        مبلغ بدون کارمزد به حساب خریدار بازگردانده می‌شود.
                      </li>
                      <li>
                        برای استفاده از ریورس، IP سرور باید در پنل زرین‌پال ثبت شده
                        باشد. در غیر این صورت خطای <span dir="ltr">-62</span> دریافت
                        می‌کنید.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-gray-600">
                    فروشگاه / حامی
                  </span>
                  <span className="text-xs font-black text-gray-900">
                    {payment.type === 'donation'
                      ? (payment.payerName || 'حمایت عمومی')
                      : (payment.tenantName || 'نامشخص')}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-gray-600">
                    مبلغ خالص تراکنش
                  </span>
                  <span className="text-sm font-black text-gray-900" dir="ltr">
                    {formatNumberFa(net)} تومان
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="bg-white border border-gray-200 rounded-lg p-2">
                    <p className="text-gray-500 font-bold mb-0.5">ناخالص</p>
                    <p className="font-black text-gray-900" dir="ltr">
                      {formatNumberFa(gross)}
                    </p>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-2">
                    <p className="text-gray-500 font-bold mb-0.5">کارمزد</p>
                    <p className="font-black text-rose-700" dir="ltr">
                      {formatNumberFa(fee)}
                    </p>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-2">
                    <p className="text-gray-500 font-bold mb-0.5">خالص</p>
                    <p className="font-black text-emerald-700" dir="ltr">
                      {formatNumberFa(net)}
                    </p>
                  </div>
                </div>

                <MiniField
                  label="Authority"
                  value={payment.authority || '—'}
                  mono
                  span
                />

                <MiniField
                  label="RefID"
                  value={payment.refId || payment.paymentRef || '—'}
                  mono
                  span
                />

                <MiniField
                  label="زمان پرداخت"
                  value={`${paidTime.date} ${paidTime.time}`}
                />
              </div>

            <div>
  <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
    برای تأیید نهایی، عبارت زیر را دقیقاً تایپ کنید:
    <span className="mr-1 font-black text-orange-700">بازگشت</span>
  </label>

  <input
    type="text"
    value={reverseModal.confirmText}
    onChange={(e) =>
      setReverseModal((prev) => ({
        ...prev,
        confirmText: e.target.value,
      }))
    }
    onKeyDown={(e) => {
      if (e.key === 'Enter' && canSubmit) {
        submitReverse();
      }
    }}
    disabled={isProcessing}
    placeholder="بازگشت"
    dir="rtl"
    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition text-sm bg-gray-50/50 focus:bg-white disabled:opacity-60"
  />

  <p className="text-[10px] text-gray-500 mt-1.5">
    این عملیات غیرقابل بازگشت است و مبلغ به حساب خریدار بازگردانده می‌شود.
  </p>
</div>
            </>
          )}

          {/* ═══ حالت در حال پردازش ═══ */}
          {isProcessing && (
            <div className="py-10 text-center space-y-3">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Undo2 className="w-7 h-7 text-blue-600" />
                </div>
              </div>

              <p className="text-sm font-black text-gray-800">
                در حال ارسال درخواست ریورس به زرین‌پال...
              </p>

              <p className="text-[11px] text-gray-500">
                لطفاً صفحه را نبندید و مرورگر را رفرش نکنید.
              </p>
            </div>
          )}

          {/* ═══ حالت موفق ═══ */}
          {isSuccess && (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>

                <p className="text-sm font-black text-emerald-900 mb-1">
                  {result.message || 'تراکنش با موفقیت برگشت خورد.'}
                </p>

                <p className="text-[11px] text-emerald-700">
                  مبلغ به حساب خریدار بازگردانده شد.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MiniField
                  label="کد پاسخ"
                  value={String(result.code ?? '—')}
                  mono
                />

                <MiniField
                  label="زمان ریورس"
                  value={`${reversedTime.date} ${reversedTime.time}`}
                />

                <MiniField
                  label="Authority"
                  value={payment.authority || '—'}
                  mono
                  span
                />

                <MiniField
                  label="مبلغ برگشتی"
                  value={`${formatNumberFa(net)} تومان`}
                  span
                />
              </div>
            </>
          )}

          {/* ═══ حالت خطا ═══ */}
          {isError && (
            <>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                  <XCircle className="w-8 h-8 text-red-600" />
                </div>

                <p className="text-sm font-black text-red-900 mb-1">
                  ریورس تراکنش انجام نشد
                </p>

                <p className="text-[11px] text-red-700 break-words">
                  {reverseModal.error || 'خطای ناشناخته.'}
                </p>
              </div>

              {showIpHint && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-[11px] font-black text-orange-900 mb-1">
                    احتمال خطای IP
                  </p>
                  <p className="text-[11px] text-orange-800 leading-relaxed">
                    طبق مستندات زرین‌پال، برای ریورس باید IP سرور شما در پنل زرین‌پال
                    ثبت شده باشد. به مسیر زیر بروید:
                  </p>
                  <p className="text-[11px] font-bold text-orange-900 mt-1" dir="rtl">
                    پنل زرین‌پال ← تنظیمات درگاه ← IP سرور
                  </p>
                </div>
              )}

              {reverseModal.hint && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-blue-800 mb-1">
                    راهنما
                  </p>
                  <p className="text-[11px] text-blue-900 leading-relaxed break-words">
                    {reverseModal.hint}
                  </p>
                </div>
              )}
            </>
          )}

          {/* ═══ دکمه‌ها ═══ */}
          <div className="pt-1 flex items-center gap-2">
            {isConfirm && (
              <>
                <button
                  onClick={closeReverseModal}
                  disabled={isProcessing}
                  className="flex-1 px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-xs font-bold disabled:opacity-50"
                >
                  انصراف
                </button>

                <button
                  onClick={submitReverse}
                  disabled={!canSubmit}
                  className="flex-1 px-3 py-2.5 text-white rounded-lg hover:shadow-lg transition-all text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 bg-gradient-to-l from-orange-500 to-amber-600"
                >
                  <Undo2 className="w-3.5 h-3.5" />
    <span>بازگشت تراکنش</span>
                </button>
              </>
            )}

            {isProcessing && (
              <button
                disabled
                className="w-full px-3 py-2.5 bg-gray-200 text-gray-500 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>در حال پردازش...</span>
              </button>
            )}

            {isSuccess && (
              <button
                onClick={closeReverseModal}
                className="w-full px-3 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all text-xs font-bold"
              >
                بستن
              </button>
            )}

            {isError && (
              <>
                <button
                  onClick={() =>
                    setReverseModal((prev) => ({
                      ...prev,
                      phase: 'confirm',
                      error: undefined,
                      hint: undefined,
                    }))
                  }
                  className="flex-1 px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-xs font-bold"
                >
                  تلاش مجدد
                </button>

                <button
                  onClick={closeReverseModal}
                  className="flex-1 px-3 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all text-xs font-bold"
                >
                  بستن
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
})()}

      {/* ═══════════════════════ مودال تأیید / رد پرداخت ═══════════════════════ */}
      {reviewPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={reviewLoading ? undefined : closeReviewModal}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`px-4 py-3 text-white ${reviewAction === 'approve' ? 'bg-gradient-to-l from-emerald-500 to-teal-600' : 'bg-gradient-to-l from-red-500 to-rose-600'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {reviewAction === 'approve' ? <ClipboardCheck className="w-5 h-5" /> : <Ban className="w-5 h-5" />}
                  <h3 className="text-sm font-black">
                    {reviewAction === 'approve' ? 'تأیید پرداخت کارت‌به‌کارت' : 'رد پرداخت کارت‌به‌کارت'}
                  </h3>
                </div>
                <button
                  onClick={closeReviewModal}
                  disabled={reviewLoading}
                  className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold text-gray-600">فروشگاه</span>
                  <span className="text-xs font-black text-gray-900">{reviewPayment.tenantName}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold text-gray-600">ساب‌دامین</span>
                  <span className="text-[11px] font-mono text-gray-700" dir="ltr">{reviewPayment.tenantSubdomain || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-gray-600">مبلغ خالص</span>
                  <span className="text-sm font-black text-gray-900" dir="ltr">
                    {formatNumberFa(reviewPayment.netAmount || reviewPayment.amount)} تومان
                  </span>
                </div>
              </div>

              {reviewPayment.description && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-blue-800 mb-1">توضیحات ثبت‌شده</p>
                  <p className="text-[11px] text-blue-900 leading-relaxed whitespace-pre-line break-words">
                    {reviewPayment.description}
                  </p>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                  یادداشت ادمین (اختیاری)
                </label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  rows={3}
                  placeholder="مثلاً: رسید بانکی بررسی شد و مبلغ صحیح واریز شده است."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition text-xs resize-none"
                />
              </div>

              {reviewAction === 'approve' && reviewPayment.tenantIsLocked && (
                <label className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reviewUnlock}
                    onChange={(e) => setReviewUnlock(e.target.checked)}
                    className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-[11px] text-amber-900 leading-relaxed">
                    همزمان قفل این فروشگاه باز شود.
                    {reviewPayment.tenantLockReason && (
                      <span className="block mt-1 text-[10px] text-amber-700">
                        دلیل قفل: {reviewPayment.tenantLockReason}
                      </span>
                    )}
                  </span>
                </label>
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-[10px] text-gray-600 leading-relaxed">
                  {reviewAction === 'approve'
                    ? 'با تأیید، این پرداخت به وضعیت موفق تغییر می‌کند و اشتراک فروشگاه فعال می‌شود.'
                    : 'با رد، این درخواست به وضعیت رد شده تغییر می‌کند و اشتراک فعال نمی‌شود.'}
                </p>
              </div>
            </div>

            <div className="px-4 pb-4 flex items-center gap-2">
              <button
                onClick={closeReviewModal}
                disabled={reviewLoading}
                className="flex-1 px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-xs font-bold disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                onClick={submitReview}
                disabled={reviewLoading}
                className={`flex-1 px-3 py-2.5 text-white rounded-lg hover:shadow-lg transition-all text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                  reviewAction === 'approve'
                    ? 'bg-gradient-to-l from-emerald-500 to-teal-600'
                    : 'bg-gradient-to-l from-red-500 to-rose-600'
                }`}
              >
                {reviewLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>در حال...</span>
                  </>
                ) : (
                  <>
                    {reviewAction === 'approve' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                    <span>{reviewAction === 'approve' ? 'تأیید پرداخت' : 'رد پرداخت'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg p-2.5">
      <p className="text-[10px] font-bold text-gray-500 mb-0.5">{label}</p>
      <p className={`text-[11px] font-bold text-gray-900 break-words ${mono ? 'font-mono' : ''}`} dir={mono ? 'ltr' : 'rtl'}>
        {value || '—'}
      </p>
    </div>
  );
}

function MiniField({
  label,
  value,
  mono = false,
  span = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  span?: boolean;
}) {
  return (
    <div
      className={`bg-gray-50 border border-gray-100 rounded-lg p-2 ${
        span ? 'col-span-2' : ''
      }`}
    >
      <p className="text-[10px] font-bold text-gray-500 mb-0.5">{label}</p>
      <p
        className={`text-[11px] font-bold text-gray-900 break-all ${
          mono ? 'font-mono' : ''
        }`}
        dir={mono ? 'ltr' : 'rtl'}
      >
        {value || '—'}
      </p>
    </div>
  );
}