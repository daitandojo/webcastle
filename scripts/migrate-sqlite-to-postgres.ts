#!/usr/bin/env ts-node
/**
 * Migration Script: SQLite to PostgreSQL
 * 
 * This script migrates data from the SQLite database to PostgreSQL.
 * Run this ONCE before deploying the new PostgreSQL-based version.
 * 
 * Usage:
 *   ts-node scripts/migrate-sqlite-to-postgres.ts
 * 
 * Prerequisites:
 *   1. PostgreSQL database must be running and accessible
 *   2. Redis must be running
 *   3. .env must have DATABASE_URL and REDIS_URL configured
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../src/config/env';
import { users, credits, purchases, apiKeys, usageLogs } from '../src/lib/db/schema';

const sqlitePath = './data/webcastle.db';

async function migrate() {
  console.log('🔄 Starting SQLite → PostgreSQL migration...\n');

  // Check if SQLite database exists
  let sqlite: Database.Database;
  try {
    sqlite = new Database(sqlitePath);
    console.log('✅ SQLite database found\n');
  } catch (error) {
    console.error('❌ SQLite database not found at', sqlitePath);
    console.log('   Make sure to run this in the project directory with the SQLite DB present.');
    process.exit(1);
  }

  // Connect to PostgreSQL
  const pgClient = postgres(config.databaseUrl, { max: 1 });
  const pg = drizzle(pgClient);

  try {
    // Migrate Users
    console.log('📦 Migrating users...');
    const sqliteUsers = sqlite.prepare(`
      SELECT id, email, password_hash, name, created_at, updated_at, is_admin, is_active
      FROM users
    `).all() as any[];

    for (const user of sqliteUsers) {
      await pg.insert(users).values({
        id: user.id,
        email: user.email,
        passwordHash: user.password_hash,
        name: user.name,
        createdAt: new Date(user.created_at),
        updatedAt: new Date(user.updated_at),
        isAdmin: Boolean(user.is_admin),
        isActive: Boolean(user.is_active),
      }).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${sqliteUsers.length} users`);

    // Migrate Credits
    console.log('📦 Migrating credits...');
    const sqliteCredits = sqlite.prepare(`
      SELECT id, user_id, amount, created_at FROM credits
    `).all() as any[];

    for (const credit of sqliteCredits) {
      await pg.insert(credits).values({
        id: credit.id,
        userId: credit.user_id,
        amount: credit.amount,
        createdAt: new Date(credit.created_at),
      }).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${sqliteCredits.length} credit records`);

    // Migrate Purchases
    console.log('📦 Migrating purchases...');
    const sqlitePurchases = sqlite.prepare(`
      SELECT id, user_id, stripe_session_id, stripe_payment_intent, amount_paid,
             credits_purchased, status, created_at, completed_at
      FROM purchases
    `).all() as any[];

    for (const purchase of sqlitePurchases) {
      await pg.insert(purchases).values({
        id: purchase.id,
        userId: purchase.user_id,
        stripeSessionId: purchase.stripe_session_id,
        stripePaymentIntent: purchase.stripe_payment_intent,
        amountPaid: purchase.amount_paid,
        creditsPurchased: purchase.credits_purchased,
        status: purchase.status,
        createdAt: new Date(purchase.created_at),
        completedAt: purchase.completed_at ? new Date(purchase.completed_at) : null,
      }).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${sqlitePurchases.length} purchases`);

    // Migrate API Keys
    console.log('📦 Migrating API keys...');
    const sqliteApiKeys = sqlite.prepare(`
      SELECT id, user_id, key, name, created_at, last_used_at, is_active, rate_limit_minute, rate_limit_day
      FROM api_keys
    `).all() as any[];

    for (const key of sqliteApiKeys) {
      await pg.insert(apiKeys).values({
        id: key.id,
        userId: key.user_id,
        key: key.key,
        name: key.name,
        createdAt: new Date(key.created_at),
        lastUsedAt: key.last_used_at ? new Date(key.last_used_at) : null,
        isActive: Boolean(key.is_active),
        rateLimitMinute: key.rate_limit_minute,
        rateLimitDay: key.rate_limit_day,
      }).onConflictDoNothing();
    }
    console.log(`   ✅ Migrated ${sqliteApiKeys.length} API keys`);

    // Migrate Usage Logs
    console.log('📦 Migrating usage logs...');
    const sqliteLogs = sqlite.prepare(`
      SELECT id, user_id, api_key_id, endpoint, credits_used, latency_ms, status_code, created_at
      FROM usage_logs
    `).all() as any[];

    // Batch insert for better performance
    const batchSize = 1000;
    for (let i = 0; i < sqliteLogs.length; i += batchSize) {
      const batch = sqliteLogs.slice(i, i + batchSize);
      await pg.insert(usageLogs).values(
        batch.map(log => ({
          id: log.id,
          userId: log.user_id,
          apiKeyId: log.api_key_id,
          endpoint: log.endpoint,
          creditsUsed: log.credits_used,
          latencyMs: log.latency_ms,
          statusCode: log.status_code,
          createdAt: new Date(log.created_at),
        }))
      ).onConflictDoNothing();
      
      if ((i + batchSize) % 10000 === 0) {
        console.log(`   📊 Progress: ${Math.min(i + batchSize, sqliteLogs.length)}/${sqliteLogs.length}`);
      }
    }
    console.log(`   ✅ Migrated ${sqliteLogs.length} usage logs`);

    // Close connections
    sqlite.close();
    await pgClient.end();

    console.log('\n🎉 Migration complete!');
    console.log('\nNext steps:');
    console.log('1. Update your .env with DATABASE_URL and REDIS_URL');
    console.log('2. Deploy the new PostgreSQL-based version');
    console.log('3. Keep the SQLite database as backup until you verify everything works');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    sqlite.close();
    await pgClient.end();
    process.exit(1);
  }
}

migrate();
