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

  // Fetch
  const page = await fetchPageWikitext(apiUrl, disciplineSlug, { pageId, title });
  const pageTitle = page.title ?? title;
  const parsedHtml = await fetchPageParsed(apiUrl, pageTitle);

  // Normalize
  const normalized = normalizer({
    pageId: page.pageId ?? pageId,
    title: pageTitle,
    pageUrl: page.fullUrl ?? pageUrl,
    wikitext: page.wikitext,
    parsedHtml
  });

  // Snapshot
  await prisma.rawSnapshot.create({
    data: {
      tournamentImportId: importRecordId,
      source: "liquipedia-mediawiki-api",
      pageId: page.pageId ?? pageId,
      pageTitle,
      rawJson: page.raw as Prisma.InputJsonValue,
      rawWikitext: page.wikitext
    }
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
