// src/scrapers/engine.ts
// Complete scraping engine with Firecrawl-inspired features

import { 
  ScrapeIntent, 
  ScrapeResult, 
  ScraperCapabilities, 
  ScraperEngine, 
  BatchScrapeRequest,
  CrawlOptions,
  CrawlJob,
  SearchOptions,
  SearchResponse,
  InteractOptions,
  InteractResponse,
  ScrapeOptions,
  ScrapeMode,
} from './types';
import { browserManager } from './browser';
import { HtmlProcessor } from './processor';
import { fastScraper } from './fastScraper';
import { config } from '../config/env';
import { concurrencyPool } from '../lib/utils/concurrency-pool';
import { advancedCache } from '../lib/utils/advanced-cache';
import { rateLimit } from '../lib/utils/rate-limiter';
import { crawler } from './crawler';
import { searchEngine } from './search';
import { interactEngine } from './interact';
import { llmExtractor } from './llm';
import { changeTracker } from './change-tracking';
import { brandingExtractor } from './branding';

export class ScraperEngineImpl implements ScraperEngine {
  async scrape(intent: ScrapeIntent): Promise<ScrapeResult> {
    const startTime = Date.now();
    const options = intent.options || {};

    // Check advanced cache with maxAge/minAge
    const cachedResult = advancedCache.get(
      intent.url, 
      options,
      { maxAge: options.maxAge, minAge: options.minAge }
    );
    
    if (cachedResult) {
      console.log(`Cache hit for: ${intent.url}`);
      return {
        ...cachedResult,
        metadata: {
          ...cachedResult.metadata,
          latencyMs: Date.now() - startTime,
          cacheHit: true,
        },
      };
    }

    try {
      let result: ScrapeResult;

      if (intent.fidelity === 'FAST') {
        result = await rateLimit(() => concurrencyPool(() => this.fastScrape(intent)));
      } else {
        result = await rateLimit(() => concurrencyPool(() => this.deepScrape(intent)));
      }

      // Handle change tracking
      if (options.formats?.includes('changeTracking') || 
          (typeof options.formats?.[0] === 'object' && (options.formats[0] as any).type === 'changeTracking')) {
        const changeOptions = typeof options.formats?.[0] === 'object' 
          ? (options.formats[0] as any) 
          : undefined;
        
        result.changeTracking = await changeTracker.checkChanges(
          intent.url, 
          result,
          {
            mode: changeOptions?.modes?.[0] as 'git-diff' | 'json' || 'json',
            tag: changeOptions?.tag,
          }
        );
      }

      // Cache successful results
      if (result.success && options.storeInCache !== false) {
        advancedCache.set(intent.url, result, options);
      }

      result.metadata.latencyMs = Date.now() - startTime;
      return result;

    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      
      return {
        success: false,
        url: intent.url,
        title: '',
        content: '',
        error: error.message || 'Unknown error during scraping',
        metadata: {
          fidelity: intent.fidelity,
          latencyMs,
          wordCount: 0,
          encoding: 'UTF-8',
        },
      };
    }
  }

  private async fastScrape(intent: ScrapeIntent): Promise<ScrapeResult> {
    const startTime = Date.now();
    const options = intent.options || {};

    try {
      const result = await fastScraper.scrape(intent);
      
      // Process additional formats
      return await this.processOutputFormats(result, intent, startTime);
    } catch (error: any) {
      return {
        success: false,
        url: intent.url,
        title: '',
        content: '',
        error: error.message,
        metadata: {
          fidelity: 'FAST',
          latencyMs: Date.now() - startTime,
          wordCount: 0,
          encoding: 'UTF-8',
        },
      };
    }
  }

