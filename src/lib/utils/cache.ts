// src/lib/utils/cache.ts
import { config } from '../../config/env'
import { CacheEntry, CacheStats, ScrapeIntent, ScrapeResult } from '../../scrapers/types'

export class MemoryCache {
  private cache = new Map<string, CacheEntry>()
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    maxSize: config.cacheMaxItems,
    ttlMs: config.cacheTtlMs,
  }

  constructor() {
    // Start cleanup interval
    setInterval(() => this.cleanup(), 60000) // Cleanup every minute
  }

  generateKey(intent: ScrapeIntent): string {
    // Create a deterministic key from intent
    const keyParts = [
      intent.url,
      intent.fidelity,
      intent.mode,
    ]
    
    // Add options as sorted JSON string for deterministic caching
    if (intent.options) {
      const optionsObj: any = {}
      
      // Sort keys to ensure deterministic string
      const sortedKeys = Object.keys(intent.options).sort()
      for (const key of sortedKeys) {
        const value = intent.options[key as keyof typeof intent.options]
        
        // Handle arrays (like selectors) by sorting them
        if (Array.isArray(value)) {
          optionsObj[key] = [...value].sort()
        } else {
          optionsObj[key] = value
        }
      }
      
      keyParts.push(JSON.stringify(optionsObj))
    } else {
      keyParts.push('{}')
    }
    
    return keyParts.join('|')
  }

  get(intent: ScrapeIntent): ScrapeResult | null {
    if (!config.cacheEnabled) {
      this.stats.misses++
      return null
    }

    const key = this.generateKey(intent)
    const entry = this.cache.get(key)

    if (!entry) {
      this.stats.misses++
      return null
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      this.stats.size = this.cache.size
      this.stats.misses++
      return null
    }

    this.stats.hits++
    return entry.result
  }

  set(intent: ScrapeIntent, result: ScrapeResult): void {
    if (!config.cacheEnabled) {
      return
    }

    // Clean up if we're at max size
    if (this.cache.size >= this.stats.maxSize) {
      this.evictOldest()
    }

    const key = this.generateKey(intent)
    const entry: CacheEntry = {
      result,
      timestamp: Date.now(),
      ttl: config.cacheTtlMs,
    }

    this.cache.set(key, entry)
    this.stats.size = this.cache.size
  }

  delete(intent: ScrapeIntent): boolean {
    const key = this.generateKey(intent)
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.stats.size = this.cache.size
    }
    return deleted
  }

  clear(): void {
    this.cache.clear()
    this.stats.size = 0
    this.stats.hits = 0
    this.stats.misses = 0
  }

  getStats(): CacheStats {
    return { ...this.stats }
  }

  private evictOldest(): void {
    // Find oldest entry
    let oldestKey: string | null = null
    let oldestTimestamp = Date.now()

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }

  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      this.stats.size = this.cache.size
      console.log(`Cache cleanup: removed ${cleaned} expired entries`)
    }
  }
}

export const memoryCache = new MemoryCache()