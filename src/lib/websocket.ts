// src/lib/websocket.ts
// WebSocket server for real-time crawl updates

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { jwtAuth } from './auth/jwt';
import { apiKeyStore, ApiKey } from './auth/api-key-store';
import { CrawlJob } from '../scrapers/types';

interface AuthenticatedWebSocket extends WebSocket {
  apiKey?: ApiKey;
  isAlive?: boolean;
}

interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'crawl_update' | 'crawl_complete' | 'crawl_error' | 'ping' | 'pong';
  jobId?: string;
  data?: any;
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private subscriptions = new Map<string, Set<AuthenticatedWebSocket>>();
  private pingInterval: NodeJS.Timeout | null = null;

  initialize(server: Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
    });

    this.wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
      console.log('WebSocket client connecting...');
      
      // Extract token from query string
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      const apiKey = url.searchParams.get('apiKey');

      if (!token && !apiKey) {
        ws.close(4001, 'Authentication required');
        return;
      }

      // Authenticate
      let authResult;
      if (token) {
        authResult = jwtAuth.verifyToken(token);
      } else if (apiKey) {
        authResult = jwtAuth.verifyApiKey(apiKey);
      }

      if (!authResult?.valid || !authResult?.apiKey) {
        ws.close(4001, 'Invalid authentication');
        return;
      }

      ws.apiKey = authResult.apiKey;
      ws.isAlive = true;

      console.log(`WebSocket client connected: ${ws.apiKey.name}`);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });

      ws.on('close', () => {
        console.log(`WebSocket client disconnected: ${ws.apiKey?.name}`);
        // Remove from all subscriptions
        for (const [jobId, clients] of this.subscriptions.entries()) {
          clients.delete(ws);
          if (clients.size === 0) {
            this.subscriptions.delete(jobId);
          }
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        data: {
          message: 'Connected to WebCastle WebSocket',
          clientId: ws.apiKey?.id,
        },
      }));
    });

    // Heartbeat to detect stale connections
    this.pingInterval = setInterval(() => {
      this.wss?.clients.forEach((ws: AuthenticatedWebSocket) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    console.log('WebSocket server initialized');
  }

  private handleMessage(ws: AuthenticatedWebSocket, message: WSMessage): void {
    switch (message.type) {
      case 'subscribe':
        if (message.jobId) {
          this.subscribe(ws, message.jobId);
        }
        break;

      case 'unsubscribe':
        if (message.jobId) {
          this.unsubscribe(ws, message.jobId);
        }
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  }

  private subscribe(ws: AuthenticatedWebSocket, jobId: string): void {
    if (!this.subscriptions.has(jobId)) {
      this.subscriptions.set(jobId, new Set());
    }
    this.subscriptions.get(jobId)!.add(ws);
    
    console.log(`Client subscribed to job: ${jobId}`);
    
    ws.send(JSON.stringify({
      type: 'subscribed',
      jobId,
    }));
  }

  private unsubscribe(ws: AuthenticatedWebSocket, jobId: string): void {
    const clients = this.subscriptions.get(jobId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.subscriptions.delete(jobId);
      }
    }
  }

  emitCrawlUpdate(jobId: string, data: Partial<CrawlJob>): void {
    const clients = this.subscriptions.get(jobId);
    if (!clients) return;

    const message = JSON.stringify({
      type: 'crawl_update',
      jobId,
      data,
    });

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  emitCrawlComplete(jobId: string, data: Partial<CrawlJob>): void {
    const clients = this.subscriptions.get(jobId);
    if (!clients) return;

    const message = JSON.stringify({
      type: 'crawl_complete',
      jobId,
      data,
    });

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        // Unsubscribe after complete
        setTimeout(() => this.unsubscribe(client, jobId), 5000);
      }
    }
  }

  emitCrawlError(jobId: string, error: string): void {
    const clients = this.subscriptions.get(jobId);
    if (!clients) return;

    const message = JSON.stringify({
      type: 'crawl_error',
      jobId,
      data: { error },
    });

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.wss?.clients.forEach((client: AuthenticatedWebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  getConnectionCount(): number {
    return this.wss?.clients.size || 0;
  }

  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.wss?.close();
  }
}

export const wsManager = new WebSocketManager();
