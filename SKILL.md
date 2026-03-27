---
name: scraping-service
description: Web scraping service for OpenClaw. Extract clean text, HTML, images, or precise data from websites using FAST (HTTP) or DEEP (browser) modes. Use when you need to gather information from websites for research, data collection, or memory storage. Integrates with Cogniti memory system for automatic ingestion.
---

# Scraping Service Skill

A standalone web scraping service that extracts content from websites for OpenClaw and Cogniti integration.

## Quick Start

### Installation

1. **Start the scraping service** (port 3002):
   ```bash
   cd /home/mark/Repos/projects/scraping
   npm install
   npm run install-browsers  # Install Playwright browsers
   npm start
   ```

2. **Configure OpenClaw**:
   ```yaml
   # ~/.openclaw/openclaw.yaml
   skills:
     scraping-service:
       enabled: true
       config:
         api_url: "http://localhost:3002"
         api_key: "scraping-key-1"
         cogniti_url: "http://localhost:3000"
         default_user_email: "your@email.com"
   ```

3. **Test scraping**:
   ```bash
   # Scrape a website
   openclaw skill scraping-service scrape https://example.com --mode clean-text
   
   # Scrape and store in Cogniti
   openclaw skill scraping-service scrape-store https://example.com --user-email your@email.com
   ```

## Usage Patterns

### Basic Scraping

```bash
# Scrape clean text (default mode)
openclaw skill scraping-service scrape https://example.com

# Scrape with FAST mode (HTTP only)
openclaw skill scraping-service scrape https://example.com --fidelity FAST

# Scrape with DEEP mode (browser automation)
openclaw skill scraping-service scrape https://example.com --fidelity DEEP --mode full-html

# Scrape specific selectors
openclaw skill scraping-service scrape-selectors \
  https://news.com \
  --selectors ".headline,.author,.date" \
  --as-json

# Extract images
openclaw skill scraping-service scrape-images \
  https://product-site.com \
  --image-query "product" \
  --limit 10

# Take screenshot
openclaw skill scraping-service screenshot \
  https://dashboard.example.com \
  --full-page \
  --width 1920 \
  --height 1080
```

### Batch Processing

```bash
# Scrape multiple URLs from file
openclaw skill scraping-service scrape-batch urls.txt --parallel 3

# Scrape URLs with different modes
openclaw skill scraping-service scrape-batch config.json

# Example config.json:
cat > config.json << 'EOF'
{
  "urls": [
    {
      "url": "https://news.com/article1",
      "mode": "clean-text"
    },
    {
      "url": "https://dashboard.com",
      "mode": "full-html",
      "fidelity": "DEEP",
      "options": {
        "screenshot": true
      }
    }
  ],
  "options": {
    "parallel": 2
  }
}
EOF
```

### Integration with Cogniti

```bash
# Scrape and store directly to Cogniti
openclaw skill scraping-service scrape-store \
  https://research-paper.com \
  --user-email researcher@email.com \
  --tags "research,ai,paper" \
  --metadata '{"author": "John Doe", "year": 2023}'

# Batch scrape and store
openclaw skill scraping-service scrape-batch-store \
  urls.txt \
  --user-email your@email.com \
  --default-tags "scraped,batch"
```

## Configuration

### Required Configuration

```yaml
skills:
  scraping-service:
    enabled: true
    config:
      api_url: "http://localhost:3002"
      api_key: "scraping-key-1"  # From .env API_KEYS
```

### Optional Configuration

```yaml
config:
  # Scraping defaults
  default_fidelity: "DEEP"         # FAST or DEEP
  default_mode: "CLEAN_TEXT"       # CLEAN_TEXT, FULL_HTML, PRECISION_SELECTORS, IMAGE_HUNT, HYPERLINKS, METADATA
  timeout: 30                      # Seconds
  max_batch_size: 10               # Max URLs per batch
  
  # Browser settings
  headless: true                   # Run browser in headless mode
  stealth_mode: true               # Enable anti-detection measures
  viewport_width: 1440             # Browser viewport width
  viewport_height: 900             # Browser viewport height
  
  # Caching
  cache_enabled: true              # Enable in-memory caching
  cache_ttl: 3600                  # Cache TTL in seconds
  cache_max_items: 1000            # Max cached items
  
  # Rate limiting
  rate_limit_enabled: true         # Enable per-IP rate limiting
  rate_limit_window: 900           # 15 minutes in seconds
  rate_limit_max: 100              # Max requests per window
  
  # Integration
  cogniti_url: "http://localhost:3000"
  default_user_email: "your@email.com"
  auto_store: false                # Auto-store all scrapes to Cogniti
```

