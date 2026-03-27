/**
 * Scraping Types and Interfaces - Firecrawl-Inspired
 * Comprehensive type definitions for all scraping features
 */

import { z } from 'zod';

// =============== CORE TYPES ===============

export interface ScraperError {
  code: string;
  message: string;
  details?: string;
}

export interface ScraperStatistics {
  processingTimeMs: number;
  characterCount: number;
  wordCount: number;
  imageCount: number;
  [key: string]: any;
}

export interface ScraperMetadata {
  fidelity: 'FAST' | 'DEEP';
  mode: ScrapeMode;
  url: string;
  timestamp: string;
  userAgent: string;
  [key: string]: any;
}

// =============== ZOD SCHEMAS ===============

export const scrapeModeSchema = z.enum([
  'FULL_HTML',
  'CLEAN_TEXT',
  'PRECISION_SELECTORS',
  'IMAGE_HUNT',
  'HYPERLINKS',
  'METADATA',
]);
export type ScrapeMode = z.infer<typeof scrapeModeSchema>;

// Output format types (Firecrawl-inspired)
export const outputFormatSchema = z.union([
  z.literal('markdown'),
  z.literal('html'),
  z.literal('rawHtml'),
  z.literal('links'),
  z.literal('images'),
  z.literal('screenshot'),
  z.literal('json'),
  z.literal('metadata'),
  z.literal('audio'),
  z.literal('branding'),
  z.literal('changeTracking'),
  z.literal('summary'),
]);
export type OutputFormat = z.infer<typeof outputFormatSchema>;

// Screenshot options
export const screenshotOptionsSchema = z.object({
  fullPage: z.boolean().optional(),
  quality: z.number().min(1).max(100).optional(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }).optional(),
}).optional();
export type ScreenshotOptions = z.infer<typeof screenshotOptionsSchema>;

// JSON extraction schema
export const jsonOptionsSchema = z.object({
  schema: z.record(z.string(), z.any()).optional(),
  prompt: z.string().optional(),
});
export type JsonOptions = z.infer<typeof jsonOptionsSchema>;

// Location/geographic targeting
export const locationSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  languages: z.array(z.string()).optional(),
});
export type Location = z.infer<typeof locationSchema>;

// Browser profile for session persistence
export const browserProfileSchema = z.object({
  name: z.string().min(1).max(128),
  saveChanges: z.boolean().optional().default(true),
});
export type BrowserProfile = z.infer<typeof browserProfileSchema>;

// Proxy configuration
export const proxySchema = z.enum(['basic', 'enhanced', 'auto']);
export type ProxyType = z.infer<typeof proxySchema>;

// PDF parser options
export const pdfParserOptionsSchema = z.object({
  type: z.literal('pdf'),
  mode: z.enum(['fast', 'auto', 'ocr']).optional().default('auto'),
  maxPages: z.number().min(1).max(10000).optional(),
}).optional();
export type PdfParserOptions = z.infer<typeof pdfParserOptionsSchema>;

// Complete scrape options - backward compatible
export const scrapeOptionsSchema = z.object({}).catchall(z.any());
export type ScrapeOptions = z.infer<typeof scrapeOptionsSchema>;

// Scrape intent schema
export const scrapeIntentSchema = z.object({
  url: z.string().url(),
  fidelity: z.enum(['FAST', 'DEEP']).default('DEEP'),
  mode: scrapeModeSchema.default('CLEAN_TEXT'),
  options: scrapeOptionsSchema.optional(),
});
export type ScrapeIntent = z.infer<typeof scrapeIntentSchema>;

// Scrape result schema
export const scrapeResultSchema = z.object({
  success: z.boolean(),
  url: z.string(),
  title: z.string(),
  content: z.string(),
  markdown: z.string().optional(),
  html: z.string().optional(),
  rawHtml: z.string().optional(),
  screenshot: z.string().optional(),
  screenshotUrl: z.string().optional(),
  links: z.array(z.string()).optional(),
  images: z.array(z.object({ url: z.string(), alt: z.string() })).optional(),
  audio: z.string().optional(),
  json: z.record(z.string(), z.any()).optional(),
  summary: z.string().optional(),
  branding: z.record(z.string(), z.any()).optional(),
  changeTracking: z.record(z.string(), z.any()).optional(),
  structuredData: z.record(z.string(), z.any()).optional(),
  metadata: z.object({
    fidelity: z.enum(['FAST', 'DEEP']),
    latencyMs: z.number(),
    wordCount: z.number(),
    encoding: z.string(),
    statusCode: z.number().optional(),
    cacheHit: z.boolean().optional(),
    scrapeId: z.string().optional(),
    sourceURL: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    language: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    ogLocaleAlternate: z.array(z.string()).optional(),
    contentType: z.string().optional(),
  }),
  error: z.string().optional(),
  warning: z.string().optional(),
});
export type ScrapeResult = z.infer<typeof scrapeResultSchema>;

// =============== BATCH SCRAPING ===============

export const batchScrapeRequestSchema = z.object({
  urls: z.array(scrapeIntentSchema),
  options: z.object({
    parallel: z.number().min(1).max(50).optional(),
    stopOnFirstError: z.boolean().optional(),
  }).optional(),
});
export type BatchScrapeRequest = z.infer<typeof batchScrapeRequestSchema>;

// =============== CRAWL JOB TYPES ===============

export const crawlOptionsSchema = z.object({}).catchall(z.any());
export type CrawlOptions = z.infer<typeof crawlOptionsSchema>;

