// src/scrapers/processor.ts
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import TurndownService = require('turndown')

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

export class HtmlProcessor {
  static extractBySelectors(html: string, selectors: string[]): Record<string, string> {
    const dom = new JSDOM(html)
    const results: Record<string, string> = {}
    selectors.forEach((s) => {
      const el = dom.window.document.querySelector(s)
      results[s] = el?.textContent?.trim() ?? ''
    })
    return results
  }

  static toMarkdown(html: string, url: string): { content: string; title: string } {
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    if (!article) return { content: '', title: '' }
    return { title: article.title, content: turndown.turndown(article.content) }
  }

  static extractImages(html: string, url: string, options?: { limit?: number, minWidth?: number, minHeight?: number }): Array<{ url: string, alt: string, srcset?: string }> {
    const dom = new JSDOM(html, { url })
    const images = Array.from(dom.window.document.querySelectorAll('img'))
    
    const results = images.map(img => ({
      url: img.src,
      alt: img.alt || '',
      srcset: img.srcset || undefined,
    }))

    // Apply filters if provided
    let filtered = results
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit)
    }
    // Note: minWidth/minHeight would require actual image dimensions, 
    // which would need fetching - skipping for now
    
    return filtered
  }

  static extractMetaTags(html: string): Record<string, string> {
    const dom = new JSDOM(html)
    const metaTags: Record<string, string> = {}
    
    const metas = dom.window.document.querySelectorAll('meta')
    metas.forEach(meta => {
      const name = meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('itemprop')
      const content = meta.getAttribute('content')
      if (name && content) {
        metaTags[name] = content
      }
    })
    
    return metaTags
  }

  static extractTitle(html: string): string {
    const dom = new JSDOM(html)
    return dom.window.document.title || ''
  }

  static extractHyperlinks(
    html: string, 
    baseUrl: string,
    options?: {
      limit?: number,
      includeInternal?: boolean,
      includeExternal?: boolean,
      filterByDomain?: string,
    }
  ): Array<{ href: string, text: string, title?: string, rel?: string }> {
    const dom = new JSDOM(html, { url: baseUrl })
    const links = Array.from(dom.window.document.querySelectorAll('a[href]'))
    
    const baseUrlObj = new URL(baseUrl)
    const baseDomain = baseUrlObj.hostname
    
    let results = links.map(link => {
      const anchor = link as HTMLAnchorElement
      const href = anchor.href
      const text = anchor.textContent?.trim() || ''
      const title = anchor.getAttribute('title') || undefined
      const rel = anchor.getAttribute('rel') || undefined
      
      return { href, text, title, rel }
    }).filter(link => link.href && (link.href.startsWith('http://') || link.href.startsWith('https://'))) // Filter out empty and non-http(s) hrefs

    // Apply filters
    if (options?.includeInternal === false || options?.includeExternal === false) {
      results = results.filter(link => {
        const linkUrl = new URL(link.href)
        const isInternal = linkUrl.hostname === baseDomain
        if (options.includeInternal === false && isInternal) return false
        if (options.includeExternal === false && !isInternal) return false
        return true
      })
    }

    // Filter by domain
    if (options?.filterByDomain) {
      results = results.filter(link => {
        const linkUrl = new URL(link.href)
        return linkUrl.hostname.includes(options.filterByDomain!)
      })
    }

    // Apply limit
    if (options?.limit) {
      results = results.slice(0, options.limit)
    }
    
    return results
  }

  static extractImageUrls(html: string, baseUrl: string, options?: { limit?: number }): Array<{ url: string, alt: string, srcset?: string }> {
    const dom = new JSDOM(html, { url: baseUrl })
    const images = Array.from(dom.window.document.querySelectorAll('img'))
    
    const results = images.map(img => ({
      url: img.src,
      alt: img.alt || '',
      srcset: img.srcset || undefined,
    }))

    // Apply limit if provided
    if (options?.limit) {
      return results.slice(0, options.limit)
    }
    
    return results
  }
}