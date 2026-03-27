// src/scrapers/advanced/url-prioritizer.ts
// URL Prioritization - Intelligent algorithm to prioritize high-value pages

export type PagePriority = 'critical' | 'high' | 'medium' | 'low';

export interface ScoredUrl {
  url: string;
  score: number;
  priority: PagePriority;
  factors: Record<string, number>;
}

export interface PriorityConfig {
  boostProductPages: boolean;
  boostArticlePages: boolean;
  boostSocialProfiles: boolean;
  boostSearchResults: boolean;
  penalizeLoginPages: boolean;
  penalizeAdminPages: boolean;
  penalizePagination: boolean;
}

const PAGE_TYPE_PATTERNS = {
  critical: [
    /\/product[s]?[\/\?]/i,
    /\/item[\/\?]/i,
    /\/p\/[a-z0-9]+/i,
    /\/buy[\/\?]/i,
    /\/checkout[\/\?]/i,
    /\/cart[\/\?]/i,
    /\/pricing[\/\?]/i,
    /\/plan[s]?[\/\?]/i,
  ],
  high: [
    /\/blog[\/\?]/i,
    /\/post[s]?[\/\?]/i,
    /\/article[s]?[\/\?]/i,
    /\/news[\/\?]/i,
    /\/page\//i,
    /\/about[\/\?]/i,
    /\/contact[\/\?]/i,
    /\/team[\/\?]/i,
    /\/faq[\/\?]/i,
    /\/help[\/\?]/i,
    /\/support[\/\?]/i,
    /@[\w-]+/i,
    /\/profile[\/\?]/i,
  ],
  medium: [
    /\/category[\/\?]/i,
    /\/tag[\/\?]/i,
    /\/collection[\/\?]/i,
    /\/directory[\/\?]/i,
    /\/list[\/\?]/i,
    /\/sitemap[\/\?]/i,
  ],
  low: [
    /\/search[\/\?]/i,
    /\/login[\/\?]/i,
    /\/signin[\/\?]/i,
    /\/register[\/\?]/i,
    /\/signup[\/\?]/i,
    /\/admin[\/\?]/i,
    /\/dashboard[\/\?]/i,
    /\/settings[\/\?]/i,
    /\/account[\/\?]/i,
    /\/privacy[\/\?]/i,
    /\/terms[\/\?]/i,
    /\/page\/\d+[\/\?]/i,
  ],
};

export class UrlPrioritizer {
  private config: PriorityConfig;

  constructor(config?: Partial<PriorityConfig>) {
    this.config = {
      boostProductPages: config?.boostProductPages ?? true,
      boostArticlePages: config?.boostArticlePages ?? true,
      boostSocialProfiles: config?.boostSocialProfiles ?? true,
      boostSearchResults: config?.boostSearchResults ?? false,
      penalizeLoginPages: config?.penalizeLoginPages ?? true,
      penalizeAdminPages: config?.penalizeAdminPages ?? true,
      penalizePagination: config?.penalizePagination ?? true,
    };
  }

  score(url: string): ScoredUrl {
    const factors: Record<string, number> = {};
    let totalScore = 50; // Base score

    // Check critical pages
    for (const pattern of PAGE_TYPE_PATTERNS.critical) {
      if (pattern.test(url)) {
        factors.criticalMatch = 40;
        totalScore += 40;
        break;
      }
    }

    // Check high priority pages
    for (const pattern of PAGE_TYPE_PATTERNS.high) {
      if (pattern.test(url)) {
        factors.highMatch = 25;
        totalScore += 25;
        break;
      }
    }

    // Check medium priority pages
    for (const pattern of PAGE_TYPE_PATTERNS.medium) {
      if (pattern.test(url)) {
        factors.mediumMatch = 10;
        totalScore += 10;
        break;
      }
    }

    // Penalize low priority pages
    for (const pattern of PAGE_TYPE_PATTERNS.low) {
      if (pattern.test(url)) {
        const penalty = this.config.penalizeLoginPages && /login|signin|register|signup/i.test(url)
          ? -30
          : this.config.penalizeAdminPages && /admin|dashboard|settings|account/i.test(url)
          ? -25
          : this.config.penalizePagination && /page=\d+|\/\d+[\/\?]$/i.test(url)
          ? -15
          : -10;
        
        factors.lowMatch = penalty;
        totalScore += penalty;
        break;
      }
    }

    // URL depth factor (shallower = higher priority)
    const depth = url.split('/').filter(s => s.length > 0).length;
    factors.urlDepth = Math.max(0, 15 - depth * 2);
    totalScore += factors.urlDepth;

    // Short URL bonus
    if (url.length < 80) {
      factors.shortUrl = 5;
      totalScore += 5;
    }

    // Has keywords bonus
    const url_lower = url.toLowerCase();
    const valuableKeywords = ['price', 'cost', 'review', 'spec', 'feature', 'detail', 'info'];
    for (const keyword of valuableKeywords) {
      if (url_lower.includes(keyword)) {
        factors.keywordBonus = 3;
        totalScore += 3;
        break;
      }
    }

    // Numeric ID bonus (often indicates specific content)
    if (/\/\d+[\/\?]/i.test(url)) {
      factors.numericId = 8;
      totalScore += 8;
    }

    const priority = this.determinePriority(totalScore);

    return {
      url,
      score: Math.max(0, Math.min(100, totalScore)),
      priority,
      factors,
    };
  }

  private determinePriority(score: number): PagePriority {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  sort(urls: string[]): ScoredUrl[] {
    return urls
      .map(url => this.score(url))
      .sort((a, b) => b.score - a.score);
  }

  filter(urls: string[], minPriority: PagePriority = 'low'): ScoredUrl[] {
    const priorityOrder: PagePriority[] = ['low', 'medium', 'high', 'critical'];
    const minIndex = priorityOrder.indexOf(minPriority);
    
    return this.sort(urls).filter(
      scored => priorityOrder.indexOf(scored.priority) >= minIndex
    );
  }

  getBucket(urls: string[]): Record<PagePriority, string[]> {
    const sorted = this.sort(urls);
    const buckets: Record<PagePriority, string[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    for (const scored of sorted) {
      buckets[scored.priority].push(scored.url);
    }

    return buckets;
  }
}

export const urlPrioritizer = new UrlPrioritizer();
