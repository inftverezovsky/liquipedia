export function getLiquipediaDota2ApiUrl() {
  return process.env.LIQUIPEDIA_DOTA2_API_URL ?? "https://liquipedia.net/dota2/api.php";
}

export function getLiquipediaUserAgent() {
  return process.env.LIQUIPEDIA_USER_AGENT ?? "liquipedia-local-dev/0.1 (contact: change-me@example.com)";
}

export function getGenericMinIntervalMs() {
  return numberFromEnv("LIQUIPEDIA_GENERIC_MIN_INTERVAL_MS", 2100);
}

export function getParseMinIntervalMs() {
  return numberFromEnv("LIQUIPEDIA_PARSE_MIN_INTERVAL_MS", 31000);
}

export function getSearchCacheTtlMs() {
  return numberFromEnv("SEARCH_CACHE_TTL_SECONDS", 86400) * 1000;
}

function numberFromEnv(key: string, fallback: number) {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
