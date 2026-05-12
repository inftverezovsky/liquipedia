import { prisma } from "@/lib/db";
import { isBlockedParserError, normalizeParserErrorClass, shouldCooldownProxyForError } from "@/lib/parserErrors";

const PROXY_POOL_CACHE_TTL_MS = Number(process.env.PROXY_POOL_CACHE_TTL_MS || 15000);
const PROXY_COOLDOWN_MS = Number(process.env.PROXY_COOLDOWN_MS || 10 * 60 * 1000);

type CachedProxy = {
  id: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  failCount: number;
  blockedCount: number;
  avgLatencyMs: number | null;
  lastUsed: Date | null;
};

export type ProxyCandidate = {
  proxyId: string;
  proxyUrl: string;
};

let proxyCache: { expiresAt: number; proxies: CachedProxy[] } | null = null;

export async function selectProxyCandidate(attempt = 1): Promise<ProxyCandidate | null> {
  const proxies = await getActiveProxyPool();
  if (proxies.length === 0) return null;

  const ranked = [...proxies].sort((a, b) => proxyScore(a) - proxyScore(b));
  const candidate = ranked[(attempt - 1) % Math.min(ranked.length, 5)];
  const proxyUrl = buildProxyUrl(
    candidate.protocol,
    candidate.host,
    candidate.port,
    rotateProxySession(candidate.username || ""),
    candidate.password || ""
  );

  if (!proxyUrl) return null;
  return { proxyId: candidate.id, proxyUrl };
}

export async function markProxySuccess(proxyId: string | null, durationMs?: number) {
  if (!proxyId) return;

  await prisma.proxyPool.update({
    where: { id: proxyId },
    data: {
      lastUsed: new Date(),
      lastError: null,
      cooldownUntil: null,
      successCount: { increment: 1 },
      avgLatencyMs: durationMs ? { set: await nextAverageLatency(proxyId, durationMs) } : undefined,
    },
  }).catch(() => {});

  proxyCache = null;
}

export async function markProxyFailure(proxyId: string | null, params: {
  errorClass?: string;
  errorMessage?: string;
  durationMs?: number;
  blocked?: boolean;
}) {
  if (!proxyId) return;

  const normalizedErrorClass = normalizeParserErrorClass(params.errorClass);
  const isBlocked = params.blocked || isBlockedParserError(normalizedErrorClass);
  const shouldCooldown = shouldCooldownProxyForError(normalizedErrorClass);
  const cooldownUntil = shouldCooldown ? new Date(Date.now() + PROXY_COOLDOWN_MS) : undefined;

  await prisma.proxyPool.update({
    where: { id: proxyId },
    data: {
      lastUsed: new Date(),
      failCount: { increment: 1 },
      blockedCount: isBlocked ? { increment: 1 } : undefined,
      cooldownUntil,
      lastError: params.errorMessage?.slice(0, 1000) || normalizedErrorClass,
      avgLatencyMs: params.durationMs ? { set: await nextAverageLatency(proxyId, params.durationMs) } : undefined,
    },
  }).catch(() => {});

  proxyCache = null;
}

export function maskProxyUrl(proxyUrl: string) {
  try {
    const parsed = new URL(proxyUrl);
    if (parsed.password) parsed.password = "***";
    if (parsed.username) parsed.username = `${parsed.username.slice(0, 4)}***`;
    return parsed.toString();
  } catch {
    return "[invalid proxy]";
  }
}

async function getActiveProxyPool() {
  const now = Date.now();
  if (proxyCache && proxyCache.expiresAt > now) return proxyCache.proxies;

  let proxies = await prisma.proxyPool.findMany({
    where: {
      isActive: true,
      OR: [
        { cooldownUntil: null },
        { cooldownUntil: { lt: new Date() } },
      ],
    },
    orderBy: [
      { failCount: "asc" },
      { lastUsed: "asc" },
    ],
    take: 50,
  });

  if (proxies.length === 0) {
    proxies = await prisma.proxyPool.findMany({
      where: { isActive: true },
      orderBy: [
        { failCount: "asc" },
        { blockedCount: "asc" },
        { cooldownUntil: "asc" },
        { lastUsed: "asc" },
      ],
      take: 10,
    });
  }

  proxyCache = {
    expiresAt: now + PROXY_POOL_CACHE_TTL_MS,
    proxies: proxies.map((proxy) => ({
      id: proxy.id,
      protocol: proxy.protocol,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
      failCount: proxy.failCount,
      blockedCount: proxy.blockedCount,
      avgLatencyMs: proxy.avgLatencyMs,
      lastUsed: proxy.lastUsed,
    })),
  };

  return proxyCache.proxies;
}

async function nextAverageLatency(proxyId: string, durationMs: number) {
  const proxy = await prisma.proxyPool.findUnique({
    where: { id: proxyId },
    select: { avgLatencyMs: true, successCount: true, failCount: true },
  }).catch(() => null);

  if (!proxy?.avgLatencyMs) return Math.round(durationMs);
  const sampleCount = Math.max(1, proxy.successCount + proxy.failCount);
  return Math.round((proxy.avgLatencyMs * Math.min(sampleCount, 20) + durationMs) / (Math.min(sampleCount, 20) + 1));
}

function proxyScore(proxy: CachedProxy) {
  const lastUsedMs = proxy.lastUsed ? proxy.lastUsed.getTime() : 0;
  const recencyPenalty = lastUsedMs ? Math.max(0, 120000 - (Date.now() - lastUsedMs)) / 120000 : 0;
  const latencyPenalty = proxy.avgLatencyMs ? proxy.avgLatencyMs / 10000 : 0;
  return proxy.failCount * 4 + proxy.blockedCount * 8 + latencyPenalty + recencyPenalty;
}

function rotateProxySession(username: string) {
  if (!username) return username;
  const randomSession = Math.random().toString(36).substring(2, 10);

  // FloppyData/g-w gateway accepts sticky sessions through the extended
  // username. Do not append provider-specific suffixes to generic proxies:
  // many simple username/password proxies treat that as invalid credentials.
  const supportsSessionSuffix =
    username.startsWith("user-")
    || username.includes("-type-")
    || username.includes("-country-");
  if (!supportsSessionSuffix) return username;

  if (username.includes("-session-")) {
    return username.replace(/-session-[a-zA-Z0-9]+/, `-session-${randomSession}`);
  }
  return `${username}-session-${randomSession}`;
}

function buildProxyUrl(protocol: string, host: string, port: number, username: string, password: string) {
  const cleanHost = host.replace(/^(socks5:\/\/|http:\/\/|https:\/\/)/, "");
  const auth = username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";
  return `${protocol}://${auth}${cleanHost}:${port}`;
}
