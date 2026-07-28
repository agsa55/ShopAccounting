// src/app/api/tickets/[id]/route.ts — v8.6
// ============================================================================
// سیستم تیکت پشتیبانی — جزئیات تیکت + پاسخ + بستن + امتیازدهی
// هر تیکت کاملاً به tenant (فروشگاه) کاربر محدود است.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

const CATEGORY_LABELS: Record<string, string> = {
  general: 'عمومی',
  bug: 'گزارش باگ',
  feature: 'درخواست قابلیت',
  billing: 'مالی و اشتراک',
  account: 'حساب کاربری',
  accounting: 'حسابداری',
  pos: 'صندوق فروش',
  inventory: 'انبارداری',
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'کم',
  normal: 'عادی',
  high: 'بالا',
  urgent: 'فوری',
}

const STATUS_LABELS: Record<string, string> = {
  open: 'باز',
  pending: 'در انتظار پاسخ کاربر',
  answered: 'پاسخ داده شده',
  resolved: 'حل شده',
  closed: 'بسته شده',
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/tickets/[id] — جزئیات کامل تیکت + همه پیام‌ها
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('dashboard')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id
    // ★★★ v8.6.2: در Next.js 16، params باید await بشه
    const params = await ctx.params
    const id = params?.id

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه تیکت الزامی است' },
        { status: 400 }
      )
    }

    // ★ پیدا کردن تیکت با اطمینان از tenantId
    const ticket = await tenantDb.ticket.findFirst({
      where: { id, tenantId },
      include: {
        Messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: 'تیکت یافت نشد یا به این فروشگاه تعلق ندارد' },
        { status: 404 }
      )
    }

    // ★ علامت‌گذاری پیام‌های ادمین به‌عنوان خوانده‌شده (چون کاربر الان آن‌ها را می‌بیند)
    await tenantDb.ticketMessage.updateMany({
      where: {
        ticketId: ticket.id,
        senderType: 'admin',
        isRead: false,
      },
      data: { isRead: true },
    })

    // ★ parse attachments
    const parseAttachments = (raw: string | null): string[] => {
      if (!raw) return []
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        categoryLabel: CATEGORY_LABELS[ticket.category] || ticket.category,
        priority: ticket.priority,
        priorityLabel: PRIORITY_LABELS[ticket.priority] || ticket.priority,
        status: ticket.status,
        statusLabel: STATUS_LABELS[ticket.status] || ticket.status,
        attachments: parseAttachments(ticket.attachments),
        rating: ticket.rating,
        ratingComment: ticket.ratingComment,
        ratedAt: ticket.ratedAt,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        firstResponseAt: ticket.firstResponseAt,
        closedAt: ticket.closedAt,
        messages: (ticket.Messages || [])
          .filter((m: any) => !m.isInternal)  // ★ کاربر یادداشت‌های داخلی ادمین را نمی‌بیند
          .map((m: any) => ({
            id: m.id,
            senderType: m.senderType,
            senderName: m.senderName,
            message: m.message,
            attachments: parseAttachments(m.attachments),
            createdAt: m.createdAt,
            isRead: m.isRead,
          })),
      },
    })
  } catch (error: any) {
    console.error('[Tickets GET /id] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری جزئیات تیکت' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/tickets/[id] — پاسخ کاربر به تیکت (یا عملیات خاص)
//  Body: { action: 'reply' | 'close' | 'reopen' | 'rate', message?, rating?, ratingComment? }
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('dashboard')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id
    const userName = tenant.user?.username || tenant.user?.name || 'کاربر'
    // ★★★ v8.6.2: در Next.js 16، params باید await بشه
    const params = await ctx.params
    const id = params?.id
    const body = await req.json()
    const action = body.action || 'reply'

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'شناسه تیکت الزامی است' },
        { status: 400 }
      )
    }

    // ★ پیدا کردن تیکت با اطمینان از tenantId
    const ticket = await tenantDb.ticket.findFirst({
      where: { id, tenantId },
    })

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: 'تیکت یافت نشد یا به این فروشگاه تعلق ندارد' },
        { status: 404 }
      )
    }

    // ─── حالت ۱: پاسخ کاربر ─────────────────────────────────────
    if (action === 'reply') {
      if (ticket.status === 'closed') {
        return NextResponse.json(
          { success: false, error: 'این تیکت بسته شده است. برای ادامه، تیکت را مجدداً باز کنید.' },
          { status: 400 }
        )
      }

      const message = (body.message || '').toString().trim()
      if (message.length < 2) {
        return NextResponse.json(
          { success: false, error: 'متن پاسخ حداقل باید ۲ کاراکتر باشد' },
          { status: 400 }
        )
      }
      if (message.length > 5000) {
        return NextResponse.json(
          { success: false, error: 'متن پاسخ نمی‌تواند بیش از ۵۰۰۰ کاراکتر باشد' },
          { status: 400 }
        )
      }

      const attachments = body.attachments
        ? JSON.stringify(Array.isArray(body.attachments) ? body.attachments.slice(0, 5) : [])
        : null

      const newMessage = await tenantDb.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          senderType: 'customer',
          senderId: userId,
          senderName: userName,
          message,
          attachments,
          isRead: false,
        },
      })

      // ★ به‌روزرسانی وضعیت تیکت به "pending" (منتظر پاسخ ادمین)
      await tenantDb.ticket.update({
        where: { id: ticket.id },
        data: {
          status: 'pending',
          updatedAt: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        data: {
          id: newMessage.id,
          senderType: newMessage.senderType,
          senderName: newMessage.senderName,
          message: newMessage.message,
          createdAt: newMessage.createdAt,
        },
        message: 'پاسخ شما ارسال شد.',
      })
    }

    // ─── حالت ۲: بستن تیکت توسط کاربر ──────────────────────────
    if (action === 'close') {
      if (ticket.status === 'closed') {
        return NextResponse.json(
          { success: false, error: 'تیکت از قبل بسته شده است' },
          { status: 400 }
        )
      }

      await tenantDb.ticket.update({
        where: { id: ticket.id },
        data: {
          status: 'closed',
          closedAt: new Date(),
          updatedAt: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        message: 'تیکت بسته شد.',
      })
    }

    // ─── حالت ۳: باز کردن مجدد تیکت ────────────────────────────
    if (action === 'reopen') {
      if (ticket.status !== 'closed') {
        return NextResponse.json(
          { success: false, error: 'فقط تیکت‌های بسته‌شده قابل باز کردن مجدد هستند' },
          { status: 400 }
        )
      }

      await tenantDb.ticket.update({
        where: { id: ticket.id },
        data: {
          status: 'open',
          closedAt: null,
          updatedAt: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        message: 'تیکت مجدداً باز شد.',
      })
    }

    // ─── حالت ۴: امتیازدهی به تیکت ─────────────────────────────
    if (action === 'rate') {
      const rating = Number(body.rating)
      const ratingComment = (body.ratingComment || '').toString().trim()

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return NextResponse.json(
          { success: false, error: 'امتیاز باید عددی بین ۱ تا ۵ باشد' },
          { status: 400 }
        )
      }
      if (ticket.status !== 'closed' && ticket.status !== 'resolved') {
        return NextResponse.json(
          { success: false, error: 'فقط تیکت‌های حل‌شده یا بسته‌شده قابل امتیازدهی هستند' },
          { status: 400 }
        )
      }
      if (ticket.rating) {
        return NextResponse.json(
          { success: false, error: 'این تیکت قبلاً امتیازدهی شده است' },
          { status: 400 }
        )
      }
      if (ratingComment.length > 500) {
        return NextResponse.json(
          { success: false, error: 'نظر نمی‌تواند بیش از ۵۰۰ کاراکتر باشد' },
          { status: 400 }
        )
      }

      await tenantDb.ticket.update({
        where: { id: ticket.id },
        data: {
          rating,
          ratingComment: ratingComment || null,
          ratedAt: new Date(),
          updatedAt: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        message: 'امتیاز شما ثبت شد. از بازخوردتان سپاسگزاریم!',
      })
    }

    return NextResponse.json(
      { success: false, error: `عملیات «${action}» پشتیبانی نمی‌شود` },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('[Tickets POST /id] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در پردازش درخواست' },
      { status: 500 }
    )
  }
})
