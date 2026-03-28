import IORedis from 'ioredis';
import { config } from '../config/env';

const redisOptions = {
  host: config.redisHost || 'localhost',
  port: config.redisPort || 6379,
  password: config.redisPassword || undefined,
  db: config.redisDb || 0,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 3) {
      console.error('[Redis] Max retries reached, giving up');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
};

export const redis = new IORedis(redisOptions);

export const cacheRedis = new IORedis({
  ...redisOptions,
  keyPrefix: 'cache:',
});

export const sessionRedis = new IORedis({
  ...redisOptions,
  keyPrefix: 'session:',
});

export const rateLimitRedis = new IORedis({
  ...redisOptions,
  keyPrefix: 'ratelimit:',
});

export async function initializeRedis() {
  try {
    await redis.connect();
    console.log('[Redis] Connected to', config.redisHost || 'localhost');
  } catch (error) {
    console.error('[Redis] Connection failed:', error);
    throw error;
  }
}

export async function closeRedis() {
  await redis.quit();
  await cacheRedis.quit();
  await sessionRedis.quit();
  await rateLimitRedis.quit();
}

export default redis;
