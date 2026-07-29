'use client';

import { useEffect, useState } from 'react';

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [sending, setSending] = useState(false);

  const loadTickets = () => {
    setLoading(true);
    const url = filter === 'all' ? '/api/admin/tickets' : `/api/admin/tickets?status=${filter}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success) setTickets(data.data);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadTickets();
  }, [filter]);

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
        alert('پاسخ با موفقیت ثبت شد');
      }
    } finally {
      setSending(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: any = {
      open: { label: 'باز', color: 'bg-blue-50 text-blue-700 border-blue-200' },
      pending: { label: 'در انتظار', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
      answered: { label: 'پاسخ داده شده', color: 'bg-green-50 text-green-700 border-green-200' },
      resolved: { label: 'حل شده', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      closed: { label: 'بسته شده', color: 'bg-gray-50 text-gray-600 border-gray-200' },
    };
    const s = map[status] || map.open;
    return <span className={`px-2.5 py-1 rounded-md text-[11px] font-medium border ${s.color}`}>{s.label}</span>;
  };

  const priorityBadge = (priority: string) => {
    const map: any = {
      low: { label: 'کم', color: 'text-gray-500 bg-gray-50' },
      normal: { label: 'معمولی', color: 'text-blue-600 bg-blue-50' },
      high: { label: 'بالا', color: 'text-orange-600 bg-orange-50' },
      urgent: { label: 'فوری', color: 'text-red-600 bg-red-50 font-bold' },
    };
    const p = map[priority] || map.normal;
    return <span className={`px-2 py-0.5 rounded text-[10px] ${p.color}`}>{p.label}</span>;
  };

  return (
    <div className="space-y-4">
      {/* هدر صفحه */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-base font-bold text-gray-800">تیکت‌های پشتیبانی</h1>
        <div className="flex gap-1.5 flex-wrap">
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
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition ${
                filter === item.key 
                  ? 'bg-[#7C7BEB] text-white shadow-sm' 
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* محتوای اصلی: دو ستونه */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        
        {/* ستون سمت راست: لیست تیکت‌ها (3/5 عرض) */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500 text-sm">در حال بارگذاری تیکت‌ها...</div>
          ) : tickets.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-2">🎫</div>
              <p className="text-gray-400 text-xs">تیکتی یافت نشد</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-[#F9F8FF] border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB]">شماره</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB]">فروشگاه</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB]">موضوع</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB]">اولویت</th>
                    <th className="px-3 py-2.5 font-semibold text-[11px] text-[#7C7BEB]">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tickets.map(t => (
                    <tr 
                      key={t.id} 
                      onClick={() => setSelectedTicket(t)}
                      className={`hover:bg-[#FAFAFE] transition-colors cursor-pointer ${
                        selectedTicket?.id === t.id ? 'bg-[#F5F4FF] border-r-2 border-r-[#7C7BEB]' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 text-[10px] font-mono text-gray-500">{t.ticketNumber}</td>
                      <td className="px-3 py-2.5">
                        <div className="text-[11px] font-medium text-gray-800">{t.tenantName}</div>
                        <div className="text-[10px] text-gray-400">{t.tenantSubdomain}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-gray-700 max-w-[200px] truncate">{t.subject}</td>
                      <td className="px-3 py-2.5">{priorityBadge(t.priority)}</td>
                      <td className="px-3 py-2.5">{statusBadge(t.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ستون سمت چپ: جزئیات تیکت (2/5 عرض) */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5 min-h-[500px]">
          {!selectedTicket ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <span className="text-2xl">📋</span>
              </div>
              <p className="text-gray-500 text-xs font-medium">یک تیکت را انتخاب کنید</p>
              <p className="text-gray-400 text-[10px] mt-1">برای مشاهده جزئیات و پاسخ</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* هدر تیکت */}
              <div className="border-b border-gray-100 pb-3">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-sm font-bold text-gray-800 leading-tight">{selectedTicket.subject}</h3>
                  {statusBadge(selectedTicket.status)}
                </div>
                <p className="text-[10px] text-gray-400 font-mono">{selectedTicket.ticketNumber}</p>
              </div>

              {/* اطلاعات تیکت */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#F9F8FF] p-2.5 rounded-lg">
                  <p className="text-[10px] text-gray-500 mb-0.5">فروشگاه</p>
                  <p className="text-[11px] font-medium text-gray-800">{selectedTicket.tenantName}</p>
                </div>
                <div className="bg-[#F9F8FF] p-2.5 rounded-lg">
                  <p className="text-[10px] text-gray-500 mb-0.5">پلن</p>
                  <p className="text-[11px] font-medium text-gray-800">
                    {selectedTicket.tenantPlan === 'enterprise' ? 'سازمانی' : 
                     selectedTicket.tenantPlan === 'professional' ? 'پیشرفته' : 'پایه'}
                  </p>
                </div>
                <div className="bg-[#F9F8FF] p-2.5 rounded-lg">
                  <p className="text-[10px] text-gray-500 mb-0.5">ارسال‌کننده</p>
                  <p className="text-[11px] font-medium text-gray-800">{selectedTicket.createdByName}</p>
                </div>
                <div className="bg-[#F9F8FF] p-2.5 rounded-lg">
                  <p className="text-[10px] text-gray-500 mb-0.5">تاریخ</p>
                  <p className="text-[11px] font-medium text-gray-800">
                    {new Date(selectedTicket.createdAt).toLocaleDateString('fa-IR')}
                  </p>
                </div>
              </div>

              {/* فرم پاسخ */}
              <div className="border-t border-gray-100 pt-3">
                <label className="block text-[11px] font-medium text-gray-700 mb-1.5">
                  پاسخ پشتیبانی
                </label>
                <textarea
                  value={replyMessage}
                  onChange={e => setReplyMessage(e.target.value)}
                  placeholder="پاسخ خود را بنویسید..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-[#7C7BEB] focus:border-transparent outline-none transition resize-none"
                  rows={5}
                />
                <button
                  onClick={handleReply}
                  disabled={sending || !replyMessage.trim()}
                  className="w-full mt-2 bg-[#7C7BEB] hover:bg-[#6a69d9] text-white text-xs font-medium py-2.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {sending ? 'در حال ارسال...' : 'ارسال پاسخ'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}