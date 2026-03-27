// src/scrapers/advanced/adaptive-crawler.ts
// Adaptive Crawling - Intelligent stop conditions based on content relevance

export interface AdaptiveConfig {
  minRelevanceScore: number;
  maxDuplicateThreshold: number;
  contentSimilarityCheck: boolean;
  adaptiveThreshold: boolean;
  baseThreshold: number;
  variancePercent: number;
}

export interface PageContent {
  url: string;
  content: string;
  wordCount: number;
  links: string[];
  hash: string;
}

export class AdaptiveCrawler {
  private contentHistory: Map<string, PageContent[]> = new Map();
  private config: AdaptiveConfig;

  constructor(config?: Partial<AdaptiveConfig>) {
    this.config = {
      minRelevanceScore: config?.minRelevanceScore ?? 0.3,
      maxDuplicateThreshold: config?.maxDuplicateThreshold ?? 5,
      contentSimilarityCheck: config?.contentSimilarityCheck ?? true,
      adaptiveThreshold: config?.adaptiveThreshold ?? true,
      baseThreshold: config?.baseThreshold ?? 20,
      variancePercent: config?.variancePercent ?? 30,
    };
  }

  calculateContentHash(content: string): string {
    let hash = 0;
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  calculateSimilarity(content1: string, content2: string): number {
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  calculateRelevanceScore(content: string, targetPatterns: string[]): number {
    if (targetPatterns.length === 0) return 1;
    
    const lowerContent = content.toLowerCase();
    let matchCount = 0;
    
    for (const pattern of targetPatterns) {
      if (lowerContent.includes(pattern.toLowerCase())) {
        matchCount++;
      }
    }
    
    return matchCount / targetPatterns.length;
  }

  isRelevantContent(content: string, pageUrl: string): boolean {
    const url = new URL(pageUrl);
    const pathPatterns = url.pathname.split('/').filter(p => p.length > 0);
    
    const relevancePatterns = [
      ...pathPatterns,
      ...this.extractKeywordsFromUrl(pageUrl),
    ];
    
    const score = this.calculateRelevanceScore(content, relevancePatterns);
    return score >= this.config.minRelevanceScore;
  }

  private extractKeywordsFromUrl(url: string): string[] {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 2);
    const queryParams = Array.from(urlObj.searchParams.keys());
    return [...pathSegments, ...queryParams];
  }

  shouldContinueCrawling(
    currentPage: PageContent,
    totalPages: number,
    consecutiveDuplicates: number
  ): { continue: boolean; reason?: string } {
    const threshold = this.getAdaptiveThreshold(totalPages);
    
    if (consecutiveDuplicates >= this.config.maxDuplicateThreshold) {
      return { 
        continue: false, 
        reason: `Max duplicate threshold reached (${consecutiveDuplicates})` 
      };
    }

    if (totalPages >= threshold * 2) {
      return { 
        continue: false, 
        reason: `Reached adaptive threshold (${threshold})` 
      };
    }

    if (!this.isRelevantContent(currentPage.content, currentPage.url)) {
      return { 
        continue: false, 
        reason: 'Low relevance score - stopping early' 
      };
    }

    const domain = this.getDomain(currentPage.url);
    const domainHistory = this.contentHistory.get(domain) || [];
    
    for (const pastPage of domainHistory) {
      if (this.calculateSimilarity(currentPage.content, pastPage.content) > 0.8) {
        if (consecutiveDuplicates >= 3) {
          return { 
            continue: false, 
            reason: 'High content similarity detected' 
          };
        }
      }
    }

    return { continue: true };
  }

  private getAdaptiveThreshold(totalPages: number): number {
    if (!this.config.adaptiveThreshold) {
      return this.config.baseThreshold;
    }

    const variance = (Math.random() - 0.5) * 2 * (this.config.variancePercent / 100);
    return Math.floor(this.config.baseThreshold * (1 + variance));
  }

  private getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  recordPageContent(page: PageContent): void {
    const domain = this.getDomain(page.url);
    const domainHistory = this.contentHistory.get(domain) || [];
    
    domainHistory.push(page);
    
    if (domainHistory.length > 100) {
      domainHistory.shift();
    }
    
    this.contentHistory.set(domain, domainHistory);
  }

  getStats() {
    let totalPages = 0;
    let totalContent = 0;
    
    for (const [domain, pages] of this.contentHistory) {
      totalPages += pages.length;
      totalContent += pages.reduce((sum, p) => sum + p.content.length, 0);
    }
    
    return {
      domainsCrawled: this.contentHistory.size,
      totalPages,
      avgContentLength: totalPages > 0 ? Math.floor(totalContent / totalPages) : 0,
    };
  }

  reset(domain?: string): void {
    if (domain) {
      this.contentHistory.delete(domain);
    } else {
      this.contentHistory.clear();
    }
  }
}

export const adaptiveCrawler = new AdaptiveCrawler();
