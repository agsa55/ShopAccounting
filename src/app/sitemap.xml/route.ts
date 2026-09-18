import { NextResponse } from 'next/server'

export async function GET() {
  const baseUrl = 'https://rahgooshasf.ir'
  
  const staticPages = [
    { url: '/', changefreq: 'daily', priority: 1.0 },
    { url: '/auth/login', changefreq: 'monthly', priority: 0.7 },
    { url: '/auth/register', changefreq: 'monthly', priority: 0.7 },
    { url: '/offline', changefreq: 'monthly', priority: 0.3 },
    { url: '/renewal', changefreq: 'monthly', priority: 0.5 },
  ]

  const today = new Date().toISOString().split('T')[0]

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages
  .map(
    (page) => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`

  return new NextResponse(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}