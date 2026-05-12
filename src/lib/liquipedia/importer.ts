import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clearCachedSearchPageMetadata, fetchPageWikitext, fetchPageParsed, fetchPageRevision } from "@/lib/liquipedia/client";
import { dedupeTournamentMatches } from "@/lib/matches/dedupe";
import type { NormalizedTournament } from "@/lib/normalizers/types";
import { isPlaceholderTeam } from "@/lib/teams";
import {
  buildMatchCandidateMetadata,
  computeMatchSetQuality,
  getMatchSourceConfidence,
  hasPlaceholderTeams,
  shouldKeepPreviousMatches,
} from "@/lib/matches/quality";
import {
  clearSourceFetchCache,
  findSourceFetchCache,
  isSourceCacheFresh,
  isSourceCacheStaleUsable,
  markSourceFetchAttempt,
  markSourceFetchFailure,
  markSourceFetchSuccess,
  SOURCE_CACHE_TTL_MS,
  type SourceFetchCacheRecord,
} from "@/lib/sourceFetchCache";
import {
  buildTeamNameCanonicalizer,
  canonicalizeMatchTeams,
  canonicalizeParticipants,
  getTeamMappingLookupKeys,
} from "@/lib/teams/canonicalize";
import { createHash } from "crypto";

const IMPORT_MATCH_FUTURE_WINDOW_DAYS = Number(process.env.IMPORT_MATCH_FUTURE_WINDOW_DAYS || 365);
const IMPORT_MATCH_PAST_GRACE_DAYS = Number(process.env.IMPORT_MATCH_PAST_GRACE_DAYS || 0);

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
  let forceCleanupStats: ForceRefreshCleanupStats | null = null;

  if (force) {
    forceCleanupStats = await clearTournamentForceRefreshState({
      disciplineSlug,
      pageId,
      title,
      pageUrl,
    });
    console.log(
      `[Importer] Force refresh cleanup for ${title}: `
      + `${forceCleanupStats.matchesDeleted} matches, `
      + `${forceCleanupStats.participantsDeleted} participants, `
      + `${forceCleanupStats.rawSnapshotsDeleted} snapshots, `
      + `${forceCleanupStats.sourceFetchCachesDeleted} source cache rows, `
      + `${forceCleanupStats.fileCachesDeleted} file caches.`
    );
  }

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
  let finalProcessedMatchIds = allMatchIds;

  // 2. Process Sub-pages (one level deep)
  if (mainResult.normalized.subPages && mainResult.normalized.subPages.length > 0) {
    const subResults = await Promise.all(mainResult.normalized.subPages.map(async (subUrl: string) => {
      try {
        const subTitle = titleFromLiquipediaUrl(subUrl, disciplineSlug);
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
  const existingBeforeFinal = await prisma.tournamentMatch.findMany({
    where: { tournamentId: mainResult.tournament.id }
  });
  let qualityScore = computeMatchSetQuality(allMatches, existingBeforeFinal);
  let qualityGateWarning: string | null = null;
  let qualityGateKeptPrevious = false;

  if (allMatches.length > 0) {
    console.log(`[Importer] Performing final bulk insert of ${allMatches.length} matches...`);
    await canonicalizeMatchesWithTournamentTeams(allMatches, mainResult.tournament.id, disciplineSlug);
    
    // RE-ASSIGN matchIds consistently using the FULL tournament title
    const mainTournamentKey = title.trim();
    for (const m of allMatches) {
      const identity = buildMatchIdentity(m);
      const teams = [m.teamAId || "unknownA", m.teamBId || "unknownB"].sort();
      const data = [
        mainTournamentKey,
        identity.date,
        identity.time,
        teams[0],
        teams[1],
        identity.stage,
        identity.round,
        identity.format,
        identity.sourceSlot,
      ].join("|");
      const hash = createHash("md5").update(data).digest("hex").slice(0, 12);
      m.matchId = `match_${hash}`;
      m.lpNumericalId = BigInt("0x" + hash.substring(0, 15)) % 9007199254740991n;
      m.tournamentId = mainResult.tournament.id;
      m.hasPlaceholderTeams = hasPlaceholderTeams(m);
      m.sourceConfidence = getMatchSourceConfidence(m);
      m.sourceBreakdown = buildMatchCandidateMetadata(m, "liquipedia") as Prisma.InputJsonValue;
      (m as any)._identity = identity;
    }

    const deduplicatedMatches = dedupeTournamentMatches(allMatches).map(m => {
      const { _identity, ...rest } = m;
      return rest;
    });
    finalProcessedMatchIds = deduplicatedMatches.map((match: any) => match.matchId).filter(Boolean);
    qualityScore = computeMatchSetQuality(deduplicatedMatches, existingBeforeFinal);

    if (deduplicatedMatches.length !== allMatches.length) {
      console.log(`[Importer] Removed ${allMatches.length - deduplicatedMatches.length} duplicate matches before insert.`);
    }

    qualityGateKeptPrevious = !force && shouldKeepPreviousMatches({
      newMatches: deduplicatedMatches,
      previousMatches: existingBeforeFinal,
      newQualityScore: qualityScore,
      sourceHadError: Boolean(mainResult.warning),
    });

    if (qualityGateKeptPrevious) {
      qualityGateWarning = `Новый импорт выглядит хуже предыдущего snapshot (${deduplicatedMatches.length} vs ${existingBeforeFinal.length} матчей, quality=${qualityScore}). Старые матчи сохранены.`;
      finalProcessedMatchIds = existingBeforeFinal.map((match: any) => match.matchId).filter(Boolean);
      await appendTournamentWarning(mainResult.tournament.id, qualityGateWarning);
      console.warn(`[Importer] ${qualityGateWarning}`);
    } else {
      await prisma.tournamentMatch.deleteMany({
        where: { tournamentId: mainResult.tournament.id }
      });

      await prisma.tournamentMatch.createMany({
        data: deduplicatedMatches,
        skipDuplicates: true
      });
    }
  } else {
    qualityGateKeptPrevious = !force && shouldKeepPreviousMatches({
      newMatches: [],
      previousMatches: existingBeforeFinal,
      newQualityScore: qualityScore,
      sourceHadError: Boolean(mainResult.warning),
    });

    if (qualityGateKeptPrevious) {
      qualityGateWarning = `Источник вернул 0 матчей, поэтому предыдущие ${existingBeforeFinal.length} матчей сохранены.`;
      finalProcessedMatchIds = existingBeforeFinal.map((match: any) => match.matchId).filter(Boolean);
      await appendTournamentWarning(mainResult.tournament.id, qualityGateWarning);
      console.warn(`[Importer] ${qualityGateWarning}`);
    } else {
      await prisma.tournamentMatch.deleteMany({
        where: { tournamentId: mainResult.tournament.id }
      });
    }
  }

  console.log(`[Importer] Completed optimized import for ${title} in ${Date.now() - startTime}ms`);
  return {
    ...mainResult,
    processedMatchIds: finalProcessedMatchIds,
    qualityScore,
    warning: qualityGateWarning || mainResult.warning || null,
    qualityGateKeptPrevious,
    forceCleanupStats,
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
  clearMatches?: boolean;
}) {
  const { disciplineSlug, apiUrl, pageId, title, pageUrl, normalizer, importRecordId, tournamentId, force, clearMatches = true } = params;

  try {
    let wikitext = "";
    let pageTitle = title;
    let rawJson: any = {};
    let parsedHtml: string | undefined;
    let currentPageId: number | undefined = pageId;
    let rawSnapshot: any | null = null;
    let cacheHit = false;
    let cacheLayer: string | null = null;
    let stale = false;
    let warning: string | null = null;
    let externalRequests = 0;

    const cacheInput = {
      source: "liquipedia",
      disciplineSlug,
      resourceType: "page",
      resourceKey: titleKey(title),
      mode: "cache-first",
    };

    if (force) {
      await clearPageFetchCaches(disciplineSlug, title);
    }

    let sourceCache: SourceFetchCacheRecord | null = !force
      ? await findSourceFetchCache(cacheInput)
      : null;

    if (!force && sourceCache?.rawSnapshotId && isSourceCacheFresh(sourceCache)) {
      rawSnapshot = await prisma.rawSnapshot.findUnique({ where: { id: sourceCache.rawSnapshotId } });
      if (rawSnapshot?.rawWikitext) {
        cacheHit = true;
        cacheLayer = sourceCache.cacheLayer || "source-fetch-cache";
      } else {
        rawSnapshot = null;
      }
    }

    if (!force && !rawSnapshot) {
      const cacheThreshold = new Date(Date.now() - SOURCE_CACHE_TTL_MS.liquipediaImport);
      rawSnapshot = await prisma.rawSnapshot.findFirst({
        where: {
          pageTitle: title,
          OR: [
            { disciplineSlug },
            { disciplineSlug: null }
          ],
          fetchedAt: { gte: cacheThreshold }
        },
        orderBy: { fetchedAt: "desc" }
      });
      if (rawSnapshot?.rawWikitext) {
        cacheHit = true;
        cacheLayer = "raw-snapshot";
      } else {
        rawSnapshot = null;
      }
    }

    if (!force && !rawSnapshot && sourceCache?.rawSnapshotId) {
      try {
        const revision = await fetchPageRevision(apiUrl, disciplineSlug, { pageId, title });
        externalRequests += 1;
        const revisionUnchanged = Boolean(revision.revisionId && sourceCache.revisionId === revision.revisionId);
        if (revisionUnchanged) {
          const revisionSnapshot = await prisma.rawSnapshot.findUnique({ where: { id: sourceCache.rawSnapshotId } });
          if (revisionSnapshot?.rawWikitext) {
            rawSnapshot = revisionSnapshot;
            cacheHit = true;
            cacheLayer = "revision-cache";
            await markSourceFetchSuccess(cacheInput, {
              revisionId: revision.revisionId,
              revisionTimestamp: revision.revisionTimestamp,
              rawSnapshotId: revisionSnapshot.id,
              externalRequests,
              cacheLayer,
              metadata: {
                title: revision.title,
                pageId: revision.pageId ?? null,
                fullUrl: revision.fullUrl,
                revisionChecked: true,
              },
            });
          }
        }
      } catch (revisionError) {
        warning = `Не удалось проверить revision для ${title}: ${revisionError instanceof Error ? revisionError.message : "unknown error"}`;
        await markSourceFetchFailure(cacheInput, {
          errorClass: "revision_check_failed",
          externalRequests,
        });
      }
    }

    if (rawSnapshot?.rawWikitext) {
      console.log(`[Importer] Using ${cacheLayer || "cached"} data for ${title}`);
      wikitext = rawSnapshot.rawWikitext;
      pageTitle = rawSnapshot.pageTitle;
      rawJson = rawSnapshot.rawJson;
      parsedHtml = rawSnapshot.rawHtml || undefined;
      currentPageId = rawSnapshot.pageId ?? pageId;
    } else {
      console.log(`[Importer] Fetching data for ${title}`);
      await markSourceFetchAttempt(cacheInput);

      try {
        const [page, html] = await Promise.all([
          fetchPageWikitext(apiUrl, disciplineSlug, { pageId, title }),
          fetchPageParsed(apiUrl, title)
        ]);
        externalRequests += 2;
        wikitext = page.wikitext;
        pageTitle = page.title;
        rawJson = page.raw;
        parsedHtml = html;
        currentPageId = page.pageId;

        if (force && titleKey(pageTitle) !== titleKey(title)) {
          await clearPageFetchCaches(disciplineSlug, pageTitle);
        }

        const contentHash = createHash("sha1").update(wikitext).digest("hex");
        rawSnapshot = await prisma.rawSnapshot.create({
          data: {
            tournamentImportId: importRecordId,
            source: "liquipedia-mediawiki-api",
            disciplineSlug,
            pageId: currentPageId,
            pageTitle,
            contentHash,
            revisionId: extractRevisionId(rawJson),
            revisionTimestamp: extractRevisionTimestamp(rawJson),
            rawJson: rawJson as Prisma.InputJsonValue,
            rawWikitext: wikitext,
            rawHtml: parsedHtml,
            metadata: {
              resourceType: "page",
              resourceKey: titleKey(pageTitle),
              mode: "cache-first",
            } as Prisma.InputJsonValue,
          }
        });

        await markSourceFetchSuccess(cacheInput, {
          revisionId: rawSnapshot.revisionId,
          revisionTimestamp: rawSnapshot.revisionTimestamp,
          contentHash,
          rawSnapshotId: rawSnapshot.id,
          externalRequests,
          cacheLayer: "network",
          metadata: {
            title: pageTitle,
            pageId: currentPageId ?? null,
            pageUrl,
          },
        });
      } catch (fetchError) {
        await markSourceFetchFailure(cacheInput, {
          errorClass: "source_fetch_failed",
          externalRequests,
        });

        sourceCache = sourceCache || (!force ? await findSourceFetchCache(cacheInput) : null);
        if (!force && sourceCache?.rawSnapshotId && isSourceCacheStaleUsable(sourceCache)) {
          const staleSnapshot = await prisma.rawSnapshot.findUnique({ where: { id: sourceCache.rawSnapshotId } });
          if (staleSnapshot?.rawWikitext) {
            rawSnapshot = staleSnapshot;
            wikitext = staleSnapshot.rawWikitext;
            pageTitle = staleSnapshot.pageTitle;
            rawJson = staleSnapshot.rawJson;
            parsedHtml = staleSnapshot.rawHtml || undefined;
            currentPageId = staleSnapshot.pageId ?? pageId;
            cacheHit = true;
            cacheLayer = "stale-if-error";
            stale = true;
            warning = `Источник недоступен, показан последний хороший snapshot для ${title}.`;
          } else {
            throw fetchError;
          }
        } else {
          const fallbackSnapshot = await prisma.rawSnapshot.findFirst({
            where: {
              pageTitle: title,
              OR: [
                { disciplineSlug },
                { disciplineSlug: null }
              ],
              fetchedAt: { gte: new Date(Date.now() - SOURCE_CACHE_TTL_MS.liquipediaStale) }
            },
            orderBy: { fetchedAt: "desc" }
          });

          if (!force && fallbackSnapshot?.rawWikitext) {
            rawSnapshot = fallbackSnapshot;
            wikitext = fallbackSnapshot.rawWikitext;
            pageTitle = fallbackSnapshot.pageTitle;
            rawJson = fallbackSnapshot.rawJson;
            parsedHtml = fallbackSnapshot.rawHtml || undefined;
            currentPageId = fallbackSnapshot.pageId ?? pageId;
            cacheHit = true;
            cacheLayer = "raw-snapshot-stale-if-error";
            stale = true;
            warning = `Источник недоступен, использован stale snapshot для ${title}.`;
          } else {
            throw fetchError;
          }
        }
      }
    }

    // Normalize
    const normalized = normalizer({
      pageId: currentPageId,
      title: pageTitle,
      pageUrl: pageUrl,
      wikitext,
      parsedHtml
    });
    normalized.cacheHit = cacheHit;
    normalized.cacheLayer = cacheLayer;
    normalized.stale = stale;
    normalized.warning = warning;
    normalized.requestStats = {
      externalRequests,
      sourceCacheExternalRequests: sourceCache?.externalRequests ?? 0,
    };

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
        normalization: {
          warnings: warning ? Array.from(new Set([...normalized.warnings, warning])) : normalized.warnings,
          cacheHit,
          cacheLayer,
          stale,
          requestStats: normalized.requestStats,
        } as Prisma.InputJsonValue,
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
        normalization: {
          warnings: warning ? Array.from(new Set([...normalized.warnings, warning])) : normalized.warnings,
          cacheHit,
          cacheLayer,
          stale,
          requestStats: normalized.requestStats,
        } as Prisma.InputJsonValue,
        lastImportId: importRecordId
      }
    });

    const disciplineMappings = await prisma.teamMapping.findMany({
      where: { disciplineSlug }
    });
    const teamCanonicalizer = buildTeamNameCanonicalizer({
      participants: normalized.participants,
      mappings: disciplineMappings,
      extraNames: normalized.matches.flatMap((match: any) => [match.teamAName, match.teamBName]),
    });
    normalized.participants = canonicalizeParticipants(normalized.participants, teamCanonicalizer);
    normalized.matches = normalized.matches.map((match: any) => canonicalizeMatchTeams(match, teamCanonicalizer));

    // Save Participants (only if not already there or merge)
    if (normalized.participants.length > 0) {
      const mappingMap = new Map(disciplineMappings.map((m: any) => [m.liquipediaName.toLowerCase(), m]));
      const aliasMap = new Map<string, any>();
      disciplineMappings.forEach((m: any) => {
        for (const key of getTeamMappingLookupKeys(m)) {
          aliasMap.set(key.toLowerCase(), m);
        }
        if (m.alias) {
          m.alias.split(',').forEach((a: string) => aliasMap.set(a.trim().toLowerCase(), m));
        }
      });

      // Bulk save participants
      const existingParticipants = await prisma.tournamentParticipant.findMany({
        where: { tournamentId: tournament.id },
        select: { name: true, platformId: true }
      });
      const partPlatformMap = new Map(
        force
          ? []
          : existingParticipants.filter((ep: any) => ep.platformId).map((ep: any) => [ep.name.toLowerCase(), ep.platformId])
      );

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

      if (clearMatches !== false) {
        await prisma.$transaction([
          prisma.tournamentParticipant.deleteMany({ where: { tournamentId: tournament.id } }),
          ...(participantsToInsert.length > 0
            ? [prisma.tournamentParticipant.createMany({ data: participantsToInsert, skipDuplicates: true })]
            : [])
        ]);
      } else {
        if (participantsToInsert.length > 0) {
          await prisma.tournamentParticipant.createMany({ data: participantsToInsert, skipDuplicates: true });
        }
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
    } else if (clearMatches !== false) {
      await prisma.tournamentParticipant.deleteMany({ where: { tournamentId: tournament.id } });
    }

    let matchesToInsert: any[] = [];
    // Bulk prepare matches
    if (normalized.matches.length > 0) {
      // 1. Fetch existing platform mappings to preserve them
      const existingMatches = force
        ? []
        : await prisma.tournamentMatch.findMany({
            where: { tournamentId: tournament.id },
            select: { matchId: true, platformId: true, lpNumericalId: true, teamAName: true, teamBName: true, matchDate: true }
          });
      const matchPlatformMap = new Map(existingMatches.filter((em: any) => em.platformId).map((em: any) => [em.matchId, em.platformId]));
      const lpIdMap = new Map(existingMatches.filter((em: any) => em.lpNumericalId).map((em: any) => [em.matchId, em.lpNumericalId]));
      
      // Fallback map for when matchId logic changes
      const fuzzyPlatformMap = new Map();
      existingMatches.forEach((em: any) => {
        if (em.platformId && em.teamAName && em.teamBName) {
           const teams = [em.teamAName.toLowerCase(), em.teamBName.toLowerCase()].sort();
           const dateStr = em.matchDate ? new Date(em.matchDate).toISOString().split('T')[0] : "";
           fuzzyPlatformMap.set(`${dateStr}|${teams[0]}|${teams[1]}`, em.platformId);
        }
      });

      // 2. Prepare data (FILTERING: upcoming/unplayed only, with a configurable future window)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const pastLimit = new Date(today.getTime() - IMPORT_MATCH_PAST_GRACE_DAYS * 24 * 60 * 60 * 1000);
      const futureLimit = new Date(today.getTime() + IMPORT_MATCH_FUTURE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      matchesToInsert = normalized.matches
        .filter((m: any) => {
          // Skip matches with results
          if (m.scoreA !== null || m.scoreB !== null) return false;
          if (isFinishedMatchStatus(m.status)) return false;
          if (!m.matchDate && normalized.tournamentStatus === "finished") return false;
          
          // Skip past matches and far-future noise, but keep undated announced matches.
          if (m.matchDate) {
            const mDate = new Date(m.matchDate);
            if (mDate < pastLimit || mDate > futureLimit) return false;
          }
          
          return true;
        })
        .map((m: any, idx: number) => {
          const matchId = m.matchId || `fallback_${Date.now()}_${idx}`;
          
          let platformId = matchPlatformMap.get(matchId) || null;
          if (!platformId && m.teamAName && m.teamBName) {
            const teams = [m.teamAName.toLowerCase(), m.teamBName.toLowerCase()].sort();
            const dateStr = m.matchDate ? new Date(m.matchDate).toISOString().split('T')[0] : "";
            platformId = fuzzyPlatformMap.get(`${dateStr}|${teams[0]}|${teams[1]}`) || null;
          }

          return {
            ...m,
            matchId,
            tournamentId: tournament.id,
            platformId,
            lpNumericalId: lpIdMap.get(matchId) || m.lpNumericalId || null,
            syncedAt: null, // Reset sync status if re-imported
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
            rawText: m.rawText,
            hasPlaceholderTeams: hasPlaceholderTeams(m),
            sourceConfidence: getMatchSourceConfidence(m),
            sourceBreakdown: buildMatchCandidateMetadata(m, "liquipedia") as Prisma.InputJsonValue
          };
        });

      // 4. Ensure TeamMappings (non-blocking)
      for (const m of normalized.matches) {
        if (m.teamAName && !isPlaceholderTeam(m.teamAName)) {
          prisma.teamMapping.upsert({
            where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: m.teamAName } },
            update: {},
            create: { disciplineSlug, liquipediaName: m.teamAName }
          }).catch(() => {});
        }
        if (m.teamBName && !isPlaceholderTeam(m.teamBName)) {
          prisma.teamMapping.upsert({
            where: { disciplineSlug_liquipediaName: { disciplineSlug, liquipediaName: m.teamBName } },
            update: {},
            create: { disciplineSlug, liquipediaName: m.teamBName }
          }).catch(() => {});
        }
      }
    }

    const pageQualityScore = computeMatchSetQuality(matchesToInsert);
    normalized.qualityScore = pageQualityScore;
    normalized.sourceBreakdown = {
      liquipedia: {
        pageTitle,
        pageId: currentPageId ?? null,
        matches: matchesToInsert.length,
        placeholders: matchesToInsert.filter((match) => hasPlaceholderTeams(match)).length,
        cacheHit,
        cacheLayer,
        stale,
      },
    };

    if (rawSnapshot?.id) {
      await prisma.rawSnapshot.update({
        where: { id: rawSnapshot.id },
        data: {
          qualityScore: pageQualityScore,
          metadata: {
            resourceType: "page",
            resourceKey: titleKey(pageTitle),
            mode: "cache-first",
            cacheHit,
            cacheLayer,
            stale,
            warning,
            matchesCount: matchesToInsert.length,
            placeholdersCount: matchesToInsert.filter((match) => hasPlaceholderTeams(match)).length,
          } as Prisma.InputJsonValue,
        },
      }).catch(() => {});

      await markSourceFetchSuccess(cacheInput, {
        revisionId: rawSnapshot.revisionId,
        revisionTimestamp: rawSnapshot.revisionTimestamp,
        contentHash: rawSnapshot.contentHash,
        rawSnapshotId: rawSnapshot.id,
        qualityScore: pageQualityScore,
        externalRequests: 0,
        cacheLayer: cacheLayer || (cacheHit ? "raw-snapshot" : "network"),
        metadata: {
          title: pageTitle,
          pageId: currentPageId ?? null,
          matchesCount: matchesToInsert.length,
          placeholdersCount: matchesToInsert.filter((match) => hasPlaceholderTeams(match)).length,
          stale,
        },
      });
    }

    return { 
      tournament, 
      normalized, 
      matches: matchesToInsert,
      processedMatchIds: normalized.matches.map((m: any) => m.matchId).filter((id: any): id is string => !!id),
      cacheHit,
      cacheLayer,
      stale,
      warning,
      requestStats: normalized.requestStats,
      sourceBreakdown: normalized.sourceBreakdown,
      qualityScore: pageQualityScore,
    };
  } catch (error) {
    console.error(`[Importer] Error processing page ${title}:`, error);
    throw error;
  }
}

async function canonicalizeMatchesWithTournamentTeams(matches: any[], tournamentId: string, disciplineSlug: string) {
  const [participants, mappings] = await Promise.all([
    prisma.tournamentParticipant.findMany({
      where: { tournamentId },
      select: { name: true, rawText: true, platformId: true, logoUrl: true },
    }),
    prisma.teamMapping.findMany({ where: { disciplineSlug } }),
  ]);

  const canonicalizer = buildTeamNameCanonicalizer({
    participants,
    mappings,
    extraNames: matches.flatMap((match: any) => [match.teamAName, match.teamBName]),
  });

  for (const match of matches) {
    Object.assign(match, canonicalizeMatchTeams(match, canonicalizer));
  }
}

type ForceRefreshCleanupStats = {
  tournamentId: string | null;
  matchesDeleted: number;
  participantsDeleted: number;
  rawSnapshotsDeleted: number;
  sourceFetchCachesDeleted: number;
  fileCachesDeleted: number;
};

async function clearTournamentForceRefreshState(params: {
  disciplineSlug: string;
  pageId?: number;
  title: string;
  pageUrl?: string | null;
}): Promise<ForceRefreshCleanupStats> {
  const titleVariants = getTitleVariants(params.title, params.pageUrl, params.disciplineSlug);
  const tournament = await prisma.tournament.findFirst({
    where: {
      disciplineSlug: params.disciplineSlug,
      OR: [
        { sourceTitle: { in: [...titleVariants] } },
        ...(params.pageUrl ? [{ sourceUrl: params.pageUrl }] : []),
        ...(params.pageId ? [{ sourcePageId: params.pageId }] : []),
      ],
    },
    select: { id: true, sourceTitle: true },
  });

  if (tournament?.sourceTitle) {
    for (const variant of getTitleVariants(tournament.sourceTitle, null, params.disciplineSlug)) {
      titleVariants.add(variant);
    }
  }

  let matchesDeleted = 0;
  let participantsDeleted = 0;
  if (tournament?.id) {
    const [matches, participants] = await prisma.$transaction([
      prisma.tournamentMatch.deleteMany({ where: { tournamentId: tournament.id } }),
      prisma.tournamentParticipant.deleteMany({ where: { tournamentId: tournament.id } }),
    ]);
    matchesDeleted = matches.count;
    participantsDeleted = participants.count;

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: {
        extractionStatus: "PENDING",
        normalization: {
          forceRefresh: true,
          cacheClearedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    }).catch(() => {});
  }

  const pageCacheStats = await Promise.all(
    [...titleVariants].map((title) => clearPageFetchCaches(params.disciplineSlug, title))
  );

  return {
    tournamentId: tournament?.id ?? null,
    matchesDeleted,
    participantsDeleted,
    rawSnapshotsDeleted: pageCacheStats.reduce((sum, item) => sum + item.rawSnapshotsDeleted, 0),
    sourceFetchCachesDeleted: pageCacheStats.reduce((sum, item) => sum + item.sourceFetchCachesDeleted, 0),
    fileCachesDeleted: pageCacheStats.reduce((sum, item) => sum + item.fileCachesDeleted, 0),
  };
}

async function clearPageFetchCaches(disciplineSlug: string, title: string) {
  const titleVariants = getTitleVariants(title, null, disciplineSlug);
  const [rawSnapshotsResult, sourceFetchResults] = await Promise.all([
    prisma.rawSnapshot.deleteMany({
      where: {
        pageTitle: { in: [...titleVariants] },
        OR: [
          { disciplineSlug },
          { disciplineSlug: null },
        ],
      },
    }),
    Promise.all([...titleVariants].map((variant) => clearSourceFetchCache({
      source: "liquipedia",
      disciplineSlug,
      resourceType: "page",
      resourceKey: titleKey(variant),
    }))),
  ]);

  const fileCachesDeleted = [...titleVariants].reduce(
    (count, variant) => count + clearCachedSearchPageMetadata(disciplineSlug, variant),
    0
  );

  return {
    rawSnapshotsDeleted: rawSnapshotsResult.count,
    sourceFetchCachesDeleted: sourceFetchResults.reduce((sum, result) => sum + result.count, 0),
    fileCachesDeleted,
  };
}

function getTitleVariants(title: string, pageUrl: string | null | undefined, disciplineSlug: string) {
  const variants = new Set<string>();
  const add = (value?: string | null) => {
    const cleaned = String(value || "").trim();
    if (!cleaned) return;
    variants.add(cleaned);
    variants.add(cleaned.replace(/_/g, " "));
    variants.add(cleaned.replace(/ /g, "_"));
  };

  add(title);
  if (pageUrl) add(titleFromLiquipediaUrl(pageUrl, disciplineSlug));

  return variants;
}

async function appendTournamentWarning(tournamentId: string, warning: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { normalization: true },
  });
  const normalization = isPlainObject(tournament?.normalization)
    ? tournament?.normalization as Record<string, unknown>
    : {};
  const existingWarnings = Array.isArray(normalization.warnings)
    ? normalization.warnings.filter((item): item is string => typeof item === "string")
    : [];

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      extractionStatus: "PARTIAL",
      normalization: {
        ...normalization,
        warnings: Array.from(new Set([...existingWarnings, warning])),
        qualityGateKeptPrevious: true,
      } as Prisma.InputJsonValue,
    },
  });
}

