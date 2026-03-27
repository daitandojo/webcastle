// src/routes/links.ts
import { Request, Response } from 'express'
import { z, ZodError } from 'zod'
import { scraperEngine } from '../scrapers'
import { ScrapeResponse } from '../scrapers/types'
import { config } from '../config/env'

const linksScrapeRequestSchema = z.object({
  url: z.string().url(),
  fidelity: z.enum(['FAST', 'DEEP']).optional().default('DEEP'),
  options: z.object({
    limit: z.number().min(1).max(1000).optional().default(200),
    includeInternal: z.boolean().optional().default(true),
    includeExternal: z.boolean().optional().default(true),
    filterByDomain: z.string().optional(),
  }).optional(),
})

export const linksScrapeHandler = async (req: Request, res: Response) => {
  const startTime = Date.now()
  const requestId = `links_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  try {
    // Validate request body
    const validated = linksScrapeRequestSchema.parse(req.body)
    
    // Construct scrape intent for HYPERLINKS mode
    const intent = {
      url: validated.url,
      fidelity: validated.fidelity,
      mode: 'HYPERLINKS' as const,
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