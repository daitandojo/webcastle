// src/lib/auth/api-key-store.ts
// API Key management with usage tracking and rate limiting

import { config } from '../../config/env';
import crypto from 'crypto';

export interface ApiKey {
  id: string;
  key: string;
  name: string;
  userId?: string;
  createdAt: number;
  expiresAt?: number;
  isActive: boolean;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  usage: {
    totalRequests: number;
    totalCredits: number;
    dailyUsage: Record<string, { requests: number; credits: number }>;
    lastUsed: number;
  };
  limits: {
    maxConcurrent: number;
    maxCrawlPages: number;
  };
  metadata?: Record<string, any>;
}

interface StoredKey {
  key: string;
  name: string;
  userId?: string;
  createdAt: number;
  expiresAt?: number;
  isActive: boolean;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  usage: {
    totalRequests: number;
    totalCredits: number;
    dailyUsage: Record<string, { requests: number; credits: number }>;
    lastUsed: number;
  };
  limits: {
    maxConcurrent: number;
    maxCrawlPages: number;
  };
  metadata?: Record<string, any>;
}

export class ApiKeyStore {
  private keys = new Map<string, StoredKey>();
  private keyHashes = new Map<string, string>(); // hash -> keyId

  constructor() {
    this.initializeDefaultKeys();
  }

  private initializeDefaultKeys(): void {
    // Add demo key for landing page (restricted rate limit)
    const demoKey = 'sk_demo_key_for_landing_page';
    const demoId = this.generateId();
    const demoKeyData: StoredKey = {
      key: demoKey,
      name: 'Demo API Key (Landing Page)',
      createdAt: Date.now(),
      isActive: true,
      rateLimit: {
        requestsPerMinute: 60,
        requestsPerDay: 5000,
      },
      usage: {
        totalRequests: 0,
        totalCredits: 0,
        dailyUsage: {},
        lastUsed: 0,
      },
      limits: {
        maxConcurrent: 5,
        maxCrawlPages: 5000,
      },
      metadata: { isDemo: true },
    };
    this.keys.set(demoId, demoKeyData);
    this.keyHashes.set(this.hashKey(demoKey), demoId);

    // Load API keys from environment
    if (config.apiKeys && config.apiKeys.length > 0) {
      for (const apiKey of config.apiKeys) {
        const id = this.generateId();
        const keyData: StoredKey = {
          key: apiKey,
          name: 'Default API Key',
          createdAt: Date.now(),
          isActive: true,
          rateLimit: {
            requestsPerMinute: 100,
            requestsPerDay: 10000,
          },
          usage: {
            totalRequests: 0,
            totalCredits: 0,
            dailyUsage: {},
            lastUsed: 0,
          },
          limits: {
            maxConcurrent: 10,
            maxCrawlPages: 10000,
          },
        };
        this.keys.set(id, keyData);
        this.keyHashes.set(this.hashKey(apiKey), id);
      }
    }
  }

  private generateId(): string {
    return `key_${crypto.randomBytes(8).toString('hex')}`;
  }

  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  create(data: {
    name: string;
    userId?: string;
    expiresAt?: number;
    rateLimit?: { requestsPerMinute: number; requestsPerDay: number };
    limits?: { maxConcurrent: number; maxCrawlPages: number };
    metadata?: Record<string, any>;
  }): { id: string; key: string; apiKey: ApiKey } {
    const id = this.generateId();
    const key = `sk_${crypto.randomBytes(24).toString('base64url')}`;

    const keyData: StoredKey = {
      key,
      name: data.name,
      userId: data.userId,
      createdAt: Date.now(),
      expiresAt: data.expiresAt,
      isActive: true,
      rateLimit: data.rateLimit || {
        requestsPerMinute: 60,
        requestsPerDay: 5000,
      },
      usage: {
        totalRequests: 0,
        totalCredits: 0,
        dailyUsage: {},
        lastUsed: 0,
      },
      limits: data.limits || {
        maxConcurrent: 5,
        maxCrawlPages: 5000,
      },
      metadata: data.metadata,
    };

    this.keys.set(id, keyData);
    this.keyHashes.set(this.hashKey(key), id);

    return {
      id,
      key,
      apiKey: this.toApiKey(id, keyData),
    };
  }

  verify(key: string): ApiKey | null {
    if (!key) return null;

    const hash = this.hashKey(key);
    const id = this.keyHashes.get(hash);

    if (!id) return null;

    const keyData = this.keys.get(id);
    if (!keyData) return null;

    // Check if key is active
    if (!keyData.isActive) return null;

    // Check if key has expired
    if (keyData.expiresAt && keyData.expiresAt < Date.now()) return null;

    return this.toApiKey(id, keyData);
  }

