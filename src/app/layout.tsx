// src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { PWARegister } from '@/components/pwa-register';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShopAccounting — حسابداری فروشگاهی',
  description: 'پلتفرم SaaS حسابداری فروشگاهی چندمستاجره',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'حسابداری',
  },
  icons: {
    icon: [
      { url: '/icons/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-180x180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#7C7BEB',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // ✅ فقط این خط تغییر کرده است: افزودن data-scroll-behavior="smooth"
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth">
      <head>
        {/* Apple PWA meta tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="حسابداری" />
        <link rel="apple-touch-icon" href="/icons/icon-180x180.png" />
        <link rel="mask-icon" href="/icons/icon-192x192.png" color="#7C7BEB" />
        
        {/* Microsoft */}
        <meta name="msapplication-TileColor" content="#7C7BEB" />
        <meta name="msapplication-TileImage" content="/icons/icon-192x192.png" />
      </head>
      <body>
        <PWARegister />
        {children}
      </body>
    </html>
  );
}