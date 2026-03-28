import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../../config/env';

const connectionString = config.databaseUrl || 'postgresql://localhost:5432/webcastle';

const queryClient = postgres(connectionString, {
  max: config.nodeEnv === 'production' ? 20 : 5,
});

export const db = drizzle(queryClient);

export async function initializeDatabase() {
  console.log('[DB] PostgreSQL connected');
}

export async function closeDatabase() {
  await queryClient.end();
}
