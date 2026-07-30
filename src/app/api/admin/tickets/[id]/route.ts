import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const ticketId = resolvedParams.id;
    
    if (!ticketId) {
      return NextResponse.json(
        { success: false, error: 'شناسه تیکت الزامی است' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { message, status: newStatus } = body;

    if (!message || !message.trim()) {
      return NextResponse.json(
        { success: false, error: 'متن پاسخ الزامی است' },
        { status: 400 }
      );
    }

    // ۱. بررسی وجود تیکت
    const ticket = await db.client.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: 'تیکت یافت نشد' },
        { status: 404 }
      );
    }

    // ۲. ایجاد یا استفاده از کاربر سیستمی پشتیبانی در StoreUser
    const SYSTEM_ADMIN_ID = 'system-admin-support';
    const systemAdmin = await db.client.storeUser.upsert({
      where: { id: SYSTEM_ADMIN_ID },
      update: {},
      create: {
        id: SYSTEM_ADMIN_ID,
        tenantId: ticket.tenantId,
        username: 'پشتیبانی سیستم',
        password: 'system-admin-not-for-login',
        role: 'admin', // اگر در schema شما role اجباری است
      }
    });

    // ۳. ایجاد پیام جدید (بدون ارسال دستی senderId)
    const newMessage = await db.client.ticketMessage.create({
      data: {
        Ticket: { connect: { id: ticketId } },
        Sender: { connect: { id: systemAdmin.id } }, // Prisma خودش senderId را از اینجا می‌خواند
        senderType: 'admin',
        senderName: 'پشتیبانی',
        message: message.trim(),
        isInternal: false,
        isRead: false,
      }
    });

    // ۴. به‌روزرسانی وضعیت تیکت
    const updatedTicket = await db.client.ticket.update({
      where: { id: ticketId },
      data: {
        status: newStatus || 'answered',
        firstResponseAt: ticket.firstResponseAt || new Date(),
      }
    });

    return NextResponse.json({
      success: true,
      message: 'پاسخ با موفقیت ثبت شد',
      data: {
        ticket: updatedTicket,
        newMessage
      }
    });

  } catch (error: any) {
    console.error('[Admin Ticket Reply POST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'خطا در ثبت پاسخ' },
      { status: 500 }
    );
  }
}