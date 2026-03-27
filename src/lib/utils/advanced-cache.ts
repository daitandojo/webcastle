// src/lib/utils/advanced-cache.ts
// Advanced caching with maxAge/minAge support (Firecrawl-inspired)

import { config } from '../../config/env';
import { CacheEntry, CacheStats, ScrapeOptions, ScrapeResult } from '../../scrapers/types';

export interface AdvancedCacheOptions {
  maxAge?: number; // Return cached if younger than this (ms)
  minAge?: number; // Only return cached data if older than this (ms)
}

export class AdvancedCache {
  private cache = new Map<string, CacheEntry>();
  private changeTrackingCache = new Map<string, { data: any; timestamp: number }>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    maxSize: config.cacheMaxItems,
    ttlMs: config.cacheTtlMs,
  };

  constructor() {
    setInterval(() => this.cleanup(), 60000);
  }

  generateKey(url: string, options?: ScrapeOptions): string {
    const keyParts = [url];
    
    if (options) {
      const relevantOptions: any = {};
      const keys = ['formats', 'onlyMainContent', 'location', 'waitFor', 'mobile', 'actions'];
      
      for (const key of keys) {
        if ((options as any)[key] !== undefined) {
          relevantOptions[key] = (options as any)[key];
        }
      }
      
      keyParts.push(JSON.stringify(relevantOptions));
    }
    
    return keyParts.join('|');
  }

  get(url: string, options?: ScrapeOptions, cacheOptions?: AdvancedCacheOptions): ScrapeResult | null {
    if (!config.cacheEnabled) {
      this.stats.misses++;
      return null;
    }

    const key = this.generateKey(url, options);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const age = Date.now() - entry.timestamp;

    // Check minAge - only return cached data if older than this
    if (cacheOptions?.minAge !== undefined && age < cacheOptions.minAge) {
      this.stats.misses++;
      return null;
    }

    // Check maxAge - return cached if younger than this
    if (cacheOptions?.maxAge !== undefined && age > cacheOptions.maxAge) {
      // Cache is too old, but don't delete - just return null for fresh scrape
      this.stats.misses++;
      return null;
    }

    // Check default TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.size = this.cache.size;
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return {
      ...entry.result,
      metadata: {
        ...entry.result.metadata,
        cacheHit: true,
      },
    };
  }

  set(url: string, result: ScrapeResult, options?: ScrapeOptions): void {
    if (!config.cacheEnabled) {
      return;
    }

    // Check if storeInCache is explicitly set to false
    if (options?.storeInCache === false) {
      return;
    }

    if (this.cache.size >= this.stats.maxSize) {
      this.evictOldest();
    }

    const key = this.generateKey(url, options);
    const ttl = options?.maxAge 
      ? Math.min(options.maxAge, config.cacheTtlMs)
      : config.cacheTtlMs;

    const entry: CacheEntry = {
      result,
      timestamp: Date.now(),
      ttl,
    };

    this.cache.set(key, entry);
    this.stats.size = this.cache.size;
  }

  delete(url: string, options?: ScrapeOptions): boolean {
    const key = this.generateKey(url, options);
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.size = this.cache.size;
    }
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  // Change tracking methods
  getChangeTrackingData(url: string): any | null {
    const entry = this.changeTrackingCache.get(url);
    if (!entry) return null;
    
    const age = Date.now() - entry.timestamp;
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    if (age > maxAge) {
      this.changeTrackingCache.delete(url);
      return null;
    }
    
    return entry.data;
  }

  setChangeTrackingData(url: string, data: any): void {
    this.changeTrackingCache.set(url, {
      data,
      timestamp: Date.now(),
    });
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    // Also cleanup change tracking
    for (const [key, entry] of this.changeTrackingCache.entries()) {
      if (now - entry.timestamp > 30 * 24 * 60 * 60 * 1000) {
        this.changeTrackingCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.stats.size = this.cache.size;
    }
  }
}

export const advancedCache = new AdvancedCache();
