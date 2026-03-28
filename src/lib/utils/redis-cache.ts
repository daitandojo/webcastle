import { cacheRedis } from '../redis';
import { config } from '../../config/env';

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  ttl: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

export class RedisCache {
  private defaultTtl: number;
  private prefix: string;
  private stats = { hits: 0, misses: 0 };

  constructor(defaultTtl: number = 3600000, prefix: string = 'cache') {
    this.defaultTtl = defaultTtl;
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await cacheRedis.get(this.getKey(key));
      
      if (!data) {
        this.stats.misses++;
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(data);
      
      if (Date.now() > entry.createdAt + entry.ttl) {
        await cacheRedis.del(this.getKey(key));
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return entry.value;
    } catch (error) {
      console.error('[RedisCache] Get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const entry: CacheEntry<T> = {
        value,
        createdAt: Date.now(),
        ttl: ttl || this.defaultTtl,
      };
      
      await cacheRedis.setex(
        this.getKey(key),
        Math.ceil((ttl || this.defaultTtl) / 1000),
        JSON.stringify(entry)
      );
    } catch (error) {
      console.error('[RedisCache] Set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await cacheRedis.del(this.getKey(key));
    } catch (error) {
      console.error('[RedisCache] Delete error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await cacheRedis.keys(`${this.prefix}:*`);
      if (keys.length > 0) {
        await cacheRedis.del(...keys);
      }
      this.stats = { hits: 0, misses: 0 };
    } catch (error) {
      console.error('[RedisCache] Clear error:', error);
    }
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  getStats(): CacheStats {
    return {
      ...this.stats,
      size: 0,
    };
  }
}

export const redisCache = new RedisCache(config.cacheTtlMs, 'scrape');

export const advancedRedisCache = new RedisCache(config.cacheTtlMs, 'advanced');
