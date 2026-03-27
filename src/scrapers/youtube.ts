// src/scrapers/youtube.ts
// YouTube Video Transcript Extraction

import { chromium, type Browser, type BrowserContext } from 'playwright';

export interface YouTubeTranscript {
  videoId: string;
  title: string;
  description: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  duration: string;
  views: number;
  likes: number;
  thumbnailUrl: string;
  transcripts: TranscriptSegment[];
  availableLanguages: string[];
  error?: string;
}

export interface TranscriptSegment {
  start: number;
  duration: number;
  text: string;
}

export interface YouTubeScrapeOptions {
  language?: string;
  includeDescription?: boolean;
  includeChapters?: boolean;
}

export class YouTubeExtractor {
  private browser: Browser | null = null;

  async extract(url: string, options: YouTubeScrapeOptions = {}): Promise<YouTubeTranscript> {
    const videoId = this.extractVideoId(url);
    
    if (!videoId) {
      return {
        videoId: '',
        title: '',
        description: '',
        channelName: '',
        channelId: '',
        publishedAt: '',
        duration: '',
        views: 0,
        likes: 0,
        thumbnailUrl: '',
        transcripts: [],
        availableLanguages: [],
        error: 'Invalid YouTube URL',
      };
    }

    try {
      // Launch browser
      this.browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      
      const context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      
      const page = await context.newPage();
      
      // Navigate to video page
      await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Wait for page to load
      await page.waitForTimeout(3000);

      // Extract data from page
      const result = await page.evaluate((opts) => {
        const data: any = {
          videoId: '',
          title: '',
          description: '',
          channelName: '',
          channelId: '',
          publishedAt: '',
          duration: '',
          views: 0,
          likes: 0,
          thumbnailUrl: '',
          transcripts: [],
          availableLanguages: ['en'],
        };

        // Get video ID
        data.videoId = opts.videoId;

        // Extract from ytInitialData
        const scripts = document.querySelectorAll('script');
        let playerResponse: any = null;
        let captions: any = null;

        for (const script of scripts) {
          const content = script.textContent || '';
          
          // Find ytInitialPlayerResponse
          if (content.includes('ytInitialPlayerResponse')) {
            const match = content.match(/ytInitialPlayerResponse\s*=\s*({[^;]+});/);
            if (match) {
              try {
                playerResponse = JSON.parse(match[1]);
              } catch (e) {}
            }
          }

          // Find ytInitialData
          if (content.includes('ytInitialData')) {
            const match = content.match(/ytInitialData\s*=\s*({[^;]+});/);
            if (match) {
              try {
                const ytData = JSON.parse(match[1]);
                
                // Extract title
                const titleRuns = ytData?.videoDetails?.title?.runs?.[0]?.text;
                if (titleRuns) data.title = titleRuns;

                // Extract description
                const descRuns = ytData?.videoDetails?.shortDescription;
                if (descRuns) data.description = descRuns;

                // Extract channel
                const channelRuns = ytData?.videoDetails?.ownerProfileUrl || '';
                const channelMatch = channelRuns.match(/\/channel\/([^/?]+)/);
                if (channelMatch) {
                  data.channelId = channelMatch[1];
                }

                // Extract views
                const viewsText = ytData?.videoDetails?.viewCount;
                if (viewsText) data.views = parseInt(viewsText, 10);

              } catch (e) {}
            }
          }
        }

        // Parse player response for more data
        if (playerResponse) {
          // Title
          if (playerResponse.videoDetails?.title) {
            data.title = playerResponse.videoDetails.title;
          }

          // Channel
          if (playerResponse.videoDetails?.author?.name) {
            data.channelName = playerResponse.videoDetails.author.name;
          }
          if (playerResponse.videoDetails?.author?.channelId) {
            data.channelId = playerResponse.videoDetails.author.channelId;
          }

          // Description
          if (playerResponse.videoDetails?.shortDescription) {
            data.description = playerResponse.videoDetails.shortDescription;
          }

          // Duration
          if (playerResponse.videoDetails?.lengthSeconds) {
            const seconds = parseInt(playerResponse.videoDetails.lengthSeconds, 10);
            data.duration = data.formatDuration(seconds);
          }

          // Views
          if (playerResponse.videoDetails?.viewCount) {
            data.views = parseInt(playerResponse.videoDetails.viewCount, 10);
          }

          // Thumbnail
          if (playerResponse.videoDetails?.thumbnail?.thumbnails) {
            const thumbs = playerResponse.videoDetails.thumbnail.thumbnails;
            if (thumbs.length > 0) {
              data.thumbnailUrl = thumbs[thumbs.length - 1].url;
            }
          }

          // Captions
          if (playerResponse?.captions?.playerCaptionsTracklistRenderer) {
            const captionTracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
            if (captionTracks && captionTracks.length > 0) {
              data.availableLanguages = captionTracks.map((c: any) => c.languageCode);
            }
          }
        }

        // Try to get transcript from page
        try {
          // Look for transcript button and click it
          const transcriptButton = document.querySelector('#secondary button[aria-label="Show transcript"]') 
            || document.querySelector('button[title="Show transcript"]')
            || Array.from(document.querySelectorAll('button')).find((b: any) => b.textContent?.includes('Show transcript'));
          
          // Get transcript segments from page if available
          const transcriptElements = document.querySelectorAll('#segments-container ytd-transcript-segment-renderer, .ytd-transcript-segment-renderer');
          if (transcriptElements.length > 0) {
            const segments: any[] = [];
            transcriptElements.forEach((el: any, index: number) => {
              const timeEl = el.querySelector('.timestamp') || el.querySelector('[class*="time"]');
              const textEl = el.querySelector('.text') || el.querySelector('[class*="text"]');
              
              if (textEl) {
                segments.push({
                  start: index * 5, // Approximate
                  duration: 5,
                  text: textEl.textContent?.trim() || '',
                });
              }
            });
            data.transcripts = segments;
          }
        } catch (e) {
          // Transcript not available on this video
        }

        return data;
      }, { videoId });

      await context.close();
      await this.browser.close();

      // If no transcripts from page, try to fetch from caption URL
      if (result.transcripts.length === 0) {
        const transcriptData = await this.fetchTranscriptFromApi(videoId, options.language || 'en');
        if (transcriptData) {
          result.transcripts = transcriptData;
        }
      }

      return result;

    } catch (error: any) {
      if (this.browser) {
        await this.browser.close();
      }
      
      return {
        videoId,
        title: '',
        description: '',
        channelName: '',
        channelId: '',
        publishedAt: '',
        duration: '',
        views: 0,
        likes: 0,
        thumbnailUrl: '',
        transcripts: [],
        availableLanguages: [],
        error: error.message,
      };
    }
  }

