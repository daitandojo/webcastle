// src/lib/utils/concurrency-pool.ts
import { config } from '../../config/env'
import pLimit from 'p-limit'

export const concurrencyPool = pLimit(config.scraperConcurrent)