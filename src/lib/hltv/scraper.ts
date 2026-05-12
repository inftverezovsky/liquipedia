import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { markProxyFailure, markProxySuccess, maskProxyUrl, selectProxyCandidate } from "@/lib/proxySelector";
import {
  classifyParserError,
  emptyValidIfNoItems,
  isBlockedParserError,
  normalizeParserErrorClass,
  type ParserErrorClass,
} from "@/lib/parserErrors";

let hltvHeavyQueue: Promise<any> = Promise.resolve();
let hltvHealthQueue: Promise<any> = Promise.resolve();
const activeRequests = new Map<string, Promise<any>>();

export type HltvMode = "scrape" | "search" | "event" | "events" | "health";

const HLTV_MODES = new Set<HltvMode>(["scrape", "search", "event", "events", "health"]);
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const HLTV_CACHE_DIR = path.join(process.cwd(), "cache", "hltv");

type HltvProxyCandidate = {
  proxyStr: string;
  proxyId: string | null;
};

export async function runHltvScript(mode: HltvMode, queryOrId?: string, options: { noCache?: boolean } = {}) {
  if (!HLTV_MODES.has(mode)) {
    throw new Error(`Unsupported HLTV scraper mode: ${mode}`);
  }

  if (mode === "search" && queryOrId && !options.noCache) {
    const relatedCache = readRelatedHltvSearchCache(queryOrId);
    if (relatedCache) {
      return {
        ok: true,
        events: relatedCache.events,
        cacheHit: true,
        cacheLayer: "file-related",
        stale: true,
      };
    }
  }

  const requestKey = `${mode}:${queryOrId}:${options.noCache ? "force" : "cached"}`;
  
  // DEDUPLICATION: If exactly the same request is already running, return its promise
  if (activeRequests.has(requestKey)) {
    console.log(`[HLTV Queue] Attaching to existing active request for ${requestKey}`);
    return activeRequests.get(requestKey);
  }

  const isHealth = mode === "health";
  const currentPromise = isHealth ? hltvHealthQueue : hltvHeavyQueue;
  const requestId = Math.random().toString(36).substring(7);
  
  console.log(`[HLTV Queue] New request ${requestId} (${requestKey}) added to queue.`);
  
  const nextPromise = (async () => {
    try {
      await currentPromise;
      console.log(`[HLTV Queue] Request ${requestId} is now STARTING.`);
    } catch (e) {
      console.log(`[HLTV Queue] Request ${requestId} is now STARTING (previous failed).`);
    }
    
    try {
      const result = await executeScraper(mode, queryOrId, requestId, 1, false, options);
      return result;
    } finally {
      // Cleanup after completion
      activeRequests.delete(requestKey);
    }
  })();

  activeRequests.set(requestKey, nextPromise);
  if (isHealth) hltvHealthQueue = nextPromise;
  else hltvHeavyQueue = nextPromise;
  return nextPromise;
}