  private async fetchTranscriptFromApi(videoId: string, language: string): Promise<TranscriptSegment[] | null> {
    try {
      // Try to get transcript from ytkids or other endpoints
      const captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${language}&fmt=json3`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(captionUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      if (data.events) {
        return data.events
          .filter((event: any) => event.segs)
          .map((event: any) => ({
            start: event.tStartMs / 1000,
            duration: (event.dDurationMs || 5000) / 1000,
            text: event.segs.map((seg: any) => seg.utf8 || '').join('').trim(),
          }))
          .filter((seg: any) => seg.text.length > 0);
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  extractVideoId(url: string): string | null {
    try {
      const urlObj = new URL(url);
      
      // Standard YouTube URL
      if (urlObj.hostname.includes('youtube.com')) {
        return urlObj.searchParams.get('v');
      }
      
      // YouTube Shorts
      if (urlObj.hostname.includes('youtu.be')) {
        return urlObj.pathname.substring(1);
      }
      
      // YouTube Shorts path
      if (urlObj.pathname.startsWith('/shorts/')) {
        return urlObj.pathname.substring(8).split('?')[0];
      }
      
      return null;
    } catch {
      return null;
    }
  }

  private formatDuration(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Get full transcript as plain text
  getTranscriptText(transcript: TranscriptSegment[]): string {
    return transcript
      .map(seg => `[${this.formatDuration(seg.start)}] ${seg.text}`)
      .join('\n');
  }

  // Get transcript with search capability
  searchTranscript(transcript: TranscriptSegment[], query: string): TranscriptSegment[] {
    const lowerQuery = query.toLowerCase();
    return transcript.filter(seg => seg.text.toLowerCase().includes(lowerQuery));
  }

  // Get transcript segment at specific timestamp
  getSegmentAtTime(transcript: TranscriptSegment[], timestamp: number): TranscriptSegment | null {
    return transcript.find(seg => 
      timestamp >= seg.start && timestamp < seg.start + seg.duration
    ) || null;
  }
}

export const youtubeExtractor = new YouTubeExtractor();
