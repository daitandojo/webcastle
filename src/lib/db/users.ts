import { db } from './pg';
import { users, credits, apiKeys, usageLogs, purchases } from './schema';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { eq, sql, and, gt } from 'drizzle-orm';

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

export async function createUser(input: CreateUserInput): Promise<User> {
  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(input.password, 10);
  const now = new Date();

  await db.insert(users).values({
    id,
    email: input.email.toLowerCase(),
    passwordHash,
    name: input.name || null,
    createdAt: now,
    updatedAt: now,
    isAdmin: false,
    isActive: true,
  });

  return {
    id,
    email: input.email.toLowerCase(),
    passwordHash,
    name: input.name || null,
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
    isAdmin: false,
    isActive: true,
  };
}

export function verifyPassword(user: User, password: string): boolean {
  return bcrypt.compareSync(password, user.passwordHash);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await db.select().from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  
  if (!result[0]) return null;
  
  const row = result[0];
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    isAdmin: row.isAdmin,
    isActive: row.isActive,
  };
}

export async function getUserById(id: string): Promise<User | null> {
  const result = await db.select().from(users)
    .where(eq(users.id, id))
    .limit(1);
  
  if (!result[0]) return null;
  
  const row = result[0];
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    isAdmin: row.isAdmin,
    isActive: row.isActive,
  };
}

export async function getUserCredits(userId: string): Promise<number> {
  const result = await db.select({ total: sql<number>`COALESCE(SUM(${credits.amount}), 0)` })
    .from(credits)
    .where(eq(credits.userId, userId));
  
  return Number(result[0]?.total) || 0;
}

export async function addCredits(userId: string, amount: number): Promise<void> {
  const id = uuidv4();
  await db.insert(credits).values({
    id,
    userId,
    amount,
    createdAt: new Date(),
  });
}

export async function deductCredits(userId: string, amount: number): Promise<boolean> {
  const current = await getUserCredits(userId);
  if (current < amount) return false;

  const id = uuidv4();
  await db.insert(credits).values({
    id,
    userId,
    amount: -amount,
    createdAt: new Date(),
  });
  return true;
}

export async function createApiKey(userId: string, name: string): Promise<{ id: string; key: string }> {
  const id = uuidv4();
  const key = `wc_${crypto.randomBytes(24).toString('base64url')}`;

  await db.insert(apiKeys).values({
    id,
    userId,
    key,
    name,
    createdAt: new Date(),
    isActive: true,
    rateLimitMinute: 60,
    rateLimitDay: 5000,
  });

  return { id, key };
}

export async function getUserApiKeys(userId: string): Promise<any[]> {
  const result = await db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    createdAt: apiKeys.createdAt,
    lastUsedAt: apiKeys.lastUsedAt,
    isActive: apiKeys.isActive,
    rateLimitMinute: apiKeys.rateLimitMinute,
    rateLimitDay: apiKeys.rateLimitDay,
  })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(sql`${apiKeys.createdAt} DESC`);
  
  return result.map(r => ({
    ...r,
    createdAt: r.createdAt?.getTime(),
    lastUsedAt: r.lastUsedAt?.getTime(),
  }));
}

export async function verifyApiKey(key: string): Promise<{ valid: boolean; userId?: string; apiKeyId?: string; credits?: number }> {
  const result = await db.select({
    id: apiKeys.id,
    userId: apiKeys.userId,
    isActive: apiKeys.isActive,
    isUserActive: users.isActive,
  })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(
      eq(apiKeys.key, key),
      eq(apiKeys.isActive, true),
      eq(users.isActive, true)
    ))
    .limit(1);

  if (!result[0]) return { valid: false };

  const credits_ = await getUserCredits(result[0].userId);
  return { 
    valid: true, 
    userId: result[0].userId, 
    apiKeyId: result[0].id, 
    credits: credits_ 
  };
}

export async function deleteApiKey(userId: string, keyId: string): Promise<boolean> {
  const result = await db.update(apiKeys)
    .set({ isActive: false })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));
  
  return (result) ? true : false;
}

export async function getAllUsers(): Promise<any[]> {
  const result = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    createdAt: users.createdAt,
    isAdmin: users.isAdmin,
  })
    .from(users)
    .orderBy(sql`${users.createdAt} DESC`);
  
  return result.map(r => ({
    ...r,
    createdAt: r.createdAt?.getTime(),
  }));
}

export async function logUsage(
  userId: string, 
  apiKeyId: string | null, 
  endpoint: string, 
  creditsUsed: number, 
  latencyMs?: number, 
  statusCode?: number
): Promise<void> {
  const id = uuidv4();
  await db.insert(usageLogs).values({
    id,
    userId,
    apiKeyId,
    endpoint,
    creditsUsed,
    latencyMs: latencyMs || null,
    statusCode: statusCode || null,
    createdAt: new Date(),
  });
}

export async function getUserUsage(userId: string, days: number = 30): Promise<any> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const byEndpoint = await db.select({
    endpoint: usageLogs.endpoint,
    totalRequests: sql<number>`COUNT(*)`,
    totalCredits: sql<number>`SUM(${usageLogs.creditsUsed})`,
    avgLatencyMs: sql<number>`AVG(${usageLogs.latencyMs})`,
  })
    .from(usageLogs)
    .where(and(
      eq(usageLogs.userId, userId),
      gt(usageLogs.createdAt, since)
    ))
    .groupBy(usageLogs.endpoint)
    .orderBy(sql`COUNT(*) DESC`);

  const summary = await db.select({
    totalRequests: sql<number>`COUNT(*)`,
    totalCredits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
    avgLatencyMs: sql<number>`AVG(${usageLogs.latencyMs})`,
  })
    .from(usageLogs)
    .where(and(
      eq(usageLogs.userId, userId),
      gt(usageLogs.createdAt, since)
    ));

  return {
    summary: {
      totalRequests: Number(summary[0]?.totalRequests) || 0,
      totalCredits: Number(summary[0]?.totalCredits) || 0,
      avgLatencyMs: Math.round(Number(summary[0]?.avgLatencyMs) || 0),
    },
    byEndpoint: byEndpoint.map(e => ({
      endpoint: e.endpoint,
      totalRequests: Number(e.totalRequests),
      totalCredits: Number(e.totalCredits),
      avgLatencyMs: Math.round(Number(e.avgLatencyMs)),
    })),
  };
}
