'use client'

// ============================================================================
// src/components/setup-wizard.tsx — v10.9 ★★★
// ★ v10.9: جلوگیری از Double Submit + پاک‌سازی cache
// ★ v3.1: پشتیبانی از حالت basic_renewal_setup برای پلن پایه
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { getFeaturesByPlanName, type PlanName } from '@/lib/plan-features'
import { useDemoStatus } from '@/lib/use-demo-status'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { PersianDatePicker } from '@/components/ui/persian-date-picker'
import {
  Loader2, CheckCircle2, AlertCircle, AlertTriangle,
  ChevronRight, ChevronLeft, Calendar, Package,
  Wallet, Zap, Trash2, Plus, Info, Building2,
  TrendingUp, TrendingDown, ArrowLeft, SkipForward,
  RefreshCw, Archive,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
//  تبدیل تاریخ شمسی ↔ میلادی
// ─────────────────────────────────────────────────────────────────────────────
function _div(a: number, b: number) { return ~~(a / b) }
function _rem(a: number, b: number) { return a - ~~(a / b) * b }
function _jalCal(jy: number) {
  const breaks = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178]
  let leapJ = -14, jp = breaks[0], jm = 0, jump = 0
  for (let i = 1; i < breaks.length; i++) {
    jm = breaks[i]; jump = jm - jp
    if (jy < jm) break
    leapJ += _div(jump,33)*8 + _div(_rem(jump,33),4)
    jp = jm
  }
  let n = jy - jp
  leapJ += _div(n,33)*8 + _div(_rem(n,33)+3,4)
  if (_rem(jump,33)===4 && jump-n===4) leapJ++
  const leapG = _div(jy+621,4) - _div((_div(jy+621,100)+1)*3,4) - 150
  const march = 20 + leapJ - leapG
  if (jump-n<6) n = n-jump+_div(jump+4,33)*33
  let leap = _rem(_rem(n+1,33)-1,4)
  if (leap===-1) leap=4
  return { leap, gy: jy+621, march }
}
function _g2d(gy:number,gm:number,gd:number){
  let d=_div((gy+_div(gm-8,6)+100100)*1461,4)+_div(153*_rem(gm+9,12)+2,5)+gd-34840408
  d=d-_div(_div(gy+100100+_div(gm-8,6),100)*3,4)+752
  return d
}
function _d2g(jdn:number){
  let j=4*jdn+139361631+_div(_div(4*jdn+183187720,146097)*3,4)*4-3908
  const i=_div(_rem(j,1461),4)*5+308
  return{gd:_div(_rem(i,153),5)+1,gm:_rem(_div(i,153),12)+1,gy:_div(j,1461)-100100+_div(8-(_rem(_div(i,153),12)+1),6)}
}
function _j2d(jy:number,jm:number,jd:number){
  const r=_jalCal(jy)
  return _g2d(r.gy,3,r.march)+(jm-1)*31-_div(jm,7)*(jm-7)+jd-1
}
function _d2j(jdn:number){
  const gy=_d2g(jdn).gy; let jy=gy-621
  const r=_jalCal(jy); const jdn1f=_g2d(gy,3,r.march)
  let k=jdn-jdn1f
  if(k>=0){ if(k<=185){return{jy,jm:1+_div(k,31),jd:_rem(k,31)+1}} else{k-=186} }
  else { jy--; k+=179; if(r.leap===1)k++ }
  return{jy,jm:7+_div(k,30),jd:_rem(k,30)+1}
}
function isoToJalali(iso:string):[number,number,number]|null{
  const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if(!m)return null
  const r=_d2j(_g2d(+m[1],+m[2],+m[3]))
  return [r.jy,r.jm,r.jd]
}
function isoToJalaliFa(iso:string|null|undefined):string{
  if(!iso)return '—'
  const j=isoToJalali(iso.slice(0,10))
  if(!j)return '—'
  const fa=['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹']
  const tf=(n:number,l=2)=>String(n).padStart(l,'0').replace(/\d/g,d=>fa[+d])
  return `${tf(j[0],4)}/${tf(j[1])}/${tf(j[2])}`
}
function todayISO():string{ return new Date().toISOString().slice(0,10) }
function addDays(iso:string,days:number):string{
  const d=new Date(iso); d.setDate(d.getDate()+days)
  return d.toISOString().slice(0,10)
}
function daysBetween(from:string,to:string):number{
  return Math.round((new Date(to).getTime()-new Date(from).getTime())/(1000*60*60*24))
}
function formatNum(n:number):string{ return (n||0).toLocaleString('fa-IR') }
function getJalaliYearName(iso:string):string{
  const j=isoToJalali(iso)
  if(!j)return 'سال مالی'
  const fa=['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹']
  const toFa=(n:number)=>String(n).replace(/\d/g,d=>fa[+d])
  return `سال مالی ${toFa(j[0])}`
}

// ─────────────────────────────────────────────────────────────────────────────
//  کلید localStorage برای یک‌بار نمایش
// ─────────────────────────────────────────────────────────────────────────────
const WIZARD_DONE_KEY = 'setup_wizard_done'

function getWizardDoneKey(tenantId: string) {
  return `${WIZARD_DONE_KEY}_${tenantId}`
}

function isWizardDone(tenantId: string): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(getWizardDoneKey(tenantId)) === 'true'
}

function markWizardDone(tenantId: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(getWizardDoneKey(tenantId), 'true')
}

