import { rateLimitRedis } from '../redis';
import { config } from '../../config/env';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export class RedisRateLimiter {
  private maxRequests: number;
  private windowMs: number;
  private keyPrefix: string;

  constructor(maxRequests: number = 100, windowMs: number = 900000, keyPrefix: string = 'ip') {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.keyPrefix = keyPrefix;
  }

  async check(identifier: string): Promise<RateLimitResult> {
    const key = `${this.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const multi = rateLimitRedis.multi();
    multi.zremrangebyscore(key, 0, windowStart);
    multi.zcard(key);
    multi.zadd(key, now, `${now}-${Math.random()}`);
    multi.expire(key, Math.ceil(this.windowMs / 1000));

    const results = await multi.exec();
    const currentCount = results?.[1]?.[1] as number || 0;

    const remaining = Math.max(0, this.maxRequests - currentCount - 1);
    const resetTime = now + this.windowMs;

    if (currentCount >= this.maxRequests) {
      await rateLimitRedis.zrem(key, `${now}-${Math.random()}`);
      
      const oldestEntry = await rateLimitRedis.zrange(key, 0, 0, 'WITHSCORES');
      const oldestTime = oldestEntry.length > 1 ? parseInt(oldestEntry[1]) : now;
      const retryAfter = Math.ceil((oldestTime + this.windowMs - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter,
      };
    }

    return {
      allowed: true,
      remaining,
      resetTime,
    };
  }

  async reset(identifier: string): Promise<void> {
    const key = `${this.keyPrefix}:${identifier}`;
    await rateLimitRedis.del(key);
  }

  async getStats(identifier: string): Promise<{ count: number; resetTime: number }> {
    const key = `${this.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    await rateLimitRedis.zremrangebyscore(key, 0, windowStart);
    const count = await rateLimitRedis.zcard(key);
    const resetTime = now + this.windowMs;

    return { count, resetTime };
  }

  cleanup(): void {
    // No-op for backwards compatibility
  }
}

export const ipRateLimiter = new RedisRateLimiter(
  config.rateLimitMaxRequests,
  config.rateLimitWindowMs,
  'ip'
);

export const apiKeyRateLimiter = new RedisRateLimiter(
  1000,
  60000,
  'apikey'
);
