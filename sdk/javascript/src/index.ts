/**
 * WebCastle SDK - TypeScript/JavaScript
 * Official SDK for the WebCastle AI-Powered Web Scraping API
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

// =============== Types ===============

export interface ScrapeOptions {
  url: string;
  formats?: string[];
  onlyMainContent?: boolean;
  mobile?: boolean;
  timeout?: number;
  waitFor?: number;
  screenshot?: boolean;
  json?: {
    schema?: Record<string, any>;
    prompt?: string;
  };
  headers?: Record<string, string>;
}

export interface ScrapeResult {
  success: boolean;
  url: string;
  title: string;
  content: string;
  markdown?: string;
  html?: string;
  rawHtml?: string;
  screenshot?: string;
  json?: Record<string, any>;
  summary?: string;
  branding?: Record<string, any>;
  changeTracking?: Record<string, any>;
  structuredData?: Record<string, any>;
  metadata: {
    fidelity: 'FAST' | 'DEEP';
    latencyMs: number;
    wordCount: number;
    encoding: string;
    statusCode?: number;
    cacheHit?: boolean;
    scrapeId?: string;
  };
  error?: string;
}

export interface CrawlOptions {
  url: string;
  limit?: number;
  maxDiscoveryDepth?: number;
  includePaths?: string[];
  excludePaths?: string[];
  allowExternalLinks?: boolean;
  sitemap?: 'include' | 'skip' | 'only';
  scrapeOptions?: Partial<ScrapeOptions>;
  webhook?: {
    url: string;
    events?: string[];
  };
}

export interface CrawlJob {
  id: string;
  status: 'pending' | 'scraping' | 'completed' | 'failed' | 'cancelled';
  url: string;
  total?: number;
  completed?: number;
  data?: ScrapeResult[];
  expiresAt?: string;
  error?: string;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  sources?: ('web' | 'news' | 'images')[];
  categories?: ('github' | 'research' | 'pdf')[];
  tbs?: string;
  location?: string;
  scrapeOptions?: Partial<ScrapeOptions>;
}

export interface SearchResult {
  url: string;
  title: string;
  description?: string;
  markdown?: string;
  position?: number;
}

export interface InteractOptions {
  prompt?: string;
  code?: string;
  language?: 'node' | 'python' | 'bash';
  timeout?: number;
}

export interface InteractResult {
  success: boolean;
  output?: string;
  stdout?: string;
  stderr?: string;
  result?: any;
  exitCode?: number;
  liveViewUrl?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  createdAt: string;
  expiresAt?: string;
  isActive: boolean;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  limits: {
    maxConcurrent: number;
    maxCrawlPages: number;
  };
  usage: {
    totalRequests: number;
    totalCredits: number;
  };
}

export interface TokenResult {
  token: string;
  expiresIn: string;
  type: string;
}

// =============== SDK Class ===============

export class WebCastle {
  private client: AxiosInstance;
  private apiKey: string;
  private token?: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: baseUrl || 'http://localhost:3052',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      timeout: 300000,
    });
  }

  /**
   * Generate a JWT token for WebSocket authentication
   */
  async generateToken(): Promise<TokenResult> {
    const response = await this.client.post('/v1/auth/token');
    this.token = response.data.data.token;
    return response.data.data;
  }

  /**
   * Scrape a single URL
   */
  async scrape(options: ScrapeOptions): Promise<ScrapeResult> {
    const response = await this.client.post('/v1/scrape', options);
    return response.data.data;
  }

  /**
   * Scrape multiple URLs in batch
   */
  async scrapeBatch(urls: string[], options?: {
    parallel?: number;
    stopOnFirstError?: boolean;
  }): Promise<ScrapeResult[]> {
    const response = await this.client.post('/v1/scrape/batch', {
      urls: urls.map(url => ({ url })),
      options,
    });
    return response.data.data;
  }

  /**
   * Start a crawl job
   */
  async crawl(options: CrawlOptions): Promise<CrawlJob> {
    const response = await this.client.post('/v1/crawl', options);
    return response.data;
  }

  /**
   * Get crawl job status
   */
  async getCrawlStatus(jobId: string): Promise<CrawlJob> {
    const response = await this.client.get(`/v1/crawl/${jobId}`);
    return response.data;
  }

  /**
   * Cancel a crawl job
   */
  async cancelCrawl(jobId: string): Promise<void> {
    await this.client.delete(`/v1/crawl/${jobId}`);
  }

  /**
   * Search the web
   */
  async search(options: SearchOptions): Promise<{
    web?: SearchResult[];
    images?: SearchResult[];
    news?: SearchResult[];
  }> {
    const response = await this.client.post('/v1/search', options);
    return response.data.data;
  }

  /**
   * Scrape and interact with a page
   */
  async scrapeAndInteract(
    url: string,
    options?: {
      mobile?: boolean;
      waitFor?: number;
    }
  ): Promise<{ scrapeResult: ScrapeResult; scrapeId: string }> {
    const response = await this.client.post('/v1/scrape/interact', {
      url,
      options,
    });
    return response.data;
  }

  /**
   * Interact with an existing scrape session
   */
  async interact(scrapeId: string, options: InteractOptions): Promise<InteractResult> {
    const response = await this.client.post(`/v1/scrape/${scrapeId}/interact`, options);
    return response.data;
  }

  /**
   * Stop an interaction session
   */
  async stopInteraction(scrapeId: string): Promise<void> {
    await this.client.delete(`/v1/scrape/${scrapeId}/interact`);
  }

  /**
   * Get current API key info and usage
   */
  async getApiKeyInfo(): Promise<ApiKey> {
    const response = await this.client.get('/v1/auth/me');
    return response.data.data;
  }

  /**
   * List all API keys (admin only)
   */
  async listApiKeys(): Promise<ApiKey[]> {
    const response = await this.client.get('/v1/auth/keys');
    return response.data.data;
  }

  /**
   * Create a new API key
   */
  async createApiKey(name: string, options?: {
    expiresAt?: number;
    rateLimit?: { requestsPerMinute: number; requestsPerDay: number };
  }): Promise<{ key: string } & ApiKey> {
    const response = await this.client.post('/v1/auth/keys', {
      name,
      ...options,
    });
    return response.data.data;
  }

  /**
   * Get service capabilities
   */
  async getCapabilities(): Promise<any> {
    const response = await this.client.get('/v1/capabilities');
    return response.data;
  }

  /**
   * Health check
   */
  async health(): Promise<any> {
    const response = await this.client.get('/health');
    return response.data;
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connectWebSocket(onMessage: (data: any) => void): WebSocket {
    const wsUrl = new URL(this.client.defaults.baseURL || 'http://localhost:3052', 'ws://');
    wsUrl.pathname = '/ws';
    wsUrl.searchParams.set('apiKey', this.apiKey);
    
    if (this.token) {
      wsUrl.searchParams.set('token', this.token);
    }

    const ws = new WebSocket(wsUrl.toString());

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage(data);
    };

    return ws;
  }

  /**
   * Subscribe to crawl job updates
   */
  async subscribeToCrawl(
    jobId: string,
    onUpdate: (job: Partial<CrawlJob>) => void
  ): Promise<() => void> {
    // First ensure we have a token
    if (!this.token) {
      await this.generateToken();
    }

    const ws = this.connectWebSocket((data) => {
      if (data.jobId === jobId) {
        onUpdate(data.data);
      }
    });

    // Send subscribe message
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        jobId,
      }));
    };

    // Return cleanup function
    return () => {
      ws.send(JSON.stringify({
        type: 'unsubscribe',
        jobId,
      }));
      ws.close();
    };
  }
}

// =============== Default Export ===============

export default WebCastle;
