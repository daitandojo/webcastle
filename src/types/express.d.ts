import { Request } from 'express';
import { ApiKey } from '../lib/auth/api-key-store';

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
    }
  }
}

export {};
