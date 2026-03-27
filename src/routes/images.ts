// src/routes/images.ts
import { Request, Response } from 'express'
import { z, ZodError } from 'zod'
import { scraperEngine } from '../scrapers'
import { ScrapeResponse } from '../scrapers/types'
import { config } from '../config/env'

const imageScrapeRequestSchema = z.object({
  url: z.string().url(),
  imageQuery: z.string().optional(),
  fidelity: z.enum(['FAST', 'DEEP']).optional().default('DEEP'),
  options: z.object({
    limit: z.number().min(1).max(100).optional().default(20),
    minWidth: z.number().optional(),
    minHeight: z.number().optional(),
    includeSrcset: z.boolean().optional().default(true),
  }).optional(),
})

export const imageScrapeHandler = async (req: Request, res: Response) => {
  const startTime = Date.now()
  const requestId = `images_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  try {
    // Validate request body
    const validated = imageScrapeRequestSchema.parse(req.body)
    
    // Construct scrape intent for IMAGE_HUNT mode
    const intent = {
      url: validated.url,
      fidelity: validated.fidelity,
      mode: 'IMAGE_HUNT' as const,
      options: {
        imageQuery: validated.imageQuery,
      },
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