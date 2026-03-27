// src/scrapers/search.ts
// Web search with content extraction (Firecrawl-inspired)

import { config } from '../config/env';
import { SearchOptions, SearchResponse, SearchResult, ScrapeOptions } from './types';
import { crawler } from './crawler';

export class SearchEngine {
  async search(options: SearchOptions): Promise<SearchResponse> {
    const results: SearchResponse = {
      success: true,
      data: {
        web: [],
        images: [],
        news: [],
      },
      metadata: {
        query: options.query,
        sources: options.sources,
      },
    };

    // Process each source type
    for (const source of options.sources || ['web']) {
      switch (source) {
        case 'web':
          results.data.web = await this.searchWeb(options);
          break;
        case 'images':
          results.data.images = await this.searchImages(options);
          break;
        case 'news':
          results.data.news = await this.searchNews(options);
          break;
      }
    }

    // If scrapeOptions provided, also scrape content from results
    if (options.scrapeOptions && results.data.web && results.data.web.length > 0) {
      for (const result of results.data.web) {
        try {
          const scrapeResult = await this.scrapeWithOptions(result.url, options.scrapeOptions);
          if (scrapeResult) {
            result.markdown = scrapeResult.markdown;
            result.links = scrapeResult.links;
            result.metadata = {
              ...result.metadata,
              ...scrapeResult.metadata,
            };
          }
        } catch (error) {
          console.log(`Failed to scrape ${result.url}: ${error}`);
        }
      }
    }

    return results;
  }

  private async searchWeb(options: SearchOptions): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    // Build search query
    let query = options.query;
    
    // Add category filters
    if (options.categories?.includes('github')) {
      query += ' site:github.com';
    } else if (options.categories?.includes('research')) {
      query += ' site:arxiv.org OR site:pubmed.ncbi.nlm.nih.gov OR site:nature.com';
    } else if (options.categories?.includes('pdf')) {
      query += ' filetype:pdf';
    }

    try {
      // Use DuckDuckGo as the default search provider
      const searchUrl = this.buildDuckDuckGoUrl(query, options);
      const searchResults = await this.fetchSearchResults(searchUrl);
      
      for (let i = 0; i < Math.min(searchResults.length, options.limit || 10); i++) {
        const r = searchResults[i];
        results.push({
          url: r.url,
          title: r.title,
          description: r.snippet,
          position: i + 1,
          category: options.categories?.[0],
        });
      }
    } catch (error) {
      console.error('Web search failed:', error);
    }

    return results;
  }

  private async searchImages(options: SearchOptions): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      const query = options.query + ' imagesize:1920x1080'; // Default to HD
      const searchUrl = this.buildDuckDuckGoImageUrl(query, options);
      const imageResults = await this.fetchImageResults(searchUrl);
      
      for (let i = 0; i < Math.min(imageResults.length, options.limit || 10); i++) {
        const r = imageResults[i];
        results.push({
          url: r.url,
          title: r.title,
          imageUrl: r.imageUrl,
          imageWidth: r.width,
          imageHeight: r.height,
          position: i + 1,
        });
      }
    } catch (error) {
      console.error('Image search failed:', error);
    }

    return results;
  }

  private async searchNews(options: SearchOptions): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    try {
      let query = options.query;
      if (options.tbs) {
        query += ` ${options.tbs}`;
      }
      
      const searchUrl = this.buildDuckDuckGoNewsUrl(query, options);
      const newsResults = await this.fetchNewsResults(searchUrl);
      
      for (let i = 0; i < Math.min(newsResults.length, options.limit || 10); i++) {
        const r = newsResults[i];
        results.push({
          url: r.url,
          title: r.title,
          description: r.snippet,
          date: r.date,
          snippet: r.snippet,
          position: i + 1,
        });
      }
    } catch (error) {
      console.error('News search failed:', error);
    }

    return results;
  }

  private buildDuckDuckGoUrl(query: string, options: SearchOptions): string {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
    });
    
    if (options.location) {
      params.set('kl', options.location);
    }
    
    return `https://duckduckgo.com/?${params.toString()}`;
  }

  private buildDuckDuckGoImageUrl(query: string, options: SearchOptions): string {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
    });
    
    return `https://duckduckgo.com/?${params.toString()}&ia=images`;
  }

  private buildDuckDuckGoNewsUrl(query: string, options: SearchOptions): string {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
    });
    
    return `https://duckduckgo.com/?${params.toString()}&ia=news`;
  }

  private async fetchSearchResults(url: string): Promise<Array<{ url: string; title: string; snippet: string }>> {
    // Use a simple HTML scrape approach for DuckDuckGo
    // In production, you might want to use a proper API
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': config.scraperUserAgent,
          'Accept': 'text/html',
        },
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        return [];
      }
      
      const html = await response.text();
      
      // Parse results from HTML (simplified - in production use proper parsing)
      const results: Array<{ url: string; title: string; snippet: string }> = [];
      
      // This is a simplified parser - DuckDuckGo HTML structure changes often
      // For production, consider using their API or a different provider
      const linkRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
      const snippetRegex = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/g;
      
      let match;
      while ((match = linkRegex.exec(html)) !== null && results.length < 10) {
        const url = match[1];
        // Decode DuckDuckGo redirect
        const decodedUrl = url.startsWith('//duckduckgo.com/l/?uddg=') 
          ? decodeURIComponent(url.split('uddg=')[1]?.split('&')[0] || '')
          : url;
        
        if (decodedUrl.startsWith('http')) {
          results.push({
            url: decodedUrl,
            title: match[2].replace(/<[^>]+>/g, ''),
            snippet: '',
          });
        }
      }
      
      // Try to get snippets
      let snippetMatch;
      let idx = 0;
      while ((snippetMatch = snippetRegex.exec(html)) !== null && idx < results.length) {
        results[idx].snippet = snippetMatch[1].replace(/<[^>]+>/g, '');
        idx++;
      }
      
      return results;
      
    } catch (error) {
      console.error('Failed to fetch search results:', error);
      return [];
    }
  }

  private async fetchImageResults(url: string): Promise<Array<{ url: string; title: string; imageUrl: string; width?: number; height?: number }>> {
    // Simplified - would need proper implementation
    return [];
  }

  private async fetchNewsResults(url: string): Promise<Array<{ url: string; title: string; snippet: string; date?: string }>> {
    // Simplified - would need proper implementation
    return [];
  }

  private async scrapeWithOptions(url: string, scrapeOptions: ScrapeOptions): Promise<any> {
    // Use crawler to scrape the URL with options
    const job = await crawler.startCrawl({
      url,
      limit: 1,
      scrapeOptions,
    });

    // Wait for completion (in production, use async polling)
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const result = await crawler.getCrawlStatus(job.id);
    if (result?.data?.[0]) {
      return result.data[0];
    }
    
    return null;
  }
}

export const searchEngine = new SearchEngine();
