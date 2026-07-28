'use client'

// ============================================================================
// src/components/accounting/journal-entry-detail.tsx
// ShopAccounting v28 — Journal Entry Detail Page
// ============================================================================

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { mockJournalEntries } from '@/lib/mock-data'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import {
  ArrowRight, BookOpen, Calendar, FileText, CheckCircle2, FileEdit, Link2,
} from 'lucide-react'

function formatNumber(num: number): string {
  return num.toLocaleString('fa-IR')
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
}

export default function JournalEntryDetail() {
  const store = useStore()
  const entry = useMemo(() => {
    return mockJournalEntries.find((je) => je.id === store.selectedJournalEntryId) || null
  }, [store.selectedJournalEntryId])

  if (!entry) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
        <div className="text-center">
          <BookOpen className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-3 sm:mb-4" />
          <p className="text-sm sm:text-base text-gray-500">سند مورد نظر یافت نشد</p>
          <Button variant="outline" className="mt-3 sm:mt-4 text-xs sm:text-sm h-9 sm:h-10" onClick={() => store.setCurrentView('accounting')}>بازگشت به دفتر روزنامه</Button>
        </div>
      </div>
    )
  }

  const isBalanced = entry.totalDebit === entry.totalCredit
  const lines = entry.lines || entry.items || []

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6" dir="rtl">
      {/* Header */}
      <div className="mb-4 sm:mb-6 flex flex-col gap-3 sm:gap-4">
        <Button
          variant="ghost"
          className="self-start text-gray-600 hover:text-gray-900 -mr-2 text-xs sm:text-sm h-8 sm:h-9"
          onClick={() => store.setCurrentView('accounting')}
        >
          <ArrowRight className="w-4 h-4 ml-1" />بازگشت
        </Button>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900">سند {entry.entryNumber || entry.number}</h1>
            <Badge
              className={`text-[9px] sm:text-xs ${entry.entryType === 'Automatic' || entry.sourceType === 'invoice' ? 'bg-sky-100 text-sky-700 border-sky-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`}
              variant="outline"
            >
              {entry.entryType === 'Automatic' || entry.sourceType === 'invoice' ? 'خودکار' : 'دستی'}
            </Badge>
            <Badge
              className={`text-[9px] sm:text-xs ${entry.status === 'Confirmed' || entry.status === 'posted' || entry.status === 'POSTED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}
              variant="outline"
            >
              {entry.status === 'Confirmed' || entry.status === 'posted' || entry.status === 'POSTED' ? 'تأیید شده' : 'پیش‌نویس'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Entry Info Card */}
      <Card className="mb-4 sm:mb-6 border-gray-200">
        <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            اطلاعات سند
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
            {/* Date */}
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-100 flex items-center justify-center mt-0.5 shrink-0">
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-gray-500">تاریخ</p>
                <p className="text-[11px] sm:text-sm font-medium text-gray-900 truncate">{formatDateTime(entry.entryDate || entry.date)}</p>
              </div>
            </div>
            {/* Type */}
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-100 flex items-center justify-center mt-0.5 shrink-0">
                <FileEdit className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-gray-500">نوع</p>
                <p className="text-[11px] sm:text-sm font-medium text-gray-900">{entry.entryType === 'Automatic' || entry.sourceType === 'invoice' ? 'خودکار' : 'دستی'}</p>
              </div>
            </div>
            {/* Description */}
            <div className="flex items-start gap-2 sm:gap-3 xs:col-span-2 sm:col-span-1">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-100 flex items-center justify-center mt-0.5 shrink-0">
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-gray-500">شرح</p>
                <p className="text-[11px] sm:text-sm font-medium text-gray-900 break-words">{entry.description}</p>
              </div>
            </div>
            {/* Reference */}
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-100 flex items-center justify-center mt-0.5 shrink-0">
                <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-gray-500">مرجع</p>
                {entry.referenceType ? (
                  <span className="text-[11px] sm:text-sm font-medium text-emerald-600">
                    {entry.referenceType === 'Invoice' ? 'فاکتور' : 'پرداخت'}{entry.referenceId ? ` (${entry.referenceId})` : ''}
                  </span>
                ) : (
                  <p className="text-[11px] sm:text-sm text-gray-400">—</p>
                )}
              </div>
            </div>
            {/* Total Debit */}
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-50 flex items-center justify-center mt-0.5 shrink-0">
                <span className="text-[9px] sm:text-xs font-bold text-red-500">بـد</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-gray-500">جمع بدهکار</p>
                <p className="text-[11px] sm:text-sm font-bold text-red-600" dir="ltr">{formatNumber(entry.totalDebit)} ریال</p>
              </div>
            </div>
            {/* Total Credit */}
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 flex items-center justify-center mt-0.5 shrink-0">
                <span className="text-[9px] sm:text-xs font-bold text-emerald-500">بـس</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-gray-500">جمع بستانکار</p>
                <p className="text-[11px] sm:text-sm font-bold text-emerald-600" dir="ltr">{formatNumber(entry.totalCredit)} ریال</p>
              </div>
            </div>
          </div>

          <Separator className="my-3 sm:my-4" />

          {/* Balance status */}
          <div className="flex items-start sm:items-center gap-2">
            <CheckCircle2 className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 mt-0.5 sm:mt-0 ${isBalanced ? 'text-emerald-500' : 'text-red-500'}`} />
            <span className={`text-[11px] sm:text-sm font-medium leading-relaxed ${isBalanced ? 'text-emerald-700' : 'text-red-700'}`}>
              {isBalanced
                ? 'سند متعادل است — جمع بدهکار با جمع بستانکار برابر است'
                : `سند نامتعادل — اختلاف: ${formatNumber(Math.abs(entry.totalDebit - entry.totalCredit))} ریال`}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Card View for Entry Lines */}
      <Card className="border-gray-200 sm:hidden">
        <CardHeader className="pb-2 px-3 pt-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600" />
            ردیف‌های سند
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-2">
          {lines.map((line: any, idx: number) => (
            <div
              key={line.id || idx}
              className="bg-gray-50 rounded-lg p-2.5 border border-gray-100"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-900 truncate">{line.accountName}</p>
                  <p className="text-[10px] text-gray-400 font-mono" dir="ltr">{line.accountCode}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-red-50 rounded-md p-1.5">
                  <p className="text-[9px] text-gray-500">بدهکار</p>
                  {line.debit > 0 ? (
                    <p className="text-[11px] font-bold text-red-600" dir="ltr">{formatNumber(line.debit)}</p>
                  ) : (
                    <p className="text-[11px] text-gray-300">—</p>
                  )}
                </div>
                <div className="bg-emerald-50 rounded-md p-1.5">
                  <p className="text-[9px] text-gray-500">بستانکار</p>
                  {line.credit > 0 ? (
                    <p className="text-[11px] font-bold text-emerald-600" dir="ltr">{formatNumber(line.credit)}</p>
                  ) : (
                    <p className="text-[11px] text-gray-300">—</p>
                  )}
                </div>
              </div>

              {line.description && (
                <p className="text-[10px] text-gray-500 mt-1.5">{line.description}</p>
              )}
            </div>
          ))}

          <div className="bg-gray-100 rounded-lg p-2.5 border border-gray-200 mt-3">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <p className="text-[9px] text-gray-500 mb-0.5">جمع بدهکار</p>
                <p className="text-xs font-bold text-red-600" dir="ltr">{formatNumber(entry.totalDebit)}</p>
              </div>
              <div>
                <p className="text-[9px] text-gray-500 mb-0.5">جمع بستانکار</p>
                <p className="text-xs font-bold text-emerald-600" dir="ltr">{formatNumber(entry.totalCredit)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Desktop Table View for Entry Lines */}
      <Card className="border-gray-200 hidden sm:block">
        <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600" />
            ردیف‌های سند
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-right text-[11px] sm:text-xs whitespace-nowrap px-3 sm:px-4">حساب</TableHead>
                  <TableHead className="text-right text-[11px] sm:text-xs whitespace-nowrap px-3 sm:px-4 hidden sm:table-cell">کد حساب</TableHead>
                  <TableHead className="text-right text-[11px] sm:text-xs whitespace-nowrap px-3 sm:px-4">بدهکار</TableHead>
                  <TableHead className="text-right text-[11px] sm:text-xs whitespace-nowrap px-3 sm:px-4">بستانکار</TableHead>
                  <TableHead className="text-right text-[11px] sm:text-xs whitespace-nowrap px-3 sm:px-4 hidden md:table-cell">شرح</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line: any, idx: number) => (
                  <TableRow key={line.id || idx} className="hover:bg-emerald-50/50">
                    <TableCell className="text-[11px] sm:text-sm font-medium whitespace-nowrap px-3 sm:px-4">{line.accountName}</TableCell>
                    <TableCell className="text-[11px] sm:text-sm font-mono whitespace-nowrap px-3 sm:px-4 hidden sm:table-cell" dir="ltr">{line.accountCode || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap px-3 sm:px-4">
                      {line.debit > 0 ? (
                        <span className="text-[11px] sm:text-sm font-bold text-red-600" dir="ltr">{formatNumber(line.debit)}</span>
                      ) : (
                        <span className="text-[11px] sm:text-sm text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 sm:px-4">
                      {line.credit > 0 ? (
                        <span className="text-[11px] sm:text-sm font-bold text-emerald-600" dir="ltr">{formatNumber(line.credit)}</span>
                      ) : (
                        <span className="text-[11px] sm:text-sm text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] sm:text-sm text-gray-600 max-w-[140px] sm:max-w-[200px] md:max-w-[250px] truncate px-3 sm:px-4 hidden md:table-cell">
                      {line.description || '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Total row */}
                <TableRow className="bg-gray-50 font-bold">
                  <TableCell className="text-[11px] sm:text-sm whitespace-nowrap px-3 sm:px-4">جمع کل</TableCell>
                  <TableCell className="hidden sm:table-cell px-3 sm:px-4" />
                  <TableCell className="whitespace-nowrap px-3 sm:px-4">
                    <span className="text-[11px] sm:text-sm text-red-600" dir="ltr">{formatNumber(entry.totalDebit)}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-3 sm:px-4">
                    <span className="text-[11px] sm:text-sm text-emerald-600" dir="ltr">{formatNumber(entry.totalCredit)}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell px-3 sm:px-4" />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
