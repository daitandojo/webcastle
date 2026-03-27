// src/scrapers/advanced/incremental-crawler.ts
// Incremental Crawling - Track visited URLs and support delta/diff crawls

import { ScrapeResult } from '../types';
import { advancedCache } from '../../lib/utils/advanced-cache';

export interface IncrementalState {
  domain: string;
  urlHashes: Map<string, UrlState>;
  lastCrawlAt: number;
  totalPages: number;
}

export interface UrlState {
  url: string;
  contentHash: string;
  status: 'unchanged' | 'changed' | 'new' | 'removed';
  lastSeen: number;
  previousHash?: string;
  changeCount: number;
}

export class IncrementalCrawler {
  private states = new Map<string, IncrementalState>();

  async getChangedUrls(domain: string, currentResults: ScrapeResult[]): Promise<{
    new: string[];
    changed: string[];
    unchanged: string[];
    removed: string[];
  }> {
    const state = this.states.get(domain);
    
    if (!state) {
      // First crawl - everything is new
      return {
        new: currentResults.map(r => r.url),
        changed: [],
        unchanged: [],
        removed: [],
      };
    }

    const currentUrls = new Set(currentResults.map(r => r.url));
    const previousUrls = new Set(state.urlHashes.keys());
    
    const newUrls: string[] = [];
    const changedUrls: string[] = [];
    const unchangedUrls: string[] = [];
    const removedUrls: string[] = [];

    // Find new and changed URLs
    for (const result of currentResults) {
      const urlState = state.urlHashes.get(result.url);
      const currentHash = this.hashContent(result.content || result.markdown || '');
      
      if (!urlState) {
        newUrls.push(result.url);
      } else if (urlState.contentHash !== currentHash) {
        changedUrls.push(result.url);
      } else {
        unchangedUrls.push(result.url);
      }
    }

    // Find removed URLs
    for (const url of previousUrls) {
      if (!currentUrls.has(url)) {
        removedUrls.push(url);
      }
    }

    return { new: newUrls, changed: changedUrls, unchanged: unchangedUrls, removed: removedUrls };
  }

  async saveState(domain: string, results: ScrapeResult[]): Promise<void> {
    let state = this.states.get(domain);
    
    if (!state) {
      state = {
        domain,
        urlHashes: new Map(),
        lastCrawlAt: Date.now(),
        totalPages: 0,
      };
    }

    for (const result of results) {
      const content = result.content || result.markdown || '';
      const hash = this.hashContent(content);
      
      const existing = state.urlHashes.get(result.url);
      
      if (existing) {
        if (existing.contentHash !== hash) {
          existing.changeCount++;
        }
        existing.contentHash = hash;
        existing.previousHash = existing.contentHash;
        existing.lastSeen = Date.now();
        existing.status = existing.contentHash !== hash ? 'changed' : 'unchanged';
      } else {
        state.urlHashes.set(result.url, {
          url: result.url,
          contentHash: hash,
          status: 'new',
          lastSeen: Date.now(),
          changeCount: 0,
        });
      }
    }

    // Mark URLs not seen in this crawl as potentially removed
    const currentUrls = new Set(results.map(r => r.url));
    for (const [url, urlState] of state.urlHashes) {
      if (!currentUrls.has(url)) {
        urlState.status = 'removed';
      }
    }

    state.lastCrawlAt = Date.now();
    state.totalPages = results.length;
    this.states.set(domain, state);
  }

  getState(domain: string): IncrementalState | null {
    return this.states.get(domain) || null;
  }

  getUrlState(domain: string, url: string): UrlState | null {
    return this.states.get(domain)?.urlHashes.get(url) || null;
  }

  getChangeHistory(domain: string): Array<{ url: string; changes: number; lastChanged: number }> {
    const state = this.states.get(domain);
    if (!state) return [];
    
    return Array.from(state.urlHashes.values())
      .filter(u => u.changeCount > 0)
      .map(u => ({
        url: u.url,
        changes: u.changeCount,
        lastChanged: u.lastSeen,
      }))
      .sort((a, b) => b.lastChanged - a.lastChanged);
  }

  async computeDiff(url: string): Promise<{ previous: string | null; current: string | null; diff: string | null }> {
    try {
      const domain = new URL(url).hostname;
      const state = this.states.get(domain);
      
      if (!state) {
        return { previous: null, current: null, diff: null };
      }
      
      const urlState = state.urlHashes.get(url);
      if (!urlState || !urlState.previousHash) {
        return { previous: null, current: null, diff: null };
      }

      // Get cached previous content
      const cached = advancedCache.get(url, {}, {});
      const previousContent = cached?.markdown || cached?.content || '';
      
      return {
        previous: previousContent,
        current: cached?.markdown || cached?.content || null,
        diff: this.generateDiff(previousContent, cached?.markdown || cached?.content || ''),
      };
    } catch {
      return { previous: null, current: null, diff: null };
    }
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private generateDiff(oldText: string, newText: string): string {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const diff: string[] = [];
    
    const maxLen = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      
      if (oldLine === newLine) {
        diff.push(`  ${oldLine || ''}`);
      } else if (oldLine === undefined) {
        diff.push(`+ ${newLine}`);
      } else if (newLine === undefined) {
        diff.push(`- ${oldLine}`);
      } else {
        diff.push(`- ${oldLine}`);
        diff.push(`+ ${newLine}`);
      }
    }
    
    return diff.join('\n');
  }

  clearState(domain?: string): void {
    if (domain) {
      this.states.delete(domain);
    } else {
      this.states.clear();
    }
  }

  getStats() {
    const stats: Record<string, { pages: number; lastCrawl: number; changes: number }> = {};
    
    for (const [domain, state] of this.states) {
      let changes = 0;
      for (const urlState of state.urlHashes.values()) {
        changes += urlState.changeCount;
      }
      
      stats[domain] = {
        pages: state.urlHashes.size,
        lastCrawl: state.lastCrawlAt,
        changes,
      };
    }
    
    return stats;
  }
}

export const incrementalCrawler = new IncrementalCrawler();
