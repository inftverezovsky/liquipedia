import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET — все маппинги или по списку имён
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const names = searchParams.get("names");
  const disciplineSlug = searchParams.get("discipline") || "counterstrike";

  if (names) {
    const nameList = names.split(",").map((n) => n.trim()).filter(Boolean);
    const mappings = await prisma.teamMapping.findMany({
      where: { 
        disciplineSlug,
        liquipediaName: { in: nameList } 
      }
    });
    return NextResponse.json({ mappings });
  }

  const mappings = await prisma.teamMapping.findMany({
    where: { disciplineSlug },
    orderBy: { liquipediaName: "asc" }
  });
  return NextResponse.json({ mappings });
}

// POST — создать или обновить маппинг
export async function POST(request: Request) {
  const body = await request.json();
  const { liquipediaName, disciplineSlug, alias, platformId, logoUrl } = body as {
    liquipediaName?: string;
    disciplineSlug?: string;
    alias?: string;
    platformId?: string;
    logoUrl?: string;
  };

  const slug = disciplineSlug || "counterstrike";

  if (!liquipediaName || liquipediaName.trim().length < 1) {
    return NextResponse.json({ error: "liquipediaName обязателен" }, { status: 400 });
  }

  const mapping = await prisma.teamMapping.upsert({
    where: { 
      disciplineSlug_liquipediaName: {
        disciplineSlug: slug,
        liquipediaName: liquipediaName.trim()
      }
    },
    update: {
      alias: alias?.trim() || null,
      platformId: platformId?.trim() || null,
      logoUrl: logoUrl?.trim() || undefined
    },
    create: {
      disciplineSlug: slug,
      liquipediaName: liquipediaName.trim(),
      alias: alias?.trim() || null,
      platformId: platformId?.trim() || null,
      logoUrl: logoUrl?.trim() || null
    }
  });

  // Cascade update: find all tournaments for this discipline and update participants with this name
  await prisma.tournamentParticipant.updateMany({
    where: {
      name: liquipediaName.trim(),
      tournament: {
        disciplineSlug: slug
      }
    },
    data: {
      platformId: platformId?.trim() || null
    }
  });

  return NextResponse.json({ mapping });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  const disciplineSlug = searchParams.get("discipline") || "counterstrike";

  if (!name) {
    return NextResponse.json({ error: "Параметр name обязателен" }, { status: 400 });
  }

  await prisma.teamMapping.delete({
    where: { 
      disciplineSlug_liquipediaName: {
        disciplineSlug,
        liquipediaName: name.trim()
      }
    }
  });

  return NextResponse.json({ success: true });
}
