// src/scrapers/advanced/session-manager.ts
// Session Management - Redis-backed persistent sessions, cookie jars, authenticated crawls

import { type BrowserContext, type Page } from 'playwright';
import crypto from 'crypto';
import { sessionRedis } from '../../lib/redis';

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
  private maxSessions = 100;
  private sessionTtlMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  private sessionKeyPrefix = 'session';

  private getKey(sessionId: string): string {
    return `${this.sessionKeyPrefix}:${sessionId}`;
  }

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

    await sessionRedis.setex(
      this.getKey(sessionId),
      Math.ceil(this.sessionTtlMs / 1000),
      JSON.stringify(session)
    );

    await this.cleanup();
    await page.close();
    return sessionId;
  }

  async applyToContext(context: BrowserContext, sessionId: string): Promise<boolean> {
    const session = await this.get(sessionId);
    if (!session) return false;

    await context.addCookies(session.cookies);
    await sessionRedis.setex(
      `${this.sessionKeyPrefix}:ctx:${context.toString()}`,
      Math.ceil(this.sessionTtlMs / 1000),
      sessionId
    );
    
    return true;
  }

  async applyToPage(page: Page, sessionId: string): Promise<boolean> {
    const session = await this.get(sessionId);
    if (!session) return false;

    await this.applyToContext(page.context(), sessionId);

    await page.addInitScript(() => {
      // @ts-ignore
      window.__sessionStorageData = arguments[0];
    }, session.localStorage);

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

  async get(sessionId: string): Promise<Session | null> {
    const data = await sessionRedis.get(this.getKey(sessionId));
    if (!data) return null;
    
    try {
      const session = JSON.parse(data) as Session;
      return session;
    } catch {
      return null;
    }
  }

  async list(): Promise<Session[]> {
    const keys = await sessionRedis.keys(`${this.sessionKeyPrefix}:session_*`);
    const sessions: Session[] = [];
    
    for (const key of keys) {
      const data = await sessionRedis.get(key);
      if (data) {
        try {
          const session = JSON.parse(data) as Session;
          sessions.push({
            ...session,
            cookies: session.cookies.map(c => ({ ...c, value: '***' })),
          });
        } catch {}
      }
    }
    
    return sessions;
  }

  async delete(sessionId: string): Promise<boolean> {
    const result = await sessionRedis.del(this.getKey(sessionId));
    return result > 0;
  }

  async updateMetadata(sessionId: string, metadata: Partial<SessionMetadata>): Promise<boolean> {
    const session = await this.get(sessionId);
    if (!session) return false;
    
    session.metadata = { ...session.metadata, ...metadata };
    await sessionRedis.setex(
      this.getKey(sessionId),
      Math.ceil(this.sessionTtlMs / 1000),
      JSON.stringify(session)
    );
    return true;
  }

  private generateSessionId(name: string): string {
    const hash = crypto.createHash('md5').update(`${name}-${Date.now()}-${Math.random()}`).digest('hex');
    return `session_${hash.substring(0, 16)}`;
  }

  private async cleanup(): Promise<void> {
    const keys = await sessionRedis.keys(`${this.sessionKeyPrefix}:session_*`);
    if (keys.length <= this.maxSessions) return;

    const sessions: { id: string; lastUsed: number }[] = [];
    for (const key of keys) {
      const data = await sessionRedis.get(key);
      if (data) {
        try {
          const session = JSON.parse(data) as Session;
          sessions.push({ id: session.id, lastUsed: session.lastUsed });
        } catch {}
      }
    }

    sessions.sort((a, b) => a.lastUsed - b.lastUsed);
    const toDelete = sessions.slice(0, sessions.length - this.maxSessions);
    
    for (const { id } of toDelete) {
      await this.delete(id);
    }
  }

  async clearExpired(): Promise<number> {
    const keys = await sessionRedis.keys(`${this.sessionKeyPrefix}:session_*`);
    let deleted = 0;
    const now = Date.now();
    
    for (const key of keys) {
      const data = await sessionRedis.get(key);
      if (data) {
        try {
          const session = JSON.parse(data) as Session;
          if (now - session.lastUsed > this.sessionTtlMs) {
            await sessionRedis.del(key);
            deleted++;
          }
        } catch {}
      }
    }
    
    return deleted;
  }

  async getStats() {
    const keys = await sessionRedis.keys(`${this.sessionKeyPrefix}:session_*`);
    return {
      totalSessions: keys.length,
      maxSessions: this.maxSessions,
    };
  }
}

export const sessionManager = new SessionManager();
