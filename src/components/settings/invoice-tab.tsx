'use client'

// ============================================================================
// src/components/settings/invoice-tab.tsx
// ShopAccounting — تب تنظیمات قالب فاکتور
// ============================================================================

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  FileText, Receipt, Save, CheckCircle2, Eye, Upload, Trash2,
} from 'lucide-react'

export function InvoiceTemplateTab() {
  const [headerText, setHeaderText] = useState('فاکتور فروش')
  const [footerText, setFooterText] = useState('با تشکر از خرید شما')
  const [bankAccounts, setBankAccounts] = useState('بانک ملت: ۶۱۰۴-****-****-۱۲۳۴')
  const [contactInfo, setContactInfo] = useState('تلفن: ۰۲۱۱۲۳۴۵۶۷۸')
  const [primaryColor, setPrimaryColor] = useState('#059669')
  const [showTax, setShowTax] = useState(true)
  const [showDiscount, setShowDiscount] = useState(true)
  const [defaultTemplate, setDefaultTemplate] = useState<'a4' | '8cm'>('a4')
  const [previewTemplate, setPreviewTemplate] = useState<'a4' | '8cm'>('a4')
  const [logoData, setLogoData] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('invoice-template-settings')
    if (saved) {
      try {
        const s = JSON.parse(saved)
        if (s.headerText) setHeaderText(s.headerText)
        if (s.footerText) setFooterText(s.footerText)
        if (s.bankAccounts) setBankAccounts(s.bankAccounts)
        if (s.contactInfo) setContactInfo(s.contactInfo)
        if (s.primaryColor) setPrimaryColor(s.primaryColor)
        if (s.showTax !== undefined) setShowTax(s.showTax)
        if (s.showDiscount !== undefined) setShowDiscount(s.showDiscount)
        if (s.defaultTemplate) setDefaultTemplate(s.defaultTemplate)
        if (s.logoData) setLogoData(s.logoData)
      } catch {}
    }
  }, [])

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('فقط فایل تصویری مجاز است (PNG, JPG)')
      return
    }
    if (file.size > 500 * 1024) {
      alert('حجم فایل باید کمتر از ۵۰۰ کیلوبایت باشد')
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result as string
      setLogoData(result)
    }
    reader.readAsDataURL(file)
  }

  const handleLogoRemove = () => {
    setLogoData('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const saveSettings = () => {
    localStorage.setItem('invoice-template-settings', JSON.stringify({
      headerText, footerText, bankAccounts, contactInfo, primaryColor,
      showTax, showDiscount, defaultTemplate, logoData,
    }))
    alert('تنظیمات قالب فاکتور ذخیره شد')
  }

  return (
    <div className="space-y-2">
      {/* انتخاب قالب پیش‌فرض */}
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardContent className="p-2.5 sm:p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-emerald-600" />
            <p className="text-xs font-bold text-emerald-800">انتخاب قالب پیش‌فرض فاکتور</p>
          </div>
          <p className="text-[10px] text-emerald-700">
            قالب پیش‌فرض در صفحه صندوق فروش برای چاپ استفاده می‌شه. صندوق‌دار می‌تونه در زمان چاپ، قالب دیگه‌ای هم انتخاب کنه.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`p-2 rounded-lg border-2 transition-all text-right ${defaultTemplate === 'a4' ? 'border-emerald-500 bg-white shadow-sm' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
              onClick={() => setDefaultTemplate('a4')}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <FileText className={`w-4 h-4 ${defaultTemplate === 'a4' ? 'text-emerald-600' : 'text-gray-400'}`} />
                <span className="text-xs font-bold">قالب A4</span>
                {defaultTemplate === 'a4' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-auto" />}
              </div>
              <p className="text-[9px] text-gray-500">فاکتور کامل با جزئیات، مناسب پرینترهای معمولی و A4</p>
            </button>
            <button
              className={`p-2 rounded-lg border-2 transition-all text-right ${defaultTemplate === '8cm' ? 'border-emerald-500 bg-white shadow-sm' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
              onClick={() => setDefaultTemplate('8cm')}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Receipt className={`w-4 h-4 ${defaultTemplate === '8cm' ? 'text-emerald-600' : 'text-gray-400'}`} />
                <span className="text-xs font-bold">قالب ۸ سانتی‌متر</span>
                {defaultTemplate === '8cm' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-auto" />}
              </div>
              <p className="text-[9px] text-gray-500">فاکتور باریک، مناسب پرینترهای حرارتی و چاپگرهای کوچک</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* تنظیمات مشترک */}
      <Card className="border-gray-200">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-emerald-600" />
            تنظیمات مشترک قالب
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2.5 sm:p-3 pt-2 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">لوگوی فروشگاه</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleLogoUpload}
                className="hidden"
              />
              {logoData ? (
                <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-1.5">
                  <img src={logoData} alt="logo" className="w-10 h-10 object-contain rounded border border-gray-100 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-emerald-600 font-medium">لوگو آپلود شد</p>
                    <p className="text-[9px] text-gray-400">PNG, JPG تا ۵۰۰KB</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700 shrink-0"
                    onClick={handleLogoRemove}
                    title="حذف لوگو"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-2 border border-dashed border-gray-300 rounded-lg p-2 hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors"
                >
                  <Upload className="w-5 h-5 text-gray-400 shrink-0" />
                  <div className="min-w-0 text-right">
                    <p className="text-[11px] text-gray-700">آپلود لوگو</p>
                    <p className="text-[9px] text-gray-400">PNG, JPG تا ۵۰۰KB</p>
                  </div>
                </button>
              )}
            </div>
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">رنگ اصلی</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-9 h-9 rounded-lg border cursor-pointer shrink-0" />
                <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} dir="ltr" className="h-8 text-xs w-24" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">متن سربرگ</Label>
              <Input value={headerText} onChange={(e) => setHeaderText(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">متن پاورقی</Label>
              <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">اطلاعات تماس</Label>
              <Input value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[11px] text-gray-600 mb-0.5 block">حساب‌های بانکی</Label>
              <Input value={bankAccounts} onChange={(e) => setBankAccounts(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between gap-2 px-2 py-1 bg-gray-50 rounded">
              <span className="text-[11px] text-gray-700">نمایش مالیات</span>
              <Switch checked={showTax} onCheckedChange={setShowTax} />
            </div>
            <div className="flex items-center justify-between gap-2 px-2 py-1 bg-gray-50 rounded">
              <span className="text-[11px] text-gray-700">نمایش تخفیف</span>
              <Switch checked={showDiscount} onCheckedChange={setShowDiscount} />
            </div>
          </div>

          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs" onClick={saveSettings}>
            <Save className="w-3.5 h-3.5 ml-1" />
            ذخیره تنظیمات
          </Button>
        </CardContent>
      </Card>

      {/* پیش‌نمایش */}
      <Card className="border-gray-200">
        <CardHeader className="p-2.5 sm:p-3 pb-1">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-emerald-600" />
              پیش‌نمایش قالب
            </CardTitle>
            <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded text-[10px]">
              <button
                className={`px-2 py-0.5 rounded ${previewTemplate === 'a4' ? 'bg-white text-emerald-700 font-bold shadow-sm' : 'text-gray-500'}`}
                onClick={() => setPreviewTemplate('a4')}
              >
                A4
              </button>
              <button
                className={`px-2 py-0.5 rounded ${previewTemplate === '8cm' ? 'bg-white text-emerald-700 font-bold shadow-sm' : 'text-gray-500'}`}
                onClick={() => setPreviewTemplate('8cm')}
              >
                8cm
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2.5 sm:p-3 pt-2">
          {previewTemplate === 'a4' && (
            <div className="border rounded-lg p-3 bg-white overflow-hidden" dir="rtl" style={{ aspectRatio: '1/1.414' }}>
              <div className="text-center text-white py-2 rounded-t-lg mb-2" style={{ backgroundColor: primaryColor }}>
                {logoData && (
                  <img src={logoData} alt="logo" className="max-h-12 max-w-24 mx-auto mb-1 block" />
                )}
                <p className="text-sm font-bold">{headerText}</p>
                <p className="text-[10px] opacity-80">فروشگاه نمونه</p>
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between border-b pb-1 gap-2">
                  <span className="text-gray-500">شماره:</span>
                  <span>INV-14031201</span>
                </div>
                <div className="flex justify-between border-b pb-1 gap-2">
                  <span className="text-gray-500">تاریخ:</span>
                  <span>۱۴۰۳/۱۲/۲۱</span>
                </div>
                <div className="flex justify-between border-b pb-1 gap-2">
                  <span className="text-gray-500">مشتری:</span>
                  <span>محمد احمدی</span>
                </div>
              </div>
              <table className="w-full text-[10px] mt-2">
                <thead>
                  <tr style={{ backgroundColor: primaryColor + '15' }}>
                    <th className="text-right p-1">کالا</th>
                    <th className="text-center p-1">تعداد</th>
                    <th className="text-center p-1">قیمت</th>
                    <th className="text-center p-1">مبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-1">شیر کاله</td>
                    <td className="text-center p-1">۵</td>
                    <td className="text-center p-1" dir="ltr">۳۲,۰۰۰</td>
                    <td className="text-center p-1" dir="ltr">۱۶۰,۰۰۰</td>
                  </tr>
                </tbody>
              </table>
              <div className="space-y-0.5 mt-2 text-[11px]">
                {showTax && (
                  <div className="flex justify-between border-t pt-1 gap-2">
                    <span className="text-gray-500">مالیات (۹٪):</span>
                    <span dir="ltr">۱۴,۴۰۰</span>
                  </div>
                )}
                {showDiscount && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">تخفیف:</span>
                    <span dir="ltr">۰</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-1 border-t-2 gap-2" style={{ borderColor: primaryColor }}>
                  <span>جمع کل:</span>
                  <span dir="ltr">۱۷۴,۴۰۰ ریال</span>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t text-[9px] text-gray-500 text-center">
                <p>{footerText}</p>
                <p>{contactInfo} | {bankAccounts}</p>
              </div>
            </div>
          )}

          {previewTemplate === '8cm' && (
            <div className="mx-auto border rounded-lg p-2 bg-white overflow-hidden" dir="rtl" style={{ maxWidth: '220px', minHeight: '400px' }}>
              <div className="text-center py-1.5 border-b-2" style={{ borderColor: primaryColor }}>
                {logoData && (
                  <img src={logoData} alt="logo" className="max-h-8 max-w-16 mx-auto mb-0.5 block" />
                )}
                <p className="text-[11px] font-bold" style={{ color: primaryColor }}>{headerText}</p>
                <p className="text-[8px] text-gray-600">فروشگاه نمونه</p>
                <p className="text-[8px] text-gray-500">{contactInfo}</p>
              </div>
              <div className="space-y-0.5 text-[9px] py-1.5 border-b border-dashed">
                <div className="flex justify-between gap-1">
                  <span className="text-gray-500">شماره:</span>
                  <span className="font-mono">INV-01401</span>
                </div>
                <div className="flex justify-between gap-1">
                  <span className="text-gray-500">تاریخ:</span>
                  <span>۱۴۰۳/۱۲/۲۱</span>
                </div>
                <div className="flex justify-between gap-1">
                  <span className="text-gray-500">مشتری:</span>
                  <span>محمد احمدی</span>
                </div>
              </div>
              <div className="py-1.5 border-b border-dashed">
                <div className="flex justify-between text-[8px] font-bold pb-0.5 border-b" style={{ color: primaryColor }}>
                  <span>کالا</span>
                  <span>مبلغ</span>
                </div>
                <div className="flex justify-between text-[9px] py-0.5">
                  <span className="truncate">شیر کاله × ۵</span>
                  <span dir="ltr" className="font-mono">۱۶۰,۰۰۰</span>
                </div>
                <div className="flex justify-between text-[9px] py-0.5">
                  <span className="truncate">نان بربری × ۲</span>
                  <span dir="ltr" className="font-mono">۴۰,۰۰۰</span>
                </div>
              </div>
              <div className="space-y-0.5 text-[9px] py-1.5">
                {showTax && (
                  <div className="flex justify-between gap-1">
                    <span className="text-gray-500">مالیات:</span>
                    <span dir="ltr" className="font-mono">۱۴,۴۰۰</span>
                  </div>
                )}
                {showDiscount && (
                  <div className="flex justify-between gap-1">
                    <span className="text-gray-500">تخفیف:</span>
                    <span dir="ltr" className="font-mono">۰</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-1 border-t-2 gap-1" style={{ borderColor: primaryColor }}>
                  <span>جمع کل:</span>
                  <span dir="ltr" className="font-mono">۱۷۴,۴۰۰</span>
                </div>
              </div>
              <div className="text-center text-[8px] text-gray-500 mt-2 pt-1 border-t">
                <p>{footerText}</p>
                <p className="mt-0.5">{bankAccounts}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}