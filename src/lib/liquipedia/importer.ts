import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchPageWikitext, fetchPageParsed, makeLiquipediaPageUrl } from "@/lib/liquipedia/client";
import { NormalizedTournament } from "@/lib/normalizers/counterstrikeTournament"; // Standard interface

export async function importTournamentRecursive(params: {
  disciplineId: string;
  disciplineSlug: string;
  apiUrl: string;
  pageId?: number;
  title: string;
  pageUrl: string;
  normalizer: (input: {
    pageId?: number;
    title: string;
    pageUrl: string;
    wikitext: string;
    parsedHtml?: string;
  }) => NormalizedTournament;
  importRecordId: string;
}) {
  const { disciplineId, disciplineSlug, apiUrl, pageId, title, pageUrl, normalizer, importRecordId } = params;

  // 1. Process Main Page
  const mainResult = await processSinglePage({
    disciplineId,
    disciplineSlug,
    apiUrl,
    pageId,
    title,
    pageUrl,
    normalizer,
    importRecordId
  });

  // 2. Process Sub-pages (one level deep)
  if (mainResult.normalized.subPages && mainResult.normalized.subPages.length > 0) {
    console.log(`[Importer] Found ${mainResult.normalized.subPages.length} sub-pages for ${title}`);
    for (const subUrl of mainResult.normalized.subPages) {
      try {
        // Extract title from URL
        const subTitle = decodeURIComponent(subUrl.split("/").pop() ?? "").replace(/_/g, " ");
        await processSinglePage({
          disciplineId,
          disciplineSlug,
          apiUrl,
          title: subTitle,
          pageUrl: subUrl,
          normalizer,
          importRecordId,
          tournamentId: mainResult.tournament.id // Link to main tournament
        });
      } catch (err) {
        console.error(`[Importer] Failed to process sub-page ${subUrl}:`, err);
      }
    }
  }

  return mainResult;
}

