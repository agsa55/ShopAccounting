import type { Metadata, Viewport } from 'next';
import { PWARegister } from '@/components/pwa-register';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://rahgooshasf.ir'),
  
  title: {
    default: 'رهگشا | نرم افزار حسابداری فروشگاهی رایگان و ابری',
    template: '%s | رهگشا - سیستم حسابداری فروشگاهی هوشمند',
  },
  
  description: 'رهگشا سافت | دانلود نرم افزار حسابداری فروشگاهی رایگان، سیستم مدیریت انبار، فاکتور آنلاین، حسابداری ابری تحت وب. شروع رایگان ۳ ماهه بدون نیاز به کارت اعتباری. پشتیبانی از بارکدخوان.',
  
  keywords: [
    // کلمات کلیدی اصلی
    'رهگشا',
    'رهگشا سافت',
    'rahgosha',
    'rahgoshasf',
    
    // نرم افزار حسابداری
    'نرم افزار حسابداری',
    'نرم افزار حسابداری رایگان',
    'نرم افزار حسابداری فروشگاهی',
    'نرم افزار حسابداری ابری',
    'نرم افزار حسابداری تحت وب',
    'نرم افزار حسابداری آنلاین',
    'نرم افزار حسابداری ایرانی',
    'برنامه حسابداری',
    'برنامه حسابداری رایگان',
    'برنامه حسابداری فروشگاهی',
    
    // سیستم حسابداری
    'سیستم حسابداری',
    'سیستم حسابداری فروشگاهی',
    'سیستم حسابداری ابری',
    'سیستم حسابداری آنلاین',
    'سیستم حسابداری تحت وب',
    
    // حسابداری فروشگاهی
    'حسابداری فروشگاهی',
    'حسابداری فروشگاهی رایگان',
    'حسابداری فروشگاهی ابری',
    'حسابداری فروشگاهی آنلاین',
    'حسابداری فروشگاه',
    'حسابداری سوپرمارکت',
    'حسابداری مغازه',
    
    // مدیریت فروشگاه
    'مدیریت فروشگاه',
    'مدیریت فروشگاه آنلاین',
    'سیستم مدیریت فروشگاه',
    'نرم افزار مدیریت فروشگاه',
    
    // انبارداری
    'انبارداری',
    'سیستم انبارداری',
    'نرم افزار انبارداری',
    'مدیریت انبار',
    'انبارداری فروشگاهی',
    'انبارداری رایگان',
    
    // فاکتور
    'فاکتور',
    'فاکتور فروش',
    'فاکتور خرید',
    'فاکتور آنلاین',
    'فاکتور الکترونیکی',
    'صدور فاکتور',
    'فاکتور رسمی',
    
    // اقساط و مشتریان
    'مدیریت اقساط',
    'نرم افزار اقساط',
    'سیستم اقساط',
    'مدیریت مشتریان',
    'CRM فروشگاهی',
    
    // کلمات طولانی (Long-tail)
    'بهترین نرم افزار حسابداری فروشگاهی',
    'نرم افزار حسابداری فروشگاهی رایگان دانلود',
    'دانلود برنامه حسابداری فروشگاهی رایگان',
    'نرم افزار حسابداری فروشگاهی تحت وب رایگان',
    'سیستم حسابداری فروشگاهی ابری ایرانی',
    'نرم افزار صندوق فروشگاهی',
    'نرم افزار صندوق فروشگاه',
    
    // کلمات کلیدی دیگر
    'حسابداری آنلاین',
    'حسابداری ابری',
    'حسابداری رایگان',
    'بارکدخوان فروشگاهی',
    'گزارش مالی',
    'گزارش فروش',
    'مدیریت چک',
    'نرم افزار مالی',
  ],
  
  authors: [{ name: 'رهگشا سافت', url: 'https://rahgooshasf.ir' }],
  creator: 'رهگشا سافت',
  publisher: 'رهگشا سافت',
  category: 'Business Software',
  
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    url: 'https://rahgooshasf.ir',
    siteName: 'رهگشا | نرم افزار حسابداری فروشگاهی',
    title: 'رهگشا | نرم افزار حسابداری فروشگاهی رایگان و ابری',
    description: 'نرم افزار حسابداری فروشگاهی رایگان، سیستم مدیریت انبار و فاکتور آنلاین. شروع رایگان ۳ ماهه بدون نیاز به کارت اعتباری!',
    images: [
      {
        url: '/logo.jpeg',
        width: 512,
        height: 512,
        alt: 'رهگشا - نرم افزار حسابداری فروشگاهی هوشمند',
        type: 'image/jpeg',
      },
    ],
    countryName: 'Iran',
  },
  
  twitter: {
    card: 'summary_large_image',
    title: 'رهگشا | نرم افزار حسابداری فروشگاهی رایگان',
    description: 'سیستم حسابداری فروشگاهی ابری و هوشمند. ۳ ماه رایگان!',
    images: ['/logo.jpeg'],
    site: '@rahgoshasf',
    creator: '@rahgoshasf',
  },
  
  robots: {
    index: true,
    follow: true,
    nocache: false,
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
    languages: {
      'fa-IR': 'https://rahgooshasf.ir',
    },
  },
  
  icons: {
    icon: [
      { url: '/icons/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon.ico', type: 'image/x-icon' },
    ],
    apple: [
      { url: '/icons/icon-180x180.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
  },
  
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || '',
    // یاندکس و بینگ را هم می‌توانید اضافه کنید
    // yandex: 'your-yandex-code',
    // other: { 'msvalidate.01': 'your-bing-code' },
  },
  
  other: {
    // Google Site Verification (اگر از روش meta استفاده می‌کنید)
    'google-site-verification': process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || '',
    
    // زبان و منطقه
    'content-language': 'fa',
    'language': 'Persian',
    'geo.region': 'IR',
    'geo.placename': 'Iran',
    
    // رتبه‌بندی
    'rating': 'General',
    'distribution': 'Global',
    
    // موضوع
    'subject': 'نرم افزار حسابداری فروشگاهی',
    'coverage': 'Worldwide',
    'topic': 'Accounting Software',
    
    // نویسنده
    'designer': 'Rahgosha Soft Team',
    'owner': 'Rahgosha Soft',
    
    // Apple
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'رهگشا',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#7C7BEB' },
    { media: '(prefers-color-scheme: dark)', color: '#1f2937' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  colorScheme: 'light dark',
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
        
        {/* Preconnect برای سرعت */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        
        {/* DNS Prefetch */}
        <link rel="dns-prefetch" href="//www.googletagmanager.com" />
        <link rel="dns-prefetch" href="//www.google-analytics.com" />
        
        {/* Structured Data - Organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'رهگشا سافت',
              alternateName: 'Rahgosha Soft',
              url: 'https://rahgooshasf.ir',
              logo: 'https://rahgooshasf.ir/logo.jpeg',
              description: 'شرکت توسعه دهنده نرم افزار حسابداری فروشگاهی ابری',
              foundingDate: '2024',
              slogan: 'حسابداری هوشمند برای فروشگاه شما',
              contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'customer support',
                availableLanguage: ['Persian', 'English'],
                areaServed: 'IR',
              },
              sameAs: [
                'https://rahgooshasf.ir',
              ],
            }),
          }}
        />
        
        {/* Structured Data - SoftwareApplication */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'رهگشا',
              alternateName: 'Rahgosha',
              description: 'نرم افزار حسابداری فروشگاهی هوشمند و ابری با امکانات مدیریت فروش، مشتریان، اقساط و انبار',
              applicationCategory: 'BusinessApplication',
              applicationSubCategory: 'Accounting Software',
              operatingSystem: 'Web',
              browserRequirements: 'Requires JavaScript',
              url: 'https://rahgooshasf.ir',
              softwareVersion: '9.5.0',
              datePublished: '2024-01-01',
              dateModified: new Date().toISOString().split('T')[0],
              inLanguage: 'fa-IR',
              author: {
                '@type': 'Organization',
                name: 'رهگشا سافت',
                url: 'https://rahgooshasf.ir',
              },
              publisher: {
                '@type': 'Organization',
                name: 'رهگشا سافت',
                url: 'https://rahgooshasf.ir',
              },
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'IRR',
                description: '۳ ماه استفاده رایگان بدون نیاز به کارت اعتباری',
                availability: 'https://schema.org/InStock',
              },
              featureList: [
                'مدیریت فروش و فاکتور',
                'سیستم انبارداری',
                'مدیریت مشتریان (CRM)',
                'مدیریت اقساط',
                'گزارش‌های مالی',
                'پشتیبانی از بارکدخوان',
                'حالت آفلاین',
                'چاپ فاکتور',
              ],
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: '4.8',
                ratingCount: '127',
                bestRating: '5',
                worstRating: '1',
              },
            }),
          }}
        />
        
        {/* Structured Data - WebSite with SearchAction */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'رهگشا',
              alternateName: 'Rahgosha Accounting',
              url: 'https://rahgooshasf.ir',
              inLanguage: 'fa-IR',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://rahgooshasf.ir/search?q={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
        
        {/* Structured Data - FAQ (برای Rich Snippets در گوگل) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: [
                {
                  '@type': 'Question',
                  name: 'نرم افزار حسابداری رهگشا رایگان است؟',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'بله، رهگشا ۳ ماه استفاده کاملاً رایگان ارائه می‌دهد و پس از آن می‌توانید با پرداخت هزینه مقرون به صرفه به استفاده ادامه دهید.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'آیا نرم افزار رهگشا تحت وب است؟',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'بله، رهگشا یک نرم افزار حسابداری ابری و تحت وب است که از هر دستگاه و هر مکانی با دسترسی به اینترنت قابل استفاده است.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'رهگشا از بارکدخوان پشتیبانی می‌کند؟',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'بله، سیستم رهگشا به طور کامل از انواع بارکدخوان‌ها پشتیبانی می‌کند و می‌توانید محصولات را با اسکن بارکد به سرعت به فاکتور اضافه کنید.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'آیا می‌توانم در حالت آفلاین از رهگشا استفاده کنم؟',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'بله، رهگشا دارای حالت آفلاین پیشرفته است که فاکتورها را به صورت محلی ذخیره می‌کند و پس از اتصال اینترنت به طور خودکار با سرور همگام‌سازی می‌شود.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'چگونه می‌توانم با رهگشا شروع کنم؟',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'کافی است روی دکمه "شروع کنید" کلیک کرده و در کمتر از ۵ دقیقه ثبت نام کنید. نیازی به کارت اعتباری نیست و ۳ ماه استفاده رایگان خواهید داشت.',
                  },
                },
              ],
            }),
          }}
        />
        
        {/* Structured Data - BreadcrumbList */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: 'خانه',
                  item: 'https://rahgooshasf.ir',
                },
              ],
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