## API Reference

### Scrape URL

**Endpoint**: `POST /v1/scrape`

```bash
# Using the skill
openclaw skill scraping-service scrape https://example.com

# With options
openclaw skill scraping-service scrape \
  https://example.com \
  --fidelity DEEP \
  --mode clean-text \
  --screenshot \
  --timeout 45
```

### Batch Scrape

**Endpoint**: `POST /v1/scrape/batch`

```bash
# Scrape multiple URLs
openclaw skill scraping-service scrape-batch urls.txt

# With configuration
openclaw skill scraping-service scrape-batch \
  config.json \
  --parallel 4 \
  --stop-on-error
```

### Scrape with Selectors

**Endpoint**: `POST /v1/scrape/selectors`

```bash
# Extract specific elements
openclaw skill scraping-service scrape-selectors \
  https://news.com \
  --selectors "h1.title,.article-content,time.published" \
  --fidelity DEEP \
  --as-json
```

### Extract Images

**Endpoint**: `POST /v1/scrape/images`

```bash
# Find product images
openclaw skill scraping-service scrape-images \
  https://store.com \
  --image-query "product" \
  --limit 20 \
  --min-width 300 \
  --min-height 300
```

### Take Screenshot

**Endpoint**: `POST /v1/scrape/screenshot`

```bash
# Capture full page
openclaw skill scraping-service screenshot \
  https://dashboard.com \
  --full-page \
  --width 1920 \
  --quality 90
  
# Capture specific area
openclaw skill scraping-service screenshot \
  https://chart.com \
  --width 800 \
  --height 600 \
  --delay 2000  # Wait 2 seconds before capture
```

### Scrape and Store

**Endpoint**: `POST /v1/scrape/store`

```bash
# Scrape and store to Cogniti
openclaw skill scraping-service scrape-store \
  https://documentation.com \
  --user-email your@email.com \
  --agent-id openclaw \
  --tags "docs,reference,important" \
  --metadata '{"category": "documentation", "priority": "high"}'
```

## Supported Modes

### FAST Mode (HTTP + Readability)
- **Best for**: Static content, news articles, documentation
- **Speed**: Very fast (HTTP fetch only)
- **Limitations**: No JavaScript execution, limited interaction
- **Use when**: You need text content from simple websites

### DEEP Mode (Playwright Browser)
- **Best for**: JavaScript-rendered pages, SPAs, dashboards
- **Speed**: Slower (full browser launch)
- **Capabilities**: Full JavaScript execution, screenshots, interaction
- **Use when**: You need content from modern web apps or visual capture

### Extraction Modes

1. **CLEAN_TEXT**
   - Uses Mozilla Readability to extract main content
   - Removes ads, navigation, and boilerplate
   - Returns clean Markdown text
   - Best for articles, blog posts, documentation

2. **FULL_HTML**
   - Returns raw HTML of the page
   - Preserves all structure and formatting
   - Useful for custom processing or archiving

3. **PRECISION_SELECTORS**
   - Extracts specific elements using CSS selectors
   - Returns structured JSON data
   - Perfect for data extraction from known page structures

4. **IMAGE_HUNT**
   - Finds and extracts image URLs and metadata
   - Can filter by size, alt text, or query
   - Useful for media collection or analysis

5. **HYPERLINKS**
   - Extracts all hyperlinks from the page
   - Returns structured data with href, text, title, and rel attributes
   - Can filter by internal/external links, domain, or limit
   - Useful for site mapping, SEO analysis, and link discovery

6. **METADATA**
   - Extracts all meta tags from the page
   - Returns structured data including OpenGraph, Twitter cards, SEO meta
   - Useful for social media analysis, SEO auditing, and content indexing

## Scripts

