// src/scrapers/interact.ts
// AI-powered browser interaction (Firecrawl Interact feature)

import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';
import { config } from '../config/env';
import { InteractOptions, InteractResponse, ScrapeResult, BrowserProfile } from './types';
import { HtmlProcessor } from './processor';
import { llmExtractor } from './llm';
import { v4 as uuidv4 } from 'uuid';

interface ActiveSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  profile?: BrowserProfile;
  createdAt: number;
  lastActivity: number;
}

export class InteractEngine {
  private sessions = new Map<string, ActiveSession>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired sessions every minute
    this.cleanupInterval = setInterval(() => this.cleanupSessions(), 60000);
  }

  async scrapeAndInteract(
    url: string,
    options?: {
      profile?: BrowserProfile;
      mobile?: boolean;
      waitFor?: number;
    }
  ): Promise<{ scrapeResult: ScrapeResult; scrapeId: string }> {
    const scrapeId = `scrape_${uuidv4()}`;
    
    const browser = await chromium.launch({ 
      headless: config.playwrightHeadless,
      args: ['--no-sandbox'],
    });

    const contextOptions: any = {
      viewport: config.playwrightViewport,
      javaScriptEnabled: true,
    };

    // Mobile emulation
    if (options?.mobile) {
      contextOptions.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15';
      contextOptions.viewport = { width: 390, height: 844 };
    }

    // Load profile if specified
    if (options?.profile) {
      const profilePath = `${config.playwrightProfilesDir}/${options.profile.name}`;
      contextOptions.storageState = profilePath;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    // Store session
    const session: ActiveSession = {
      id: scrapeId,
      browser,
      context,
      page,
      profile: options?.profile,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    this.sessions.set(scrapeId, session);

    try {
      // Navigate to URL
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: config.playwrightTimeoutMs,
      });

      // Wait if specified
      if (options?.waitFor) {
        await page.waitForTimeout(options.waitFor);
      }

      // Get content
      const html = await page.content();
      const title = await page.title();
      const markdown = HtmlProcessor.toMarkdown(html, url);

      const scrapeResult: ScrapeResult = {
        success: true,
        url,
        title,
        content: markdown.content,
        markdown: markdown.content,
        metadata: {
          fidelity: 'DEEP',
          latencyMs: 0,
          wordCount: markdown.content.split(/\s+/).length,
          encoding: 'UTF-8',
          title,
          sourceURL: url,
          scrapeId,
        },
      };

      return { scrapeResult, scrapeId };

    } catch (error: any) {
      // Clean up on error
      await browser.close();
      this.sessions.delete(scrapeId);

      return {
        scrapeResult: {
          success: false,
          url,
          title: '',
          content: '',
          metadata: {
            fidelity: 'DEEP',
            latencyMs: 0,
            wordCount: 0,
            encoding: 'UTF-8',
            scrapeId,
          },
          error: error.message,
        },
        scrapeId,
      };
    }
  }

  async interact(scrapeId: string, options: InteractOptions): Promise<InteractResponse> {
    const session = this.sessions.get(scrapeId);
    
    if (!session) {
      return {
        success: false,
        output: undefined,
        stdout: '',
        stderr: 'Session not found or expired',
        exitCode: 1,
        killed: false,
      };
    }

    // Update last activity
    session.lastActivity = Date.now();

    try {
      if (options.prompt) {
        // AI-powered interaction via prompt
        return await this.interactWithPrompt(session, options);
      } else if (options.code) {
        // Code execution
        return await this.executeCode(session, options);
      } else {
        return {
          success: false,
          output: undefined,
          stdout: '',
          stderr: 'Either prompt or code must be provided',
          exitCode: 1,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        output: undefined,
        stdout: '',
        stderr: error.message,
        exitCode: 1,
      };
    }
  }

  private async interactWithPrompt(session: ActiveSession, options: InteractOptions): Promise<InteractResponse> {
    const { page } = session;
    
    // Get current page state for the AI
    const pageState = await this.getPageState(page);
    
    // Use LLM to interpret the prompt and execute actions
    const prompt = `Current page state:
- URL: ${page.url()}
- Title: ${pageState.title}
- Interactive elements: ${pageState.elements.map(e => `${e.tag}#${e.index}: ${e.text?.substring(0, 50)}`).join('\n')}

User request: ${options.prompt}

Determine what actions to take. Available actions:
- click: Click on an element (use selector like "#id" or "button:nth-child(1)")
- type: Type text into an element
- scroll: Scroll up or down
- extract: Extract content from elements
- wait: Wait for something to happen
- goto: Navigate to a new URL

Respond with a JSON array of actions to take. Each action should have:
{"action": "action_name", "selector": "optional_selector", "value": "optional_value"}`;

    try {
      // Generate actions using LLM
      const actionsJson = await llmExtractor.extractJson(prompt, {
        prompt: 'Extract action commands from this response as JSON array',
        schema: {
          type: 'object',
          properties: {
            actions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  action: { type: 'string' },
                  selector: { type: 'string' },
                  value: { type: 'string' },
                },
              },
            },
          },
        },
      });

      // Execute the actions
      let output = '';
      for (const action of actionsJson.actions || []) {
        await this.executeAction(page, action);
      }

      // Get final page state
      const finalState = await this.getPageState(page);
      output = finalState.content;

      return {
        success: true,
        liveViewUrl: `https://liveview.local/${session.id}`,
        interactiveLiveViewUrl: `https://liveview.local/${session.id}/interactive`,
        output,
        stdout: '',
        stderr: '',
        exitCode: 0,
      };

    } catch (error: any) {
      return {
        success: false,
        output: undefined,
        stdout: '',
        stderr: error.message,
        exitCode: 1,
      };
    }
  }

  private async executeCode(session: ActiveSession, options: InteractOptions): Promise<InteractResponse> {
    const { page, context } = session;
    
    try {
      if (options.language === 'node') {
        // Execute JavaScript in browser context
        const result = await page.evaluate((code) => {
          try {
            // eslint-disable-next-line no-eval
            const fn = eval(code);
            return { success: true, result: typeof fn === 'function' ? fn() : fn };
          } catch (e: any) {
            return { success: false, error: e.message };
          }
        }, options.code);

        return {
          success: result.success,
          liveViewUrl: `https://liveview.local/${session.id}`,
          interactiveLiveViewUrl: `https://liveview.local/${session.id}/interactive`,
          output: undefined,
          stdout: '',
          stderr: result.error || '',
          result: result.result,
          exitCode: result.success ? 0 : 1,
        };

      } else if (options.language === 'python') {
        // Python would require a different runtime
        // For now, return an error
        return {
          success: false,
          output: undefined,
          stdout: '',
          stderr: 'Python execution not yet supported',
          exitCode: 1,
        };

      } else if (options.language === 'bash') {
        // Bash execution - would need agent-browser or similar
        return {
          success: false,
          output: undefined,
          stdout: '',
          stderr: 'Bash execution not yet supported',
          exitCode: 1,
        };
      }

      return {
        success: false,
        output: undefined,
        stdout: '',
        stderr: 'Unknown language',
        exitCode: 1,
      };

    } catch (error: any) {
      return {
        success: false,
        output: undefined,
        stdout: '',
        stderr: error.message,
        exitCode: 1,
      };
    }
  }

  private async executeAction(page: Page, action: any): Promise<void> {
    switch (action.action) {
      case 'click':
        if (action.selector) {
          await page.click(action.selector).catch(() => {});
          await page.waitForTimeout(500);
        }
        break;
      case 'type':
      case 'write':
        if (action.selector && action.value) {
          await page.fill(action.selector, action.value).catch(() => {});
        }
        break;
      case 'scroll':
        if (action.value === 'down' || !action.value) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        } else {
          await page.evaluate(() => window.scrollBy(0, -window.innerHeight));
        }
        await page.waitForTimeout(500);
        break;
      case 'goto':
        if (action.value) {
          await page.goto(action.value, { waitUntil: 'domcontentloaded' });
        }
        break;
      case 'wait':
        await page.waitForTimeout(action.value || 1000);
        break;
    }
  }

  private async getPageState(page: Page): Promise<{ title: string; content: string; elements: Array<{ tag: string; index: number; text: string }> }> {
    const title = await page.title();
    
    const elements = await page.evaluate(() => {
      const interactive = document.querySelectorAll('button, input, select, a[href], [role="button"]');
      return Array.from(interactive).slice(0, 20).map((el, i) => ({
        tag: el.tagName.toLowerCase(),
        index: i,
        text: el.textContent?.substring(0, 100) || '',
      }));
    });

    const content = await page.evaluate(() => document.body.innerText.substring(0, 2000));

    return { title, content, elements };
  }

  async stopInteraction(scrapeId: string): Promise<void> {
    const session = this.sessions.get(scrapeId);
    
    if (session) {
      // Save profile if needed
      if (session.profile?.saveChanges) {
        await this.saveProfile(session);
      }

      await session.browser.close();
      this.sessions.delete(scrapeId);
    }
  }

  private async saveProfile(session: ActiveSession): Promise<void> {
    if (!session.profile) return;

    const profilePath = `${config.playwrightProfilesDir}/${session.profile.name}`;
    
    // Ensure directory exists
    const fs = await import('fs');
    const dir = config.playwrightProfilesDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await session.context.storageState({ path: profilePath });
  }

  private cleanupSessions(): void {
    const now = Date.now();
    const ttl = 10 * 60 * 1000; // 10 minutes
    const inactivityTimeout = 5 * 60 * 1000; // 5 minutes inactivity

    for (const [id, session] of this.sessions.entries()) {
      // Remove sessions that are too old or inactive
      if (now - session.createdAt > ttl || now - session.lastActivity > inactivityTimeout) {
        session.browser.close().catch(() => {});
        this.sessions.delete(id);
      }
    }
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}

export const interactEngine = new InteractEngine();
