import { NextResponse } from "next/server";
import { fetchDisciplinePortal } from "@/lib/liquipedia/portal";

// Revalidate every 24 hours (86400 seconds)
export const revalidate = 86400;

export async function GET(request: Request, { params }: { params: { disciplineSlug: string } }) {
  try {
    const data = await fetchDisciplinePortal(params.disciplineSlug);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch portal data" }, { status: 500 });
  }
}
