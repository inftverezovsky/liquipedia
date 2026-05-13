import { getLiquipediaUserAgent } from "@/lib/env";
import { prisma } from "@/lib/db";
import { withGenericRateLimit, withParseRateLimit } from "@/lib/liquipedia/rateLimiter";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { markProxyFailure, markProxySuccess, maskProxyUrl, selectProxyCandidate } from "@/lib/proxySelector";
import { classifyParserError, shouldCooldownProxyForError } from "@/lib/parserErrors";
import crypto from "crypto";
import fs from "fs";
import nodeFetch from "node-fetch";
import path from "path";

const LIQUIPEDIA_API_TIMEOUT_MS = Number(process.env.LIQUIPEDIA_API_TIMEOUT_MS || 20000);
const LIQUIPEDIA_API_MAX_RETRIES = Number(process.env.LIQUIPEDIA_API_MAX_RETRIES || 1);
const LIQUIPEDIA_SEARCH_CANDIDATE_LIMIT = Number(process.env.LIQUIPEDIA_SEARCH_CANDIDATE_LIMIT || 20);
const LIQUIPEDIA_SEARCH_VARIATION_LIMIT = Number(process.env.LIQUIPEDIA_SEARCH_VARIATION_LIMIT || 5);
const LIQUIPEDIA_SEARCH_FULLTEXT_VARIATION_LIMIT = Number(process.env.LIQUIPEDIA_SEARCH_FULLTEXT_VARIATION_LIMIT || 2);
const LIQUIPEDIA_SEARCH_TIME_BUDGET_MS = Number(process.env.LIQUIPEDIA_SEARCH_TIME_BUDGET_MS || 45000);
const LIQUIPEDIA_SEARCH_API_TIMEOUT_MS = Number(process.env.LIQUIPEDIA_SEARCH_API_TIMEOUT_MS || 7000);
const LIQUIPEDIA_SEARCH_API_MAX_RETRIES = Number(process.env.LIQUIPEDIA_SEARCH_API_MAX_RETRIES || 0);
const LIQUIPEDIA_IMPORT_API_TIMEOUT_MS = Number(process.env.LIQUIPEDIA_IMPORT_API_TIMEOUT_MS || 12000);
const LIQUIPEDIA_IMPORT_API_MAX_RETRIES = Number(process.env.LIQUIPEDIA_IMPORT_API_MAX_RETRIES || 0);
const LIQUIPEDIA_DIRECT_FALLBACK_ENABLED = process.env.LIQUIPEDIA_DIRECT_FALLBACK_ENABLED !== "0";
const LIQUIPEDIA_SEARCH_METADATA_TTL_MS = Number(process.env.LIQUIPEDIA_SEARCH_METADATA_TTL_SECONDS || 24 * 60 * 60) * 1000;
const SEARCH_PAGE_METADATA_VERSION = 3;

export type LiquipediaSearchResult = {
  pageId: number;
  title: string;
  pageUrl: string;
  snippet?: string | null;
  score?: number | null;
  wordCount?: number | null;
  dates?: string | null;
};

export type LiquipediaPageContent = {
  pageId?: number;
  title: string;
  fullUrl: string;
  wikitext: string;
  raw: unknown;
};

export type LiquipediaPageRevision = {
  pageId?: number;
  title: string;
  fullUrl: string;
  revisionId?: number | null;
  revisionTimestamp?: Date | null;
  raw: unknown;
};

type SearchApiResponse = [string, string[], string[], string[]];

type PageApiResponse = {
  query?: {
    pages?: Array<{
      pageid?: number;
      title: string;
      fullurl?: string;
      missing?: boolean;
      revisions?: Array<{
        revid?: number;
        timestamp?: string;
        slots?: {
          main?: {
            content?: string;
            "*"?: string;
          };
        };
        "*"?: string;
      }>;
    }>;
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
  };
};

type SearchPageMetadata = {
  version?: number;
  pageId: number;
  title: string;
  pageUrl: string;
  isTournament: boolean;
  dates: string | null;
  fetchedAt: number;
};

export type ApiRequestOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  mode?: string;
};

export function getLiquipediaImportRequestOptions(): ApiRequestOptions {
  return {
    timeoutMs: LIQUIPEDIA_IMPORT_API_TIMEOUT_MS,
    maxRetries: LIQUIPEDIA_IMPORT_API_MAX_RETRIES,
    mode: "import",
  };
}

