// src/scrapers/advanced/metrics.ts
// Prometheus Metrics - Observability for production

import express, { type Request, type Response } from 'express';

interface MetricValue {
  labels: Record<string, string>;
  value: number;
  timestamp: number;
}

interface HistogramBucket {
  le: number | string;
  count: number;
}

class PrometheusMetrics {
  private counters = new Map<string, MetricValue[]>();
  private gauges = new Map<string, MetricValue[]>();
  private histograms = new Map<string, { buckets: HistogramBucket[]; sum: number; count: number }>();
  
  private requestsTotal = 0;
  private requestsSuccess = 0;
  private requestsError = 0;
  private scrapeDurationSum = 0;
  private scrapeDurationCount = 0;
  private scrapeDurationBuckets: HistogramBucket[] = [
    { le: 0.1, count: 0 },
    { le: 0.5, count: 0 },
    { le: 1, count: 0 },
    { le: 2, count: 0 },
    { le: 5, count: 0 },
    { le: 10, count: 0 },
    { le: 30, count: 0 },
    { le: 60, count: 0 },
    { le: '+Inf', count: 0 },
  ];
  
  private cacheHits = 0;
  private cacheMisses = 0;
  private startTime = Date.now();

  // Counter - only increases
  counter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    const existing = this.counters.get(key);
    
