// src/scrapers/fastScraper.ts
import { HtmlProcessor } from './processor'
import { config } from '../config/env'
import { ScrapeIntent, ScrapeResult } from './types'
import fetch, { Headers } from 'node-fetch'
import https from 'https'
import http from 'http'

export class FastScraper {
  private readonly timeoutMs: number

  constructor(timeoutMs: number = config.scraperTimeoutMs) {
    this.timeoutMs = timeoutMs
  }

  async scrape(intent: ScrapeIntent): Promise<ScrapeResult> {
    const startTime = Date.now()
    
    try {
      // Create AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

      // Create HTTPS agent that ignores SSL errors for development
      const url = new URL(intent.url)
      const isHttps = url.protocol === 'https:'
      const agent = isHttps 
        ? new https.Agent({ rejectUnauthorized: false })
        : new http.Agent()
      
      const response = await fetch(intent.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': config.scraperUserAgent,
          ...(intent.options?.headers || {}),
        },
        agent,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const html = await response.text()
      const latencyMs = Date.now() - startTime
      
      let content = ''
      let title = ''
      let structuredData: Record<string, any> | undefined

      // Extract title from HTML
      title = HtmlProcessor.extractTitle(html) || intent.url

      switch (intent.mode) {
        case 'FULL_HTML':
          content = html
          break
        case 'CLEAN_TEXT': {
          const distilled = HtmlProcessor.toMarkdown(html, intent.url)
          content = distilled.content
          title = distilled.title || title
          break
        }
        case 'PRECISION_SELECTORS':
          if (intent.options?.selectors) {
            structuredData = HtmlProcessor.extractBySelectors(html, intent.options.selectors)
            content = JSON.stringify(structuredData)
          } else {
            content = html
          }
          break
        case 'IMAGE_HUNT': {
          const images = HtmlProcessor.extractImages(html, intent.url, { limit: intent.options?.limit ?? 20 })
          structuredData = { images }
          content = `Found ${images.length} images.`
          break
        }
        case 'HYPERLINKS': {
          const hyperlinks = HtmlProcessor.extractHyperlinks(html, intent.url, {
            limit: intent.options?.limit,
            includeInternal: intent.options?.includeInternal,
            includeExternal: intent.options?.includeExternal,
            filterByDomain: intent.options?.filterByDomain,
          })
          structuredData = { hyperlinks }
          content = `Found ${hyperlinks.length} hyperlinks.`
          break
        }
        case 'METADATA': {
          const metadata = HtmlProcessor.extractMetaTags(html)
          structuredData = { metadata }
          content = `Extracted ${Object.keys(metadata).length} meta tags.`
          break
        }
        default:
          // Default to CLEAN_TEXT
          const defaultDistilled = HtmlProcessor.toMarkdown(html, intent.url)
          content = defaultDistilled.content
          title = defaultDistilled.title || title
      }

      const result: ScrapeResult = {
        success: true,
        url: intent.url,
        title: title || intent.url,
        content,
        structuredData,
        metadata: {
          fidelity: 'FAST',
          latencyMs,
          wordCount: content.split(/\s+/).length,
          encoding: response.headers.get('content-type') || 'UTF-8',
          statusCode: response.status,
        },
      }

      return result

    } catch (error: any) {
      const latencyMs = Date.now() - startTime
      
      return {
        success: false,
        url: intent.url,
        title: '',
        content: '',
        error: error.message || 'Unknown error during FAST scraping',
        metadata: {
          fidelity: 'FAST',
          latencyMs,
          wordCount: 0,
          encoding: 'UTF-8',
        },
      }
    }
  }

  async scrapeBatch(urls: ScrapeIntent[]): Promise<ScrapeResult[]> {
    // Simple concurrent scraping with limit
    const concurrencyLimit = Math.min(config.scraperConcurrent, 5)
    const results: ScrapeResult[] = []
    
    // Process in chunks
    for (let i = 0; i < urls.length; i += concurrencyLimit) {
      const chunk = urls.slice(i, i + concurrencyLimit)
      const chunkPromises = chunk.map(intent => this.scrape(intent))
      const chunkResults = await Promise.all(chunkPromises)
      results.push(...chunkResults)
    }
    
    return results
  }
}

export const fastScraper = new FastScraper()