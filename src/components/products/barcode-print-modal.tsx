'use client'

// ============================================================================
// src/components/products/barcode-print-modal.tsx (v8.9)
// ============================================================================
// ★ چاپ بارکد‌های محصول در A4/A5
// ★ لیاوت: 3 ستون × 8 ردیف (24 بارکد در A4)
// ★ استفاده از jsbarcode برای تولید SVG
// ★ چاپ مستقیم از مرورگر (بدون jspdf)
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Printer, AlertTriangle } from 'lucide-react'

interface Product {
  id: string
  code: string
  barcode?: string | null
  name: string
}

interface BarcodePrintModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
}

// ══════════════════════════════════════════════
// کامپوننت اصلی
// ══════════════════════════════════════════════
export function BarcodePrintModal({
  open,
  onOpenChange,
  products,
}: BarcodePrintModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [printing, setPrinting] = useState(false)
  const [paperSize, setPaperSize] = useState<'a4' | 'a5'>('a4')

  // ★ محصولاتی که بارکد دارند
  const productsWithBarcode = products.filter(
    (p) => p.barcode && p.barcode.trim()
  )

  // ★ ریست انتخاب هنگام باز شدن مودال
  useEffect(() => {
    if (open) setSelectedIds(new Set())
  }, [open])

  // ★ toggle انتخاب
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ★ انتخاب/حذف همه
  const toggleAll = () => {
    if (selectedIds.size === productsWithBarcode.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(productsWithBarcode.map((p) => p.id)))
    }
  }

  // ★ محصولات انتخاب‌شده
  const selectedProducts = productsWithBarcode.filter((p) =>
    selectedIds.has(p.id)
  )

  // ★ چاپ با window.print()
  const handlePrint = useCallback(() => {
    if (selectedProducts.length === 0) return
    setPrinting(true)

    // ★ ساخت HTML چاپ
    const cols = paperSize === 'a4' ? 3 : 2
    const pageWidth = paperSize === 'a4' ? '210mm' : '148mm'
    const pageHeight = paperSize === 'a4' ? '297mm' : '210mm'
    const itemHeight = paperSize === 'a4' ? '85px' : '70px'
    const barcodeHeight = paperSize === 'a4' ? 55 : 40

    // ★ ساخت SVG بارکد با jsbarcode
    // چون jsbarcode در server-side کار نمی‌کند، از Canvas استفاده می‌کنیم
    const barcodeItems = selectedProducts
      .map((p) => {
        // ★ ساخت canvas موقت برای jsbarcode
        const canvas = document.createElement('canvas')
        try {
          // @ts-ignore
          if (typeof window !== 'undefined' && window.JsBarcode) {
            // @ts-ignore
            window.JsBarcode(canvas, p.barcode!, {
              format: 'EAN13',
              width: 2,
              height: barcodeHeight,
              margin: 4,
              displayValue: true,
              fontSize: 11,
            })
            const dataUrl = canvas.toDataURL('image/png')
            return `
              <div style="
                border: 1px solid #ddd;
                padding: 4px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: ${itemHeight};
                box-sizing: border-box;
                overflow: hidden;
              ">
                <img src="${dataUrl}" style="max-width:100%; height:auto;" />
                <div style="font-size:9px; font-weight:bold; text-align:center; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">
                  ${p.name}
                </div>
                <div style="font-size:8px; color:#666;">کد: ${p.code}</div>
              </div>
            `
          }
        } catch (e) {
          // fallback: نمایش بارکد به صورت متنی
        }

        // ★ Fallback: متن بارکد بدون SVG
        return `
          <div style="
            border: 1px solid #ddd;
            padding: 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: ${itemHeight};
            box-sizing: border-box;
          ">
            <div style="font-size:20px; font-weight:bold; letter-spacing:2px; font-family:monospace;">
              ${p.barcode}
            </div>
            <div style="font-size:9px; font-weight:bold; margin-top:4px;">${p.name}</div>
            <div style="font-size:8px; color:#666;">کد: ${p.code}</div>
          </div>
        `
      })
      .join('')

    const printHTML = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>چاپ بارکد</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page {
            size: ${pageWidth} ${pageHeight};
            margin: 8mm;
          }
          body {
            font-family: Tahoma, Arial, sans-serif;
            background: white;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(${cols}, 1fr);
            gap: 4px;
            width: 100%;
          }
          .item {
            border: 1px solid #ddd;
            padding: 4px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: ${itemHeight};
            overflow: hidden;
          }
          .item img { max-width: 100%; height: auto; }
          .item-name { font-size: 9px; font-weight: bold; text-align: center; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
          .item-code { font-size: 8px; color: #666; }
          .page-break { page-break-before: always; }
        </style>
      </head>
      <body>
        <div class="grid" id="barcodeGrid">
          ${selectedProducts
            .map(
              (p, i) => `
            <div class="item" data-barcode="${p.barcode}" data-name="${p.name}" data-code="${p.code}">
              <svg id="barcode-${i}"></svg>
              <div class="item-name">${p.name}</div>
              <div class="item-code">کد: ${p.code}</div>
            </div>
          `
            )
            .join('')}
        </div>
        <script>
          window.onload = function() {
            ${selectedProducts
              .map(
                (p, i) => `
              try {
                JsBarcode("#barcode-${i}", "${p.barcode}", {
                  format: "EAN13",
                  width: 2,
                  height: ${barcodeHeight},
                  margin: 3,
                  displayValue: true,
                  fontSize: 10,
                });
              } catch(e) {
                document.getElementById("barcode-${i}").outerHTML = 
                  '<div style="font-size:14px;font-family:monospace;letter-spacing:2px;">${p.barcode}</div>';
              }
            `
              )
              .join('')}
            setTimeout(function() { window.print(); window.close(); }, 800);
          };
        <\/script>
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank', 'width=800,height=600')
    if (printWindow) {
      printWindow.document.write(printHTML)
      printWindow.document.close()
    }

    setPrinting(false)
  }, [selectedProducts, paperSize])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[750px] max-h-[85vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-emerald-600" />
            چاپ بارکد محصولات
          </DialogTitle>
          <DialogDescription className="text-xs">
            بارکدهای مورد نظر را انتخاب کنید سپس دکمه چاپ را بزنید
          </DialogDescription>
        </DialogHeader>

        {productsWithBarcode.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-2 justify-center">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-700">
              هیچ محصولی با بارکد موجود نیست. ابتدا برای محصولات بارکد تولید
              کنید.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ★ تنظیمات چاپ */}
            <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">سایز کاغذ:</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPaperSize('a4')}
                    className={`px-3 py-1 text-xs rounded border transition-colors ${
                      paperSize === 'a4'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'
                    }`}
                  >
                    A4
                  </button>
                  <button
                    onClick={() => setPaperSize('a5')}
                    className={`px-3 py-1 text-xs rounded border transition-colors ${
                      paperSize === 'a5'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'
                    }`}
                  >
                    A5
                  </button>
                </div>
              </div>
              <div className="mr-auto">
                <span className="text-xs text-gray-500">
                  {paperSize === 'a4' ? '۳ ستون × ۸ ردیف (۲۴ بارکد)' : '۲ ستون × ۶ ردیف (۱۲ بارکد)'}
                </span>
              </div>
            </div>

            {/* ★ انتخاب همه + تعداد */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all"
                  checked={
                    productsWithBarcode.length > 0 &&
                    selectedIds.size === productsWithBarcode.length
                  }
                  onCheckedChange={toggleAll}
                />
                <Label htmlFor="select-all" className="text-xs cursor-pointer">
                  انتخاب همه ({productsWithBarcode.length} محصول)
                </Label>
              </div>
              {selectedIds.size > 0 && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                  {selectedIds.size} انتخاب‌شده
                </span>
              )}
            </div>

            {/* ★ لیست محصولات */}
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[320px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-gray-50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="w-10 text-center"></TableHead>
                      <TableHead className="text-right text-xs">کد</TableHead>
                      <TableHead className="text-right text-xs">
                        نام محصول
                      </TableHead>
                      <TableHead className="text-right text-xs">
                        بارکد
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsWithBarcode.map((product) => (
                      <TableRow
                        key={product.id}
                        className={`hover:bg-gray-50 cursor-pointer ${
                          selectedIds.has(product.id) ? 'bg-emerald-50' : ''
                        }`}
                        onClick={() => toggleSelect(product.id)}
                      >
                        <TableCell className="text-center">
                          <Checkbox
                            checked={selectedIds.has(product.id)}
                            onCheckedChange={() => toggleSelect(product.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {product.code}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {product.name}
                        </TableCell>
                        <TableCell
                          className="text-xs font-mono text-gray-600"
                          dir="ltr"
                        >
                          {product.barcode}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* ★ راهنما */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-[11px] text-blue-700 leading-relaxed">
                💡 <strong>راهنما:</strong> پس از کلیک روی «چاپ»، یک پنجره جدید باز می‌شود
                و بارکدها به صورت شبکه‌ای {paperSize === 'a4' ? '۳×۸' : '۲×۶'} نمایش داده
                می‌شوند. می‌توانید مستقیم چاپ کنید یا PDF ذخیره کنید.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            بستن
          </Button>
          <Button
            onClick={handlePrint}
            disabled={selectedIds.size === 0 || printing}
            className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 text-xs"
          >
            {printing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Printer className="w-3.5 h-3.5" />
            )}
            چاپ {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default BarcodePrintModal