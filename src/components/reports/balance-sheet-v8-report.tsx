// ============================================================================
// src/components/reports/balance-sheet-v8-report.tsx — v8.5 ★★★
// ShopAccounting — Balance Sheet Report Component (اصلاح شده)
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Loader2, AlertCircle, CheckCircle2, Download, Printer,
  TrendingUp, TrendingDown, Scale, Wallet, FileSpreadsheet,
} from 'lucide-react'
import { PersianDatePicker, formatJalaliLong } from '@/components/ui/persian-date-picker'
import { exportToExcel, printReport } from '@/lib/report-export'

// ═══════════════════════════════════════════════════════════════
//  Helper functions
// ═══════════════════════════════════════════════════════════════

function resolveTenantId(
  currentTenant: any,
  storeTenantId?: string | null,
  userTenantId?: string | null
): string {
  if (currentTenant?.id) return currentTenant.id
  if (typeof currentTenant === 'string') return currentTenant
  if (storeTenantId) return storeTenantId.trim()
  if (userTenantId) return userTenantId.trim()
  return ''
}

function formatRial(num: number): string {
  return (num || 0).toLocaleString('fa-IR')
}

// ═══════════════════════════════════════════════════════════════
//  Component: BalanceSheetSection
// ═══════════════════════════════════════════════════════════════

