// src/routes/search.ts
// Search endpoint - search the web and optionally scrape results

import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { scraperEngine } from '../scrapers';
import { SearchOptions, SearchResponse } from '../scrapers/types';
import { config } from '../config/env';

const searchRequestSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(100).optional().default(10),
  sources: z.array(z.enum(['web', 'news', 'images'])).optional().default(['web']),
  categories: z.array(z.enum(['github', 'research', 'pdf'])).optional(),
  tbs: z.string().optional(), // Time-based search (e.g., "qdr:w" for past week)
  location: z.string().optional(),
  scrapeOptions: z.object({
    formats: z.array(z.any()).optional(),
    onlyMainContent: z.boolean().optional(),
    timeout: z.number().optional(),
  }).optional(),
  timeout: z.number().optional(),
});

export const searchHandler = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const validated = searchRequestSchema.parse(req.body);
    
    const searchOptions: SearchOptions = {
      query: validated.query,
      limit: validated.limit,
      sources: validated.sources,
      categories: validated.categories,
      tbs: validated.tbs,
      location: validated.location,
      scrapeOptions: validated.scrapeOptions,
      timeout: validated.timeout,
    };

    const result = await scraperEngine.search(searchOptions);
    const processingTimeMs = Date.now() - startTime;

    const response = {
      success: true,
      data: result.data,
      metadata: {
        processingTimeMs,
        timestamp: new Date().toISOString(),
        requestId,
        query: validated.query,
      },
    };

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
