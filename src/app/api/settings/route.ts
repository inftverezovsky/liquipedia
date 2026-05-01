import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await prisma.globalSettings.findMany();
    const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { key, value } = data;

    if (!key) return NextResponse.json({ error: "Key is required" }, { status: 400 });

    await prisma.globalSettings.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