export async function searchTournamentPages(query: string, apiUrl: string, disciplineSlug: string, limit = 10): Promise<LiquipediaSearchResult[]> {
  const currentYear = new Date().getFullYear();
  const variations = buildLiquipediaSearchVariations(query, currentYear).slice(0, LIQUIPEDIA_SEARCH_VARIATION_LIMIT);
  const startedAt = Date.now();
  const isBudgetExpired = () => Date.now() - startedAt > LIQUIPEDIA_SEARCH_TIME_BUDGET_MS;
  const searchRequestOptions: ApiRequestOptions = {
    timeoutMs: LIQUIPEDIA_SEARCH_API_TIMEOUT_MS,
    maxRetries: LIQUIPEDIA_SEARCH_API_MAX_RETRIES,
    mode: "search",
  };

  const allTitlesSet = new Set<string>();
  const titleToUrl = new Map<string, string>();

  for (const v of variations) {
    if (isBudgetExpired()) {
      console.warn(`[Liquipedia Search] Time budget reached for "${query}" before variation "${v}".`);
      break;
    }

    try {
      const openResponse = await apiRequest<SearchApiResponse>(apiUrl, {
        action: "opensearch",
        format: "json",
        search: v,
        limit: "20"
      }, false, 0, searchRequestOptions);
      const openTitles = openResponse[1] ?? [];
      const openUrls = openResponse[3] ?? [];
      openTitles.forEach((t, i) => {
        allTitlesSet.add(t);
        if (openUrls[i]) titleToUrl.set(t, openUrls[i]);
      });

      if (allTitlesSet.size >= LIQUIPEDIA_SEARCH_CANDIDATE_LIMIT) {
        break;
      }
    } catch (err) {
      console.error(`Search variation "${v}" failed:`, err);
    }
  }

  const relevantOpenTitles = Array.from(allTitlesSet).filter((title) => isLiquipediaSearchTitleRelevant(query, title));
  if (relevantOpenTitles.length === 0 && allTitlesSet.size < LIQUIPEDIA_SEARCH_CANDIDATE_LIMIT) {
    for (const v of variations.slice(0, LIQUIPEDIA_SEARCH_FULLTEXT_VARIATION_LIMIT)) {
      if (isBudgetExpired()) {
        console.warn(`[Liquipedia Search] Time budget reached for "${query}" before full-text variation "${v}".`);
        break;
      }

      try {
        const searchResponse = await apiRequest<{ query?: { search?: Array<{ title: string }> } }>(apiUrl, {
          action: "query",
          list: "search",
          srsearch: v,
          srlimit: "20",
          format: "json"
        }, false, 0, searchRequestOptions);
        const searchTitles = searchResponse.query?.search?.map(s => s.title) ?? [];
        searchTitles.forEach(t => allTitlesSet.add(t));
      } catch (err) {
        console.error(`Full-text search variation "${v}" failed:`, err);
      }
    }
  }

  const allTitles = Array.from(allTitlesSet)
    .filter((title) => isLiquipediaSearchTitleRelevant(query, title))
    .slice(0, LIQUIPEDIA_SEARCH_CANDIDATE_LIMIT);
  if (allTitles.length > 0) {
    try {
      // Process in chunks to avoid URL length limits
      const chunkSize = 40;
      const pages: any[] = [];
      const titlesToFetch: string[] = [];
      const normalizedMap = new Map<string, string>();
      const redirectsMap = new Map<string, string>();
      const activeResults = new Map<string, { title: string, pageId: number, pageUrl: string, dates: string | null }>();

      for (const title of allTitles) {
        const metadata = getCachedSearchPageMetadata(disciplineSlug, title);
        if (metadata) {
          if (metadata.isTournament) {
            activeResults.set(title, {
              title: metadata.title,
              pageId: metadata.pageId,
              pageUrl: metadata.pageUrl,
              dates: metadata.dates,
            });
          }
        } else {
          titlesToFetch.push(title);
        }
      }

      for (let i = 0; i < titlesToFetch.length; i += chunkSize) {
        if (isBudgetExpired()) {
          console.warn(`[Liquipedia Search] Time budget reached for "${query}" before metadata chunk.`);
          break;
        }

        const chunk = titlesToFetch.slice(i, i + chunkSize);
        const infoResponse = await apiRequest<PageApiResponse>(apiUrl, {
          action: "query",
          format: "json",
          formatversion: "2",
          prop: "revisions",
          rvprop: "content",
          rvslots: "main",
          titles: chunk.join("|"),
          redirects: "1"
        }, false, 0, searchRequestOptions);
        if (infoResponse.query?.pages) pages.push(...infoResponse.query.pages);
        if (infoResponse.query?.normalized) {
          infoResponse.query.normalized.forEach(n => normalizedMap.set(n.to, n.from));
        }
        if (infoResponse.query?.redirects) {
          infoResponse.query.redirects.forEach(r => redirectsMap.set(r.to, r.from));
        }
      }
      const now = Date.now();
      const pastLimit = now - 30 * 24 * 60 * 60 * 1000;
      const futureLimit = now + 30 * 24 * 60 * 60 * 1000;
      
      // Clean wiki markup from date strings
      const cleanDate = (val: string) => {
        const rawDateMatch = val.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        if (rawDateMatch) return rawDateMatch[1];

        let cleaned = val
          .replace(/\{\{[^}]*\}\}/g, '')        // Remove all templates like {{date|...}}
          .replace(/\[\[[^\]]*\]\]/g, '')         // Remove wiki links
          .replace(/<[^>]*>/g, '')                // Remove HTML tags
          .replace(/\}\}.*$/s, '')                // Remove trailing }} and everything after
          .trim();
        // Extract just the date portion (YYYY-MM-DD)
        const dateMatch = cleaned.match(/(\d{4}-\d{2}-\d{2})/);
        return dateMatch ? dateMatch[1] : cleaned;
      };

      for (const p of pages) {
        const wikitext = p.revisions?.[0]?.slots?.main?.content;
        if (!wikitext) continue;

        // STRICT: Only show tournament pages (must have tournament/league infobox)
        const isTournament = /\{\{\s*(?:Infobox\s+league|Infobox\s+tournament|LeagueInfobox|TournamentInfobox)/i.test(wikitext);
        if (!isTournament) {
          setCachedSearchPageMetadata(disciplineSlug, p.title, {
            pageId: p.pageid ?? 0,
            title: p.title,
            pageUrl: titleToUrl.get(p.title) ?? makeLiquipediaPageUrl(p.title, disciplineSlug),
            isTournament: false,
            dates: null,
            version: SEARCH_PAGE_METADATA_VERSION,
            fetchedAt: Date.now(),
          });
          continue;
        }

        const enddateRaw = wikitext.match(/\|\s*(?:edate|enddate|end_date|date2|date_end)\s*=\s*([^|\n]*(?:\{\{[^}]*\}\}[^|\n]*)*)/i)?.[1]?.trim();
        const startdateRaw = wikitext.match(/\|\s*(?:sdate|startdate|start_date|date1|date_start)\s*=\s*([^|\n]*(?:\{\{[^}]*\}\}[^|\n]*)*)/i)?.[1]?.trim();
        
        const enddateMatch = enddateRaw ? cleanDate(enddateRaw) : null;
        const startdateMatch = startdateRaw ? cleanDate(startdateRaw) : null;

        let shouldHide = false;
        
        // 1. If we have an end date, it must be recent (within 30 days)
        if (enddateMatch) {
          const endDate = new Date(enddateMatch);
          if (!isNaN(endDate.getTime()) && endDate.getTime() < pastLimit) {
            shouldHide = true;
          }
        } 
        // 2. If no end date, the start date must be recent
        else if (startdateMatch) {
          const startDate = new Date(startdateMatch);
          if (!isNaN(startDate.getTime()) && startDate.getTime() < pastLimit) {
            shouldHide = true;
          }
        }

        // 3. Must not be too far in the future
        if (startdateMatch && !shouldHide) {
          const startDate = new Date(startdateMatch);
          if (!isNaN(startDate.getTime()) && startDate.getTime() > futureLimit) {
            shouldHide = true;
          }
        }

        // 4. Don't hide if no dates found, just let dates be null
        // (Removed strict hiding to avoid "no results" when parsing fails)

        let datesStr = null;
        if (startdateMatch || enddateMatch) {
          datesStr = [startdateMatch, enddateMatch].filter(Boolean).join(" — ");
        }

        if (!shouldHide || queryHasExplicitYear(query)) {
          const pageUrl = titleToUrl.get(p.title) ?? makeLiquipediaPageUrl(p.title, disciplineSlug);
          activeResults.set(p.title, { title: p.title, pageId: p.pageid ?? 0, pageUrl, dates: datesStr });
          setCachedSearchPageMetadata(disciplineSlug, p.title, {
            pageId: p.pageid ?? 0,
            title: p.title,
            pageUrl,
            isTournament: true,
            dates: datesStr,
            version: SEARCH_PAGE_METADATA_VERSION,
            fetchedAt: Date.now(),
          });
        } else {
          setCachedSearchPageMetadata(disciplineSlug, p.title, {
            pageId: p.pageid ?? 0,
            title: p.title,
            pageUrl: titleToUrl.get(p.title) ?? makeLiquipediaPageUrl(p.title, disciplineSlug),
            isTournament: true,
            dates: datesStr,
            version: SEARCH_PAGE_METADATA_VERSION,
            fetchedAt: Date.now(),
          });
        }
      }

      // Also map via normalized titles and redirects
      for (const [to, from] of normalizedMap) {
        const info = activeResults.get(to);
        if (info) activeResults.set(from, info);
      }
      for (const [to, from] of redirectsMap) {
        const info = activeResults.get(to);
        if (info) activeResults.set(from, info);
      }

      const results: LiquipediaSearchResult[] = [];
      const yearRegex = new RegExp(`${currentYear}|${currentYear + 1}`);

      for (let i = 0; i < allTitles.length; i++) {
        const title = allTitles[i];
        const titleSpace = title.replace(/_/g, " ");
        const activeInfo = activeResults.get(titleSpace) || activeResults.get(title);
        
        if (activeInfo) {
          // Boost score if title contains current or next year
          let score = allTitles.length - i;
          if (yearRegex.test(title)) score += 1000;

          if (!shouldShowLiquipediaSearchResult(query, title, activeInfo.dates, currentYear)) {
            continue;
          }

          results.push({
            pageId: activeInfo.pageId,
            title: title,
            pageUrl: titleToUrl.get(title) ?? activeInfo.pageUrl ?? makeLiquipediaPageUrl(title, disciplineSlug),
            snippet: "",
            score: score,
            wordCount: null,
            dates: activeInfo.dates
          });
        }
      }

      // Final sort by score
      results.sort((a, b) => (b.score || 0) - (a.score || 0));

      if (results.length > 0) {
        return results.slice(0, limit);
      }

      // If current/upcoming filtering found nothing, only fall back to historical
      // pages when the user explicitly searched by year.
      if (!queryHasExplicitYear(query)) {
        return [];
      }

      const fallbackResults = pages
        .filter((p) => {
          const wikitext = p.revisions?.[0]?.slots?.main?.content;
          return wikitext
            && /\{\{\s*(?:Infobox\s+league|Infobox\s+tournament|LeagueInfobox|TournamentInfobox)/i.test(wikitext)
            && isLiquipediaSearchTitleRelevant(query, p.title);
        })
        .slice(0, limit)
        .map((p, index) => ({
          pageId: p.pageid ?? 0,
          title: p.title,
          pageUrl: titleToUrl.get(p.title) ?? makeLiquipediaPageUrl(p.title, disciplineSlug),
          snippet: "",
          score: allTitles.length - index,
          wordCount: null,
          dates: null,
        }));

      return fallbackResults;
    } catch (err) {
      console.error("Failed to filter search results:", err);
    }
  }

  return [];
}

