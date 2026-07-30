'use client';

import { useEffect, useState, useRef } from 'react';
import { MessageSquare, Clock, CheckCircle2, AlertCircle, XCircle, Send, User, Headphones } from 'lucide-react';

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  // ★ Ref برای اسکرول خودکار به آخرین پیام
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const loadTickets = () => {
    setLoading(true);
    const url = filter === 'all' ? '/api/admin/tickets' : `/api/admin/tickets?status=${filter}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) setTickets(data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadTickets();
  }, [filter]);

  // ★ اسکرول خودکار به آخرین پیام وقتی تیکت تغییر می‌کند یا پیام جدید می‌آید
  useEffect(() => {
    if (selectedTicket?.messages?.length > 0 && messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    }
  }, [selectedTicket?.messages?.length, selectedTicket?.id]);

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
        loadTickets();
        // به‌روزرسانی تیکت انتخاب‌شده با پیام جدید
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

  const statusBadge = (status: string) => {
    const map: any = {
      open: { label: 'باز', icon: AlertCircle, color: 'bg-blue-50 text-blue-700 border-blue-200' },
      pending: { label: 'در انتظار', icon: Clock, color: 'bg-amber-50 text-amber-700 border-amber-200' },
      answered: { label: 'پاسخ داده شده', icon: MessageSquare, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      resolved: { label: 'حل شده', icon: CheckCircle2, color: 'bg-green-50 text-green-700 border-green-200' },
      closed: { label: 'بسته شده', icon: XCircle, color: 'bg-gray-100 text-gray-600 border-gray-200' },
    };
    const s = map[status] || map.open;
    const Icon = s.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${s.color}`}>
        <Icon className="w-3.5 h-3.5" />
        {s.label}
      </span>
    );
  };

  const priorityBadge = (priority: string) => {
    const map: any = {
      low: { label: 'کم', color: 'text-gray-600 bg-gray-100' },
      normal: { label: 'معمولی', color: 'text-blue-700 bg-blue-100' },
      high: { label: 'بالا', color: 'text-orange-700 bg-orange-100' },
      urgent: { label: 'فوری', color: 'text-red-700 bg-red-100 font-bold' },
    };
    const p = map[priority] || map.normal;
    return <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${p.color}`}>{p.label}</span>;
  };

  return (
    <div className="space-y-6 p-4" dir="rtl">
      {/* هدر صفحه */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">تیکت‌های پشتیبانی</h1>
          <p className="text-sm text-gray-500 mt-1">مدیریت و پاسخگویی به درخواست‌های فروشگاه‌ها</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'all', label: 'همه' },
            { key: 'open', label: 'باز' },
            { key: 'pending', label: 'در انتظار' },
            { key: 'answered', label: 'پاسخ داده' },
            { key: 'resolved', label: 'حل شده' },
            { key: 'closed', label: 'بسته' },
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                filter === item.key 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* محتوای اصلی: دو ستونه */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        
        {/* ستون سمت راست: لیست تیکت‌ها */}
        <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-16 text-center text-gray-500 text-sm flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              در حال بارگذاری تیکت‌ها...
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-16 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 text-sm font-medium">تیکتی یافت نشد</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">شماره</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">فروشگاه</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">موضوع</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider text-center">اولویت</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500 uppercase tracking-wider text-center">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tickets.map(t => (
                    <tr 
                      key={t.id} 
                      onClick={() => setSelectedTicket(t)}
                      className={`transition-all duration-150 cursor-pointer ${
                        selectedTicket?.id === t.id 
                          ? 'bg-indigo-50/60 border-r-4 border-r-indigo-600' 
                          : 'hover:bg-gray-50 border-r-4 border-r-transparent'
                      }`}
                    >
                      <td className="px-4 py-3.5 text-xs font-mono text-gray-500">{t.ticketNumber}</td>
                      <td className="px-4 py-3.5">
                        <div className="text-sm font-semibold text-gray-900">{t.tenantName}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{t.tenantSubdomain}</div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-700 max-w-[220px] truncate font-medium">{t.subject}</td>
                      <td className="px-4 py-3.5 text-center">{priorityBadge(t.priority)}</td>
                      <td className="px-4 py-3.5 text-center">{statusBadge(t.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ★ ستون سمت چپ: جزئیات تیکت با ساختار Flexbox حرفه‌ای */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 200px)', minHeight: '600px' }}>
          {!selectedTicket ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 text-gray-400">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                <MessageSquare className="w-10 h-10 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-600">یک تیکت را انتخاب کنید</p>
              <p className="text-xs mt-1">برای مشاهده جزئیات و ارسال پاسخ</p>
            </div>
          ) : (
            <>
              {/* ★ بخش ۱: هدر تیکت (ثابت در بالا) */}
              <div className="shrink-0 border-b border-gray-100 p-5 bg-gradient-to-l from-indigo-50/30 to-white">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-base font-bold text-gray-900 leading-snug flex-1">{selectedTicket.subject}</h3>
                  {statusBadge(selectedTicket.status)}
                </div>
                <p className="text-xs text-gray-400 font-mono bg-white inline-block px-2 py-1 rounded border border-gray-100">
                  {selectedTicket.ticketNumber}
                </p>
              </div>

              {/* ★ بخش ۲: اطلاعات تیکت (ثابت) */}
                           {/* ★ بخش ۲: اطلاعات تیکت (فشرده و تک‌ردیفه) */}
              <div className="shrink-0 border-b border-gray-100 px-5 py-2.5 bg-gray-50/30">
                <div className="grid grid-cols-4 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-6 h-6 rounded-md bg-indigo-100 flex items-center justify-center shrink-0">
                      <User className="w-3 h-3 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] text-gray-400 leading-none">فروشگاه</p>
                      <p className="text-[11px] font-semibold text-gray-800 truncate">{selectedTicket.tenantName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] text-gray-400 leading-none">پلن</p>
                      <p className="text-[11px] font-semibold text-gray-800 truncate">
                        {selectedTicket.tenantPlan === 'enterprise' ? 'سازمانی' : 
                         selectedTicket.tenantPlan === 'professional' ? 'پیشرفته' : 'پایه'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center shrink-0">
                      <Headphones className="w-3 h-3 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] text-gray-400 leading-none">ارسال‌کننده</p>
                      <p className="text-[11px] font-semibold text-gray-800 truncate">{selectedTicket.createdByName || 'نامشخص'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center shrink-0">
                      <Clock className="w-3 h-3 text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] text-gray-400 leading-none">تاریخ</p>
                      <p className="text-[11px] font-semibold text-gray-800 truncate">
                        {new Date(selectedTicket.createdAt).toLocaleDateString('fa-IR')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ★ بخش ۳: تاریخچه گفتگو (اسکرول‌خور - بخش اصلی) */}
              <div 
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-5 space-y-3 bg-gradient-to-b from-gray-50/50 to-white scroll-smooth"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#c7d2fe #f3f4f6',
                }}
              >
                {!selectedTicket.messages || selectedTicket.messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                    هنوز پیامی ثبت نشده است.
                  </div>
                ) : (
                  <>
                    {selectedTicket.messages.map((msg: any) => {
                      const isAdmin = msg.senderType === 'admin';
                      return (
                        <div key={msg.id} className={`flex ${isAdmin ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                          <div 
                            className={`max-w-[85%] rounded-2xl shadow-sm ${
                              isAdmin 
                                ? 'bg-indigo-600 text-white rounded-tr-sm' 
                                : 'bg-white text-gray-800 rounded-tl-sm border border-gray-200'
                            }`}
                          >
                            {/* هدر پیام */}
                            <div className={`flex items-center gap-2 px-3 pt-2.5 pb-1 ${isAdmin ? 'text-indigo-100' : 'text-gray-500'}`}>
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isAdmin ? 'bg-indigo-500' : 'bg-gray-100'}`}>
                                {isAdmin ? <Headphones className="w-3 h-3" /> : <User className="w-3 h-3" />}
                              </div>
                              <span className="text-[10px] font-bold">{msg.senderName}</span>
                              <span className="text-[9px] opacity-70 mr-auto">
                                {new Date(msg.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            
                            {/* متن پیام */}
                            <div className={`px-3 pb-2.5 ${isAdmin ? 'text-white' : 'text-gray-800'}`}>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {msg.message}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* ★ نقطه مرجع برای اسکرول خودکار */}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* ★ بخش ۴: فرم پاسخ (چسبیده به پایین) */}
              <div className="shrink-0 border-t border-gray-200 bg-white p-4 shadow-[0_-2px_8px_rgba(0,0,0,0.03)]">
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  پاسخ پشتیبانی
                </label>
                <textarea
                  value={replyMessage}
                  onChange={e => setReplyMessage(e.target.value)}
                  onKeyDown={(e) => {
                    // ارسال با Ctrl+Enter
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleReply();
                    }
                  }}
                  placeholder="پاسخ خود را بنویسید... (Ctrl+Enter برای ارسال سریع)"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition resize-none bg-gray-50 focus:bg-white"
                  rows={3}
                />
                <button
                  onClick={handleReply}
                  disabled={sending || !replyMessage.trim()}
                  className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2"
                >
                  {sending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      در حال ارسال...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      ارسال پاسخ
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ★ استایل سفارشی برای اسکرول‌بار زیبا */}
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