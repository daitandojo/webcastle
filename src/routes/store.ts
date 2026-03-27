// src/routes/store.ts
import { Request, Response } from 'express'
import { z, ZodError } from 'zod'
import { scraperEngine } from '../scrapers'
import { ScrapeResponse, StoreRequest } from '../scrapers/types'
import { config } from '../config/env'

const storeRequestSchema = z.object({
  url: z.string().url(),
  userEmail: z.string().email({
    message: 'Valid user email is required',
  }),
  agentId: z.string().optional().default('scraping-service'),
  tags: z.array(z.string()).optional().default(['scraped']),
  metadata: z.record(z.string(), z.any()).optional(),
  scrapeOptions: z.object({
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
  }).optional(),
})

export const storeHandler = async (req: Request, res: Response) => {
  const startTime = Date.now()
  const requestId = `store_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  try {
    // Validate request body
    const validated = storeRequestSchema.parse(req.body)
    
    // Construct scrape intent
    const scrapeIntent = {
      url: validated.url,
      fidelity: validated.scrapeOptions?.fidelity || config.scraperDefaultFidelity,
      mode: validated.scrapeOptions?.mode || config.scraperDefaultMode,
      options: validated.scrapeOptions?.options,
    }

    // Perform scrape
    const scrapeResult = await scraperEngine.scrape(scrapeIntent)
    const scrapeTimeMs = Date.now() - startTime

    if (!scrapeResult.success) {
      throw new Error(`Scraping failed: ${scrapeResult.error}`)
    }

    // Store to Cogniti
    const cognitiApiUrl = config.cognitiApiUrl
    if (!cognitiApiUrl) {
      throw new Error('Cogniti API URL not configured')
    }

    const memoryPayload = {
      userEmail: validated.userEmail,
      agentId: validated.agentId,
      content: scrapeResult.content,
      tags: validated.tags,
      metadata: {
        source: 'scraping-service',
        url: validated.url,
        scrapeMetadata: scrapeResult.metadata,
        ...validated.metadata,
      },
    }

    // Make request to Cogniti
    const cognitiResponse = await fetch(`${cognitiApiUrl}/v1/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(memoryPayload),
    })

    const cognitiResult = await cognitiResponse.json()
    const totalTimeMs = Date.now() - startTime

    // Construct response
    const response = {
      success: true,
      data: {
        scrape: scrapeResult,
        storage: {
          success: cognitiResponse.ok,
          response: cognitiResult,
        },
      },
      url: validated.url,
      metadata: {
        processingTimeMs: totalTimeMs,
        scrapeTimeMs,
        storageTimeMs: totalTimeMs - scrapeTimeMs,
        timestamp: new Date().toISOString(),
        requestId,
        cacheHit: scrapeResult.metadata.cacheHit || false,
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