async function processSinglePage(params: {
  disciplineId: string;
  disciplineSlug: string;
  apiUrl: string;
  pageId?: number;
  title: string;
  pageUrl: string;
  normalizer: any;
  importRecordId: string;
  tournamentId?: string;
}) {
  const { disciplineSlug, apiUrl, pageId, title, pageUrl, normalizer, importRecordId, tournamentId } = params;

  // 1. Check for cached snapshot (less than 366 days old)
  const cacheThreshold = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);
  const cachedSnapshot = await prisma.rawSnapshot.findFirst({
    where: {
      pageTitle: title,
      fetchedAt: { gte: cacheThreshold }
    },
    orderBy: { fetchedAt: 'desc' }
  });

  let wikitext: string;
  let pageTitle: string;
  let rawJson: any;
  let parsedHtml: string | undefined;
  let currentPageId: number | undefined = pageId;

  if (cachedSnapshot && cachedSnapshot.rawWikitext && cachedSnapshot.rawHtml) {
    console.log(`[Importer] Using cached data for ${title}`);
    wikitext = cachedSnapshot.rawWikitext;
    pageTitle = cachedSnapshot.pageTitle;
    rawJson = cachedSnapshot.rawJson;
    parsedHtml = cachedSnapshot.rawHtml;
    currentPageId = cachedSnapshot.pageId ?? pageId;
  } else {
    // Fetch
    console.log(`[Importer] Fetching fresh data for ${title}`);
    const page = await fetchPageWikitext(apiUrl, disciplineSlug, { pageId, title });
    wikitext = page.wikitext;
    pageTitle = page.title ?? title;
    rawJson = page.raw;
    parsedHtml = await fetchPageParsed(apiUrl, pageTitle);
    currentPageId = page.pageId ?? pageId;

    // Save Snapshot
    await prisma.rawSnapshot.create({
      data: {
        tournamentImportId: importRecordId,
        source: "liquipedia-mediawiki-api",
        pageId: currentPageId,
        pageTitle,
        rawJson: rawJson as Prisma.InputJsonValue,
        rawWikitext: wikitext,
        rawHtml: parsedHtml
      }
    });
  }

  // Normalize
  const normalized = normalizer({
    pageId: currentPageId,
    title: pageTitle,
    pageUrl: pageUrl,
    wikitext,
    parsedHtml
  });

  // Upsert Tournament (only for main page, or update existing)
  const tournament = await prisma.tournament.upsert({
    where: {
      disciplineSlug_sourceTitle: {
        disciplineSlug,
        sourceTitle: tournamentId ? (await prisma.tournament.findUnique({ where: { id: tournamentId } }))?.sourceTitle ?? normalized.sourceTitle : normalized.sourceTitle
      }
    },
    update: {
      extractionStatus: normalized.status,
      normalization: { warnings: normalized.warnings } as Prisma.InputJsonValue,
      lastImportId: importRecordId
    },
    create: {
      sourcePageId: normalized.sourcePageId,
      sourceTitle: normalized.sourceTitle,
      sourceUrl: normalized.sourceUrl,
      name: normalized.name,
      disciplineSlug,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      location: normalized.location,
      region: normalized.region,
      organizer: normalized.organizer,
      prizePool: normalized.prizePool,
      formatText: normalized.formatText,
      status: normalized.tournamentStatus,
      extractionStatus: normalized.status,
      normalization: { warnings: normalized.warnings } as Prisma.InputJsonValue,
      lastImportId: importRecordId
    }
  });

  // Save Participants (only if not already there or merge)
  if (normalized.participants.length > 0) {
    for (const p of normalized.participants) {
      // Check for global mapping to inherit platformId (Check both Name and Alias)
      const mapping = await prisma.teamMapping.findFirst({
        where: {
          disciplineSlug,
          OR: [
            { liquipediaName: { equals: p.name, mode: 'insensitive' } },
            { alias: { contains: p.name, mode: 'insensitive' } }
          ]
        }
      });

      await prisma.tournamentParticipant.upsert({
        where: {
          id: `part_${tournament.id}_${p.name.toLowerCase().replace(/\s/g, "_")}`
        },
        update: {
          logoUrl: p.logoUrl || undefined,
          platformId: mapping?.platformId || undefined // Inherit if found
        },
        create: {
          id: `part_${tournament.id}_${p.name.toLowerCase().replace(/\s/g, "_")}`,
          tournamentId: tournament.id,
          name: p.name,
          platformId: mapping?.platformId || undefined,
          seed: p.seed,
          region: p.region,
          status: p.status,
          logoUrl: p.logoUrl,
          rawText: p.rawText
        }
      });

      // Save to global TeamMapping (initial or update logo)
      await prisma.teamMapping.upsert({
        where: {
          disciplineSlug_liquipediaName: {
            disciplineSlug,
            liquipediaName: p.name
          }
        },
        update: {
          logoUrl: p.logoUrl || undefined
        },
        create: {
          disciplineSlug,
          liquipediaName: p.name,
          logoUrl: p.logoUrl
        }
      });
    }
  }

  // Save Matches (detect conflicts)
  if (normalized.matches.length > 0) {
    for (const m of normalized.matches) {
      const matchId = m.matchId ?? `fallback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      
      const existing = await prisma.tournamentMatch.findUnique({ where: { matchId } });
      
      if (existing) {
        // Compare for conflicts
        const hasConflict = 
          existing.scoreA !== m.scoreA || 
          existing.scoreB !== m.scoreB || 
          existing.status !== m.status;

        await prisma.tournamentMatch.update({
          where: { matchId },
          data: {
            scoreA: m.scoreA,
            scoreB: m.scoreB,
            status: m.status,
            matchDate: m.matchDate || existing.matchDate,
            lpNumericalId: m.lpNumericalId || existing.lpNumericalId,
            platformId: (m as any).platformId || existing.platformId,
            // If conflict, we could log it or set a flag
            rawText: hasConflict ? `CONFLICT: ${existing.scoreA}-${existing.scoreB} -> ${m.scoreA}-${m.scoreB}\n${m.rawText}` : m.rawText
          }
        });
      } else {
        await prisma.tournamentMatch.create({
          data: {
            matchId,
            tournamentId: tournament.id,
            stage: m.stage,
            round: m.round,
            matchDate: m.matchDate,
            matchDateTime: m.matchDateTime,
            teamAId: m.teamAId,
            teamAName: m.teamAName,
            teamBId: m.teamBId,
            teamBName: m.teamBName,
            scoreA: m.scoreA,
            scoreB: m.scoreB,
            format: m.format,
            status: m.status,
            court: m.court,
            sourceUrl: m.sourceUrl,
            lpNumericalId: m.lpNumericalId,
            platformId: (m as any).platformId || undefined,
            rawText: m.rawText
          }
        });
      }

      // Ensure TeamMapping for match teams too
      if (m.teamAName && !m.teamAName.includes("TBD")) {
        await prisma.teamMapping.upsert({
          where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: m.teamAName } },
          update: {},
          create: { disciplineSlug, liquipediaName: m.teamAName }
        });
      }
      if (m.teamBName && !m.teamBName.includes("TBD")) {
        await prisma.teamMapping.upsert({
          where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: m.teamBName } },
          update: {},
          create: { disciplineSlug, liquipediaName: m.teamBName }
        });
      }
    }
  }

  return { tournament, normalized };
}
