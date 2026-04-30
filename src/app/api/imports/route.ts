import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const imports = await prisma.tournamentImport.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { tournament: true }
  });

  return NextResponse.json({ imports });
}