    if (existing) {
      existing[0].value += value;
      existing[0].timestamp = Date.now();
    } else {
      this.counters.set(key, [{ labels: labels || {}, value, timestamp: Date.now() }]);
    }
  }

  // Gauge - can increase or decrease
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    this.gauges.set(key, [{ labels: labels || {}, value, timestamp: Date.now() }]);
  }

  // Histogram - tracks distributions
  histogram(name: string, value: number): void {
    let hist = this.histograms.get(name);
    
    if (!hist) {
      hist = {
        buckets: JSON.parse(JSON.stringify(this.scrapeDurationBuckets)),
        sum: 0,
        count: 0,
      };
      this.histograms.set(name, hist);
    }
    
    hist.sum += value;
    hist.count += 1;
    
    for (const bucket of hist.buckets) {
      if (typeof bucket.le === 'number' && value <= bucket.le) {
        bucket.count++;
      } else if (bucket.le === '+Inf') {
        bucket.count++;
      }
    }
  }

  // Convenience methods for common metrics
  incrementRequests(): void {
    this.requestsTotal++;
  }

  incrementSuccess(): void {
    this.requestsSuccess++;
  }

  incrementError(): void {
    this.requestsError++;
  }

  recordScrapeDuration(seconds: number): void {
    this.scrapeDurationSum += seconds;
    this.scrapeDurationCount++;
    this.histogram('scrape_duration_seconds', seconds);
  }

  recordCacheHit(): void {
    this.cacheHits++;
  }

  recordCacheMiss(): void {
    this.cacheMisses++;
  }

  // Generate Prometheus format output
  render(): string {
    const lines: string[] = [];
    
    lines.push('# HELP webcastle_requests_total Total HTTP requests');
    lines.push('# TYPE webcastle_requests_total counter');
    lines.push(`webcastle_requests_total ${this.requestsTotal}`);
    lines.push('');
    
    lines.push('# HELP webcastle_requests_success Successful requests');
    lines.push('# TYPE webcastle_requests_success counter');
    lines.push(`webcastle_requests_success ${this.requestsSuccess}`);
    lines.push('');
    
    lines.push('# HELP webcastle_requests_error Failed requests');
    lines.push('# TYPE webcastle_requests_error counter');
    lines.push(`webcastle_requests_error ${this.requestsError}`);
    lines.push('');
    
    lines.push('# HELP webcastle_scrape_duration_seconds Scrape request duration');
    lines.push('# TYPE webcastle_scrape_duration_seconds histogram');
    
    const hist = this.histograms.get('scrape_duration_seconds');
    if (hist) {
      lines.push(`webcastle_scrape_duration_seconds_sum ${hist.sum.toFixed(4)}`);
      lines.push(`webcastle_scrape_duration_seconds_count ${hist.count}`);
      for (const bucket of hist.buckets) {
        lines.push(`webcastle_scrape_duration_seconds_bucket{le="${bucket.le}"} ${bucket.count}`);
      }
    }
    lines.push('');
    
    lines.push('# HELP webcastle_cache_hit_total Cache hits');
    lines.push('# TYPE webcastle_cache_hit_total counter');
    lines.push(`webcastle_cache_hit_total ${this.cacheHits}`);
    lines.push('');
    
    lines.push('# HELP webcastle_cache_miss_total Cache misses');
    lines.push('# TYPE webcastle_cache_miss_total counter');
    lines.push(`webcastle_cache_miss_total ${this.cacheMisses}`);
    lines.push('');
    
    const uptimeSeconds = (Date.now() - this.startTime) / 1000;
    lines.push('# HELP webcastle_uptime_seconds Service uptime');
    lines.push('# TYPE webcastle_uptime_seconds gauge');
    lines.push(`webcastle_uptime_seconds ${uptimeSeconds.toFixed(0)}`);
    lines.push('');
    
    // Render custom counters
    for (const [key, values] of this.counters) {
      const name = key.replace(/[^a-zA-Z0-9_:]/g, '_');
      for (const v of values) {
        const labelStr = Object.entries(v.labels).map(([k, val]) => `${k}="${val}"`).join(',');
        const suffix = labelStr ? `{${labelStr}}` : '';
        lines.push(`# TYPE scrapnet_${name} counter`);
        lines.push(`scrapeNet_${name}${suffix} ${v.value}`);
      }
    }
    
    // Render custom gauges
    for (const [key, values] of this.gauges) {
      const name = key.replace(/[^a-zA-Z0-9_:]/g, '_');
      for (const v of values) {
        const labelStr = Object.entries(v.labels).map(([k, val]) => `${k}="${val}"`).join(',');
        const suffix = labelStr ? `{${labelStr}}` : '';
        lines.push(`# TYPE scrapnet_${name} gauge`);
        lines.push(`scrapeNet_${name}${suffix} ${v.value}`);
      }
    }
    
    return lines.join('\n');
  }

  // Get stats as JSON
  getStats() {
    const uptimeSeconds = (Date.now() - this.startTime) / 1000;
    const cacheTotal = this.cacheHits + this.cacheMisses;
    
    return {
      requests: {
        total: this.requestsTotal,
        success: this.requestsSuccess,
        error: this.requestsError,
        successRate: this.requestsTotal > 0 ? (this.requestsSuccess / this.requestsTotal * 100).toFixed(2) + '%' : '0%',
      },
      scrapeDuration: {
        avg: this.scrapeDurationCount > 0 ? (this.scrapeDurationSum / this.scrapeDurationCount).toFixed(2) + 's' : '0s',
        count: this.scrapeDurationCount,
      },
      cache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate: cacheTotal > 0 ? (this.cacheHits / cacheTotal * 100).toFixed(2) + '%' : '0%',
      },
      uptime: {
        seconds: uptimeSeconds.toFixed(0),
        human: this.formatUptime(uptimeSeconds),
      },
    };
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  }

  private getKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels).sort().map(([k, v]) => `${k}:${v}`).join(',');
    return `${name}{${labelStr}}`;
  }
}

export const metrics = new PrometheusMetrics();

// Express middleware for automatic metrics
export function metricsMiddleware(req: Request, res: Response, next: () => void) {
  const start = Date.now();
  
  res.on('finish', () => {
    metrics.incrementRequests();
    
    if (res.statusCode >= 200 && res.statusCode < 400) {
      metrics.incrementSuccess();
    } else {
      metrics.incrementError();
    }
    
    const duration = (Date.now() - start) / 1000;
    metrics.recordScrapeDuration(duration);
  });
  
  next();
}

// Router for metrics endpoint
export function createMetricsRouter() {
  const router = express.Router();
  
  router.get('/metrics', (req: Request, res: Response) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(metrics.render());
  });
  
  router.get('/metrics/json', (req: Request, res: Response) => {
    res.json(metrics.getStats());
  });
  
  return router;
}
