// src/routes/selectors.ts
import { Request, Response } from 'express'
import { z, ZodError } from 'zod'
import { scraperEngine } from '../scrapers'
import { ScrapeResponse } from '../scrapers/types'
import { config } from '../config/env'

const selectorScrapeRequestSchema = z.object({
  url: z.string().url(),
  selectors: z.array(z.string()).min(1, {
    message: 'At least one selector is required',
  }),
  fidelity: z.enum(['FAST', 'DEEP']).optional().default('DEEP'),
  options: z.object({
    asJson: z.boolean().optional().default(true),
    screenshot: z.boolean().optional().default(false),
  }).optional(),
})

export const selectorScrapeHandler = async (req: Request, res: Response) => {
  const startTime = Date.now()
  const requestId = `selectors_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  try {
    // Validate request body
    const validated = selectorScrapeRequestSchema.parse(req.body)
    
    // Construct scrape intent for PRECISION_SELECTORS mode
    const intent = {
      url: validated.url,
      fidelity: validated.fidelity,
      mode: 'PRECISION_SELECTORS' as const,
      options: {
        selectors: validated.selectors,
        screenshot: validated.options?.screenshot,
      },
    }

    // Perform scrape
    const result = await scraperEngine.scrape(intent)
    const processingTimeMs = Date.now() - startTime

    // Format response based on asJson option
    let formattedResult = result
    if (validated.options?.asJson && result.structuredData) {
      // Return structured data directly
      formattedResult = {
        ...result,
        content: JSON.stringify(result.structuredData, null, 2),
      }
    }

    // Construct response
    const response: ScrapeResponse = {
      success: true,
      data: formattedResult,
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