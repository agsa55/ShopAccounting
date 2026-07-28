// src/app/api/tickets/route.ts — v8.6
// ============================================================================
// سیستم تیکت پشتیبانی — لیست تیکت‌ها + ایجاد تیکت جدید
// هر تیکت کاملاً به tenant (فروشگاه) کاربر محدود است.
// هر سه پلن (ساده/حرفه‌ای/سازمانی) به یک اندازه دسترسی دارند.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'
import { db } from '@/lib/db'

// ─── ثابت‌های دسته‌بندی و اولویت ───────────────────────────────────
const VALID_CATEGORIES = ['general', 'bug', 'feature', 'billing', 'account', 'accounting', 'pos', 'inventory']
const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent']

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

// ─── کمک‌تابع تولید شماره تیکت ────────────────────────────────────
// فرمت: TKT-YYMMDD-NNNN
async function generateTicketNumber(tenantDb: any, tenantId: string): Promise<string> {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const datePart = `${yy}${mm}${dd}`

  // شمارش تیکت‌های امروز برای این tenant
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const countToday = await tenantDb.ticket.count({
    where: {
      tenantId,
      createdAt: { gte: startOfDay },
    },
  })

  const seq = String(countToday + 1).padStart(4, '0')
  return `TKT-${datePart}-${seq}`
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/tickets — لیست تیکت‌های این فروشگاه
//  Query: status, category, priority, page, pageSize, search
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('dashboard')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)

    const status = searchParams.get('status') || 'all'
    const category = searchParams.get('category') || 'all'
    const priority = searchParams.get('priority') || 'all'
    const search = searchParams.get('search')?.trim() || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')))

    const where: any = { tenantId }
    if (status && status !== 'all') where.status = status
    if (category && category !== 'all') where.category = category
    if (priority && priority !== 'all') where.priority = priority
    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { ticketNumber: { contains: search } },
        { description: { contains: search } },
      ]
    }

    const [tickets, total] = await Promise.all([
      tenantDb.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { Messages: true } },
        },
      }),
      tenantDb.ticket.count({ where }),
    ])

    // ★★★ v8.6.2: دیباگ — برای پیدا کردن مشکل نمایش تیکت‌ها
    console.log('[Tickets GET] Debug:', {
      tenantId,
      where,
      ticketsFound: tickets.length,
      totalCount: total,
      firstTicket: tickets[0] ? {
        id: tickets[0].id,
        ticketNumber: tickets[0].ticketNumber,
        subject: tickets[0].subject,
        tenantId: tickets[0].tenantId,
        status: tickets[0].status,
      } : null,
    })

    // ★ کش آخرین پیام برای نمایش در لیست
    const ticketIds = tickets.map((t: any) => t.id)
    // ★★★ v8.6.1: اضافه شدن type صریح برای رفع خطای TS2339 (Prisma با distinct نوع ضعیف برمی‌گرداند)
    interface LastMsgRow {
      ticketId: string
      senderType: string
      senderName: string
      message: string
      createdAt: string
      isRead: boolean
    }
    const lastMessages: LastMsgRow[] = ticketIds.length > 0
      ? await tenantDb.ticketMessage.findMany({
          where: { ticketId: { in: ticketIds } },
          orderBy: { createdAt: 'desc' },
          distinct: ['ticketId'],
          select: {
            ticketId: true,
            senderType: true,
            senderName: true,
            message: true,
            createdAt: true,
            isRead: true,
          },
        }) as LastMsgRow[]
      : []

    const lastMessageMap = new Map(lastMessages.map((m: any) => [m.ticketId, m]))

    // ★ محاسبه تعداد پیام‌های خوانده‌نشده از ادمین (که کاربر هنوز ندیده)
    // برای کاربر: unread = پیام‌های ادمین که isRead=false
    const unreadCounts = ticketIds.length > 0
      ? await tenantDb.ticketMessage.groupBy({
          by: ['ticketId'],
          where: {
            ticketId: { in: ticketIds },
            senderType: 'admin',
            isRead: false,
          },
          _count: { id: true },
        })
      : []
    const unreadMap = new Map(unreadCounts.map((u: any) => [u.ticketId, u._count.id]))

    const data = tickets.map((t: any) => {
      const lastMsg = lastMessageMap.get(t.id)
      return {
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        category: t.category,
        categoryLabel: CATEGORY_LABELS[t.category] || t.category,
        priority: t.priority,
        priorityLabel: PRIORITY_LABELS[t.priority] || t.priority,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        firstResponseAt: t.firstResponseAt,
        closedAt: t.closedAt,
        messageCount: t._count?.Messages || 0,
        unreadCount: unreadMap.get(t.id) || 0,
        lastMessage: lastMsg ? {
          senderType: lastMsg.senderType,
          senderName: lastMsg.senderName,
          message: lastMsg.message.length > 120 ? lastMsg.message.slice(0, 120) + '…' : lastMsg.message,
          createdAt: lastMsg.createdAt,
        } : null,
        rating: t.rating,
      }
    })

    // ★ خلاصه آماری
    const stats = await tenantDb.ticket.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { id: true },
    })
    const statsMap: Record<string, number> = {}
    stats.forEach((s: any) => { statsMap[s.status] = s._count.id })

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      stats: {
        total: Object.values(statsMap).reduce((a: number, b: any) => a + Number(b), 0),
        open: statsMap.open || 0,
        pending: statsMap.pending || 0,
        answered: statsMap.answered || 0,
        resolved: statsMap.resolved || 0,
        closed: statsMap.closed || 0,
      },
      meta: {
        categories: CATEGORY_LABELS,
        priorities: PRIORITY_LABELS,
      },
    })
  } catch (error: any) {
    console.error('[Tickets GET] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در بارگذاری تیکت‌ها' },
      { status: 500 }
    )
  }
})