async function executeScraper(mode: HltvMode, queryOrId?: string, requestId = "hltv", attempt = 1, direct = false, options: { noCache?: boolean } = {}): Promise<any> {
  const MAX_ATTEMPTS = getMaxAttempts(mode);
  let proxyStr = "";
  let selectedProxyId: string | null = null;
  const startedAt = Date.now();

  if (!direct) {
    const candidate = await getHltvProxyCandidate(attempt);
    if (candidate) {
      proxyStr = candidate.proxyStr;
      selectedProxyId = candidate.proxyId;
      if (selectedProxyId) {
        await prisma.proxyPool.update({
          where: { id: selectedProxyId },
          data: { lastUsed: new Date() }
        }).catch(() => {});
      }
    }
  }

  if (!proxyStr && !direct) {
    throw new Error("Прокси не настроены. Пожалуйста, добавьте прокси в Proxy Pool.");
  }

  const isHealth = mode === 'health';
  const args = ["scripts/hltv_playwright.mjs", "--mode", mode];
  if (proxyStr) args.push("--proxy", proxyStr);
  if (options.noCache) args.push("--no-cache");
  args.push("--request-id", requestId);

  if (mode === "search" && queryOrId) {
    args.push("--q", queryOrId);
  } else if (mode === "event" && queryOrId) {
    args.push("--id", queryOrId);
  }

  console.log(`[HLTV Scraper Lib] Executing request=${requestId} proxyId=${selectedProxyId ?? "none"} mode=${mode} attempt=${attempt}/${MAX_ATTEMPTS}${direct ? " direct" : ""}: node scripts/hltv_playwright.mjs ${proxyStr ? `--proxy ${maskProxyUrl(proxyStr)} ` : ""}--mode ${mode}`);

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timeoutSettling = false;

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const settleResolve = (value: any) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      resolve(value);
      return true;
    };

    const settleReject = (error: Error) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      reject(error);
      return true;
    };

    const timer = setTimeout(() => {
      timedOut = true;
      timeoutSettling = true;
      forceKillChild(child.pid);
      void handleChildTimeout();
    }, getTimeoutMs(mode));

    const handleChildTimeout = async () => {
      const errorClass = classifyHltvError("HLTV request timed out. Proxy might be too slow.", true);
      const durationMs = Date.now() - startedAt;

      await markProxyFailure(selectedProxyId, {
        errorClass,
        errorMessage: "HLTV request timed out. Proxy might be too slow.",
        durationMs,
      });
      await logParserRequest({
        source: "hltv",
        mode,
        proxyId: selectedProxyId,
        attempt,
        errorClass,
        durationMs,
        bytesIn: stdout.length + stderr.length,
      });

      const relatedCache = mode === "search" ? readRelatedHltvSearchCache(queryOrId) : null;
      if (relatedCache) {
        console.log(`[HLTV Scraper Lib] Returning related HLTV search cache after timeout.`);
        settleResolve({
          ok: true,
          events: relatedCache.events,
          cacheHit: true,
          cacheLayer: "file-related",
          stale: true,
          warning: "HLTV upstream timed out, returned related cache.",
        });
        return;
      }

      const finalError = new Error("HLTV request timed out. Proxy might be too slow.") as Error & { errorClass?: string };
      finalError.errorClass = errorClass;
      settleReject(finalError);
    };

    const appendCapped = (current: string, chunk: Buffer) => {
      const next = current + chunk.toString("utf8");
      return next.length > MAX_OUTPUT_BYTES ? next.slice(-MAX_OUTPUT_BYTES) : next;
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendCapped(stdout, chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendCapped(stderr, chunk);
    });

    child.on("error", async (error) => {
      if (settled || timeoutSettling) return;
      clearTimeout(timer);
      console.error(`[HLTV Scraper Lib] Spawn error on attempt ${attempt}: ${error.message}`);
      const durationMs = Date.now() - startedAt;
      await markProxyFailure(selectedProxyId, {
        errorClass: "process_failed",
        errorMessage: error.message,
        durationMs,
      });
      await logParserRequest({
        source: "hltv",
        mode,
        proxyId: selectedProxyId,
        attempt,
        errorClass: "process_failed",
        durationMs,
      });

      if (attempt < MAX_ATTEMPTS) {
        console.log(`[HLTV Scraper Lib] Retrying in 2 seconds...`);
        await new Promise(r => setTimeout(r, 2000));
        executeScraper(mode, queryOrId, requestId, attempt + 1, direct, options).then(resolve, reject);
        return;
      }

      return settleReject(new Error("HLTV scraper failed to start."));
    });

    child.on("close", async (code) => {
      if (settled || timeoutSettling) return;
      clearTimeout(timer);
      if (code !== 0 || timedOut) {
        const errorMessage = pickHltvErrorLine(stderr, stdout) || "Unknown scraper failure";
        const errorClass = classifyHltvError(errorMessage, timedOut);
        const durationMs = Date.now() - startedAt;
        console.error(`[HLTV Scraper Lib] Process failed request=${requestId} proxyId=${selectedProxyId ?? "none"} mode=${mode} attempt=${attempt} class=${errorClass}: ${errorMessage}`);
        
        await markProxyFailure(selectedProxyId, {
          errorClass,
          errorMessage,
          durationMs,
          blocked: isBlockedParserError(errorClass),
        });
        await logParserRequest({
          source: "hltv",
          mode,
          proxyId: selectedProxyId,
          attempt,
          errorClass,
          durationMs,
          bytesIn: stdout.length + stderr.length,
        });

        if (shouldRetry(mode, errorClass, attempt, MAX_ATTEMPTS)) {
          console.log(`[HLTV Scraper Lib] Retrying in 2 seconds...`);
          await new Promise(r => setTimeout(r, 2000));
        executeScraper(mode, queryOrId, requestId, attempt + 1, direct, options).then(resolve, reject);
          return;
        }

        if (allowDirectFallback() && !direct && errorClass === "proxy_tunnel") {
          console.log(`[HLTV Scraper Lib] Proxy tunnel failed, retrying once without proxy...`);
          executeScraper(mode, queryOrId, requestId, 1, true, options).then(resolve, reject);
          return;
        }

        const relatedCache = mode === "search" ? readRelatedHltvSearchCache(queryOrId) : null;
        if (relatedCache) {
          console.log(`[HLTV Scraper Lib] Returning related HLTV search cache after ${errorClass}.`);
          settleResolve({
            ok: true,
            events: relatedCache.events,
            cacheHit: true,
            cacheLayer: "file-related",
            stale: true,
            warning: `HLTV upstream failed (${errorClass}), returned related cache.`,
          });
          return;
        }
        
        const finalError = new Error(timedOut ? "HLTV request timed out. Proxy might be too slow." : "HLTV scraper failed. Proxy might be blocked.") as Error & { errorClass?: string };
        finalError.errorClass = errorClass;
        return settleReject(finalError);
      }

      try {
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const data = JSON.parse(lastLine);
        
        if (data.ok) {
          const durationMs = Date.now() - startedAt;
          const matchesCount = Array.isArray(data.matches) ? data.matches.length : null;
          const eventsCount = Array.isArray(data.events) ? data.events.length : null;
          const emptyErrorClass = classifyHltvEmptyResult(mode, data, matchesCount, eventsCount);
          const staleErrorClass = data.stale && data.warning
            ? classifyHltvError(data.warning, false)
            : null;
          if (staleErrorClass) {
            await markProxyFailure(selectedProxyId, {
              errorClass: staleErrorClass,
              errorMessage: data.warning,
              durationMs,
              blocked: isBlockedParserError(staleErrorClass),
            });
          } else {
            await markProxySuccess(selectedProxyId, durationMs);
          }
          await logParserRequest({
            source: "hltv",
            mode,
            proxyId: selectedProxyId,
            attempt,
            durationMs,
            bytesIn: stdout.length + stderr.length,
            cacheHit: !!data.cacheHit,
            cacheLayer: data.cacheLayer || (data.cacheHit ? "file" : null),
            errorClass: staleErrorClass || emptyErrorClass,
            matchesCount,
            eventsCount,
          });
          settleResolve(data);
        } else {
          const errorClass = classifyHltvError(data.error || "unknown", false);
          const durationMs = Date.now() - startedAt;
          await markProxyFailure(selectedProxyId, {
            errorClass,
            errorMessage: data.error || "unknown",
            durationMs,
            blocked: isBlockedParserError(errorClass),
          });
          await logParserRequest({
            source: "hltv",
            mode,
            proxyId: selectedProxyId,
            attempt,
            errorClass,
            durationMs,
            bytesIn: stdout.length + stderr.length,
          });

          if (shouldRetry(mode, errorClass, attempt, MAX_ATTEMPTS)) {
             console.log(`[HLTV Scraper Lib] Soft error on attempt ${attempt}: ${data.error}. Retrying...`);
             await new Promise(r => setTimeout(r, 2000));
             executeScraper(mode, queryOrId, requestId, attempt + 1, direct, options).then(resolve, reject);
             return;
          }
          if (allowDirectFallback() && !direct && errorClass === "proxy_tunnel") {
            console.log(`[HLTV Scraper Lib] Proxy tunnel failed, retrying once without proxy...`);
            executeScraper(mode, queryOrId, requestId, 1, true, options).then(resolve, reject);
            return;
          }
          const relatedCache = mode === "search" ? readRelatedHltvSearchCache(queryOrId) : null;
          if (relatedCache) {
            console.log(`[HLTV Scraper Lib] Returning related HLTV search cache after ${errorClass}.`);
            settleResolve({
              ok: true,
              events: relatedCache.events,
              cacheHit: true,
              cacheLayer: "file-related",
              stale: true,
              warning: `HLTV upstream failed (${errorClass}), returned related cache.`,
            });
            return;
          }
          const finalError = new Error(data.error || "Unknown scraper error") as Error & { errorClass?: string };
          finalError.errorClass = errorClass;
          return settleReject(finalError);
        }
      } catch (e) {
        const durationMs = Date.now() - startedAt;
        console.error(`[HLTV Scraper Lib] Parse error. Stdout: ${stdout}`);
        await markProxyFailure(selectedProxyId, {
          errorClass: "parse_failed",
          errorMessage: e instanceof Error ? e.message : "Failed to parse scraper output",
          durationMs,
        });
        await logParserRequest({
          source: "hltv",
          mode,
          proxyId: selectedProxyId,
          attempt,
          errorClass: "parse_failed",
          durationMs,
          bytesIn: stdout.length + stderr.length,
        });
        
        if (attempt < Math.min(MAX_ATTEMPTS, 2)) {
          console.log(`[HLTV Scraper Lib] Parse error on attempt ${attempt}. Retrying...`);
          await new Promise(r => setTimeout(r, 2000));
          executeScraper(mode, queryOrId, requestId, attempt + 1, direct, options).then(resolve, reject);
          return;
        }
        
        return settleReject(new Error(`Failed to parse HLTV output after ${MAX_ATTEMPTS} attempts`));
      }
    });
  });
}

