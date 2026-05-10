import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateCounterStrikeDiscipline } from "@/lib/disciplines";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET() {
  try {
    const discipline = await getOrCreateCounterStrikeDiscipline();
    return NextResponse.json({ platformId: discipline.platformId || "" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch discipline" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const { platformId } = await req.json();
    const discipline = await getOrCreateCounterStrikeDiscipline();
    
    await prisma.discipline.update({
      where: { id: discipline.id },
      data: { platformId: platformId || null }
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update discipline" }, { status: 500 });
  }
}
