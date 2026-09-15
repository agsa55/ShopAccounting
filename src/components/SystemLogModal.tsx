'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Copy, Download, Trash2, X, Check, Filter, RotateCcw,
  FileText, AlertTriangle, Info, Bug, User, Server,
  Search, ChevronDown
} from 'lucide-react'
import { 
  SystemLog, 
  getLogs, 
  clearAllLogs,
  formatLogsForCopy,
  LogLevel,
  LogSource
} from '@/lib/system-logger'

interface SystemLogModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SystemLogModal({ open, onOpenChange }: SystemLogModalProps) {
  const [logs, setLogs] = useState<SystemLog[]>([])
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all')
  const [filterSource, setFilterSource] = useState<LogSource | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [copied, setCopied] = useState(false)

  // بارگذاری لاگ‌ها هنگام باز شدن مودال
  useEffect(() => {
    if (open) {
      setLogs(getLogs())
      setCopied(false)
    }
  }, [open])

  // محاسبه آمار برای هر فیلتر
  const stats = useMemo(() => {
    const levelStats: Record<string, number> = { all: logs.length }
    const sourceStats: Record<string, number> = { all: logs.length }

    logs.forEach(log => {
      levelStats[log.level] = (levelStats[log.level] || 0) + 1
      sourceStats[log.source] = (sourceStats[log.source] || 0) + 1
    })

    return { levelStats, sourceStats }
  }, [logs])

  // فیلتر لاگ‌ها
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // فیلتر سطح
      if (filterLevel !== 'all' && log.level !== filterLevel) return false
      
      // فیلتر منبع
      if (filterSource !== 'all' && log.source !== filterSource) return false
      
      // فیلتر جستجو
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchesMessage = log.message.toLowerCase().includes(query)
        const matchesMetadata = log.metadata 
          ? JSON.stringify(log.metadata).toLowerCase().includes(query)
          : false
        