async function getHltvProxyCandidate(attempt: number): Promise<HltvProxyCandidate | null> {
  const candidate = await selectProxyCandidate(attempt);
  if (!candidate) return null;
  return { proxyStr: candidate.proxyUrl, proxyId: candidate.proxyId };
}

function getMaxAttempts(mode: HltvMode) {
  if (mode === "health") return 1;
  if (mode === "search") return Number(process.env.HLTV_SEARCH_MAX_ATTEMPTS || 1);
  if (mode === "events" || mode === "scrape") return 2;
  return 3;
}

function getTimeoutMs(mode: HltvMode) {
  if (mode === "health") return 30000;
  if (mode === "search") return Number(process.env.HLTV_SEARCH_TIMEOUT_MS || 45000);
  if (mode === "events" || mode === "scrape") return 90000;
  return 120000;
}

export function classifyHltvError(message: string, timedOut: boolean): ParserErrorClass {
  return classifyParserError({ message, timedOut });
}

function shouldRetry(mode: HltvMode, errorClass: string, attempt: number, maxAttempts: number) {
  if (attempt >= maxAttempts) return false;
  if (mode === "health") return false;
  const normalized = normalizeParserErrorClass(errorClass);

  if (normalized === "empty_valid") return false;
  if (normalized === "selector_changed" || normalized === "source_4xx" || normalized === "proxy_missing") return false;
  if (normalized === "cloudflare_block" || normalized === "parse_failed") return attempt < Math.min(maxAttempts, 2);
  return normalized !== "unknown" || attempt < 2;
}

