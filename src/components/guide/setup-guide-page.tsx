'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Download,
  FolderOpen,
  Terminal,
  Play,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Monitor,
  Globe,
  Package,
  Settings,
  FileCode2,
  HardDrive,
  ExternalLink,
} from 'lucide-react'

interface StepProps {
  number: number
  title: string
  children: React.ReactNode
  isOpen: boolean
  onToggle: () => void
}

function Step({ number, title, children, isOpen, onToggle }: StepProps) {
  return (
    <Card className="border-r-4 border-r-emerald-500 mb-4">
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-lg">
              {number}
            </div>
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          {isOpen ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {isOpen && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  )
}

export default function SetupGuidePage() {
  const [openStep, setOpenStep] = useState(0)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const response = await fetch('/api/download')
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'shopaccounting-source.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download error:', error)
      alert('خطا در دانلود فایل. لطفاً دوباره تلاش کنید.')
    } finally {
      setDownloading(false)
    }
  }

  const toggleStep = (index: number) => {
    setOpenStep(openStep === index ? -1 : index)
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <div className="bg-gradient-to-l from-emerald-600 to-teal-700 text-white py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Package className="h-10 w-10" />
            <h1 className="text-3xl font-bold">راهنمای نصب و راه‌اندازی</h1>
          </div>
          <p className="text-emerald-100 text-lg">
            سیستم حسابداری فروشگاهی - راهنمای قدم‌به‌قدم برای دانلود، نصب و اجرای پروژه
          </p>
          <div className="flex gap-2 mt-4">
            <Badge variant="secondary" className="bg-white/20 text-white border-0">
              Next.js 16
            </Badge>
            <Badge variant="secondary" className="bg-white/20 text-white border-0">
              TypeScript
            </Badge>
            <Badge variant="secondary" className="bg-white/20 text-white border-0">
              Prisma + SQLite
            </Badge>
            <Badge variant="secondary" className="bg-white/20 text-white border-0">
              Tailwind CSS
            </Badge>
          </div>
        </div>
      </div>

      {/* Download Section */}
      <div className="max-w-4xl mx-auto px-4 -mt-6">
        <Card className="border-2 border-emerald-200 shadow-lg bg-gradient-to-l from-emerald-50 to-teal-50">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center">
                  <Download className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">دانلود سورس کد پروژه</h2>
                  <p className="text-muted-foreground">
                    فایل ZIP شامل تمام کدهای پروژه (بدون node_modules)
                  </p>
                </div>
              </div>
              <Button
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-6 text-lg"
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading ? (
                  <>
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full ml-2" />
                    در حال آماده‌سازی...
                  </>
                ) : (
                  <>
                    <Download className="h-5 w-5 ml-2" />
                    دانلود فایل ZIP پروژه
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Steps */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Settings className="h-6 w-6 text-emerald-600" />
          مراحل نصب و راه‌اندازی
        </h2>

        {/* Step 1: Download */}
        <Step number={1} title="دانلود و استخراج فایل‌ها" isOpen={openStep === 0} onToggle={() => toggleStep(0)}>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="font-semibold text-blue-800">📌 مهم:</p>
              <p className="text-blue-700">
                ابتدا روی دکمه &quot;دانلود فایل ZIP پروژه&quot; در بالا کلیک کنید. یک فایل ZIP با نام
                &quot;shopaccounting-source.zip&quot; دانلود می‌شود.
              </p>
            </div>

            <h4 className="font-semibold">روش استخراج فایل ZIP:</h4>
            <ol className="list-decimal list-inside space-y-2 mr-4">
              <li>
                فایل دانلود شده (<strong>shopaccounting-source.zip</strong>) را پیدا کنید - معمولاً در پوشه
                &quot;Downloads&quot; یا &quot;دانلودها&quot; است
              </li>
              <li>
                روی فایل ZIP <strong>راست‌کلیک</strong> کنید
              </li>
              <li>
                گزینه <strong>&quot;Extract All...&quot;</strong> یا <strong>&quot;استخراج همه&quot;</strong> را انتخاب کنید
              </li>
              <li>
                یک پوشه مقصد انتخاب کنید (مثلاً{' '}
                <code className="bg-muted px-2 py-1 rounded text-sm">C:\Projects\shopaccounting</code>)
              </li>
              <li>
                روی <strong>&quot;Extract&quot;</strong> کلیک کنید
              </li>
            </ol>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="font-semibold text-yellow-800">⚠️ توجه:</p>
              <p className="text-yellow-700">
                حتماً فایل ZIP را Extract کنید. اگر فقط روی فایل ZIP دو بار کلیک کنید، فقط یک فایل
                می‌بینید. باید آن را استخراج کنید تا تمام فایل‌های پروژه نمایان شوند.
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4 font-mono text-sm">
              <p>پس از استخراج، ساختار پوشه‌ها باید به این شکل باشد:</p>
              <pre className="mt-2 text-xs overflow-x-auto">
{`shopaccounting/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── auth/
│   │       ├── products/
│   │       ├── customers/
│   │       ├── invoices/
│   │       └── ...
│   ├── components/
│   │   ├── landing/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── pos/
│   │   └── ...
│   ├── lib/
│   └── hooks/
├── prisma/
│   └── schema.prisma
├── public/
├── package.json
├── tsconfig.json
├── next.config.ts
└── tailwind.config.ts`}
              </pre>
            </div>
          </div>
        </Step>

        {/* Step 2: Install Node.js */}
        <Step number={2} title="نصب Node.js و ابزارهای لازم" isOpen={openStep === 1} onToggle={() => toggleStep(1)}>
          <div className="space-y-4">
            <p>
              برای اجرای پروژه، ابتدا باید <strong>Node.js</strong> را روی کامپیوتر خود نصب کنید.
            </p>

            <h4 className="font-semibold">نصب Node.js:</h4>
            <ol className="list-decimal list-inside space-y-2 mr-4">
              <li>
                به وبسایت{' '}
                <a
                  href="https://nodejs.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:underline inline-flex items-center gap-1"
                >
                  nodejs.org <ExternalLink className="h-3 w-3" />
                </a>
                بروید
              </li>
              <li>
                نسخه <strong>LTS</strong> (نسخه پایدار) را دانلود کنید
              </li>
              <li>
                فایل نصب را اجرا کنید و تمام مراحل را با تنظیمات پیش‌فرض تایید کنید
              </li>
              <li>
                برای اطمینان از نصب صحیح، Command Prompt را باز کنید و دستور زیر را تایپ کنید:
              </li>
            </ol>

            <div className="bg-slate-900 text-green-400 rounded-lg p-4 font-mono text-sm">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-4 w-4" />
                <span>Command Prompt</span>
              </div>
              <p>node --version</p>
              <p className="text-slate-400 mt-1"># باید نسخه‌ای مثل v20.x.x یا بالاتر نمایش دهد</p>
              <p className="mt-2">npm --version</p>
              <p className="text-slate-400 mt-1"># باید نسخه‌ای مثل 10.x.x یا بالاتر نمایش دهد</p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="font-semibold text-green-800">✅ اگر نسخه‌ها نمایش داده شد:</p>
              <p className="text-green-700">Node.js با موفقیت نصب شده. به مرحله بعد بروید.</p>
            </div>
          </div>
        </Step>

        {/* Step 3: Install VS Code */}
        <Step number={3} title="نصب VS Code (محیط برنامه‌نویسی)" isOpen={openStep === 2} onToggle={() => toggleStep(2)}>
          <div className="space-y-4">
            <p>
              <strong>Visual Studio Code (VS Code)</strong> یک محیط برنامه‌نویسی رایگان و سبک است. با
              Visual Studio 2022 متفاوت است.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="font-semibold text-blue-800">📌 تفاوت VS Code و Visual Studio 2022:</p>
              <ul className="text-blue-700 list-disc list-inside mr-4 mt-2 space-y-1">
                <li><strong>VS Code</strong> — سبک، رایگان، برای پروژه‌های Next.js/React عالی است</li>
                <li><strong>Visual Studio 2022</strong> — سنگین، برای پروژه‌های .NET/C# مناسب است</li>
              </ul>
              <p className="text-blue-700 mt-2">
                پروژه ما با <strong>Next.js</strong> نوشته شده، پس باید از <strong>VS Code</strong> استفاده کنید.
              </p>
            </div>

            <h4 className="font-semibold">نصب VS Code:</h4>
            <ol className="list-decimal list-inside space-y-2 mr-4">
              <li>
                به وبسایت{' '}
                <a
                  href="https://code.visualstudio.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:underline inline-flex items-center gap-1"
                >
                  code.visualstudio.com <ExternalLink className="h-3 w-3" />
                </a>
                بروید
              </li>
              <li>
                روی <strong>&quot;Download for Windows&quot;</strong> کلیک کنید
              </li>
              <li>
                فایل نصب را اجرا کنید
              </li>
              <li>
                در مراحل نصب، تمام گزینه‌های پیش‌فرض را تایید کنید
              </li>
              <li>
                حتماً گزینه <strong>&quot;Add to PATH&quot;</strong> تیک خورده باشد
              </li>
            </ol>

            <h4 className="font-semibold mt-4">پس از نصب VS Code:</h4>
            <ol className="list-decimal list-inside space-y-2 mr-4">
              <li>
                VS Code را باز کنید
              </li>
              <li>
                از منوی <strong>File</strong> گزینه <strong>&quot;Open Folder...&quot;</strong> را انتخاب کنید
              </li>
              <li>
                پوشه استخراج شده پروژه را انتخاب کنید (پوشه‌ای که فایل <code className="bg-muted px-1 rounded">package.json</code> در آن است)
              </li>
              <li>
                حالا تمام فایل‌های پروژه در سایدبار سمت چپ VS Code نمایش داده می‌شود
              </li>
            </ol>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-semibold">💡 نکته:</p>
              <p>
                اگر VS Code را نصب دارید، می‌توانید مستقیماً از Command Prompt پوشه پروژه را باز کنید:
              </p>
              <div className="bg-slate-900 text-green-400 rounded-lg p-3 font-mono text-sm mt-2">
                <p>cd C:\Projects\shopaccounting</p>
                <p>code .</p>
              </div>
            </div>
          </div>
        </Step>

        {/* Step 4: Install Dependencies */}
        <Step number={4} title="نصب کتابخانه‌ها و وابستگی‌ها" isOpen={openStep === 3} onToggle={() => toggleStep(3)}>
          <div className="space-y-4">
            <p>
              پروژه Next.js از کتابخانه‌های مختلفی استفاده می‌کند که باید نصب شوند. این کتابخانه‌ها در فایل{' '}
              <code className="bg-muted px-1 rounded">package.json</code> تعریف شده‌اند.
            </p>

            <h4 className="font-semibold">نحوه نصب:</h4>
            <ol className="list-decimal list-inside space-y-2 mr-4">
              <li>
                در VS Code، منوی <strong>Terminal</strong> را از نوار بالایی انتخاب کنید
              </li>
              <li>
                گزینه <strong>&quot;New Terminal&quot;</strong> را انتخاب کنید
              </li>
              <li>
                یک ترمینال در پایین صفحه باز می‌شود
              </li>
              <li>
                دستور زیر را در ترمینال تایپ کرده و Enter بزنید:
              </li>
            </ol>

            <div className="bg-slate-900 text-green-400 rounded-lg p-4 font-mono text-sm">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-4 w-4" />
                <span>Terminal in VS Code</span>
              </div>
              <p>npm install</p>
              <p className="text-slate-400 mt-2"># این فرآیند ممکن است ۲ تا ۵ دقیقه طول بکشد</p>
              <p className="text-slate-400"># صبر کنید تا نصب تمام شود</p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="font-semibold text-yellow-800">⚠️ نکته مهم:</p>
              <ul className="text-yellow-700 list-disc list-inside mr-4 space-y-1">
                <li>مطمئن شوید در ترمینال، مسیر پوشه پروژه هستید (پوشه‌ای که package.json در آن است)</li>
                <li>اگر خطا گرفتید، ابتدا دستور <code className="bg-muted px-1 rounded">cd C:\Projects\shopaccounting</code> را بزنید</li>
                <li>پس از نصب، پوشه <code className="bg-muted px-1 rounded">node_modules</code> ایجاد می‌شود</li>
              </ul>
            </div>
          </div>
        </Step>

        {/* Step 5: Setup Database */}
        <Step number={5} title="راه‌اندازی پایگاه داده" isOpen={openStep === 4} onToggle={() => toggleStep(4)}>
          <div className="space-y-4">
            <p>
              این پروژه از <strong>SQLite</strong> استفاده می‌کند که نیازی به نصب SQL Server ندارد.
              فایل دیتابیس به صورت خودکار ایجاد می‌شود.
            </p>

            <h4 className="font-semibold">راه‌اندازی دیتابیس:</h4>
            <p>دستورات زیر را در ترمینال VS Code اجرا کنید:</p>

            <div className="bg-slate-900 text-green-400 rounded-lg p-4 font-mono text-sm space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-4 w-4" />
                <span>Terminal in VS Code</span>
              </div>
              <p>npx prisma generate</p>
              <p className="text-slate-400"># تولید Prisma Client</p>
              <p className="mt-2">npx prisma db push</p>
              <p className="text-slate-400"># ایجاد جداول دیتابیس</p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="font-semibold text-green-800">✅ مزیت SQLite:</p>
              <ul className="text-green-700 list-disc list-inside mr-4 space-y-1">
                <li>نیازی به نصب SQL Server نیست</li>
                <li>فایل دیتابیس در پوشه <code className="bg-muted px-1 rounded">db/custom.db</code> ذخیره می‌شود</li>
                <li>به راحتی قابل انتقال و بکاپ‌گیری است</li>
                <li>برای فروشگاه‌های کوچک و متوسط کاملاً مناسب است</li>
              </ul>
            </div>
          </div>
        </Step>

        {/* Step 6: Run the project */}
        <Step number={6} title="اجرای پروژه" isOpen={openStep === 5} onToggle={() => toggleStep(5)}>
          <div className="space-y-4">
            <p>
              حالا می‌توانید پروژه را اجرا کنید!
            </p>

            <h4 className="font-semibold">اجرای سرور توسعه:</h4>
            <p>دستور زیر را در ترمینال VS Code اجرا کنید:</p>

            <div className="bg-slate-900 text-green-400 rounded-lg p-4 font-mono text-sm">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="h-4 w-4" />
                <span>Terminal in VS Code</span>
              </div>
              <p>npm run dev</p>
              <p className="text-slate-400 mt-2"># سرور در آدرس http://localhost:3000 اجرا می‌شود</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="font-semibold text-blue-800">📌 پس از اجرا:</p>
              <ol className="text-blue-700 list-decimal list-inside mr-4 space-y-1">
                <li>مرورگر خود را باز کنید</li>
                <li>آدرس <code className="bg-muted px-1 rounded">http://localhost:3000</code> را وارد کنید</li>
                <li>صفحه لندینگ سیستم حسابداری فروشگاهی نمایش داده می‌شود</li>
                <li>می‌توانید ثبت‌نام کنید و از سیستم استفاده کنید</li>
              </ol>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <p className="font-semibold">💡 برای توقف سرور:</p>
              <p>
                در ترمینال VS Code کلیدهای <kbd className="bg-white border rounded px-2 py-0.5">Ctrl + C</kbd> را بزنید.
              </p>
            </div>
          </div>
        </Step>

        {/* Step 7: Deploy to Hosting */}
        <Step number={7} title="انتشار روی هاست (Deploy)" isOpen={openStep === 6} onToggle={() => toggleStep(6)}>
          <div className="space-y-4">
            <p>
              برای قرار دادن وبسایت روی هاست و در دسترس عموم، گزینه‌های زیر را دارید:
            </p>

            <h4 className="font-semibold flex items-center gap-2">
              <Globe className="h-5 w-5 text-emerald-600" />
              گزینه ۱: هاست Node.js (پیشنهادی)
            </h4>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mr-4">
              <p className="text-emerald-700">
                هاست‌هایی که Node.js پشتیبانی می‌کنند، بهترین گزینه هستند. مثال‌ها:
              </p>
              <ul className="text-emerald-700 list-disc list-inside mr-4 mt-2 space-y-1">
                <li><strong>Hostiran</strong> — هاست Node.js ایرانی</li>
                <li><strong>Liara</strong> — پلتفرم ابری ایرانی</li>
                <li><strong>Vercel</strong> — رایگان برای پروژه‌های Next.js (پیشنهاد ویژه)</li>
                <li><strong>Railway</strong> — ساده و مقرون‌به‌صرفه</li>
              </ul>
            </div>

            <h4 className="font-semibold flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-blue-600" />
              گزینه ۲: سرور مجازی (VPS)
            </h4>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mr-4">
              <p className="text-blue-700">
                اگر VPS دارید، می‌توانید پروژه را مستقیماً روی سرور نصب و اجرا کنید.
              </p>
            </div>

            <h4 className="font-semibold flex items-center gap-2">
              <Monitor className="h-5 w-5 text-purple-600" />
              گزینه ۳: هاست ویندوز با Plesk
            </h4>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mr-4">
              <p className="text-purple-700">
                هاست ویندوز Plesk معمولاً Node.js را پشتیبانی می‌کند. باید از پنل Plesk بخش Node.js را فعال کنید.
              </p>
            </div>

            <h4 className="font-semibold mt-4">ساده‌ترین روش: Vercel (رایگان)</h4>
            <ol className="list-decimal list-inside space-y-2 mr-4">
              <li>
                به{' '}
                <a
                  href="https://vercel.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:underline inline-flex items-center gap-1"
                >
                  vercel.com <ExternalLink className="h-3 w-3" />
                </a>
                بروید و ثبت‌نام کنید
              </li>
              <li>پروژه را در GitHub آپلود کنید</li>
              <li>در Vercel، پروژه GitHub را وارد کنید</li>
              <li>به صورت خودکار Build و Deploy می‌شود</li>
              <li>یک آدرس رایگان مثل <code className="bg-muted px-1 rounded">shopaccounting.vercel.app</code> دریافت می‌کنید</li>
            </ol>
          </div>
        </Step>
      </div>

      {/* Quick Reference */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode2 className="h-5 w-5 text-emerald-600" />
              خلاصه دستورات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-900 text-green-400 rounded-lg p-4 font-mono text-sm space-y-3">
              <p className="text-slate-400"># ۱. وارد پوشه پروژه شوید</p>
              <p>cd C:\Projects\shopaccounting</p>
              <p className="text-slate-400 mt-3"># ۲. نصب کتابخانه‌ها</p>
              <p>npm install</p>
              <p className="text-slate-400 mt-3"># ۳. راه‌اندازی دیتابیس</p>
              <p>npx prisma generate</p>
              <p>npx prisma db push</p>
              <p className="text-slate-400 mt-3"># ۴. اجرای پروژه</p>
              <p>npm run dev</p>
              <p className="text-slate-400 mt-3"># ۵. باز کردن مرورگر</p>
              <p className="text-cyan-400"># http://localhost:3000</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="bg-slate-100 border-t py-6 px-4">
        <div className="max-w-4xl mx-auto text-center text-muted-foreground">
          <p className="text-sm">
            سیستم حسابداری فروشگاهی | ساخته شده با Next.js 16، TypeScript، Prisma و Tailwind CSS
          </p>
          <p className="text-xs mt-2">
            برای سوالات و پشتیبانی، با توسعه‌دهنده تماس بگیرید
          </p>
        </div>
      </div>
    </div>
  )
}
