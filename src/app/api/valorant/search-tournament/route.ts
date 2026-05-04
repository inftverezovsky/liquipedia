import { NextResponse } from "next/server";
import { getOrCreateValorantDiscipline } from "@/lib/disciplines";
import { searchTournamentPages } from "@/lib/liquipedia/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || "";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const discipline = await getOrCreateValorantDiscipline();
    const apiUrl = discipline.baseApiUrl ?? "https://liquipedia.net/valorant/api.php";
    const results = await searchTournamentPages(query, apiUrl, "valorant");

    return NextResponse.json({ results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Ошибка при поиске в Liquipedia" }, { status: 500 });
  }
}