function allowDirectFallback() {
  return process.env.HLTV_ALLOW_DIRECT_FALLBACK === "1";
}

function forceKillChild(pid?: number) {
  if (!pid) return;

  try {
    process.kill(pid, "SIGKILL");
  } catch {}

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    killer.on("error", () => {});
  }
}

async function logParserRequest(data: {
  source: string;
  mode?: string;
  route?: string;
  disciplineSlug?: string;
  queryHash?: string;
  proxyId?: string | null;
  attempt?: number;
  statusCode?: number;
  errorClass?: string | null;
  durationMs?: number;
  bytesIn?: number;
  bytesOut?: number;
  cacheLayer?: string | null;
  cacheHit?: boolean;
  matchesCount?: number | null;
  eventsCount?: number | null;
}) {
  await prisma.parserRequestLog.create({
    data: {
      source: data.source,
      mode: data.mode,
      route: data.route,
      disciplineSlug: data.disciplineSlug,
      queryHash: data.queryHash,
      proxyId: data.proxyId || null,
      attempt: data.attempt,
      statusCode: data.statusCode,
      errorClass: data.errorClass || null,
      durationMs: data.durationMs,
      bytesIn: data.bytesIn,
      bytesOut: data.bytesOut,
      cacheLayer: data.cacheLayer || null,
      cacheHit: data.cacheHit ?? false,
      matchesCount: data.matchesCount ?? null,
      eventsCount: data.eventsCount ?? null,
    },
  }).catch(() => {});
}

