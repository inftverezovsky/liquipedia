import { getLiquipediaDota2ApiUrl, getLiquipediaUserAgent } from "@/lib/env";
import { withGenericRateLimit, withParseRateLimit } from "@/lib/liquipedia/rateLimiter";

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
        limit: "50"
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
        srlimit: "50",
        format: "json"
      });
      const searchTitles = searchResponse.query?.search?.map(s => s.title) ?? [];
      searchTitles.forEach(t => allTitlesSet.add(t));
    } catch (err) {
      console.error(`Search variation "${v}" failed:`, err);
    }
  }));

  const allTitles = Array.from(allTitlesSet);
  if (allTitles.length > 0) {
    try {
      // Process in chunks to avoid URL length limits
      const chunkSize = 40;
      const pages: any[] = [];
      const normalizedMap = new Map<string, string>();
      const redirectsMap = new Map<string, string>();

      for (let i = 0; i < allTitles.length; i += chunkSize) {
        const chunk = allTitles.slice(i, i + chunkSize);
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
      const activeResults = new Map<string, { title: string, dates: string | null }>();
      
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
        if (!isTournament) continue;

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

        // 4. Hide if no dates found at all
        if (!startdateMatch && !enddateMatch) {
          shouldHide = true;
        }

        if (!shouldHide) {
          let datesStr = null;
          if (startdateMatch || enddateMatch) {
            datesStr = [startdateMatch, enddateMatch].filter(Boolean).join(" — ");
          }
          activeResults.set(p.title, { title: p.title, dates: datesStr });
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
            pageId: 0,
            title: title,
            pageUrl: titleToUrl.get(title) ?? makeLiquipediaPageUrl(title, disciplineSlug),
            snippet: "",
            score: score,
            wordCount: null,
            dates: activeInfo.dates
          });
        }
      }

      // Final sort by score
      results.sort((a, b) => (b.score || 0) - (a.score || 0));

      return results.slice(0, limit);
    } catch (err) {
      console.error("Failed to filter search results:", err);
    }
  }

  return [];
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

import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { prisma } from "@/lib/db";
import nodeFetch from "node-fetch";

export async function fetchHtml(url: string): Promise<string> {
  const fetchOptions: any = {
    method: "GET",
    headers: {
      "User-Agent": getLiquipediaUserAgent(),
      "Accept-Encoding": "gzip",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
    }
  };

  const settings = await prisma.globalSettings.findMany({
    where: { key: { in: ['proxy_host', 'proxy_port', 'proxy_username', 'proxy_password'] } }
  });
  const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);
  
  if (config.proxy_host && config.proxy_port) {
    const isSocks = config.proxy_host.startsWith('socks') || config.proxy_port === '10800'; 
    let protocol = isSocks ? 'socks5' : 'http';
    let proxyStr = `${protocol}://`;
    if (config.proxy_username && config.proxy_password) {
      proxyStr += `${config.proxy_username}:${config.proxy_password}@`;
    }
    proxyStr += `${config.proxy_host.replace(/^(socks5:\/\/|http:\/\/)/, '')}:${config.proxy_port}`;
    fetchOptions.agent = isSocks ? new SocksProxyAgent(proxyStr) : new HttpsProxyAgent(proxyStr);
  }

  const response = await nodeFetch(url, fetchOptions as any);
  if (!response.ok) {
    throw new Error(`Failed to fetch HTML ${response.status} from ${url}`);
  }
  return response.text();
}

export async function apiRequest<T>(apiUrl: string, params: Record<string, string>, isParse = false): Promise<T> {
  const execute = async () => {
    const url = new URL(apiUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    console.log(`[Liquipedia API Request] URL: ${url.toString()}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const userAgent = getLiquipediaUserAgent();
    const finalUserAgent = userAgent.includes("change-me") 
      ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (TCyber/1.0)"
      : userAgent;

    const fetchOptions: any = {
      method: "GET",
      headers: {
        "User-Agent": finalUserAgent,
        "Accept-Encoding": "gzip",
        Accept: "application/json"
      },
      signal: controller.signal
    };

    // Load proxy settings
    const settings = await prisma.globalSettings.findMany({
      where: { key: { in: ['proxy_host', 'proxy_port', 'proxy_username', 'proxy_password'] } }
    });
    const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);
    
    if (config.proxy_host && config.proxy_port) {
      const isSocks = config.proxy_host.startsWith('socks') || config.proxy_port === '10800'; 
      let protocol = isSocks ? 'socks5' : 'http';
      
      let proxyStr = `${protocol}://`;
      if (config.proxy_username && config.proxy_password) {
        proxyStr += `${config.proxy_username}:${config.proxy_password}@`;
      }
      proxyStr += `${config.proxy_host.replace(/^(socks5:\/\/|http:\/\/)/, '')}:${config.proxy_port}`;
      
      try {
        fetchOptions.agent = isSocks ? new SocksProxyAgent(proxyStr) : new HttpsProxyAgent(proxyStr);
        console.log(`[Liquipedia API] Using ${protocol.toUpperCase()} Proxy: ${config.proxy_host}:${config.proxy_port}`);
      } catch (proxyErr) {
        console.error(`[Liquipedia API] Proxy Agent Init Error:`, proxyErr);
      }
    }

    const response = await nodeFetch(url.toString(), fetchOptions as any).finally(() => clearTimeout(timeoutId));

    const contentType = response.headers.get("content-type") || "";
    console.log(`[Liquipedia API Response] Status: ${response.status}, Content-Type: ${contentType}`);

    if (!response.ok) {
      const text = await response.text();
      console.log(`[Liquipedia API Error Body] ${text.slice(0, 500)}`);
      throw new Error(`Liquipedia API error ${response.status}: ${text.slice(0, 300)}`);
    }

    if (!contentType.includes("application/json") && !contentType.includes("application/mediawiki+json")) {
      const text = await response.text();
      console.log(`[Liquipedia API Non-JSON Body] ${text.slice(0, 500)}`);
      throw new Error(`Liquipedia API returned non-JSON response. This usually means the request was blocked by Cloudflare or Liquipedia. (Status: ${response.status})`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Liquipedia API returned invalid JSON. Body length: ${text.length}`);
    }
  };

  return isParse ? withParseRateLimit(execute) : withGenericRateLimit(execute);
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
