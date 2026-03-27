// src/lib/auth/jwt.ts
// JWT authentication for API keys

import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../../config/env';
import { apiKeyStore, ApiKey } from './api-key-store';

export interface JwtPayload {
  apiKeyId: string;
  name: string;
  userId?: string;
  iat: number;
  exp: number;
}

export interface AuthResult {
  valid: boolean;
  apiKey?: ApiKey;
  error?: string;
}

export class JwtAuth {
  private secret: string;
  private expiresIn: string;

  constructor() {
    this.secret = config.jwtSecret || 'change-this-secret-in-production';
    this.expiresIn = config.jwtExpiresIn || '7d';
  }

  generateToken(apiKey: ApiKey): string {
    const payload = {
      apiKeyId: apiKey.id,
      name: apiKey.name,
      userId: apiKey.userId,
    };

    const options: SignOptions = {
      expiresIn: this.expiresIn as any,
    };

    return jwt.sign(payload, this.secret, options);
  }

  verifyToken(token: string): AuthResult {
    try {
      const decoded = jwt.verify(token, this.secret) as JwtPayload;
      
      const apiKey = apiKeyStore.get(decoded.apiKeyId);
      
      if (!apiKey) {
        return { valid: false, error: 'API key not found' };
      }

      if (!apiKey.isActive) {
        return { valid: false, error: 'API key is inactive' };
      }

      if (apiKey.expiresAt && apiKey.expiresAt < Date.now()) {
        return { valid: false, error: 'API key has expired' };
      }

      return { valid: true, apiKey };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return { valid: false, error: 'Token has expired' };
      }
      if (error.name === 'JsonWebTokenError') {
        return { valid: false, error: 'Invalid token' };
      }
      return { valid: false, error: 'Authentication failed' };
    }
  }

  verifyApiKey(key: string): AuthResult {
    const apiKey = apiKeyStore.verify(key);

    if (!apiKey) {
      return { valid: false, error: 'Invalid API key' };
    }

    // Check rate limit
    const rateLimit = apiKeyStore.checkRateLimit(apiKey.id);
    if (!rateLimit.allowed) {
      return { valid: false, error: 'Rate limit exceeded' };
    }

    return { valid: true, apiKey };
  }

  // Middleware for Express
  authenticate(): (req: any, res: any, next: any) => void {
    return (req: any, res: any, next: any) => {
      // Check for API key in header
      const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
      
      // Check for JWT token
      const token = req.headers['authorization']?.replace('Bearer ', '');

      if (!apiKey && !token) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'MISSING_AUTH',
            message: 'API key or token is required',
          },
        });
      }

      let authResult: AuthResult;

      if (token) {
        authResult = this.verifyToken(token);
      } else if (apiKey) {
        authResult = this.verifyApiKey(apiKey);
      } else {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_AUTH',
            message: 'Invalid authentication',
          },
        });
      }

      if (!authResult.valid) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_FAILED',
            message: authResult.error,
          },
        });
      }

      // Attach API key to request
      req.apiKey = authResult.apiKey;
      
      // Add rate limit headers
      const rateLimit = apiKeyStore.checkRateLimit(authResult.apiKey!.id);
      res.setHeader('X-RateLimit-Limit', authResult.apiKey!.rateLimit.requestsPerDay);
      res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
      res.setHeader('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString());

      next();
    };
  }
}

export const jwtAuth = new JwtAuth();
