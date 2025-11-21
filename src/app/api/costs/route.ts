import { NextResponse } from "next/server";
import { getCostStats } from "@/lib/billing";

export const dynamic = 'force-dynamic'; // Disable caching

export async function GET() {
  try {
    const stats = await getCostStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching cost stats:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