  private async deepScrape(intent: ScrapeIntent): Promise<ScrapeResult> {
    const startTime = Date.now();
    const options = intent.options || {};

    return browserManager.withStealthPage(async (page) => {
      await browserManager.navigateWithTimeout(page, intent.url, options.timeout || config.playwrightTimeoutMs);
      await browserManager.handleConsent(page);

      const { html, title } = await browserManager.getPageContent(page);

      // Determine what formats to extract
      const formats = options.formats || ['markdown'];

      let content = '';
      let markdown: string | undefined;
      let htmlContent: string | undefined;
      let rawHtml: string | undefined;
      let screenshot: string | undefined;
      let json: Record<string, any> | undefined;
      let summary: string | undefined;
      let branding: Record<string, any> | undefined;
      let structuredData: Record<string, any> | undefined;

      // Process each requested format
      for (const format of formats) {
        const formatObj = typeof format === 'string' ? { type: format } : format;

        switch (formatObj.type) {
          case 'markdown':
          case 'cleanText':
          case 'CLEAN_TEXT':
            if (!markdown) {
              const distilled = HtmlProcessor.toMarkdown(html, intent.url);
              markdown = distilled.content;
              content = distilled.content;
            }
            break;

          case 'html':
          case 'FULL_HTML':
            if (!htmlContent) {
              htmlContent = HtmlProcessor.toMarkdown(html, intent.url).content;
            }
            break;

          case 'rawHtml':
            if (!rawHtml) {
              rawHtml = html;
            }
            break;

          case 'json':
            const jsonOptions = {
              schema: formatObj.schema,
              prompt: formatObj.prompt,
            };
            if (!json && (markdown || html)) {
              json = await llmExtractor.extractJson(markdown || html, jsonOptions);
            }
            break;

          case 'summary':
            if (!summary && (markdown || html)) {
              summary = await llmExtractor.generateSummary(markdown || html);
            }
            break;

          case 'branding':
            if (!branding) {
              branding = brandingExtractor.extract(html, intent.url);
            }
            break;

          case 'links':
          case 'HYPERLINKS':
            structuredData = {
              ...structuredData,
              hyperlinks: HtmlProcessor.extractHyperlinks(html, intent.url, {
                limit: options.limit,
                includeInternal: options.includeInternal,
                includeExternal: options.includeExternal,
                filterByDomain: options.filterByDomain,
              }),
            };
            break;

          case 'images':
          case 'IMAGE_HUNT':
            structuredData = {
              ...structuredData,
              images: HtmlProcessor.extractImages(html, intent.url, {
                limit: options.limit,
              }),
            };
            break;

          case 'metadata':
          case 'METADATA':
            structuredData = {
              ...structuredData,
              metadata: HtmlProcessor.extractMetaTags(html),
            };
            break;

          case 'screenshot':
            if (!screenshot && formatObj.type === 'screenshot') {
              const screenshotOptions = formatObj as any;
              const screenshotBuffer = await browserManager.takeScreenshot(
                page, 
                screenshotOptions?.fullPage ?? true
              );
              screenshot = screenshotBuffer.toString('base64');
            }
            break;

          case 'PRECISION_SELECTORS':
            if (options.selectors) {
              structuredData = {
                ...structuredData,
                selectors: HtmlProcessor.extractBySelectors(html, options.selectors),
              };
            }
            break;
        }
      }

      // Take screenshot if requested
      if (options.screenshot && !screenshot) {
        const screenshotBuffer = await browserManager.takeScreenshot(page, true);
        screenshot = screenshotBuffer.toString('base64');
      }

      // Extract metadata
      const metaTags = HtmlProcessor.extractMetaTags(html);

      return {
        success: true,
        url: intent.url,
        title: title || intent.url,
        content: content || markdown || '',
        markdown,
        html: htmlContent,
        rawHtml,
        screenshot,
        json,
        summary,
        branding,
        structuredData,
        metadata: {
          fidelity: 'DEEP',
          latencyMs: 0,
          wordCount: (markdown || content).split(/\s+/).length,
          encoding: 'UTF-8',
          title: metaTags.title || title,
          description: metaTags.description,
          language: metaTags.language,
          keywords: metaTags.keywords?.split(',').map(k => k.trim()),
          sourceURL: intent.url,
        },
      };
    });
  }