  get(id: string): ApiKey | null {
    const keyData = this.keys.get(id);
    if (!keyData) return null;
    return this.toApiKey(id, keyData);
  }

  list(): ApiKey[] {
    return Array.from(this.keys.entries()).map(([id, data]) =>
      this.toApiKey(id, data)
    );
  }

  update(id: string, updates: Partial<{
    name: string;
    isActive: boolean;
    expiresAt: number;
    rateLimit: { requestsPerMinute: number; requestsPerDay: number };
    limits: { maxConcurrent: number; maxCrawlPages: number };
    metadata: Record<string, any>;
  }>): ApiKey | null {
    const keyData = this.keys.get(id);
    if (!keyData) return null;

    if (updates.name !== undefined) keyData.name = updates.name;
    if (updates.isActive !== undefined) keyData.isActive = updates.isActive;
    if (updates.expiresAt !== undefined) keyData.expiresAt = updates.expiresAt;
    if (updates.rateLimit) keyData.rateLimit = updates.rateLimit;
    if (updates.limits) keyData.limits = updates.limits;
    if (updates.metadata) keyData.metadata = { ...keyData.metadata, ...updates.metadata };

    return this.toApiKey(id, keyData);
  }

  delete(id: string): boolean {
    const keyData = this.keys.get(id);
    if (!keyData) return false;

    this.keyHashes.delete(this.hashKey(keyData.key));
    this.keys.delete(id);
    return true;
  }

  recordUsage(id: string, credits: number = 1): boolean {
    const keyData = this.keys.get(id);
    if (!keyData) return false;

    const today = new Date().toISOString().split('T')[0];

    keyData.usage.totalRequests++;
    keyData.usage.totalCredits += credits;
    keyData.usage.lastUsed = Date.now();

    if (!keyData.usage.dailyUsage[today]) {
      keyData.usage.dailyUsage[today] = { requests: 0, credits: 0 };
    }
    keyData.usage.dailyUsage[today].requests++;
    keyData.usage.dailyUsage[today].credits += credits;

    // Clean up old daily usage (keep last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const date of Object.keys(keyData.usage.dailyUsage)) {
      const dateTs = new Date(date).getTime();
      if (dateTs < thirtyDaysAgo) {
        delete keyData.usage.dailyUsage[date];
      }
    }

    return true;
  }

  checkRateLimit(id: string): { allowed: boolean; remaining: number; resetTime: number } {
    const keyData = this.keys.get(id);
    if (!keyData) {
      return { allowed: false, remaining: 0, resetTime: Date.now() };
    }

    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const minute = Math.floor(now / 60000);

    const dailyUsage = keyData.usage.dailyUsage[today]?.requests || 0;
    const minuteKey = `min_${minute}`;
    const minuteUsage = keyData.usage.dailyUsage[today]?.[minuteKey as keyof typeof keyData.usage.dailyUsage[typeof today]] || 0;

    // Check daily limit
    if (dailyUsage >= keyData.rateLimit.requestsPerDay) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return {
        allowed: false,
        remaining: 0,
        resetTime: tomorrow.getTime(),
      };
    }

    // Check minute limit
    if (minuteUsage >= keyData.rateLimit.requestsPerMinute) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: (minute + 1) * 60000,
      };
    }

    // Record minute usage
    if (!keyData.usage.dailyUsage[today]) {
      keyData.usage.dailyUsage[today] = { requests: 0, credits: 0 } as any;
    }
    (keyData.usage.dailyUsage[today] as any)[minuteKey] = minuteUsage + 1;

    return {
      allowed: true,
      remaining: Math.min(
        keyData.rateLimit.requestsPerDay - dailyUsage,
        keyData.rateLimit.requestsPerMinute - minuteUsage
      ),
      resetTime: (minute + 1) * 60000,
    };
  }

  getStats(): {
    totalKeys: number;
    activeKeys: number;
    totalRequests: number;
    totalCredits: number;
  } {
    let totalRequests = 0;
    let totalCredits = 0;
    let activeKeys = 0;

    for (const keyData of this.keys.values()) {
      totalRequests += keyData.usage.totalRequests;
      totalCredits += keyData.usage.totalCredits;
      if (keyData.isActive && (!keyData.expiresAt || keyData.expiresAt > Date.now())) {
        activeKeys++;
      }
    }

    return {
      totalKeys: this.keys.size,
      activeKeys,
      totalRequests,
      totalCredits,
    };
  }

  private toApiKey(id: string, data: StoredKey): ApiKey {
    return {
      id,
      key: data.key,
      name: data.name,
      userId: data.userId,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      isActive: data.isActive,
      rateLimit: data.rateLimit,
      usage: data.usage,
      limits: data.limits,
      metadata: data.metadata,
    };
  }
}

export const apiKeyStore = new ApiKeyStore();
