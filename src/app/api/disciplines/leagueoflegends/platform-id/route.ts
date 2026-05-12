import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateLeagueOfLegendsDiscipline } from "@/lib/disciplines";
import { queueIdentitySync } from "@/lib/identitySync";

export async function GET() {
  try {
    const discipline = await getOrCreateLeagueOfLegendsDiscipline();
    return NextResponse.json({ platformId: discipline.platformId || "" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch discipline" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { platformId } = await req.json();
    const discipline = await getOrCreateLeagueOfLegendsDiscipline();
    
    await prisma.discipline.update({
      where: { id: discipline.id },
      data: { platformId: platformId || null }
    });
    
    const identitySync = queueIdentitySync("discipline-platform-id:leagueoflegends");
    return NextResponse.json({ success: true, identitySync });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update discipline" }, { status: 500 });
  }
}
