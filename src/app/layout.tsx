import type { Metadata } from 'next'
import './globals.css'
import { FetchInterceptorLoader } from '@/components/fetch-interceptor-loader'
// ★★★ v5.1 (Phase 4): نوار هشدار انقضای اشتراک — فقط در صفحات داخلی فعال می‌شود
import { SubscriptionWarningBanner } from '@/components/subscription/subscription-warning-banner'

export const metadata: Metadata = {
  title: 'حسابداری فروشگاهی | ShopAccounting',
  description: 'سیستم حسابداری فروشگاهی چندمستاجری',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://cdn.jsdelivr.net"
          crossOrigin="anonymous"
        />
        <link
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <FetchInterceptorLoader />
        {/* ★★★ v5.1: نوار هشدار بالای همه صفحات (وقتی توکن موجود باشد فعال می‌شود) */}
        <SubscriptionWarningBanner />
        {children}
      </body>
    </html>
  )
}
