import { verifyApiKey as verifyApiKeyDb, deductCredits, logUsage } from './users';

const CREDIT_COSTS: Record<string, number> = {
  '/v1/scrape': 1,
  '/v1/scrape/batch': 2,
  '/v1/crawl': 3,
  '/v1/search': 2,
  '/v1/youtube/transcript': 1,
  '/v1/scrape/images': 1,
  '/v1/scrape/screenshot': 2,
  '/v1/scrape/selectors': 1,
  '/v1/scrape/links': 1,
};

export function getCreditCost(endpoint: string): number {
  for (const [path, cost] of Object.entries(CREDIT_COSTS)) {
    if (endpoint.startsWith(path)) {
      return cost;
    }
  }
  return 1;
}

export function checkCredits(required: number): (req: any, res: any, next: any) => void {
  return async (req: any, res: any, next: any) => {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'API key required' },
      });
    }

    const result = await verifyApiKeyDb(apiKey);
    
    if (!result.valid || !result.userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_API_KEY', message: 'Invalid API key' },
      });
    }

    if (result.credits === undefined || result.credits < required) {
      return res.status(402).json({
        success: false,
        error: { 
          code: 'INSUFFICIENT_CREDITS', 
          message: `Insufficient credits. Required: ${required}, Available: ${result.credits}`,
        },
      });
    }

    req.creditCost = required;
    req.userId = result.userId;
    req.apiKeyId = result.apiKeyId;
    
    next();
  };
}

export function deductCreditsAfter(req: any, res: any, next: any) {
  const startTime = Date.now();
  
  const originalSend = res.send;
  res.send = function(data: any) {
    const statusCode = res.statusCode;
    const latencyMs = Date.now() - startTime;
    
    if (req.userId && req.apiKeyId && req.creditCost) {
      if (statusCode >= 200 && statusCode < 300) {
        deductCredits(req.userId, req.creditCost).then(() => {});
        logUsage(req.userId, req.apiKeyId, req.path, req.creditCost, latencyMs, statusCode).then(() => {});
      }
    }
    
    return originalSend.call(this, data);
  };
  
  next();
}