### `scripts/test_scraping.py`
Basic Python script to test the scraping API.

**Usage**:
```python
from scripts.test_scraping import test_scrape

result = test_scrape(
    url="https://example.com",
    mode="clean_text",
    fidelity="FAST",
    api_key="your-api-key"
)
```

### `scripts/batch_processor.py`
Process multiple URLs and save results to files.

**Usage**:
```python
from scripts.batch_processor import BatchProcessor

processor = BatchProcessor(
    api_url="http://localhost:3002",
    api_key="your-api-key"
)

processor.process_file(
    input_file="urls.txt",
    output_dir="./scraped/",
    mode="clean_text"
)
```

### `scripts/cogniti_integration.py`
Scrape and store to Cogniti in one operation.

**Usage**:
```python
from scripts.cogniti_integration import scrape_and_store

result = scrape_and_store(
    url="https://research.com/paper",
    user_email="researcher@email.com",
    tags=["research", "ai"],
    cogniti_url="http://localhost:3000"
)
```

## Integration Examples

### Example 1: Research Paper Collection

```bash
# Scrape research paper
openclaw skill scraping-service scrape \
  https://arxiv.org/abs/1234.56789 \
  --mode clean-text \
  --fidelity FAST

# Store with metadata
openclaw skill scraping-service scrape-store \
  https://arxiv.org/abs/1234.56789 \
  --user-email researcher@email.com \
  --tags "ai,machine-learning,research" \
  --metadata '{"venue": "arXiv", "year": 2023, "authors": ["Author1", "Author2"]}'
```

### Example 2: Competitor Monitoring

```bash
# Create monitoring configuration
cat > competitors.json << 'EOF'
{
  "urls": [
    {
      "url": "https://competitor1.com/pricing",
      "mode": "clean-text",
      "tags": ["competitor", "pricing"]
    },
    {
      "url": "https://competitor2.com/features",
      "mode": "precision-selectors",
      "selectors": [".feature-list", ".pricing-table"],
      "tags": ["competitor", "features"]
    }
  ],
  "schedule": "daily"
}
EOF

# Run monitoring
openclaw skill scraping-service scrape-batch competitors.json
```

### Example 3: Documentation Archiving

```bash
# Archive documentation with screenshots
openclaw skill scraping-service scrape \
  https://docs.example.com \
  --mode full-html \
  --fidelity DEEP \
  --screenshot \
  --output-format html

# Batch archive multiple pages
openclaw skill scraping-service scrape-batch \
  docs_urls.txt \
  --mode full-html \
  --output-dir ./archive/ \
  --include-screenshots
```

## Error Handling

### Common Errors

1. **Invalid URL**: URL format is incorrect or unreachable
   ```bash
   # Check URL format
   openclaw skill scraping-service validate-url https://example.com
   ```

2. **Rate limited**: Too many requests from your IP
   ```bash
   # Check rate limit status
   openclaw skill scraping-service rate-limit-status
   
   # Wait and retry
   openclaw skill scraping-service scrape https://example.com --retry-after 60
   ```

3. **Browser error**: Playwright browser failed to launch
   ```bash
   # Reinstall browsers
   npm run install-browsers
   
   # Run with headless disabled for debugging
   openclaw config set skills.scraping-service.config.headless false
   ```

4. **Authentication error**: Invalid or missing API key
   ```bash
   # Check configuration
   openclaw config get skills.scraping-service.config.api_key
   
   # Update API key
   openclaw config set skills.scraping-service.config.api_key "new-key-here"
   ```

### Fallback Strategies

- **FAST → DEEP**: If FAST mode fails, automatically retry with DEEP mode
- **Selector fallback**: If selectors not found, fall back to clean text extraction
- **Cache fallback**: Return cached results if fresh scrape fails
- **Partial results**: Return partial data with error details

## Performance Tips

### Caching

```yaml
config:
  cache_enabled: true
  cache_ttl: 86400  # 24 hours for static content
  cache_max_items: 5000
```

### Parallel Processing

```bash
# Increase concurrency for batch operations
openclaw config set skills.scraping-service.config.max_concurrent 5

# Use batch operations for multiple URLs
openclaw skill scraping-service scrape-batch urls.json --parallel 4
```

