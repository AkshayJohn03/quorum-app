/**
 * In-memory token-bucket rate limiter for API routes.
 * Enough for judging week — prevents accidental or malicious quota drain.
 * Not for production scale (use Redis for that — see AegisGate).
 */
const buckets = new Map<string, { tokens: number; last: number }>();

export function rateLimit(
  key: string,
  { max = 10, windowMs = 60_000 }: { max?: number; windowMs?: number } = {},
): { allowed: boolean; retryAfterS: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: max, last: now };
    buckets.set(key, bucket);
  }
  const elapsed = now - bucket.last;
  const refill = (elapsed / windowMs) * max;
  bucket.tokens = Math.min(max, bucket.tokens + refill);
  bucket.last = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfterS: 0 };
  }
  return { allowed: false, retryAfterS: Math.ceil((1 - bucket.tokens) * (windowMs / max)) };
}
