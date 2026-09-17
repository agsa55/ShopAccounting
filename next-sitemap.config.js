/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://rahgooshasf.ir',
  generateRobotsTxt: true,
  changefreq: 'weekly',
  priority: 0.7,
  sitemapSize: 5000,
  
  // صفحاتی که نباید در sitemap باشند
  exclude: [
    '/admin/*',
    '/api/*',
    '/portal/*',
    '/portal-view/*',
    '/payment-result/*',
    '/subscription/*',
    '/dashboard',
  ],
  
  // تنظیمات robots.txt
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/portal/',
          '/portal-view/',
          '/payment-result/',
          '/subscription/',
          '/dashboard',
          '/_next/',
          '/auth/',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
      },
    ],
    additionalSitemaps: [
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://rahgooshasf.ir'}/server-sitemap.xml`,
    ],
  },
  
  // تنظیم اولویت و فرکانس برای صفحات مختلف
  transform: async (config, path) => {
    // صفحات با اولویت بالا
    const highPriorityPages = ['/', '/about', '/contact', '/pricing', '/features']
    const isHighPriority = highPriorityPages.includes(path)
    
    // صفحات بلاگ با اولویت متوسط
    const isBlogPage = path.startsWith('/blog')
    
    // صفحات احراز هویت با اولویت پایین
    const isAuthPage = ['/login', '/register', '/forgot-password'].includes(path)
    
    let priority = 0.7
    let changefreq = 'weekly'
    
    if (isHighPriority) {
      priority = 1.0
      changefreq = 'daily'
    } else if (isBlogPage) {
      priority = 0.8
      changefreq = 'weekly'
    } else if (isAuthPage) {
      priority = 0.3
      changefreq = 'monthly'
    }
    
    return {
      loc: path,
      changefreq,
      priority,
      lastmod: new Date().toISOString(),
    }
  },
}