### Browser Optimization

```yaml
config:
  headless: true           # Always use headless for production
  stealth_mode: true       # Reduce detection risk
  viewport_width: 1440     # Common desktop resolution
  reuse_browser: false     # Start fresh browser per request (more stable)
```

## Security Considerations

### Input Validation

- Validate all URLs before scraping
- Limit URL depth and recursion
- Sanitize HTML content before storage
- Validate API keys on every request

### Rate Limiting

- Per-IP rate limiting by default
- Configurable request windows
- Graceful degradation under load
- Clear rate limit headers in responses

### Browser Security

- Run browsers in isolated sandbox
- Limit browser resource usage
- Automatic cleanup of browser instances
- No persistent cookies or storage

### Output Sanitization

- Strip malicious scripts from HTML
- Validate image URLs before processing
- Limit response sizes
- Sanitize metadata before storage

## Monitoring

### Health Checks

```bash
# Check service health
openclaw skill scraping-service health

# Check browser availability
openclaw skill scraping-service browser-health

# Get statistics
openclaw skill scraping-service stats
```

### Logging

Scraping operations are logged to:
- Console (development)
- File logs in production
- Structured JSON format for analysis
- Error logs with stack traces

### Metrics

- Requests per minute
- Cache hit rate
- Average response time
- Error rate by type
- Browser launch success rate

## Troubleshooting

### Installation Issues

1. **Playwright browsers not installing**:
   ```bash
   # Install manually
   npx playwright install chromium
   
   # Check system dependencies
   sudo apt-get update
   sudo apt-get install libgbm-dev libnss3 libatk-bridge2.0-0
   ```

2. **Port already in use**:
   ```bash
   # Change port
   openclaw config set skills.scraping-service.config.api_url "http://localhost:3003"
   
   # Find and kill process
   lsof -ti:3002 | xargs kill -9
   ```

3. **Missing dependencies**:
   ```bash
   # Reinstall
   rm -rf node_modules package-lock.json
   npm install
   ```

### Performance Issues

1. **Slow scraping**:
   ```bash
   # Increase timeout
   openclaw config set skills.scraping-service.config.timeout 60
   
   # Use FAST mode for static content
   openclaw skill scraping-service scrape https://example.com --fidelity FAST
   
   # Enable caching
   openclaw config set skills.scraping-service.config.cache_enabled true
   ```

2. **High memory usage**:
   ```bash
   # Reduce concurrency
   openclaw config set skills.scraping-service.config.max_concurrent 2
   
   # Limit cache size
   openclaw config set skills.scraping-service.config.cache_max_items 100
   
   # Disable screenshot caching
   openclaw config set skills.scraping-service.config.cache_screenshots false
   ```

3. **Browser crashes**:
   ```bash
   # Reduce viewport size
   openclaw config set skills.scraping-service.config.viewport_width 1024
   openclaw config set skills.scraping-service.config.viewport_height 768
   
   # Disable stealth mode
   openclaw config set skills.scraping-service.config.stealth_mode false
   
   # Reinstall browsers
   npm run install-browsers
   ```

### Integration Issues

1. **Cogniti integration failing**:
   ```bash
   # Test Cogniti connection
   curl http://localhost:3000/health
   
   # Check configuration
   openclaw config get skills.scraping-service.config.cogniti_url
   openclaw config get skills.scraping-service.config.default_user_email
   ```

2. **API authentication errors**:
   ```bash
   # Verify API key
   openclaw config get skills.scraping-service.config.api_key
   
   # Check service logs
   tail -f /home/mark/Repos/projects/scraping/logs/scraping.log
   ```

3. **CORS errors**:
   ```bash
   # Update CORS configuration
   openclaw config set skills.scraping-service.config.cors_origins "http://localhost:8080,http://localhost:3000"
   
   # Restart service
   cd /home/mark/Repos/projects/scraping && npm restart
   ```

## Support

- **Documentation**: See `README.md` for API details
- **Issues**: GitHub repository (if public)
- **Community**: OpenClaw Discord or community channels
- **Updates**: Check for service updates with `npm outdated`

---

**Ready to scrape the web for your OpenClaw workflows!**