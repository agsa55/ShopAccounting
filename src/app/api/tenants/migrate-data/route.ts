import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return NextResponse.json({ success: true, message: 'Data migration is not required in the single database architecture.' });
}