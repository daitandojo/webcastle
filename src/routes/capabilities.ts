// src/routes/capabilities.ts
import { Request, Response } from 'express'
import { scraperEngine, memoryCache } from '../scrapers'
import { config } from '../config/env'

export const capabilitiesHandler = (_req: Request, res: Response) => {
  const capabilities = scraperEngine.getCapabilities()
  const cacheStats = memoryCache.getStats()
  
  res.json({
    service: 'Scraping Service',
    version: '0.1.0',
    capabilities: capabilities.capabilities,
    supportedModes: capabilities.supportedModes,
    limits: capabilities.limits,
    configuration: {
      port: config.port,
      environment: config.nodeEnv,
      cacheEnabled: config.cacheEnabled,
      cacheTtlMs: config.cacheTtlMs,
      cacheMaxItems: config.cacheMaxItems,
      rateLimitWindowMs: config.rateLimitWindowMs,
      rateLimitMaxRequests: config.rateLimitMaxRequests,
      scraperConcurrent: config.scraperConcurrent,
      scraperTimeoutMs: config.scraperTimeoutMs,
    },
    cache: cacheStats,
    endpoints: [
      'GET /health - Health check',
      'GET /v1/capabilities - This endpoint',
      'POST /v1/scrape - Single URL scraping',
      'POST /v1/scrape/batch - Batch URL scraping (max 10)',
      'POST /v1/scrape/selectors - Precision selector extraction',
      'POST /v1/scrape/images - Image hunt extraction',
      'POST /v1/scrape/links - Hyperlink extraction',
      'POST /v1/scrape/screenshot - Page screenshot',
      'POST /v1/scrape/store - Scrape and store to Cogniti',
    ],
  })
}