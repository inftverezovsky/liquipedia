import { getGenericMinIntervalMs, getParseMinIntervalMs } from "@/lib/env";

let genericChain: Promise<void> = Promise.resolve();
let parseChain: Promise<void> = Promise.resolve();
let lastGenericRequestAt = 0;
let lastParseRequestAt = 0;

export function withGenericRateLimit<T>(work: () => Promise<T>) {
  const next = genericChain.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, getGenericMinIntervalMs() - (now - lastGenericRequestAt));
    if (waitMs > 0) await sleep(waitMs);
    lastGenericRequestAt = Date.now();
    return work();
  });

  genericChain = next.then(
    () => undefined,
    () => undefined
  );

  return next;
}

export function withParseRateLimit<T>(work: () => Promise<T>) {
  const next = parseChain.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, getParseMinIntervalMs() - (now - lastParseRequestAt));
    if (waitMs > 0) await sleep(waitMs);
    lastParseRequestAt = Date.now();
    return work();
  });

  parseChain = next.then(
    () => undefined,
    () => undefined
  );

  return next;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
