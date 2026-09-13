'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Store, Loader2, Phone, RefreshCw, Calendar, Clock,
  Filter, SlidersHorizontal, Crown, Building2,
  CheckCircle2, XCircle, AlertTriangle,
  Eye, MoreVertical, Download, ChevronDown,
  ChevronRight, ChevronLeft,
  Rocket, BadgeCheck, Lock, Unlock, Trash2, Edit,
  Info, ShieldAlert, X
} from 'lucide-react';

// ★ تابع کمکی برای تبدیل اعداد به فارسی
const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰';
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

// ★ فرمت عدد با جداکننده هزارگان فارسی
const formatNumberFa = (num: number | string | null | undefined): string => {
  const n = typeof num === 'string' ? parseInt(num, 10) || 0 : (num || 0);
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

// ★ محاسبه روزهای باقی‌مانده
const getDaysRemaining = (expiryDate: string): number => {
  try {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
};

// ★ تاریخ شمسی برای نمایش
const formatPersianDateTime = (dateStr: string | null): string => {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(date);
  } catch {
    return '—';
  }
};

// ★ تعیین پلن بر اساس نام
const getPlanInfo = (planName: string) => {
  const p = (planName || '').toLowerCase();
  if (p.includes('enterprise') || p.includes('سازمانی')) return {
    label: 'حرفه‌ای', color: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-200', icon: '🥇'
  };
  if (p.includes('professional') || p.includes('حرفه') || p.includes('پیشرفته')) return {
    label: 'پیشرفته', color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-200', icon: '🥈'
  };
  return {
    label: 'پایه', color: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200', icon: '🥉'
  };
};

// ★ وضعیت فروشگاه
const getStatusInfo = (tenant: any) => {
  if (tenant.isLocked) {
    return { label: 'قفل شده', color: 'text-red-700', bg: 'bg-red-100', icon: '🔒' };
  }
  const usageDays = tenant.usageDays || 0;
  if (usageDays <= 90) {
    return { label: 'سه ماهه شروع', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: '🚀' };
  }
  return { label: 'به روز رسانی شده', color: 'text-blue-700', bg: 'bg-blue-100', icon: '✅' };
};

// ★ رنگ‌بندی مدت استفاده
const getUsageInfo = (days: number) => {
  if (days < 30) return {
    color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'تازه‌کار', icon: '🌱'
  };
  if (days < 180) return {
    color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'فعال', icon: '💼'
  };
  if (days < 365) return {
    color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', badge: 'باتجربه', icon: '⭐'
  };
  return {
    color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'وفادار', icon: '🏆'
  };
};

// ★ دلایل پیش‌فرض قفل
const DEFAULT_LOCK_REASONS = [
  { id: 'subscription', label: 'عدم تمدید اشتراک', icon: '💳' },
  { id: 'violation', label: 'نقض قوانین استفاده', icon: '⚠️' },
  { id: 'fraud', label: 'فعالیت مشکوک / تقلب', icon: '🚨' },
  { id: 'abuse', label: 'سوء استفاده از سیستم', icon: '🛑' },
  { id: 'request', label: 'درخواست خود مشتری', icon: '📩' },
  { id: 'test', label: 'تست و بررسی', icon: '🔧' },
  { id: 'other', label: 'سایر دلایل', icon: '📝' },
];

export default function AdminTenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<any[]>([]);
  const [apiStats, setApiStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(getPersianTime());
  const [sortBy, setSortBy] = useState<'default' | 'usage_asc' | 'usage_desc'>('default');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ★ state‌های قفل
  const [lockingId, setLockingId] = useState<string | null>(null);
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockTargetTenant, setLockTargetTenant] = useState<any>(null);
  const [lockReason, setLockReason] = useState('');
  const [lockNote, setLockNote] = useState('');
  const [isProcessingLock, setIsProcessingLock] = useState(false);
  
  // ★ state‌های منوی بیشتر
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<{
    id: string;
    top: number;
    left: number;
    position: 'up' | 'down';
  } | null>(null);

  // ★ state‌های حذف
  const [deleteTargetTenant, setDeleteTargetTenant] = useState<any>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // ★ تایمر ساعت
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getPersianTime()), 60000);
    return () => clearInterval(timer);
  }, []);

  // ★ بستن منو با کلیک بیرون + اسکرول + resize
  useEffect(() => {
    const handleOutside = () => {
      setOpenMenuId(null);
      setMenuCoords(null);
    };
    
    if (openMenuId) {
      document.addEventListener('click', handleOutside);
      window.addEventListener('scroll', handleOutside, true);
      window.addEventListener('resize', handleOutside);
      
      return () => {
        document.removeEventListener('click', handleOutside);
        window.removeEventListener('scroll', handleOutside, true);
        window.removeEventListener('resize', handleOutside);
      };
    }
  }, [openMenuId]);

  const loadData = async () => {
    try {
      const res = await fetch('/api/admin/tenants');
      const data = await res.json();
      if (data.success) {
        setTenants(data.data || []);
        setApiStats(data.stats || null);
      }
    } catch (err) {
      console.error('[Tenants] loadData error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData() }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const filteredTenants = useMemo(() => {
    const filtered = tenants.filter(t => {
      const matchSearch = searchTerm === '' ||
        t.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.subDomain?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.ownerMobile?.includes(searchTerm) ||
        t.ownerNationalCode?.includes(searchTerm) ||
        t.ownerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.email?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchPlan = planFilter === 'all' || t.planName === planFilter;

      const usageDays = t.usageDays || 0;
      let matchStatus = true;
      
      if (statusFilter === 'trial') {
        matchStatus = usageDays <= 90 && !t.isLocked;
      } else if (statusFilter === 'renewed') {
        matchStatus = usageDays > 90 && !t.isLocked;
      } else if (statusFilter === 'locked') {
        matchStatus = t.isLocked === true;
      }

      return matchSearch && matchPlan && matchStatus;
    });

    if (sortBy === 'usage_asc') {
      return [...filtered].sort((a, b) => (a.usageDays || 0) - (b.usageDays || 0));
    } else if (sortBy === 'usage_desc') {
      return [...filtered].sort((a, b) => (b.usageDays || 0) - (a.usageDays || 0));
    }
    return filtered;
  }, [tenants, searchTerm, planFilter, statusFilter, sortBy]);

  const pagination = useMemo(() => {
    const totalItems = filteredTenants.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    const paginatedItems = filteredTenants.slice(startIndex, endIndex);

    return { totalItems, totalPages, currentPage, pageSize, startIndex, endIndex, paginatedItems };
  }, [filteredTenants, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, planFilter, statusFilter, pageSize, sortBy]);

  const stats = useMemo(() => {
    const basicCount = tenants.filter(t =>
      t.planName === 'simple' || t.planName === 'basic' || t.planName === 'پایه'
    ).length;
    const proCount = tenants.filter(t =>
      t.planName === 'professional' || t.planName === 'پیشرفته'
    ).length;
    const enterpriseCount = tenants.filter(t =>
      t.planName === 'enterprise' || t.planName === 'حرفه‌ای'
    ).length;
    const trialCount = tenants.filter(t => (t.usageDays || 0) <= 90 && !t.isLocked).length;
    const renewedCount = tenants.filter(t => (t.usageDays || 0) > 90 && !t.isLocked).length;
    const lockedCount = tenants.filter(t => t.isLocked === true).length;
    const verifiedCount = tenants.filter(t => t.identityVerified === true).length;

    const expiringSoonCount = tenants.filter(t => {
      const days = t.remainingDays !== undefined 
        ? t.remainingDays 
        : getDaysRemaining(t.subscriptionEnd || t.expiresAt || t.planEndDate || '');
      return days <= 7 && days > 0 && t.billingCycle !== 'lifetime';
    }).length;

    const expiredCount = tenants.filter(t => {
      const days = t.remainingDays !== undefined 
        ? t.remainingDays 
        : getDaysRemaining(t.subscriptionEnd || t.expiresAt || t.planEndDate || '');
      return days <= 0 && !t.isPaid && t.billingCycle !== 'lifetime';
    }).length;

    const renewedPaidCount = tenants.filter(t => t.isPaid === true).length;

    return {
      total: tenants.length,
      trial: trialCount,
      renewed: renewedCount,
      basic: basicCount,
      professional: proCount,
      enterprise: enterpriseCount,
      locked: lockedCount,
      verified: verifiedCount,
      expiringSoon: expiringSoonCount,
      expired: expiredCount,
      renewedPaid: renewedPaidCount,
    };
  }, [tenants]);

  const handleImpersonate = async (tenantId: string, subDomain: string) => {
    setImpersonatingId(tenantId);
    
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/impersonate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await res.json();

      if (res.ok && data.success) {
        const keysToRemove = [
          'token', 'refreshToken', 'user', 'tenant',
          'storeName', 'planName', 'shop-accounting-store',
          'portal_token', 'auth-token',
        ];
        keysToRemove.forEach(key => {
          try { localStorage.removeItem(key); } catch (e) {}
        });
        
        Object.keys(localStorage).forEach(key => {
          if (key.includes('wizard') || key.includes('force_')) {
            try { localStorage.removeItem(key); } catch (e) {}
          }
        });
        
        try { sessionStorage.clear(); } catch (e) {}

        const { accessToken, refreshToken, user, tenant } = data.data;
        
        if (accessToken) localStorage.setItem('token', accessToken);
        if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
        if (user) localStorage.setItem('user', JSON.stringify(user));
        if (tenant) {
          localStorage.setItem('tenant', JSON.stringify(tenant));
          localStorage.setItem('storeName', tenant.companyName || '');
          localStorage.setItem('planName', tenant.planName || '');
        }

        const isLocalhost = window.location.hostname === 'localhost' ||
                           window.location.hostname === '127.0.0.1';
        
        const cookieStr = isLocalhost
          ? `tenant-slug=${subDomain}; path=/; max-age=2592000; SameSite=Lax`
          : `tenant-slug=${subDomain}; path=/; max-age=2592000; SameSite=Lax; domain=.${window.location.hostname.split('.').slice(-2).join('.')}`;
        
        try { document.cookie = cookieStr; } catch (e) {}

        window.location.href = '/dashboard';
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

  const openLockModal = (tenant: any) => {
    setLockTargetTenant(tenant);
    setLockReason('');
    setLockNote('');
    setShowLockModal(true);
    setOpenMenuId(null);
    setMenuCoords(null);
  };

  const closeLockModal = () => {
    setShowLockModal(false);
    setLockTargetTenant(null);
    setLockReason('');
    setLockNote('');
  };

  const confirmLock = async () => {
    if (!lockTargetTenant) return;
    
    const finalReason = lockNote.trim() 
      ? `${lockReason} - ${lockNote}` 
      : (lockReason || 'قفل شده توسط مدیریت');
    
    setIsProcessingLock(true);
    try {
      const res = await fetch(`/api/admin/tenants/${lockTargetTenant.id}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: finalReason }),
      });
      const data = await res.json();
      
      if (data.success) {
        closeLockModal();
        loadData();
      } else {
        alert(data.error || 'خطا در قفل کردن');
      }
    } catch (error) {
      console.error('[Lock] Error:', error);
      alert('خطای شبکه. لطفاً دوباره تلاش کنید.');
    } finally {
      setIsProcessingLock(false);
    }
  };

  const handleUnlock = async (tenant: any) => {
    if (!confirm(
      `🔓 باز کردن قفل فروشگاه\n\n` +
      `نام: ${tenant.companyName}\n` +
      `دلیل قفل: ${tenant.lockReason || 'نامشخص'}\n` +
      `تاریخ قفل: ${formatPersianDateTime(tenant.lockedAt)}\n\n` +
      `آیا از باز کردن قفل مطمئن هستید؟`
    )) {
      setOpenMenuId(null);
      setMenuCoords(null);
      return;
    }
    
    setLockingId(tenant.id);
    setOpenMenuId(null);
    setMenuCoords(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/lock`, {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (data.success) {
        loadData();
      } else {
        alert(data.error || 'خطا در باز کردن قفل');
      }
    } catch (error) {
      console.error('[Unlock] Error:', error);
      alert('خطای شبکه. لطفاً دوباره تلاش کنید.');
    } finally {
      setLockingId(null);
    }
  };

  const openDeleteModal = (tenant: any) => {
    setDeleteTargetTenant(tenant);
    setDeleteConfirmText('');
    setOpenMenuId(null);
    setMenuCoords(null);
  };

  const closeDeleteModal = () => {
    setDeleteTargetTenant(null);
    setDeleteConfirmText('');
  };

  const confirmDelete = async () => {
    if (!deleteTargetTenant) return;
    
    if (deleteConfirmText.trim() !== deleteTargetTenant.companyName.trim()) {
      alert('نام فروشگاه به درستی وارد نشده است');
      return;
    }
    
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/tenants/${deleteTargetTenant.id}/delete`, {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (data.success) {
        alert(`✅ فروشگاه "${deleteTargetTenant.companyName}" با موفقیت حذف شد.\nتعداد رکوردهای حذف شده: ${data.data.totalDeleted}`);
        closeDeleteModal();
        loadData();
      } else {
        alert('خطا: ' + (data.error || 'خطای نامشخص'));
      }
    } catch (error) {
      console.error('[Delete] Error:', error);
      alert('خطای شبکه. لطفاً دوباره تلاش کنید.');
    } finally {
      setIsDeleting(false);
    }
  };

 // ★ v11.6.1: موقعیت دقیق منو کنار دکمه سه‌نقطه
// ★ v11.6.2: موقعیت دقیق منوی افقی کنار دکمه
const handleMenuClick = (e: React.MouseEvent, tenantId: string) => {
  e.stopPropagation();
  
  if (openMenuId === tenantId) {
    setOpenMenuId(null);
    setMenuCoords(null);
    return;
  }
  
  const button = e.currentTarget;
  const rect = button.getBoundingClientRect();
  const windowWidth = window.innerWidth;
  
  // ═══ موقعیت دقیق: کنار دکمه (سمت راست در RTL) ═══
  const left = rect.right + 4; // 4 پیکسل فاصله از دکمه
  const top = rect.top - 2; // هم‌تراز با دکمه
  
  // بررسی بیرون‌زدگی از سمت راست
  const menuWidth = 200; // عرض تقریبی منوی افقی
  let finalLeft = left;
  if (left + menuWidth > windowWidth - 8) {
    finalLeft = rect.left - menuWidth - 4; // باز شدن از سمت چپ
  }
  
  setOpenMenuId(tenantId);
  setMenuCoords({ 
    id: tenantId, 
    top, 
    left: finalLeft, 
    position: 'down' 
  });
};

  const handleExportCSV = () => {
    const headers = [
      'نام فروشگاه', 'ساب‌دامین', 'شماره تماس', 'کد ملی', 'احراز هویت',
      'پلن', 'وضعیت', 'روزهای باقی‌مانده', 'مدت استفاده', 'کل روزهای استفاده'
    ];
    const rows = filteredTenants.map(t => [
      t.companyName || '',
      t.subDomain || '',
      t.ownerMobile || '',
      t.ownerNationalCode || '',
      t.identityVerified ? 'احراز شده' : 'تکمیل نشده',
      getPlanInfo(t.planName).label,
      getStatusInfo(t).label,
      t.remainingDays || getDaysRemaining(t.subscriptionEnd || t.expiresAt || t.planEndDate || ''),
      t.usageText || '',
      t.usageDays || 0,
    ]);

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tenants-${Date.now()}.csv`;
    a.click();
  };

  const getPageNumbers = () => {
    const { totalPages, currentPage } = pagination;
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const getPlanPercentage = (count: number): number => {
    if (stats.total === 0) return 0;
    return Math.round((count / stats.total) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-purple-50/30">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-purple-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-[#7C7BEB] animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Store className="w-8 h-8 text-[#7C7BEB]" />
            </div>
          </div>
          <h3 className="text-base font-bold text-gray-700 mb-1">در حال بارگذاری فروشگاه‌ها...</h3>
          <p className="text-xs text-gray-500">لطفاً چند لحظه صبر کنید</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { title: 'کل فروشگاه‌ها', value: stats.total, icon: Store, gradient: 'from-[#7C7BEB] to-[#5B5AC7]', subtitle: 'مجموع کل' },
    { title: 'سه ماهه شروع', value: stats.trial, icon: Rocket, gradient: 'from-emerald-500 to-teal-600', subtitle: 'در دوره سه ماهه اول' },
    { title: 'به روز رسانی شده', value: stats.renewed, icon: BadgeCheck, gradient: 'from-blue-500 to-indigo-600', subtitle: 'ادامه‌دهندگان سیستم' },
    { title: 'احراز هویت شده', value: apiStats?.identity?.verified || stats.verified || 0, icon: BadgeCheck, gradient: 'from-emerald-500 to-green-600', subtitle: 'تأیید شده با شاهکار' },
    { title: 'قفل شده', value: stats.locked, icon: Lock, gradient: 'from-red-500 to-rose-600', subtitle: 'غیرفعال توسط ادمین' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 p-4 sm:p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ═══════════════════════ هدر ═══════════════════════ */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">
                مدیریت <span className="bg-gradient-to-l from-[#7C7BEB] to-[#5B5AC7] bg-clip-text text-transparent">فروشگاه‌ها</span>
              </h1>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <Calendar className="w-3 h-3" />
                {getPersianDate()}
                <span className="text-gray-300">•</span>
                <Clock className="w-3 h-3" />
                ساعت {currentTime}
                <span className="text-gray-300">•</span>
                <span className="text-gray-600">{toFaNum(filteredTenants.length)} فروشگاه</span>
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {statCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className="group relative bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300 overflow-hidden"
              >
                <div className={`h-1 bg-gradient-to-l ${card.gradient}`}></div>
                <div className="p-3.5">
                  <div className="flex items-start justify-between mb-2">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                      <Icon style={{ width: '18px', height: '18px' }} className="text-white" />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-gray-500 font-medium leading-tight">{card.title}</p>
                    <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight" dir="ltr">
                      {formatNumberFa(card.value)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1 leading-tight">{card.subtitle}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══════════════════════ کارت‌های پلن و انقضا ═══════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-gray-500 flex items-center gap-1.5">
              <Crown className="w-3 h-3" />
              توزیع پلن‌ها
            </p>
            
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-white/80 flex items-center justify-center shrink-0 text-base">🥉</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-gray-600 font-medium">پایه</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-black text-gray-800" dir="ltr">{formatNumberFa(stats.basic)}</p>
                      <span className="text-[9px] text-gray-500 font-bold">({toFaNum(getPlanPercentage(stats.basic))}٪)</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-gray-400 rounded-full transition-all duration-500" style={{ width: `${getPlanPercentage(stats.basic)}%` }}></div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-white/80 flex items-center justify-center shrink-0 text-base">🥈</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-blue-700 font-medium">پیشرفته</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-black text-blue-800" dir="ltr">{formatNumberFa(stats.professional)}</p>
                      <span className="text-[9px] text-blue-600 font-bold">({toFaNum(getPlanPercentage(stats.professional))}٪)</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="h-1 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${getPlanPercentage(stats.professional)}%` }}></div>
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-white/80 flex items-center justify-center shrink-0 text-base">🥇</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-purple-700 font-medium">حرفه‌ای</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-black text-purple-800" dir="ltr">{formatNumberFa(stats.enterprise)}</p>
                      <span className="text-[9px] text-purple-600 font-bold">({toFaNum(getPlanPercentage(stats.enterprise))}٪)</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="h-1 bg-purple-100 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${getPlanPercentage(stats.enterprise)}%` }}></div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-bold text-gray-500 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              وضعیت انقضا و تمدید
            </p>
            
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-orange-700 font-medium">در حال انقضا (۷ روز مانده)</p>
                <p className="text-lg font-black text-orange-800" dir="ltr">{formatNumberFa(stats.expiringSoon)}</p>
              </div>
              <div className="text-[9px] text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded font-bold whitespace-nowrap">
                نیاز به اطلاع‌رسانی
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-red-700 font-medium">منقضی شده (نیاز به تمدید)</p>
                <p className="text-lg font-black text-red-800" dir="ltr">{formatNumberFa(stats.expired)}</p>
              </div>
              <div className="text-[9px] text-red-600 bg-red-100 px-1.5 py-0.5 rounded font-bold whitespace-nowrap">
                اقدام فوری
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <BadgeCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-emerald-700 font-medium">پرداخت شده (تمدید موفق)</p>
                <p className="text-lg font-black text-emerald-800" dir="ltr">{formatNumberFa(stats.renewedPaid)}</p>
              </div>
              <div className="text-[9px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded font-bold whitespace-nowrap">
                درآمدزا
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════ فیلترها ═══════════════════════ */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="جستجو بر اساس نام، ساب‌دامین، شماره تماس، کد ملی یا ایمیل..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition text-sm bg-gray-50/50 focus:bg-white"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="relative">
              <SlidersHorizontal className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="w-full md:w-40 pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition text-sm bg-gray-50/50 focus:bg-white appearance-none cursor-pointer"
              >
                <option value="all">همه پلن‌ها</option>
                <option value="simple">پایه</option>
                <option value="professional">پیشرفته</option>
                <option value="enterprise">حرفه‌ای</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative">
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full md:w-48 pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition text-sm bg-gray-50/50 focus:bg-white appearance-none cursor-pointer"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="trial">🚀 سه ماهه شروع</option>
                <option value="renewed">✅ به روز رسانی شده</option>
                <option value="locked">🔒 قفل شده</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {(searchTerm || planFilter !== 'all' || statusFilter !== 'all' || sortBy !== 'default') && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[11px] text-gray-600">
                  <span className="font-bold text-[#7C7BEB]">{toFaNum(filteredTenants.length)}</span> فروشگاه از مجموع{' '}
                  <span className="font-bold">{toFaNum(tenants.length)}</span> فروشگاه یافت شد
                </p>
                {sortBy !== 'default' && (
                  <span className="text-[10px] font-bold text-[#7C7BEB] bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    مرتب‌شده: {sortBy === 'usage_desc' ? 'بیشترین استفاده' : 'کمترین استفاده'}
                  </span>
                )}
              </div>
              <button
                onClick={() => { setSearchTerm(''); setPlanFilter('all'); setStatusFilter('all'); setSortBy('default'); }}
                className="text-[10px] font-medium text-[#7C7BEB] hover:text-[#5B5AC7] flex items-center gap-1"
              >
                <XCircle className="w-3 h-3" />
                پاک کردن فیلترها
              </button>
            </div>
          )}
        </div>

        {/* ═══════════════════════ جدول فروشگاه‌ها ═══════════════════════ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-gradient-to-l from-slate-50 to-purple-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-3 font-bold text-[11px] text-gray-700 whitespace-nowrap">فروشگاه</th>
                  <th className="px-3 py-3 font-bold text-[11px] text-gray-700 hidden md:table-cell whitespace-nowrap">تماس</th>
                  <th className="px-3 py-3 font-bold text-[11px] text-gray-700 hidden lg:table-cell whitespace-nowrap">کد ملی</th>
                  <th className="px-3 py-3 font-bold text-[11px] text-gray-700 whitespace-nowrap">پلن</th>
                  <th className="px-3 py-3 font-bold text-[11px] text-gray-700 whitespace-nowrap">وضعیت</th>
                  <th className="px-3 py-3 font-bold text-[11px] text-gray-700 whitespace-nowrap">
                    <button
                      onClick={() => {
                        setSortBy(prev =>
                          prev === 'default' ? 'usage_desc' :
                          prev === 'usage_desc' ? 'usage_asc' : 'default'
                        );
                      }}
                      className="inline-flex items-center gap-1 hover:text-[#7C7BEB] transition-colors group"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>مدت استفاده</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 font-bold text-[11px] text-gray-700 hidden lg:table-cell whitespace-nowrap">باقی‌مانده</th>
                  <th className="px-3 py-3 font-bold text-[11px] text-gray-700 text-center whitespace-nowrap">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagination.paginatedItems.map((tenant: any) => {
                  const plan = getPlanInfo(tenant.planName || '');
                  const status = getStatusInfo(tenant);
                  const daysLeft = tenant.remainingDays !== undefined
                    ? tenant.remainingDays
                    : getDaysRemaining(tenant.subscriptionEnd || tenant.expiresAt || tenant.planEndDate || '');
                  const isImpersonating = impersonatingId === tenant.id;
                  const usageDays = tenant.usageDays || 0;
                  const usageInfo = getUsageInfo(usageDays);
                  const isLocked = tenant.isLocked === true;

                  return (
                    <tr 
                      key={tenant.id} 
                      className={`hover:bg-gray-50/70 transition-colors group ${
                        isLocked ? 'bg-red-50/40 hover:bg-red-50/70' : ''
                      }`}
                    >
                      {/* ستون فروشگاه */}
                      <td className={`px-3 py-3 ${isLocked ? 'border-r-4 border-red-500' : ''}`}>
                        <div className="flex items-center gap-2.5">
                          <div className={`relative w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 ${
                            isLocked 
                              ? 'bg-gradient-to-br from-red-500 to-rose-600' 
                              : 'bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7]'
                          }`}>
                            {(tenant.companyName || tenant.name || 'ف')[0]}
                            {isLocked && (
                              <div className="absolute -bottom-1 -left-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center border-2 border-white">
                                <Lock className="w-2 h-2 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-bold text-gray-900 truncate">{tenant.companyName || 'بدون نام'}</p>
                              {isLocked && (
                                <span className="text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded border border-red-200 whitespace-nowrap">
                                  قفل 🔒
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-500 truncate">
                              {tenant.ownerName || tenant.owner?.name || tenant.email || '—'}
                            </p>
                            <p className="text-[9px] text-gray-400 font-mono truncate" dir="ltr">
                              {tenant.subDomain}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3 hidden md:table-cell whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-gray-700 font-mono" dir="ltr">
                          <Phone className="w-3 h-3 text-gray-400" />
                          {tenant.ownerMobile || '—'}
                        </div>
                      </td>

                      <td className="px-3 py-3 hidden lg:table-cell whitespace-nowrap">
                        {tenant.ownerNationalCode && tenant.ownerNationalCode !== '—' ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-700 font-mono" dir="ltr">
                              {tenant.ownerNationalCode}
                            </span>
                            {tenant.identityVerified ? (
                              <span 
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-bold"
                                title="احراز هویت شده با شاهکار"
                              >
                                <BadgeCheck className="w-3 h-3" />
                                احراز
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-bold">
                                <AlertTriangle className="w-3 h-3" />
                                ناقص
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-[9px] font-bold">
                            <XCircle className="w-3 h-3" />
                            بدون کد ملی
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border ${plan.bg} ${plan.color} ${plan.border}`}>
                          <span className="text-xs">{plan.icon}</span>
                          {plan.label}
                        </span>
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-md ${status.bg} ${status.color}`}>
                          <span className="text-xs">{status.icon}</span>
                          {status.label}
                        </span>
                        {isLocked && tenant.lockReason && (
                          <p className="text-[9px] text-red-600 mt-1 truncate max-w-[150px]" title={tenant.lockReason}>
                            علت: {tenant.lockReason}
                          </p>
                        )}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <div
                          className={`inline-flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg border ${usageInfo.bg} ${usageInfo.border} min-w-[110px] ${isLocked ? 'opacity-60' : ''}`}
                          title={`ثبت‌نام: ${tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString('fa-IR') : '—'} — کل: ${toFaNum(usageDays)} روز`}
                        >
                          <div className="flex items-center gap-1">
                            <span className="text-xs">{usageInfo.icon}</span>
                            <span className={`text-[11px] font-bold ${usageInfo.color} leading-tight`}>
                              {tenant.usageText || '۰ روز'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1.5 pt-0.5 border-t border-dashed border-current/20">
                            <span className="text-[9px] text-gray-500">
                              {toFaNum(usageDays)} روز
                            </span>
                            <span className={`text-[8px] font-bold ${usageInfo.color} px-1 py-0 rounded bg-white/60`}>
                              {usageInfo.badge}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3 hidden lg:table-cell whitespace-nowrap">
                        {tenant.remainingTimeText ? (
                          <span className={`text-xs font-bold ${
                            tenant.remainingTimeText === 'منقضی شده' ? 'text-red-600' :
                            tenant.remainingTimeText === 'مادام‌العمر' ? 'text-emerald-600' :
                            daysLeft <= 7 ? 'text-orange-600' : 'text-gray-700'
                          }`}>
                            {tenant.remainingTimeText}
                          </span>
                        ) : (
                          <span className={`text-xs font-bold ${
                            daysLeft <= 0 ? 'text-red-600' :
                            daysLeft <= 7 ? 'text-orange-600' : 'text-gray-700'
                          }`}>
                            {daysLeft <= 0 ? 'منقضی شده' : `${toFaNum(daysLeft)} روز`}
                          </span>
                        )}
                      </td>

                      {/* ═══════════════════════ ستون عملیات ═══════════════════════ */}
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* دکمه ورود به داشبورد */}
                          <button
                            onClick={() => handleImpersonate(tenant.id, tenant.subDomain)}
                            disabled={isImpersonating || isLocked}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                              isImpersonating || isLocked
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'text-[#7C7BEB] hover:text-white bg-[#EEEDFD] hover:bg-[#7C7BEB] hover:shadow-md'
                            }`}
                            title={isLocked ? 'فروشگاه قفل است - ابتدا قفل را باز کنید' : 'ورود به داشبورد'}
                          >
                            {isImpersonating ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>

                          {/* دکمه قفل/باز کردن قفل */}
                          {isLocked ? (
                            <button
                              onClick={() => handleUnlock(tenant)}
                              disabled={lockingId === tenant.id}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all text-emerald-700 hover:text-white bg-emerald-50 hover:bg-emerald-600 hover:shadow-md disabled:opacity-50"
                              title={`باز کردن قفل (قفل شده در ${formatPersianDateTime(tenant.lockedAt)})`}
                            >
                              {lockingId === tenant.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Unlock className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => openLockModal(tenant)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all text-red-700 hover:text-white bg-red-50 hover:bg-red-600 hover:shadow-md"
                              title="قفل کردن فروشگاه"
                            >
                              <Lock className="w-4 h-4" />
                            </button>
                          )}

                          {/* ═══════════════════════ دکمه منوی بیشتر (برگشت!) ═══════════════════════ */}
                          <button
                            onClick={(e) => handleMenuClick(e, tenant.id)}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                              openMenuId === tenant.id
                                ? 'text-white bg-[#7C7BEB] shadow-md'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                            }`}
                            title="گزینه‌های بیشتر"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ═══════════════════════ صفحه‌بندی ═══════════════════════ */}
          {pagination.totalItems > 0 && (
            <div className="px-4 py-4 bg-gradient-to-l from-gray-50 to-white border-t border-gray-100">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-gray-600">
                    نمایش <span className="font-bold text-[#7C7BEB]">{toFaNum(pagination.startIndex + 1)}</span> تا{' '}
                    <span className="font-bold text-[#7C7BEB]">{toFaNum(pagination.endIndex)}</span> از{' '}
                    <span className="font-bold">{toFaNum(pagination.totalItems)}</span> فروشگاه
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">تعداد در هر صفحه:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2 py-1 border border-gray-200 rounded-md text-xs font-medium focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition bg-white cursor-pointer"
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
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
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
                          onClick={() => setCurrentPage(pageNum)}
                          className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold transition-all ${
                            currentPage === pageNum
                              ? 'bg-[#7C7BEB] text-white shadow-md shadow-purple-500/20'
                              : 'border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                          }`}
                        >
                          {toFaNum(pageNum)}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(pagination.totalPages, prev + 1))}
                    disabled={currentPage === pagination.totalPages}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {pagination.totalItems === 0 && (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Store className="w-8 h-8 text-[#7C7BEB]" />
              </div>
              <p className="text-gray-700 text-sm font-bold mb-1">
                {searchTerm || planFilter !== 'all' || statusFilter !== 'all'
                  ? 'نتیجه‌ای برای فیلترهای شما یافت نشد'
                  : 'هنوز هیچ فروشگاهی ثبت‌نام نکرده است'}
              </p>
              <p className="text-gray-500 text-xs">
                {searchTerm || planFilter !== 'all' || statusFilter !== 'all'
                  ? 'لطفاً فیلترها را تغییر دهید یا پاک کنید'
                  : 'به محض ثبت‌نام اولین فروشگاه، در اینجا نمایش داده می‌شود'}
              </p>
            </div>
          )}
        </div>

        <div className="text-center text-[9px] text-gray-400 pt-3 border-t border-gray-100">
          <p>مدیریت فروشگاه‌ها — نسخه {toFaNum('11.6.0')}</p>
        </div>

      </div>

      {/* ═══════════════════════ مودال قفل فروشگاه ═══════════════════════ */}
      {showLockModal && lockTargetTenant && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={closeLockModal}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-l from-red-500 to-rose-600 px-4 py-3 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5" />
                  <h3 className="text-sm font-black">قفل کردن فروشگاه</h3>
                </div>
                <button
                  onClick={closeLockModal}
                  className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {(lockTargetTenant.companyName || 'ف')[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 truncate">
                    {lockTargetTenant.companyName}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate" dir="ltr">
                    {lockTargetTenant.ownerMobile}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                  دلیل قفل:
                </label>
                <select
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition text-xs bg-white cursor-pointer"
                >
                  <option value="">-- انتخاب کنید --</option>
                  {DEFAULT_LOCK_REASONS.map((reason) => (
                    <option key={reason.id} value={reason.label}>
                      {reason.icon} {reason.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                  توضیحات (اختیاری):
                </label>
                <input
                  type="text"
                  value={lockNote}
                  onChange={(e) => setLockNote(e.target.value)}
                  placeholder="توضیح کوتاه..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition text-xs"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 flex gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-800 leading-relaxed">
                  کاربران این فروشگاه تا باز شدن قفل قادر به ورود نخواهند بود.
                </p>
              </div>
            </div>

            <div className="px-4 pb-4 flex items-center gap-2">
              <button
                onClick={closeLockModal}
                disabled={isProcessingLock}
                className="flex-1 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-xs font-bold disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                onClick={confirmLock}
                disabled={isProcessingLock || !lockReason.trim()}
                className="flex-1 px-3 py-2 bg-gradient-to-l from-red-500 to-rose-600 text-white rounded-lg hover:shadow-lg transition-all text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {isProcessingLock ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>در حال...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>قفل کردن</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ مودال حذف فروشگاه ═══════════════════════ */}
      {deleteTargetTenant && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={isDeleting ? undefined : closeDeleteModal}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-l from-red-700 to-red-900 px-4 py-3 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trash2 className="w-5 h-5" />
                  <h3 className="text-sm font-black">حذف کامل فروشگاه</h3>
                </div>
                <button
                  onClick={closeDeleteModal}
                  disabled={isDeleting}
                  className="w-7 h-7 rounded-lg hover:bg-white/20 flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-red-800 leading-relaxed">
                    <strong className="font-black block mb-1">⚠️ هشدار جدی!</strong>
                    این عمل <strong>غیرقابل بازگشت</strong> است. تمام اطلاعات فروشگاه شامل:
                    <ul className="mt-2 space-y-0.5 text-[10px]">
                      <li>• محصولات، مشتریان، فاکتورها</li>
                      <li>• حساب‌ها، چک‌ها، پرداخت‌ها</li>
                      <li>• کاربران و تنظیمات</li>
                      <li>• تمام رکوردهای مرتبط</li>
                    </ul>
                    به طور <strong>دائمی</strong> حذف خواهند شد.
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[10px] text-gray-500 mb-1">فروشگاهی که حذف می‌شود:</p>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {(deleteTargetTenant.companyName || 'ف')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">
                      {deleteTargetTenant.companyName}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {deleteTargetTenant.ownerMobile} • {deleteTargetTenant.subDomain}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 mb-1.5 block">
                  برای تأیید، <span className="text-red-600">نام فروشگاه</span> را دقیقاً تایپ کنید:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={deleteTargetTenant.companyName}
                  disabled={isDeleting}
                  className="w-full px-3 py-2 border-2 border-red-200 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition text-xs disabled:opacity-50"
                  dir="rtl"
                />
                {deleteConfirmText && deleteConfirmText.trim() !== deleteTargetTenant.companyName.trim() && (
                  <p className="text-[9px] text-red-600 mt-1 flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    نام وارد شده با نام فروشگاه مطابقت ندارد
                  </p>
                )}
                {deleteConfirmText && deleteConfirmText.trim() === deleteTargetTenant.companyName.trim() && (
                  <p className="text-[9px] text-emerald-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    نام تأیید شد - می‌توانید حذف کنید
                  </p>
                )}
              </div>
            </div>

            <div className="px-4 pb-4 flex items-center gap-2">
              <button
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="flex-1 px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-xs font-bold disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting || deleteConfirmText.trim() !== deleteTargetTenant.companyName.trim()}
                className="flex-1 px-3 py-2.5 bg-gradient-to-l from-red-700 to-red-900 text-white rounded-lg hover:shadow-lg transition-all text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>در حال حذف...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف دائمی</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    {/* ═══════════════════════ منوی بیشتر افقی (Horizontal Menu) ═══════════════════════ */}
{openMenuId && menuCoords && menuCoords.id === openMenuId && (() => {
  const currentTenant = tenants.find(t => t.id === openMenuId);
  if (!currentTenant) return null;
  
  const isTenantLocked = currentTenant.isLocked === true;
  
  return (
    <div 
      className="fixed z-[9999]"
      style={{
        top: `${menuCoords.top}px`,
        left: `${menuCoords.left}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ═══ کانتینر منو با انیمیشن ═══ */}
      <div 
        className="flex items-center gap-1 bg-white rounded-xl shadow-2xl border border-gray-200 p-1.5 overflow-hidden"
        style={{
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
        }}
      >
        {/* ═══ دکمه ورود به داشبورد ═══ */}
        <button
          onClick={() => {
            handleImpersonate(currentTenant.id, currentTenant.subDomain);
            setOpenMenuId(null);
            setMenuCoords(null);
          }}
          disabled={isTenantLocked}
          title="ورود به داشبورد"
          className={`group relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${
            isTenantLocked
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-[#EEEDFD] text-[#7C7BEB] hover:bg-[#7C7BEB] hover:text-white hover:scale-110'
          }`}
        >
          <Eye className="w-4 h-4" />
          {/* Tooltip سفارشی */}
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            ورود به داشبورد
          </span>
        </button>

        {/* ═══ دکمه قفل/باز کردن ═══ */}
        {isTenantLocked ? (
          <button
            onClick={() => {
              handleUnlock(currentTenant);
              setOpenMenuId(null);
              setMenuCoords(null);
            }}
            title="باز کردن قفل"
            className="group relative w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all duration-200 hover:scale-110"
          >
            <Unlock className="w-4 h-4" />
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              باز کردن قفل
            </span>
          </button>
        ) : (
          <button
            onClick={() => {
              openLockModal(currentTenant);
              setOpenMenuId(null);
              setMenuCoords(null);
            }}
            title="قفل کردن"
            className="group relative w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 text-red-700 hover:bg-red-600 hover:text-white transition-all duration-200 hover:scale-110"
          >
            <Lock className="w-4 h-4" />
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              قفل کردن
            </span>
          </button>
        )}

        {/* ═══ دکمه ویرایش ═══ */}
        <button
          title="ویرایش اطلاعات"
          disabled
          className="group relative w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100 text-gray-400 cursor-not-allowed"
        >
          <Edit className="w-4 h-4" />
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            ویرایش (به زودی)
          </span>
        </button>

        {/* ═══ دکمه جزئیات ═══ */}
        <button
          title="مشاهده جزئیات"
          disabled
          className="group relative w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100 text-gray-400 cursor-not-allowed"
        >
          <Info className="w-4 h-4" />
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            جزئیات (به زودی)
          </span>
        </button>

        {/* ═══ جداکننده ═══ */}
        <div className="w-px h-6 bg-gray-200 mx-0.5"></div>

        {/* ═══ دکمه حذف ═══ */}
        <button
          onClick={() => {
            openDeleteModal(currentTenant);
            setOpenMenuId(null);
            setMenuCoords(null);
          }}
          title="حذف کامل"
          className="group relative w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 text-red-700 hover:bg-red-600 hover:text-white transition-all duration-200 hover:scale-110"
        >
          <Trash2 className="w-4 h-4" />
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            حذف کامل
          </span>
        </button>
      </div>
    </div>
  );
})()}

{/* ═══════════════════════ استایل انیمیشن ═══════════════════════ */}
<style jsx global>{`
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(-20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }
`}</style>

    </div>
  );
}