function BalanceSheetSection({
  title,
  icon,
  color,
  sections,
  total,
  totalLabel,
}: {
  title: string
  icon: React.ReactNode
  color: string
  sections: any[]
  total: number
  totalLabel: string
}) {
  // ★ فیلتر بخش‌های خالی (نسخه امن)
  const nonEmptySections = (sections || []).filter(s => {
    if (!s) return false
    const accounts = s.accounts || []
    return accounts.length > 0 || (s.subtotal !== undefined && s.subtotal !== 0)
  })

  if (nonEmptySections.length === 0) {
    return (
      <Card className="border-gray-200">
        <CardHeader className="p-3 border-b bg-gray-50">
          <CardTitle className="text-sm flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-xs text-gray-400">
          داده‌ای موجود نیست
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-gray-200">
      <CardHeader className="p-3 border-b bg-gray-50">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead className="text-xs text-right">کد حساب</TableHead>
              <TableHead className="text-xs text-right">نام حساب</TableHead>
              <TableHead className="text-xs text-center">مانده</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nonEmptySections.map((section, idx) => (
              <SectionRow key={idx} section={section} />
            ))}
            {/* ردیف جمع کل */}
            <TableRow className={`bg-gradient-to-l ${color} font-bold border-t-2 border-gray-300`}>
              <TableCell colSpan={2} className="text-sm">{totalLabel}</TableCell>
              <TableCell className="text-sm text-center font-mono font-bold">
                {formatRial(total)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function SectionRow({ section }: { section: any }) {
  const accounts = section.accounts || []
  if (accounts.length === 0) return null

  return (
    <>
      {/* ردیف عنوان زیربخش */}
      <TableRow className="bg-blue-50/30">
        <TableCell colSpan={3} className="text-xs font-bold text-blue-800 py-1.5">
          {section.label || 'حساب‌ها'}
        </TableCell>
      </TableRow>
      {/* ردیف‌های حساب‌ها */}
      {accounts.map((acc: any, i: number) => (
        <TableRow key={acc.id || acc.accountId || i} className="hover:bg-emerald-50/40">
          <TableCell className="text-xs font-mono text-gray-500">{acc.code || acc.accountCode}</TableCell>
          <TableCell className="text-xs font-medium text-gray-900">{acc.name || acc.accountName}</TableCell>
          <TableCell className="text-xs text-center font-mono font-bold">
            {formatRial(acc.balance)}
          </TableCell>
        </TableRow>
      ))}
      {/* ردیف subtotal زیربخش */}
      {section.subtotal !== undefined && (
        <TableRow className="bg-gray-100/70 font-medium border-b border-gray-200">
          <TableCell colSpan={2} className="text-xs text-gray-700">
            جمع {section.label || 'حساب‌ها'}
          </TableCell>
          <TableCell className="text-xs text-center font-mono font-bold text-gray-800">
            {formatRial(section.subtotal)}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════

export function BalanceSheetV8Report({ tier }: { tier: any }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)

  const today = new Date().toISOString().slice(0, 10)
  const [asOf, setAsOf] = useState<string | null>(today)

  const currentTenant = useAppStore((s) => s.currentTenant)
  const tenantIdFromStore = useAppStore((s) => s.tenantId)
  const userTenantId = useAppStore((s) => s.user?.tenantId)
  const tenantId = resolveTenantId(currentTenant, tenantIdFromStore, userTenantId)

  const fetchReport = useCallback(async () => {
    if (!tenantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (asOf) params.set('asOf', asOf)

      const res = await fetch(`/api/reports/balance-sheet?${params.toString()}`, {
        headers: { 'x-tenant-id': tenantId },
      })
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      } else {
        setError(json.error || 'خطا در بارگذاری')
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در ارتباط با سرور')
    } finally {
      setLoading(false)
    }
  }, [tenantId, asOf])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  // ═══════════════════════════════════════════════════════════════
  //  تبدیل داده API به ساختار مورد انتظار کامپوننت
  // ═══════════════════════════════════════════════════════════════

  const normalizedData = (() => {
    if (!data) return null

    // ★ API ساختار ساده برمی‌گردونه: { assets: { accounts: [...], total: ... } }
    // ★ کامپوننت ساختار پیچیده‌تر انتظار داره: { assets: { current: {...}, fixed: {...} } }
    // ★ این تبدیل انجام می‌شه

    const makeSections = (sectionData: any, defaultLabel: string) => {
      if (!sectionData) return [{ label: defaultLabel, accounts: [], subtotal: 0 }]

      // ★ اگه ساختار ساده است (accounts مستقیم)
      if (sectionData.accounts) {
        return [{
          label: sectionData.label || defaultLabel,
          accounts: sectionData.accounts || [],
          subtotal: sectionData.total || sectionData.subtotal || 0,
        }]
      }

      // ★ اگه ساختار پیچیده است (current, fixed, etc.)
      const subs = Object.values(sectionData).filter((v: any) => v && typeof v === 'object' && 'accounts' in v)
      if (subs.length > 0) {
        return subs.map((s: any) => ({
          label: s.label || defaultLabel,
          accounts: s.accounts || [],
          subtotal: s.subtotal || s.total || 0,
        }))
      }

      return [{ label: defaultLabel, accounts: [], subtotal: 0 }]
    }

    return {
      ...data,
      assets: {
        current: { label: 'دارایی‌های جاری', accounts: data.assets?.accounts || [], subtotal: data.assets?.total || data.totalAssets || 0 },
        fixed: { label: 'دارایی‌های ثابت', accounts: [], subtotal: 0 },
        intangible: { label: 'دارایی‌های نامشهود', accounts: [], subtotal: 0 },
        prepaid: { label: 'پرداختنی‌ها', accounts: [], subtotal: 0 },
        other: { label: 'سایر دارایی‌ها', accounts: [], subtotal: 0 },
      },
      liabilities: {
        current: { label: 'بدهی‌های جاری', accounts: data.liabilities?.accounts || [], subtotal: data.liabilities?.total || data.totalLiabilities || 0 },
        longTerm: { label: 'بدهی‌های بلندمدت', accounts: [], subtotal: 0 },
        other: { label: 'سایر بدهی‌ها', accounts: [], subtotal: 0 },
      },
      equity: {
        capital: { label: 'سرمایه', accounts: data.equity?.accounts || [], subtotal: data.equity?.total || data.totalEquity || 0 },
        retainedEarnings: { label: 'سود انباشته', accounts: [], subtotal: 0 },
        other: { label: 'سایر حقوق صاحبان سهام', accounts: [], subtotal: 0 },
      },
      retainedEarnings: data.retainedEarnings || (data.totalEquity || 0),
    }
  })()

  // ═══════════════════════════════════════════════════════════════
  //  Export to Excel
  // ═══════════════════════════════════════════════════════════════
  const handleExportExcel = () => {
    if (!normalizedData) return

    const reportTitle = 'ترازنامه'
    const reportSubtitle = `تاریخ مرجع: ${formatJalaliLong(normalizedData.asOf)}`

    const assetsSection = {
      title: 'دارایی‌ها',
      columns: [
        { header: 'کد حساب', key: 'accountCode', type: 'text' as const, align: 'center' as const },
        { header: 'نام حساب', key: 'accountName', type: 'text' as const, align: 'right' as const },
        { header: 'مانده (ریال)', key: 'balance', type: 'currency' as const, align: 'left' as const },
      ],
      rows: [] as any[],
      subtotalRow: { label: 'مجموع دارایی‌ها', values: { balance: normalizedData.totalAssets } },
    }

    for (const sub of [normalizedData.assets.current, normalizedData.assets.fixed, normalizedData.assets.intangible, normalizedData.assets.prepaid, normalizedData.assets.other]) {
      if (!sub || !sub.accounts || sub.accounts.length === 0) continue
      assetsSection.rows.push({ accountCode: '', accountName: `--- ${sub.label} ---`, balance: '' })
      for (const acc of sub.accounts) {
        assetsSection.rows.push({
          accountCode: acc.code || acc.accountCode || '',
          accountName: acc.name || acc.accountName || '',
          balance: acc.balance || 0,
        })
      }
      assetsSection.rows.push({ accountCode: '', accountName: `جمع ${sub.label}`, balance: sub.subtotal })
    }

    const liabilitiesSection = {
      title: 'بدهی‌ها',
      columns: [
        { header: 'کد حساب', key: 'accountCode', type: 'text' as const, align: 'center' as const },
        { header: 'نام حساب', key: 'accountName', type: 'text' as const, align: 'right' as const },
        { header: 'مانده (ریال)', key: 'balance', type: 'currency' as const, align: 'left' as const },
      ],
      rows: [] as any[],
      subtotalRow: { label: 'مجموع بدهی‌ها', values: { balance: normalizedData.totalLiabilities } },
    }

    for (const sub of [normalizedData.liabilities.current, normalizedData.liabilities.longTerm, normalizedData.liabilities.other]) {
      if (!sub || !sub.accounts || sub.accounts.length === 0) continue
      liabilitiesSection.rows.push({ accountCode: '', accountName: `--- ${sub.label} ---`, balance: '' })
      for (const acc of sub.accounts) {
        liabilitiesSection.rows.push({
          accountCode: acc.code || acc.accountCode || '',
          accountName: acc.name || acc.accountName || '',
          balance: acc.balance || 0,
        })
      }
      liabilitiesSection.rows.push({ accountCode: '', accountName: `جمع ${sub.label}`, balance: sub.subtotal })
    }

    const equitySection = {
      title: 'حقوق صاحبان سهام',
      columns: [
        { header: 'کد حساب', key: 'accountCode', type: 'text' as const, align: 'center' as const },
        { header: 'نام حساب', key: 'accountName', type: 'text' as const, align: 'right' as const },
        { header: 'مانده (ریال)', key: 'balance', type: 'currency' as const, align: 'left' as const },
      ],
      rows: [] as any[],
      subtotalRow: { label: 'مجموع حقوق صاحبان سهام', values: { balance: normalizedData.totalEquity } },
    }

    for (const sub of [normalizedData.equity.capital, normalizedData.equity.retainedEarnings, normalizedData.equity.other]) {
      if (!sub || !sub.accounts || sub.accounts.length === 0) continue
      equitySection.rows.push({ accountCode: '', accountName: `--- ${sub.label} ---`, balance: '' })
      for (const acc of sub.accounts) {
        equitySection.rows.push({
          accountCode: acc.code || acc.accountCode || '',
          accountName: acc.name || acc.accountName || '',
          balance: acc.balance || 0,
        })
      }
      equitySection.rows.push({ accountCode: '', accountName: `جمع ${sub.label}`, balance: sub.subtotal })
    }

    exportToExcel(
      `balance-sheet-${asOf || today}`,
      [assetsSection, liabilitiesSection, equitySection],
      reportTitle,
      reportSubtitle
    )
  }

  // ═══════════════════════════════════════════════════════════════
  //  Print PDF
  // ═══════════════════════════════════════════════════════════════
  const handlePrintPDF = () => {
    if (!normalizedData) return

    const title = 'ترازنامه'
    const subtitle = `تاریخ مرجع: ${formatJalaliLong(normalizedData.asOf)}`

    let content = ''

    content += `<div class="summary-box" style="background: ${normalizedData.isBalanced ? '#ecfdf5' : '#fef2f2'} !important; border-color: ${normalizedData.isBalanced ? '#10b981' : '#ef4444'};">`
    content += `<div style="display: flex; align-items: center; justify-content: space-between;">`
    content += `<div style="display: flex; align-items: center; gap: 12px;">`
    content += `<div style="font-size: 24pt; color: ${normalizedData.isBalanced ? '#10b981' : '#ef4444'};">${normalizedData.isBalanced ? '✓' : '⚠'}</div>`
    content += `<div>`
    content += `<div style="font-weight: bold; font-size: 13pt; color: ${normalizedData.isBalanced ? '#065f46' : '#991b1b'};">${normalizedData.isBalanced ? 'ترازنامه متعادل است' : 'ترازنامه نامتعادل!'}</div>`
    content += `<div style="font-size: 10pt; color: #666;">${normalizedData.isBalanced ? 'دارایی‌ها = بدهی‌ها + حقوق صاحبان سهام' : `اختلاف: ${formatRial(Math.abs(normalizedData.difference))} ریال`}</div>`
    content += `</div></div></div></div>`

    content += `<div class="kpi-grid">`
    content += `<div class="kpi-card emerald"><div class="kpi-title">مجموع دارایی‌ها</div><div class="kpi-value">${formatRial(normalizedData.totalAssets)}</div></div>`
    content += `<div class="kpi-card red"><div class="kpi-title">مجموع بدهی‌ها</div><div class="kpi-value">${formatRial(normalizedData.totalLiabilities)}</div></div>`
    content += `<div class="kpi-card blue"><div class="kpi-title">حقوق صاحبان سهام</div><div class="kpi-value">${formatRial(normalizedData.totalEquity)}</div></div>`
    content += `<div class="kpi-card ${normalizedData.retainedEarnings >= 0 ? 'emerald' : 'red'}"><div class="kpi-title">سود انباشته</div><div class="kpi-value">${formatRial(normalizedData.retainedEarnings)}</div></div>`
    content += `</div>`

    // Helper برای ساخت جدول
    const buildTable = (sections: any[], totalLabel: string, total: number, bgColor: string, textColor: string) => {
      let html = `<div class="section-title">${totalLabel}</div>`
      html += `<table><tr><th style="width: 15%">کد حساب</th><th style="width: 65%">نام حساب</th><th style="width: 20%">مانده (ریال)</th></tr>`
      for (const sub of sections) {
        if (!sub || !sub.accounts || sub.accounts.length === 0) continue
        html += `<tr><td colspan="3" style="background: ${bgColor}; font-weight: bold; color: ${textColor}; padding-right: 12px;">${sub.label}</td></tr>`
        for (const acc of sub.accounts) {
          html += `<tr><td style="text-align: center; font-family: monospace;">${acc.code || acc.accountCode || ''}</td><td>${acc.name || acc.accountName || ''}</td><td class="currency-cell">${formatRial(acc.balance)}</td></tr>`
        }
        html += `<tr class="subtotal-row"><td colspan="2" style="text-align: right;">جمع ${sub.label}</td><td class="currency-cell">${formatRial(sub.subtotal)}</td></tr>`
      }
      html += `<tr class="total-row"><td colspan="2">${totalLabel}</td><td class="currency-cell" style="font-size: 12pt;">${formatRial(total)}</td></tr>`
      html += `</table>`
      return html
    }

    content += buildTable([normalizedData.assets.current, normalizedData.assets.fixed, normalizedData.assets.intangible, normalizedData.assets.prepaid, normalizedData.assets.other], 'دارایی‌ها', normalizedData.totalAssets, '#eff6ff', '#1d4ed8')
    content += buildTable([normalizedData.liabilities.current, normalizedData.liabilities.longTerm, normalizedData.liabilities.other], 'بدهی‌ها', normalizedData.totalLiabilities, '#fef2f2', '#b91c1c')
    content += buildTable([normalizedData.equity.capital, normalizedData.equity.retainedEarnings, normalizedData.equity.other], 'حقوق صاحبان سهام', normalizedData.totalEquity, '#f5f3ff', '#6d28d9')

    content += `<div class="summary-box" style="background: #f9fafb !important;"><table>`
    content += `<tr><th style="width: 50%">مجموع بدهی‌ها و حقوق صاحبان سهام</th><th style="width: 50%">مجموع دارایی‌ها</th></tr>`
    content += `<tr class="total-row"><td class="currency-cell" style="font-size: 13pt;">${formatRial(normalizedData.totalLiabilitiesAndEquity)}</td><td class="currency-cell" style="font-size: 13pt;">${formatRial(normalizedData.totalAssets)}</td></tr>`
    content += `<tr><td colspan="2" style="text-align: center; padding: 10px; font-weight: bold; color: ${normalizedData.isBalanced ? '#065f46' : '#991b1b'};">${normalizedData.isBalanced ? '✓ ترازنامه متعادل است' : `⚠ اختلاف: ${formatRial(Math.abs(normalizedData.difference))} ریال`}</td></tr>`
    content += `</table></div>`

    printReport(title, subtitle, content)
  }

  // ═══════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="mr-3 text-sm text-gray-600">در حال محاسبه ترازنامه...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <AlertCircle className="w-4 h-4 text-red-600" />
        <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
      </Alert>
    )
  }

  if (!normalizedData) return null

  return (
    <div className="space-y-4" dir="rtl">
      {/* ★ Date Filter & Export */}
      <Card className="border-gray-200">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <PersianDatePicker
                value={asOf}
                onChange={(iso) => setAsOf(iso)}
                placeholder="تاریخ مرجع"
                label="ترازنامه در تاریخ"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="text-xs flex-1 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-700"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 ml-1" />
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrintPDF}
                className="text-xs flex-1 bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700"
              >
                <Printer className="w-3.5 h-3.5 ml-1" />
                PDF
              </Button>
            </div>
            <div className="flex justify-end items-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAsOf(today)}
                className="text-xs"
              >
                امروز
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">
            ترازنامه در تاریخ: <span className="font-bold">{formatJalaliLong(normalizedData.asOf)}</span>
          </p>
        </CardContent>
      </Card>

      {/* ★ Balance Status Alert */}
      <Card className={
        normalizedData.isBalanced
          ? 'border-emerald-200 bg-emerald-50/50'
          : 'border-red-200 bg-red-50/50'
      }>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            {normalizedData.isBalanced ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            ) : (
              <AlertCircle className="h-6 w-6 text-red-500" />
            )}
            <div>
              <p className="font-semibold text-sm">
                {normalizedData.isBalanced ? 'ترازنامه متعادل است' : 'ترازنامه نامتعادل!'}
              </p>
              <p className="text-xs text-gray-600">
                {normalizedData.isBalanced
                  ? 'مجموع دارایی‌ها با مجموع بدهی‌ها و حقوق صاحبان سهام برابر است'
                  : `اختلاف: ${formatRial(Math.abs(normalizedData.difference))} ریال`
                }
              </p>
            </div>
          </div>
          <Badge variant={normalizedData.isBalanced ? 'default' : 'destructive'} className="text-xs">
            {normalizedData.isBalanced ? '✓ متعادل' : '⚠ نامتعادل'}
          </Badge>
        </CardContent>
      </Card>

      {/* ★ KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs text-white/80 mb-1">مجموع دارایی‌ها</p>
                <p className="text-lg sm:text-xl font-bold text-white font-mono truncate">{formatRial(normalizedData.totalAssets)}</p>
                <p className="text-[10px] text-white/70 mt-1">ریال</p>
              </div>
              <Wallet className="w-8 h-8 text-white/80" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500 to-red-600 border-0">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs text-white/80 mb-1">مجموع بدهی‌ها</p>
                <p className="text-lg sm:text-xl font-bold text-white font-mono truncate">{formatRial(normalizedData.totalLiabilities)}</p>
                <p className="text-[10px] text-white/70 mt-1">ریال</p>
              </div>
              <TrendingDown className="w-8 h-8 text-white/80" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 border-0">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs text-white/80 mb-1">حقوق صاحبان سهام</p>
                <p className="text-lg sm:text-xl font-bold text-white font-mono truncate">{formatRial(normalizedData.totalEquity)}</p>
                <p className="text-[10px] text-white/70 mt-1">ریال</p>
              </div>
              <Scale className="w-8 h-8 text-white/80" />
            </div>
          </CardContent>
        </Card>

        <Card className={
          normalizedData.retainedEarnings >= 0
            ? 'bg-gradient-to-br from-emerald-600 to-teal-600 border-0'
            : 'bg-gradient-to-br from-red-500 to-red-600 border-0'
        }>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs text-white/80 mb-1">سود انباشته</p>
                <p className="text-lg sm:text-xl font-bold text-white font-mono truncate">{formatRial(normalizedData.retainedEarnings)}</p>
                <p className="text-[10px] text-white/70 mt-1">ریال (محاسبه شده)</p>
              </div>
              <TrendingUp className="w-8 h-8 text-white/80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ★ Balance Sheet — دو ستون */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ستون چپ: دارایی‌ها */}
        <BalanceSheetSection
          title="دارایی‌ها"
          icon={<Wallet className="w-4 h-4 text-emerald-600" />}
          color="from-emerald-100 to-emerald-50"
          sections={[
            normalizedData.assets.current,
            normalizedData.assets.fixed,
            normalizedData.assets.intangible,
            normalizedData.assets.prepaid,
            normalizedData.assets.other,
          ]}
          total={normalizedData.totalAssets}
          totalLabel="مجموع دارایی‌ها"
        />

        {/* ستون راست: بدهی‌ها و حقوق صاحبان سهام */}
        <div className="space-y-4">
          <BalanceSheetSection
            title="بدهی‌ها"
            icon={<TrendingDown className="w-4 h-4 text-red-600" />}
            color="from-red-100 to-red-50"
            sections={[
              normalizedData.liabilities.current,
              normalizedData.liabilities.longTerm,
              normalizedData.liabilities.other,
            ]}
            total={normalizedData.totalLiabilities}
            totalLabel="مجموع بدهی‌ها"
          />

          <BalanceSheetSection
            title="حقوق صاحبان سهام"
            icon={<Scale className="w-4 h-4 text-blue-600" />}
            color="from-blue-100 to-blue-50"
            sections={[
              normalizedData.equity.capital,
              normalizedData.equity.retainedEarnings,
              normalizedData.equity.other,
            ]}
            total={normalizedData.totalEquity}
            totalLabel="مجموع حقوق صاحبان سهام"
          />
        </div>
      </div>

      {/* ★ جمع نهایی */}
      <Card className="border-2 border-gray-300 bg-gradient-to-l from-emerald-50 via-blue-50 to-red-50">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
            <div className="border-l-0 sm:border-l border-gray-300 pb-2 sm:pb-0">
              <p className="text-xs text-gray-600 mb-1">مجموع دارایی‌ها</p>
              <p className="text-lg sm:text-xl font-bold text-emerald-700 font-mono">
                {formatRial(normalizedData.totalAssets)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">مجموع بدهی‌ها + حقوق صاحبان سهام</p>
              <p className="text-lg sm:text-xl font-bold text-blue-700 font-mono">
                {formatRial(normalizedData.totalLiabilitiesAndEquity)}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-300 text-center">
            {normalizedData.isBalanced ? (
              <p className="text-sm font-bold text-emerald-700 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                ترازنامه متعادل است — دارایی‌ها = بدهی‌ها + حقوق صاحبان سهام
              </p>
            ) : (
              <p className="text-sm font-bold text-red-700 flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4" />
                ترازنامه نامتعادل — اختلاف: {formatRial(Math.abs(normalizedData.difference))} ریال
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default BalanceSheetV8Report