function getCachedSearchPageMetadata(disciplineSlug: string, title: string): SearchPageMetadata | null {
  try {
    const cachePath = getSearchPageMetadataPath(disciplineSlug, title);
    if (!fs.existsSync(cachePath)) return null;

    const metadata = JSON.parse(fs.readFileSync(cachePath, "utf8")) as SearchPageMetadata;
    if (metadata.version !== SEARCH_PAGE_METADATA_VERSION) {
      return null;
    }
    if (!metadata?.fetchedAt || Date.now() - metadata.fetchedAt > LIQUIPEDIA_SEARCH_METADATA_TTL_MS) {
      return null;
    }

    return metadata;
  } catch {
    return null;
  }
}

export function buildLiquipediaSearchVariations(query: string, currentYear = new Date().getFullYear()) {
  const cleanQuery = query.trim().replace(/\s+/g, " ");
  const variations = new Set<string>([cleanQuery]);

  if (cleanQuery.includes(" ")) {
    variations.add(cleanQuery.replace(/ /g, "/"));
    variations.add(cleanQuery.replace(/\s+/g, ""));
  }

  addYearPathVariations(cleanQuery, variations);

  const leagueExpanded = expandTrailingLeagueAbbreviation(cleanQuery);
  if (leagueExpanded) {
    variations.add(leagueExpanded.withSpace);
    variations.add(leagueExpanded.compact);
  }

  const baseVariations = Array.from(variations);
  if (cleanQuery.length >= 3 && !queryHasExplicitYear(cleanQuery)) {
    for (const value of baseVariations) {
      variations.add(`${value} ${currentYear}`);
      variations.add(`${value} ${currentYear + 1}`);
    }
  }

  return Array.from(variations).filter(Boolean);
}

