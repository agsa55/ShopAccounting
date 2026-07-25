// src/app/api/categories/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PUT /api/categories/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, parentId } = body

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (parentId !== undefined) updateData.parentId = parentId || null

    const category = await db.client.category.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, data: category })
  } catch (error) {
    console.error('Update category error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در بروزرسانی دسته‌بندی' },
      { status: 500 }
    )
  }
}

// DELETE /api/categories/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    await db.client.category.delete({ where: { id } })

    return NextResponse.json({ 
      success: true, 
      message: 'دسته‌بندی با موفقیت حذف شد' 
    })
  } catch (error) {
    console.error('Delete category error:', error)
    return NextResponse.json(
      { success: false, error: 'خطا در حذف دسته‌بندی' },
      { status: 500 }
    )
  }
}