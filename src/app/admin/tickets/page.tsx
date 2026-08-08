'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import {
  MessageSquare, Clock, CheckCircle2, AlertCircle, XCircle, Send, User,
  Headphones, Search, RefreshCw, Calendar, Filter, ChevronDown,
  Hash, Building2, Crown, Star, AlertTriangle, Eye, Trash2, Archive,
  Paperclip, Smile, Image, PaperclipIcon, Zap, Activity, X
} from 'lucide-react';

// ★ تابع کمکی برای تبدیل اعداد به فارسی
const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰';
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
};

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

const formatPersianDateTime = (isoDate: string): { date: string; time: string } => {
  try {
    const d = new Date(isoDate);
    const date = d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
    const time = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    return { date: toFaNum(date), time: toFaNum(time) };
  } catch {
    return { date: '—', time: '—' };
  }
};

const formatRelativeTime = (isoDate: string): string => {
  try {
    const d = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'همین الان';
    if (diffMin < 60) return `${toFaNum(diffMin)} دقیقه پیش`;
    if (diffHour < 24) return `${toFaNum(diffHour)} ساعت پیش`;
    if (diffDay < 7) return `${toFaNum(diffDay)} روز پیش`;
    if (diffDay < 30) return `${toFaNum(Math.floor(diffDay / 7))} هفته پیش`;
    return formatPersianDateTime(isoDate).date;
  } catch {
    return '—';
  }
};

