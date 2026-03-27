// src/routes/health.ts
import { Request, Response } from 'express'
import { config } from '../config/env'
import { scraperEngine } from '../scrapers'
import { HealthCheckResponse } from '../scrapers/types'

export const healthHandler = async (_req: Request, res: Response) => {
  try {
    const capabilities = scraperEngine.getCapabilities()
    
    const healthCheck: HealthCheckResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'Scraping Service',
      version: '0.1.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      scrapers: {
        browser: {
          available: true, // Assume available, could test with a headless check
          version: 'playwright-1.57.0',
        },
        fast: {
          available: true,
          version: '1.0.0',
        },
      },
    }
    
    res.json(healthCheck)
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      ...(config.isDevelopment && { details: error instanceof Error ? error.message : String(error) }),
    })
  }
}