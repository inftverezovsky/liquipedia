import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { queueIdentitySync } from "@/lib/identitySync";

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

    const identitySync = queueIdentitySync("tournament-platform-id:counterstrike");
    return NextResponse.json({ tournament, identitySync });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to save platformId" }, { status: 500 });
  }
}
