import { db } from './index';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  createdAt: number;
  updatedAt: number;
  isAdmin: boolean;
  isActive: boolean;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
}

export function createUser(input: CreateUserInput): User {
  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(input.password, 10);
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, name, created_at, updated_at, is_admin, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 0, 1)
  `);

  stmt.run(id, input.email.toLowerCase(), passwordHash, input.name || null, now, now);

  return {
    id,
    email: input.email.toLowerCase(),
    passwordHash,
    name: input.name || null,
    createdAt: now,
    updatedAt: now,
    isAdmin: false,
    isActive: true,
  };
}

export function verifyPassword(user: User, password: string): boolean {
  return bcrypt.compareSync(password, user.passwordHash);
}

export function getUserByEmail(email: string): User | null {
  const stmt = db.prepare(`
    SELECT id, email, password_hash as passwordHash, name, created_at as createdAt, 
           updated_at as updatedAt, is_admin as isAdmin, is_active as isActive
    FROM users WHERE email = ? AND is_active = 1
  `);

  const row = stmt.get(email.toLowerCase()) as any;
  if (!row) return null;

  return {
    ...row,
    isAdmin: Boolean(row.isAdmin),
    isActive: Boolean(row.isActive),
  };
}

export function getUserById(id: string): User | null {
  const stmt = db.prepare(`
    SELECT id, email, password_hash as passwordHash, name, created_at as createdAt, 
           updated_at as updatedAt, is_admin as isAdmin, is_active as isActive
    FROM users WHERE id = ?
  `);

  const row = stmt.get(id) as any;
  if (!row) return null;

  return {
    ...row,
    isAdmin: Boolean(row.isAdmin),
    isActive: Boolean(row.isActive),
  };
}

export function getUserCredits(userId: string): number {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM credits WHERE user_id = ?
  `);
  const result = stmt.get(userId) as { total: number };
  return result.total;
}

export function addCredits(userId: string, amount: number, description?: string): void {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO credits (id, user_id, amount, created_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(id, userId, amount, Date.now());
}

export function deductCredits(userId: string, amount: number): boolean {
  const current = getUserCredits(userId);
  if (current < amount) return false;

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO credits (id, user_id, amount, created_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(id, userId, -amount, Date.now());
  return true;
}

export function createApiKey(userId: string, name: string): { id: string; key: string } {
  const id = uuidv4();
  const key = `wc_${crypto.randomBytes(24).toString('base64url')}`;

  const stmt = db.prepare(`
    INSERT INTO api_keys (id, user_id, key, name, created_at, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  stmt.run(id, userId, key, name, Date.now());

  return { id, key };
}

export function getUserApiKeys(userId: string): any[] {
  const stmt = db.prepare(`
    SELECT id, name, created_at as createdAt, last_used_at as lastUsedAt, 
           is_active as isActive, rate_limit_minute as rateLimitMinute, 
           rate_limit_day as rateLimitDay
    FROM api_keys WHERE user_id = ? ORDER BY created_at DESC
  `);
  return stmt.all(userId);
}

export function verifyApiKey(key: string): { valid: boolean; userId?: string; apiKeyId?: string; credits?: number } {
  const stmt = db.prepare(`
    SELECT ak.id as apiKeyId, ak.user_id as userId, u.is_active as isActive
    FROM api_keys ak
    JOIN users u ON u.id = ak.user_id
    WHERE ak.key = ? AND ak.is_active = 1 AND u.is_active = 1
  `);

  const row = stmt.get(key) as any;
  if (!row) return { valid: false };

  const credits = getUserCredits(row.userId);
  return { valid: true, userId: row.userId, apiKeyId: row.apiKeyId, credits };
}

export function deleteApiKey(userId: string, keyId: string): boolean {
  const stmt = db.prepare(`
    UPDATE api_keys SET is_active = 0 WHERE id = ? AND user_id = ?
  `);
  const result = stmt.run(keyId, userId);
  return result.changes > 0;
}

export function getAllUsers(): any[] {
  const stmt = db.prepare(`
    SELECT u.id, u.email, u.name, u.created_at as createdAt, u.is_admin as isAdmin,
           (SELECT COALESCE(SUM(amount), 0) FROM credits WHERE user_id = u.id) as credits,
           (SELECT COUNT(*) FROM api_keys WHERE user_id = u.id) as apiKeyCount
    FROM users u ORDER BY u.created_at DESC
  `);
  return stmt.all();
}

export function logUsage(userId: string, apiKeyId: string | null, endpoint: string, creditsUsed: number, latencyMs?: number, statusCode?: number): void {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO usage_logs (id, user_id, api_key_id, endpoint, credits_used, latency_ms, status_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, userId, apiKeyId, endpoint, creditsUsed, latencyMs || null, statusCode || null, Date.now());
}

export function getUserUsage(userId: string, days: number = 30): any {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as totalRequests,
      SUM(credits_used) as totalCredits,
      AVG(latency_ms) as avgLatencyMs,
      endpoint
    FROM usage_logs 
    WHERE user_id = ? AND created_at > ?
    GROUP BY endpoint
    ORDER BY totalRequests DESC
  `);

  const byEndpoint = stmt.all(userId, since);

  const summary = db.prepare(`
    SELECT 
      COUNT(*) as totalRequests,
      SUM(credits_used) as totalCredits
    FROM usage_logs 
    WHERE user_id = ? AND created_at > ?
  `).get(userId, since) as any;

  return {
    summary: {
      totalRequests: summary?.totalRequests || 0,
      totalCredits: summary?.totalCredits || 0,
      avgLatencyMs: summary?.avgLatencyMs || 0,
    },
    byEndpoint,
  };
}
