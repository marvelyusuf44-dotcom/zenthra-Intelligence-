import { Redis } from "ioredis";

type Entry = { value: unknown; expiresAt: number };
const local = new Map<string, Entry>();
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;

export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<{ value: T; stale: boolean }> {
  if (redis) {
    try {
      if (redis.status === "wait") await redis.connect();
      const cachedValue = await redis.get(key);
      if (cachedValue) return { value: JSON.parse(cachedValue) as T, stale: false };
    } catch { /* Use the local cache if Redis is not reachable. */ }
  }
  const localHit = local.get(key);
  if (localHit && localHit.expiresAt > Date.now()) return { value: localHit.value as T, stale: false };
  try {
    const value = await loader();
    local.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    if (redis) {
      try { await redis.set(key, JSON.stringify(value), "EX", ttlSeconds); } catch { /* local cache remains valid */ }
    }
    return { value, stale: false };
  } catch (error) {
    if (localHit) return { value: localHit.value as T, stale: true };
    throw error;
  }
}