// ============================================================================
// src/app/api/initial-balance/route.ts — GET/POST/DELETE (v10.9.8)
// ★ v10.9.8: Mapping هوشمند Type به Account (هر نوع به حساب درست)
// ★ v10.9.7: DELETE با force=true برای حذف کامل سند صادر شده
// ★ v10.9.5: Prisma Relation با حرف بزرگ (Account, Product, ...)
// ★ v10.9.4: کاملاً سازگار با ساختار واقعی دیتابیس
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withTenantAndPermission } from '@/lib/middleware/tenant-isolation'

// ─── Type تعریف‌ها ─────────────────────────────────────────────
interface BalanceItem {
  id?: string
  tenantId?: string
  type?: string
  title?: string
  amount?: number
  accountId?: string | null
  productId?: string | null
  quantity?: number | null
  description?: string | null
  journalEntryId?: string | null
  isPosted?: boolean
  Account?: { id: string; code: string; name: string } | null
  createdAt?: Date
  updatedAt?: Date
}

// ─── GET: دریافت موجودی‌های اولیه ─────────────────────────────
export const GET = withTenantAndPermission('accounting')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId

    console.log('[InitialBalance GET] tenantId:', tenantId)

    const balances: BalanceItem[] = await tenantDb.initialBalance.findMany({
      where: { tenantId },
      include: {
        // ★ v10.9.5: Account با حرف بزرگ
        Account: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    let totalAssets = 0
    let totalLiabilities = 0
    let isPosted = false
    let journalEntryId: string | null = null

    for (const b of balances) {
      const amt = Number(b.amount) || 0
      if (['cash', 'bank', 'inventory', 'fixed_asset'].includes(b.type || '')) {
        totalAssets += amt
      } else if (b.type === 'liability') {
        totalLiabilities += amt
      }
      if (b.isPosted || b.journalEntryId) {
        isPosted = true
        journalEntryId = b.journalEntryId || journalEntryId
      }
    }

    console.log('[InitialBalance GET] found:', balances.length, 'balances, isPosted:', isPosted)

    return NextResponse.json({
      success: true,
      data: balances,
      summary: {
        totalAssets,
        totalLiabilities,
        equity: totalAssets - totalLiabilities,
        isPosted,
        journalEntryId,
        count: balances.length,
      },
    })
  } catch (error: any) {
    console.error('[InitialBalance GET] Error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در دریافت موجودی اولیه' },
      { status: 500 }
    )
  }
})

