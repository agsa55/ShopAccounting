import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const results: string[] = [];

    // Test 1: Can we access prisma.storeUser?
    results.push("Test 1: prisma.storeUser exists = " + !!prisma.storeUser);

    // Test 2: Find cashier1
    const user = await prisma.storeUser.findFirst({
      where: { username: "cashier1", isActive: true }
    });
    results.push("Test 2: cashier1 found = " + !!user);

    if (user) {
      results.push("  role: " + user.role);
      results.push("  isActive: " + user.isActive);
      results.push("  hasPassword: " + !!user.password);
      results.push("  passwordPrefix: " + (user.password ? user.password.substring(0, 10) : "N/A"));

      // Test 3: bcrypt compare
      const valid = await bcrypt.compare("123456", user.password);
      results.push("Test 3: bcrypt compare = " + valid);

      // Test 4: Also try admin
      const admin = await prisma.storeUser.findFirst({
        where: { username: "admin", isActive: true }
      });
      results.push("Test 4: admin found = " + !!admin);
      if (admin) {
        results.push("  role: " + admin.role);
        results.push("  passwordPrefix: " + (admin.password ? admin.password.substring(0, 10) : "N/A"));
        const adminValid = await bcrypt.compare("123456", admin.password);
        results.push("  bcrypt compare(123456) = " + adminValid);
      }
    }

    // Test 5: List all users
    const allUsers = await prisma.storeUser.findMany({
      select: { username: true, role: true, isActive: true }
    });
    results.push("Test 5: All users: " + JSON.stringify(allUsers));

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack?.split("\n").slice(0, 5)
    }, { status: 500 });
  }
}