// ═══════════════════════════════════════════════════════════════
//  POST /api/tickets — ایجاد تیکت جدید
//  Body: { subject, description, category, priority, attachments? }
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('dashboard')(async (req: NextRequest, ctx: any, tenant: any) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const userId = tenant.user?.id
    const userRole = tenant.user?.role || 'Cashier'
    const userName = tenant.user?.username || tenant.user?.name || 'کاربر'

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'اطلاعات کاربر یافت نشد. لطفاً دوباره وارد شوید.' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { subject, description, category = 'general', priority = 'normal', attachments } = body

    // ★ اعتبارسنجی
    if (!subject || typeof subject !== 'string' || subject.trim().length < 5) {
      return NextResponse.json(
        { success: false, error: 'موضوع تیکت حداقل باید ۵ کاراکتر باشد' },
        { status: 400 }
      )
    }
    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'متن تیکت حداقل باید ۱۰ کاراکتر باشد' },
        { status: 400 }
      )
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { success: false, error: 'دسته‌بندی نامعتبر است' },
        { status: 400 }
      )
    }
    if (!VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json(
        { success: false, error: 'اولویت نامعتبر است' },
        { status: 400 }
      )
    }
    if (subject.length > 500) {
      return NextResponse.json(
        { success: false, error: 'موضوع تیکت نمی‌تواند بیش از ۵۰۰ کاراکتر باشد' },
        { status: 400 }
      )
    }
    if (description.length > 10000) {
      return NextResponse.json(
        { success: false, error: 'متن تیکت نمی‌تواند بیش از ۱۰۰۰۰ کاراکتر باشد' },
        { status: 400 }
      )
    }

    // ★ محدودیت نرخ: حداکثر ۱۰ تیکت باز در روز برای هر کاربر
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const todayCount = await tenantDb.ticket.count({
      where: {
        tenantId,
        createdById: userId,
        createdAt: { gte: startOfDay },
      },
    })
    if (todayCount >= 10) {
      return NextResponse.json(
        {
          success: false,
          error: 'سقف روزانه ایجاد تیکت (۱۰ عدد) تکمیل شده است. لطفاً فردا دوباره تلاش کنید یا از طریق تلفن تماس بگیرید.',
          code: 'RATE_LIMIT',
        },
        { status: 429 }
      )
    }

    // ★ تولید شماره تیکت یکتا
    const ticketNumber = await generateTicketNumber(tenantDb, tenantId)

    // ★ تبدیل attachments به JSON string
    const attachmentsJson = attachments
      ? JSON.stringify(Array.isArray(attachments) ? attachments.slice(0, 5) : [])
      : null

    // ★ کش tier پلن فعلی برای گزارش‌گیری
    const tenantRow = await db.client.tenant.findUnique({
      where: { id: tenantId },
      select: { planName: true },
    })

    // ★ ایجاد تیکت + اولین پیام در یک تراکنش
    const ticket = await tenantDb.$transaction(async (tx: any) => {
      const newTicket = await tx.ticket.create({
        data: {
          tenantId,
          ticketNumber,
          subject: subject.trim(),
          description: description.trim(),
          category,
          priority,
          status: 'open',
          createdById: userId,
          planTierAtCreate: tenantRow?.planName || null,
          attachments: attachmentsJson,
        },
      })

      // ★ اولین پیام = متن خود تیکت
      await tx.ticketMessage.create({
        data: {
          ticketId: newTicket.id,
          senderType: 'customer',
          senderId: userId,
          senderName: userName,
          message: description.trim(),
          attachments: attachmentsJson,
          isRead: false,
        },
      })

      return newTicket
    })

    // ★★★ v8.6.2: دیباگ — برای پیدا کردن مشکل نمایش تیکت‌ها
    console.log('[Tickets POST] Debug:', {
      tenantId,
      userId,
      userName,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketTenantId: ticket.tenantId,
    })

    return NextResponse.json({
      success: true,
      data: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        category: ticket.category,
        categoryLabel: CATEGORY_LABELS[ticket.category] || ticket.category,
        priority: ticket.priority,
        priorityLabel: PRIORITY_LABELS[ticket.priority] || ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
      message: `تیکت شما با شماره ${ticketNumber} با موفقیت ثبت شد. تیم پشتیبانی در اسرع وقت پاسخ خواهد داد.`,
    })
  } catch (error: any) {
    console.error('[Tickets POST] Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'خطا در ثبت تیکت. لطفاً دوباره تلاش کنید.' },
      { status: 500 }
    )
  }
})
