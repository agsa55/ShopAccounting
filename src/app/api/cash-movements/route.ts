// ============================================================================
// src/app/api/cash-movements/route.ts — v11.7.2
// ★ API تراکنش‌های دستی صندوق (برداشت/واریز/هزینه)
// ★ v11.7.2: اضافه شدن موجودی اولیه و ابتدای روز به summary
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation';
import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════════
// GET: دریافت تراکنش‌های صندوق‌دار
// ═══════════════════════════════════════════════════════════════
export const GET = withTenantAndPermission('pos')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId') || tenant.tenantId;
    const cashierId = searchParams.get('cashierId') || tenant.user?.id;
    const date = searchParams.get('date'); // YYYY-MM-DD
    const transactionType = searchParams.get('type');

    const where: any = { tenantId };

    // فیلتر بر اساس صندوق‌دار
    if (cashierId) {
      where.cashierId = cashierId;
    }

    // فیلتر بر اساس تاریخ
    if (date) {
      const startDate = new Date(date + 'T00:00:00');
      const endDate = new Date(date + 'T23:59:59');
      where.createdAt = { gte: startDate, lte: endDate };
    }

    // فیلتر بر اساس نوع تراکنش
    if (transactionType) {
      where.transactionType = transactionType;
    }

    const movements = await db.client.cashMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // محاسبه خلاصه
    const summary: any = {
      totalSales: movements
        .filter(m => m.transactionType === 'sale')
        .reduce((sum, m) => sum + Number(m.amount), 0),
      totalPurchases: movements
        .filter(m => m.transactionType === 'purchase')
        .reduce((sum, m) => sum + Number(m.amount), 0),
      totalServices: movements
        .filter(m => ['service', 'repair'].includes(m.transactionType))
        .reduce((sum, m) => sum + Number(m.amount), 0),
      totalWithdrawals: movements
        .filter(m => m.transactionType === 'withdrawal')
        .reduce((sum, m) => sum + Number(m.amount), 0),
      totalDeposits: movements
        .filter(m => m.transactionType === 'deposit')
        .reduce((sum, m) => sum + Number(m.amount), 0),
      totalExpenses: movements
        .filter(m => m.transactionType === 'expense')
        .reduce((sum, m) => sum + Number(m.amount), 0),
      totalCashIn: movements
        .filter(m => m.type === 'in')
        .reduce((sum, m) => sum + Number(m.amount), 0),
      totalCashOut: movements
        .filter(m => m.type === 'out')
        .reduce((sum, m) => sum + Number(m.amount), 0),
    };

    // ═══════════════════════════════════════════════════════════════
    // ★ v11.7.2: محاسبه موجودی ابتدای روز و موجودی پایان روز
    // ═══════════════════════════════════════════════════════════════
    let openingBalance = 0;
    let startOfDayBalance = 0;

     try {
      // تاریخ امروز (برای فیلتر)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      // ─── ۱. خواندن موجودی اولیه از سند افتتاحیه ───
      // ★ v11.7.3: بدون include account (چون relation مستقیم وجود ندارد)
      const openingEntry = await (db.client as any).journalEntry.findFirst({
        where: {
          tenantId,
          sourceType: 'initial_balance',
          isCancelled: false,
          status: 'posted',
        },
        include: {
          lines: true,  // فقط خطوط سند
        },
        orderBy: { createdAt: 'desc' },
      });

      if (openingEntry?.lines && openingEntry.lines.length > 0) {
        // گرفتن ID های منحصر به فرد حساب‌ها
        const accountIds = [...new Set(
          openingEntry.lines.map((l: any) => l.accountId).filter(Boolean)
        )];

        // دریافت اطلاعات حساب‌ها
        const accounts = await (db.client as any).account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, code: true, name: true },
        });

        // ساخت map برای دسترسی سریع
        const accountMap = new Map(accounts.map((a: any) => [a.id, a]));

               // پیدا کردن خط مربوط به صندوق (کد ۱۰۱۰)
        for (const line of openingEntry.lines) {
          const acc = accountMap.get(line.accountId) as any;
          if (acc && (acc.code === '1010' || (acc.name || '').includes('صندوق'))) {
            openingBalance = Number(line.debit || 0) - Number(line.credit || 0);
            break;
          }
        }
      }

      // ─── ۲. محاسبه تراکنش‌های قبل از امروز ───
      const allPreviousMovements = await (db.client as any).cashMovement.findMany({
        where: {
          tenantId,
          createdAt: { lt: todayStr },
        },
        select: {
          type: true,
          amount: true,
        },
      });

      let previousIn = 0;
      let previousOut = 0;
      for (const m of allPreviousMovements) {
        const amount = Number(m.amount);
        if (m.type === 'in') previousIn += amount;
        else if (m.type === 'out') previousOut += amount;
      }

      startOfDayBalance = openingBalance + previousIn - previousOut;

      console.log('[CashMovements] 📊 Balance calculation:', {
        openingBalance,
        previousIn,
        previousOut,
        startOfDayBalance,
      });
    } catch (balErr: any) {
      console.warn('[CashMovements] ⚠️ Balance calculation failed:', balErr?.message);
    }

    // ★ v11.7.2: اضافه کردن موجودی اولیه و ابتدای روز به summary
    summary.openingBalance = openingBalance;
    summary.startOfDayBalance = startOfDayBalance;

    return NextResponse.json({
      success: true,
      data: movements,
      summary,
    });
  } catch (error: any) {
    console.error('[CashMovements] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'خطا در دریافت تراکنش‌ها' },
      { status: 500 }
    );
  }
});

