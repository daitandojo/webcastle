// src/routes/scrape.ts
import { Request, Response } from 'express'
import { z, ZodError } from 'zod'
import { scraperEngine } from '../scrapers'
import { scrapeIntentSchema, ScrapeResponse } from '../scrapers/types'
import { config } from '../config/env'

const scrapeRequestSchema = z.object({
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
})

export const scrapeHandler = async (req: Request, res: Response) => {
  const startTime = Date.now()
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  try {
    // Validate request body
    const validated = scrapeRequestSchema.parse(req.body)
    
    // Construct scrape intent
    const intent = {
      url: validated.url,
      fidelity: validated.fidelity,
      mode: validated.mode,
      options: validated.options,
    }

    // Perform scrape
    const result = await scraperEngine.scrape(intent)
    const processingTimeMs = Date.now() - startTime

    // Construct response
    const response: ScrapeResponse = {
      success: true,
      data: result,
      url: validated.url,
      metadata: {
        processingTimeMs,
        timestamp: new Date().toISOString(),
        requestId,
        cacheHit: result.metadata.cacheHit || false,
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