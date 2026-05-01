import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateCounterStrikeDiscipline } from "@/lib/disciplines";
import { searchTournamentPages } from "@/lib/liquipedia/client";
import { getSearchCacheTtlMs } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const query = typeof body?.query === "string" ? body.query.trim() : "";

    console.log(`\n[Search API] Route called: /api/counterstrike/search-tournament`);
    console.log(`[Search API] Query: "${query}"`);

    if (query.length < 2) {
      return NextResponse.json({ error: "Введите минимум 2 символа" }, { status: 400 });
    }

    const discipline = await getOrCreateCounterStrikeDiscipline();
    const cacheSince = new Date(Date.now() - getSearchCacheTtlMs());

    const cachedRequest = await prisma.searchRequest.findFirst({
      where: {
        disciplineId: discipline.id,
        queryText: query,
        createdAt: { gte: cacheSince },
        status: { in: ["SUCCESS", "CACHED"] }
      },
      orderBy: { createdAt: "desc" },
      include: { results: { orderBy: { createdAt: "asc" } } }
    });

    if (cachedRequest && cachedRequest.results.length > 0) {
      await prisma.searchRequest.create({
        data: {
          disciplineId: discipline.id,
          queryText: query,
          status: "CACHED",
          results: {
            create: cachedRequest.results.map((result) => ({
              pageId: result.pageId,
              title: result.title,
              pageUrl: result.pageUrl,
              snippet: result.snippet,
              score: result.score,
              wordCount: result.wordCount,
              dates: result.dates
            }))
          }
        }
      });

      return NextResponse.json({
        query,
        cacheHit: true,
        results: cachedRequest.results.map((result) => ({
          pageId: result.pageId,
          title: result.title,
          pageUrl: result.pageUrl,
          snippet: result.snippet,
          score: result.score,
          wordCount: result.wordCount,
          dates: result.dates
        }))
      });
    }

    const apiUrl = discipline.baseApiUrl ?? "https://liquipedia.net/counterstrike/api.php";
    const results = await searchTournamentPages(query, apiUrl, "counterstrike");

    await prisma.searchRequest.create({
      data: {
        disciplineId: discipline.id,
        queryText: query,
        status: "SUCCESS",
        results: {
          create: results.map((result) => ({
            pageId: result.pageId,
            title: result.title,
            pageUrl: result.pageUrl,
            snippet: result.snippet,
            score: result.score,
            wordCount: result.wordCount,
            dates: result.dates
          }))
        }
      }
    });

    return NextResponse.json({ query, cacheHit: false, results });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось выполнить поиск" },
      { status: 500 }
    );
  }
}