function addYearPathVariations(query: string, variations: Set<string>) {
  const match = query.match(/\b(19\d{2}|20\d{2})\b/);
  if (!match || match.index === undefined) return;

  const year = match[1];
  const beforeYear = query.slice(0, match.index).trim();
  const afterYear = query.slice(match.index + year.length).trim();
  if (!beforeYear) return;

  if (afterYear) {
    variations.add(`${beforeYear}/${year}/${afterYear.replace(/\s+/g, "/")}`);
  } else {
    variations.add(`${beforeYear}/${year}`);
  }

  const beforeParts = beforeYear.split(/\s+/).filter(Boolean);
  if (beforeParts.length > 1) {
    const [seriesRoot, ...eventParts] = beforeParts;
    const tail = [...eventParts, ...afterYear.split(/\s+/).filter(Boolean)].join("/");
    if (tail) {
      variations.add(`${seriesRoot}/${year}/${tail}`);
    }
  }
}

export function filterLiquipediaSearchResultsForQuery<T extends { title: string; dates?: string | null }>(
  query: string,
  results: T[],
  currentYear = new Date().getFullYear()
) {
  return results.filter((result) =>
    isLiquipediaSearchValueRelevant(query, result.title, result.dates ?? null)
    && shouldShowLiquipediaSearchResult(query, result.title, result.dates ?? null, currentYear)
  );
}

