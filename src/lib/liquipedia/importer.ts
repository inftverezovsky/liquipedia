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
  normalizer: (input: any) => NormalizedTournament;
  importRecordId: string;
  force?: boolean;
}) {
  const { disciplineId, disciplineSlug, apiUrl, pageId, title, pageUrl, normalizer, importRecordId, force } = params;

  console.log(`[Importer] Starting optimized bulk import for ${title}`);
  const startTime = Date.now();

  // 1. Process Main Page (Does NOT insert matches anymore, just returns them)
  const mainResult = await processSinglePage({
    disciplineId,
    disciplineSlug,
    apiUrl,
    pageId,
    title,
    pageUrl,
    normalizer,
    importRecordId,
    force,
    clearMatches: true // This will wipe the matches for this tournamentId initially
  });

  const allMatches = [...(mainResult.matches || [])];
  const allMatchIds = [...(mainResult.processedMatchIds || [])];

  // 2. Process Sub-pages (one level deep)
  if (mainResult.normalized.subPages && mainResult.normalized.subPages.length > 0) {
    const subPageTitles = mainResult.normalized.subPages.map((url: string) => {
      return decodeURIComponent(url.split("/").pop() ?? "").replace(/_/g, " ");
    });

    const { fetchPagesWikitext } = await import("@/lib/liquipedia/client");
    const preFetchedWikitexts = await fetchPagesWikitext(apiUrl, disciplineSlug, subPageTitles);
    const wikitextMap = new Map(preFetchedWikitexts.map((p: any) => [p.title.toLowerCase(), p]));

    const subResults = await Promise.all(mainResult.normalized.subPages.map(async (subUrl: string) => {
      try {
        const subTitle = decodeURIComponent(subUrl.split("/").pop() ?? "").replace(/_/g, " ");
        const res = await processSinglePage({
          disciplineId,
          disciplineSlug,
          apiUrl,
          title: subTitle,
          pageUrl: subUrl,
          normalizer,
          importRecordId,
          force,
          tournamentId: mainResult.tournament.id,
          preFetchedWikitext: wikitextMap.get(subTitle.toLowerCase())?.wikitext,
          clearMatches: false // Don't clear on subpages!
        });
        return res;
      } catch (err) {
        console.error(`[Importer] Failed to process sub-page ${subUrl}:`, err);
        return null;
      }
    }));

    for (const res of subResults) {
      if (res?.matches) allMatches.push(...res.matches);
      if (res?.processedMatchIds) allMatchIds.push(...res.processedMatchIds);
    }
  }

  // 3. FINAL BULK INSERT (One big push for everything!)
  if (allMatches.length > 0) {
    console.log(`[Importer] Performing final bulk insert of ${allMatches.length} matches...`);
    await prisma.tournamentMatch.createMany({
      data: allMatches,
      skipDuplicates: true
    });
  }

  console.log(`[Importer] Completed optimized import for ${title} in ${Date.now() - startTime}ms`);
  return {
    ...mainResult,
    processedMatchIds: allMatchIds
  };
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
  force?: boolean;
  preFetchedWikitext?: any;
  clearMatches?: boolean;
}) {
  const { disciplineSlug, apiUrl, pageId, title, pageUrl, normalizer, importRecordId, tournamentId, force, preFetchedWikitext, clearMatches } = params;

  try {
    // 1. Check for cached snapshot (Default 1 hour cache, unless forced)
    const cacheThreshold = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour
    const cachedSnapshot = !force ? await prisma.rawSnapshot.findFirst({
      where: {
        pageTitle: title,
        fetchedAt: { gte: cacheThreshold }
      },
      orderBy: { fetchedAt: 'desc' }
    }) : null;

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
      console.log(`[Importer] Fetching data for ${title}`);
      
      if (preFetchedWikitext) {
        wikitext = preFetchedWikitext.wikitext;
        pageTitle = preFetchedWikitext.title;
        rawJson = preFetchedWikitext.raw;
        currentPageId = preFetchedWikitext.pageId;
        // Still need to fetch parsed HTML
        parsedHtml = await fetchPageParsed(apiUrl, pageTitle);
      } else {
        // Parallel fetch wikitext and parsed html
        const [page, html] = await Promise.all([
          fetchPageWikitext(apiUrl, disciplineSlug, { pageId, title }),
          fetchPageParsed(apiUrl, title)
        ]);
        wikitext = page.wikitext;
        pageTitle = page.title;
        rawJson = page.raw;
        parsedHtml = html;
        currentPageId = page.pageId;
      }

      // Save Snapshot (Fire and forget or wait? Better wait to ensure data integrity)
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
      // Optimization: Bulk fetch ALL team mappings for this discipline once
      const disciplineMappings = await prisma.teamMapping.findMany({
        where: { disciplineSlug }
      });
      
      const mappingMap = new Map(disciplineMappings.map((m: any) => [m.liquipediaName.toLowerCase(), m]));
      const aliasMap = new Map<string, any>();
      disciplineMappings.forEach((m: any) => {
        if (m.alias) {
          m.alias.split(',').forEach((a: string) => aliasMap.set(a.trim().toLowerCase(), m));
        }
      });

      // Bulk save participants
      const existingParticipants = await prisma.tournamentParticipant.findMany({
        where: { tournamentId: tournament.id },
        select: { name: true, platformId: true }
      });
      const partPlatformMap = new Map(existingParticipants.filter((ep: any) => ep.platformId).map((ep: any) => [ep.name.toLowerCase(), ep.platformId]));

      const participantsToInsert = normalized.participants.map((p: any) => {
        const mapping = mappingMap.get(p.name.toLowerCase()) || aliasMap.get(p.name.toLowerCase());
        const platformId = partPlatformMap.get(p.name.toLowerCase()) || mapping?.platformId || null;
        
        return {
          id: `part_${tournament.id}_${p.name.toLowerCase().replace(/\s/g, "_")}`,
          tournamentId: tournament.id,
          name: p.name,
          platformId,
          seed: p.seed,
          region: p.region,
          status: p.status,
          logoUrl: p.logoUrl,
          rawText: p.rawText
        };
      });

      if (participantsToInsert.length > 0) {
        await prisma.$transaction([
          prisma.tournamentParticipant.deleteMany({ where: { tournamentId: tournament.id } }),
          prisma.tournamentParticipant.createMany({ data: participantsToInsert, skipDuplicates: true })
        ]);
      }

      // Ensure TeamMappings exist globally (non-blocking)
      for (const p of normalized.participants) {
        if (!mappingMap.has(p.name.toLowerCase())) {
          prisma.teamMapping.upsert({
            where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: p.name } },
            update: { logoUrl: p.logoUrl || undefined },
            create: { disciplineSlug, liquipediaName: p.name, logoUrl: p.logoUrl }
          }).catch(() => {});
        }
      }
    }

    let matchesToInsert: any[] = [];
    // Bulk prepare matches
    if (normalized.matches.length > 0) {
      // 1. Fetch existing platform mappings to preserve them
      const existingMatches = await prisma.tournamentMatch.findMany({
        where: { tournamentId: tournament.id },
        select: { matchId: true, platformId: true, lpNumericalId: true }
      });
      const matchPlatformMap = new Map(existingMatches.filter((em: any) => em.platformId).map((em: any) => [em.matchId, em.platformId]));
      const lpIdMap = new Map(existingMatches.filter((em: any) => em.lpNumericalId).map((em: any) => [em.matchId, em.lpNumericalId]));

      // 1.5 Optional: Clear all matches first for a fresh start
      if (params.clearMatches) {
        await prisma.tournamentMatch.deleteMany({
          where: { tournamentId: tournament.id }
        });
      }

      // 2. Prepare data (FILTERING: Only upcoming, no results, Today + 7 days)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const oneWeekForward = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

      matchesToInsert = normalized.matches
        .filter((m: any) => {
          // Skip matches with results
          if (m.scoreA !== null || m.scoreB !== null) return false;
          
          // Skip past matches (older than today) or too far in future (> 7 days)
          if (m.matchDate) {
            const mDate = new Date(m.matchDate);
            if (mDate < today || mDate > oneWeekForward) return false;
          }
          
          return true;
        })
        .map((m: any, idx: number) => {
          const matchId = m.matchId || `fallback_${Date.now()}_${idx}`;
          return {
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
            lpNumericalId: m.lpNumericalId || lpIdMap.get(matchId) || null,
            platformId: (m as any).platformId || matchPlatformMap.get(matchId) || null,
            rawText: m.rawText
          };
        });

      // 4. Ensure TeamMappings (non-blocking)
      for (const m of normalized.matches) {
        if (m.teamAName && !m.teamAName.includes("TBD")) {
          prisma.teamMapping.upsert({
            where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: m.teamAName } },
            update: {},
            create: { disciplineSlug, liquipediaName: m.teamAName }
          }).catch(() => {});
        }
        if (m.teamBName && !m.teamBName.includes("TBD")) {
          prisma.teamMapping.upsert({
            where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: m.teamBName } },
            update: {},
            create: { disciplineSlug, liquipediaName: m.teamBName }
          }).catch(() => {});
        }
      }
    }

    return { 
      tournament, 
      normalized, 
      matches: matchesToInsert,
      processedMatchIds: normalized.matches.map((m: any) => m.matchId).filter((id: any): id is string => !!id)
    };
  } catch (error) {
    console.error(`[Importer] Error processing page ${title}:`, error);
    throw error;
  }
}
