import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { DEFAULT_SITE_CONTENT } from '@/lib/site-content.types'

const DATA_FILE = path.join(process.cwd(), 'data', 'site-content.json')

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return NextResponse.json({ success: true, data: DEFAULT_SITE_CONTENT })
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8')
    return NextResponse.json({ success: true, data: { ...DEFAULT_SITE_CONTENT, ...JSON.parse(raw) } })
  } catch {
    return NextResponse.json({ success: true, data: DEFAULT_SITE_CONTENT })
  }
}