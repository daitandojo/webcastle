# @webcastle/sdk

Official JavaScript/TypeScript SDK for [WebCastle](https://webcastle.ai) - The powerful AI-powered web scraping API.

## Features

- 🏰 **Smart Crawling** - Adaptive website crawling with intelligent stop conditions
- 🤖 **AI Extraction** - LLM-powered JSON schema extraction via OpenRouter
- 🎬 **YouTube Transcripts** - Extract video transcripts and metadata
- 🔍 **Web Search** - Search and scrape in one operation
- ⚡ **Real-time Streaming** - WebSocket support for live crawl progress
- 📱 **TypeScript** - Full type definitions included

## Installation

```bash
npm install @webcastle/sdk
```

## Quick Start

```typescript
import { WebCastle } from '@webcastle/sdk';

const client = new WebCastle('your-api-key');

// Scrape a single URL
const result = await client.scrape({
  url: 'https://example.com',
  formats: ['markdown', 'json'],
  extract: {
    schema: {
      title: 'string',
      price: 'number'
    }
  }
});

console.log(result.markdown);
console.log(result.json);
```

## YouTube Transcript

```typescript
// Extract YouTube video transcript
const transcript = await client.youtube.transcript({
  url: 'https://youtube.com/watch?v=dQw4w9WgXcQ'
});

console.log(transcript.title);
console.log(transcript.transcriptText);
```

## API Reference

### Scrape

```typescript
const result = await client.scrape({
  url: 'https://example.com',
  formats: ['markdown', 'html', 'screenshot'],
  mobile: false,
  timeout: 30000,
});
```

### Crawl

```typescript
// Start a crawl job
const job = await client.crawl({
  url: 'https://example.com',
  limit: 100,
  sitemap: 'include',
});

// Subscribe to real-time updates
const unsubscribe = await client.subscribeToCrawl(job.id, (update) => {
  console.log('Progress:', update.completed, '/', update.total);
});

// Get results when complete
const status = await client.getCrawlStatus(job.id);
```

### Search

```typescript
const results = await client.search({
  query: 'artificial intelligence news',
  limit: 10,
  sources: ['web', 'news'],
  scrapeOptions: {
    formats: ['markdown'],
  },
});

for (const result of results.web || []) {
  console.log(result.title, result.markdown);
}
```

## API Key Management

```typescript
// Get current API key info
const info = await client.getApiKeyInfo();
console.log(info.usage.totalRequests);

// Create a new API key
const newKey = await client.createApiKey('My New Key', {
  rateLimit: {
    requestsPerMinute: 60,
    requestsPerDay: 5000,
  },
});
console.log('New key:', newKey.key);
```

## Configuration

```typescript
const client = new WebCastle('your-api-key', 'https://api.webcastle.ai');
```

## TypeScript

This SDK is written in TypeScript and includes full type definitions. No extra packages needed.

## License

MIT
