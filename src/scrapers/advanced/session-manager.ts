// src/scrapers/advanced/session-manager.ts
// Session Management - Persistent sessions, cookie jars, authenticated crawls

import { type BrowserContext, type Page } from 'playwright';
import crypto from 'crypto';

export interface Session {
  id: string;
  name: string;
  cookies: CookieData[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  createdAt: number;
  lastUsed: number;
  metadata: SessionMetadata;
}

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export interface SessionMetadata {
  userAgent?: string;
  viewport?: { width: number; height: number };
  timezone?: string;
  language?: string;
  ips?: string[];
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private contextToSession = new Map<string, string>();
  private maxSessions = 100;
  private sessionTtlMs = 7 * 24 * 60 * 60 * 1000; // 7 days

  async saveFromContext(context: BrowserContext, name: string, metadata?: SessionMetadata): Promise<string> {
    const cookies = await context.cookies();
    const page = await context.newPage();
    
    const localStorageData = await page.evaluate(() => {
      const data: Record<string, string> = {};
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) data[key] = window.localStorage.getItem(key) || '';
        }
      } catch (e) { /* localStorage not accessible */ }
      return data;
    });

    const sessionStorageData = await page.evaluate(() => {
      const data: Record<string, string> = {};
      try {
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i);
          if (key) data[key] = window.sessionStorage.getItem(key) || '';
        }
      } catch (e) { /* sessionStorage not accessible */ }
      return data;
    });

    const sessionId = this.generateSessionId(name);
    const session: Session = {
      id: sessionId,
      name,
      cookies: cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite as 'Strict' | 'Lax' | 'None',
      })),
      localStorage: localStorageData,
      sessionStorage: sessionStorageData,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      metadata: metadata || {},
    };

    this.sessions.set(sessionId, session);
    this.cleanup();
    
    await page.close();
    return sessionId;
  }

  async applyToContext(context: BrowserContext, sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Apply cookies
    await context.addCookies(session.cookies);

    // Store session ID for reference
    this.contextToSession.set(context.toString(), sessionId);
    
    // Update last used
    session.lastUsed = Date.now();
    
    return true;
  }

  async applyToPage(page: Page, sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Apply cookies to the context
    await this.applyToContext(page.context(), sessionId);

    // Apply localStorage
    await page.addInitScript(() => {
      // @ts-ignore
      window.__sessionStorageData = arguments[0];
    }, session.localStorage);

    // Apply sessionStorage
    await page.addInitScript(() => {
      // @ts-ignore
      const data = window.__sessionStorageData;
      if (data) {
        Object.keys(data).forEach(key => {
          sessionStorage.setItem(key, data[key]);
        });
      }
    }, session.sessionStorage);

    return true;
  }

  get(sessionId: string): Session | null {
    return this.sessions.get(sessionId) || null;
  }

  list(): Session[] {
    return Array.from(this.sessions.values()).map(s => ({
      ...s,
      cookies: s.cookies.map(c => ({ ...c, value: '***' })), // Hide values
    }));
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  updateMetadata(sessionId: string, metadata: Partial<SessionMetadata>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    session.metadata = { ...session.metadata, ...metadata };
    return true;
  }

  private generateSessionId(name: string): string {
    const hash = crypto.createHash('md5').update(`${name}-${Date.now()}`).digest('hex');
    return `session_${hash.substring(0, 16)}`;
  }

  private cleanup(): void {
    if (this.sessions.size <= this.maxSessions) return;

    const now = Date.now();
    const sessions = Array.from(this.sessions.entries())
      .map(([id, session]) => ({ id, lastUsed: session.lastUsed }))
      .sort((a, b) => a.lastUsed - b.lastUsed);

    const toDelete = sessions.slice(0, sessions.length - this.maxSessions);
    for (const { id } of toDelete) {
      this.sessions.delete(id);
    }
  }

  clearExpired(): number {
    const now = Date.now();
    let deleted = 0;
    
    for (const [id, session] of this.sessions) {
      if (now - session.lastUsed > this.sessionTtlMs) {
        this.sessions.delete(id);
        deleted++;
      }
    }
    
    return deleted;
  }

  getStats() {
    return {
      totalSessions: this.sessions.size,
      maxSessions: this.maxSessions,
      oldestSession: Math.min(...Array.from(this.sessions.values()).map(s => s.createdAt)),
      newestSession: Math.max(...Array.from(this.sessions.values()).map(s => s.createdAt)),
    };
  }
}

export const sessionManager = new SessionManager();