// ★ تعیین پلن
const getPlanInfo = (planName: string): { label: string; icon: string; color: string; bg: string } => {
  const p = (planName || '').toLowerCase();
  if (p.includes('enterprise') || p.includes('سازمانی')) return { label: 'سازمانی', icon: '🥇', color: 'text-purple-700', bg: 'bg-purple-100' };
  if (p.includes('professional') || p.includes('حرفه')) return { label: 'حرفه‌ای', icon: '🥈', color: 'text-blue-700', bg: 'bg-blue-100' };
  if (p.includes('trial')) return { label: 'آزمایشی', icon: '🎁', color: 'text-amber-700', bg: 'bg-amber-100' };
  return { label: 'ساده', icon: '🥉', color: 'text-gray-700', bg: 'bg-gray-100' };
};

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [currentTime, setCurrentTime] = useState(getPersianTime());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // ★ آپدیت ساعت هر دقیقه
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getPersianTime()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const url = filter === 'all' ? '/api/admin/tickets' : `/api/admin/tickets?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setTickets(data.data || []);
      }
    } catch (err) {
      console.error('[Tickets] loadTickets error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [filter]);

  // ★ اسکرول خودکار
  useEffect(() => {
    if (selectedTicket?.messages?.length > 0 && messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    }
  }, [selectedTicket?.messages?.length, selectedTicket?.id]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadTickets();
  };

  const handleReply = async () => {
    if (!replyMessage.trim() || !selectedTicket) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/tickets/${selectedTicket.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyMessage, status: 'answered' })
      });
      const data = await res.json();
      if (data.success) {
        setReplyMessage('');
        await loadTickets();
        const updatedTicket = {
          ...selectedTicket,
          status: 'answered',
          messages: [...(selectedTicket.messages || []), data.data.newMessage]
        };
        setSelectedTicket(updatedTicket);
      }
    } finally {
      setSending(false);
    }
  };

  // ★ محاسبه آمار
  const stats = useMemo(() => {
    return {
      total: tickets.length,
      open: tickets.filter(t => t.status === 'open').length,
      pending: tickets.filter(t => t.status === 'pending').length,
      answered: tickets.filter(t => t.status === 'answered').length,
      resolved: tickets.filter(t => t.status === 'resolved').length,
      closed: tickets.filter(t => t.status === 'closed').length,
      urgent: tickets.filter(t => t.priority === 'urgent' && t.status !== 'closed' && t.status !== 'resolved').length,
    };
  }, [tickets]);

  // ★ فیلتر و جستجو
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const matchSearch = searchTerm === '' ||
        t.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.tenantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.tenantSubdomain?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.ticketNumber?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter;

      return matchSearch && matchPriority;
    });
  }, [tickets, searchTerm, priorityFilter]);

  const statusBadge = (status: string) => {
    const map: any = {
      open: { label: 'باز', icon: AlertCircle, color: 'bg-blue-50 text-blue-700 border-blue-200' },
      pending: { label: 'در انتظار', icon: Clock, color: 'bg-amber-50 text-amber-700 border-amber-200' },
      answered: { label: 'پاسخ داده شده', icon: MessageSquare, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
      resolved: { label: 'حل شده', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      closed: { label: 'بسته شده', icon: XCircle, color: 'bg-gray-100 text-gray-600 border-gray-200' },
    };
    const s = map[status] || map.open;
    const Icon = s.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${s.color}`}>
        <Icon className="w-3 h-3" />
        {s.label}
      </span>
    );
  };

  const priorityBadge = (priority: string) => {
    const map: any = {
      low: { label: 'کم', color: 'text-gray-600 bg-gray-100 border-gray-200', dot: 'bg-gray-400' },
      normal: { label: 'معمولی', color: 'text-blue-700 bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
      high: { label: 'بالا', color: 'text-orange-700 bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
      urgent: { label: 'فوری', color: 'text-red-700 bg-red-50 border-red-200 font-bold', dot: 'bg-red-500 animate-pulse' },
    };
    const p = map[priority] || map.normal;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${p.color}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`}></span>
        {p.label}
      </span>
    );
  };

  const statusFilters = [
    { key: 'all', label: 'همه', icon: Filter, count: stats.total },
    { key: 'open', label: 'باز', icon: AlertCircle, count: stats.open },
    { key: 'pending', label: 'در انتظار', icon: Clock, count: stats.pending },
    { key: 'answered', label: 'پاسخ داده', icon: MessageSquare, count: stats.answered },
    { key: 'resolved', label: 'حل شده', icon: CheckCircle2, count: stats.resolved },
    { key: 'closed', label: 'بسته', icon: XCircle, count: stats.closed },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-4 sm:p-6" dir="rtl">
      <div className="max-w-[1600px] mx-auto space-y-5">

        {/* ═══════════════════════ هدر ═══════════════════════ */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7] flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Headphones className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900">
                مرکز <span className="bg-gradient-to-l from-[#7C7BEB] to-[#5B5AC7] bg-clip-text text-transparent">پشتیبانی</span>
              </h1>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <Calendar className="w-3 h-3" />
                {getPersianDate()}
                <span className="text-gray-300">•</span>
                <Clock className="w-3 h-3" />
                {currentTime}
                <span className="text-gray-300">•</span>
                <span className="text-gray-600">{toFaNum(tickets.length)} تیکت</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {stats.urgent > 0 && (
              <div className="px-3 py-2 bg-gradient-to-l from-red-500 to-orange-500 text-white rounded-xl shadow-sm flex items-center gap-2 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="text-xs font-bold">{toFaNum(stats.urgent)} تیکت فوری</span>
              </div>
            )}
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
          {[
            { title: 'کل تیکت‌ها', value: stats.total, icon: MessageSquare, gradient: 'from-[#7C7BEB] to-[#5B5AC7]' },
            { title: 'باز', value: stats.open, icon: AlertCircle, gradient: 'from-blue-500 to-indigo-600' },
            { title: 'در انتظار', value: stats.pending, icon: Clock, gradient: 'from-amber-500 to-orange-500' },
            { title: 'پاسخ داده شده', value: stats.answered, icon: MessageSquare, gradient: 'from-indigo-500 to-purple-600' },
            { title: 'حل شده', value: stats.resolved, icon: CheckCircle2, gradient: 'from-emerald-500 to-teal-600' },
            { title: 'بسته شده', value: stats.closed, icon: XCircle, gradient: 'from-gray-500 to-slate-600' },
          ].map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={idx}
                className="group relative bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300 overflow-hidden"
              >
                <div className={`h-1 bg-gradient-to-l ${card.gradient}`}></div>
                <div className="p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-gray-500 font-medium leading-tight">{card.title}</p>
                    <p className="text-lg sm:text-xl font-black text-gray-900 tracking-tight" dir="ltr">
                      {formatNumberFa(card.value)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ═══════════════════════ فیلترهای وضعیت ═══════════════════════ */}
        <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row gap-3">
            {/* فیلترهای وضعیت */}
            <div className="flex-1 flex items-center gap-2 overflow-x-auto pb-1">
              {statusFilters.map(item => {
                const Icon = item.icon;
                const isActive = filter === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setFilter(item.key)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-gradient-to-l from-[#7C7BEB] to-[#5B5AC7] text-white shadow-md shadow-purple-200'
                        : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-white text-gray-700 border border-gray-200'
                    }`}>
                      {toFaNum(item.count)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* فیلتر اولویت */}
            <div className="relative shrink-0">
              <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full md:w-36 pr-9 pl-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition text-xs bg-gray-50/50 focus:bg-white appearance-none cursor-pointer"
              >
                <option value="all">همه اولویت‌ها</option>
                <option value="urgent">فوری</option>
                <option value="high">بالا</option>
                <option value="normal">معمولی</option>
                <option value="low">کم</option>
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>

            {/* جستجو */}
            <div className="relative shrink-0 md:w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="جستجوی موضوع، فروشگاه..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-9 pl-9 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition text-xs bg-gray-50/50 focus:bg-white"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* شمارنده نتایج */}
          {(searchTerm || priorityFilter !== 'all' || filter !== 'all') && (
            <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex items-center justify-between">
              <p className="text-[10px] text-gray-600">
                <span className="font-bold text-[#7C7BEB]">{toFaNum(filteredTickets.length)}</span> تیکت یافت شد
              </p>
              <button
                onClick={() => { setSearchTerm(''); setPriorityFilter('all'); setFilter('all'); }}
                className="text-[10px] font-medium text-[#7C7BEB] hover:text-[#5B5AC7] flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                پاک کردن فیلترها
              </button>
            </div>
          )}
        </div>

        {/* ═══════════════════════ بخش دو ستونه ═══════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ height: 'calc(100vh - 380px)', minHeight: '600px' }}>

          {/* ستون لیست تیکت‌ها */}
          <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
            <div className="shrink-0 px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-l from-slate-50 to-purple-50/50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-800">لیست تیکت‌ها</h3>
                  <p className="text-[9px] text-gray-500">{toFaNum(filteredTickets.length)} تیکت</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-16 text-center text-gray-500 text-sm flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-indigo-100 border-t-[#7C7BEB] rounded-full animate-spin" />
                  <p className="text-xs text-gray-500">در حال بارگذاری...</p>
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="p-16 text-center flex flex-col items-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-2xl flex items-center justify-center mb-3">
                    <MessageSquare className="w-8 h-8 text-[#7C7BEB]" />
                  </div>
                  <p className="text-gray-700 text-sm font-bold mb-1">تیکتی یافت نشد</p>
                  <p className="text-gray-500 text-xs">
                    {searchTerm || priorityFilter !== 'all'
                      ? 'لطفاً فیلترها را تغییر دهید'
                      : 'هنوز هیچ تیکتی ثبت نشده است'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {filteredTickets.map(t => {
                    const isSelected = selectedTicket?.id === t.id;
                    const plan = getPlanInfo(t.tenantPlan || '');
                    const msgCount = t.messages?.length || 0;
                    const lastMsg = t.messages?.[t.messages.length - 1];
                    return (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTicket(t)}
                        className={`px-4 py-3 transition-all duration-150 cursor-pointer border-r-4 ${
                          isSelected
                            ? 'bg-gradient-to-l from-indigo-50/60 to-purple-50/30 border-r-[#7C7BEB]'
                            : 'hover:bg-gray-50/70 border-r-transparent'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 ${
                            t.priority === 'urgent' ? 'bg-gradient-to-br from-red-500 to-orange-500' :
                            t.priority === 'high' ? 'bg-gradient-to-br from-orange-500 to-amber-500' :
                            'bg-gradient-to-br from-[#7C7BEB] to-[#5B5AC7]'
                          }`}>
                            {(t.tenantName || 'ف')[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <p className="text-xs font-bold text-gray-900 truncate">{t.tenantName}</p>
                                  <span className="text-xs">{plan.icon}</span>
                                </div>
                                <p className="text-[11px] font-medium text-gray-800 truncate leading-tight mb-1">
                                  {t.subject}
                                </p>
                                {lastMsg && (
                                  <p className="text-[10px] text-gray-500 truncate leading-tight">
                                    {lastMsg.message}
                                  </p>
                                )}
                              </div>
                              <div className="text-left shrink-0 space-y-1">
                                <p className="text-[9px] text-gray-400 font-mono">
                                  {formatRelativeTime(t.createdAt)}
                                </p>
                                {msgCount > 0 && (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold">
                                    {toFaNum(msgCount)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                              {statusBadge(t.status)}
                              {priorityBadge(t.priority)}
                              <span className="text-[9px] text-gray-400 font-mono mr-auto">
                                #{t.ticketNumber}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ستون جزئیات تیکت */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
            {!selectedTicket ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-6">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-3xl flex items-center justify-center mb-4 border border-purple-200/50">
                  <Headphones className="w-10 h-10 text-[#7C7BEB]" />
                </div>
                <p className="text-sm font-bold text-gray-700 mb-1">یک تیکت را انتخاب کنید</p>
                <p className="text-[11px] text-gray-500">برای مشاهده جزئیات و ارسال پاسخ</p>
              </div>
            ) : (
              <>
                {/* هدر تیکت */}
                <div className="shrink-0 border-b border-gray-100 p-4 bg-gradient-to-l from-indigo-50/40 to-white">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h3 className="text-sm font-bold text-gray-900 leading-snug flex-1">
                      {selectedTicket.subject}
                    </h3>
                    {statusBadge(selectedTicket.status)}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 font-mono bg-white px-2 py-1 rounded border border-gray-100">
                      <Hash className="w-3 h-3" />
                      {selectedTicket.ticketNumber}
                    </span>
                    {priorityBadge(selectedTicket.priority)}
                    <span className="text-[10px] text-gray-500 mr-auto">
                      {formatRelativeTime(selectedTicket.createdAt)}
                    </span>
                  </div>
                </div>

                {/* اطلاعات تیکت */}
                <div className="shrink-0 border-b border-gray-100 px-4 py-3 bg-gray-50/30">
                  <div className="grid grid-cols-4 gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center shrink-0">
                        <Building2 className="w-3 h-3 text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] text-gray-400 leading-none">فروشگاه</p>
                        <p className="text-[10px] font-semibold text-gray-800 truncate">{selectedTicket.tenantName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center shrink-0">
                        <Crown className="w-3 h-3 text-purple-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] text-gray-400 leading-none">پلن</p>
                        <p className="text-[10px] font-semibold text-gray-800 truncate">
                          {getPlanInfo(selectedTicket.tenantPlan || '').label}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center shrink-0">
                        <User className="w-3 h-3 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] text-gray-400 leading-none">ارسال‌کننده</p>
                        <p className="text-[10px] font-semibold text-gray-800 truncate">{selectedTicket.createdByName || 'نامشخص'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center shrink-0">
                        <Clock className="w-3 h-3 text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] text-gray-400 leading-none">تاریخ</p>
                        <p className="text-[10px] font-semibold text-gray-800 truncate">
                          {formatPersianDateTime(selectedTicket.createdAt).date}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* تاریخچه گفتگو */}
                <div
                  ref={messagesContainerRef}
                  className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50/50 to-white scroll-smooth"
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#c7d2fe #f3f4f6',
                  }}
                >
                  {!selectedTicket.messages || selectedTicket.messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs py-12">
                      <MessageSquare className="w-10 h-10 mb-2 text-gray-300" />
                      <p>هنوز پیامی ثبت نشده است.</p>
                    </div>
                  ) : (
                    <>
                      {selectedTicket.messages.map((msg: any) => {
                        const isAdmin = msg.senderType === 'admin';
                        const { date, time } = formatPersianDateTime(msg.createdAt);
                        return (
                          <div key={msg.id} className={`flex ${isAdmin ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                            <div
                              className={`max-w-[85%] rounded-2xl shadow-sm ${
                                isAdmin
                                  ? 'bg-gradient-to-l from-[#7C7BEB] to-[#5B5AC7] text-white rounded-tr-sm'
                                  : 'bg-white text-gray-800 rounded-tl-sm border border-gray-200'
                              }`}
                            >
                              {/* هدر پیام */}
                              <div className={`flex items-center gap-2 px-3 pt-2.5 pb-1 ${isAdmin ? 'text-white/90' : 'text-gray-500'}`}>
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isAdmin ? 'bg-white/20' : 'bg-gray-100'}`}>
                                  {isAdmin ? <Headphones className="w-3 h-3" /> : <User className="w-3 h-3" />}
                                </div>
                                <span className="text-[10px] font-bold">{msg.senderName}</span>
                                <span className="text-[9px] opacity-70 mr-auto">
                                  {time}
                                </span>
                              </div>

                              {/* متن پیام */}
                              <div className={`px-3 pb-2.5 ${isAdmin ? 'text-white' : 'text-gray-800'}`}>
                                <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                                  {msg.message}
                                </p>
                              </div>

                              {/* تاریخ پیام */}
                              <div className={`px-3 pb-2 text-[8px] ${isAdmin ? 'text-white/60' : 'text-gray-400'}`}>
                                {date}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                {/* فرم پاسخ */}
                <div className="shrink-0 border-t border-gray-200 bg-white p-3 shadow-[0_-2px_8px_rgba(0,0,0,0.03)]">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                      <Send className="w-3 h-3 text-[#7C7BEB]" />
                      پاسخ پشتیبانی
                    </label>
                    <span className="text-[9px] text-gray-400">Ctrl+Enter برای ارسال</span>
                  </div>
                  <textarea
                    value={replyMessage}
                    onChange={e => setReplyMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleReply();
                      }
                    }}
                    placeholder="پاسخ خود را بنویسید..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#7C7BEB]/20 focus:border-[#7C7BEB] outline-none transition resize-none bg-gray-50/50 focus:bg-white"
                    rows={3}
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex items-center gap-1">
                      <button className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 transition" title="پیوست">
                        <Paperclip className="w-3.5 h-3.5" />
                      </button>
                      <button className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 transition" title="تصویر">
                        <Image className="w-3.5 h-3.5" />
                      </button>
                      <button className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 transition" title="ایموجی">
                        <Smile className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={handleReply}
                      disabled={sending || !replyMessage.trim()}
                      className="flex-1 bg-gradient-to-l from-[#7C7BEB] to-[#5B5AC7] hover:shadow-lg hover:shadow-purple-300 text-white text-xs font-bold py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2"
                    >
                      {sending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          در حال ارسال...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          ارسال پاسخ
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* فوتر */}
        <div className="text-center text-[9px] text-gray-400 pt-3 border-t border-gray-100">
          <p>مرکز پشتیبانی — نسخه {toFaNum('10.0.0')}</p>
        </div>
      </div>

      {/* استایل اسکرول‌بار */}
      <style jsx>{`
        .scroll-smooth::-webkit-scrollbar {
          width: 6px;
        }
        .scroll-smooth::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 10px;
        }
        .scroll-smooth::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #a5b4fc, #6366f1);
          border-radius: 10px;
          transition: all 0.2s;
        }
        .scroll-smooth::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #818cf8, #4f46e5);
        }
      `}</style>
    </div>
  );
}