// Crawl job status
export const CrawlJobStatus = {
  PENDING: 'pending',
  SCRAPING: 'scraping',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;
export type CrawlJobStatus = typeof CrawlJobStatus[keyof typeof CrawlJobStatus];

export const crawlJobSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'scraping', 'completed', 'failed', 'cancelled']),
  url: z.string(),
  total: z.number().optional(),
  completed: z.number().optional(),
  creditsUsed: z.number().optional(),
  expiresAt: z.string().optional(),
  data: z.array(scrapeResultSchema).optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  options: crawlOptionsSchema.optional(),
});
export type CrawlJob = z.infer<typeof crawlJobSchema>;

// =============== SEARCH TYPES ===============

export const searchOptionsSchema = z.object({}).catchall(z.any());
export type SearchOptions = z.infer<typeof searchOptionsSchema>;

export const searchResultSchema = z.object({
  url: z.string(),
  title: z.string(),
  description: z.string().optional(),
  position: z.number().optional(),
  category: z.string().optional(),
  imageUrl: z.string().optional(),
  imageWidth: z.number().optional(),
  imageHeight: z.number().optional(),
  date: z.string().optional(),
  snippet: z.string().optional(),
  markdown: z.string().optional(),
  links: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    web: z.array(searchResultSchema).optional(),
    images: z.array(searchResultSchema).optional(),
    news: z.array(searchResultSchema).optional(),
  }),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

// =============== INTERACT TYPES ===============

export const interactOptionsSchema = z.object({}).catchall(z.any());
export type InteractOptions = z.infer<typeof interactOptionsSchema>;

export const interactResponseSchema = z.object({
  success: z.boolean(),
  liveViewUrl: z.string().optional(),
  interactiveLiveViewUrl: z.string().optional(),
  output: z.string().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  result: z.any().optional(),
  exitCode: z.number().optional(),
  killed: z.boolean().optional(),
});
export type InteractResponse = z.infer<typeof interactResponseSchema>;

// =============== CHANGE TRACKING ===============

export const changeTrackingOptionsSchema = z.object({}).catchall(z.any());
export type ChangeTrackingOptions = z.infer<typeof changeTrackingOptionsSchema>;

export const changeTrackingResultSchema = z.object({
  previousScrapeAt: z.string().nullable(),
  changeStatus: z.enum(['new', 'same', 'changed', 'removed']),
  visibility: z.enum(['visible', 'hidden']),
  diff: z.string().nullable(),
  json: z.record(z.string(), z.any()).nullable(),
});
export type ChangeTrackingResult = z.infer<typeof changeTrackingResultSchema>;

// =============== ENGINE INTERFACES ===============

export interface ScraperCapabilities {
  name: string;
  version: string;
  supportedModes: ScrapeMode[];
  supportedFormats: OutputFormat[];
  capabilities: string[];
  limits: {
    maxUrlsPerBatch: number;
    maxConcurrent: number;
    timeoutMs: number;
    rateLimitRps: number;
    maxCrawlPages: number;
  };
}

export interface ScraperEngine {
  scrape(intent: ScrapeIntent): Promise<ScrapeResult>;
  scrapeBatch(request: BatchScrapeRequest): Promise<ScrapeResult[]>;
  crawl(options: CrawlOptions): Promise<CrawlJob>;
  getCrawlStatus(jobId: string): Promise<CrawlJob | null>;
  search(options: SearchOptions): Promise<SearchResponse>;
  interact(scrapeId: string, options: InteractOptions): Promise<InteractResponse>;
  stopInteraction(scrapeId: string): Promise<void>;
  getCapabilities(): ScraperCapabilities;
}

// =============== API RESPONSE TYPES ===============

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    processingTimeMs: number;
    timestamp: string;
    requestId?: string;
    cacheHit?: boolean;
  };
}

export interface ScrapeResponse extends ApiResponse<ScrapeResult> {
  url: string;
}

export interface BatchScrapeResponse extends ApiResponse<ScrapeResult[]> {
  total: number;
  successful: number;
  failed: number;
}

export interface CrawlResponse extends ApiResponse<CrawlJob> {}

export interface SearchResponseFull extends ApiResponse<SearchResponse> {}

export interface InteractResponseFull extends ApiResponse<InteractResponse> {}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  scrapers: {
    browser: {
      available: boolean;
      version: string;
    };
    fast: {
      available: boolean;
      version: string;
    };
  };
}

export interface StoreRequest {
  url: string;
  userEmail: string;
  agentId?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  scrapeOptions?: Omit<ScrapeIntent, 'url'>;
}

// =============== CACHE TYPES ===============

export interface CacheEntry {
  result: ScrapeResult;
  timestamp: number;
  ttl: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  ttlMs: number;
}

// =============== LEGACY TYPES (for compatibility) ===============

export const selectorScrapeRequestSchema = z.object({
  url: z.string().url(),
  selectors: z.array(z.string()).min(1),
  options: z.object({
    asJson: z.boolean().optional(),
    screenshot: z.boolean().optional(),
  }).optional(),
});
export type SelectorScrapeRequest = z.infer<typeof selectorScrapeRequestSchema>;

export const imageScrapeRequestSchema = z.object({
  url: z.string().url(),
  imageQuery: z.string().optional(),
  options: z.object({
    limit: z.number().min(1).max(100).optional(),
    minWidth: z.number().optional(),
    minHeight: z.number().optional(),
  }).optional(),
});
export type ImageScrapeRequest = z.infer<typeof imageScrapeRequestSchema>;

export const screenshotRequestSchema = z.object({
  url: z.string().url(),
  options: z.object({
    fullPage: z.boolean().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    quality: z.number().min(0).max(100).optional(),
  }).optional(),
});
export type ScreenshotRequest = z.infer<typeof screenshotRequestSchema>;
