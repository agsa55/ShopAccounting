// src/app/api/journal-entries/[id]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // ★ اول بدون include بگیر
    const journalEntry = await db.client.journalEntry.findUnique({
      where: { id },
    })

    if (!journalEntry) {
      return NextResponse.json(
        { success: false, error: 'سند حسابداری یافت نشد' },
        { status: 404 }
      )
    }

    // ★ خطوط سند را جداگانه بگیر
    let lines: any[] = []
    try {
      lines = await db.client.journalEntryLine.findMany({
        where: { journalEntryId: id },
        orderBy: { id: 'asc' },
      })

      // ★ حساب هر خط را جداگانه بگیر
      const accountIds = [...new Set(lines.map((l: any) => l.accountId).filter(Boolean))]
      let accountsMap = new Map<string, any>()

      if (accountIds.length > 0) {
        const accounts = await db.client.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, code: true, name: true, type: true },
        })
        accountsMap = new Map(accounts.map((a: any) => [a.id, a]))
      }

      lines = lines.map((line: any) => ({
        ...line,
        account: line.accountId ? accountsMap.get(line.accountId) || null : null,
      }))

    } catch (linesErr: any) {
      console.warn('[JournalEntry GET] Failed to get lines:', linesErr?.message)
    }

    // ★ fiscalYear جداگانه
    let fiscalYear: any = null
    if (journalEntry.fiscalYearId) {
      try {
        fiscalYear = await db.client.fiscalYear.findUnique({
          where: { id: journalEntry.fiscalYearId },
        })
      } catch {}
    }

    // ★ محاسبه تراز
    const totalDebit = lines.reduce(
      (sum: number, line: any) => sum + (Number(line.debit) || 0), 0
    )
    const totalCredit = lines.reduce(
      (sum: number, line: any) => sum + (Number(line.credit) || 0), 0
    )
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

    return NextResponse.json({
      success: true,
      data: {
        ...journalEntry,
        lines,
        fiscalYear,
        isBalanced,
        balanceDifference: totalDebit - totalCredit,
      },
    })

  } catch (error: any) {
    console.error('[JournalEntry GET]', error?.message)
    return NextResponse.json(
      { success: false, error: 'خطای داخلی سرور' },
      { status: 500 }
    )
  }
}