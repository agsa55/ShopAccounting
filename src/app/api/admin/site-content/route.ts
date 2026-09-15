import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { DEFAULT_SITE_CONTENT, type SiteContent } from '@/lib/site-content.types'

const DATA_DIR = path.join(process.cwd(), 'data')
const DATA_FILE = path.join(DATA_DIR, 'site-content.json')

export const dynamic = 'force-dynamic'

function readContent(): SiteContent {
  try {
    if (!fs.existsSync(DATA_FILE)) return DEFAULT_SITE_CONTENT
    const raw = fs.readFileSync(DATA_FILE, 'utf-8')
    return { ...DEFAULT_SITE_CONTENT, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SITE_CONTENT
  }
}

function writeContent(content: SiteContent): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(content, null, 2), 'utf-8')
}

export async function GET() {
  return NextResponse.json({ success: true, data: readContent() })
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const updated: SiteContent = { ...readContent(), ...body, updatedAt: new Date().toISOString() }
    writeContent(updated)
    return NextResponse.json({ success: true, data: updated })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}