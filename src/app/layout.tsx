import type { Metadata, Viewport } from 'next';
import { PWARegister } from '@/components/pwa-register';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://rahgooshasf.ir'),
  
  title: {
    default: 'رهگشا | سیستم حسابداری فروشگاهی هوشمند',
    template: '%s | رهگشا',
  },
  
  description: 'رهگشا، سیستم حسابداری فروشگاهی ابری و هوشمند. مدیریت فروش، مشتریان، اقساط، انبار و گزارش‌های مالی در یک پلتفرم یکپارچه. ۳ ماه استفاده رایگان!',
  
  keywords: [
    'حسابداری فروشگاهی',
    'نرم افزار حسابداری',
    'حسابداری ابری',
    'سیستم حسابداری',
    'مدیریت فروشگاه',
    'رهگشا',
    'فاکتور فروش',
    'انبارداری',
    'حسابداری آنلاین',
    'نرم افزار فروشگاهی',
    'حسابداری رایگان',
    'مدیریت اقساط',
  ],
  
  authors: [{ name: 'رهگشا', url: 'https://rahgooshasf.ir' }],
  creator: 'رهگشا',
  publisher: 'رهگشا',
  
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    url: 'https://rahgooshasf.ir',
    siteName: 'رهگشا',
    title: 'رهگشا | سیستم حسابداری فروشگاهی هوشمند',
    description: 'مدیریت فروش، مشتریان، اقساط و حسابداری در یک پلتفرم یکپارچه. ۳ ماه استفاده رایگان!',
    images: [
      {
        url: '/logo.jpeg',
        width: 512,
        height: 512,
        alt: 'رهگشا - سیستم حسابداری فروشگاهی',
      },
    ],
  },
  
  twitter: {
    card: 'summary_large_image',
    title: 'رهگشا | سیستم حسابداری فروشگاهی هوشمند',
    description: 'مدیریت فروش، مشتریان، اقساط و حسابداری در یک پلتفرم یکپارچه',
    images: ['/logo.jpeg'],
  },
  
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  
  manifest: '/manifest.json',
  
  alternates: {
    canonical: 'https://rahgooshasf.ir',
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
  
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || '',
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
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="رهگشا" />
        <link rel="apple-touch-icon" href="/icons/icon-180x180.png" />
        <link rel="mask-icon" href="/icons/icon-192x192.png" color="#7C7BEB" />
        
        <meta name="msapplication-TileColor" content="#7C7BEB" />
        <meta name="msapplication-TileImage" content="/icons/icon-192x192.png" />
        
        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'رهگشا',
              description: 'سیستم حسابداری فروشگاهی هوشمند و ابری',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              url: 'https://rahgooshasf.ir',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'IRR',
                description: '۳ ماه استفاده رایگان',
              },
            }),
          }}
        />
      </head>
      <body>
        <PWARegister />
        {children}
      </body>
    </html>
  );
}