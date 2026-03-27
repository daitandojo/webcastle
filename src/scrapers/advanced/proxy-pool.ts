// src/scrapers/advanced/proxy-pool.ts
// Proxy Pool - Automatic rotation and management

export interface ProxyConfig {
  url: string;
  username?: string;
  password?: string;
  region?: string;
  type?: 'http' | 'https' | 'socks4' | 'socks5';
}

export interface ProxyStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  lastUsed: number;
  status: 'active' | 'error' | 'banned';
}

export class ProxyPool {
  private proxies: Map<string, { config: ProxyConfig; stats: ProxyStats }> = new Map();
  private currentIndex = 0;
  private rotationStrategy: 'round-robin' | 'random' | 'smart' = 'smart';
  private lastHealthCheck = 0;
  private healthCheckIntervalMs = 60000;

  addProxy(config: ProxyConfig): string {
    const id = `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.proxies.set(id, {
      config,
      stats: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatencyMs: 0,
        lastUsed: 0,
        status: 'active',
      },
    });
    
    return id;
  }

  removeProxy(id: string): boolean {
    return this.proxies.delete(id);
  }

  getProxy(): ProxyConfig | null {
    const activeProxies = Array.from(this.proxies.entries())
      .filter(([_, p]) => p.stats.status === 'active');
    
    if (activeProxies.length === 0) {
      return null;
    }

    let selected: any;

    switch (this.rotationStrategy) {
      case 'round-robin':
        selected = activeProxies[this.currentIndex % activeProxies.length];
        this.currentIndex++;
        break;
        
      case 'random':
        selected = activeProxies[Math.floor(Math.random() * activeProxies.length)];
        break;
        
      case 'smart':
      default:
        // Select proxy with highest success rate and lowest latency
        selected = activeProxies
          .filter(([_, p]) => p.stats.totalRequests > 0)
          .sort((a, b) => {
            const aScore = a[1].stats.successfulRequests / a[1].stats.totalRequests - (a[1].stats.averageLatencyMs / 10000);
            const bScore = b[1].stats.successfulRequests / b[1].stats.totalRequests - (b[1].stats.averageLatencyMs / 10000);
            return bScore - aScore;
          })[0] || activeProxies[0];
        break;
    }

    const [, proxy] = selected;
    proxy.stats.lastUsed = Date.now();
    proxy.stats.totalRequests++;
    
    return proxy.config;
  }

  recordSuccess(id: string, latencyMs: number): void {
    const proxy = this.proxies.get(id);
    if (!proxy) return;

    proxy.stats.successfulRequests++;
    proxy.stats.status = 'active';
    
    // Running average for latency
    const oldAvg = proxy.stats.averageLatencyMs;
    const count = proxy.stats.successfulRequests;
    proxy.stats.averageLatencyMs = oldAvg + (latencyMs - oldAvg) / count;
  }

  recordFailure(id: string): void {
    const proxy = this.proxies.get(id);
    if (!proxy) return;

    proxy.stats.failedRequests++;
    
    // Mark as error if failure rate > 50%
    const total = proxy.stats.totalRequests;
    if (total > 10 && proxy.stats.failedRequests / total > 0.5) {
      proxy.stats.status = 'error';
    }
  }

  markBanned(id: string): void {
    const proxy = this.proxies.get(id);
    if (proxy) {
      proxy.stats.status = 'banned';
    }
  }

  setRotationStrategy(strategy: 'round-robin' | 'random' | 'smart'): void {
    this.rotationStrategy = strategy;
  }

  async healthCheck(): Promise<void> {
    if (Date.now() - this.lastHealthCheck < this.healthCheckIntervalMs) {
      return;
    }

    const checkPromises = Array.from(this.proxies.entries()).map(async ([id, proxy]) => {
      try {
        // Simple connectivity check without proxy
        await fetch('https://httpbin.org/ip', {
          method: 'HEAD',
          signal: AbortSignal.timeout(10000),
        });
        proxy.stats.status = 'active';
      } catch {
        // Only mark as error if consistently failing
        if (proxy.stats.failedRequests > 3) {
          proxy.stats.status = 'error';
        }
      }
    });

    await Promise.all(checkPromises);
    this.lastHealthCheck = Date.now();
  }

  getStats(id?: string): Record<string, ProxyStats> | ProxyStats | null {
    if (id) {
      const proxy = this.proxies.get(id);
      return proxy?.stats || null;
    }

    const allStats: Record<string, ProxyStats> = {};
    for (const [id, proxy] of this.proxies) {
      allStats[id] = proxy.stats;
    }
    return allStats;
  }

  listProxies(): Array<{ id: string; config: ProxyConfig; stats: ProxyStats }> {
    return Array.from(this.proxies.entries()).map(([id, data]) => ({
      id,
      ...data,
    }));
  }

  getActiveCount(): number {
    return Array.from(this.proxies.values()).filter(p => p.stats.status === 'active').length;
  }

  // Convenience method for adding multiple proxies at once
  async addProxyList(urls: string[]): Promise<number> {
    let added = 0;
    for (const url of urls) {
      try {
        this.addProxy({ url });
        added++;
      } catch {
        // Skip invalid URLs
      }
    }
    return added;
  }
}

export const proxyPool = new ProxyPool();
