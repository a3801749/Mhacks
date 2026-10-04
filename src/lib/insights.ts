import type { Reflection, WeekData } from "./types"

/** Calendar changes invalidate insights; response metadata does not. */
export function insightKey(data: WeekData, today: string): string {
  return JSON.stringify([today, data.projects, data.tasks, data.events, data.logs, data.checkIns, data.settings])
}

/** Share in-flight requests across the desktop and mobile panels. */
export function createInsightCache() {
  const cache = new Map<string, Promise<Reflection>>()
  return {
    load(key: string, fetch: () => Promise<Reflection>, fresh = false): Promise<Reflection> {
      if (!fresh && cache.has(key)) return cache.get(key)!
      const pending = Promise.resolve().then(fetch)
      cache.set(key, pending)
      // A failed older request must not evict a successful refresh.
      pending.catch(() => {
        if (cache.get(key) === pending) cache.delete(key)
      })
      while (cache.size > 8) cache.delete(cache.keys().next().value!)
      return pending
    },
  }
}