export function isLiquipediaSearchTitleRelevant(query: string, title: string) {
  const tokens = getMeaningfulSearchTokens(query, { includeYears: false });
  if (tokens.length === 0) return true;

  const normalizedTitle = normalizeSearchText(title);
  const compactTitle = normalizedTitle.replace(/\s+/g, "");
  return tokens.every((token) => normalizedTitle.includes(token) || compactTitle.includes(token));
}

function isLiquipediaSearchValueRelevant(query: string, title: string, dates: string | null | undefined) {
  if (!isLiquipediaSearchTitleRelevant(query, title)) return false;

  const explicitYears = getExplicitSearchYears(query);
  if (explicitYears.length === 0) return true;

  const normalizedValue = normalizeSearchText(`${title} ${dates || ""}`);
  return explicitYears.every((year) => normalizedValue.includes(String(year)));
}

function shouldShowLiquipediaSearchResult(query: string, title: string, dates: string | null | undefined, currentYear: number) {
  if (queryHasExplicitYear(query)) {
    return isLiquipediaSearchValueRelevant(query, title, dates);
  }

  const titleYears = Array.from(title.matchAll(/\b(19\d{2}|20\d{2})\b/g)).map((match) => Number(match[1]));
  if (titleYears.some((year) => year < currentYear)) return false;

  if (!dates) return true;

  const resultYears = Array.from(dates.matchAll(/\b(19\d{2}|20\d{2})\b/g)).map((match) => Number(match[1]));
  if (resultYears.some((year) => year < currentYear)) return false;

  const firstDate = dates.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (firstDate) {
    const startDate = new Date(firstDate);
    const futureLimit = Date.now() + 30 * 24 * 60 * 60 * 1000;
    if (!Number.isNaN(startDate.getTime()) && startDate.getTime() > futureLimit) return false;
  }

  return true;
}

function getMeaningfulSearchTokens(query: string, options: { includeYears?: boolean } = {}) {
  return normalizeSearchText(expandTrailingLeagueAbbreviation(query)?.withSpace ?? query)
    .split(" ")
    .filter((token) => token.length >= 2)
    .filter((token) => options.includeYears || !/^(19\d{2}|20\d{2})$/.test(token));
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryHasExplicitYear(query: string) {
  return /\b(19\d{2}|20\d{2})\b/.test(query);
}

function getExplicitSearchYears(query: string) {
  return Array.from(query.matchAll(/\b(19\d{2}|20\d{2})\b/g)).map((match) => Number(match[1]));
}

function expandTrailingLeagueAbbreviation(query: string) {
  const match = query.trim().match(/^(.+?)\s+l$/i);
  if (!match) return null;

  const prefix = match[1].trim();
  if (!prefix) return null;
  return {
    withSpace: `${prefix} League`,
    compact: `${prefix}League`,
  };
}

function setCachedSearchPageMetadata(disciplineSlug: string, title: string, metadata: SearchPageMetadata) {
  try {
    const cachePath = getSearchPageMetadataPath(disciplineSlug, title);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(metadata));
  } catch {}
}

export function clearCachedSearchPageMetadata(disciplineSlug: string, title: string) {
  try {
    const cachePath = getSearchPageMetadataPath(disciplineSlug, title);
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      return 1;
    }
  } catch {}

  return 0;
}

function getSearchPageMetadataPath(disciplineSlug: string, title: string) {
  const key = crypto.createHash("sha1").update(`${disciplineSlug}:${title}`).digest("hex");
  return path.join(process.cwd(), "cache", "liquipedia", "page-meta", `${key}.json`);
}

function hashQuery(value: string) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

async function logLiquipediaRequest(data: {
  mode: string;
  proxyId?: string | null;
  statusCode?: number;
  errorClass?: string;
  durationMs?: number;
  bytesIn?: number;
  queryHash?: string;
}) {
  await prisma.parserRequestLog.create({
    data: {
      source: "liquipedia",
      mode: data.mode,
      proxyId: data.proxyId || null,
      statusCode: data.statusCode,
      errorClass: data.errorClass,
      durationMs: data.durationMs,
      bytesIn: data.bytesIn,
      queryHash: data.queryHash,
    },
  }).catch(() => {});
}

export async function fetchPagesWikitext(
  apiUrl: string,
  disciplineSlug: string,
  titles: string[],
  options: ApiRequestOptions = {}
): Promise<LiquipediaPageContent[]> {
  if (titles.length === 0) return [];
  
  // MediaWiki allows up to 50 titles per request
  const chunkSize = 50;
  const results: LiquipediaPageContent[] = [];

  for (let i = 0; i < titles.length; i += chunkSize) {
    const chunk = titles.slice(i, i + chunkSize);
    const params: Record<string, string> = {
      action: "query",
      format: "json",
      formatversion: "2",
      prop: "info|revisions",
      inprop: "url",
      rvprop: "content|timestamp|ids",
      rvslots: "main",
      redirects: "1",
      titles: chunk.join("|")
    };

    const response = await apiRequest<PageApiResponse>(apiUrl, params, false, 0, options);
    const pages = response.query?.pages ?? [];

    for (const page of pages) {
      if (!page || page.missing) continue;
      const revision = page.revisions?.[0];
      const wikitext = revision?.slots?.main?.content ?? revision?.slots?.main?.["*"] ?? revision?.["*"] ?? "";
      if (!wikitext) continue;

      results.push({
        pageId: page.pageid,
        title: page.title,
        fullUrl: page.fullurl ?? makeLiquipediaPageUrl(page.title, disciplineSlug),
        wikitext,
        raw: response
      });
    }
  }

  return results;
}

