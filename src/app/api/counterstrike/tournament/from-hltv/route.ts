import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { title, url, id, status } = await req.json();

    if (!title || !url) {
      return NextResponse.json({ ok: false, error: "Title and URL are required" }, { status: 400 });
    }

    // 1. Check if already exists
    const existing = await prisma.tournament.findFirst({
      where: {
        disciplineSlug: "counterstrike",
        OR: [
          { sourceTitle: title },
          { sourceUrl: url }
        ]
      }
    });

    if (existing) {
      return NextResponse.json({ ok: true, tournament: existing, message: "Already exists" });
    }

    // 2. Create new tournament
    const tournament = await prisma.tournament.create({
      data: {
        name: title,
        sourceTitle: title,
        sourceUrl: url,
        disciplineSlug: "counterstrike",
        status: status === 'ongoing' ? 'Ongoing' : 'Upcoming',
        extractionStatus: 'PARTIAL',
      }
    });

    return NextResponse.json({ ok: true, tournament });
  } catch (error: any) {
    console.error('[Create from HLTV API] Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
