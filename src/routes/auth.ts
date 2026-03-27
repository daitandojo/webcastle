// src/routes/auth.ts
// API Key management routes

import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { apiKeyStore, ApiKey } from '../lib/auth/api-key-store';
import { jwtAuth } from '../lib/auth/jwt';
import { config } from '../config/env';

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.number().optional(),
  rateLimit: z.object({
    requestsPerMinute: z.number().min(1).max(1000).optional(),
    requestsPerDay: z.number().min(1).max(100000).optional(),
  }).optional(),
  limits: z.object({
    maxConcurrent: z.number().min(1).max(50).optional(),
    maxCrawlPages: z.number().min(1).max(100000).optional(),
  }).optional(),
});

const updateKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.number().optional(),
  rateLimit: z.object({
    requestsPerMinute: z.number().min(1).max(1000).optional(),
    requestsPerDay: z.number().min(1).max(100000).optional(),
  }).optional(),
  limits: z.object({
    maxConcurrent: z.number().min(1).max(50).optional(),
    maxCrawlPages: z.number().min(1).max(100000).optional(),
  }).optional(),
});

// Get current API key info
export const meHandler = async (req: Request, res: Response) => {
  const apiKey = req.apiKey as ApiKey;
  
  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
      },
    });
    return;
  }

  res.json({
    success: true,
    data: {
      id: apiKey.id,
      name: apiKey.name,
      createdAt: new Date(apiKey.createdAt).toISOString(),
      expiresAt: apiKey.expiresAt ? new Date(apiKey.expiresAt).toISOString() : null,
      isActive: apiKey.isActive,
      rateLimit: apiKey.rateLimit,
      limits: apiKey.limits,
      usage: {
        totalRequests: apiKey.usage.totalRequests,
        totalCredits: apiKey.usage.totalCredits,
        lastUsed: new Date(apiKey.usage.lastUsed).toISOString(),
      },
    },
  });
};

// Generate JWT token from API key
export const tokenHandler = async (req: Request, res: Response) => {
  const apiKey = req.apiKey as ApiKey;
  
  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
      },
    });
    return;
  }

  const token = jwtAuth.generateToken(apiKey);

  res.json({
    success: true,
    data: {
      token,
      expiresIn: config.jwtExpiresIn,
      type: 'Bearer',
    },
  });
};

// List all API keys (admin only - requires special key)
export const listKeysHandler = async (req: Request, res: Response) => {
  const apiKey = req.apiKey as ApiKey;
  
  // Check if user is admin (has special metadata or is in allow list)
  const isAdmin = apiKey.metadata?.isAdmin || config.apiKeys.includes(apiKey.key);
  
  if (!isAdmin) {
    // Return only current user's keys
    const keys = apiKeyStore.list().filter(k => k.id === apiKey.id);
    res.json({
      success: true,
      data: keys.map(k => ({
        id: k.id,
        name: k.name,
        createdAt: new Date(k.createdAt).toISOString(),
        expiresAt: k.expiresAt ? new Date(k.expiresAt).toISOString() : null,
        isActive: k.isActive,
        rateLimit: k.rateLimit,
        limits: k.limits,
        usage: {
          totalRequests: k.usage.totalRequests,
          totalCredits: k.usage.totalCredits,
        },
      })),
    });
    return;
  }

  const keys = apiKeyStore.list();
  res.json({
    success: true,
    data: keys.map(k => ({
      id: k.id,
      name: k.name,
      createdAt: new Date(k.createdAt).toISOString(),
      expiresAt: k.expiresAt ? new Date(k.expiresAt).toISOString() : null,
      isActive: k.isActive,
      rateLimit: k.rateLimit,
      limits: k.limits,
      usage: {
        totalRequests: k.usage.totalRequests,
        totalCredits: k.usage.totalCredits,
      },
    })),
  });
};

// Create new API key
export const createKeyHandler = async (req: Request, res: Response) => {
  try {
    const validated = createKeySchema.parse(req.body);
    
    const result = apiKeyStore.create({
      name: validated.name,
      expiresAt: validated.expiresAt,
      rateLimit: validated.rateLimit ? {
        requestsPerMinute: validated.rateLimit.requestsPerMinute || 60,
        requestsPerDay: validated.rateLimit.requestsPerDay || 5000,
      } : undefined,
      limits: validated.limits ? {
        maxConcurrent: validated.limits.maxConcurrent || 5,
        maxCrawlPages: validated.limits.maxCrawlPages || 5000,
      } : undefined,
    });

    res.status(201).json({
      success: true,
      data: {
        id: result.id,
        key: result.key,
        name: result.apiKey.name,
        createdAt: new Date(result.apiKey.createdAt).toISOString(),
        expiresAt: result.apiKey.expiresAt ? new Date(result.apiKey.expiresAt).toISOString() : null,
        rateLimit: result.apiKey.rateLimit,
        limits: result.apiKey.limits,
      },
    });

  } catch (error: any) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: error.issues,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        },
      });
    }
  }
};

// Update API key
export const updateKeyHandler = async (req: Request, res: Response) => {
  const { keyId } = req.params;
  
  try {
    const validated = updateKeySchema.parse(req.body);
    
    const updates: any = {};
    if (validated.name) updates.name = validated.name;
    if (validated.isActive !== undefined) updates.isActive = validated.isActive;
    if (validated.expiresAt) updates.expiresAt = validated.expiresAt;
    if (validated.rateLimit) updates.rateLimit = {
      requestsPerMinute: validated.rateLimit.requestsPerMinute || 60,
      requestsPerDay: validated.rateLimit.requestsPerDay || 5000,
    };
    if (validated.limits) updates.limits = {
      maxConcurrent: validated.limits.maxConcurrent || 5,
      maxCrawlPages: validated.limits.maxCrawlPages || 5000,
    };
    
    const updated = apiKeyStore.update(keyId, updates);

    if (!updated) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'API key not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        isActive: updated.isActive,
        expiresAt: updated.expiresAt ? new Date(updated.expiresAt).toISOString() : null,
        rateLimit: updated.rateLimit,
        limits: updated.limits,
      },
    });

  } catch (error: any) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: error.issues,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
        },
      });
    }
  }
};

// Delete API key
export const deleteKeyHandler = async (req: Request, res: Response) => {
  const { keyId } = req.params;
  
  const deleted = apiKeyStore.delete(keyId);

  if (!deleted) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'API key not found',
      },
    });
    return;
  }

  res.json({
    success: true,
    message: 'API key deleted',
  });
};

// Get API key usage stats
export const statsHandler = async (req: Request, res: Response) => {
  const stats = apiKeyStore.getStats();

  res.json({
    success: true,
    data: stats,
  });
};

// Regenerate API key (rotate)
export const rotateKeyHandler = async (req: Request, res: Response) => {
  const { keyId } = req.params;
  
  // Get existing key
  const existing = apiKeyStore.get(keyId);
  if (!existing) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'API key not found',
      },
    });
    return;
  }

  // Delete old key
  apiKeyStore.delete(keyId);

  // Create new key with same settings
  const result = apiKeyStore.create({
    name: existing.name,
    expiresAt: existing.expiresAt,
    rateLimit: existing.rateLimit,
    limits: existing.limits,
  });

  res.status(201).json({
    success: true,
    data: {
      id: result.id,
      key: result.key,
      name: result.apiKey.name,
      createdAt: new Date(result.apiKey.createdAt).toISOString(),
      expiresAt: result.apiKey.expiresAt ? new Date(result.apiKey.expiresAt).toISOString() : null,
      rateLimit: result.apiKey.rateLimit,
      limits: result.apiKey.limits,
    },
  });
};
