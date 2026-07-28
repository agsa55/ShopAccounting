// src/components/setup-wizard.tsx
// ============================================================================
// ★★★ ویزارد راه‌اندازی اولیه — v2.0
// - نمایش فقط یک‌بار بعد از ورود به داشبورد
// - Auto-default: سال مالی + انبار اگر ثبت نشد
// - سند افتتاحیه اختیاری
// ============================================================================
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { getFeaturesByPlanName, type PlanName } from '@/lib/plan-features'
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
//  برای استفاده در داشبورد یا app-shell
// ─────────────────────────────────────────────────────────────────────────────
// src/components/setup-wizard.tsx

export function useSetupWizard() {
  const currentTenant = useAppStore((s) => s.currentTenant)
  const tenantId = useAppStore((s) => s.tenantId)
    || (currentTenant as any)?.id
    || ''

  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!tenantId || checked) return
    setChecked(true)

    // ★ بررسی سریع بدون await
    Promise.all([
      fetch('/api/fiscal-years', { 
        headers: typeof window !== 'undefined' && localStorage.getItem('token')
          ? { Authorization: `Bearer ${localStorage.getItem('token')}` }
          : {}
      }).then(r => r.json()).catch(() => ({})),
      fetch('/api/warehouses', { 
        headers: typeof window !== 'undefined' && localStorage.getItem('token')
          ? { Authorization: `Bearer ${localStorage.getItem('token')}` }
          : {}
      }).then(r => r.json()).catch(() => ({})),
    ]).then(([fyData, whData]) => {
      const years = fyData?.data?.years || fyData?.data || []
      const whs = whData?.data || []
      
      // ★ دقیق‌تر: سال مالی **فعال** و **حداقل ۱ انبار**
      const hasActiveFY = Array.isArray(years) && years.some((y: any) => y.isActive)
      const hasWH = Array.isArray(whs) && whs.length > 0

      // ★ اگر هر دو موجود → ویزارد انجام شده
      if (hasActiveFY && hasWH) {
        markWizardDone(tenantId)
        return
      }

      // ★ اگر یکی هم نیست → ویزارد نشان بده
      console.log('[useSetupWizard] Opening wizard:', { hasActiveFY, hasWH })
      setTimeout(() => setOpen(true), 600)
    }).catch(err => {
      console.error('[useSetupWizard] Check error:', err)
      // ★ درصورت خطا → ویزارد نشان بده
      setTimeout(() => setOpen(true), 600)
    })
  }, [tenantId, checked])

  const handleComplete = useCallback(() => {
    if (tenantId) markWizardDone(tenantId)
    setOpen(false)
  }, [tenantId])

  return { open, setOpen, handleComplete }
}
// ─────────────────────────────────────────────────────────────────────────────
//  کامپوننت اصلی SetupWizard
// ─────────────────────────────────────────────────────────────────────────────
export interface SetupWizardProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onComplete?: () => void
}

