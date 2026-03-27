// src/lib/utils/resilient-fetch.ts
import { backOff, BackoffOptions } from 'exponential-backoff'

const logger = {
  info: (...a: any[]) => console.log('[INFO]', ...a),
  warn: (...a: any[]) => console.warn('[WARN]', ...a),
  error: (...a: any[]) => console.error('[ERROR]', ...a),
}

export async function resilientFetch(
  input: RequestInfo,
  init?: RequestInit
): Promise<Response> {
  const opts: BackoffOptions = {
    startingDelay: 300,
    maxDelay: 10_000,
    numOfAttempts: 4,
    retry: (e: Error) => e.message.startsWith('HTTP') || e.message.includes('fetch'),
  }
  return backOff(async () => {
    const res = await fetch(input, init)
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    return res
  }, opts)
}

export default resilientFetch