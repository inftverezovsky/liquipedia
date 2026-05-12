import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { platformId } = body;

    const tournament = await prisma.tournament.update({
      where: { id: id },
      data: { platformId: platformId || null }
    });

    return NextResponse.json({ tournament });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to save platformId" }, { status: 500 });
  }
}
