/**
 * Scraping Service - Firecrawl-Inspired Web Scraping Microservice
 * 
 * Features:
 * - FAST mode (HTTP + Readability) for static content
 * - DEEP mode (Playwright) for JavaScript-rendered pages
 * - Website crawling with sitemap discovery
 * - Web search with content extraction
 * - AI-powered browser interactions
 * - LLM JSON schema extraction
 * - Content change tracking
 * - Branding extraction
 * - Mobile emulation
 * - Geographic targeting
 * - Proxy support
 * - Ad-blocking
 * - Session persistence
 * - Webhook notifications
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { config } from './config/env';
import { ipRateLimiter } from './lib/utils/rate-limiter';
import { jwtAuth } from './lib/auth/jwt';
import { apiKeyStore } from './lib/auth/api-key-store';
import { wsManager } from './lib/websocket';
import { initializeDatabase } from './lib/db/index';
import userRoutes from './routes/auth-user';
import { handleStripeWebhook } from './lib/db/stripe';
import { checkCredits, deductCreditsAfter, getCreditCost } from './lib/db/credits';
import adminRoutes from './routes/admin';

initializeDatabase();

// Import route handlers
import { healthHandler } from './routes/health';
import { capabilitiesHandler } from './routes/capabilities';
import { scrapeHandler } from './routes/scrape';
import { batchScrapeHandler } from './routes/batch';
import { selectorScrapeHandler } from './routes/selectors';
import { imageScrapeHandler } from './routes/images';
import { linksScrapeHandler } from './routes/links';
import { screenshotHandler } from './routes/screenshot';
import { storeHandler } from './routes/store';
import { crawlHandler, crawlStatusHandler, crawlCancelHandler } from './routes/crawl';
import { searchHandler } from './routes/search';
import { interactHandler, interactStopHandler, interactSessionsHandler } from './routes/interact';
import youtubeRoutes from './routes/youtube';
import { 
  meHandler, 
  tokenHandler, 
  listKeysHandler, 
  createKeyHandler, 
  updateKeyHandler, 
  deleteKeyHandler, 
  statsHandler,
  rotateKeyHandler 
} from './routes/auth';

// Create Express app
const app = express();
const PORT = config.port;

// Configure logger
const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'scraping-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// =============== MIDDLEWARE ===============

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

// JSON body parsing with size limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// HTTP logging
app.use(morgan(config.isDevelopment ? 'dev' : 'combined', {
  stream: {
    write: (message: string) => logger.http(message.trim()),
  },
}));

// =============== AUTHENTICATION MIDDLEWARE ===============

const authenticateApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!config.requireAuth) {
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'MISSING_API_KEY',
        message: 'API key is required',
      },
    });
  }

  if (!config.apiKeys.includes(apiKey as string)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
      },
    });
  }

  next();
};

// =============== RATE LIMITING MIDDLEWARE ===============

const rateLimitMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const rateLimitResult = ipRateLimiter.check(ip);

  if (!rateLimitResult.allowed) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        details: {
          resetTime: new Date(rateLimitResult.resetTime).toISOString(),
          remaining: rateLimitResult.remaining,
        },
      },
    });
  }

  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', config.rateLimitMaxRequests);
  res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
  res.setHeader('X-RateLimit-Reset', new Date(rateLimitResult.resetTime).toISOString());

  next();
};

// =============== REQUEST LOGGING MIDDLEWARE ===============

const requestLogger = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  (req as any).requestId = requestId;
  
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  
  next();
};

// =============== STATIC FILES ===============

// Serve landing page
app.use(express.static(path.join(__dirname, '../public')));

// =============== APPLY MIDDLEWARE ===============

// Apply authentication to all routes except health, landing page, user auth, webhooks, and dashboard
app.use((req, res, next) => {
  const publicPaths = ['/health', '/index.html', '/ws', '/docs', '/webhooks', '/dashboard', '/admin'];
  const authPaths = ['/v1/user/register', '/v1/user/login', '/v1/user/credits/packages'];
  if (
    publicPaths.includes(req.path) || 
    req.path === '/' || 
    req.path.endsWith('.js') || 
    req.path.endsWith('.css') ||
    req.path.startsWith('/webhooks') ||
    req.path.startsWith('/dashboard') ||
    req.path.startsWith('/admin') ||
    (req.method === 'POST' && authPaths.includes(req.path))
  ) {
    return next();
  }
  return jwtAuth.authenticate()(req, res, next);
});

// Apply rate limiting to all routes
app.use(rateLimitMiddleware);

// Apply request logging
app.use(requestLogger);

// =============== ROUTES ===============

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    service: 'Scraping Service',
    version: '1.0.0',
    description: 'Firecrawl-inspired web scraping microservice',
    status: 'operational',
    documentation: '/v1/capabilities',
    endpoints: {
      health: '/health',
      capabilities: '/v1/capabilities',
      // Core scraping
      scrape: 'POST /v1/scrape',
      batchScrape: 'POST /v1/scrape/batch',
      selectors: 'POST /v1/scrape/selectors',
      images: 'POST /v1/scrape/images',
      screenshot: 'POST /v1/scrape/screenshot',
      store: 'POST /v1/scrape/store',
      // Advanced features
      crawl: 'POST /v1/crawl',
      crawlStatus: 'GET /v1/crawl/:jobId',
      crawlCancel: 'DELETE /v1/crawl/:jobId',
      search: 'POST /v1/search',
      interact: 'POST /v1/scrape/:scrapeId/interact',
      interactStop: 'DELETE /v1/scrape/:scrapeId/interact',
      interactSessions: 'GET /v1/scrape/interact/sessions',
    },
    features: [
      // Core
      'FAST mode (HTTP + Readability) for static content',
      'DEEP mode (Playwright) for JavaScript pages',
      'Clean text extraction with Mozilla Readability',
      'Precision CSS selector extraction',
      'Image hunting and metadata extraction',
      'Page screenshots',
      'Batch URL processing',
      // Advanced (Firecrawl-inspired)
      'Website crawling with sitemap discovery',
      'Async job processing with webhooks',
      'Web search with content extraction',
      'AI-powered browser interactions',
      'LLM JSON schema extraction',
      'Content change tracking',
      'Branding extraction',
      'Mobile emulation',
      'Geographic targeting',
      'Proxy support',
      'Ad-blocking',
      'Session persistence',
      // Infrastructure
      'API key authentication',
      'Per-IP rate limiting',
      'Advanced caching with maxAge/minAge',
      'Cogniti memory system integration',
    ],
  });
});

// Health check
app.get('/health', healthHandler);

// Capabilities
app.get('/v1/capabilities', capabilitiesHandler);

// =============== CORE SCRAPING ROUTES ===============

// Single URL scraping
app.post('/v1/scrape', scrapeHandler);

// Batch URL scraping
app.post('/v1/scrape/batch', batchScrapeHandler);

// Precision selector extraction
app.post('/v1/scrape/selectors', selectorScrapeHandler);

// Image hunt extraction
app.post('/v1/scrape/images', imageScrapeHandler);

// Hyperlink extraction
app.post('/v1/scrape/links', linksScrapeHandler);

// Screenshot capture
app.post('/v1/scrape/screenshot', screenshotHandler);

// Scrape and store to Cogniti
app.post('/v1/scrape/store', storeHandler);

// =============== ADVANCED FEATURES (Firecrawl-inspired) ===============

// Website crawling
app.post('/v1/crawl', crawlHandler);
app.get('/v1/crawl/:jobId', crawlStatusHandler);
app.delete('/v1/crawl/:jobId', crawlCancelHandler);

// Web search
app.post('/v1/search', searchHandler);

// YouTube transcript extraction
app.use('/v1/youtube', youtubeRoutes);

// AI-powered browser interactions
app.post('/v1/scrape/:scrapeId/interact', interactHandler);
app.delete('/v1/scrape/:scrapeId/interact', interactStopHandler);
app.get('/v1/scrape/interact/sessions', interactSessionsHandler);

// =============== AUTH ROUTES ===============

// Get current API key info
app.get('/v1/auth/me', meHandler);

// Generate JWT token
app.post('/v1/auth/token', tokenHandler);

// List API keys (admin or own keys)
app.get('/v1/auth/keys', listKeysHandler);

// Create new API key
app.post('/v1/auth/keys', createKeyHandler);

// Update API key
app.patch('/v1/auth/keys/:keyId', updateKeyHandler);

// Delete API key
app.delete('/v1/auth/keys/:keyId', deleteKeyHandler);

// Rotate API key
app.post('/v1/auth/keys/:keyId/rotate', rotateKeyHandler);

// Get usage stats (admin)
app.get('/v1/auth/stats', statsHandler);

// =============== USER AUTH ROUTES ===============

// Stripe webhook (must be before express.json parser)
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    await handleStripeWebhook(req.body as string, signature);
    res.json({ received: true });
  } catch (err: any) {
    logger.error('Stripe webhook error: ' + err.message);
    res.status(400).json({ error: err.message });
  }
});

// User registration and login
app.use('/v1/user', userRoutes);

// Admin routes
app.use('/v1/admin', adminRoutes);

// =============== ERROR HANDLING ===============

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    availableRoutes: [
      'GET / - Service information (or landing page)',
      'GET /health - Health check',
      'GET /v1/capabilities - Supported modes and limits',
      // Core
      'POST /v1/scrape - Single URL scraping',
      'POST /v1/scrape/batch - Batch URL scraping',
      'POST /v1/scrape/selectors - Precision selector extraction',
      'POST /v1/scrape/images - Image hunt extraction',
      'POST /v1/scrape/screenshot - Page screenshot',
      'POST /v1/scrape/store - Scrape and store to Cogniti',
      // Advanced
      'POST /v1/crawl - Crawl website',
      'GET /v1/crawl/:jobId - Get crawl status',
      'DELETE /v1/crawl/:jobId - Cancel crawl',
      'POST /v1/search - Search the web',
      'POST /v1/scrape/:scrapeId/interact - Interact with page',
      'DELETE /v1/scrape/:scrapeId/interact - Stop interaction',
      'GET /v1/scrape/interact/sessions - List active sessions',
      // Auth
      'GET /v1/auth/me - Get current API key info',
      'POST /v1/auth/token - Generate JWT token',
      'GET /v1/auth/keys - List API keys',
      'POST /v1/auth/keys - Create new API key',
      'PATCH /v1/auth/keys/:keyId - Update API key',
      'DELETE /v1/auth/keys/:keyId - Delete API key',
      'GET /v1/auth/stats - Get usage statistics',
      // WebSocket
      'WS /ws - WebSocket for real-time updates',
    ],
  });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestId = (req as any).requestId || 'unknown';
  
  logger.error('Unhandled error', {
    requestId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
  });
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isDevelopment ? err.message : 'An unexpected error occurred',
      ...(config.isDevelopment && { stack: err.stack }),
    },
    metadata: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

// =============== SERVER STARTUP ===============

const startServer = async () => {
  try {
    // Create required directories
    const requiredDirs = [
      config.tempDir,
      path.join(config.tempDir, 'screenshots'),
      path.join(config.tempDir, 'logs'),
      config.playwrightProfilesDir,
      path.join(process.cwd(), 'data'),
    ];
    
    for (const dir of requiredDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.debug(`Created directory: ${dir}`);
      }
    }
    
    // Start cleanup interval for rate limiter
    setInterval(() => ipRateLimiter.cleanup(), 60000);
    
    // Create HTTP server
    const server = createServer(app);
    
    // Initialize WebSocket
    wsManager.initialize(server);
    
    server.listen(PORT, () => {
      logger.info(`WebCastle API running`, {
        port: PORT,
        environment: config.nodeEnv,
        url: `http://localhost:${PORT}`,
        version: '1.0.0',
      });
      
      console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║                    SCRAPING SERVICE v1.0.0                            ║
║              Firecrawl-Inspired Web Scraping Microservice              ║
╠════════════════════════════════════════════════════════════════════════╣
║  🔗 URL: http://localhost:${PORT}                                            ║
║  🌍 Environment: ${config.nodeEnv}                                              ║
║  🔑 Authentication: ${config.requireAuth ? 'Enabled' : 'Disabled'}                                   ║
║  💾 Cache: ${config.cacheEnabled ? 'Enabled' : 'Disabled'} (${config.cacheTtlMs / 1000}s TTL)                   ║
║  🚦 Rate Limit: ${config.rateLimitMaxRequests} req/${config.rateLimitWindowMs / 60000}min per IP                         ║
╠════════════════════════════════════════════════════════════════════════╣
║  📊 CORE ENDPOINTS:                                                    ║
║  • GET  /health              - Service health check                    ║
║  • GET  /v1/capabilities     - Supported modes and limits              ║
║  • POST /v1/scrape           - Single URL scraping                     ║
║  • POST /v1/scrape/batch     - Batch URL scraping                      ║
║  • POST /v1/scrape/selectors - Precision selector extraction          ║
║  • POST /v1/scrape/images    - Image hunt extraction                   ║
║  • POST /v1/scrape/screenshot - Page screenshot                        ║
║  • POST /v1/scrape/store     - Scrape and store to Cogniti             ║
╠════════════════════════════════════════════════════════════════════════╣
║  🔥 ADVANCED FEATURES:                                                 ║
║  • POST /v1/crawl                    - Crawl website (sitemap + links) ║
║  • GET  /v1/crawl/:jobId              - Get crawl job status            ║
║  • DELETE /v1/crawl/:jobId            - Cancel crawl job                ║
║  • POST /v1/search                    - Search web + scrape results     ║
║  • POST /v1/scrape/:scrapeId/interact - AI browser interaction         ║
║  • DELETE /v1/scrape/:scrapeId/interact - Stop interaction session    ║
╚════════════════════════════════════════════════════════════════════════╝

🎯 NEW FEATURES (v1.0):
• 🕷️  Website Crawling - Recursive crawling with sitemap discovery
• 🔍 Web Search - Search + scrape in one operation  
• 🤖 AI Interactions - Natural language browser control
• 📊 LLM Extraction - JSON schema extraction via LLM
• 📈 Change Tracking - Monitor content changes over time
• 🎨 Branding Extraction - Extract colors, fonts, logos
• 📱 Mobile Emulation - Test responsive pages
• 🌍 Geographic Targeting - Location-based scraping
• 🔄 Session Persistence - Login once, reuse sessions
• 📡 Webhooks - Async notifications for crawls

⚡ QUICK START:
1. Test scraping: 
   curl -X POST http://localhost:${PORT}/v1/scrape \\
     -H "Content-Type: application/json" \\
     -H "x-api-key: scraping-key-1" \\
     -d '{"url": "https://example.com", "formats": ["markdown"]}'

2. Test crawling: 
   curl -X POST http://localhost:${PORT}/v1/crawl \\
     -H "Content-Type: application/json" \\
     -H "x-api-key: scraping-key-1" \\
     -d '{"url": "https://example.com", "limit": 10}'

3. Test search:
   curl -X POST http://localhost:${PORT}/v1/search \\
     -H "Content-Type: application/json" \\
     -H "x-api-key: scraping-key-1" \\
     -d '{"query": "artificial intelligence", "limit": 5}'

⚙️  CONFIGURATION:
• LLM Provider: ${config.llmProvider} (${config.llmModel})
• Search Provider: ${config.searchProvider}
• Ad Blocking: ${config.blockAds ? 'Enabled' : 'Disabled'}
• Proxy: ${config.proxyEnabled ? 'Enabled' : 'Disabled'}
      `);
    });
    
  } catch (error) {
    logger.error('Failed to start server', { error: error instanceof Error ? error.message : String(error) });
    console.error('❌ Failed to start Scraping Service:', error);
    process.exit(1);
  }
};

// =============== GRACEFUL SHUTDOWN ===============

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal} signal, shutting down gracefully`);
  
  try {
    // Clean up temporary directories
    if (fs.existsSync(config.tempDir)) {
      fs.rmSync(config.tempDir, { recursive: true, force: true });
      logger.debug(`Cleaned up directory: ${config.tempDir}`);
    }
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  shutdown('unhandledRejection');
});

// =============== START SERVER ===============

if (require.main === module) {
  startServer();
}

export default app;
