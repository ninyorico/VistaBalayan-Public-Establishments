type CacheEntry<T> = {
  value: T
  expiresAt: number
}

const entries = new Map<string, CacheEntry<unknown>>()

export const getPublicCache = <T>(key: string): T | null => {
  const entry = entries.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    entries.delete(key)
    return null
  }
  return entry.value
}

export const setPublicCache = <T>(key: string, value: T, ttlMs: number) => {
  entries.set(key, { value, expiresAt: Date.now() + ttlMs })
  return value
}

export const invalidatePublicCache = (key: string) => {
  entries.delete(key)
}
