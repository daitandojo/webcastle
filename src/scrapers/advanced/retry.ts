// src/scrapers/advanced/retry.ts
// Retry Logic - Exponential backoff with circuit breaker pattern

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableStatuses: number[];
  retryableErrors: string[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  halfOpenRequests: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  nextAttempt: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailure: number | null = null;
  private nextAttempt = 0;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      successThreshold: config?.successThreshold ?? 2,
      timeoutMs: config?.timeoutMs ?? 30000,
      halfOpenRequests: config?.halfOpenRequests ?? 1,
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() >= this.nextAttempt) {
        this.state = 'half-open';
        this.successes = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.lastFailure = null;

    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'closed';
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.config.timeoutMs;
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.config.timeoutMs;
    }
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      nextAttempt: this.nextAttempt,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
    this.nextAttempt = 0;
  }
}

export class RetryHandler {
  private config: RetryConfig;
  private circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      baseDelayMs: config?.baseDelayMs ?? 1000,
      maxDelayMs: config?.maxDelayMs ?? 30000,
      backoffMultiplier: config?.backoffMultiplier ?? 2,
      jitter: config?.jitter ?? true,
      retryableStatuses: config?.retryableStatuses ?? [408, 429, 500, 502, 503, 504],
      retryableErrors: config?.retryableErrors ?? [
        'ECONNRESET',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ENOTFOUND',
        'ENETUNREACH',
        'EAI_AGAIN',
        'timeout',
        'network',
        'socket',
      ],
    };
  }

  isRetryable(error: any, response?: { status?: number }): boolean {
    if (response?.status && this.config.retryableStatuses.includes(response.status)) {
      return true;
    }

    const errorMessage = error.message?.toLowerCase() || '';
    return this.config.retryableErrors.some(
      (err) => errorMessage.includes(err.toLowerCase())
    );
  }

  async retry<T>(
    operation: () => Promise<T>,
    context?: { url?: string; operationName?: string }
  ): Promise<T> {
    let lastError: Error | null = null;
    const circuitId = context?.url || 'default';
    
    let circuit = this.circuitBreakers.get(circuitId);
    if (!circuit) {
      circuit = new CircuitBreaker();
      this.circuitBreakers.set(circuitId, circuit);
    }

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
        }

        const result = await circuit!.execute(operation);
        return result;
      } catch (error: any) {
        lastError = error;

        if (!this.isRetryable(error)) {
          throw error;
        }

        if (attempt < this.config.maxRetries) {
          console.log(
            `Retry attempt ${attempt + 1}/${this.config.maxRetries} for ${context?.operationName || 'operation'}: ${error.message}`
          );
        }
      }
    }

    throw lastError;
  }

  private calculateDelay(attempt: number): number {
    let delay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);
    delay = Math.min(delay, this.config.maxDelayMs);

    if (this.config.jitter) {
      const jitterAmount = delay * 0.3;
      delay += Math.random() * jitterAmount - jitterAmount / 2;
    }

    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getCircuitBreakerStats(url?: string): Record<string, CircuitBreakerStats> {
    if (url) {
      const circuit = this.circuitBreakers.get(url);
      return circuit ? { [url]: circuit.getStats() } : {};
    }

    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [key, circuit] of this.circuitBreakers) {
      stats[key] = circuit.getStats();
    }
    return stats;
  }

  resetCircuit(url?: string): void {
    if (url) {
      const circuit = this.circuitBreakers.get(url);
      if (circuit) circuit.reset();
    } else {
      for (const circuit of this.circuitBreakers.values()) {
        circuit.reset();
      }
    }
  }
}

export const retryHandler = new RetryHandler();