export function SetupWizard({ open, onOpenChange, onComplete }: SetupWizardProps) {
  const currentTenant = useAppStore((s) => s.currentTenant)
  const planName = useAppStore((s) => s.planName)
  const { toast } = useToast()

  const features = useMemo(
    ()=>getFeaturesByPlanName((planName||'simple') as PlanName),
    [planName]
  )
  const maxWarehouses = useMemo(()=>{
    if(features.tier==='enterprise') return Infinity
    if(features.tier==='professional') return 2
    return 1
  },[features])

  // ── مرحله: 0=سال‌مالی | 1=انبار | 2=سند‌افتتاحیه | 3=پایان
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  // ── سال مالی
  const [fyName, setFyName] = useState('')
  const [fyStart, setFyStart] = useState(todayISO())
  const [fyEnd, setFyEnd] = useState(addDays(todayISO(),364))
  const [fyDone, setFyDone] = useState(false)
  const [fyExisting, setFyExisting] = useState<any[]>([])
  const [fyError, setFyError] = useState('')

  // ── انبار
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [whName, setWhName] = useState('')
  const [whCode, setWhCode] = useState('')
  const [whDone, setWhDone] = useState(false)
  const [whError, setWhError] = useState('')
  const [whLoading, setWhLoading] = useState(false)

  // ── سند افتتاحیه
  const [balItems, setBalItems] = useState<BalanceItem[]>([])
  const [balType, setBalType] = useState<BalanceType>('cash')
  const [balTitle, setBalTitle] = useState('')
  const [balAmount, setBalAmount] = useState('')
  const [balDesc, setBalDesc] = useState('')
  const [balError, setBalError] = useState('')
  const [balIsPosted, setBalIsPosted] = useState(false)

  // ── لود اولیه
  useEffect(()=>{
    if(!open)return
    setStep(0)
    setSaving(false)
    setFyError('')
    setWhError('')
    setBalError('')
    loadAll()
  },[open])

  const loadAll = async () => {
    // سال مالی
    try{
      const r=await fetch('/api/fiscal-years',{headers:getToken()})
      const d=await r.json()
      const ys=d?.data?.years||d?.data||[]
      setFyExisting(Array.isArray(ys)?ys:[])
      if(ys.some((y:any)=>y.isActive))setFyDone(true)
    }catch{}

    // انبار
    setWhLoading(true)
    try{
      const r=await fetch('/api/warehouses',{headers:getToken()})
      const d=await r.json()
      const ws=d?.data||[]
      setWarehouses(Array.isArray(ws)?ws:[])
      if(ws.length>0)setWhDone(true)
    }catch{}
    setWhLoading(false)

    // سند افتتاحیه
    try{
      const r=await fetch('/api/initial-balance',{headers:getToken()})
      const d=await r.json()
      if(d.success&&d.data?.length>0){
        setBalItems(d.data.map((b:any)=>({
          type:b.type as BalanceType,
          title:b.title,
          amount:b.amount,
          description:b.description,
        })))
        setBalIsPosted(d.summary?.isPosted||false)
      }
    }catch{}
  }

  // ── اسم پیش‌فرض سال مالی
  useEffect(()=>{
    setFyName(getJalaliYearName(fyStart))
    setFyEnd(addDays(fyStart,364))
  },[fyStart])

  // ── ذخیره سال مالی
  const saveFY = async (): Promise<boolean> => {
  setFyError('')
  if (!fyName.trim()) { setFyError('نام سال مالی الزامی است'); return false }
  
  try {
    const r = await fetch('/api/fiscal-years', {
      method: 'POST',
      headers: getAuthHeaders(), // ★ جایگزین شد
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


  // ── سال مالی پیش‌فرض (auto)
  const autoCreateFY = async (): Promise<boolean> => {
    try{
      const name=getJalaliYearName(todayISO())
      const r=await fetch('/api/fiscal-years',{
        method:'POST',
        headers:{'Content-Type':'application/json',...getToken()},
        body:JSON.stringify({name,startDate:todayISO(),endDate:addDays(todayISO(),364),activate:true}),
      })
      const d=await r.json()
      return d.success
    }catch{return false}
  }

 // ── ذخیره انبار
const saveWH = async (name: string, code?: string): Promise<boolean> => {
  setWhError('')
  try {
    const r = await fetch('/api/warehouses', {
      method: 'POST',
      headers: getAuthHeaders(), // ★ جایگزین شد
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
  // ── حذف انبار
  const deleteWH = async (id:string) => {
    try{
      const r=await fetch(`/api/warehouses?id=${id}`,{method:'DELETE',headers:getToken()})
      const d=await r.json()
      if(d.success){
        setWarehouses(p=>p.filter(w=>w.id!==id))
        if(warehouses.length<=1)setWhDone(false)
      }else{
        toast({title:'خطا',description:d.error,variant:'destructive'})
      }
    }catch{}
  }

 // ─────────────────────────────────────────────────────────────────────────────
//  افزودن آیتم — اصلاح‌شده (اطمینان از number بودن amount)
// ─────────────────────────────────────────────────────────────────────────────
const addBalItem = () => {
  setBalError('')

  if (!balTitle.trim()) {
    setBalError('عنوان الزامی است')
    return
  }

  const amt = parseFloat(balAmount)
  if (isNaN(amt) || amt <= 0) {  // ★ 0 هم مجاز نیست
    setBalError('مبلغ باید عدد مثبت باشد')
    return
  }

  setBalItems(prev => [
    ...prev,
    {
      type: balType,
      title: balTitle.trim(),
      amount: amt,            // ★ number خالص
      description: balDesc.trim() || undefined,
    }
  ])

  // ★ پاک کردن فرم
  setBalTitle('')
  setBalAmount('')
  setBalDesc('')
  setBalError('')
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


 // src/components/setup-wizard.tsx
// ─────────────────────────────────────────────────────────────────────────────
//  ثبت سند افتتاحیه — FIX v2
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  ثبت سند افتتاحیه — دو مرحله‌ای (مثل InitialBalanceTab در تنظیمات)
//  مرحله ۱: ذخیره آیتم‌ها در DB
//  مرحله ۲: صدور سند (postToJournal: true)
// ─────────────────────────────────────────────────────────────────────────────
const saveBalance = async (): Promise<boolean> => {
  // اگه آیتمی نیست → رد شو (اختیاری)
  if (balItems.length === 0) return true

  setBalError('')

  // ★ اعتبارسنجی آیتم‌ها قبل از ارسال
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

  const requestBody = {
    items: balItems.map((b) => ({
      type: b.type,
      title: b.title.trim(),
      amount: Number(b.amount), // ★ اطمینان از number بودن
      description: b.description?.trim() || '',
    })),
    postToJournal: true, // ★ هم ذخیره هم سند
  }

  console.log('[SetupWizard] saveBalance - request:', {
    itemsCount: requestBody.items.length,
    postToJournal: requestBody.postToJournal,
    items: requestBody.items,
  })

  try {
    const res = await fetch('/api/initial-balance', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(requestBody),
    })

    // ★ بررسی status قبل از parse
    if (!res.ok && res.status !== 200) {
      const text = await res.text()
      console.error('[SetupWizard] saveBalance - HTTP error:', res.status, text)
      const errMsg = `خطای سرور (${res.status})`
      setBalError(errMsg)
      toast({ title: 'خطا', description: errMsg, variant: 'destructive' })
      return false
    }

    const data = await res.json()
    console.log('[SetupWizard] saveBalance - response:', data)

    if (data.success) {
      setBalIsPosted(true)
      toast({
        title: '✅ سند افتتاحیه ثبت شد',
        description: data.message || `${balItems.length} آیتم با موفقیت ثبت شد`,
      })
      return true
    }

    // ★ خطای API
    const errMsg = data.error || 'خطا در ثبت سند افتتاحیه'
    console.error('[SetupWizard] saveBalance - API error:', errMsg)
    setBalError(errMsg)
    toast({ title: 'خطا', description: errMsg, variant: 'destructive' })
    return false

  } catch (err: any) {
    const errMsg = 'خطا در ارتباط با سرور'
    console.error('[SetupWizard] saveBalance - catch:', err)
    setBalError(errMsg)
    toast({ title: 'خطا', description: errMsg, variant: 'destructive' })
    return false
  }
}
  // ── محاسبات سند
  const totalAssets=balItems.filter(b=>['cash','bank','inventory','fixed_asset'].includes(b.type)).reduce((s,b)=>s+b.amount,0)
  const totalLiab=balItems.filter(b=>b.type==='liability').reduce((s,b)=>s+b.amount,0)
  const totalEquity=totalAssets-totalLiab

  // ─────────────────────────────────────────────────────────────────────────────
//  handleNext — اصلاح‌شده برای مرحله ۲
// ─────────────────────────────────────────────────────────────────────────────
const handleNext = async () => {
  setSaving(true)
  setFyError('')
  setWhError('')
  setBalError('')

  try {
    // ── مرحله ۰: سال مالی
    if (step === 0) {
      if (fyDone) {
        setStep(1)
        return
      }
      const ok = await saveFY()
      if (ok) setStep(1)
      return
    }

    // ── مرحله ۱: انبار
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
        if (ok) {
          setWhName('')
          setWhCode('')
          setStep(2)
        }
      } else {
        setWhError('حداقل یک انبار ایجاد کنید یا روی «رد کردن» کلیک کنید')
      }
      return
    }

    // ── مرحله ۲: سند افتتاحیه
    if (step === 2) {
      // ★ اگه آیتمی در فرم هنوز اضافه نشده، هشدار بده
      if (balTitle.trim() && balAmount) {
        setBalError('آیتم در حال ورود را ابتدا با دکمه «افزودن» اضافه کنید')
        return
      }

      if (balItems.length === 0) {
        // هیچ آیتمی نیست → رد شو به مرحله بعد
        setStep(3)
        return
      }

      // ★ ثبت سند
      const ok = await saveBalance()
      if (ok) setStep(3)
      return
    }

  } finally {
    setSaving(false)
  }
}
  // ──────────────────────────────────────────────────────────────────────────
  //  handleSkip — رد کردن مرحله با ثبت پیش‌فرض
  // ──────────────────────────────────────────────────────────────────────────
  const handleSkip = async () => {
    setSaving(true)
    try{
      if(step===0&&!fyDone){
        // Auto: سال مالی پیش‌فرض
        toast({title:'سال مالی پیش‌فرض ایجاد شد',description:'یک سال از امروز'})
        await autoCreateFY()
        setFyDone(true)
        setStep(1)
        return
      }
      if(step===1&&warehouses.length===0){
        // Auto: انبار پیش‌فرض
        toast({title:'انبار پیش‌فرض ایجاد شد',description:'انبار فروشگاه'})
        await saveWH('انبار فروشگاه','WH-01')
        setStep(2)
        return
      }
      if(step===2){
        // سند افتتاحیه اختیاری است
        setStep(3)
        return
      }
    }finally{
      setSaving(false)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  handleFinish — پایان ویزارد
  // ──────────────────────────────────────────────────────────────────────────
  const handleFinish = async () => {
    setSaving(true)
    try{
      // اگه سال مالی هنوز نداریم → auto
      if(!fyDone){
        await autoCreateFY()
      }
      // اگه انبار هنوز نداریم → auto
      if(warehouses.length===0){
        await saveWH('انبار فروشگاه','WH-01')
      }
      toast({
        title:'🎉 راه‌اندازی کامل شد!',
        description:'فروشگاه شما آماده‌ی استفاده است',
      })
      onOpenChange(false)
      onComplete?.()
    }finally{
      setSaving(false)
    }
  }

  // ─── Progress
  const STEPS = [
    {label:'سال مالی',icon:<Calendar className="w-4 h-4"/>,done:fyDone},
    {label:'انبار',icon:<Building2 className="w-4 h-4"/>,done:whDone||warehouses.length>0},
    {label:'سند افتتاحیه',icon:<Wallet className="w-4 h-4"/>,done:balIsPosted||balItems.length>0},
  ]
  const pct = step>=3 ? 100 : Math.round((step/3)*100)

  // ────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={v=>{
      // اگه بستن دیالوگ → پیش‌فرض‌ها رو ثبت کن
      if(!v)handleFinish()
      else onOpenChange(true)
    }}>
      <DialogContent
        className="max-w-xl w-[95vw] max-h-[92vh] overflow-y-auto"
        dir="rtl"
        // ★ جلوگیری از بسته شدن با کلیک بیرون
        onInteractOutside={e=>e.preventDefault()}
        onEscapeKeyDown={e=>e.preventDefault()}
      >
        {/* ═══ هدر ═══ */}
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Zap className="w-4 h-4 text-violet-600"/>
            </div>
            ویزارد راه‌اندازی فروشگاه
            <Badge className="bg-violet-100 text-violet-700 text-[10px] mr-auto">
              {features.tier==='enterprise'?'سازمانی':features.tier==='professional'?'حرفه‌ای':'پایه'}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-[11px] text-gray-500 mt-0.5">
            این ویزارد فقط یک‌بار نمایش داده می‌شود. می‌توانید هر مرحله را رد کنید.
          </DialogDescription>
        </DialogHeader>

        {/* ═══ Stepper ═══ */}
        {step < 3 && (
          <div className="space-y-2 pt-1">
            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-violet-500 h-full rounded-full transition-all duration-500"
                style={{width:`${pct}%`}}
              />
            </div>
            {/* Step tabs */}
            <div className="grid grid-cols-3 gap-1.5">
              {STEPS.map((s,idx)=>(
                <div key={idx} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] transition-all ${
                  idx===step
                    ?'border-violet-400 bg-violet-50 text-violet-700 font-bold'
                    :s.done
                    ?'border-emerald-300 bg-emerald-50 text-emerald-700'
                    :'border-gray-200 bg-gray-50 text-gray-400'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold ${
                    s.done?'bg-emerald-500 text-white':idx===step?'bg-violet-500 text-white':'bg-gray-300 text-gray-500'
                  }`}>
                    {s.done?<CheckCircle2 className="w-3 h-3"/>:idx+1}
                  </div>
                  <span className="truncate">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ محتوا ═══ */}
        <div className="min-h-[260px] py-1">

          {/* ─── مرحله ۰: سال مالی ─── */}
          {step===0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-violet-600"/>
                <h3 className="text-sm font-bold text-gray-900">تعریف سال مالی</h3>
              </div>

              {/* اگه قبلاً ثبت شده */}
              {fyExisting.some((y:any)=>y.isActive) ? (
                <Alert className="border-emerald-200 bg-emerald-50 py-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600"/>
                  <AlertDescription className="text-xs text-emerald-800 mr-2">
                    <p className="font-medium">سال مالی فعال موجود است:</p>
                    {fyExisting.filter((y:any)=>y.isActive).map((y:any)=>(
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
                    <Info className="h-3.5 w-3.5 text-blue-600"/>
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
                        onChange={e=>setFyName(e.target.value)}
                        placeholder="مثلاً: سال مالی ۱۴۰۳"
                        className="h-8 text-xs mt-1"
                      />
                    </div>
                                     <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] text-gray-600">تاریخ شروع (شمسی)</Label>
                      {/* ★ Datepicker شمسی */}
                      <PersianDatePicker
                        value={fyStart}
                        onChange={(iso) => {
                          if (iso) setFyStart(iso)
                        }}
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
                        {formatNum(daysBetween(fyStart,fyEnd))} روز
                      </p>
                    </div>
                  </div>
                  </div>
                </>
              )}

              {fyError && (
                <Alert className="border-red-200 bg-red-50 py-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-600"/>
                  <AlertDescription className="text-xs text-red-700 mr-2">{fyError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* ─── مرحله ۱: انبار ─── */}
          {step===1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-violet-600"/>
                  <h3 className="text-sm font-bold text-gray-900">تعریف انبار</h3>
                </div>
                <Badge className="bg-gray-100 text-gray-600 text-[10px]">
                  {warehouses.length} / {maxWarehouses===Infinity?'∞':maxWarehouses}
                </Badge>
              </div>

              <Alert className="border-blue-200 bg-blue-50 py-2">
                <Info className="h-3.5 w-3.5 text-blue-600"/>
                <AlertDescription className="text-[11px] text-blue-800 mr-2">
                  {features.tier==='professional'
                    ?'پلن حرفه‌ای: تا ۲ انبار مجاز. '
                    :features.tier==='enterprise'
                    ?'پلن سازمانی: انبار نامحدود. '
                    :'پلن پایه: ۱ انبار مجاز. '}
                  اگر رد کنید، «انبار فروشگاه» پیش‌فرض ایجاد می‌شود.
                </AlertDescription>
              </Alert>

              {/* انبارهای موجود */}
              {whLoading ? (
                <div className="flex items-center gap-2 py-3 justify-center text-xs text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-500"/>
                  در حال بارگذاری...
                </div>
              ) : warehouses.length>0 ? (
                <div className="space-y-1.5">
                  {warehouses.map((wh:any)=>(
                    <div key={wh.id}
                      className="flex items-center justify-between gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="w-4 h-4 text-emerald-500 shrink-0"/>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{wh.name}</p>
                          <p className="text-[10px] text-gray-500">کد: {wh.code}</p>
                        </div>
                        {wh.isDefault&&(
                          <Badge className="bg-emerald-200 text-emerald-800 text-[9px]">پیش‌فرض</Badge>
                        )}
                      </div>
                      {!wh.isDefault&&(
                        <Button variant="ghost" size="sm"
                          className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                          onClick={()=>deleteWH(wh.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5"/>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {/* فرم انبار جدید */}
              {warehouses.length < maxWarehouses && (
                <Card className="border-violet-200 bg-violet-50/30">
                  <CardContent className="p-3 space-y-2">
                    <p className="text-[11px] font-medium text-violet-700">
                      {warehouses.length===0?'★ اولین انبار را تعریف کنید':'+ انبار جدید اضافه کنید'}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] text-gray-600">نام انبار</Label>
                        <Input
                          value={whName}
                          onChange={e=>setWhName(e.target.value)}
                          placeholder="مثلاً: انبار اصلی"
                          className="h-8 text-xs mt-0.5"
                          onKeyDown={e=>{
                            if(e.key==='Enter'&&whName.trim()){
                              saveWH(whName,whCode).then(ok=>{
                                if(ok){setWhName('');setWhCode('')}
                              })
                            }
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-gray-600">کد (اختیاری)</Label>
                        <Input
                          value={whCode}
                          onChange={e=>setWhCode(e.target.value)}
                          placeholder="WH-01"
                          className="h-8 text-xs mt-0.5"
                          dir="ltr"
                        />
                      </div>
                    </div>
                    {whName.trim()&&(
                      <Button
                        variant="outline" size="sm"
                        className="w-full h-7 text-xs border-violet-300 text-violet-700 hover:bg-violet-100"
                        onClick={async()=>{
                          const ok=await saveWH(whName,whCode)
                          if(ok){setWhName('');setWhCode('')}
                        }}
                        disabled={saving}
                      >
                        <Plus className="w-3.5 h-3.5 ml-1"/>
                        اضافه کردن انبار
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {warehouses.length>=maxWarehouses&&maxWarehouses!==Infinity&&(
                <Alert className="border-amber-200 bg-amber-50 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600"/>
                  <AlertDescription className="text-xs text-amber-700 mr-2">
                    به سقف {maxWarehouses} انبار مجاز رسیدید.
                  </AlertDescription>
                </Alert>
              )}

              {whError&&(
                <Alert className="border-red-200 bg-red-50 py-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-600"/>
                  <AlertDescription className="text-xs text-red-700 mr-2">{whError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* ─── مرحله ۲: سند افتتاحیه ─── */}
          {step===2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-violet-600"/>
                <h3 className="text-sm font-bold text-gray-900">موجودی‌های اولیه</h3>
                <Badge className="text-[9px] bg-gray-100 text-gray-600">اختیاری</Badge>
                {balIsPosted&&(
                  <Badge className="text-[9px] bg-emerald-100 text-emerald-700">سند صادر شده</Badge>
                )}
              </div>

              <Alert className="border-amber-200 bg-amber-50 py-2">
                <Info className="h-3.5 w-3.5 text-amber-600"/>
                <AlertDescription className="text-[11px] text-amber-800 mr-2">
                  <strong>این مرحله اختیاری است.</strong> اگر رد کنید، بعداً از
                  <span className="font-medium"> تنظیمات → راه‌اندازی</span> می‌توانید سند افتتاحیه ثبت کنید.
                </AlertDescription>
              </Alert>

              {/* فرم */}
              <Card className="border-violet-200 bg-violet-50/20">
                <CardContent className="p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] text-gray-600">نوع</Label>
                      <select
                        value={balType}
                        onChange={e=>setBalType(e.target.value as BalanceType)}
                        className="w-full mt-0.5 h-8 text-xs border border-gray-200 rounded-md px-2 bg-white"
                      >
                        {(Object.keys(BAL_LABELS) as BalanceType[]).map(t=>(
                          <option key={t} value={t}>{BAL_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-600">عنوان</Label>
                      <Input
                        value={balTitle}
                        onChange={e=>setBalTitle(e.target.value)}
                        placeholder={
                          balType==='cash'?'صندوق فروشگاه'
                          :balType==='bank'?'بانک ملت'
                          :balType==='liability'?'وام بانک'
                          :'عنوان'
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
                        onChange={e=>setBalAmount(e.target.value)}
                        placeholder="مثلاً: 5000000"
                        className="h-8 text-xs mt-0.5"
                        dir="ltr"
                        onKeyDown={e=>e.key==='Enter'&&addBalItem()}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-gray-600">توضیح (اختیاری)</Label>
                      <Input
                        value={balDesc}
                        onChange={e=>setBalDesc(e.target.value)}
                        placeholder="یادداشت"
                        className="h-8 text-xs mt-0.5"
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline" size="sm"
                    className="w-full h-7 text-xs border-violet-300 text-violet-700 hover:bg-violet-100"
                    onClick={addBalItem}
                    disabled={!balTitle.trim()||!balAmount}
                  >
                    <Plus className="w-3.5 h-3.5 ml-1"/>
                    افزودن
                  </Button>
                </CardContent>
              </Card>

              {/* لیست آیتم‌ها */}
              {balItems.length>0&&(
                <div className="space-y-1">
                  <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg">
                    {balItems.map((item,idx)=>(
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
                            onClick={()=>setBalItems(p=>p.filter((_,i)=>i!==idx))}
                          >
                            <Trash2 className="w-3 h-3"/>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* خلاصه */}
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
                      <span className={totalEquity>=0?'text-blue-700':'text-red-700'}>
                        {formatNum(totalEquity)}﷼
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {balError&&(
                <Alert className="border-red-200 bg-red-50 py-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-600"/>
                  <AlertDescription className="text-xs text-red-700 mr-2">{balError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* ─── مرحله ۳: پایان ─── */}
          {step===3 && (
            <div className="space-y-4 py-4 text-center">
              <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-violet-600"/>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">🎉 فروشگاه آماده‌ است!</h3>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                  راه‌اندازی اولیه تکمیل شد. می‌توانید فاکتور صادر کنید.
                </p>
              </div>
              {/* خلاصه */}
              <div className="text-right space-y-1.5 max-w-xs mx-auto">
                {[
                  {done:fyDone,label:'سال مالی',sub:fyExisting.find((y:any)=>y.isActive)?.name||fyName||'ثبت شد'},
                  {done:whDone||warehouses.length>0,label:'انبار',sub:`${warehouses.length||1} انبار`},
                  {done:balIsPosted,label:'سند افتتاحیه',sub:balIsPosted?`${balItems.length} آیتم ثبت شد`:'می‌توانید بعداً ثبت کنید'},
                ].map((s,i)=>(
                  <div key={i} className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs ${
                    s.done?'border-emerald-200 bg-emerald-50':'border-gray-200 bg-gray-50'
                  }`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      s.done?'bg-emerald-500':'bg-gray-300'
                    }`}>
                      <CheckCircle2 className="w-3.5 h-3.5 text-white"/>
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

        {/* ═══ دکمه‌ها ═══ */}
        <DialogFooter className="flex items-center gap-2 pt-3 border-t border-gray-100">
          {/* قبلی */}
          {step>0&&step<3&&(
            <Button variant="ghost" size="sm" onClick={()=>setStep(s=>s-1)}
              disabled={saving} className="text-xs gap-1 text-gray-500"
            >
              <ChevronLeft className="w-3.5 h-3.5"/>
              قبلی
            </Button>
          )}

          {/* رد کردن */}
          {step<3&&(
            <Button variant="ghost" size="sm" onClick={handleSkip}
              disabled={saving}
              className="text-xs gap-1 text-gray-400 hover:text-gray-600 mr-auto"
            >
              {saving?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<SkipForward className="w-3.5 h-3.5"/>}
              {step===2?'رد کردن (بعداً)':'رد کردن (پیش‌فرض)'}
            </Button>
          )}

          {/* بعدی / پایان */}
          <div className="mr-auto">
            {step<3?(
              <Button
                className="bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1 min-w-[100px]"
                onClick={handleNext}
                disabled={saving}
              >
                {saving&&<Loader2 className="w-3.5 h-3.5 animate-spin"/>}
                {step===0&&fyDone?'ادامه →':step===1&&(warehouses.length>0)?'ادامه →':'ثبت و ادامه →'}
              </Button>
            ):(
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1 min-w-[120px]"
                onClick={handleFinish}
                disabled={saving}
              >
                {saving?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<CheckCircle2 className="w-3.5 h-3.5"/>}
                شروع کار با سیستم
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}