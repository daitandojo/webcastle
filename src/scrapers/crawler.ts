// src/scrapers/crawler.ts
// Website crawling with sitemap discovery and async job processing

import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';
import { config } from '../config/env';
import { CrawlJob, CrawlJobStatus, CrawlOptions, ScrapeResult, ScrapeOptions } from './types';
import { advancedCache } from '../lib/utils/advanced-cache';
import { HtmlProcessor } from './processor';
import { webhookClient } from './webhook';
import { v4 as uuidv4 } from 'uuid';

interface DiscoveredUrl {
  url: string;
  depth: number;
  source: 'sitemap' | 'link' | 'initial';
}

export class Crawler {
  private jobs = new Map<string, CrawlJob>();
  private activeBrowsers = new Map<string, { browser: Browser; context: BrowserContext }>();

  async startCrawl(options: CrawlOptions): Promise<CrawlJob> {
    const jobId = `crawl_${uuidv4()}`;
    
    const job: CrawlJob = {
      id: jobId,
      status: CrawlJobStatus.PENDING,
      url: options.url,
      total: 0,
      completed: 0,
      creditsUsed: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      options,
    };

    this.jobs.set(jobId, job);

    // Start crawling in background
    this.runCrawl(jobId, options).catch(console.error);

    return job;
  }

  async getCrawlStatus(jobId: string): Promise<CrawlJob | null> {
    return this.jobs.get(jobId) || null;
  }

  async cancelCrawl(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.status = CrawlJobStatus.CANCELLED;
    job.updatedAt = new Date().toISOString();
    
    // Close browser if running
    const browserData = this.activeBrowsers.get(jobId);
    if (browserData) {
      await browserData.browser.close();
      this.activeBrowsers.delete(jobId);
    }

    return true;
  }

  private async runCrawl(jobId: string, options: CrawlOptions): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      job.status = CrawlJobStatus.SCRAPING;
      job.updatedAt = new Date().toISOString();

      // Send webhook: started
      if (options.webhook) {
        webhookClient.send(options.webhook, 'crawl.started', jobId, { url: options.url }, options.webhook.metadata);
      }

      // Discover URLs
      const discoveredUrls = await this.discoverUrls(options);
      const urlsToScrape = discoveredUrls.slice(0, options.limit || config.scraperMaxCrawlPages);
      
      job.total = urlsToScrape.length;

      const results: ScrapeResult[] = [];
      const maxConcurrency = options.maxConcurrency || config.scraperConcurrent;
      const delay = options.delay || 0;

      // Process URLs in batches
      for (let i = 0; i < urlsToScrape.length; i += maxConcurrency) {
        const batch = urlsToScrape.slice(i, i + maxConcurrency);
        const batchResults = await Promise.all(
          batch.map(async (discovered) => {
            try {
              const scrapeOptions: ScrapeOptions = {
                ...options.scrapeOptions,
                onlyMainContent: options.scrapeOptions?.onlyMainContent ?? true,
              };
               
              const result = await this.scrapeUrl(discovered.url, scrapeOptions, options.location);
               
              job.completed = (job.completed || 0) + 1;
              job.creditsUsed = (job.creditsUsed || 0) + 1;
              job.updatedAt = new Date().toISOString();

              // Send webhook: page
              if (options.webhook?.events?.includes('page')) {
                webhookClient.send(options.webhook, 'crawl.page', jobId, result, options.webhook.metadata);
              }

              return result;
            } catch (error: any) {
              return {
                success: false,
                url: discovered.url,
                title: '',
                content: '',
                metadata: {
                  fidelity: 'DEEP' as const,
                  latencyMs: 0,
                  wordCount: 0,
                  encoding: 'UTF-8',
                  statusCode: 0,
                  error: error.message,
                },
                error: error.message,
              };
            }
          })
        );

        results.push(...batchResults);

        // Apply delay between batches
        if (delay > 0 && i + maxConcurrency < urlsToScrape.length) {
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }

        // Check if cancelled
        const currentJob = this.jobs.get(jobId);
        if (currentJob?.status === CrawlJobStatus.CANCELLED) {
          break;
        }
      }

      // Complete the job
      job.status = results.length > 0 ? CrawlJobStatus.COMPLETED : CrawlJobStatus.FAILED;
      job.data = results;
      job.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
      job.updatedAt = new Date().toISOString();

