// src/scrapers/advanced/robots.ts
// Robots.txt Parser - Respect robots.txt directives

export interface RobotRule {
  userAgent: string;
  disallow: string[];
  allow: string[];
  crawlDelay: number | null;
}

export interface RobotsCache {
  rules: Map<string, RobotRule>;
  fetchedAt: number;
  expiresAt: number;
}

export class RobotsParser {
  private cache = new Map<string, RobotsCache>();
  private cacheTtlMs = 24 * 60 * 60 * 1000; // 24 hours
  private defaultCrawlDelay = 1; // seconds

  async canFetch(url: string, userAgent: string = '*'): Promise<boolean> {
    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
    
    const rules = await this.getRules(robotsUrl, userAgent);
    
    if (!rules) {
      return true; // No robots.txt found, allow by default
    }

    const path = parsedUrl.pathname + parsedUrl.search;

    // Check allow rules first (they take precedence)
    for (const allow of rules.allow) {
      if (this.matchesPath(path, allow)) {
        return true;
      }
    }

    // Check disallow rules
    for (const disallow of rules.disallow) {
      if (this.matchesPath(path, disallow)) {
        return false;
      }
    }

    return true;
  }

  async getCrawlDelay(url: string, userAgent: string = '*'): Promise<number | null> {
    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
    
    const rules = await this.getRules(robotsUrl, userAgent);
    
    return rules?.crawlDelay ?? null;
  }

  async getSitemapUrls(url: string): Promise<string[]> {
    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
    
    try {
      const cached = this.cache.get(robotsUrl);
      const content = await this.fetchRobotsTxt(robotsUrl);
      
      const sitemapMatches = content.match(/^Sitemap:\s*(.+)$/gim) || [];
      return sitemapMatches.map((match) => match.replace(/^Sitemap:\s*/i, '').trim());
    } catch {
      return [];
    }
  }

  private async getRules(robotsUrl: string, userAgent: string): Promise<RobotRule | null> {
    // Check cache
    const cached = this.cache.get(robotsUrl);
    if (cached && Date.now() < cached.expiresAt) {
      return this.findMatchingRule(cached.rules, userAgent);
    }

    // Fetch fresh
    try {
      const content = await this.fetchRobotsTxt(robotsUrl);
      const rules = this.parse(content);
      
      this.cache.set(robotsUrl, {
        rules,
        fetchedAt: Date.now(),
        expiresAt: Date.now() + this.cacheTtlMs,
      });
      
      return this.findMatchingRule(rules, userAgent);
    } catch {
      return null;
    }
  }

  private async fetchRobotsTxt(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'WebCastle/1.0',
        },
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch robots.txt: ${response.status}`);
      }
      
      return await response.text();
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  private parse(content: string): Map<string, RobotRule> {
    const rules = new Map<string, RobotRule>();
    let currentUserAgent = '*';
    const defaultRule: RobotRule = {
      userAgent: '*',
      disallow: [],
      allow: [],
      crawlDelay: null,
    };
    
    rules.set('*', { ...defaultRule });
    
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) {
        continue;
      }
      
      const directive = trimmed.substring(0, colonIndex).trim().toLowerCase();
      const value = trimmed.substring(colonIndex + 1).trim();
      
      switch (directive) {
        case 'user-agent':
          currentUserAgent = value.toLowerCase();
          if (!rules.has(currentUserAgent)) {
            rules.set(currentUserAgent, {
              userAgent: currentUserAgent,
              disallow: [],
              allow: [],
              crawlDelay: null,
            });
          }
          break;
          
        case 'disallow':
          if (value) {
            const rule = rules.get(currentUserAgent);
            if (rule) {
              rule.disallow.push(value);
            }
          }
          break;
          
        case 'allow':
          if (value) {
            const rule = rules.get(currentUserAgent);
            if (rule) {
              rule.allow.push(value);
            }
          }
          break;
          
        case 'crawl-delay':
          const delay = parseFloat(value);
          if (!isNaN(delay)) {
            const rule = rules.get(currentUserAgent);
            if (rule) {
              rule.crawlDelay = delay;
            }
          }
          break;
      }
    }
    
    return rules;
  }

  private findMatchingRule(rules: Map<string, RobotRule>, userAgent: string): RobotRule | null {
    const lowerAgent = userAgent.toLowerCase();
    
    // Try exact match first
    if (rules.has(lowerAgent)) {
      return rules.get(lowerAgent)!;
    }
    
    // Try partial match
    for (const [key, rule] of rules) {
      if (key !== '*' && lowerAgent.includes(key)) {
        return rule;
      }
    }
    
    // Fall back to default
    return rules.get('*') || null;
  }

  private matchesPath(path: string, pattern: string): boolean {
    if (pattern === '/' || pattern === '') {
      return false;
    }

    // Convert robots.txt pattern to regex
    let regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '\\?');

    // Handle $ end anchor
    if (regexPattern.endsWith('\\$')) {
      regexPattern = regexPattern.substring(0, regexPattern.length - 2) + '$';
    }

    try {
      const regex = new RegExp(regexPattern, 'i');
      return regex.test(path);
    } catch {
      return false;
    }
  }

  clearCache(url?: string): void {
    if (url) {
      const parsedUrl = new URL(url);
      const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
      this.cache.delete(robotsUrl);
    } else {
      this.cache.clear();
    }
  }

  getCacheStats(): { entries: number; oldestEntry: number | null } {
    let oldest: number | null = null;
    
    for (const cache of this.cache.values()) {
      if (!oldest || cache.fetchedAt < oldest) {
        oldest = cache.fetchedAt;
      }
    }
    
    return {
      entries: this.cache.size,
      oldestEntry: oldest,
    };
  }
}

export const robotsParser = new RobotsParser();
