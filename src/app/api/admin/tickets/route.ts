import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    const where: any = {};
    if (status && status !== 'all') where.status = status;

    const tickets = await db.client.ticket.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        Tenant: {
          select: { id: true, companyName: true, subDomain: true, planName: true }
        },
        CreatedBy: {
          select: { id: true, username: true }
        },
        // ★ اصلاح: دریافت تمام پیام‌های تیکت به ترتیب تاریخ (از قدیمی به جدید)
        Messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            message: true,
            senderType: true,
            senderName: true,
            createdAt: true,
          }
        },
        _count: {
          select: { Messages: true }
        }
      }
    });

    const formatted = tickets.map(t => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      category: t.category,
      priority: t.priority,
      status: t.status,
      tenantName: t.Tenant?.companyName || 'نامشخص',
      tenantSubdomain: t.Tenant?.subDomain || '',
      tenantPlan: t.Tenant?.planName || '',
      createdByName: t.CreatedBy?.username || 'ناشناس',
      messagesCount: t._count.Messages,
      // ★ ارسال تمام پیام‌ها به فرانت‌اند
      messages: t.Messages.map(m => ({
        id: m.id,
        message: m.message,
        senderType: m.senderType,
        senderName: m.senderName,
        createdAt: m.createdAt,
      })),
      createdAt: t.createdAt,
      firstResponseAt: t.firstResponseAt,
      resolvedAt: t.resolvedAt,
    }));

    return NextResponse.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('[Admin Tickets GET] Error:', error);
    return NextResponse.json({ success: false, error: 'خطا در بارگذاری تیکت‌ها' }, { status: 500 });
  }
}