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
const LIQUIPEDIA_SEARCH_METADATA_TTL_MS = Number(process.env.LIQUIPEDIA_SEARCH_METADATA_TTL_SECONDS || 24 * 60 * 60) * 1000;

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
  pageId: number;
  title: string;
  pageUrl: string;
  isTournament: boolean;
  dates: string | null;
  fetchedAt: number;
};

export async function searchTournamentPages(query: string, apiUrl: string, disciplineSlug: string, limit = 10): Promise<LiquipediaSearchResult[]> {
  const currentYear = new Date().getFullYear();
  const variations = [query];
  if (query.includes(" ")) {
    variations.push(query.replace(/ /g, "/"));
  }
  // Add year variations for better coverage of recent/upcoming tournaments
  if (query.length >= 3 && !query.match(/\d{4}/)) {
    variations.push(`${query} ${currentYear}`);
    variations.push(`${query} ${currentYear + 1}`);
  }

  const allTitlesSet = new Set<string>();
  const titleToUrl = new Map<string, string>();

  // Run variations in parallel to save time
  await Promise.all(variations.map(async (v) => {
    try {
      // 1. Prefix search (Opensearch)
      const openResponse = await apiRequest<SearchApiResponse>(apiUrl, {
        action: "opensearch",
        format: "json",
        search: v,
        limit: "20"
      });
      const openTitles = openResponse[1] ?? [];
      const openUrls = openResponse[3] ?? [];
      openTitles.forEach((t, i) => {
        allTitlesSet.add(t);
        if (openUrls[i]) titleToUrl.set(t, openUrls[i]);
      });

      // 2. Full-text search (list=search)
      const searchResponse = await apiRequest<{ query?: { search?: Array<{ title: string }> } }>(apiUrl, {
        action: "query",
        list: "search",
        srsearch: v,
        srlimit: "20",
        format: "json"
      });
      const searchTitles = searchResponse.query?.search?.map(s => s.title) ?? [];
      searchTitles.forEach(t => allTitlesSet.add(t));
    } catch (err) {
      console.error(`Search variation "${v}" failed:`, err);
    }
  }));

  const allTitles = Array.from(allTitlesSet).slice(0, LIQUIPEDIA_SEARCH_CANDIDATE_LIMIT);
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
        });
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

        if (!shouldHide) {
          let datesStr = null;
          if (startdateMatch || enddateMatch) {
            datesStr = [startdateMatch, enddateMatch].filter(Boolean).join(" — ");
          }
          const pageUrl = titleToUrl.get(p.title) ?? makeLiquipediaPageUrl(p.title, disciplineSlug);
          activeResults.set(p.title, { title: p.title, pageId: p.pageid ?? 0, pageUrl, dates: datesStr });
          setCachedSearchPageMetadata(disciplineSlug, p.title, {
            pageId: p.pageid ?? 0,
            title: p.title,
            pageUrl,
            isTournament: true,
            dates: datesStr,
            fetchedAt: Date.now(),
          });
        } else {
          setCachedSearchPageMetadata(disciplineSlug, p.title, {
            pageId: p.pageid ?? 0,
            title: p.title,
            pageUrl: titleToUrl.get(p.title) ?? makeLiquipediaPageUrl(p.title, disciplineSlug),
            isTournament: false,
            dates: null,
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

      // If strict current/upcoming filtering found nothing, still return tournament
      // pages so exact searches and older imports remain usable.
      const fallbackResults = pages
        .filter((p) => {
          const wikitext = p.revisions?.[0]?.slots?.main?.content;
          return wikitext && /\{\{\s*(?:Infobox\s+league|Infobox\s+tournament|LeagueInfobox|TournamentInfobox)/i.test(wikitext);
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
    if (!metadata?.fetchedAt || Date.now() - metadata.fetchedAt > LIQUIPEDIA_SEARCH_METADATA_TTL_MS) {
      return null;
    }

    return metadata;
  } catch {
    return null;
  }
}

function setCachedSearchPageMetadata(disciplineSlug: string, title: string, metadata: SearchPageMetadata) {
  try {
    const cachePath = getSearchPageMetadataPath(disciplineSlug, title);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(metadata));
  } catch {}
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

export async function fetchPagesWikitext(apiUrl: string, disciplineSlug: string, titles: string[]): Promise<LiquipediaPageContent[]> {
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

    const response = await apiRequest<PageApiResponse>(apiUrl, params);
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

export async function fetchPageWikitext(apiUrl: string, disciplineSlug: string, input: { pageId?: number; title?: string }): Promise<LiquipediaPageContent> {
  const pages = await fetchPagesWikitext(apiUrl, disciplineSlug, input.title ? [input.title] : []);
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
    const response = await apiRequest<PageApiResponse>(apiUrl, params);
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

export async function fetchPageRevision(apiUrl: string, disciplineSlug: string, input: { pageId?: number; title?: string }): Promise<LiquipediaPageRevision> {
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

  const response = await apiRequest<PageApiResponse>(apiUrl, params);
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

export async function fetchPageParsed(apiUrl: string, title: string): Promise<string> {
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

export async function apiRequest<T>(apiUrl: string, params: Record<string, string>, isParse = false, retryCount = 0): Promise<T> {
  const execute = async () => {
    const url = new URL(apiUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    console.log(`[Liquipedia API Request] URL: ${url.toString()}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LIQUIPEDIA_API_TIMEOUT_MS);

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
    if (!proxy?.proxyUrl) {
      throw new Error("Прокси не настроены. Пожалуйста, добавьте прокси в Proxy Pool.");
    }

    fetchOptions.agent = proxy.proxyUrl.startsWith('socks') ? new SocksProxyAgent(proxy.proxyUrl) : new HttpsProxyAgent(proxy.proxyUrl);
    console.log(`[Liquipedia API] Using Proxy from Pool: ${maskProxyUrl(proxy.proxyUrl)}`);

    let response;
    const startedAt = Date.now();
    try {
      response = await nodeFetch(url.toString(), fetchOptions as any).finally(() => clearTimeout(timeoutId));
    } catch (e: any) {
      const durationMs = Date.now() - startedAt;
      const errorClass = classifyParserError({ message: e.message });
      await markProxyFailure(proxy.proxyId, {
        errorClass,
        errorMessage: e.message,
        durationMs,
      });
      await logLiquipediaRequest({
        mode: isParse ? "parse" : "api",
        proxyId: proxy.proxyId,
        errorClass,
        durationMs,
        queryHash: hashQuery(url.toString()),
      });
      if (retryCount < LIQUIPEDIA_API_MAX_RETRIES) {
        console.log(`[Liquipedia API] Network error, rotating proxy and retrying (Attempt ${retryCount + 1})...`);
        return apiRequest<T>(apiUrl, params, isParse, retryCount + 1);
      }
      throw e;
    }

    if (response.status === 424 || response.status === 403) {
      const durationMs = Date.now() - startedAt;
      const errorClass = classifyParserError({ statusCode: response.status, message: `Liquipedia blocked with ${response.status}` });
      await markProxyFailure(proxy.proxyId, {
        errorClass,
        errorMessage: `Liquipedia blocked with ${response.status}`,
        durationMs,
        blocked: true,
      });
      await logLiquipediaRequest({
        mode: isParse ? "parse" : "api",
        proxyId: proxy.proxyId,
        statusCode: response.status,
        errorClass,
        durationMs,
        queryHash: hashQuery(url.toString()),
      });
      if (retryCount < LIQUIPEDIA_API_MAX_RETRIES) {
        console.log(`[Liquipedia API] Blocked (${response.status}), rotating proxy and retrying (Attempt ${retryCount + 1})...`);
        return apiRequest<T>(apiUrl, params, isParse, retryCount + 1);
      }
    }

    const contentType = response.headers.get("content-type") || "";
    console.log(`[Liquipedia API Response] Status: ${response.status}, Content-Type: ${contentType}`);

    if (!response.ok) {
      const text = await response.text();
      const errorClass = classifyParserError({ statusCode: response.status, message: text });
      console.log(`[Liquipedia API Error Body] ${text.slice(0, 500)}`);
      if (shouldCooldownProxyForError(errorClass)) {
        await markProxyFailure(proxy.proxyId, {
          errorClass,
          errorMessage: `Liquipedia API error ${response.status}: ${text.slice(0, 300)}`,
          durationMs: Date.now() - startedAt,
          blocked: errorClass === "cloudflare_block",
        });
      }
      await logLiquipediaRequest({
        mode: isParse ? "parse" : "api",
        proxyId: proxy.proxyId,
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
        await markProxyFailure(proxy.proxyId, {
          errorClass,
          errorMessage: `Liquipedia API non-JSON response ${response.status}`,
          durationMs: Date.now() - startedAt,
          blocked: errorClass === "cloudflare_block",
        });
      }
      await logLiquipediaRequest({
        mode: isParse ? "parse" : "api",
        proxyId: proxy.proxyId,
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
      await markProxySuccess(proxy.proxyId, Date.now() - startedAt);
      await logLiquipediaRequest({
        mode: isParse ? "parse" : "api",
        proxyId: proxy.proxyId,
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
        bytesIn: text.length,
        queryHash: hashQuery(url.toString()),
      });
      return parsed;
    } catch {
      await logLiquipediaRequest({
        mode: isParse ? "parse" : "api",
        proxyId: proxy.proxyId,
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
