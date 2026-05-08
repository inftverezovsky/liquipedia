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
  force?: boolean;
}) {
  const { disciplineId, disciplineSlug, apiUrl, pageId, title, pageUrl, normalizer, importRecordId, force } = params;

  console.log(`[Importer] Starting import for ${title} (${disciplineSlug})`);
  const startTime = Date.now();

  // 1. Process Main Page
  const mainResult = await processSinglePage({
    disciplineId,
    disciplineSlug,
    apiUrl,
    pageId,
    title,
    pageUrl,
    normalizer,
    importRecordId,
    force
  });

  // 2. Process Sub-pages (one level deep)
  if (mainResult.normalized.subPages && mainResult.normalized.subPages.length > 0) {
    console.log(`[Importer] Found ${mainResult.normalized.subPages.length} sub-pages for ${title}`);
    
    // Prepare sub-page titles
    const subPageTitles = mainResult.normalized.subPages.map(url => {
      const decoded = decodeURIComponent(url.split("/").pop() ?? "").replace(/_/g, " ");
      return decoded;
    });

    // 2.1 Bulk fetch wikitext for all sub-pages in one request
    const { fetchPagesWikitext } = await import("@/lib/liquipedia/client");
    const preFetchedWikitexts = await fetchPagesWikitext(apiUrl, disciplineSlug, subPageTitles);
    const wikitextMap = new Map(preFetchedWikitexts.map(p => [p.title.toLowerCase(), p]));

    // 2.2 Process all sub-pages in parallel
    const subPromises = mainResult.normalized.subPages.map(async (subUrl) => {
      try {
        const subTitle = decodeURIComponent(subUrl.split("/").pop() ?? "").replace(/_/g, " ");
        const preFetched = wikitextMap.get(subTitle.toLowerCase());

        return processSinglePage({
          disciplineId,
          disciplineSlug,
          apiUrl,
          title: subTitle,
          pageUrl: subUrl,
          normalizer,
          importRecordId,
          force,
          tournamentId: mainResult.tournament.id,
          preFetchedWikitext: preFetched
        });
      } catch (err) {
        console.error(`[Importer] Failed to process sub-page ${subUrl}:`, err);
      }
    });

    await Promise.all(subPromises);
  }

  console.log(`[Importer] Completed import for ${title} in ${Date.now() - startTime}ms`);
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
  force?: boolean;
  preFetchedWikitext?: any;
}) {
  const { disciplineSlug, apiUrl, pageId, title, pageUrl, normalizer, importRecordId, tournamentId, force, preFetchedWikitext } = params;

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
    
    const mappingMap = new Map(disciplineMappings.map(m => [m.liquipediaName.toLowerCase(), m]));
    const aliasMap = new Map<string, any>();
    disciplineMappings.forEach(m => {
      if (m.alias) {
        m.alias.split(',').forEach(a => aliasMap.set(a.trim().toLowerCase(), m));
      }
    });

    for (const p of normalized.participants) {
      // Use in-memory maps instead of DB queries
      const mapping = mappingMap.get(p.name.toLowerCase()) || aliasMap.get(p.name.toLowerCase());

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
      if (!mappingMap.has(p.name.toLowerCase())) {
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
  }

  // Save Matches (detect conflicts)
  if (normalized.matches.length > 0) {
    // Process matches in small batches to avoid overwhelming the DB connection
    const matchChunks = [];
    for (let i = 0; i < normalized.matches.length; i += 20) {
      matchChunks.push(normalized.matches.slice(i, i + 20));
    }

    for (const chunk of matchChunks) {
      await Promise.all(chunk.map(async (m) => {
        const matchId = m.matchId ?? `fallback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        // Try to find existing by matchId OR lpNumericalId
        let existing = await prisma.tournamentMatch.findUnique({ where: { matchId } });
        if (!existing && m.lpNumericalId) {
          existing = await prisma.tournamentMatch.findFirst({ 
            where: { lpNumericalId: m.lpNumericalId } 
          });
        }
        
        if (existing) {
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

        // Ensure TeamMapping for match teams (Minimal overhead check)
        const teamAName = m.teamAName;
        const teamBName = m.teamBName;
        if (teamAName && !teamAName.includes("TBD")) {
           await prisma.teamMapping.upsert({
             where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: teamAName } },
             update: {},
             create: { disciplineSlug, liquipediaName: teamAName }
           }).catch(() => {}); // Ignore concurrent insert errors
        }
        if (teamBName && !teamBName.includes("TBD")) {
           await prisma.teamMapping.upsert({
             where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: teamBName } },
             update: {},
             create: { disciplineSlug, liquipediaName: teamBName }
           }).catch(() => {});
        }
      }));
    }
  }

  return { tournament, normalized };
}