// ─── POST: ثبت موجودی اولیه + ایجاد سند افتتاحیه ─────────────
export const POST = withTenantAndPermission('accounting')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const body = await req.json()

    console.log('[InitialBalance POST] tenantId:', tenantId)
    console.log('[InitialBalance POST] items:', body.items?.length, 'postToJournal:', body.postToJournal)

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'حداقل یک آیتم موجودی اولیه الزامی است' },
        { status: 400 }
      )
    }

    // ═══════════════════════════════════════════════════════════════
    // Idempotency check — جلوگیری از تکرار سند صادر شده
    // ═══════════════════════════════════════════════════════════════
    if (body.postToJournal) {
      try {
        const existingPosted = await tenantDb.initialBalance.findFirst({
          where: { tenantId, isPosted: true },
        })

        if (existingPosted) {
          console.warn('[InitialBalance POST] ⚠️ Posted balance already exists')
          return NextResponse.json({
            success: true,
            message: 'سند افتتاحیه قبلاً صادر شده است',
            data: { skipped: true, existingId: existingPosted.id },
          })
        }
      } catch (err) {
        console.warn('[InitialBalance POST] Idempotency check failed:', err)
      }
    }

    // ═══════════════════════════════════════════════════════════════
    //  حذف موجودی‌های قبلی پیش‌نویس (غیر posted)
    // ═══════════════════════════════════════════════════════════════
    try {
      const deleted = await tenantDb.initialBalance.deleteMany({
        where: {
          tenantId,
          isPosted: false,
        },
      })
      if (deleted.count > 0) {
        console.log('[InitialBalance POST] 🗑️ Deleted', deleted.count, 'draft balances')
      }
    } catch (err) {
      console.warn('[InitialBalance POST] Delete drafts failed:', err)
    }

    // ═══════════════════════════════════════════════════════════════
    //  ایجاد موجودی‌های جدید — دقیقاً مطابق schema
    // ═══════════════════════════════════════════════════════════════
    const createdBalances: BalanceItem[] = []

    for (const item of body.items) {
      const amount = Number(item.amount) || 0
      if (amount <= 0) {
        console.warn('[InitialBalance POST] Skipping item with invalid amount:', item)
        continue
      }

      try {
        const balance: BalanceItem = await tenantDb.initialBalance.create({
          data: {
            tenantId,
            type: item.type || 'cash',
            title: item.title || item.description || 'موجودی اولیه',
            amount: amount,
            accountId: item.accountId || null,
            productId: item.productId || null,
            quantity: item.quantity != null ? Number(item.quantity) : null,
            description: item.description || item.title || null,
            journalEntryId: null,
            isPosted: false,
          },
          include: {
            // ★ v10.9.5: Account با حرف بزرگ
            Account: { select: { id: true, code: true, name: true } },
          },
        })
        createdBalances.push(balance)
      } catch (err: any) {
        console.error('[InitialBalance POST] ❌ Create failed:', err?.message)
        console.error('[InitialBalance POST] Item:', JSON.stringify(item))
        return NextResponse.json({
          success: false,
          error: `خطا در ثبت موجودی: ${err?.message}`,
          errorCode: err?.code,
        }, { status: 500 })
      }
    }

    console.log('[InitialBalance POST] ✅ Created balances:', createdBalances.length)

    // ═══════════════════════════════════════════════════════════════
    //  ایجاد سند افتتاحیه (فقط اگر postToJournal=true)
    // ═══════════════════════════════════════════════════════════════
    if (body.postToJournal && createdBalances.length > 0) {
      console.log('[InitialBalance POST] Creating journal entry...')

      try {
        // ═══════════════════════════════════════════════════════════
        // ★ v10.9.8: Mapping هوشمند Type به Account
        // هر type باید به حساب مناسب خودش برود
        // ═══════════════════════════════════════════════════════════
        const defaultAccounts: Record<string, any> = {
          cash: null,         // صندوق
          bank: null,         // بانک
          inventory: null,    // موجودی کالا
          fixed_asset: null,  // دارایی ثابت
          liability: null,    // بدهی/وام
          equity: null,       // سرمایه مالک
        }

        try {
          // ۱. حساب صندوق (برای cash)
          defaultAccounts.cash = await tenantDb.account.findFirst({
            where: {
              tenantId,
              OR: [
                { code: { startsWith: '101' } },
                { name: { contains: 'صندوق' } },
                { name: { contains: 'نقد' } },
              ],
            },
            orderBy: { code: 'asc' },
          })

          // ۲. حساب بانک (برای bank)
          defaultAccounts.bank = await tenantDb.account.findFirst({
            where: {
              tenantId,
              OR: [
                { code: { startsWith: '102' } },
                { name: { contains: 'بانک' } },
              ],
            },
            orderBy: { code: 'asc' },
          })

          // ۳. حساب موجودی کالا (برای inventory)
          defaultAccounts.inventory = await tenantDb.account.findFirst({
            where: {
              tenantId,
              OR: [
                { code: { startsWith: '12' } },
                { name: { contains: 'موجودی کالا' } },
                { name: { contains: 'کالا' } },
              ],
            },
            orderBy: { code: 'asc' },
          })

          // ۴. حساب دارایی ثابت (برای fixed_asset)
          defaultAccounts.fixed_asset = await tenantDb.account.findFirst({
            where: {
              tenantId,
              OR: [
                { code: { startsWith: '15' } },
                { code: { startsWith: '16' } },
                { name: { contains: 'دارایی ثابت' } },
                { name: { contains: 'تجهیزات' } },
              ],
            },
            orderBy: { code: 'asc' },
          })

          // ۵. حساب بدهی/وام (برای liability)
          defaultAccounts.liability = await tenantDb.account.findFirst({
            where: {
              tenantId,
              OR: [
                { code: { startsWith: '20' } },
                { code: { startsWith: '21' } },
                { name: { contains: 'وام' } },
                { name: { contains: 'بدهی' } },
              ],
            },
            orderBy: { code: 'asc' },
          })

          // ۶. حساب سرمایه مالک (برای موازنه)
          defaultAccounts.equity = await tenantDb.account.findFirst({
            where: {
              tenantId,
              OR: [
                { code: { startsWith: '30' } },
                { name: { contains: 'سرمایه' } },
              ],
            },
            orderBy: { code: 'asc' },
          })

          console.log('[InitialBalance POST] Default accounts found:', {
            cash: defaultAccounts.cash?.code || 'none',
            bank: defaultAccounts.bank?.code || 'none',
            inventory: defaultAccounts.inventory?.code || 'none',
            fixed_asset: defaultAccounts.fixed_asset?.code || 'none',
            liability: defaultAccounts.liability?.code || 'none',
            equity: defaultAccounts.equity?.code || 'none',
          })
        } catch (err) {
          console.warn('[InitialBalance POST] Failed to find default accounts:', err)
        }

        const journalLines: any[] = []
        let totalDebit = 0
        let totalCredit = 0

        for (const balance of createdBalances) {
          const amt = Number(balance.amount) || 0
          if (amt <= 0) continue

          // ★ v10.9.8: استفاده از Account relation یا fallback به title
          const accountName = balance.Account?.name || balance.title || 'موجودی اولیه'
          const accountCode = balance.Account?.code || ''

          // ★ v10.9.8: اصلاح description — اگر accountCode خالی است، فقط title
          const description = accountCode
            ? `${accountCode} - ${accountName}`
            : accountName

          // ★ v10.9.8: انتخاب حساب بر اساس type
          let lineAccountId = balance.accountId
          if (!lineAccountId) {
            const typeKey = balance.type || 'cash'
            lineAccountId = defaultAccounts[typeKey]?.id || null

            // اگر حساب مخصوص type پیدا نشد، از cash استفاده کن (برای دارایی‌ها)
            if (!lineAccountId && typeKey !== 'liability') {
              lineAccountId = defaultAccounts.cash?.id || null
            }
            // برای liability، اگر حساب بدهی پیدا نشد، از equity استفاده کن
            if (!lineAccountId && typeKey === 'liability') {
              lineAccountId = defaultAccounts.equity?.id || null
            }
          }

          if (balance.type === 'liability') {
            journalLines.push({
              accountId: lineAccountId,
              description,
              debit: 0,
              credit: amt,
            })
            totalCredit += amt
          } else {
            journalLines.push({
              accountId: lineAccountId,
              description,
              debit: amt,
              credit: 0,
            })
            totalDebit += amt
          }
        }

              console.log('[InitialBalance POST] Journal totals (before balancing):', { totalDebit, totalCredit })

        // ═══════════════════════════════════════════════════════
        // ★ v10.9.11: خط موازنه را قبل از چک length اضافه کن
        // وقتی فقط دارایی وارد می‌شود، خط سرمایه مالک باید اضافه شود
        // ═══════════════════════════════════════════════════════
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          const diff = totalDebit - totalCredit
          const equityAccountId = defaultAccounts.equity?.id || null
          const equityDescription = 'سرمایه مالک (موازنه)'

          console.log('[InitialBalance POST] ⚖️ Adding balancing line:', diff)

          if (diff > 0) {
            journalLines.push({
              accountId: equityAccountId,
              description: equityDescription,
              debit: 0,
              credit: diff,
            })
            totalCredit += diff
          } else {
            journalLines.push({
              accountId: equityAccountId,
              description: equityDescription,
              debit: Math.abs(diff),
              credit: 0,
            })
            totalDebit += Math.abs(diff)
          }
          console.log('[InitialBalance POST] Journal totals (after balancing):', { totalDebit, totalCredit })
        }

        // ★ حالا چک length (بعد از اضافه شدن خط موازنه)
        if (journalLines.length < 2) {
          return NextResponse.json({
            success: false,
            error: 'حداقل ۲ ردیف برای سند افتتاحیه لازم است. لطفاً حداقل یک دارایی و یک بدهی/سرمایه وارد کنید.',
          }, { status: 400 })
        }

        // ★ چک تراز نهایی (باید همیشه true باشد)
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          return NextResponse.json({
            success: false,
            error: `سند تراز نیست. بدهکار: ${totalDebit}, بستانکار: ${totalCredit}`,
          }, { status: 400 })
        }
        // ═══════════════════════════════════════════════════════════
        // ★ v10.9.8: خط موازنه با حساب سرمایه مالک
        // ═══════════════════════════════════════════════════════════
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          const diff = totalDebit - totalCredit
          const equityAccountId = defaultAccounts.equity?.id || null

          // description بدون تکرار کد حساب
          const equityDescription = 'سرمایه مالک (موازنه)'

          if (diff > 0) {
            journalLines.push({
              accountId: equityAccountId,
              description: equityDescription,
              debit: 0,
              credit: diff,
            })
            totalCredit += diff
          } else {
            journalLines.push({
              accountId: equityAccountId,
              description: equityDescription,
              debit: Math.abs(diff),
              credit: 0,
            })
            totalDebit += Math.abs(diff)
          }
          console.log('[InitialBalance POST] Added balancing line, new totals:', { totalDebit, totalCredit })
        }

        // تولید شماره سند
        let journalNumber = 'JE-000001'
        try {
          const count = await tenantDb.journalEntry.count({ where: { tenantId } })
          journalNumber = `JE-${(count + 1).toString().padStart(6, '0')}`
        } catch {
          journalNumber = `JE-${Date.now().toString().slice(-6)}`
        }

           // ═══════════════════════════════════════════════════════
        // ★ v10.9.10: همیشه از تاریخ امروز استفاده کن
        // body.date یا fyStart را نادیده بگیر — سند باید تاریخ امروز داشته باشد
        // ═══════════════════════════════════════════════════════
            // ═══════════════════════════════════════════════════════
        // ★ v10.9.12: استفاده از تاریخ امروز با ساعت ۱۲ ظهر
        // DateTime کامل برای Prisma + جلوگیری از مشکل timezone
        // ═══════════════════════════════════════════════════════
        const now = new Date()
        const journalDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          12, 0, 0  // ساعت ۱۲ ظهر به وقت محلی
        )
        
        console.log('[InitialBalance POST] 📅 Using today date:', journalDate.toISOString())

        const journalEntry = await tenantDb.journalEntry.create({
          data: {
            number: journalNumber,
            tenantId,
               date: journalDate,  // ★ تاریخ امروز، بدون توجه به body.date یا fyStart
            description: 'سند افتتاحیه — راه‌اندازی اولیه فروشگاه',
            status: 'posted',
            sourceType: 'initial_balance',
            sourceId: createdBalances[0]?.id || null,
            totalDebit,
            totalCredit,
            createdBy: tenant.user?.id || null,
            lines: { create: journalLines },
          },
          include: { lines: true },
        })

        // Link balances به journal
        try {
          for (const balance of createdBalances) {
            await tenantDb.initialBalance.update({
              where: { id: balance.id },
              data: {
                journalEntryId: journalEntry.id,
                isPosted: true,
              },
            })
          }
        } catch (err) {
          console.warn('[InitialBalance POST] Link to journal failed:', err)
        }

        console.log('[InitialBalance POST] ✅ Journal created:', journalEntry.id)

        return NextResponse.json({
          success: true,
          data: {
            balances: createdBalances,
            journalEntry: {
              id: journalEntry.id,
              number: journalEntry.number,
              totalDebit,
              totalCredit,
            },
          },
          message: 'موجودی اولیه و سند افتتاحیه با موفقیت ثبت شدند',
        })
      } catch (err: any) {
        console.error('[InitialBalance POST] ❌ Journal creation failed:', err)

        if (err?.code === 'P2002') {
          return NextResponse.json({
            success: true,
            message: 'سند افتتاحیه قبلاً ایجاد شده است',
            data: { skipped: true, balances: createdBalances },
          })
        }

        return NextResponse.json({
          success: false,
          error: `خطا در ایجاد سند: ${err?.message}`,
          errorCode: err?.code,
        }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      data: createdBalances,
      message: body.postToJournal
        ? 'موجودی اولیه و سند افتتاحیه با موفقیت ثبت شدند'
        : 'موجودی اولیه به‌صورت پیش‌نویس ذخیره شد',
    })
  } catch (error: any) {
    console.error('[InitialBalance POST] Fatal error:', error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'خطای سرور',
    }, { status: 500 })
  }
})