function extractRevisionId(rawJson: any) {
  const revision = rawJson?.query?.pages?.[0]?.revisions?.[0];
  return typeof revision?.revid === "number" ? revision.revid : null;
}

function extractRevisionTimestamp(rawJson: any) {
  const revision = rawJson?.query?.pages?.[0]?.revisions?.[0];
  if (!revision?.timestamp) return null;
  const parsed = new Date(revision.timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildMatchIdentity(match: any) {
  const parsedDate = parseMatchDate(match);
  const placeholder = hasPlaceholderTeams(match);
  const sourceSlot = placeholder
    ? normalizeIdentityPart(match.rawText || match.sourceUrl || match.matchId)
    : (parsedDate || match.matchDateTime ? "" : normalizeIdentityPart(match.matchId));

  return {
    date: parsedDate ? parsedDate.toISOString().slice(0, 10) : "no-date",
    time: parsedDate ? parsedDate.toISOString().slice(11, 16) : normalizeIdentityPart(match.matchDateTime),
    stage: normalizeIdentityPart(match.stage),
    round: normalizeIdentityPart(match.round),
    format: normalizeIdentityPart(match.format),
    sourceSlot,
  };
}

function parseMatchDate(match: any): Date | null {
  if (match.matchDate) {
    const date = new Date(match.matchDate);
    if (!Number.isNaN(date.getTime())) return date;
  }

  if (match.matchDateTime) {
    const cleaned = String(match.matchDateTime)
      .replace(/\s*-\s*/, " ")
      .replace(/\s+[A-Z]{2,5}$/, "")
      .trim();
    const parsed = new Date(`${cleaned}Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function normalizeIdentityPart(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFinishedMatchStatus(status: unknown) {
  return /\b(finished|completed|complete|closed|done|walkover|cancelled|canceled)\b/i.test(String(status || ""));
}

function titleFromLiquipediaUrl(pageUrl: string, disciplineSlug: string) {
  try {
    const parsed = new URL(pageUrl);
    const marker = `/${disciplineSlug}/`;
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length)).replace(/_/g, " ");
    }
  } catch {
    // Fall back below.
  }

  return decodeURIComponent(pageUrl.split("/").filter(Boolean).slice(-2).join("/")).replace(/_/g, " ");
}

function titleKey(title: string) {
  return title.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
