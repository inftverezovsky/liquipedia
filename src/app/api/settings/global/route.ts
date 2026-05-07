import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const settings = await prisma.globalSettings.findMany();
  const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});
  return NextResponse.json(config);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const entries = Object.entries(body);

    for (const [key, value] of entries) {
      await prisma.globalSettings.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