function getToken(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return t ? { Authorization: `Bearer ${t}` } : {}
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('token')
  if (!token) {
    console.warn('[SetupWizard] No token found in localStorage!')
  }
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  نوع‌های موجودی اولیه
// ─────────────────────────────────────────────────────────────────────────────
type BalanceType = 'cash'|'bank'|'inventory'|'fixed_asset'|'liability'

interface BalanceItem {
  type: BalanceType
  title: string
  amount: number
  description?: string
}

const BAL_LABELS: Record<BalanceType,string> = {
  cash:'💵 نقدی (صندوق)', bank:'🏦 بانک',
  inventory:'📦 موجودی کالا', fixed_asset:'🏭 دارایی ثابت',
  liability:'📋 بدهی / وام',
}
const BAL_COLORS: Record<BalanceType,string> = {
  cash:'bg-emerald-50 border-emerald-200 text-emerald-800',
  bank:'bg-blue-50 border-blue-200 text-blue-800',
  inventory:'bg-amber-50 border-amber-200 text-amber-800',
  fixed_asset:'bg-purple-50 border-purple-200 text-purple-800',
  liability:'bg-red-50 border-red-200 text-red-800',
}

// ─────────────────────────────────────────────────────────────────────────────
//  Hook اصلی — useSetupWizard
// ─────────────────────────────────────────────────────────────────────────────
export function useSetupWizard() {
  const currentTenant = useAppStore((s) => s.currentTenant)
  const tenantId = useAppStore((s) => s.tenantId) || (currentTenant as any)?.id || ''
  const { isDemo } = useDemoStatus()
  const planName = useAppStore((s) => s.planName)
  const billingCycle = useAppStore((s) => s.selectedBillingCycle)

  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(false)
  const [wizardMode, setWizardMode] = useState<'first_setup' | 'renewal_setup' | 'basic_renewal_setup' | null>(null)
  const [renewalData, setRenewalData] = useState<any>(null)

  useEffect(() => {
    const handler = () => {
      console.log('[useSetupWizard] 🔄 Renewal wizard triggered from fiscal-year-tab')
      if (typeof window !== 'undefined' && tenantId) {
        localStorage.setItem(`force_renewal_setup_${tenantId}`, 'true')
      }
      setChecked(false)
    }
    window.addEventListener('trigger-renewal-setup', handler)
    return () => window.removeEventListener('trigger-renewal-setup', handler)
  }, [tenantId])

  useEffect(() => {
    if (!tenantId || checked) return

    const checkWizardStatus = async () => {
      console.log('[useSetupWizard] 🔄 Checking wizard status for tenant:', tenantId)

      const forceWizardKey = `force_wizard_${tenantId}`
      const forceWizard = typeof window !== 'undefined' && localStorage.getItem(forceWizardKey) === 'true'
      if (forceWizard) {
        console.log('[useSetupWizard] 🆕 Force wizard after registration — clearing flag')
        if (typeof window !== 'undefined') {
          localStorage.removeItem(forceWizardKey)
          const wizardDoneKey = `wizard_done_${tenantId}`
          localStorage.removeItem(wizardDoneKey)
        }
      }
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        if (!token) {
          setChecked(true)
          return
        }

        try {
          const subRes = await fetch('/api/subscription/update-status?_t=' + Date.now(), {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          })

          if (subRes.status === 403) {
            try {
              const errData = await subRes.json()
              if (errData.code === 'SUBSCRIPTION_EXPIRED') {
                console.log('[useSetupWizard] 🔒 SUBSCRIPTION_EXPIRED from middleware — skipping wizard')
                setChecked(true)
                return
              }
            } catch { }
          }

          const subData = await subRes.json()

          if (!subData.success && subData.code === 'SUBSCRIPTION_EXPIRED') {
            console.log('[useSetupWizard] 🔒 SUBSCRIPTION_EXPIRED in response — skipping wizard')
            setChecked(true)
            return
          }

          if (subData.success && subData.data) {
            const d = subData.data
            const isLifetime = d.daysUntilUpdate === -1 || (d.status === 'active' && d.daysUntilUpdate === -1)
            const daysRemaining = d.daysUntilUpdate ?? 0
            const isLocked = d.isLocked || daysRemaining <= 0

            if (isLocked) {
              console.log('[useSetupWizard] 🔒 System locked — skipping wizard')
              setChecked(true)
              return
            }

            if (!isLifetime && daysRemaining > 0 && daysRemaining <= 3) {
              console.log(`[useSetupWizard] ⚠️ Warning period (${daysRemaining} days) — skipping wizard`)
              setChecked(true)
              return
            }
          }
        } catch (err) {
          console.warn('[useSetupWizard] Subscription check failed:', err)
        }

        const forceRenewalKey = `force_renewal_setup_${tenantId}`
        const forceRenewal = typeof window !== 'undefined' && localStorage.getItem(forceRenewalKey) === 'true'

        if (forceRenewal) {
          console.log('[useSetupWizard] 🔄 Force renewal_setup detected, clearing flag')
          if (typeof window !== 'undefined') {
            localStorage.removeItem(forceRenewalKey)
          }
        }

        if (forceWizard) {
          console.log('[useSetupWizard] 🆕 Force wizard — opening first_setup')
          setWizardMode('first_setup')
          setTimeout(() => setOpen(true), 600)
          setChecked(true)
          return
        }

        const res = await fetch('/api/setup-wizard/status?_t=' + Date.now(), {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })

        if (!res.ok) {
          console.warn('[useSetupWizard] Status API failed:', res.status)
          setChecked(true)
          return
        }

        const data = await res.json()
        if (!data.success) {
          setChecked(true)
          return
        }

        const status = data.data.status
        const subscription = data.data.subscription

        if (forceRenewal) {
          console.log('[useSetupWizard] 🔄 Opening forced wizard:', status)
          if (status === 'basic_renewal_setup') {
            setWizardMode('basic_renewal_setup')
          } else if (status === 'renewal_setup') {
            setWizardMode('renewal_setup')
          } else {
            setWizardMode('renewal_setup')
          }
          setRenewalData(data.data.wizardData)
          setTimeout(() => setOpen(true), 600)
          setChecked(true)
          return
        }

        if (status === 'ready') {
          console.log('[useSetupWizard] ✅ Ready — no wizard needed')
          setChecked(true)
          return
        }

        if (status === 'first_setup') {
          if (isWizardDone(tenantId)) {
            setChecked(true)
            return
          }
          console.log('[useSetupWizard] 🆕 Opening first_setup wizard')
          setWizardMode('first_setup')
          setTimeout(() => setOpen(true), 600)
          return
        }

        if (status === 'locked_after_close') {
          console.log('[useSetupWizard] 🔒 Locked after close — redirect to /renewal')
          if (typeof window !== 'undefined') {
            window.location.replace('/renewal?reason=locked_after_close')
          }
          setChecked(true)
          return
        }

        if (status === 'basic_renewal_setup') {
          const basicRenewalKey = `basic_renewal_wizard_done_${tenantId}_${data.data.wizardData?.lastBasicClose?.id}`
          if (typeof window !== 'undefined' && localStorage.getItem(basicRenewalKey) === 'true') {
            console.log('[useSetupWizard] ✅ Basic renewal wizard already done')
            setChecked(true)
            return
          }
          console.log('[useSetupWizard] 📦 Opening basic_renewal_setup wizard')
          setWizardMode('basic_renewal_setup')
          setRenewalData(data.data.wizardData)
          setTimeout(() => setOpen(true), 600)
          return
        }

        if (status === 'renewal_setup') {
          const renewalKey = `renewal_wizard_done_${tenantId}_${data.data.wizardData?.lastClosedYear?.id}`
          if (typeof window !== 'undefined' && localStorage.getItem(renewalKey) === 'true') {
            console.log('[useSetupWizard] ✅ Renewal wizard already done')
            setChecked(true)
            return
          }
          const isExpired = subscription?.isExpired || subscription?.status === 'read_only'
          if (isExpired && !subscription?.isLifetime) {
            console.log('[useSetupWizard] 💳 Plan expired — redirect to /renewal')
            if (typeof window !== 'undefined') {
              window.location.replace('/renewal?reason=expired')
            }
            setChecked(true)
            return
          }
          console.log('[useSetupWizard] 🔄 Opening renewal_setup wizard')
          setWizardMode('renewal_setup')
          setRenewalData(data.data.wizardData)
          setTimeout(() => setOpen(true), 600)
          return
        }

        if (status === 'no_subscription') {
          console.log('[useSetupWizard] ⚠️ No subscription — redirect to /upgrade')
          if (typeof window !== 'undefined') {
            window.location.replace('/upgrade')
          }
          setChecked(true)
          return
        }
      } catch (err) {
        console.error('[useSetupWizard] Status check error:', err)
        setChecked(true)
      }
    }

    checkWizardStatus()
  }, [tenantId, checked, isDemo, planName, billingCycle])

  const handleComplete = useCallback(() => {
    if (tenantId) {
      if (wizardMode === 'renewal_setup' && renewalData?.lastClosedYear?.id) {
        const renewalKey = `renewal_wizard_done_${tenantId}_${renewalData.lastClosedYear.id}`
        if (typeof window !== 'undefined') {
          localStorage.setItem(renewalKey, 'true')
        }
      } else if (wizardMode === 'basic_renewal_setup' && renewalData?.lastBasicClose?.id) {
        const basicRenewalKey = `basic_renewal_wizard_done_${tenantId}_${renewalData.lastBasicClose.id}`
        if (typeof window !== 'undefined') {
          localStorage.setItem(basicRenewalKey, 'true')
        }
      } else {
        markWizardDone(tenantId)
      }

      // ═══════════════════════════════════════════════════════════════
      // ★ v10.9: پاک‌سازی کامل cache برای جلوگیری از نمایش داده‌های قدیمی
      // ═══════════════════════════════════════════════════════════════
      if (typeof window !== 'undefined') {
        console.log('[SetupWizard] 🧹 Clearing cache after wizard completion...')

        const cacheKeys = [
          'dashboard_stats',
          'journal_entries',
          'accounts_list',
          'initial_balance',
          'products_list',
          'customers_list',
        ]

        cacheKeys.forEach(key => {
          try { localStorage.removeItem(key) } catch {}
        })

        try { sessionStorage.clear() } catch {}

        console.log('[SetupWizard] ✅ Cache cleared')
      }
    }
    setOpen(false)
    setWizardMode(null)
    setRenewalData(null)

    // ★ v10.9: Force reload dashboard بعد از ۵۰۰ میلی‌ثانیه
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        console.log('[SetupWizard] 🔄 Reloading page to fetch fresh data...')
        window.location.reload()
      }
    }, 500)
  }, [tenantId, wizardMode, renewalData])

  return { open, setOpen, handleComplete, wizardMode, renewalData }
}

