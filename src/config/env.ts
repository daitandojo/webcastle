import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment schema - Extended for Firecrawl-inspired features
const envSchema = z.object({
  // Server
  PORT: z.string().default('3052'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // API Authentication
  API_KEYS: z.string().default(''),
  REQUIRE_AUTH: z.string().default('true').transform((val) => val.toLowerCase() === 'true'),
  
  // JWT Configuration
  JWT_SECRET: z.string().default('change-this-secret-in-production-minimum-32-chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // Scraping Configuration
  SCRAPER_TIMEOUT_MS: z.string().default('30000').transform(Number),
  SCRAPER_CONCURRENT: z.string().default('3').transform(Number),
  SCRAPER_USER_AGENT: z.string().default('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
  SCRAPER_RATE_LIMIT_RPS: z.string().default('10').transform(Number),
  SCRAPER_MAX_URLS_PER_BATCH: z.string().default('10').transform(Number),
  SCRAPER_MAX_CRAWL_PAGES: z.string().default('10000').transform(Number),
  SCRAPER_DEFAULT_FIDELITY: z.enum(['FAST', 'DEEP']).default('DEEP'),
  SCRAPER_DEFAULT_MODE: z.enum(['CLEAN_TEXT', 'FULL_HTML', 'PRECISION_SELECTORS', 'IMAGE_HUNT']).default('CLEAN_TEXT'),
  
  // Browser Configuration (Playwright)
  PLAYWRIGHT_HEADLESS: z.string().default('true').transform((val) => val.toLowerCase() === 'true'),
  PLAYWRIGHT_STEALTH_MODE: z.string().default('true').transform((val) => val.toLowerCase() === 'true'),
  PLAYWRIGHT_BROWSER_PATH: z.string().optional(),
  PLAYWRIGHT_TIMEOUT_MS: z.string().default('30000').transform(Number),
  PLAYWRIGHT_VIEWPORT_WIDTH: z.string().default('1440').transform(Number),
  PLAYWRIGHT_VIEWPORT_HEIGHT: z.string().default('900').transform(Number),
  PLAYWRIGHT_PROFILES_DIR: z.string().default('./profiles'),
  
  // Caching Configuration
  CACHE_ENABLED: z.string().default('true').transform((val) => val.toLowerCase() === 'true'),
  CACHE_TTL_MS: z.string().default('3600000').transform(Number), // 1 hour
  CACHE_MAX_AGE_MS: z.string().default('172800000').transform(Number), // 2 days default maxAge
  CACHE_MAX_ITEMS: z.string().default('1000').transform(Number),
  
  // Rate Limiting (per IP)
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),
  
  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3050,http://localhost:3051,http://localhost:3052,http://localhost:8080'),
  
  // Cogniti Integration
  COGNITI_API_URL: z.string().default('http://localhost:3050'),
  COGNITI_USER_EMAIL: z.string().optional(),
  
  // Webhook Configuration
  WEBHOOK_SECRET: z.string().optional(),
  
  // LLM Configuration (for JSON extraction) - OpenRouter only
  LLM_PROVIDER: z.enum(['openrouter', 'none']).default('openrouter'),
  LLM_MODEL: z.string().default('xiaomi/mimo-v2-flash'),
  OPENROUTER_API_KEY: z.string().optional(),
  
  // Search Configuration
  SEARCH_PROVIDER: z.enum(['duckduckgo', 'serpapi', 'google', 'bing']).default('duckduckgo'),
  SEARCH_API_KEY: z.string().optional(),
  
  // Proxy Configuration
  PROXY_ENABLED: z.string().default('false').transform((val) => val.toLowerCase() === 'true'),
  PROXY_URL: z.string().optional(),
  PROXY_USERNAME: z.string().optional(),
  PROXY_PASSWORD: z.string().optional(),
  
  // Ad Blocking
  BLOCK_ADS: z.string().default('true').transform((val) => val.toLowerCase() === 'true'),
  
  // Temporary Storage
  TEMP_DIR: z.string().default('./temp'),
  CLEANUP_INTERVAL_HOURS: z.string().default('24').transform(Number),
  
  // Sitemap
  SCRAPER_MAX_DEPTH: z.string().default('10').transform(Number),
  SCRAPER_SITEMAP_TIMEOUT: z.string().default('60000').transform(Number),

  // Database
  DB_PATH: z.string().default('./data/webcastle.db'),
  DATABASE_URL: z.string().optional(),
  
  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().default('0').transform(Number),
  
  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLIC_KEY: z.string().optional(),
  
  // Public URL for webhooks/redirects
  PUBLIC_URL: z.string().default('http://localhost:3052'),
});

// Parse environment variables
const env = envSchema.parse(process.env);

// Helper functions
export const config = {
  // Server
  port: parseInt(env.PORT, 10),
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  
  // API Authentication
  apiKeys: env.API_KEYS ? env.API_KEYS.split(',').map(key => key.trim()).filter(key => key.length > 0) : [],
  requireAuth: env.REQUIRE_AUTH,
  
  // JWT Configuration
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  
  // Scraping Configuration
  scraperTimeoutMs: env.SCRAPER_TIMEOUT_MS,
  scraperConcurrent: env.SCRAPER_CONCURRENT,
  scraperUserAgent: env.SCRAPER_USER_AGENT,
  scraperRateLimitRps: env.SCRAPER_RATE_LIMIT_RPS,
  scraperMaxUrlsPerBatch: env.SCRAPER_MAX_URLS_PER_BATCH,
  scraperMaxCrawlPages: env.SCRAPER_MAX_CRAWL_PAGES,
  scraperDefaultFidelity: env.SCRAPER_DEFAULT_FIDELITY,
  scraperDefaultMode: env.SCRAPER_DEFAULT_MODE,
  scraperMaxDepth: env.SCRAPER_MAX_DEPTH,
  scraperSitemapTimeout: env.SCRAPER_SITEMAP_TIMEOUT,
  
  // Browser Configuration
  playwrightHeadless: env.PLAYWRIGHT_HEADLESS,
  playwrightStealthMode: env.PLAYWRIGHT_STEALTH_MODE,
  playwrightBrowserPath: env.PLAYWRIGHT_BROWSER_PATH,
  playwrightTimeoutMs: env.PLAYWRIGHT_TIMEOUT_MS,
  playwrightViewport: {
    width: env.PLAYWRIGHT_VIEWPORT_WIDTH,
    height: env.PLAYWRIGHT_VIEWPORT_HEIGHT,
  },
  playwrightProfilesDir: env.PLAYWRIGHT_PROFILES_DIR,
  
  // Caching Configuration
  cacheEnabled: env.CACHE_ENABLED,
  cacheTtlMs: env.CACHE_TTL_MS,
  cacheMaxAgeMs: env.CACHE_MAX_AGE_MS,
  cacheMaxItems: env.CACHE_MAX_ITEMS,
  
  // Rate Limiting
  rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  
  // CORS
  corsOrigins: env.CORS_ORIGIN.split(',').map(origin => origin.trim()),
  
  // Cogniti Integration
  cognitiApiUrl: env.COGNITI_API_URL,
  cognitiUserEmail: env.COGNITI_USER_EMAIL,
  
  // Webhook
  webhookSecret: env.WEBHOOK_SECRET,
  
  // LLM Configuration (OpenRouter)
  llmProvider: env.LLM_PROVIDER,
  llmModel: env.LLM_MODEL,
  openrouterApiKey: env.OPENROUTER_API_KEY,
  
  // Search Configuration
  searchProvider: env.SEARCH_PROVIDER,
  searchApiKey: env.SEARCH_API_KEY,
  
  // Proxy Configuration
  proxyEnabled: env.PROXY_ENABLED,
  proxyUrl: env.PROXY_URL,
  proxyUsername: env.PROXY_USERNAME,
  proxyPassword: env.PROXY_PASSWORD,
  
  // Ad Blocking
  blockAds: env.BLOCK_ADS,
  
  // Temporary Storage
  tempDir: env.TEMP_DIR,
  cleanupIntervalHours: env.CLEANUP_INTERVAL_HOURS,
  
  // Database
  dbPath: env.DB_PATH,
  databaseUrl: env.DATABASE_URL,
  
  // Redis
  redisHost: env.REDIS_HOST,
  redisPort: env.REDIS_PORT,
  redisPassword: env.REDIS_PASSWORD,
  redisDb: env.REDIS_DB,
  
  // Stripe
  stripeSecretKey: env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
  stripePublicKey: env.STRIPE_PUBLIC_KEY,
  
  // Public URL
  publicUrl: env.PUBLIC_URL,
};

// Export type for TypeScript
export type Config = typeof config;

// Default export
export default config;
