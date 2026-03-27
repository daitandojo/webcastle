// src/routes/screenshot.ts
import { Request, Response } from 'express'
import { z, ZodError } from 'zod'
import { scraperEngine } from '../scrapers'
import { ScrapeResponse } from '../scrapers/types'
import { config } from '../config/env'

const screenshotRequestSchema = z.object({
  url: z.string().url(),
  fidelity: z.enum(['FAST', 'DEEP']).optional().default('DEEP'),
  options: z.object({
    fullPage: z.boolean().optional().default(true),
    width: z.number().optional(),
    height: z.number().optional(),
    quality: z.number().min(0).max(100).optional().default(80),
    delayMs: z.number().min(0).max(10000).optional().default(1000),
  }).optional(),
})

export const screenshotHandler = async (req: Request, res: Response) => {
  const startTime = Date.now()
  const requestId = `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  try {
    // Validate request body
    const validated = screenshotRequestSchema.parse(req.body)
    
    // Construct scrape intent with screenshot option
    const intent = {
      url: validated.url,
      fidelity: validated.fidelity,
      mode: 'FULL_HTML' as const, // Use FULL_HTML mode for screenshots
      options: {
        screenshot: true,
        waitForTimeout: validated.options?.delayMs,
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