  private async processOutputFormats(
    result: ScrapeResult, 
    intent: ScrapeIntent,
    startTime: number
  ): Promise<ScrapeResult> {
    const options = intent.options || {};
    const formats = options.formats || ['markdown'];

    for (const format of formats) {
      const formatObj = typeof format === 'string' ? { type: format } : format;

      if (formatObj.type === 'json' && result.markdown) {
        result.json = await llmExtractor.extractJson(result.markdown, {
          schema: formatObj.schema,
          prompt: formatObj.prompt,
        });
      }

      if (formatObj.type === 'summary' && result.markdown) {
        result.summary = await llmExtractor.generateSummary(result.markdown);
      }

      if (formatObj.type === 'branding' && result.rawHtml) {
        result.branding = brandingExtractor.extract(result.rawHtml, intent.url);
      }
    }

    return result;
  }

  async scrapeBatch(request: BatchScrapeRequest): Promise<ScrapeResult[]> {
    const results: ScrapeResult[] = [];
    const stopOnFirstError = request.options?.stopOnFirstError || false;
    const parallel = request.options?.parallel || Math.min(3, config.scraperConcurrent);

    for (let i = 0; i < request.urls.length; i += parallel) {
      const batch = request.urls.slice(i, i + parallel);
      const batchResults = await Promise.all(
        batch.map(async (intent) => {
          try {
            return await this.scrape(intent);
          } catch (error: any) {
            return {
              success: false,
              url: intent.url,
              title: '',
              content: '',
              error: error.message || 'Batch scrape error',
              metadata: {
                fidelity: intent.fidelity,
                latencyMs: 0,
                wordCount: 0,
                encoding: 'UTF-8',
              },
            };
          }
        })
      );

      results.push(...batchResults);

      if (stopOnFirstError && !batchResults.every(r => r.success)) {
        break;
      }
    }

    return results;
  }

  // Crawl endpoint implementation
  async crawl(options: CrawlOptions): Promise<CrawlJob> {
    return crawler.startCrawl(options);
  }

  async getCrawlStatus(jobId: string): Promise<CrawlJob | null> {
    return crawler.getCrawlStatus(jobId);
  }

  // Search endpoint implementation
  async search(options: SearchOptions): Promise<SearchResponse> {
    return searchEngine.search(options);
  }

  // Interact endpoint implementation
  async interact(scrapeId: string, options: InteractOptions): Promise<InteractResponse> {
    return interactEngine.interact(scrapeId, options);
  }

  async stopInteraction(scrapeId: string): Promise<void> {
    return interactEngine.stopInteraction(scrapeId);
  }

  getCapabilities(): ScraperCapabilities {
    const modes: ScrapeMode[] = [
      'CLEAN_TEXT', 
      'FULL_HTML', 
      'PRECISION_SELECTORS', 
      'IMAGE_HUNT', 
      'HYPERLINKS', 
      'METADATA'
    ];
    
    return {
      name: 'Scraping Service Engine',
      version: '1.0.0',
      supportedModes: modes,
      supportedFormats: [
        'markdown', 
        'html', 
        'rawHtml', 
        'links', 
        'images', 
        'screenshot', 
        'json', 
        'metadata',
        'audio',
        'branding',
        'changeTracking',
        'summary',
      ],
      capabilities: [
        'FAST scraping (HTTP + Readability)',
        'DEEP scraping (Playwright browser)',
        'Website crawling with sitemap discovery',
        'Web search with content extraction',
        'AI-powered browser interactions',
        'LLM JSON schema extraction',
        'Content change tracking',
        'Branding extraction',
        'Mobile emulation',
        'Geographic targeting',
        'Proxy support',
        'Ad-blocking',
        'Session persistence',
        'Webhook notifications',
      ],
      limits: {
        maxUrlsPerBatch: config.scraperMaxUrlsPerBatch,
        maxConcurrent: config.scraperConcurrent,
        timeoutMs: config.scraperTimeoutMs,
        rateLimitRps: config.scraperRateLimitRps,
        maxCrawlPages: config.scraperMaxCrawlPages,
      },
    };
  }
}

export const scraperEngine = new ScraperEngineImpl();
