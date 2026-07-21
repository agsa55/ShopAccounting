'use client'

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { setAccessToken } from '@/lib/auth-client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { ShoppingCart, Eye, EyeOff, Loader2, ArrowRight, Smartphone, KeyRound } from 'lucide-react'

export default function LoginForm() {
  const { setCurrentView, login } = useStore()
  const [activeTab, setActiveTab] = useState('password')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Password tab state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // OTP tab state
  const [mobile, setMobile] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpValue, setOtpValue] = useState('')
  const [otpSending, setOtpSending] = useState(false)
  const [otpError, setOtpError] = useState('')

  const handlePasswordLogin = async () => {
    if (!username || !password) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ✅ ارسال username بجای email (بر اساس فیلدهای واقعی Prisma)
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (data.success) {
        // ✅ ذخیره Access Token در memory
        if (data.data.token && data.data.expiresIn) {
          setAccessToken(data.data.token, data.data.expiresIn)
        }

        // بروزرسانی استور با اطلاعات کاربر
        login(data.data.user)
      } else {
        setError(data.error || 'خطا در ورود')
      }
    } catch (err) {
      console.error('Login fetch error:', err)
      setError('خطا در ارتباط با سرور')
    } finally {
      setLoading(false)
    }
  }

  const handleRequestOTP = async () => {
    if (!mobile || mobile.length < 11) return
    setOtpSending(true)
    setOtpError('')

    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, purpose: 'Login' }),
      })
      const data = await res.json()

      if (data.success) {
        setOtpSent(true)
      } else {
        setOtpError(data.error || 'خطا در ارسال کد')
      }
    } catch {
      setOtpError('خطا در ارتباط با سرور')
    } finally {
      setOtpSending(false)
    }
  }

  const handleVerifyOTP = async () => {
    if (otpValue.length !== 4) return
    setLoading(true)
    setOtpError('')

    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, code: otpValue, purpose: 'Login' }),
      })
      const data = await res.json()

      if (data.success) {
        if (data.data.token && data.data.expiresIn) {
          setAccessToken(data.data.token, data.data.expiresIn)
        }
        login(data.data.user)
      } else {
        setOtpError(data.error || 'کد تایید اشتباه است')
      }
    } catch {
      setOtpError('خطا در ارتباط با سرور')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-bl from-emerald-50 via-white to-teal-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">ShopAccounting</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ورود به حساب کاربری</h1>
          <p className="text-sm text-gray-500 mt-1">به پلتفرم حسابداری فروشگاهی خوش آمدید</p>
        </div>

        <Card className="border-gray-200 shadow-lg">
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setError(''); setOtpError('') }} className="w-full">
              <TabsList className="w-full mb-6">
                <TabsTrigger value="password" className="flex-1 gap-1.5">
                  <KeyRound className="w-4 h-4" />
                  رمز عبور
                </TabsTrigger>
                <TabsTrigger value="otp" className="flex-1 gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  OTP پیامکی
                </TabsTrigger>
              </TabsList>

              {/* Password Tab */}
              <TabsContent value="password" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">نام کاربری</Label>
                  <Input
                    id="username"
                    placeholder="نام کاربری خود را وارد کنید"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="text-right"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">رمز عبور</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="رمز عبور خود را وارد کنید"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="text-left pl-10"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-500 text-center">{error}</p>
                )}

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11"
                  onClick={handlePasswordLogin}
                  disabled={!username || !password || loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'ورود'
                  )}
                </Button>
                <p className="text-xs text-center text-gray-400">
                  نام کاربری: admin · رمز عبور: admin123
                </p>
              </TabsContent>

              {/* OTP Tab */}
              <TabsContent value="otp" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mobile">شماره موبایل</Label>
                  <Input
                    id="mobile"
                    type="tel"
                    placeholder="۰۹۱۲۱۲۳۴۵۶۷"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    className="text-left"
                    dir="ltr"
                    maxLength={11}
                    disabled={otpSent}
                  />
                </div>

                {otpError && (
                  <p className="text-sm text-red-500 text-center">{otpError}</p>
                )}

                {!otpSent ? (
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11"
                    onClick={handleRequestOTP}
                    disabled={!mobile || mobile.length < 11 || otpSending}
                  >
                    {otpSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'ارسال کد تایید'
                    )}
                  </Button>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>کد تایید پیامکی</Label>
                      <div className="flex justify-center" dir="ltr">
                        <InputOTP
                          maxLength={4}
                          value={otpValue}
                          onChange={setOtpValue}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                      <p className="text-xs text-center text-gray-500">
                        کد ۴ رقمی ارسال شده به شماره {mobile} را وارد کنید
                      </p>
                    </div>
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11"
                      onClick={handleVerifyOTP}
                      disabled={otpValue.length !== 4 || loading}
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'تایید و ورود'
                      )}
                    </Button>
                    <div className="text-center">
                      <button
                        type="button"
                        className="text-sm text-emerald-600 hover:text-emerald-700"
                        onClick={() => {
                          setOtpSent(false)
                          setOtpValue('')
                        }}
                      >
                        تغییر شماره موبایل
                      </button>
                      <span className="text-gray-300 mx-2">|</span>
                      <button
                        type="button"
                        className="text-sm text-emerald-600 hover:text-emerald-700"
                        onClick={handleRequestOTP}
                      >
                        ارسال مجدد کد
                      </button>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Register link */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            حساب کاربری ندارید؟{' '}
            <button
              type="button"
              className="text-emerald-600 hover:text-emerald-700 font-semibold"
              onClick={() => setCurrentView('register')}
            >
              ثبت‌نام کنید
            </button>
          </p>
        </div>

        {/* Back to landing */}
        <div className="text-center mt-3">
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-gray-600 inline-flex items-center gap-1"
            onClick={() => setCurrentView('landing')}
          >
            <ArrowRight className="w-3 h-3" />
            بازگشت به صفحه اصلی
          </button>
        </div>
      </div>
    </div>
  )
}
