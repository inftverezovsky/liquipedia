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

export async function searchTournamentPages(query: string, limit = 10): Promise<LiquipediaSearchResult[]> {
  const response = await apiRequest<SearchApiResponse>({
    action: "opensearch",
    format: "json",
    search: query,
    limit: String(limit)
  });

  let titles = response[1] ?? [];
  const urls = response[3] ?? [];

  if (titles.length > 0) {
    try {
      const infoResponse = await apiRequest<PageApiResponse>({
        action: "query",
        format: "json",
        formatversion: "2",
        prop: "revisions",
        rvprop: "content",
        rvslots: "main",
        titles: titles.join("|"),
        redirects: "1"
      });

      const pages = infoResponse.query?.pages || [];
      const now = Date.now() - 24 * 60 * 60 * 1000; // 1 day buffer
      const activeResults = new Map<string, { title: string, dates: string | null }>();

      for (const p of pages) {
        const wikitext = p.revisions?.[0]?.slots?.main?.content;
        const enddateMatch = wikitext?.match(/\|\s*(?:edate|enddate|end_date|date2|date_end)\s*=\s*([^|\n]+)/i)?.[1]?.trim();
        const startdateMatch = wikitext?.match(/\|\s*(?:sdate|startdate|start_date|date|date_start)\s*=\s*([^|\n]+)/i)?.[1]?.trim();
        
        let isPast = false;
        if (enddateMatch) {
          const endDate = new Date(enddateMatch);
          if (!isNaN(endDate.getTime()) && endDate.getTime() < now) {
            isPast = true;
          }
        }
        
        if (!isPast) {
          let datesStr = null;
          if (startdateMatch || enddateMatch) {
            datesStr = [startdateMatch, enddateMatch].filter(Boolean).join(" — ");
          }
          activeResults.set(p.title, { title: p.title, dates: datesStr });
        }
      }

      // Also map via normalized titles if API did normalization
      if (infoResponse.query?.normalized) {
        for (const norm of infoResponse.query.normalized) {
          const info = activeResults.get(norm.to);
          if (info) activeResults.set(norm.from, info);
        }
      }
      if (infoResponse.query?.redirects) {
        for (const redir of infoResponse.query.redirects) {
          const info = activeResults.get(redir.to);
          if (info) activeResults.set(redir.from, info);
        }
      }

      const results: LiquipediaSearchResult[] = [];
      for (let i = 0; i < titles.length; i++) {
        const titleSpace = titles[i].replace(/_/g, " ");
        const activeInfo = activeResults.get(titleSpace) || activeResults.get(titles[i]);
        if (activeInfo) {
          results.push({
            pageId: 0,
            title: titles[i],
            pageUrl: urls[i] ?? makeLiquipediaPageUrl(titles[i]),
            snippet: "",
            score: limit - i,
            wordCount: null,
            dates: activeInfo.dates
          });
        }
      }

      return results;
    } catch (err) {
      console.error("Failed to filter finished tournaments:", err);
      // fallback to unfiltered if the query fails
    }
  }

  return titles.map((title, index) => ({
    pageId: 0,
    title,
    pageUrl: urls[index] ?? makeLiquipediaPageUrl(title),
    snippet: "",
    score: limit - index,
    wordCount: null
  }));
}

export async function fetchPageWikitext(input: { pageId?: number; title?: string }): Promise<LiquipediaPageContent> {
  const params: Record<string, string> = {
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "info|revisions",
    inprop: "url",
    rvprop: "content|timestamp|ids",
    rvslots: "main",
    redirects: "1"
  };

  if (input.pageId) {
    params.pageids = String(input.pageId);
  } else if (input.title) {
    params.titles = input.title;
  } else {
    throw new Error("fetchPageWikitext requires pageId or title");
  }

  const response = await apiRequest<PageApiResponse>(params);
  const page = response.query?.pages?.[0];

  if (!page || page.missing) {
    throw new Error("Liquipedia page not found");
  }

  const revision = page.revisions?.[0];
  const wikitext = revision?.slots?.main?.content ?? revision?.slots?.main?.["*"] ?? revision?.["*"] ?? "";

  if (!wikitext) {
    throw new Error("Liquipedia page has no wikitext content in API response");
  }

  return {
    pageId: page.pageid,
    title: page.title,
    fullUrl: page.fullurl ?? makeLiquipediaPageUrl(page.title),
    wikitext,
    raw: response
  };
}

export function makeLiquipediaPageUrl(title: string) {
  const normalized = title.trim().replace(/ /g, "_");
  return `https://liquipedia.net/dota2/${encodeURIComponent(normalized).replace(/%2F/g, "/")}`;
}

export async function fetchPageParsed(title: string): Promise<string> {
  const response = await apiRequest<{ parse?: { text?: { "*"?: string } } }>(
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

async function apiRequest<T>(params: Record<string, string>, isParse = false): Promise<T> {
  const execute = async () => {
    const url = new URL(getLiquipediaDota2ApiUrl());
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    console.log(`[Liquipedia API Request] URL: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": getLiquipediaUserAgent(),
        "Accept-Encoding": "gzip",
        Accept: "application/json"
      }
    });

    const contentType = response.headers.get("content-type") || "";
    console.log(`[Liquipedia API Response] Status: ${response.status}, Content-Type: ${contentType}`);

    if (!response.ok) {
      const text = await response.text();
      console.log(`[Liquipedia API Error Body] ${text.slice(0, 120)}`);
      throw new Error(`Liquipedia API error ${response.status}: ${text.slice(0, 300)}`);
    }

    if (!contentType.includes("application/json") && !contentType.includes("application/mediawiki+json")) {
      const text = await response.text();
      console.log(`[Liquipedia API Non-JSON Body] ${text.slice(0, 120)}`);
      throw new Error(`Liquipedia API returned non-JSON response. Content-Type: ${contentType}. Check API URL, User-Agent, rate limit, or blocked request.`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Liquipedia API returned invalid JSON. Body: ${text.slice(0, 120)}`);
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
