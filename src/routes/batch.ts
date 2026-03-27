// src/routes/batch.ts
import { Request, Response } from 'express'
import { z, ZodError } from 'zod'
import { scraperEngine } from '../scrapers'
import { BatchScrapeResponse } from '../scrapers/types'
import { config } from '../config/env'

const batchScrapeRequestSchema = z.object({
  urls: z.array(z.object({
    url: z.string().url(),
    fidelity: z.enum(['FAST', 'DEEP']).optional().default(config.scraperDefaultFidelity),
    mode: z.enum(['CLEAN_TEXT', 'FULL_HTML', 'PRECISION_SELECTORS', 'IMAGE_HUNT', 'HYPERLINKS', 'METADATA']).optional().default(config.scraperDefaultMode),
    options: z.object({
      selectors: z.array(z.string()).optional(),
      imageQuery: z.string().optional(),
      screenshot: z.boolean().optional(),
      useStealth: z.boolean().optional(),
      headers: z.record(z.string(), z.string()).optional(),
      timeoutMs: z.number().optional(),
      waitForSelector: z.string().optional(),
      waitForTimeout: z.number().optional(),
      limit: z.number().min(1).max(1000).optional(),
      includeInternal: z.boolean().optional(),
      includeExternal: z.boolean().optional(),
      filterByDomain: z.string().optional(),
    }).optional(),
  })).max(config.scraperMaxUrlsPerBatch, {
    message: `Maximum ${config.scraperMaxUrlsPerBatch} URLs allowed per batch`,
  }),
  options: z.object({
    parallel: z.number().min(1).max(config.scraperConcurrent).optional().default(Math.min(3, config.scraperConcurrent)),
    stopOnFirstError: z.boolean().optional().default(false),
  }).optional(),
})

export const batchScrapeHandler = async (req: Request, res: Response) => {
  const startTime = Date.now()
  const requestId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  try {
    // Validate request body
    const validated = batchScrapeRequestSchema.parse(req.body)
    
    // Construct batch request
    const batchRequest = {
      urls: validated.urls.map(intent => ({
        url: intent.url,
        fidelity: intent.fidelity,
        mode: intent.mode,
        options: intent.options,
      })),
      options: validated.options,
    }

    // Perform batch scrape
    const results = await scraperEngine.scrapeBatch(batchRequest)
    const processingTimeMs = Date.now() - startTime

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    // Construct response
    const response: BatchScrapeResponse = {
      success: true,
      data: results,
      total: results.length,
      successful,
      failed,
      metadata: {
        processingTimeMs,
        timestamp: new Date().toISOString(),
        requestId,
      },
    }

    res.json(response)

  } catch (error: any) {
    const processingTimeMs = Date.now() - startTime
    
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
      })
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
      })
    }
  }
}