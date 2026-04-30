import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      participants: true,
      matches: true,
      lastImport: {
        include: { rawSnapshots: { orderBy: { fetchedAt: "desc" }, take: 1 } }
      }
    }
  });

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  return NextResponse.json({ tournament });
}
