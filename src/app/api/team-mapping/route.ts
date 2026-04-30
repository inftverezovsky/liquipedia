import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET — все маппинги или по списку имён
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const names = searchParams.get("names");

  if (names) {
    const nameList = names.split(",").map((n) => n.trim()).filter(Boolean);
    const mappings = await prisma.teamMapping.findMany({
      where: { liquipediaName: { in: nameList } }
    });
    return NextResponse.json({ mappings });
  }

  const mappings = await prisma.teamMapping.findMany({
    orderBy: { liquipediaName: "asc" }
  });
  return NextResponse.json({ mappings });
}

// POST — создать или обновить маппинг
export async function POST(request: Request) {
  const body = await request.json();
  const { liquipediaName, alias, platformId } = body as {
    liquipediaName?: string;
    alias?: string;
    platformId?: string;
  };

  if (!liquipediaName || liquipediaName.trim().length < 1) {
    return NextResponse.json({ error: "liquipediaName обязателен" }, { status: 400 });
  }

  const mapping = await prisma.teamMapping.upsert({
    where: { liquipediaName: liquipediaName.trim() },
    update: {
      alias: alias?.trim() || null,
      platformId: platformId?.trim() || null
    },
    create: {
      liquipediaName: liquipediaName.trim(),
      alias: alias?.trim() || null,
      platformId: platformId?.trim() || null
    }
  });

  return NextResponse.json({ mapping });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (!name) {
    return NextResponse.json({ error: "Параметр name обязателен" }, { status: 400 });
  }

  await prisma.teamMapping.deleteMany({
    where: { liquipediaName: name.trim() }
  });

  return NextResponse.json({ success: true });
}
