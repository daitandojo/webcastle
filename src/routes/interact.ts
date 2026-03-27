// src/routes/interact.ts
// Interact endpoint - AI-powered browser interactions

import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { scraperEngine, interactEngine } from '../scrapers';
import { InteractOptions, ScrapeResult, ScrapeResponse } from '../scrapers/types';
import { config } from '../config/env';

// First scrape a URL, then optionally interact with it
const scrapeAndInteractSchema = z.object({
  url: z.string().url(),
  options: z.object({
    mobile: z.boolean().optional(),
    waitFor: z.number().optional(),
    profile: z.object({
      name: z.string().min(1).max(128),
      saveChanges: z.boolean().optional().default(true),
    }).optional(),
  }).optional(),
  formats: z.array(z.any()).optional(),
});

// Interact with an existing scrape session
const interactRequestSchema = z.object({
  prompt: z.string().max(10000).optional(),
  code: z.string().max(100000).optional(),
  language: z.enum(['node', 'python', 'bash']).optional().default('node'),
  timeout: z.number().min(1).max(300).optional().default(30),
  origin: z.string().optional(),
});

// Scrape first, then interact (POST /v1/scrape/{scrapeId}/interact)
export const interactHandler = async (req: Request, res: Response) => {
  const { scrapeId } = req.params;
  const startTime = Date.now();
  const requestId = `interact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const validated = interactRequestSchema.parse(req.body);
    
    const result = await scraperEngine.interact(scrapeId, validated);
    const processingTimeMs = Date.now() - startTime;

    const response = {
      success: result.success,
      liveViewUrl: result.liveViewUrl,
      interactiveLiveViewUrl: result.interactiveLiveViewUrl,
      output: result.output,
      stdout: result.stdout,
      stderr: result.stderr,
      result: result.result,
      exitCode: result.exitCode,
      killed: result.killed,
      metadata: {
        processingTimeMs,
        timestamp: new Date().toISOString(),
        requestId,
      },
    };

    res.json(response);

  } catch (error: any) {
    const processingTimeMs = Date.now() - startTime;
    
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: error.issues,
        },
        metadata: {
          processingTimeMs,
          timestamp: new Date().toISOString(),
          requestId,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'An unexpected error occurred',
          details: config.isDevelopment ? error.stack : undefined,
        },
        metadata: {
          processingTimeMs,
          timestamp: new Date().toISOString(),
          requestId,
        },
      });
    }
  }
};

// Stop an interact session
export const interactStopHandler = async (req: Request, res: Response) => {
  const { scrapeId } = req.params;
  const startTime = Date.now();
  const requestId = `interact_stop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    await scraperEngine.stopInteraction(scrapeId);

    res.json({
      success: true,
      message: 'Interaction session stopped',
      metadata: {
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        requestId,
      },
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred',
      },
      metadata: {
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
  }
};

// Get active interact sessions
export const interactSessionsHandler = async (_req: Request, res: Response) => {
  const sessions = interactEngine.getActiveSessions();

  res.json({
    success: true,
    data: sessions,
    count: sessions.length,
  });
};
