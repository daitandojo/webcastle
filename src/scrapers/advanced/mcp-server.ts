// src/scrapers/advanced/mcp-server.ts
// MCP Server - Model Context Protocol for AI agents

import express, { type Request, type Response } from 'express';
import { Server } from 'http';
import { scraperEngine } from '../engine';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface MCPrompt {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class MCPServer {
  private app = express();
  private server: Server | null = null;
  private port: number;

  constructor(port: number = 3053) {
    this.port = port;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.use(express.json());

    // MCP Protocol Endpoints
    
    // Initialize
    this.app.post('/mcp/initialize', async (req: Request, res: Response) => {
      res.json({
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
        serverInfo: {
          name: 'scrapeNet-mcp',
          version: '1.0.0',
        },
      });
    });

    // List tools
    this.app.get('/mcp/tools', async (req: Request, res: Response) => {
      const tools = this.getTools();
      res.json({ tools });
    });

    // Call tool
    this.app.post('/mcp/tools/call', async (req: Request, res: Response) => {
      const { name, arguments: args } = req.body;
      
      try {
        let result: any;
        
        switch (name) {
          case 'scrape_url':
            result = await scraperEngine.scrape({
              url: args.url,
              fidelity: args.fidelity || 'DEEP',
              mode: args.mode || 'CLEAN_TEXT',
              options: args.options || {},
            });
            break;
            
          case 'crawl_website':
            const crawlJob = await scraperEngine.crawl({
              url: args.url,
              limit: args.limit || 10,
              maxDiscoveryDepth: args.depth || 2,
              scrapeOptions: args.options || {},
            });
            result = { jobId: crawlJob.id, status: crawlJob.status };
            break;
            
          case 'search_web':
            result = await scraperEngine.search({
              query: args.query,
              limit: args.limit || 10,
            });
            break;
            
          case 'extract_json':
            result = await scraperEngine.scrape({
              url: args.url,
              fidelity: 'DEEP',
              mode: 'CLEAN_TEXT',
              options: {
                extract: {
                  schema: args.schema,
                  prompt: args.prompt,
                },
              },
            });
            break;
            
          case 'get_crawl_status':
            result = await scraperEngine.getCrawlStatus(args.jobId);
            break;
            
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
        
        res.json({
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        });
      } catch (error: any) {
        res.status(500).json({
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        });
      }
    });

    // List resources
    this.app.get('/mcp/resources', async (req: Request, res: Response) => {
      const resources = this.getResources();
      res.json({ resources });
    });

    // Read resource
    this.app.get('/mcp/resources/:uri', async (req: Request, res: Response) => {
      const uri = req.params.uri;
      
      try {
        let data: any;
        
        if (uri.startsWith('scrape://')) {
          const url = decodeURIComponent(uri.replace('scrape://', ''));
          const result = await scraperEngine.scrape({ url, fidelity: 'DEEP', mode: 'CLEAN_TEXT' });
          data = result;
        } else if (uri.startsWith('crawl://')) {
          const jobId = uri.replace('crawl://', '');
          data = await scraperEngine.getCrawlStatus(jobId);
        }
        
        res.json({
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(data, null, 2),
            },
          ],
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // List prompts
    this.app.get('/mcp/prompts', async (req: Request, res: Response) => {
      const prompts = this.getPrompts();
      res.json({ prompts });
    });

    // Get prompt
    this.app.get('/mcp/prompts/:name', async (req: Request, res: Response) => {
      const name = req.params.name;
      const arguments_ = req.query;
      
      try {
        const prompt = this.renderPrompt(name, arguments_ as Record<string, string>);
        res.json(prompt);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // SSE endpoint for streaming
    this.app.get('/mcp/sse', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      res.write(`data: ${JSON.stringify({ type: 'initialized' })}\n\n`);

      req.on('close', () => {
        res.end();
      });
    });
  }

  private getTools(): MCPTool[] {
    return [
      {
        name: 'scrape_url',
        description: 'Scrape a single URL and return clean content',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to scrape' },
            fidelity: { type: 'string', enum: ['FAST', 'DEEP'], description: 'Scraping fidelity' },
            mode: { type: 'string', enum: ['CLEAN_TEXT', 'FULL_HTML', 'PRECISION_SELECTORS'], description: 'Scraping mode' },
            options: { type: 'object', description: 'Additional options' },
          },
          required: ['url'],
        },
      },
      {
        name: 'crawl_website',
        description: 'Crawl a website starting from a URL',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Starting URL' },
            limit: { type: 'number', description: 'Maximum pages to crawl' },
            depth: { type: 'number', description: 'Maximum discovery depth' },
            options: { type: 'object', description: 'Scrape options' },
          },
          required: ['url'],
        },
      },
      {
        name: 'search_web',
        description: 'Search the web and optionally scrape results',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Maximum results' },
          },
          required: ['query'],
        },
      },
      {
        name: 'extract_json',
        description: 'Extract structured JSON data from a URL using LLM',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to scrape' },
            schema: { type: 'object', description: 'JSON schema to extract' },
            prompt: { type: 'string', description: 'Optional prompt for extraction' },
          },
          required: ['url', 'schema'],
        },
      },
      {
        name: 'get_crawl_status',
        description: 'Get the status of a crawl job',
        inputSchema: {
          type: 'object',
          properties: {
            jobId: { type: 'string', description: 'Job ID from crawl_website' },
          },
          required: ['jobId'],
        },
      },
    ];
  }

  private getResources(): MCPResource[] {
    return [
      {
        uri: 'scrape://example',
        name: 'scrape',
        description: 'Scrape a URL and return content',
        mimeType: 'application/json',
      },
      {
        uri: 'crawl://example',
        name: 'crawl',
        description: 'Crawl a website',
        mimeType: 'application/json',
      },
    ];
  }

  private getPrompts() {
    return [
      {
        name: 'scrape_and_analyze',
        description: 'Scrape a URL and analyze its content',
        arguments: [
          { name: 'url', description: 'URL to scrape' },
          { name: 'analysis_type', description: 'Type of analysis (summary, sentiment, entities)' },
        ],
      },
      {
        name: 'research_topic',
        description: 'Research a topic by searching and scraping relevant pages',
        arguments: [
          { name: 'topic', description: 'Research topic' },
          { name: 'depth', description: 'Depth of research (shallow, medium, deep)' },
        ],
      },
    ];
  }

  private renderPrompt(name: string, args: Record<string, string>) {
    switch (name) {
      case 'scrape_and_analyze':
        return {
          messages: [
            {
              role: 'user',
              content: `Scrape the URL: ${args.url} and provide a ${args.analysis_type || 'summary'} analysis of the content.`,
            },
          ],
        };
        
      case 'research_topic':
        const depthMap: Record<string, number> = { shallow: 3, medium: 5, deep: 10 };
        return {
          messages: [
            {
              role: 'user',
              content: `Research the topic: ${args.topic}. Search for relevant information and scrape up to ${depthMap[args.depth] || 5} pages. Provide a comprehensive summary.`,
            },
          ],
        };
        
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`MCP Server running on port ${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

export const mcpServer = new MCPServer();
