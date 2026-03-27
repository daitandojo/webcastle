// src/scrapers/webhook.ts
// Webhook client for async notifications

import { config } from '../config/env';
import crypto from 'crypto';

interface WebhookConfig {
  url: string;
  metadata?: Record<string, any>;
  events?: string[];
}

interface WebhookPayload {
  success: boolean;
  type: string;
  id: string;
  data: any;
  metadata?: Record<string, any>;
  error: string | null;
}

export class WebhookClient {
  private secret: string | undefined;

  constructor() {
    this.secret = config.webhookSecret;
  }

  async send(
    webhookConfig: WebhookConfig,
    eventType: string,
    jobId: string,
    data: any,
    metadata?: Record<string, any>
  ): Promise<void> {
    // Check if we should send this event
    if (webhookConfig.events && !webhookConfig.events.includes(eventType) && 
        !webhookConfig.events.includes(eventType.split('.')[0] + '.*')) {
      return;
    }

    const payload: WebhookPayload = {
      success: true,
      type: eventType,
      id: jobId,
      data,
      metadata: metadata || webhookConfig.metadata,
      error: null,
    };

    try {
      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add signature if secret is configured
      if (this.secret) {
        const signature = crypto
          .createHmac('sha256', this.secret)
          .update(body)
          .digest('hex');
        headers['X-Firecrawl-Signature'] = `sha256=${signature}`;
      }

      // Fire and forget - don't block the main process
      fetch(webhookConfig.url, {
        method: 'POST',
        headers,
        body,
      }).catch((error) => {
        console.error(`Webhook delivery failed for ${eventType}:`, error.message);
      });

    } catch (error: any) {
      console.error(`Failed to send webhook for ${eventType}:`, error.message);
    }
  }

  verifySignature(payload: string, signature: string): boolean {
    if (!this.secret) {
      return true; // No secret configured, skip verification
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');

    // Use timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(signature.replace('sha256=', '')),
      Buffer.from(expectedSignature)
    );
  }
}

export const webhookClient = new WebhookClient();
