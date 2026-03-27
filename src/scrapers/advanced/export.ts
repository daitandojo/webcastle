// src/scrapers/advanced/export.ts
// Export utilities - CSV, JSONL, S3, and other export formats

import { ScrapeResult } from '../types';
import Stream from 'stream';

export type ExportFormat = 'json' | 'jsonl' | 'csv' | 'markdown' | 'html';

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata?: boolean;
  includeErrors?: boolean;
  flatten?: boolean;
  delimiter?: string;
}

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  prefix?: string;
}

export class ExportFormatter {
  format(results: ScrapeResult[], options: ExportOptions): string {
    switch (options.format) {
      case 'json':
        return this.toJson(results, options);
      case 'jsonl':
        return this.toJsonl(results, options);
      case 'csv':
        return this.toCsv(results, options);
      case 'markdown':
        return this.toMarkdown(results);
      case 'html':
        return this.toHtml(results);
      default:
        throw new Error(`Unknown format: ${options.format}`);
    }
  }

  private toJson(results: ScrapeResult[], options: ExportOptions): string {
    const data = results.map(r => {
      if (options.flatten) {
        return this.flattenResult(r);
      }
      return r;
    });
    return JSON.stringify(data, null, 2);
  }

  private toJsonl(results: ScrapeResult[], options: ExportOptions): string {
    return results
      .map(r => {
        const data = options.flatten ? this.flattenResult(r) : r;
        return JSON.stringify(data);
      })
      .join('\n');
  }

  private toCsv(results: ScrapeResult[], options: ExportOptions): string {
    const delimiter = options.delimiter || ',';
    const flattened = results.map(r => this.flattenResult(r));
    
    // Get all unique keys
    const allKeys = new Set<string>();
    for (const item of flattened) {
      Object.keys(item).forEach(k => allKeys.add(k));
    }
    
    const headers = Array.from(allKeys);
    const rows = flattened.map(item => 
      headers.map(h => {
        const val = item[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Escape quotes and wrap in quotes if contains delimiter
        if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(delimiter)
    );
    
    return [headers.join(delimiter), ...rows].join('\n');
  }

  private toMarkdown(results: ScrapeResult[]): string {
    const lines: string[] = [];
    
    for (const result of results) {
      lines.push(`# ${result.title || result.url}`);
      lines.push('');
      lines.push(`**URL:** ${result.url}`);
      if (result.metadata?.statusCode) {
        lines.push(`**Status:** ${result.metadata.statusCode}`);
      }
      if (result.metadata?.wordCount) {
        lines.push(`**Word Count:** ${result.metadata.wordCount}`);
      }
      lines.push('');
      lines.push('## Content');
      lines.push('');
      lines.push(result.markdown || result.content || '');
      lines.push('');
      lines.push('---');
      lines.push('');
    }
    
    return lines.join('\n');
  }

  private toHtml(results: ScrapeResult[]): string {
    const items = results.map(r => `
      <article>
        <h2>${this.escapeHtml(r.title || r.url)}</h2>
        <p class="url">${this.escapeHtml(r.url)}</p>
        ${r.metadata?.statusCode ? `<p class="status">Status: ${r.metadata.statusCode}</p>` : ''}
        <div class="content">${this.escapeHtml(r.markdown || r.content || '')}</div>
      </article>
    `).join('\n');
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>WebCastle Export</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    article { margin-bottom: 40px; border-bottom: 1px solid #eee; padding-bottom: 20px; }
    h2 { margin-bottom: 5px; }
    .url { color: #666; font-size: 14px; }
    .status { color: #666; font-size: 14px; }
    .content { white-space: pre-wrap; }
  </style>
</head>
<body>
  ${items}
</body>
</html>`;
  }

  private flattenResult(result: ScrapeResult): Record<string, any> {
    const flat: Record<string, any> = {
      url: result.url,
      title: result.title,
      content: result.content,
      markdown: result.markdown,
      success: result.success,
      error: result.error,
    };
    
    if (result.metadata) {
      flat.status_code = result.metadata.statusCode;
      flat.latency_ms = result.metadata.latencyMs;
      flat.word_count = result.metadata.wordCount;
      flat.fidelity = result.metadata.fidelity;
      flat.cache_hit = result.metadata.cacheHit;
    }
    
    if (result.json) {
      Object.assign(flat, result.json);
    }
    
    return flat;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Create a stream for large exports
  createStream(results: ScrapeResult[], options: ExportOptions): NodeJS.ReadableStream {
    const self = this;
    let index = 0;
    
    const readable = new Stream.Readable({
      objectMode: true,
      read() {
        if (index < results.length) {
          const result = results[index++];
          const data = options.flatten ? self.flattenResult(result) : result;
          const line = options.format === 'jsonl' ? JSON.stringify(data) : JSON.stringify(data);
          this.push(line + '\n');
        } else {
          this.push(null);
        }
      },
    });
    
    return readable;
  }
}

export class S3Exporter {
  private config: S3Config | null = null;

  configure(config: S3Config): void {
    this.config = config;
  }

  async upload(data: string, key: string): Promise<string> {
    if (!this.config) {
      throw new Error('S3 not configured');
    }

    // Note: S3 upload requires @aws-sdk/client-s3 package
    // For now, return a placeholder URL
    console.warn('S3 export requires @aws-sdk/client-s3 package');
    const fullKey = this.config.prefix ? `${this.config.prefix}/${key}` : key;
    return `s3://${this.config.bucket}/${fullKey}`;
  }

  private getContentType(key: string): string {
    if (key.endsWith('.json')) return 'application/json';
    if (key.endsWith('.jsonl')) return 'application/jsonl';
    if (key.endsWith('.csv')) return 'text/csv';
    if (key.endsWith('.html')) return 'text/html';
    if (key.endsWith('.md')) return 'text/markdown';
    return 'application/octet-stream';
  }
}

export class ExportService {
  private formatter = new ExportFormatter();
  private s3Exporter = new S3Exporter();

  configureS3(config: S3Config): void {
    this.s3Exporter.configure(config);
  }

  async export(results: ScrapeResult[], options: ExportOptions & { toS3?: boolean; s3Key?: string }): Promise<{ data: string; mimeType: string; size: number }> {
    const data = this.formatter.format(results, options);
    const mimeType = this.getMimeType(options.format);
    
    let finalData = data;
    
    if (options.toS3 && options.s3Key) {
      const s3Url = await this.s3Exporter.upload(data, options.s3Key);
      finalData = s3Url;
    }
    
    return {
      data: finalData,
      mimeType,
      size: Buffer.byteLength(data, 'utf8'),
    };
  }

  async exportStream(
    results: ScrapeResult[], 
    options: ExportOptions & { toS3?: boolean; s3Key?: string }
  ): Promise<NodeJS.ReadableStream> {
    if (options.toS3 && options.s3Key) {
      // For S3, we need to collect all data first
      const data = this.formatter.format(results, options);
      await this.s3Exporter.upload(data, options.s3Key);
      
      const { PassThrough } = await import('stream');
      const stream = new PassThrough();
      stream.end(data);
      return stream;
    }
    
    return this.formatter.createStream(results, options);
  }

  private getMimeType(format: ExportFormat): string {
    const types: Record<ExportFormat, string> = {
      json: 'application/json',
      jsonl: 'application/jsonl',
      csv: 'text/csv',
      markdown: 'text/markdown',
      html: 'text/html',
    };
    return types[format];
  }
}

export const exportService = new ExportService();
