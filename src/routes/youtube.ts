// src/routes/youtube.ts
// YouTube Transcript Extraction Routes

import { Router, type Request, type Response } from 'express';
import { youtubeExtractor } from '../scrapers/youtube';
import { metrics } from '../scrapers/advanced/metrics';

const router = Router();

// Extract YouTube video transcript
router.post('/transcript', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { url, language } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_URL',
          message: 'YouTube URL is required',
        },
      });
    }

    // Validate YouTube URL
    const videoId = youtubeExtractor.extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_URL',
          message: 'Invalid YouTube URL',
        },
      });
    }

    const result = await youtubeExtractor.extract(url, { language });

    metrics.recordScrapeDuration((Date.now() - startTime) / 1000);

    if (result.error) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'EXTRACTION_ERROR',
          message: result.error,
        },
      });
    }

    const response = {
      success: true,
      data: {
        videoId: result.videoId,
        title: result.title,
        description: result.description,
        channelName: result.channelName,
        channelId: result.channelId,
        publishedAt: result.publishedAt,
        duration: result.duration,
        views: result.views,
        likes: result.likes,
        thumbnailUrl: result.thumbnailUrl,
        transcripts: result.transcripts,
        transcriptText: youtubeExtractor.getTranscriptText(result.transcripts),
        availableLanguages: result.availableLanguages,
      },
      metadata: {
        latencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    };

    res.json(response);

  } catch (error: any) {
    console.error('YouTube extraction error:', error);
    
    res.status(500).json({
      success: false,
      error: {
        code: 'EXTRACTION_FAILED',
        message: error.message || 'Failed to extract YouTube transcript',
      },
    });
  }
});

// Search within transcript
router.post('/transcript/search', async (req: Request, res: Response) => {
  try {
    const { url, query, language } = req.body;

    if (!url || !query) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMS',
          message: 'URL and query are required',
        },
      });
    }

    const result = await youtubeExtractor.extract(url, { language });

    if (result.error || result.transcripts.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NO_TRANSCRIPT',
          message: 'No transcript available for this video',
        },
      });
    }

    const matches = youtubeExtractor.searchTranscript(result.transcripts, query);

    res.json({
      success: true,
      data: {
        videoId: result.videoId,
        title: result.title,
        query,
        matches,
        matchCount: matches.length,
      },
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SEARCH_FAILED',
        message: error.message,
      },
    });
  }
});

// Get transcript at specific timestamp
router.post('/transcript/timestamp', async (req: Request, res: Response) => {
  try {
    const { url, timestamp, language } = req.body;

    if (!url || timestamp === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMS',
          message: 'URL and timestamp are required',
        },
      });
    }

    const result = await youtubeExtractor.extract(url, { language });

    if (result.error || result.transcripts.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NO_TRANSCRIPT',
          message: 'No transcript available for this video',
        },
      });
    }

    const segment = youtubeExtractor.getSegmentAtTime(result.transcripts, timestamp);

    res.json({
      success: true,
      data: {
        videoId: result.videoId,
        title: result.title,
        timestamp,
        segment,
      },
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TIMESTAMP_FAILED',
        message: error.message,
      },
    });
  }
});

export default router;