export async function fetchPageWikitext(
  apiUrl: string,
  disciplineSlug: string,
  input: { pageId?: number; title?: string },
  options: ApiRequestOptions = {}
): Promise<LiquipediaPageContent> {
  const pages = await fetchPagesWikitext(apiUrl, disciplineSlug, input.title ? [input.title] : [], options);
  if (pages.length > 0) return pages[0];
  
  // Fallback for pageId if still needed (rare)
  if (input.pageId) {
    const params: Record<string, string> = {
      action: "query",
      format: "json",
      formatversion: "2",
      prop: "info|revisions",
      inprop: "url",
      rvprop: "content|timestamp|ids",
      rvslots: "main",
      redirects: "1",
      pageids: String(input.pageId)
    };
    const response = await apiRequest<PageApiResponse>(apiUrl, params, false, 0, options);
    const page = response.query?.pages?.[0];
    if (!page || page.missing) throw new Error("Liquipedia page not found");
    const revision = page.revisions?.[0];
    return {
      pageId: page.pageid,
      title: page.title,
      fullUrl: page.fullurl ?? makeLiquipediaPageUrl(page.title, disciplineSlug),
      wikitext: revision?.slots?.main?.content ?? revision?.slots?.main?.["*"] ?? revision?.["*"] ?? "",
      raw: response
    };
  }

  throw new Error("Liquipedia page not found");
}

export async function fetchPageRevision(
  apiUrl: string,
  disciplineSlug: string,
  input: { pageId?: number; title?: string },
  options: ApiRequestOptions = {}
): Promise<LiquipediaPageRevision> {
  const params: Record<string, string> = {
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "info|revisions",
    inprop: "url",
    rvprop: "timestamp|ids",
    redirects: "1",
  };

  if (input.pageId) {
    params.pageids = String(input.pageId);
  } else if (input.title) {
    params.titles = input.title;
  } else {
    throw new Error("Liquipedia page not found");
  }

  const response = await apiRequest<PageApiResponse>(apiUrl, params, false, 0, options);
  const page = response.query?.pages?.[0];
  if (!page || page.missing) throw new Error("Liquipedia page not found");

  const revision = page.revisions?.[0];
  const revisionTimestamp = revision?.timestamp ? new Date(revision.timestamp) : null;

  return {
    pageId: page.pageid,
    title: page.title,
    fullUrl: page.fullurl ?? makeLiquipediaPageUrl(page.title, disciplineSlug),
    revisionId: typeof revision?.revid === "number" ? revision.revid : null,
    revisionTimestamp: revisionTimestamp && Number.isFinite(revisionTimestamp.getTime()) ? revisionTimestamp : null,
    raw: response,
  };
}

export function makeLiquipediaPageUrl(title: string, disciplineSlug: string) {
  const normalized = title.trim().replace(/ /g, "_");
  return `https://liquipedia.net/${disciplineSlug}/${encodeURIComponent(normalized).replace(/%2F/g, "/")}`;
}

export async function fetchPageParsed(apiUrl: string, title: string, options: ApiRequestOptions = {}): Promise<string> {
  const response = await apiRequest<{ parse?: { text?: { "*"?: string } } }>(
    apiUrl,
    {
      action: "parse",
      format: "json",
      page: title,
      prop: "text",
      disabletoc: "1",
      redirects: "1"
    },
    true
  );

  return response.parse?.text?.["*"] ?? "";
}