      // Send webhook: completed
      if (options.webhook) {
        const eventType = job.status === CrawlJobStatus.COMPLETED ? 'crawl.completed' : 'crawl.failed';
        webhookClient.send(options.webhook, eventType, jobId, { data: results.slice(0, 100) }, options.webhook.metadata);
      }

    } catch (error: any) {
      job.status = CrawlJobStatus.FAILED;
      job.error = error.message;
      job.updatedAt = new Date().toISOString();

      // Send webhook: failed
      if (options.webhook) {
        webhookClient.send(options.webhook, 'crawl.failed', jobId, { error: error.message }, options.webhook.metadata);
      }
    }
  }

  private async discoverUrls(options: CrawlOptions): Promise<DiscoveredUrl[]> {
    const discovered: DiscoveredUrl[] = [];
    const visited = new Set<string>();
    const baseUrl = new URL(options.url);
    const maxDepth = options.maxDiscoveryDepth || config.scraperMaxDepth;

    const shouldInclude = (url: string): boolean => {
      const urlObj = new URL(url);
      
      // Check external links
      if (!options.allowExternalLinks && urlObj.hostname !== baseUrl.hostname) {
        return false;
      }
      
      // Check subdomains
      if (!options.allowSubdomains && !urlObj.hostname.endsWith(baseUrl.hostname) && urlObj.hostname !== baseUrl.hostname) {
        return false;
      }

      // Check include paths
      if (options.includePaths && options.includePaths.length > 0) {
        const matches = options.includePaths.some((pattern: string) => {
          const regex = new RegExp(pattern);
          return regex.test(urlObj.pathname);
        });
        if (!matches) return false;
      }

      // Check exclude paths
      if (options.excludePaths && options.excludePaths.length > 0) {
        const matches = options.excludePaths.some((pattern: string) => {
          const regex = new RegExp(pattern);
          return regex.test(urlObj.pathname);
        });
        if (matches) return false;
      }

      // Check query parameters
      if (options.ignoreQueryParameters) {
        urlObj.search = '';
      }

      return true;
    };

    // Sitemap discovery
    if (options.sitemap !== 'skip') {
      const sitemapUrls = await this.parseSitemap(options.url, options.sitemap === 'only');
      for (const url of sitemapUrls) {
        if (!visited.has(url) && shouldInclude(url)) {
          visited.add(url);
          discovered.push({ url, depth: 0, source: 'sitemap' });
        }
      }
    }

    // If we have no URLs from sitemap or not in "only" mode, start from initial URL
    if (options.sitemap !== 'only' || discovered.length === 0) {
      if (!visited.has(options.url)) {
        visited.add(options.url);
        discovered.push({ url: options.url, depth: 0, source: 'initial' });
      }

      // Recursive link discovery
      if (options.sitemap !== 'only' && discovered.length < options.limit!) {
        await this.discoverFromLinks(
          options.url,
          discovered,
          visited,
          shouldInclude,
          0,
          maxDepth,
          options
        );
      }
    }

    return discovered;
  }

  private async parseSitemap(baseUrl: string, onlyMode: boolean): Promise<string[]> {
    const urls: string[] = [];
    
    try {
      const sitemapUrl = new URL('/sitemap.xml', baseUrl).href;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.scraperSitemapTimeout);
      
      const response = await fetch(sitemapUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': config.scraperUserAgent,
        },
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        if (!onlyMode) {
          console.log(`No sitemap found at ${sitemapUrl}`);
        }
        return urls;
      }

      const xml = await response.text();
      
      // Parse XML for URLs
      const urlMatches = xml.match(/<loc>([^<]+)<\/loc>/g);
      if (urlMatches) {
        for (const match of urlMatches) {
          const url = match.replace(/<loc>|<\/loc>/g, '').trim();
          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            urls.push(url);
          }
        }
      }
      
      // Also check for sitemap index
      const indexMatches = xml.match(/<sitemap><loc>([^<]+)<\/loc>/g);
      if (indexMatches && !onlyMode) {
        // Could recursively parse sitemap indexes
      }
      
    } catch (error) {
      if (!onlyMode) {
        console.log(`Failed to parse sitemap: ${error}`);
      }
    }
    
    return urls;
  }

  private async discoverFromLinks(
    url: string,
    discovered: DiscoveredUrl[],
    visited: Set<string>,
    shouldInclude: (url: string) => boolean,
    currentDepth: number,
    maxDepth: number,
    options: CrawlOptions
  ): Promise<void> {
    if (currentDepth >= maxDepth || discovered.length >= (options.limit || config.scraperMaxCrawlPages)) {
      return;
    }

    try {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: config.playwrightViewport,
        userAgent: config.scraperUserAgent,
      });
      
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.playwrightTimeoutMs });
      
      const html = await page.content();
      const links = HtmlProcessor.extractHyperlinks(html, url, { limit: 100 });
      
      await browser.close();
      
      for (const link of links) {
        if (discovered.length >= (options.limit || config.scraperMaxCrawlPages)) {
          break;
        }
        
        if (!visited.has(link.href) && shouldInclude(link.href)) {
          // Check if it's a child path (unless crawlEntireDomain is set)
          if (!options.crawlEntireDomain) {
            const linkUrl = new URL(link.href);
            if (!linkUrl.pathname.startsWith(new URL(url).pathname) || linkUrl.pathname.split('/').length > new URL(url).pathname.split('/').length + 1) {
              continue;
            }
          }
          
          visited.add(link.href);
          discovered.push({ url: link.href, depth: currentDepth + 1, source: 'link' });
          
          // Recursively discover from this link
          await this.discoverFromLinks(
            link.href,
            discovered,
            visited,
            shouldInclude,
            currentDepth + 1,
            maxDepth,
            options
          );
        }
      }
      
    } catch (error) {
      console.log(`Failed to discover links from ${url}: ${error}`);
    }
  }

  private async scrapeUrl(url: string, options?: ScrapeOptions, location?: any): Promise<ScrapeResult> {
    const startTime = Date.now();
    
    // Check cache first
    const cached = advancedCache.get(url, options, { maxAge: options?.maxAge });
    if (cached) {
      return cached;
    }

    try {
      const browser = await chromium.launch({ 
        headless: config.playwrightHeadless,
        args: ['--no-sandbox'],
      });
      
      const contextOptions: any = {
        viewport: config.playwrightViewport,
        javaScriptEnabled: true,
      };
      
      // Mobile emulation
      if (options?.mobile) {
        contextOptions.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
        contextOptions.viewport = { width: 390, height: 844 };
      }
      
      // Location
      if (location?.country) {
        contextOptions.geolocation = { latitude: 0, longitude: 0 };
        contextOptions.locale = location.languages?.[0] || 'en-US';
      }
      
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      
      // Wait for options
      if (options?.waitFor) {
        await page.waitForTimeout(options.waitFor);
      }
      
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: options?.timeout || config.playwrightTimeoutMs,
      });
      
      // Handle actions
      if (options?.actions) {
        for (const action of options.actions) {
          await this.executeAction(page, action);
        }
      }
      
      let html = await page.content();
      const title = await page.title();
      
      // Clean HTML if requested
      if (options?.onlyMainContent !== false) {
        const cleaned = HtmlProcessor.toMarkdown(html, url);
        html = cleaned.content;
      }
      
      await browser.close();
      
      const result: ScrapeResult = {
        success: true,
        url,
        title,
        content: html,
        markdown: html,
        metadata: {
          fidelity: 'DEEP',
          latencyMs: Date.now() - startTime,
          wordCount: html.split(/\s+/).length,
          encoding: 'UTF-8',
          title,
          sourceURL: url,
        },
      };
      
      // Cache the result
      advancedCache.set(url, result, options);
      
      return result;
      
    } catch (error: any) {
      return {
        success: false,
        url,
        title: '',
        content: '',
        metadata: {
          fidelity: 'DEEP',
          latencyMs: Date.now() - startTime,
          wordCount: 0,
          encoding: 'UTF-8',
        },
        error: error.message,
      };
    }
  }

  private async executeAction(page: Page, action: any): Promise<void> {
    switch (action.type) {
      case 'wait':
        if (action.milliseconds) {
          await page.waitForTimeout(action.milliseconds);
        } else if (action.selector) {
          await page.waitForSelector(action.selector, { timeout: 5000 }).catch(() => {});
        }
        break;
      case 'click':
        if (action.selector) {
          await page.click(action.selector).catch(() => {});
        }
        break;
      case 'write':
        if (action.selector && action.text) {
          await page.fill(action.selector, action.text).catch(() => {});
        }
        break;
      case 'press':
        if (action.key) {
          await page.keyboard.press(action.key).catch(() => {});
        }
        break;
      case 'scroll':
        if (action.direction === 'down') {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        } else {
          await page.evaluate(() => window.scrollBy(0, -window.innerHeight));
        }
        break;
    }
  }
}

export const crawler = new Crawler();
