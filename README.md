# Scraping Service API

A standalone web scraping service for OpenClaw, based on the Scrapers foundry from the Cogniti monorepo. Provides comprehensive web data extraction capabilities with FAST (HTTP) and DEEP (browser automation) modes.

## Features

- **Dual Fidelity Modes**: FAST (HTTP + Readability) for static content, DEEP (Playwright) for JavaScript-rendered pages
- **Multiple Extraction Modes**: Clean text, full HTML, precision CSS selectors, image hunting, hyperlink extraction, metadata extraction
- **Browser Automation**: Stealth mode, cookie consent handling, screenshots
- **API Key Authentication**: Secure access control
- **Rate Limiting**: Per-IP rate limiting with configurable windows
- **Caching**: In-memory cache with TTL for frequent URLs
- **OpenClaw Integration**: Seamless skill integration with command patterns
- **Cogniti Integration**: Direct storage of scraped content to memory system

## Quick Start

### Prerequisites

- Node.js v20+
- Playwright browsers (automatically installed via script)

### Installation

```bash
cd /home/mark/Repos/projects/scraping
npm install
npx playwright install chromium  # or use: npm run install-browsers
```

### Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your settings:
   ```bash
   PORT=3002
   API_KEYS=your-api-key-here
   COGNITI_API_URL=http://localhost:3000
   ```

### Development

```bash
npm run dev  # Start development server with nodemon
```

### Production

```bash
npm run build
npm start
```

## API Endpoints

### Health & Metadata
- `GET /health` - Service health check
- `GET /v1/capabilities` - Supported scraping modes and limits

### Core Scraping
- `POST /v1/scrape` - Single URL scraping (6 modes: clean text, HTML, selectors, images, hyperlinks, metadata)
- `POST /v1/scrape/batch` - Batch URL scraping (max 10 URLs)
- `POST /v1/scrape/selectors` - Precision CSS selector extraction
- `POST /v1/scrape/images` - Image hunt and metadata extraction
- `POST /v1/scrape/links` - Hyperlink extraction with filtering
- `POST /v1/scrape/screenshot` - Page screenshot capture

### Integration
- `POST /v1/scrape/store` - Scrape and store directly to Cogniti

## OpenClaw Integration

Configure in `~/.openclaw/openclaw.yaml`:

```yaml
skills:
  scraping-service:
    enabled: true
    config:
      api_url: "http://localhost:3002"
      api_key: "your-api-key-here"
```

## Available Commands

```bash
# Basic scraping
openclaw skill scraping scrape https://example.com --mode clean-text
openclaw skill scraping scrape-batch urls.txt --parallel 3
openclaw skill scraping scrape-selectors https://news.com --selectors ".headline,.author"

# Integration
openclaw skill scraping scrape-store https://example.com --user-email your@email.com --tags research

# Utility
openclaw skill scraping health
openclaw skill scraping capabilities
```

## Architecture

The service is built on three core components:

1. **Scraping Engine**: Adapts the Scrapers foundry from Cogniti monorepo
2. **Express API**: RESTful endpoints following parser service patterns
3. **OpenClaw Integration**: Skill commands and configuration

## Development

### Project Structure
```
src/
├── index.ts              # Main Express server
├── config/env.ts         # Environment validation
├── scrapers/             # Core scraping engine (adapted from foundry)
├── lib/                  # Utilities (rate limiting, caching, etc.)
└── scripts/              # OpenClaw integration scripts
```

### Testing
```bash
# Coming soon
npm test
```

## License

MIT