export async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LIQUIPEDIA_API_TIMEOUT_MS);
  const fetchOptions: any = {
    method: "GET",
    headers: {
      "User-Agent": getLiquipediaUserAgent(),
      "Accept-Encoding": "gzip",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
    },
    signal: controller.signal
  };

  const proxy = await selectProxyCandidate();
  const startedAt = Date.now();
  if (proxy?.proxyUrl) {
    fetchOptions.agent = proxy.proxyUrl.startsWith('socks') ? new SocksProxyAgent(proxy.proxyUrl) : new HttpsProxyAgent(proxy.proxyUrl);
  }

  const response = await nodeFetch(url, fetchOptions as any)
    .catch(async (error) => {
      const errorClass = classifyParserError({ message: error instanceof Error ? error.message : String(error) });
      await markProxyFailure(proxy?.proxyId || null, {
        errorClass,
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    })
    .finally(() => clearTimeout(timeoutId));
  if (!response.ok) {
    const errorClass = classifyParserError({ statusCode: response.status, message: `Failed to fetch HTML ${response.status}` });
    if (shouldCooldownProxyForError(errorClass)) {
      await markProxyFailure(proxy?.proxyId || null, {
        errorClass,
        errorMessage: `Failed to fetch HTML ${response.status} from ${url}`,
        durationMs: Date.now() - startedAt,
        blocked: errorClass === "cloudflare_block",
      });
    }
    if (response.status === 403 || response.status === 424) {
      const htmlFromApi = await fetchHtmlViaMediaWikiApi(url).catch(() => "");
      if (htmlFromApi) return htmlFromApi;
    }
    throw new Error(`Failed to fetch HTML ${response.status} from ${url}`);
  }
  await markProxySuccess(proxy?.proxyId || null, Date.now() - startedAt);
  return response.text();
}

export async function apiRequest<T>(
  apiUrl: string,
  params: Record<string, string>,
  isParse = false,
  retryCount = 0,
  options: ApiRequestOptions = {}
): Promise<T> {
  const execute = async () => {
    const timeoutMs = options.timeoutMs ?? LIQUIPEDIA_API_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? LIQUIPEDIA_API_MAX_RETRIES;
    const requestMode = options.mode ?? (isParse ? "parse" : "api");
    const url = new URL(apiUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    console.log(`[Liquipedia API Request] URL: ${url.toString()}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const finalUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    const fetchOptions: any = {
      method: "GET",
      headers: {
        "User-Agent": finalUserAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "max-age=0",
        "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1"
      },
      signal: controller.signal
    };

    const proxy = await selectProxyCandidate(retryCount + 1);
    if (!proxy?.proxyUrl && !LIQUIPEDIA_DIRECT_FALLBACK_ENABLED) {
      throw new Error("Прокси не настроены. Пожалуйста, добавьте прокси в Proxy Pool.");
    }

    if (proxy?.proxyUrl) {
      fetchOptions.agent = proxy.proxyUrl.startsWith('socks') ? new SocksProxyAgent(proxy.proxyUrl) : new HttpsProxyAgent(proxy.proxyUrl);
      console.log(`[Liquipedia API] Using Proxy from Pool: ${maskProxyUrl(proxy.proxyUrl)}`);
    } else {
      console.log("[Liquipedia API] Using direct connection; no active proxy is available.");
    }

    let response;
    let activeProxyId = proxy?.proxyId ?? null;
    let startedAt = Date.now();
    let recoveredWithDirectFallback = false;
    try {
      response = await nodeFetch(url.toString(), fetchOptions as any).finally(() => clearTimeout(timeoutId));
    } catch (e: any) {
      const durationMs = Date.now() - startedAt;
      const errorClass = classifyParserError({ message: e.message });
      await markProxyFailure(activeProxyId, {
        errorClass,
        errorMessage: e.message,
        durationMs,
      });
      await logLiquipediaRequest({
        mode: requestMode,
        proxyId: activeProxyId,
        errorClass,
        durationMs,
        queryHash: hashQuery(url.toString()),
      });
      if (LIQUIPEDIA_DIRECT_FALLBACK_ENABLED && activeProxyId) {
        console.warn(`[Liquipedia API] Proxy failed with ${errorClass}; trying direct fallback.`);
        const directController = new AbortController();
        const directTimeoutId = setTimeout(() => directController.abort(), timeoutMs);
        const directFetchOptions = {
          ...fetchOptions,
          headers: {
            "User-Agent": getLiquipediaUserAgent(),
            Accept: "application/json, application/mediawiki+json;q=0.9,*/*;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
          },
          signal: directController.signal,
        };
        delete directFetchOptions.agent;
        activeProxyId = null;
        startedAt = Date.now();
        try {
          response = await nodeFetch(url.toString(), directFetchOptions as any).finally(() => clearTimeout(directTimeoutId));
          recoveredWithDirectFallback = true;
        } catch (directError: any) {
          const directDurationMs = Date.now() - startedAt;
          const directErrorClass = classifyParserError({ message: directError.message });
          await logLiquipediaRequest({
            mode: requestMode,
            proxyId: null,
            errorClass: directErrorClass,
            durationMs: directDurationMs,
            queryHash: hashQuery(url.toString()),
          });
          if (retryCount < maxRetries) {
            console.log(`[Liquipedia API] Direct fallback failed, rotating proxy and retrying (Attempt ${retryCount + 1})...`);
            return apiRequest<T>(apiUrl, params, isParse, retryCount + 1, options);
          }
          throw directError;
        }
      } else if (retryCount < maxRetries) {
        console.log(`[Liquipedia API] Network error, rotating proxy and retrying (Attempt ${retryCount + 1})...`);
        return apiRequest<T>(apiUrl, params, isParse, retryCount + 1, options);
      }
      if (!recoveredWithDirectFallback) {
        throw e;
      }
    }

    if (!response) {
      throw new Error("Liquipedia API request failed without a response");
    }

    if (response.status === 424 || response.status === 403) {
      const durationMs = Date.now() - startedAt;
      const errorClass = classifyParserError({ statusCode: response.status, message: `Liquipedia blocked with ${response.status}` });
      await markProxyFailure(activeProxyId, {
        errorClass,
        errorMessage: `Liquipedia blocked with ${response.status}`,
        durationMs,
        blocked: true,
      });
      await logLiquipediaRequest({
        mode: requestMode,
        proxyId: activeProxyId,
        statusCode: response.status,
        errorClass,
        durationMs,
        queryHash: hashQuery(url.toString()),
      });
      if (retryCount < maxRetries) {
        console.log(`[Liquipedia API] Blocked (${response.status}), rotating proxy and retrying (Attempt ${retryCount + 1})...`);
        return apiRequest<T>(apiUrl, params, isParse, retryCount + 1, options);
      }
    }

    const contentType = response.headers.get("content-type") || "";
    console.log(`[Liquipedia API Response] Status: ${response.status}, Content-Type: ${contentType}`);

    if (!response.ok) {
      const text = await response.text();
      const errorClass = classifyParserError({ statusCode: response.status, message: text });
      console.log(`[Liquipedia API Error Body] ${text.slice(0, 500)}`);
      if (shouldCooldownProxyForError(errorClass)) {
        await markProxyFailure(activeProxyId, {
          errorClass,
          errorMessage: `Liquipedia API error ${response.status}: ${text.slice(0, 300)}`,
          durationMs: Date.now() - startedAt,
          blocked: errorClass === "cloudflare_block",
        });
      }
      await logLiquipediaRequest({
        mode: requestMode,
        proxyId: activeProxyId,
        statusCode: response.status,
        errorClass,
        durationMs: Date.now() - startedAt,
        bytesIn: text.length,
        queryHash: hashQuery(url.toString()),
      });
      throw new Error(`Liquipedia API error ${response.status}: ${text.slice(0, 300)}`);
    }

    if (!contentType.includes("application/json") && !contentType.includes("application/mediawiki+json")) {
      const text = await response.text();
      const errorClass = classifyParserError({
        statusCode: response.status,
        message: `non-json response ${text.slice(0, 500)}`,
      });
      console.log(`[Liquipedia API Non-JSON Body] ${text.slice(0, 500)}`);
      if (shouldCooldownProxyForError(errorClass)) {
        await markProxyFailure(activeProxyId, {
          errorClass,
          errorMessage: `Liquipedia API non-JSON response ${response.status}`,
          durationMs: Date.now() - startedAt,
          blocked: errorClass === "cloudflare_block",
        });
      }
      await logLiquipediaRequest({
        mode: requestMode,
        proxyId: activeProxyId,
        statusCode: response.status,
        errorClass,
        durationMs: Date.now() - startedAt,
        bytesIn: text.length,
        queryHash: hashQuery(url.toString()),
      });
      throw new Error(`Liquipedia API returned non-JSON response. This usually means the request was blocked by Cloudflare or Liquipedia. (Status: ${response.status})`);
    }

    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as T;
      await markProxySuccess(activeProxyId, Date.now() - startedAt);
      await logLiquipediaRequest({
        mode: requestMode,
        proxyId: activeProxyId,
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
        bytesIn: text.length,
        queryHash: hashQuery(url.toString()),
      });
      return parsed;
    } catch {
      await logLiquipediaRequest({
        mode: requestMode,
        proxyId: activeProxyId,
        statusCode: response.status,
        errorClass: "parse_failed",
        durationMs: Date.now() - startedAt,
        bytesIn: text.length,
        queryHash: hashQuery(url.toString()),
      });
      throw new Error(`Liquipedia API returned invalid JSON. Body length: ${text.length}`);
    }
  };

  return isParse ? withParseRateLimit(execute) : withGenericRateLimit(execute);
}

async function fetchHtmlViaMediaWikiApi(pageUrl: string) {
  const url = new URL(pageUrl);
  const [, slug, ...titleParts] = url.pathname.split("/");
  const title = decodeURIComponent(titleParts.join("/")).replace(/_/g, " ");
  if (!slug || !title) return "";

  const apiUrl = `${url.origin}/${slug}/api.php`;
  const response = await apiRequest<{ parse?: { text?: { "*"?: string } } }>(
    apiUrl,
    {
      action: "parse",
      format: "json",
      page: title,
      prop: "text",
      disabletoc: "1",
      redirects: "1"
    },
    true
  );

  return response.parse?.text?.["*"] ?? "";
}

function stripHtml(value: string) {
  return value
    .replace(/<span class=\"searchmatch\">/g, "")
    .replace(/<\/span>/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}