function classifyHltvEmptyResult(mode: HltvMode, data: any, matchesCount: number | null, eventsCount: number | null) {
  if (data.cacheKind === "negative") return "empty_valid";
  if (mode === "search" || mode === "events") return emptyValidIfNoItems([eventsCount]);
  if (mode === "scrape" || mode === "event") return emptyValidIfNoItems([matchesCount]);
  return null;
}

function pickHltvErrorLine(stderr: string, stdout: string) {
  const lines = `${stderr}\n${stdout}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/Using Browser Proxy|Executing request|New request|Request .*STARTING/i.test(line));

  return lines.reverse().find((line) =>
    /ERR_|error|failed|timeout|timed out|cloudflare|captcha|403|407|429|tunnel|selector|parse/i.test(line)
  ) || lines.at(-1) || null;
}

function readRelatedHltvSearchCache(query?: string) {
  if (!query || !fs.existsSync(HLTV_CACHE_DIR)) return null;

  const scored: Array<{ events: any[]; score: number; timestamp: number }> = [];
  for (const entry of fs.readdirSync(HLTV_CACHE_DIR)) {
    if (!entry.endsWith(".json")) continue;

    try {
      const cachePath = path.join(HLTV_CACHE_DIR, entry);
      const data = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      const events = Array.isArray(data?.result?.events) ? data.result.events : [];
      if (events.length === 0) continue;

      const matchingEvents = events
        .map((event: any) => ({ event, score: getSearchMatchScore(query, `${event.title || ""} ${event.url || ""}`) }))
        .filter((item: { score: number }) => item.score > 0)
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
        .map((item: { event: any }) => item.event);

      if (matchingEvents.length > 0) {
        scored.push({
          events: matchingEvents,
          score: getSearchMatchScore(query, matchingEvents.map((event: any) => `${event.title || ""} ${event.url || ""}`).join(" ")),
          timestamp: Number(data.timestamp || 0),
        });
      }
    } catch {}
  }

  scored.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);
  const best = scored[0];
  return best ? { events: best.events.slice(0, Number(process.env.HLTV_SEARCH_MAX_EVENTS || 10)) } : null;
}

function getSearchMatchScore(query: string, value: string) {
  const queryTokens = normalizeSearchTokens(query);
  if (queryTokens.length === 0) return 0;

  const haystack = normalizeSearchText(value);
  let score = 0;
  for (const token of queryTokens) {
    if (!haystack.includes(token)) return 0;
    score += token.length >= 4 ? 3 : 1;
  }
  return score;
}

function normalizeSearchTokens(value: string) {
  return normalizeSearchText(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

function normalizeSearchText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