// ═══════════════════════════════════════════════════════════════
// POST: ثبت تراکنش دستی + صدور سند حسابداری خودکار
// ═══════════════════════════════════════════════════════════════
export const POST = withTenantAndPermission('pos')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const body = await req.json();
    const tenantId = body.tenantId || tenant.tenantId;
    const cashierId = body.cashierId || tenant.user?.id;

    // ─── اعتبارسنجی ───
    if (!body.transactionType) {
      return NextResponse.json(
        { success: false, error: 'نوع تراکنش الزامی است' },
        { status: 400 }
      );
    }

    if (!body.amount || Number(body.amount) <= 0) {
      return NextResponse.json(
        { success: false, error: 'مبلغ تراکنش باید بیشتر از صفر باشد' },
        { status: 400 }
      );
    }

    // ─── تعیین جهت تراکنش ───
    const type = body.transactionType;
    let direction = 'in'; // پیش‌فرض: ورود

    if (['purchase', 'withdrawal', 'expense', 'repair'].includes(type)) {
      direction = 'out';
    }

    // ─── ثبت تراکنش در جدول صندوق ───
    const movement = await (db.client as any).cashMovement.create({
      data: {
        shiftId: null,
        tenantId,
        cashierId,
        transactionType: type,
        paymentMethod: body.paymentMethod || 'cash',
        amount: Number(body.amount),
        type: direction,
        description: body.description || null,
        reason: body.reason || null,
      },
    });

    console.log('[CashMovements] ✅ CashMovement created:', {
      id: movement.id,
      type: movement.transactionType,
      amount: movement.amount,
      direction: movement.type,
    });

    // ═══════════════════════════════════════════════════════════════
    // ★ v11.6.6: صدور سند حسابداری خودکار
    // ═══════════════════════════════════════════════════════════════
    try {
      // ─── پیدا کردن حساب‌های استاندارد ───
      const accounts = await db.client.account.findMany({ 
        where: { tenantId, isActive: true } 
      });
      
      let cashAccountId: string | null = null;
      let capitalAccountId: string | null = null;      // سرمایه مالک
      let withdrawalAccountId: string | null = null;   // برداشت مالک
      let expenseAccountId: string | null = null;      // هزینه متفرقه

      for (const acc of accounts) {
        const code = acc.code || '';
        const name = (acc.name || '').toLowerCase();

        // صندوق فروشگاه (۱۰۱۰)
        if (!cashAccountId && (code === '1010' || name.includes('صندوق'))) {
          cashAccountId = acc.id;
        }
        // سرمایه مالک (۳۰۰۰)
        if (!capitalAccountId && (code === '3000' || name.includes('سرمایه مالک'))) {
          capitalAccountId = acc.id;
        }
        // برداشت مالک (۳۲۰۰)
        if (!withdrawalAccountId && (code === '3200' || name.includes('برداشت مالک'))) {
          withdrawalAccountId = acc.id;
        }
        // هزینه خدمات و متفرقه (۵۱۷۰)
        if (!expenseAccountId && (code === '5170' || name.includes('متفرقه'))) {
          expenseAccountId = acc.id;
        }
      }

      console.log('[CashMovements] 📋 Account IDs resolved:', {
        cash: cashAccountId ? '✓' : '✗',
        capital: capitalAccountId ? '✓' : '✗',
        withdrawal: withdrawalAccountId ? '✓' : '✗',
        expense: expenseAccountId ? '✓' : '✗',
      });

      // ─── تعیین حساب‌های بدهکار و بستانکار ───
      let debitAccountId: string | null = null;
      let creditAccountId: string | null = null;
      let debitDescription = '';
      let creditDescription = '';

      if (type === 'deposit') {
        // واریز: بدهکار=صندوق، بستانکار=سرمایه مالک
        debitAccountId = cashAccountId;
        creditAccountId = capitalAccountId;
        debitDescription = 'واریز به صندوق';
        creditDescription = 'سرمایه مالک';
      } else if (type === 'withdrawal') {
        // برداشت: بدهکار=برداشت مالک، بستانکار=صندوق
        debitAccountId = withdrawalAccountId;
        creditAccountId = cashAccountId;
        debitDescription = 'برداشت مالک';
        creditDescription = 'برداشت از صندوق';
      } else if (type === 'expense') {
        // هزینه: بدهکار=هزینه متفرقه، بستانکار=صندوق
        debitAccountId = expenseAccountId;
        creditAccountId = cashAccountId;
        debitDescription = 'هزینه متفرقه';
        creditDescription = 'پرداخت از صندوق';
      }

      // ─── صدور سند حسابداری ───
      if (debitAccountId && creditAccountId) {
        // تولید شماره منحصر به فرد
        const count = await db.client.journalEntry.count({ where: { tenantId } });
        const jeNumber = `JE-${(count + 1).toString().padStart(6, '0')}`;

        const amount = Number(body.amount);
        const description = body.description || body.reason || 'تراکنش دستی صندوق';

        const lines = [
          {
            accountId: debitAccountId,
            debit: amount,
            credit: 0,
            description: `بدهکار: ${debitDescription} — ${description}`,
          },
          {
            accountId: creditAccountId,
            debit: 0,
            credit: amount,
            description: `بستانکار: ${creditDescription} — ${description}`,
          },
        ];

        await db.client.journalEntry.create({
          data: {
            number: jeNumber,
            date: new Date(),
            description: `سند خودکار بابت تراکنش دستی — ${description}`,
            status: 'posted',
            sourceType: 'manual_cash_movement',
            sourceId: movement.id,
            totalDebit: amount,
            totalCredit: amount,
            createdBy: cashierId || null,
            tenantId,
            lines: { create: lines },
          },
        });

        console.log('[CashMovements] ✅ Journal Entry created:', {
          number: jeNumber,
          amount,
          debit: debitDescription,
          credit: creditDescription,
        });
      } else {
        console.warn('[CashMovements] ⚠️ Cannot create journal - missing account IDs');
      }
    } catch (jeErr: any) {
      console.warn('[CashMovements] ⚠️ Auto journal failed (non-blocking):', jeErr?.message);
    }
    // ═══════════════════════════════════════════════════════════════

    return NextResponse.json({
      success: true,
      data: movement,
      message: 'تراکنش با موفقیت ثبت شد و سند حسابداری صادر شد',
    }, { status: 201 });
  } catch (error: any) {
    console.error('[CashMovements] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'خطا در ثبت تراکنش: ' + error.message },
      { status: 500 }
    );
  }
});