// ─────────────────────────────────────────────────────────────────────────────
//  کامپوننت اصلی SetupWizard
// ─────────────────────────────────────────────────────────────────────────────
export interface SetupWizardProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onComplete?: () => void
  wizardMode?: 'first_setup' | 'renewal_setup' | 'basic_renewal_setup' | null
  renewalData?: any
}

export function SetupWizard(props: SetupWizardProps) {
  const { open, onOpenChange, onComplete } = props
  const planName = useAppStore((s) => s.planName)
  const { toast } = useToast()

  const features = useMemo(
    () => getFeaturesByPlanName((planName || 'simple') as PlanName),
    [planName]
  )
  const maxWarehouses = useMemo(() => {
    if (features.tier === 'enterprise') return Infinity
    if (features.tier === 'professional') return 2
    return 1
  }, [features])

  const isRenewalMode = props.wizardMode === 'renewal_setup' && !!props.renewalData
  const renewalData = props.renewalData || null

  const isBasicRenewalMode = props.wizardMode === 'basic_renewal_setup' && !!props.renewalData
  const basicRenewalData = props.renewalData || null

  // ═══ State های حالت تمدید ═══
  const [renewalSaving, setRenewalSaving] = useState(false)
  const [renewalFYName, setRenewalFYName] = useState('')
  const [renewalFYStart, setRenewalFYStart] = useState('')
  const [renewalFYEnd, setRenewalFYEnd] = useState('')
  const [renewalWarehouses, setRenewalWarehouses] = useState<any[]>([])
  const [renewalNewWhName, setRenewalNewWhName] = useState('')
  const [renewalNewWhCode, setRenewalNewWhCode] = useState('')
  const [renewalError, setRenewalError] = useState('')
  const [renewalSuccess, setRenewalSuccess] = useState(false)

  // ═══ State های حالت بار اول ═══
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  // ★ v10.9: flag جداگانه برای جلوگیری از Double Submit در saveBalance
  const [savingBalance, setSavingBalance] = useState(false)

  const [fyName, setFyName] = useState('')
  const [fyStart, setFyStart] = useState(todayISO())
  const [fyEnd, setFyEnd] = useState(addDays(todayISO(), 364))
  const [fyDone, setFyDone] = useState(false)
  const [fyExisting, setFyExisting] = useState<any[]>([])
  const [fyError, setFyError] = useState('')

  const [warehouses, setWarehouses] = useState<any[]>([])
  const [whName, setWhName] = useState('')
  const [whCode, setWhCode] = useState('')
  const [whDone, setWhDone] = useState(false)
  const [whError, setWhError] = useState('')
  const [whLoading, setWhLoading] = useState(false)

  const [balItems, setBalItems] = useState<BalanceItem[]>([])
  const [balType, setBalType] = useState<BalanceType>('cash')
  const [balTitle, setBalTitle] = useState('')
  const [balAmount, setBalAmount] = useState('')
  const [balDesc, setBalDesc] = useState('')
  const [balError, setBalError] = useState('')
  const [balIsPosted, setBalIsPosted] = useState(false)

  // ═══ مقداردهی اولیه برای حالت تمدید ═══
  useEffect(() => {
    if (isRenewalMode && renewalData) {
      setRenewalFYName(renewalData.suggestedNewYear?.name || '')
      setRenewalFYStart(renewalData.suggestedNewYear?.startDate || '')
      setRenewalFYEnd(renewalData.suggestedNewYear?.endDate || '')
      setRenewalWarehouses(renewalData.existingWarehouses || [])
      setRenewalNewWhName('')
      setRenewalNewWhCode('')
      setRenewalError('')
      setRenewalSuccess(false)
    }
  }, [isRenewalMode, renewalData])

  useEffect(() => {
    if (isBasicRenewalMode && basicRenewalData) {
      setRenewalWarehouses(basicRenewalData.existingWarehouses || [])
      setRenewalNewWhName('')
      setRenewalNewWhCode('')
      setRenewalError('')
      setRenewalSuccess(false)
    }
  }, [isBasicRenewalMode, basicRenewalData])

  useEffect(() => {
    if (!open || isRenewalMode || isBasicRenewalMode) return
    setStep(0)
    setSaving(false)
    setSavingBalance(false)
    setFyError('')
    setWhError('')
    setBalError('')
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isRenewalMode, isBasicRenewalMode])

  const loadAll = async () => {
    try {
      const r = await fetch('/api/fiscal-years', { headers: getToken() })
      const d = await r.json()
      const ys = d?.data?.years || d?.data || []
      setFyExisting(Array.isArray(ys) ? ys : [])
      if (ys.some((y: any) => y.isActive)) setFyDone(true)
    } catch {}

    setWhLoading(true)
    try {
      const r = await fetch('/api/warehouses', { headers: getToken() })
      const d = await r.json()
      const ws = d?.data || []
      setWarehouses(Array.isArray(ws) ? ws : [])
      if (ws.length > 0) setWhDone(true)
    } catch {}
    setWhLoading(false)

    try {
      const r = await fetch('/api/initial-balance', { headers: getToken() })
      const d = await r.json()
      if (d.success && d.data?.length > 0) {
        setBalItems(d.data.map((b: any) => ({
          type: b.type as BalanceType,
          title: b.title,
          amount: b.amount,
          description: b.description,
        })))
        setBalIsPosted(d.summary?.isPosted || false)
      }
    } catch {}
  }

  useEffect(() => {
    if (!isRenewalMode && !isBasicRenewalMode) {
      setFyName(getJalaliYearName(fyStart))
      setFyEnd(addDays(fyStart, 364))
    }
  }, [fyStart, isRenewalMode, isBasicRenewalMode])

  const saveFY = async (): Promise<boolean> => {
    setFyError('')
    if (!fyName.trim()) { setFyError('نام سال مالی الزامی است'); return false }

    try {
      const r = await fetch('/api/fiscal-years', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: fyName.trim(),
          startDate: fyStart,
          endDate: fyEnd,
          activate: true,
        }),
      })
      const d = await r.json()
      if (d.success) {
        setFyDone(true)
        const ys = d.data?.year ? [d.data.year] : []
        if (ys.length) setFyExisting(p => [...p, ...ys])
        return true
      }
      setFyError(d.error || 'خطا در ایجاد سال مالی')
      return false
    } catch {
      setFyError('خطا در ارتباط با سرور')
      return false
    }
  }

  const autoCreateFY = async (): Promise<boolean> => {
    try {
      const name = getJalaliYearName(todayISO())
      const r = await fetch('/api/fiscal-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getToken() },
        body: JSON.stringify({ name, startDate: todayISO(), endDate: addDays(todayISO(), 364), activate: true }),
      })
      const d = await r.json()
      return d.success
    } catch { return false }
  }

  const saveWH = async (name: string, code?: string): Promise<boolean> => {
    setWhError('')
    try {
      const r = await fetch('/api/warehouses', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: name.trim(),
          code: code?.trim() || undefined,
        }),
      })
      const d = await r.json()
      if (d.success) {
        setWhDone(true)
        setWarehouses(p => [...p, d.data])
        return true
      }
      setWhError(d.error || 'خطا در ایجاد انبار')
      return false
    } catch {
      setWhError('خطا در ارتباط با سرور')
      return false
    }
  }

  const deleteWH = async (id: string) => {
    try {
      const r = await fetch(`/api/warehouses?id=${id}`, { method: 'DELETE', headers: getToken() })
      const d = await r.json()
      if (d.success) {
        setWarehouses(p => p.filter(w => w.id !== id))
        if (warehouses.length <= 1) setWhDone(false)
      } else {
        toast({ title: 'خطا', description: d.error, variant: 'destructive' })
      }
    } catch {}
  }

  const addBalItem = () => {
    setBalError('')
    if (!balTitle.trim()) {
      setBalError('عنوان الزامی است')
      return
    }
    const amt = parseFloat(balAmount)
    if (isNaN(amt) || amt <= 0) {
      setBalError('مبلغ باید عدد مثبت باشد')
      return
    }
    setBalItems(prev => [
      ...prev,
      {
        type: balType,
        title: balTitle.trim(),
        amount: amt,
        description: balDesc.trim() || undefined,
      }
    ])
    setBalTitle('')
    setBalAmount('')
    setBalDesc('')
    setBalError('')
  }

  // ═══════════════════════════════════════════════════════════════
  // ★ v10.9: saveBalance با flag جلوگیری از Double Submit
  // ═══════════════════════════════════════════════════════════════
  const saveBalance = async (): Promise<boolean> => {
    // ★ جلوگیری از Double Submit
    if (savingBalance) {
      console.log('[SetupWizard] ⚠️ saveBalance already in progress, ignoring duplicate call')
      return false
    }

    if (balItems.length === 0) return true

    // ★ v10.9: Pre-check — آیا قبلاً موجودی ثبت شده؟
    try {
      const checkRes = await fetch('/api/initial-balance', {
        headers: getToken(),
        cache: 'no-store',
      })
      if (checkRes.ok) {
        const checkData = await checkRes.json()
        if (checkData.success && checkData.data && checkData.data.length > 0) {
          console.warn('[SetupWizard] ⚠️ Initial balance already exists, skipping POST')
          setBalIsPosted(checkData.summary?.isPosted || false)
          return true
        }
      }
    } catch (err) {
      console.warn('[SetupWizard] Pre-check failed, continuing:', err)
    }

    setBalError('')
    for (const item of balItems) {
      if (!item.title?.trim()) {
        setBalError('عنوان همه آیتم‌ها الزامی است')
        return false
      }
      if (typeof item.amount !== 'number' || item.amount <= 0) {
        setBalError(`مبلغ آیتم "${item.title}" نامعتبر است`)
        return false
      }
    }

    setSavingBalance(true)

     const requestBody = {
      items: balItems.map((b) => ({
        type: b.type,
        title: b.title.trim(),
        amount: Number(b.amount),
        description: b.description?.trim() || '',
      })),
      postToJournal: false,
      // ★ v10.9.10: همیشه تاریخ امروز را ارسال کن
      date: new Date().toISOString().split('T')[0],
    }

    try {
      const res = await fetch('/api/initial-balance', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(requestBody),
      })

      if (!res.ok && res.status !== 200) {
        const text = await res.text()
        const errMsg = `خطای سرور (${res.status})`
        setBalError(errMsg)
        toast({ title: 'خطا', description: errMsg, variant: 'destructive' })
        return false
      }

      const data = await res.json()

      // ★ v10.9: اگر skipped بود (idempotency)، موفق در نظر بگیر
      if (data.success || data.data?.skipped) {
        setBalIsPosted(false)
        toast({
          title: '✅ پیش‌نویس سند افتتاحیه ذخیره شد',
          description: 'برای بررسی، ویرایش یا ثبت نهایی، به تنظیمات ← راه‌اندازی مراجعه کنید.',
        })
        return true
      }

      const errMsg = data.error || 'خطا در ثبت سند افتتاحیه'
      setBalError(errMsg)
      toast({ title: 'خطا', description: errMsg, variant: 'destructive' })
      return false
    } catch (err: any) {
      const errMsg = 'خطا در ارتباط با سرور'
      setBalError(errMsg)
      toast({ title: 'خطا', description: errMsg, variant: 'destructive' })
      return false
    } finally {
      setSavingBalance(false)
    }
  }

  const totalAssets = balItems.filter(b => ['cash', 'bank', 'inventory', 'fixed_asset'].includes(b.type)).reduce((s, b) => s + b.amount, 0)
  const totalLiab = balItems.filter(b => b.type === 'liability').reduce((s, b) => s + b.amount, 0)
  const totalEquity = totalAssets - totalLiab

  const handleNext = async () => {
    // ★ v10.9: جلوگیری از Double Submit در navigation
    if (saving || savingBalance) {
      console.log('[SetupWizard] ⚠️ Already saving, ignoring duplicate click')
      return
    }

    setSaving(true)
    setFyError('')
    setWhError('')
    setBalError('')
    try {
      if (step === 0) {
        if (fyDone) { setStep(1); return }
        const ok = await saveFY()
        if (ok) setStep(1)
        return
      }
      if (step === 1) {
        if (whDone || warehouses.length > 0) {
          if (whName.trim()) {
            await saveWH(whName, whCode)
            setWhName('')
            setWhCode('')
          }
          setStep(2)
          return
        }
        if (whName.trim()) {
          const ok = await saveWH(whName, whCode)
          if (ok) { setWhName(''); setWhCode(''); setStep(2) }
        } else {
          setWhError('حداقل یک انبار ایجاد کنید یا روی «رد کردن» کلیک کنید')
        }
        return
      }
      if (step === 2) {
        if (balTitle.trim() && balAmount) {
          setBalError('آیتم در حال ورود را ابتدا با دکمه «افزودن» اضافه کنید')
          return
        }
        if (balItems.length === 0) { setStep(3); return }
        const ok = await saveBalance()
        if (ok) setStep(3)
        return
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (step === 0 && !fyDone) {
        toast({ title: 'سال مالی پیش‌فرض ایجاد شد', description: 'یک سال از امروز' })
        await autoCreateFY()
        setFyDone(true)
        setStep(1)
        return
      }
      if (step === 1 && warehouses.length === 0) {
        toast({ title: 'انبار پیش‌فرض ایجاد شد', description: 'انبار فروشگاه' })
        await saveWH('انبار فروشگاه', 'WH-01')
        setStep(2)
        return
      }
      if (step === 2) { setStep(3); return }
    } finally {
      setSaving(false)
    }
  }

  const handleFinish = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (!fyDone) await autoCreateFY()
      if (warehouses.length === 0) await saveWH('انبار فروشگاه', 'WH-01')
      toast({ title: '🎉 راه‌اندازی کامل شد!', description: 'فروشگاه شما آماده‌ی استفاده است' })
      onOpenChange(false)
      onComplete?.()
    } finally {
      setSaving(false)
    }
  }

  const handleAddRenewalWarehouse = async () => {
    if (!renewalNewWhName.trim()) {
      setRenewalError('نام انبار الزامی است')
      return
    }
    if (renewalWarehouses.length >= maxWarehouses && maxWarehouses !== Infinity) {
      setRenewalError(`حداکثر ${maxWarehouses} انبار مجاز است`)
      return
    }
    setRenewalError('')
    try {
      const res = await fetch('/api/warehouses', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: renewalNewWhName.trim(),
          code: renewalNewWhCode.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setRenewalWarehouses(prev => [...prev, {
          id: data.data.id,
          name: data.data.name,
          code: data.data.code,
          isDefault: false,
        }])
        setRenewalNewWhName('')
        setRenewalNewWhCode('')
        toast({ title: '✅ انبار جدید اضافه شد' })
      } else {
        setRenewalError(data.error || 'خطا در ایجاد انبار')
      }
    } catch {
      setRenewalError('خطا در ارتباط با سرور')
    }
  }

  const handleDeleteRenewalWarehouse = async (id: string) => {
    try {
      const res = await fetch(`/api/warehouses?id=${id}`, {
        method: 'DELETE',
        headers: getToken(),
      })
      const data = await res.json()
      if (data.success) {
        setRenewalWarehouses(prev => prev.filter(w => w.id !== id))
      } else {
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch {}
  }

  const handleRenewalFinish = async () => {
    if (renewalSaving) return
    setRenewalSaving(true)
    setRenewalError('')
    try {
      const res = await fetch('/api/setup-wizard/auto-opening', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          newYearName: renewalFYName,
          startDate: renewalFYStart,
          endDate: renewalFYEnd,
          warehouseUpdates: renewalWarehouses,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setRenewalSuccess(true)
        toast({
          title: '🎉 سال مالی جدید ایجاد شد!',
          description: `سال «${data.data.newYear.name}» فعال و سند افتتاحیه صادر شد`,
        })
        setTimeout(() => {
          onOpenChange(false)
          onComplete?.()
        }, 2000)
      } else {
        setRenewalError(data.error || 'خطا در ایجاد سال جدید')
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      setRenewalError('خطا در ارتباط با سرور')
      toast({ title: 'خطا', description: err?.message || 'خطای شبکه', variant: 'destructive' })
    } finally {
      setRenewalSaving(false)
    }
  }

  const handleBasicRenewalFinish = async () => {
    if (renewalSaving) return
    setRenewalSaving(true)
    setRenewalError('')
    try {
      const res = await fetch('/api/setup-wizard/auto-opening', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          isBasicPlan: true,
          warehouseUpdates: renewalWarehouses,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setRenewalSuccess(true)
        toast({
          title: '🎉 دوره جدید آماده است!',
          description: 'انبارها به‌روزرسانی شدند و سند افتتاحیه صادر شد',
        })
        setTimeout(() => {
          onOpenChange(false)
          onComplete?.()
        }, 2000)
      } else {
        setRenewalError(data.error || 'خطا در شروع دوره جدید')
        toast({ title: 'خطا', description: data.error, variant: 'destructive' })
      }
    } catch (err: any) {
      setRenewalError('خطا در ارتباط با سرور')
      toast({ title: 'خطا', description: err?.message || 'خطای شبکه', variant: 'destructive' })
    } finally {
      setRenewalSaving(false)
    }
  }

  const STEPS = [
    { label: 'سال مالی', icon: <Calendar className="w-4 h-4" />, done: fyDone },
    { label: 'انبار', icon: <Building2 className="w-4 h-4" />, done: whDone || warehouses.length > 0 },
    { label: 'سند افتتاحیه', icon: <Wallet className="w-4 h-4" />, done: balIsPosted || balItems.length > 0 },
  ]
  const pct = step >= 3 ? 100 : Math.round((step / 3) * 100)

  return (
    <Dialog open={open} onOpenChange={v => {
      if (!v) {
        if (isRenewalMode && !renewalSuccess) return
        if (isBasicRenewalMode && !renewalSuccess) return
        handleFinish()
      } else {
        onOpenChange(true)
      }
    }}>
      <DialogContent
        className="max-w-xl w-[95vw] max-h-[92vh] overflow-y-auto"
        dir="rtl"
        onInteractOutside={e => (isRenewalMode || isBasicRenewalMode) && e.preventDefault()}
        onEscapeKeyDown={e => (isRenewalMode || isBasicRenewalMode) && e.preventDefault()}
      >
        {isBasicRenewalMode ? (
          <>
            <DialogHeader className="pb-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-amber-600" />
                </div>
                شروع دوره جدید
                <Badge className="bg-amber-100 text-amber-700 text-[10px] mr-auto">
                  پلن پایه
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-[11px] text-gray-500 mt-0.5">
                حساب بسته شد. انبارها و سند افتتاحیه را بررسی و تأیید کنید.
              </DialogDescription>
            </DialogHeader>

            {renewalSuccess ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">🎉 دوره جدید آماده است!</h3>
                <p className="text-xs text-gray-500">
                  سند افتتاحیه صادر شد. می‌توانید کار کنید.
                </p>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <Card className="border-blue-200 bg-blue-50/30">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Archive className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-blue-800">
                        سند اختتامیه صادر شد
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-600" dir="ltr">
                      {basicRenewalData.lastBasicClose?.number || '—'}
                    </div>
                    <div className="text-[10px] text-gray-600">
                      {isoToJalaliFa(basicRenewalData.lastBasicClose?.date)}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-purple-200 bg-purple-50/30">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-purple-600" />
                        <span className="text-xs font-bold text-purple-800">انبارها</span>
                      </div>
                      <Badge className="bg-purple-100 text-purple-700 text-[9px]">
                        {renewalWarehouses.length} / {maxWarehouses === Infinity ? '∞' : maxWarehouses}
                      </Badge>
                    </div>

                    <Alert className="border-blue-200 bg-blue-50 py-1.5">
                      <Info className="h-3.5 w-3.5 text-blue-600" />
                      <AlertDescription className="text-[10px] text-blue-800 mr-2">
                        پلن پایه: ۱ انبار مجاز.
                      </AlertDescription>
                    </Alert>

                    {renewalWarehouses.map((wh: any, idx: number) => (
                      <div key={wh.id} className="flex items-center gap-2 p-2 bg-white border border-purple-100 rounded-lg">
                        <Package className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                        <Input
                          value={wh.name}
                          onChange={e => {
                            const updated = [...renewalWarehouses]
                            updated[idx] = { ...updated[idx], name: e.target.value, code: e.target.value }
                            setRenewalWarehouses(updated)
                          }}
                          className="h-7 text-xs flex-1"
                        />
                        {wh.isDefault && (
                          <Badge className="bg-emerald-100 text-emerald-700 text-[8px]">پیش‌فرض</Badge>
                        )}
                        {!wh.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                            onClick={() => handleDeleteRenewalWarehouse(wh.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    ))}

                    {(maxWarehouses === Infinity || renewalWarehouses.length < maxWarehouses) && (
                      <div className="bg-white border border-dashed border-purple-300 rounded-lg p-2 space-y-1.5">
                        <Label className="text-[10px] text-purple-700 font-bold">+ افزودن انبار جدید</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={renewalNewWhName}
                            onChange={e => setRenewalNewWhName(e.target.value)}
                            placeholder="نام انبار"
                            className="h-7 text-xs"
                          />
                          <Input
                            value={renewalNewWhCode}
                            onChange={e => setRenewalNewWhCode(e.target.value)}
                            placeholder="کد (اختیاری)"
                            className="h-7 text-xs"
                            dir="ltr"
                          />
                        </div>
                        {renewalNewWhName.trim() && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-xs border-purple-300 text-purple-700 hover:bg-purple-50"
                            onClick={handleAddRenewalWarehouse}
                            disabled={renewalSaving}
                          >
                            <Plus className="w-3 h-3 ml-1" />
                            اضافه کردن
                          </Button>
                        )}
                      </div>
                    )}

                    {renewalWarehouses.length >= maxWarehouses && maxWarehouses !== Infinity && (
                      <Alert className="border-amber-200 bg-amber-50 py-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        <AlertDescription className="text-[10px] text-amber-700 mr-2">
                          به سقف {maxWarehouses} انبار مجاز رسیدید.
                        </AlertDescription>
                      </Alert>
                    )}

                    <p className="text-[9px] text-gray-500 mt-1">
                      💡 موجودی انبارها از دوره قبل منتقل می‌شود.
                    </p>
                  </CardContent>
                </Card>

                {renewalError && (
                  <Alert className="border-red-200 bg-red-50 py-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                    <AlertDescription className="text-xs text-red-700 mr-2">{renewalError}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <DialogFooter className="flex items-center gap-2 pt-3 border-t border-gray-100">
              {!renewalSuccess && (
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 min-w-[140px]"
                  onClick={handleBasicRenewalFinish}
                  disabled={renewalSaving || renewalWarehouses.length === 0}
                >
                  {renewalSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  {renewalSaving ? 'در حال ایجاد...' : 'تأیید و شروع دوره جدید'}
                </Button>
              )}
            </DialogFooter>
          </>
        ) : isRenewalMode ? (
          <>
            <DialogHeader className="pb-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-emerald-600" />
                </div>
                شروع سال مالی جدید
                <Badge className="bg-emerald-100 text-emerald-700 text-[10px] mr-auto">
                  تمدید هوشمند
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-[11px] text-gray-500 mt-0.5">
                سال مالی قبل بسته شده. سال جدید را بررسی و تأیید کنید.
              </DialogDescription>
            </DialogHeader>

            {renewalSuccess ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">🎉 سال مالی جدید آماده است!</h3>
                <p className="text-xs text-gray-500">
                  سند افتتاحیه از سال قبل منتقل شد. می‌توانید کار کنید.
                </p>
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <Card className="border-blue-200 bg-blue-50/30">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Archive className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-blue-800">
                        سال مالی قبل: {renewalData.lastClosedYear.name}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-600" dir="ltr">
                      {isoToJalaliFa(renewalData.lastClosedYear.startDate)} — {isoToJalaliFa(renewalData.lastClosedYear.endDate)}
                    </div>
                    {renewalData.closingEntry && (
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-blue-100">
                        <div className="text-center">
                          <div className="text-[9px] text-gray-500">سند اختتامیه</div>
                          <div className="text-[10px] font-mono font-bold text-blue-700">
                            {renewalData.closingEntry.number}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-[9px] text-gray-500">
                            {renewalData.closingEntry.netProfit >= 0 ? 'سود' : 'زیان'}
                          </div>
                          <div className={`text-[10px] font-bold font-mono ${renewalData.closingEntry.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {formatNum(Math.abs(renewalData.closingEntry.netProfit))}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-[9px] text-gray-500">بسته شده</div>
                          <div className="text-[10px] font-bold text-gray-700">
                            {isoToJalaliFa(renewalData.lastClosedYear.closedAt)}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-800">سال مالی جدید (پیشنهادی)</span>
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-600">نام سال مالی</Label>
                      <Input
                        value={renewalFYName}
                        onChange={e => setRenewalFYName(e.target.value)}
                        className="h-8 text-xs mt-1 font-bold"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] text-gray-600">شروع</Label>
                        <div className="mt-1 h-8 px-2 py-1.5 border border-gray-100 rounded-md bg-gray-50 flex items-center text-xs text-gray-700 font-mono">
                          {isoToJalaliFa(renewalFYStart)}
                        </div>
                      </div>
                      <div>
                        <Label className="text-[11px] text-gray-600">پایان</Label>
                        <div className="mt-1 h-8 px-2 py-1.5 border border-gray-100 rounded-md bg-gray-50 flex items-center text-xs text-gray-700 font-mono">
                          {isoToJalaliFa(renewalFYEnd)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-purple-200 bg-purple-50/30">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-purple-600" />
                        <span className="text-xs font-bold text-purple-800">انبارها</span>
                      </div>
                      <Badge className="bg-purple-100 text-purple-700 text-[9px]">
                        {renewalWarehouses.length} / {maxWarehouses === Infinity ? '∞' : maxWarehouses}
                      </Badge>
                    </div>

                    <Alert className="border-blue-200 bg-blue-50 py-1.5">
                      <Info className="h-3.5 w-3.5 text-blue-600" />
                      <AlertDescription className="text-[10px] text-blue-800 mr-2">
                        {features.tier === 'professional'
                          ? 'پلن پیشرفته: تا ۲ انبار مجاز.'
                          : features.tier === 'enterprise'
                          ? 'پلن حرفه‌ای: انبار نامحدود.'
                          : 'پلن پایه: ۱ انبار مجاز.'}
                      </AlertDescription>
                    </Alert>

                    {renewalWarehouses.map((wh: any, idx: number) => (
                      <div key={wh.id} className="flex items-center gap-2 p-2 bg-white border border-purple-100 rounded-lg">
                        <Package className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                        <Input
                          value={wh.name}
                          onChange={e => {
                            const updated = [...renewalWarehouses]
                            updated[idx] = { ...updated[idx], name: e.target.value, code: e.target.value }
                            setRenewalWarehouses(updated)
                          }}
                          className="h-7 text-xs flex-1"
                        />
                        {wh.isDefault && (
                          <Badge className="bg-emerald-100 text-emerald-700 text-[8px]">پیش‌فرض</Badge>
                        )}
                        {!wh.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                            onClick={() => handleDeleteRenewalWarehouse(wh.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    ))}

                    {(maxWarehouses === Infinity || renewalWarehouses.length < maxWarehouses) && (
                      <div className="bg-white border border-dashed border-purple-300 rounded-lg p-2 space-y-1.5">
                        <Label className="text-[10px] text-purple-700 font-bold">+ افزودن انبار جدید</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={renewalNewWhName}
                            onChange={e => setRenewalNewWhName(e.target.value)}
                            placeholder="نام انبار"
                            className="h-7 text-xs"
                          />
                          <Input
                            value={renewalNewWhCode}
                            onChange={e => setRenewalNewWhCode(e.target.value)}
                            placeholder="کد (اختیاری)"
                            className="h-7 text-xs"
                            dir="ltr"
                          />
                        </div>
                        {renewalNewWhName.trim() && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-7 text-xs border-purple-300 text-purple-700 hover:bg-purple-50"
                            onClick={handleAddRenewalWarehouse}
                            disabled={renewalSaving}
                          >
                            <Plus className="w-3 h-3 ml-1" />
                            اضافه کردن
                          </Button>
                        )}
                      </div>
                    )}

                    {renewalWarehouses.length >= maxWarehouses && maxWarehouses !== Infinity && (
                      <Alert className="border-amber-200 bg-amber-50 py-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        <AlertDescription className="text-[10px] text-amber-700 mr-2">
                          به سقف {maxWarehouses} انبار مجاز رسیدید.
                        </AlertDescription>
                      </Alert>
                    )}

                    <p className="text-[9px] text-gray-500 mt-1">
                      💡 موجودی انبارها از سال قبل منتقل می‌شود.
                    </p>
                  </CardContent>
                </Card>

                {renewalData.closingDetails && (
                  <Card className="border-amber-200 bg-amber-50/30">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Wallet className="w-4 h-4 text-amber-600" />
                        <span className="text-xs font-bold text-amber-800">سند افتتاحیه (خودکار)</span>
                        <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">اتوماتیک</Badge>
                      </div>

                      <p className="text-[10px] text-gray-600 mb-2">
                        مانده حساب‌های دائمی از سال قبل به‌صورت خودکار منتقل می‌شود:
                      </p>

                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-gray-600">جمع دارایی‌ها:</span>
                          <span className="font-bold text-emerald-700 font-mono">
                            {formatNum(renewalData.closingDetails.totalAssets)} ﷼
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">جمع بدهی‌ها:</span>
                          <span className="font-bold text-red-600 font-mono">
                            {formatNum(renewalData.closingDetails.totalLiabilities)} ﷼
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-amber-100 pt-1 font-bold">
                          <span className="text-gray-900">سرمایه:</span>
                          <span className="text-blue-700 font-mono">
                            {formatNum(renewalData.closingDetails.totalEquity)} ﷼
                          </span>
                        </div>
                      </div>

                      {renewalData.closingDetails.openingItems?.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-[10px] text-amber-700 cursor-pointer hover:text-amber-800">
                            مشاهده {renewalData.closingDetails.openingItems.length} حساب
                          </summary>
                          <div className="mt-1 max-h-32 overflow-y-auto space-y-0.5 text-[9px]">
                            {renewalData.closingDetails.openingItems.slice(0, 20).map((item: any) => (
                              <div key={item.accountId} className="flex justify-between px-1 py-0.5 bg-white rounded">
                                <span className="truncate text-gray-700">
                                  <span className="font-mono text-gray-400 ml-1">{item.accountCode}</span>
                                  {item.accountName}
                                </span>
                                <span className={`font-mono font-bold ${item.balance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                  {formatNum(Math.abs(item.balance))}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                )}

                {renewalError && (
                  <Alert className="border-red-200 bg-red-50 py-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                    <AlertDescription className="text-xs text-red-700 mr-2">{renewalError}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <DialogFooter className="flex items-center gap-2 pt-3 border-t border-gray-100">
              {!renewalSuccess && (
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 min-w-[140px]"
                  onClick={handleRenewalFinish}
                  disabled={renewalSaving || !renewalFYName.trim() || renewalWarehouses.length === 0}
                >
                  {renewalSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  {renewalSaving ? 'در حال ایجاد...' : 'تأیید و شروع سال جدید'}
                </Button>
              )}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="pb-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-violet-600" />
                </div>
                ویزارد راه‌اندازی فروشگاه
                <Badge className="bg-violet-100 text-violet-700 text-[10px] mr-auto">
                  {features.tier === 'enterprise' ? 'حرفه‌ای' : features.tier === 'professional' ? 'پیشرفته' : 'پایه'}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-[11px] text-gray-500 mt-0.5">
                این ویزارد فقط یک‌بار نمایش داده می‌شود. می‌توانید هر مرحله را رد کنید.
              </DialogDescription>
            </DialogHeader>

            {step < 3 && (
              <div className="space-y-2 pt-1">
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-violet-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {STEPS.map((s, idx) => (
                    <div key={idx} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] transition-all ${
                      idx === step
                        ? 'border-violet-400 bg-violet-50 text-violet-700 font-bold'
                        : s.done
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-gray-50 text-gray-400'
                    }`}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold ${
                        s.done ? 'bg-emerald-500 text-white' : idx === step ? 'bg-violet-500 text-white' : 'bg-gray-300 text-gray-500'
                      }`}>
                        {s.done ? <CheckCircle2 className="w-3 h-3" /> : idx + 1}
                      </div>
                      <span className="truncate">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="min-h-[260px] py-1">
              {step === 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-violet-600" />
                    <h3 className="text-sm font-bold text-gray-900">تعریف سال مالی</h3>
                  </div>

                  {fyExisting.some((y: any) => y.isActive) ? (
                    <Alert className="border-emerald-200 bg-emerald-50 py-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <AlertDescription className="text-xs text-emerald-800 mr-2">
                        <p className="font-medium">سال مالی فعال موجود است:</p>
                        {fyExisting.filter((y: any) => y.isActive).map((y: any) => (
                          <p key={y.id} className="mt-1">
                            <strong>{y.name}</strong> — {isoToJalaliFa(y.startDate)} تا {isoToJalaliFa(y.endDate)}
                          </p>
                        ))}
                        <p className="mt-1.5 text-emerald-600 text-[11px]">می‌توانید ادامه دهید.</p>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <Alert className="border-blue-200 bg-blue-50 py-2">
                        <Info className="h-3.5 w-3.5 text-blue-600" />
                        <AlertDescription className="text-[11px] text-blue-800 mr-2">
                          سال مالی دوره‌ای است که تمام اسناد حسابداری در آن ثبت می‌شوند.
                          اگر رد کنید، یک سال مالی از امروز به‌صورت پیش‌فرض ثبت می‌شود.
                        </AlertDescription>
                      </Alert>
                      <div className="space-y-2">
                        <div>
                          <Label className="text-[11px] text-gray-600">نام سال مالی</Label>
                          <Input
                            value={fyName}
                            onChange={e => setFyName(e.target.value)}
                            placeholder="مثلاً: سال مالی ۱۴۰۴"
                            className="h-8 text-xs mt-1"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[11px] text-gray-600">تاریخ شروع (شمسی)</Label>
                            <PersianDatePicker
                              value={fyStart}
                              onChange={(iso) => { if (iso) setFyStart(iso) }}
                              placeholder="انتخاب تاریخ"
                              label=""
                            />
                            <p className="text-[10px] text-gray-500 mt-0.5">{isoToJalaliFa(fyStart)}</p>
                          </div>
                          <div>
                            <Label className="text-[11px] text-gray-600">تاریخ پایان (خودکار)</Label>
                            <div className="mt-0.5 h-9 px-2 py-1.5 border border-gray-100 rounded-md bg-gray-50 flex items-center text-xs text-gray-500">
                              {isoToJalaliFa(fyEnd)}
                            </div>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {formatNum(daysBetween(fyStart, fyEnd))} روز
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {fyError && (
                    <Alert className="border-red-200 bg-red-50 py-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                      <AlertDescription className="text-xs text-red-700 mr-2">{fyError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-violet-600" />
                      <h3 className="text-sm font-bold text-gray-900">تعریف انبار</h3>
                    </div>
                    <Badge className="bg-gray-100 text-gray-600 text-[10px]">
                      {warehouses.length} / {maxWarehouses === Infinity ? '∞' : maxWarehouses}
                    </Badge>
                  </div>

                  <Alert className="border-blue-200 bg-blue-50 py-2">
                    <Info className="h-3.5 w-3.5 text-blue-600" />
                    <AlertDescription className="text-[11px] text-blue-800 mr-2">
                      {features.tier === 'professional'
                        ? 'پلن پیشرفته: تا ۲ انبار مجاز. '
                        : features.tier === 'enterprise'
                        ? 'پلن حرفه‌ای: انبار نامحدود. '
                        : 'پلن پایه: ۱ انبار مجاز. '}
                      اگر رد کنید، «انبار فروشگاه» پیش‌فرض ایجاد می‌شود.
                    </AlertDescription>
                  </Alert>

                  {whLoading ? (
                    <div className="flex items-center gap-2 py-3 justify-center text-xs text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                      در حال بارگذاری...
                    </div>
                  ) : warehouses.length > 0 ? (
                    <div className="space-y-1.5">
                      {warehouses.map((wh: any) => (
                        <div key={wh.id} className="flex items-center justify-between gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                          <div className="flex items-center gap-2 min-w-0">
                            <Package className="w-4 h-4 text-emerald-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{wh.name}</p>
                              <p className="text-[10px] text-gray-500">کد: {wh.code}</p>
                            </div>
                            {wh.isDefault && (
                              <Badge className="bg-emerald-200 text-emerald-800 text-[9px]">پیش‌فرض</Badge>
                            )}
                          </div>
                          {!wh.isDefault && (
                            <Button variant="ghost" size="sm"
                              className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                              onClick={() => deleteWH(wh.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {warehouses.length < maxWarehouses && (
                    <Card className="border-violet-200 bg-violet-50/30">
                      <CardContent className="p-3 space-y-2">
                        <p className="text-[11px] font-medium text-violet-700">
                          {warehouses.length === 0 ? '★ اولین انبار را تعریف کنید' : '+ انبار جدید اضافه کنید'}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[11px] text-gray-600">نام انبار</Label>
                            <Input
                              value={whName}
                              onChange={e => setWhName(e.target.value)}
                              placeholder="مثلاً: انبار اصلی"
                              className="h-8 text-xs mt-0.5"
                              onKeyDown={e => {
                                if (e.key === 'Enter' && whName.trim()) {
                                  saveWH(whName, whCode).then(ok => {
                                    if (ok) { setWhName(''); setWhCode('') }
                                  })
                                }
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] text-gray-600">کد (اختیاری)</Label>
                            <Input
                              value={whCode}
                              onChange={e => setWhCode(e.target.value)}
                              placeholder="WH-01"
                              className="h-8 text-xs mt-0.5"
                              dir="ltr"
                            />
                          </div>
                        </div>
                        {whName.trim() && (
                          <Button
                            variant="outline" size="sm"
                            className="w-full h-7 text-xs border-violet-300 text-violet-700 hover:bg-violet-100"
                            onClick={async () => {
                              const ok = await saveWH(whName, whCode)
                              if (ok) { setWhName(''); setWhCode('') }
                            }}
                            disabled={saving}
                          >
                            <Plus className="w-3.5 h-3.5 ml-1" />
                            اضافه کردن انبار
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {warehouses.length >= maxWarehouses && maxWarehouses !== Infinity && (
                    <Alert className="border-amber-200 bg-amber-50 py-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      <AlertDescription className="text-xs text-amber-700 mr-2">
                        به سقف {maxWarehouses} انبار مجاز رسیدید.
                      </AlertDescription>
                    </Alert>
                  )}

                  {whError && (
                    <Alert className="border-red-200 bg-red-50 py-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                      <AlertDescription className="text-xs text-red-700 mr-2">{whError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-violet-600" />
                    <h3 className="text-sm font-bold text-gray-900">موجودی‌های اولیه</h3>
                    <Badge className="text-[9px] bg-gray-100 text-gray-600">اختیاری</Badge>
                    {balIsPosted ? (
                      <Badge className="text-[9px] bg-emerald-100 text-emerald-700">سند صادر شده ✓</Badge>
                    ) : balItems.length > 0 ? (
                      <Badge className="text-[9px] bg-amber-100 text-amber-700">پیش‌نویس</Badge>
                    ) : null}
                  </div>

                  <Alert className="border-amber-200 bg-amber-50 py-2">
                    <Info className="h-3.5 w-3.5 text-amber-600" />
                    <AlertDescription className="text-[11px] text-amber-800 mr-2">
                      <strong>این مرحله اختیاری است.</strong> موجودی‌های واردشده به‌صورت
                      <span className="font-medium"> پیش‌نویس</span> ذخیره می‌شوند. برای
                      <span className="font-medium"> ثبت نهایی و صدور سند قطعی</span>، بعداً به
                      <span className="font-medium"> تنظیمات ← راه‌اندازی</span> مراجعه کنید.
                    </AlertDescription>
                  </Alert>

                  <Card className="border-violet-200 bg-violet-50/20">
                    <CardContent className="p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] text-gray-600">نوع</Label>
                          <select
                            value={balType}
                            onChange={e => setBalType(e.target.value as BalanceType)}
                            className="w-full mt-0.5 h-8 text-xs border border-gray-200 rounded-md px-2 bg-white"
                          >
                            {(Object.keys(BAL_LABELS) as BalanceType[]).map(t => (
                              <option key={t} value={t}>{BAL_LABELS[t]}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-[11px] text-gray-600">عنوان</Label>
                          <Input
                            value={balTitle}
                            onChange={e => setBalTitle(e.target.value)}
                            placeholder={
                              balType === 'cash' ? 'صندوق فروشگاه'
                              : balType === 'bank' ? 'بانک ملت'
                              : balType === 'liability' ? 'وام بانک'
                              : 'عنوان'
                            }
                            className="h-8 text-xs mt-0.5"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] text-gray-600">مبلغ (ریال)</Label>
                          <Input
                            type="number"
                            value={balAmount}
                            onChange={e => setBalAmount(e.target.value)}
                            placeholder="مثلاً: 5000000"
                            className="h-8 text-xs mt-0.5"
                            dir="ltr"
                            onKeyDown={e => e.key === 'Enter' && addBalItem()}
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-gray-600">توضیح (اختیاری)</Label>
                          <Input
                            value={balDesc}
                            onChange={e => setBalDesc(e.target.value)}
                            placeholder="یادداشت"
                            className="h-8 text-xs mt-0.5"
                          />
                        </div>
                      </div>
                      <Button
                        variant="outline" size="sm"
                        className="w-full h-7 text-xs border-violet-300 text-violet-700 hover:bg-violet-100"
                        onClick={addBalItem}
                        disabled={!balTitle.trim() || !balAmount}
                      >
                        <Plus className="w-3.5 h-3.5 ml-1" />
                        افزودن
                      </Button>
                    </CardContent>
                  </Card>

                  {balItems.length > 0 && (
                    <div className="space-y-1">
                      <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg">
                        {balItems.map((item, idx) => (
                          <div key={idx}
                            className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${BAL_COLORS[item.type]}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0">{BAL_LABELS[item.type].split(' ')[0]}</span>
                              <span className="font-medium truncate">{item.title}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-bold font-mono">{formatNum(item.amount)}﷼</span>
                              <Button variant="ghost" size="sm"
                                className="h-5 w-5 p-0 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setBalItems(p => p.filter((_, i) => i !== idx))}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-600">جمع دارایی‌ها:</span>
                          <span className="font-bold text-emerald-700">{formatNum(totalAssets)}﷼</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">جمع بدهی‌ها:</span>
                          <span className="font-bold text-red-600">{formatNum(totalLiab)}﷼</span>
                        </div>
                        <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
                          <span className="text-gray-900">سرمایه مالک:</span>
                          <span className={totalEquity >= 0 ? 'text-blue-700' : 'text-red-700'}>
                            {formatNum(totalEquity)}﷼
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {balError && (
                    <Alert className="border-red-200 bg-red-50 py-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                      <AlertDescription className="text-xs text-red-700 mr-2">{balError}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4 py-4 text-center">
                  <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-10 h-10 text-violet-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">🎉 فروشگاه آماده‌ است!</h3>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      راه‌اندازی اولیه تکمیل شد. می‌توانید فاکتور صادر کنید.
                    </p>
                  </div>
                  <div className="text-right space-y-1.5 max-w-xs mx-auto">
                    {[
                      { done: fyDone, label: 'سال مالی', sub: fyExisting.find((y: any) => y.isActive)?.name || fyName || 'ثبت شد' },
                      { done: whDone || warehouses.length > 0, label: 'انبار', sub: `${warehouses.length || 1} انبار` },
                      { done: balIsPosted || balItems.length > 0, label: 'سند افتتاحیه', sub: balIsPosted ? `${balItems.length} آیتم — سند صادر شد` : balItems.length > 0 ? `${balItems.length} آیتم — پیش‌نویس (ثبت نهایی در تنظیمات)` : 'می‌توانید بعداً ثبت کنید' },
                    ].map((s, i) => (
                      <div key={i} className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs ${
                        s.done ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'
                      }`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                          s.done ? 'bg-emerald-500' : 'bg-gray-300'
                        }`}>
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">{s.label}</p>
                          <p className="text-[10px] text-gray-500">{s.sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center gap-2 pt-3 border-t border-gray-100">
              {step > 0 && step < 3 && (
                <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)}
                  disabled={saving || savingBalance} className="text-xs gap-1 text-gray-500"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  قبلی
                </Button>
              )}

              {step < 3 && (
                <Button variant="ghost" size="sm" onClick={handleSkip}
                  disabled={saving || savingBalance}
                  className="text-xs gap-1 text-gray-400 hover:text-gray-600 mr-auto"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SkipForward className="w-3.5 h-3.5" />}
                  {step === 2 ? 'رد کردن (بعداً)' : 'رد کردن (پیش‌فرض)'}
                </Button>
              )}

              <div className="mr-auto">
                {step < 3 ? (
                  <Button
                    className="bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1 min-w-[100px]"
                    onClick={handleNext}
                    disabled={saving || savingBalance}
                  >
                    {(saving || savingBalance) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {step === 0 && fyDone ? 'ادامه →' : step === 1 && (warehouses.length > 0) ? 'ادامه →' : 'ثبت و ادامه →'}
                  </Button>
                ) : (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1 min-w-[120px]"
                    onClick={handleFinish}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    شروع کار با سیستم
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}