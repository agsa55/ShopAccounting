// ============================================================================
// src/components/pos/customer-autocomplete.tsx — Live Search + Keyboard Nav
// ★ v1.1: Fix: selectedCustomerName accepts string | null | undefined
// ============================================================================

'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Search,
  User,
  Phone,
  MapPin,
  CreditCard,
  Plus,
  Loader2,
  AlertCircle,
  BadgeCheck,
  X,
  Hash,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePOSCustomerSearch, type POSCustomer } from '@/lib/use-pos-customer-search'

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

const toFaNum = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined) return '۰'
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)])
}

const formatPrice = (n: number): string => {
  if (n === null || n === undefined || isNaN(n)) return '۰'
  return toFaNum(Math.round(n).toLocaleString('en-US'))
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim() || !text) return <>{text}</>
  try {
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-emerald-100 text-emerald-800 font-bold px-0.5 rounded">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    )
  } catch {
    return <>{text}</>
  }
}

function CustomerAvatar({ customer }: { customer: POSCustomer }) {
  const initials = useMemo(() => {
    const first = customer.firstName?.[0] || ''
    const last = customer.lastName?.[0] || ''
    return (first + last).trim() || '؟'
  }, [customer.firstName, customer.lastName])

  const colors = useMemo(() => {
    const palette = [
      { bg: 'bg-emerald-100', text: 'text-emerald-700' },
      { bg: 'bg-blue-100', text: 'text-blue-700' },
      { bg: 'bg-purple-100', text: 'text-purple-700' },
      { bg: 'bg-pink-100', text: 'text-pink-700' },
      { bg: 'bg-amber-100', text: 'text-amber-700' },
      { bg: 'bg-cyan-100', text: 'text-cyan-700' },
      { bg: 'bg-orange-100', text: 'text-orange-700' },
    ]
    const idx = (customer.firstName?.charCodeAt(0) || 0) % palette.length
    return palette[idx]
  }, [customer.firstName])

  return (
    <div
      className={`w-9 h-9 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center font-bold text-sm shrink-0 border border-white shadow-sm`}
    >
      {initials}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Props — ★ v1.1: selectedCustomerName accepts null/undefined
// ═══════════════════════════════════════════════════════════════

interface CustomerAutocompleteProps {
  selectedCustomerId: string | null
  selectedCustomerName: string | null | undefined  // ★ اصلاح شد
  onSelect: (customer: POSCustomer | null) => void
  onAddNew: () => void
  placeholder?: string
  className?: string
}

// ═══════════════════════════════════════════════════════════════
//  کامپوننت اصلی
// ═══════════════════════════════════════════════════════════════

export function CustomerAutocomplete({
  selectedCustomerId,
  selectedCustomerName,
  onSelect,
  onAddNew,
  placeholder = 'جستجوی مشتری...',
  className = '',
}: CustomerAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // ★ v1.1: مقدار امن برای selectedCustomerName
  const safeCustomerName = selectedCustomerName || ''

  const {
    query,
    setQuery,
    results,
    isLoading,
    isSearching,
    hasMore,
    totalCount,
    error,
    retry,
  } = usePOSCustomerSearch(2, 300, 20, true)

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        inputRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return
      }
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-customer-item]')
      const item = items[highlightedIndex] as HTMLElement
      if (item) {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [highlightedIndex])

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [results])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
        if (query.trim().length >= 2) {
          setIsOpen(true)
        }
        return
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          if (results.length > 0) {
            setHighlightedIndex((prev) =>
              prev < results.length - 1 ? prev + 1 : 0
            )
          }
          break

        case 'ArrowUp':
          e.preventDefault()
          if (results.length > 0) {
            setHighlightedIndex((prev) =>
              prev > 0 ? prev - 1 : results.length - 1
            )
          }
          break

        case 'Enter':
          e.preventDefault()
          if (highlightedIndex >= 0 && results[highlightedIndex]) {
            handleSelectCustomer(results[highlightedIndex])
          } else if (results.length === 1) {
            handleSelectCustomer(results[0])
          } else if (query.trim().length >= 2 && results.length === 0 && !isSearching) {
            onAddNew()
          }
          break

        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          inputRef.current?.blur()
          break

        case 'Tab':
          setIsOpen(false)
          break
      }
    },
    [isOpen, query, results, highlightedIndex, isSearching, onAddNew]
  )

  const handleSelectCustomer = (customer: POSCustomer | null) => {
    onSelect(customer)
    setQuery('')
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    if (value.trim().length >= 2) {
      setIsOpen(true)
    } else {
      setIsOpen(false)
    }
  }

  const handleClearSelection = () => {
    onSelect(null)
    setQuery('')
    inputRef.current?.focus()
  }

  const showDropdown = isOpen && (query.trim().length >= 2 || results.length > 0)

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 z-10" />

        {selectedCustomerId && !isOpen ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setIsOpen(true)
              setTimeout(() => inputRef.current?.focus(), 10)
            }}
            className="w-full h-9 sm:h-8 pr-8 pl-8 text-right bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2 hover:bg-emerald-100 transition-colors"
          >
            <User className="w-3 h-3 text-emerald-600 shrink-0" />
            <span className="flex-1 truncate text-xs sm:text-[11px] font-semibold text-emerald-800">
              {safeCustomerName}
            </span>
          </button>
        ) : (
          <Input
            ref={inputRef}
            type="text"
            placeholder={safeCustomerName || placeholder}
            value={query}
            onChange={handleInputChange}
            onFocus={() => {
              if (query.trim().length >= 2) setIsOpen(true)
            }}
            onKeyDown={handleKeyDown}
            className="h-9 sm:h-8 text-xs sm:text-[11px] pr-8 pl-8 border-slate-200 bg-white focus:bg-white"
            autoComplete="off"
            dir="rtl"
          />
        )}

        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10">
          {isSearching || isLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
          ) : selectedCustomerId && !isOpen ? (
            <button
              type="button"
              onClick={handleClearSelection}
              className="w-5 h-5 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors"
              title="حذف انتخاب"
            >
              <X className="w-3 h-3 text-red-600" />
            </button>
          ) : query.trim() ? (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setIsOpen(false)
              }}
              className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              title="پاک کردن"
            >
              <X className="w-3 h-3 text-slate-500" />
            </button>
          ) : null}
        </div>
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-[100] w-full bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden"
          style={{
            bottom: 'calc(100% + 4px)',
            maxHeight: '400px',
          }}
        >
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
              <User className="w-3 h-3" />
              <span>
                {isSearching ? 'در حال جستجو...' : `${toFaNum(totalCount)} مشتری یافت شد`}
              </span>
            </div>
            {hasMore && (
              <Badge variant="outline" className="text-[8px] py-0 h-4 border-slate-300 text-slate-500">
                + بیشتر
              </Badge>
            )}
          </div>

          <ScrollArea className="max-h-[350px]" ref={listRef}>
            {error && !isSearching && results.length === 0 && (
              <div className="p-4 text-center">
                <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
                <p className="text-xs text-red-600 mb-2">{error}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={retry}
                  className="text-[10px] h-7"
                >
                  تلاش مجدد
                </Button>
              </div>
            )}

            {isLoading && results.length === 0 && (
              <div className="p-6 text-center">
                <Loader2 className="w-6 h-6 text-emerald-500 mx-auto mb-2 animate-spin" />
                <p className="text-xs text-slate-500">در حال جستجو...</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="py-1">
                {results.map((customer, idx) => {
                  const isHighlighted = idx === highlightedIndex
                  const isSelected = customer.id === selectedCustomerId
                  const hasDebt = customer.currentBalance > 0
                  const hasCredit = customer.currentBalance < 0

                  return (
                    <button
                      key={customer.id}
                      type="button"
                      data-customer-item
                      onClick={() => handleSelectCustomer(customer)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`w-full text-right px-3 py-2.5 border-b border-slate-100 last:border-0 transition-all ${
                        isSelected
                          ? 'bg-emerald-50 border-r-4 border-r-emerald-500'
                          : isHighlighted
                          ? 'bg-slate-50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <CustomerAvatar customer={customer} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-[12px] text-slate-900 truncate">
                              {highlightMatch(customer.displayName, query)}
                            </span>
                            {isSelected && (
                              <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            )}
                          </div>

                          <div className="space-y-0.5">
                            {customer.mobile && (
                              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                                <Phone className="w-2.5 h-2.5" />
                                <span className="font-mono">{toFaNum(customer.mobile)}</span>
                              </div>
                            )}

                            {customer.nationalCode && (
                              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                                <Hash className="w-2.5 h-2.5" />
                                <span className="font-mono">{toFaNum(customer.nationalCode)}</span>
                              </div>
                            )}

                            {customer.address && (
                              <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{customer.address}</span>
                              </div>
                            )}
                          </div>

                          {(hasDebt || hasCredit) && (
                            <div className="mt-1 flex items-center gap-1">
                              <CreditCard className="w-2.5 h-2.5" />
                              {hasDebt ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-medium">
                                  بدهی: {formatPrice(customer.currentBalance)} ریال
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium">
                                  اعتبار: {formatPrice(Math.abs(customer.currentBalance))} ریال
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {!isLoading && !isSearching && query.trim().length >= 2 && results.length === 0 && !error && (
              <div className="p-4 text-center">
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-2">
                  <User className="w-6 h-6 text-amber-500" />
                </div>
                <p className="text-xs font-semibold text-slate-700 mb-1">
                  مشتری «{query}» یافت نشد
                </p>
                <p className="text-[10px] text-slate-500 mb-3">
                  می‌توانید همین الان مشتری جدید اضافه کنید
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    onAddNew()
                    setIsOpen(false)
                  }}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] h-8 px-3"
                >
                  <Plus className="w-3 h-3 ml-1" />
                  افزودن مشتری جدید
                </Button>
              </div>
            )}
          </ScrollArea>

          {results.length > 0 && (
            <div className="px-3 py-2 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  onAddNew()
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 py-1.5 rounded transition-colors"
              >
                <Plus className="w-3 h-3" />
                افزودن مشتری جدید (Ctrl+N)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}