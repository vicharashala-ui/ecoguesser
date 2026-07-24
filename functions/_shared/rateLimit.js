// functions/_shared/rateLimit.js
//
// Small per-isolate sliding-window rate limiter, factored out so every
// Pages Function that needs one gets its OWN independent budget/Map
// instead of sharing one global store -- a burst of tile requests from an
// IP can't eat into that same IP's score-submission budget, or vice versa.
//
// Module-scope Map persists for the lifetime of a given Worker isolate --
// not across isolates/deploys/colos. That's fine for a best-effort limit:
// the goal is bounding cheap single-source abuse (a script hammering one
// edge location with junk coordinates or repeat submissions), not perfect
// global accounting -- the same trade-off handlers.js's original inline
// version already made.

export function createRateLimiter({ windowMs, max }) {
  const store = new Map(); // ip -> [timestamp, ...]

  return function isRateLimited(ip) {
    const now = Date.now();
    const cutoff = now - windowMs;
    const prev = (store.get(ip) ?? []).filter((t) => t > cutoff);
    if (prev.length >= max) {
      store.set(ip, prev);
      return true;
    }
    store.set(ip, [...prev, now]);
    if (store.size > 10_000) {
      for (const [k, v] of store) {
        if (v.every((t) => t < cutoff)) store.delete(k);
      }
    }
    return false;
  };
}
