// src/lib/utils/rate-limiter.ts
import { config } from '../../config/env'

const RPS = config.scraperRateLimitRps
const INTERVAL = 1000 // 1 second window

let tokens = RPS
let lastRefill = Date.now()

export async function rateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now()
  if (now - lastRefill >= INTERVAL) {
    tokens = RPS
    lastRefill = now
  }
  if (tokens <= 0) {
    const sleep = INTERVAL - (now - lastRefill) + 10
    console.warn(`Rate-limit hit, sleeping ${sleep} ms`)
    await new Promise((r) => setTimeout(r, sleep))
    tokens = RPS
  }
  tokens--
  return fn()
}

// Per-IP rate limiting (simplified)
export class PerIpRateLimiter {
  private ipRequests = new Map<string, { count: number, resetTime: number }>()
  private readonly windowMs: number
  private readonly maxRequests: number

  constructor(windowMs: number = config.rateLimitWindowMs, maxRequests: number = config.rateLimitMaxRequests) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests
  }

  check(ip: string): { allowed: boolean, remaining: number, resetTime: number } {
    const now = Date.now()
    const record = this.ipRequests.get(ip)

    if (!record || now > record.resetTime) {
      // New window
      this.ipRequests.set(ip, {
        count: 1,
        resetTime: now + this.windowMs
      })
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs
      }
    }

    if (record.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: record.resetTime
      }
    }

    // Increment count
    record.count++
    this.ipRequests.set(ip, record)

    return {
      allowed: true,
      remaining: this.maxRequests - record.count,
      resetTime: record.resetTime
    }
  }

  cleanup(): void {
    const now = Date.now()
    for (const [ip, record] of this.ipRequests.entries()) {
      if (now > record.resetTime) {
        this.ipRequests.delete(ip)
      }
    }
  }
}

export const ipRateLimiter = new PerIpRateLimiter()