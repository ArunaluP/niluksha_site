import "server-only";

/**
 * Simple in-memory login limiter: 5 failed attempts per email per 15 minutes.
 * Good enough for one server. (If you ever run several servers, move this to the DB.)
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const fails = new Map<string, { count: number; firstAt: number }>();

export function isLocked(key: string): boolean {
  const entry = fails.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    fails.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILS;
}

export function recordFailure(key: string) {
  const entry = fails.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) fails.set(key, { count: 1, firstAt: Date.now() });
  else entry.count++;
}

export function clearFailures(key: string) {
  fails.delete(key);
}
