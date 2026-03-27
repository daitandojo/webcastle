// src/scrapers/change-tracking.ts
// Content change tracking between scrapes

import { advancedCache } from '../lib/utils/advanced-cache';
import { ScrapeResult, ChangeTrackingResult, ChangeTrackingOptions } from './types';

export class ChangeTracker {
  async checkChanges(
    url: string,
    currentResult: ScrapeResult,
    options?: ChangeTrackingOptions
  ): Promise<ChangeTrackingResult> {
    const previousData = advancedCache.getChangeTrackingData(url);
    const now = new Date().toISOString();

    if (!previousData) {
      // First time scraping this URL
      advancedCache.setChangeTrackingData(url, {
        content: currentResult.markdown || currentResult.content,
        json: currentResult.json,
        timestamp: now,
        tag: options?.tag || null,
      });

      return {
        previousScrapeAt: null,
        changeStatus: 'new',
        visibility: 'visible',
        diff: null,
        json: null,
      };
    }

    // Check if tag matches
    if (options?.tag && previousData.tag !== options.tag) {
      // Different tag, treat as new
      advancedCache.setChangeTrackingData(url, {
        content: currentResult.markdown || currentResult.content,
        json: currentResult.json,
        timestamp: now,
        tag: options.tag,
      });

      return {
        previousScrapeAt: null,
        changeStatus: 'new',
        visibility: 'visible',
        diff: null,
        json: null,
      };
    }

    const previousContent = previousData.content;
    const currentContent = currentResult.markdown || currentResult.content;

    // Determine change status based on mode
    if (options?.mode === 'json') {
      return this.compareJson(url, previousData, currentResult, now, options);
    } else {
      return this.compareDiff(url, previousData, currentResult, now);
    }
  }

  private compareJson(
    url: string,
    previousData: any,
    currentResult: ScrapeResult,
    now: string,
    options: ChangeTrackingOptions
  ): ChangeTrackingResult {
    const previousJson = previousData.json || {};
    const currentJson = currentResult.json || {};
    
    // Simple JSON comparison
    const changes: Record<string, { previous: any; current: any }> = {};
    
    const allKeys = new Set([...Object.keys(previousJson), ...Object.keys(currentJson)]);
    
    for (const key of allKeys) {
      const prev = previousJson[key];
      const curr = currentJson[key];
      
      if (JSON.stringify(prev) !== JSON.stringify(curr)) {
        changes[key] = { previous: prev, current: curr };
      }
    }

    const hasChanges = Object.keys(changes).length > 0;
    const changeStatus = hasChanges ? 'changed' : 'same';

    // Update cache
    advancedCache.setChangeTrackingData(url, {
      content: currentResult.markdown || currentResult.content,
      json: currentJson,
      timestamp: now,
      tag: options.tag || null,
    });

    return {
      previousScrapeAt: previousData.timestamp,
      changeStatus,
      visibility: 'visible',
      diff: null,
      json: changes,
    };
  }

  private compareDiff(
    url: string,
    previousData: any,
    currentResult: ScrapeResult,
    now: string
  ): ChangeTrackingResult {
    const previousContent = previousData.content;
    const currentContent = currentResult.markdown || currentResult.content;

    // Generate git-style diff
    const diff = this.generateDiff(previousContent, currentContent);
    const hasChanges = diff.trim().length > 0;

    const changeStatus = hasChanges ? 'changed' : 'same';

    // Update cache
    advancedCache.setChangeTrackingData(url, {
      content: currentContent,
      json: currentResult.json,
      timestamp: now,
      tag: null,
    });

    return {
      previousScrapeAt: previousData.timestamp,
      changeStatus,
      visibility: 'visible',
      diff,
      json: null,
    };
  }

  private generateDiff(oldText: string, newText: string): string {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    
    const diff: string[] = [];
    
    // Simple line-by-line diff
    let i = 0, j = 0;
    
    while (i < oldLines.length || j < newLines.length) {
      if (i >= oldLines.length) {
        // New lines added
        diff.push(`+ ${newLines[j]}`);
        j++;
      } else if (j >= newLines.length) {
        // Lines removed
        diff.push(`- ${oldLines[i]}`);
        i++;
      } else if (oldLines[i] === newLines[j]) {
        // No change
        diff.push(`  ${oldLines[i]}`);
        i++;
        j++;
      } else {
        // Check if line was modified
        const oldSimilar = this.similar(oldLines[i], newLines[j]);
        if (oldSimilar > 0.5) {
          diff.push(`- ${oldLines[i]}`);
          diff.push(`+ ${newLines[j]}`);
          i++;
          j++;
        } else {
          // Different lines - might be additions or deletions
          diff.push(`- ${oldLines[i]}`);
          i++;
        }
      }
      
      // Limit diff size
      if (diff.length > 100) {
        diff.push('... (truncated)');
        break;
      }
    }

    return diff.join('\n');
  }

  private similar(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    
    const editDistance = this.levenshtein(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  getHistory(url: string): Array<{ timestamp: string; tag?: string }> {
    // This would require a more sophisticated storage system
    // For now, return empty
    return [];
  }
}

export const changeTracker = new ChangeTracker();