        if (!matchesMessage && !matchesMetadata) return false
      }
      
      return true
    })
  }, [logs, filterLevel, filterSource, searchQuery])

  // ریست همه فیلترها
  const resetFilters = () => {
    setFilterLevel('all')
    setFilterSource('all')
    setSearchQuery('')
  }

  // بررسی آیا فیلتری فعال است
  const hasActiveFilters = filterLevel !== 'all' || filterSource !== 'all' || searchQuery.trim() !== ''

  // کپی لاگ‌ها
  const handleCopyAll = async () => {
    try {
      const text = formatLogsForCopy(filteredLogs)
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Copy failed:', error)
    }
  }

  // دانلود لاگ‌ها
  const handleDownload = () => {
    const text = formatLogsForCopy(filteredLogs)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `system-logs-${new Date().toISOString().split('T')[0]}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  // پاک کردن همه لاگ‌ها
  const handleClearAll = () => {
    if (confirm('آیا از پاک کردن همه لاگ‌ها مطمئن هستید؟')) {
      clearAllLogs()
      setLogs([])
    }
  }

  // آیکون و رنگ بر اساس سطح
  const getLevelConfig = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return { icon: Bug, color: 'text-red-600', bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-800' }
      case 'warn':
        return { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-800' }
      case 'info':
        return { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', badge: 'bg-blue-100 text-blue-800' }
      case 'debug':
        return { icon: FileText, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', badge: 'bg-gray-100 text-gray-800' }
    }
  }

  // آیکون بر اساس منبع
  const getSourceIcon = (source: LogSource) => {
    switch (source) {
      case 'user': return User
      case 'api': return Server
      default: return FileText
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="!max-w-5xl !w-[95vw] !max-h-[90vh] !h-auto !p-0 !gap-0 !overflow-hidden flex flex-col"
        style={{ height: '85vh', maxHeight: '85vh' }}
      >
        {/* ═══ هدر (ثابت) ═══ */}
        <div className="px-6 py-4 border-b bg-gradient-to-l from-blue-50 to-indigo-50 shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">لاگ‌های سیستم</DialogTitle>
                <p className="text-xs text-gray-500">
                  {filteredLogs.length} لاگ از مجموع {logs.length} لاگ در ۲۴ ساعت اخیر
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* دکمه ریست فیلترها */}
              {hasActiveFilters && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={resetFilters}
                  className="gap-1.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  ریست فیلترها
                </Button>
              )}
              
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleCopyAll}
                disabled={filteredLogs.length === 0}
                className="gap-1.5"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'کپی شد!' : 'کپی همه'}
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleDownload}
                disabled={filteredLogs.length === 0}
                className="gap-1.5"
              >
                <Download className="w-4 h-4" />
                دانلود
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleClearAll}
                className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                پاک کردن
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => onOpenChange(false)}
                className="w-8 h-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

      {/* ═══ فیلترها (ثابت) - فشرده در یک ردیف ═══ */}
<div className="px-6 py-3 border-b bg-gray-50 shrink-0 space-y-2">
  {/* جستجو */}
  <div className="relative">
    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    <input
      type="text"
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      placeholder="جستجو در لاگ‌ها..."
      className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
    />
    {searchQuery && (
      <button
        onClick={() => setSearchQuery('')}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>

  {/* فیلترهای سطح و منبع در یک ردیف */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    {/* فیلتر سطح */}
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Filter className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-xs font-medium text-gray-700">سطح:</span>
        {filterLevel !== 'all' && (
          <Badge className="text-[9px] bg-blue-100 text-blue-700">
            فیلتر فعال
          </Badge>
        )}
      </div>
      <div className="flex gap-1 flex-wrap">
        <Button
          size="sm"
          variant={filterLevel === 'all' ? 'default' : 'outline'}
          onClick={() => setFilterLevel('all')}
          className="h-7 text-[11px] px-2 gap-1"
        >
          همه
          <span className="text-[9px] opacity-70">({stats.levelStats.all})</span>
        </Button>
        <Button
          size="sm"
          variant={filterLevel === 'error' ? 'default' : 'outline'}
          onClick={() => setFilterLevel('error')}
          className="h-7 text-[11px] px-2 gap-1 text-red-600"
        >
          <Bug className="w-3 h-3" />
          خطا
          <span className="text-[9px] opacity-70">({stats.levelStats.error || 0})</span>
        </Button>
        <Button
          size="sm"
          variant={filterLevel === 'warn' ? 'default' : 'outline'}
          onClick={() => setFilterLevel('warn')}
          className="h-7 text-[11px] px-2 gap-1 text-amber-600"
        >
          <AlertTriangle className="w-3 h-3" />
          هشدار
          <span className="text-[9px] opacity-70">({stats.levelStats.warn || 0})</span>
        </Button>
        <Button
          size="sm"
          variant={filterLevel === 'info' ? 'default' : 'outline'}
          onClick={() => setFilterLevel('info')}
          className="h-7 text-[11px] px-2 gap-1 text-blue-600"
        >
          <Info className="w-3 h-3" />
          اطلاعات
          <span className="text-[9px] opacity-70">({stats.levelStats.info || 0})</span>
        </Button>
        <Button
          size="sm"
          variant={filterLevel === 'debug' ? 'default' : 'outline'}
          onClick={() => setFilterLevel('debug')}
          className="h-7 text-[11px] px-2 gap-1"
        >
          <FileText className="w-3 h-3" />
          دیباگ
          <span className="text-[9px] opacity-70">({stats.levelStats.debug || 0})</span>
        </Button>
      </div>
    </div>

    {/* فیلتر منبع */}
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Filter className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-xs font-medium text-gray-700">منبع:</span>
        {filterSource !== 'all' && (
          <Badge className="text-[9px] bg-blue-100 text-blue-700">
            فیلتر فعال
          </Badge>
        )}
      </div>
      <div className="flex gap-1 flex-wrap">
        <Button
          size="sm"
          variant={filterSource === 'all' ? 'default' : 'outline'}
          onClick={() => setFilterSource('all')}
          className="h-7 text-[11px] px-2 gap-1"
        >
          همه
          <span className="text-[9px] opacity-70">({stats.sourceStats.all})</span>
        </Button>
        <Button
          size="sm"
          variant={filterSource === 'frontend' ? 'default' : 'outline'}
          onClick={() => setFilterSource('frontend')}
          className="h-7 text-[11px] px-2 gap-1 text-blue-600"
        >
          <FileText className="w-3 h-3" />
          Frontend
          <span className="text-[9px] opacity-70">({stats.sourceStats.frontend || 0})</span>
        </Button>
        <Button
          size="sm"
          variant={filterSource === 'api' ? 'default' : 'outline'}
          onClick={() => setFilterSource('api')}
          className="h-7 text-[11px] px-2 gap-1 text-green-600"
        >
          <Server className="w-3 h-3" />
          API
          <span className="text-[9px] opacity-70">({stats.sourceStats.api || 0})</span>
        </Button>
        <Button
          size="sm"
          variant={filterSource === 'backend' ? 'default' : 'outline'}
          onClick={() => setFilterSource('backend')}
          className="h-7 text-[11px] px-2 gap-1 text-purple-600"
        >
          <Server className="w-3 h-3" />
          Backend
          <span className="text-[9px] opacity-70">({stats.sourceStats.backend || 0})</span>
        </Button>
        <Button
          size="sm"
          variant={filterSource === 'user' ? 'default' : 'outline'}
          onClick={() => setFilterSource('user')}
          className="h-7 text-[11px] px-2 gap-1 text-orange-600"
        >
          <User className="w-3 h-3" />
          کاربر
          <span className="text-[9px] opacity-70">({stats.sourceStats.user || 0})</span>
        </Button>
      </div>
    </div>
  </div>
</div>

        {/* ═══ لیست لاگ‌ها (اسکرول‌دار) ═══ */}
        <div 
          className="flex-1 overflow-y-auto px-6 py-4"
          style={{ 
            maxHeight: 'calc(85vh - 220px)',
            minHeight: '200px',
          }}
        >
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {hasActiveFilters ? 'لاگی با این فیلترها یافت نشد' : 'لاگی یافت نشد'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {hasActiveFilters 
                  ? 'فیلترها را تغییر دهید یا ریست کنید' 
                  : 'لاگ‌ها به مدت ۲۴ ساعت نگهداری می‌شوند'}
              </p>
              {hasActiveFilters && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={resetFilters}
                  className="mt-3 gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  ریست فیلترها
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map(log => {
                const levelConfig = getLevelConfig(log.level)
                const LevelIcon = levelConfig.icon
                const SourceIcon = getSourceIcon(log.source)

                return (
                  <div 
                    key={log.id} 
                    className={`border rounded-lg p-3 ${levelConfig.bg}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <LevelIcon className={`w-4 h-4 ${levelConfig.color}`} />
                        <Badge className={levelConfig.badge} variant="outline">
                          {log.level.toUpperCase()}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <SourceIcon className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs text-gray-500">{log.source}</span>
                        </div>
                        <span className="text-xs text-gray-500" dir="ltr">
                          {new Date(log.timestamp).toLocaleString('fa-IR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm font-mono text-gray-900 mb-2 leading-relaxed break-words">
                      {log.message}
                    </p>

                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <details className="text-xs mt-2">
                        <summary className="cursor-pointer text-gray-600 hover:text-gray-900 font-medium flex items-center gap-1">
                          <ChevronDown className="w-3 h-3" />
                          📋 Metadata
                        </summary>
                        <pre className="mt-2 p-2 bg-white/50 rounded text-xs overflow-x-auto border whitespace-pre-wrap break-words">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}

                    {log.stackTrace && (
                      <details className="text-xs mt-2">
                        <summary className="cursor-pointer text-red-600 hover:text-red-900 font-medium flex items-center gap-1">
                          <ChevronDown className="w-3 h-3" />
                          🐛 Stack Trace
                        </summary>
                        <pre className="mt-2 p-2 bg-white/50 rounded text-xs overflow-x-auto border text-red-700 whitespace-pre-wrap break-words">
                          {log.stackTrace}
                        </pre>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}