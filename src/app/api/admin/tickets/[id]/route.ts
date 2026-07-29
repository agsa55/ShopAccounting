import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const { message, status, isInternal } = await request.json();

    const ticket = await db.client.ticket.findUnique({
      where: { id },
      include: { Tenant: true }
    });

    if (!ticket) {
      return NextResponse.json({ success: false, error: 'تیکت یافت نشد' }, { status: 404 });
    }

    // ایجاد پیام جدید
    const newMessage = await db.client.ticketMessage.create({
      data: {
        ticketId: id,
        senderType: 'admin',
        senderId: 'admin-system', // ادمین سیستم
        senderName: 'پشتیبانی ShopAccounting',
        message,
        isInternal: isInternal || false,
      }
    });

    // به‌روزرسانی وضعیت تیکت
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (status && status !== ticket.status) {
      updateData.status = status;
      if (status === 'resolved') updateData.resolvedAt = new Date();
      if (status === 'closed') updateData.closedAt = new Date();
    }

    // ثبت زمان اولین پاسخ
    if (!ticket.firstResponseAt) {
      updateData.firstResponseAt = new Date();
    }

    await db.client.ticket.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({ 
      success: true, 
      data: newMessage,
      message: 'پاسخ با موفقیت ثبت شد' 
    });
  } catch (error: any) {
    console.error('[Admin Ticket Reply] Error:', error);
    return NextResponse.json({ success: false, error: 'خطا در ثبت پاسخ' }, { status: 500 });
  }
}