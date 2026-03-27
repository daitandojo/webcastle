// src/routes/crawl.ts
// Crawl endpoint - recursively crawl websites

import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { scraperEngine } from '../scrapers';
import { CrawlJob, CrawlOptions, CrawlJobStatus } from '../scrapers/types';
import { config } from '../config/env';

const crawlRequestSchema = z.object({
  url: z.string().url(),
  limit: z.number().min(1).max(config.scraperMaxCrawlPages).optional().default(100),
  maxDiscoveryDepth: z.number().optional(),
  includePaths: z.array(z.string()).optional(),
  excludePaths: z.array(z.string()).optional(),
  regexOnFullURL: z.boolean().optional().default(false),
  crawlEntireDomain: z.boolean().optional().default(false),
  allowSubdomains: z.boolean().optional().default(false),
  allowExternalLinks: z.boolean().optional().default(false),
  sitemap: z.enum(['include', 'skip', 'only']).optional().default('include'),
  ignoreQueryParameters: z.boolean().optional().default(false),
  delay: z.number().optional(),
  maxConcurrency: z.number().optional(),
  scrapeOptions: z.object({
    formats: z.array(z.any()).optional(),
    onlyMainContent: z.boolean().optional(),
    timeout: z.number().optional(),
    waitFor: z.number().optional(),
    mobile: z.boolean().optional(),
  }).optional(),
  webhook: z.object({
    url: z.string().url(),
    metadata: z.record(z.string(), z.any()).optional(),
    events: z.array(z.enum(['started', 'page', 'completed', 'failed'])).optional(),
  }).optional(),
});

export const crawlHandler = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId = `crawl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const validated = crawlRequestSchema.parse(req.body);
    
    const crawlOptions: CrawlOptions = {
      url: validated.url,
      limit: validated.limit,
      maxDiscoveryDepth: validated.maxDiscoveryDepth,
      includePaths: validated.includePaths,
      excludePaths: validated.excludePaths,
      regexOnFullURL: validated.regexOnFullURL,
      crawlEntireDomain: validated.crawlEntireDomain,
      allowSubdomains: validated.allowSubdomains,
      allowExternalLinks: validated.allowExternalLinks,
      sitemap: validated.sitemap,
      ignoreQueryParameters: validated.ignoreQueryParameters,
      delay: validated.delay,
      maxConcurrency: validated.maxConcurrency,
      scrapeOptions: validated.scrapeOptions,
      webhook: validated.webhook,
    };

    const job = await scraperEngine.crawl(crawlOptions);
    const processingTimeMs = Date.now() - startTime;

    const response: any = {
      success: true,
      id: job.id,
      url: job.url,
      status: job.status,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        processingTimeMs,
        timestamp: new Date().toISOString(),
        requestId,
      },
    };

    // If synchronous mode (small limit), return results immediately
    if (validated.limit <= 10) {
      // Poll for completion briefly
      await new Promise(resolve => setTimeout(resolve, 2000));
      const finalJob = await scraperEngine.getCrawlStatus(job.id);
      if (finalJob?.data) {
        response.data = finalJob.data;
        response.total = finalJob.completed;
        response.completed = finalJob.completed;
      }
    }

    res.json(response);

  } catch (error: any) {
    const processingTimeMs = Date.now() - startTime;
    
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: error.issues,
        },
        metadata: {
          processingTimeMs,
          timestamp: new Date().toISOString(),
          requestId,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'An unexpected error occurred',
          details: config.isDevelopment ? error.stack : undefined,
        },
        metadata: {
          processingTimeMs,
          timestamp: new Date().toISOString(),
          requestId,
        },
      });
    }
  }
};

// Get crawl job status
export const crawlStatusHandler = async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const startTime = Date.now();
  const requestId = `crawl_status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const job = await scraperEngine.getCrawlStatus(jobId);

    if (!job) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Crawl job not found',
        },
        metadata: {
          processingTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          requestId,
        },
      });
      return;
    }

    const response: any = {
      success: true,
      id: job.id,
      url: job.url,
      status: job.status,
      total: job.total,
      completed: job.completed,
      creditsUsed: job.creditsUsed,
      expiresAt: job.expiresAt,
      metadata: {
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        requestId,
      },
    };

    // Include data for completed jobs (limited)
    if (job.status === CrawlJobStatus.COMPLETED && job.data) {
      response.data = job.data.slice(0, 100);
    }

    // Include error if failed
    if (job.status === CrawlJobStatus.FAILED) {
      response.error = job.error;
    }

    res.json(response);

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred',
      },
      metadata: {
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
  }
};

// Cancel crawl job
export const crawlCancelHandler = async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const startTime = Date.now();
  const requestId = `crawl_cancel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Import crawler to access cancel method
    const { crawler } = await import('../scrapers/crawler');
    const cancelled = await crawler.cancelCrawl(jobId);

    if (!cancelled) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Crawl job not found',
        },
        metadata: {
          processingTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          requestId,
        },
      });
      return;
    }

    res.json({
      success: true,
      message: 'Crawl job cancelled',
      metadata: {
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        requestId,
      },
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred',
      },
      metadata: {
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
  }
};