// ─── DELETE ────────────────────────────────────────────────
export const DELETE = withTenantAndPermission('accounting')(async (
  req: NextRequest,
  ctx: any,
  tenant: any
) => {
  try {
    const tenantDb = tenant.tenantDb
    const tenantId = tenant.tenantId
    const { searchParams } = new URL(req.url)

    // ★ v10.9.7: force=true → حذف کامل شامل سند صادر شده
    const force = searchParams.get('force') === 'true'

    console.log('[InitialBalance DELETE] tenantId:', tenantId, 'force:', force)

    if (force) {
      // ═══════════════════════════════════════════════════════
      // ★ حذف کامل: InitialBalance + JournalEntry + Lines
      // ═══════════════════════════════════════════════════════

      // ۱. پیدا کردن balances با journal
      const balancesWithJournal = await tenantDb.initialBalance.findMany({
        where: { tenantId, journalEntryId: { not: null } },
        select: { journalEntryId: true },
      })

      const journalIds = [...new Set(
        balancesWithJournal
          .map((b: any) => b.journalEntryId)
          .filter(Boolean)
      )] as string[]

      console.log('[InitialBalance DELETE] Found', journalIds.length, 'journals to delete')

      // ۲. حذف JournalEntryLines (قبل از Journal برای جلوگیری از FK error)
      if (journalIds.length > 0) {
        try {
          const linesResult = await tenantDb.journalEntryLine.deleteMany({
            where: {
              journalEntryId: { in: journalIds },
            },
          })
          console.log('[InitialBalance DELETE] ✅ Deleted', linesResult.count, 'journal lines')
        } catch (err: any) {
          console.warn('[InitialBalance DELETE] Delete lines failed:', err?.message)
        }
      }

      // ۳. حذف JournalEntries (فقط سند افتتاحیه)
      if (journalIds.length > 0) {
        try {
          const journalsResult = await tenantDb.journalEntry.deleteMany({
            where: {
              id: { in: journalIds },
              tenantId,
              sourceType: 'initial_balance',
            },
          })
          console.log('[InitialBalance DELETE] ✅ Deleted', journalsResult.count, 'journal entries')
        } catch (err: any) {
          console.warn('[InitialBalance DELETE] Delete journals failed:', err?.message)
        }
      }

      // ۴. حذف همه InitialBalances
      const balancesResult = await tenantDb.initialBalance.deleteMany({
        where: { tenantId },
      })
      console.log('[InitialBalance DELETE] ✅ Deleted', balancesResult.count, 'balances')

      return NextResponse.json({
        success: true,
        message: `سند افتتاحیه به‌طور کامل حذف شد (${balancesResult.count} موجودی)`,
        deletedCount: balancesResult.count,
        deletedJournals: journalIds.length,
        force: true,
      })
    }

    // ═══════════════════════════════════════════════════════
    // حذف معمولی: فقط draft balances (غیر صادر شده)
    // ═══════════════════════════════════════════════════════

    const postedBalance = await tenantDb.initialBalance.findFirst({
      where: { tenantId, isPosted: true },
    })

    if (postedBalance) {
      return NextResponse.json({
        success: false,
        error: 'سند افتتاحیه صادر شده است. برای حذف کامل، گزینه "حذف کامل" را انتخاب کنید.',
        needsForce: true,
      }, { status: 400 })
    }

    const result = await tenantDb.initialBalance.deleteMany({
      where: { tenantId },
    })

    return NextResponse.json({
      success: true,
      message: `${result.count} موجودی با موفقیت حذف شد`,
      deletedCount: result.count,
    })
  } catch (error: any) {
    console.error('[InitialBalance DELETE] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'خطا در حذف موجودی: ' + (error?.message || ''),
    }, { status: 500 })
  }
})