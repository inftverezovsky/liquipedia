import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateDota2Discipline } from "@/lib/disciplines";

export async function GET() {
  try {
    const discipline = await getOrCreateDota2Discipline();
    return NextResponse.json({ platformId: discipline.platformId || "" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch discipline" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { platformId } = await req.json();
    const discipline = await getOrCreateDota2Discipline();
    
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
