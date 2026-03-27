// src/scrapers/llm.ts
// LLM-powered JSON schema extraction via OpenRouter

import { config } from '../config/env';
import { JsonOptions } from './types';

interface LLMRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user';
    content: string;
  }>;
  stream?: boolean;
}

interface LLMResponse {
  message?: {
    content: string;
  };
  content?: string;
  error?: string;
}

export class LLMExtractor {
  private provider: string;
  private model: string;
  private apiKey: string | undefined;

  constructor() {
    this.provider = config.llmProvider;
    this.model = config.llmModel;
    this.apiKey = config.openrouterApiKey;
  }

  async extractJson(content: string, options: JsonOptions): Promise<Record<string, any>> {
    if (this.provider === 'none') {
      return this.simpleExtraction(content, options);
    }

    try {
      const schemaDescription = this.describeSchema(options.schema);
      const systemPrompt = `You are a data extraction assistant. Extract structured data from the following web content based on the provided schema. 
Respond ONLY with valid JSON matching the schema. Do not include any explanations or markdown formatting.

Schema: ${schemaDescription}

${options.prompt ? `Additional instructions: ${options.prompt}` : ''}`;

      const request: LLMRequest = {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: content.substring(0, 50000) },
        ],
      };

      const response = await this.queryOpenRouter(request);

      if (response.error) {
        throw new Error(response.error);
      }

      const contentStr = response.message?.content || response.content || '';
      
      const jsonMatch = contentStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return {};

    } catch (error) {
      console.error('LLM extraction failed:', error);
      return this.simpleExtraction(content, options);
    }
  }

  private async queryOpenRouter(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      return { error: 'OpenRouter API key not configured' };
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://webcastle.ai',
          'X-Title': 'WebCastle',
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { error: `OpenRouter API error: ${response.status} - ${errorText}` };
      }

      const data = await response.json();
      
      if (data.error) {
        return { error: data.error.message || JSON.stringify(data.error) };
      }

      return {
        message: {
          content: data.choices[0]?.message?.content || '',
        },
      };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  private describeSchema(schema?: Record<string, any>): string {
    if (!schema) {
      return 'Extract all available structured data';
    }

    const describeObject = (obj: any, indent = 0): string => {
      if (obj.type === 'object' && obj.properties) {
        const props = Object.entries(obj.properties)
          .map(([key, value]: [string, any]) => {
            const typeDesc = describeValue(value, indent + 2);
            return `  ${key}: ${typeDesc}`;
          })
          .join('\n');
        return `object {\n${props}\n}`;
      }
      return describeValue(obj, indent);
    };

    const describeValue = (value: any, indent: number): string => {
      if (value.type === 'string') return 'string';
      if (value.type === 'number') return 'number';
      if (value.type === 'boolean') return 'boolean';
      if (value.type === 'array') {
        const itemType = value.items ? describeValue(value.items, indent) : 'any';
        return `array of ${itemType}`;
      }
      if (value.type === 'object') {
        return describeObject(value, indent);
      }
      if (value.enum) return `enum: ${value.enum.join(', ')}`;
      return 'any';
    };

    return describeObject(schema);
  }

  private simpleExtraction(content: string, options: JsonOptions): Record<string, any> {
    const result: Record<string, any> = {};
    const schema = options.schema;

    if (!schema || !schema.properties) {
      const titleMatch = content.match(/#{1,6}\s+(.+)/);
      if (titleMatch) {
        result.title = titleMatch[1].trim();
      }

      const priceMatch = content.match(/\$[\d,]+\.?\d*/);
      if (priceMatch) {
        result.price = priceMatch[0].replace('$', '').replace(',', '');
      }

      const emailMatch = content.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        result.email = emailMatch[0];
      }

      const urlMatch = content.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        result.url = urlMatch[0];
      }

      return result;
    }

    for (const [key, prop] of Object.entries(schema.properties)) {
      const propDef = prop as any;
      const patterns: Record<string, RegExp[]> = {
        string: [
          new RegExp(`${key}:\\s*([^\\n]+)`, 'i'),
          new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, 'i'),
        ],
        number: [
          new RegExp(`${key}:\\s*([\\d,]+\\.?\\d*)`, 'i'),
          new RegExp(`\\$([\\d,]+\\.?\\d*)`, 'i'),
        ],
        boolean: [
          new RegExp(`${key}:\\s*(true|false)`, 'i'),
        ],
      };

      const regexes = patterns[propDef.type] || patterns.string;
      
      for (const regex of regexes) {
        const match = content.match(regex);
        if (match) {
          let value: any = match[1] || match[0];
          
          if (propDef.type === 'number') {
            value = parseFloat(value.replace(',', ''));
          } else if (propDef.type === 'boolean') {
            value = value.toLowerCase() === 'true';
          }
          
          result[key] = value;
          break;
        }
      }
    }

    return result;
  }

  async generateSummary(content: string): Promise<string> {
    if (this.provider === 'none') {
      const paragraphs = content.split('\n\n').filter(p => p.trim());
      return paragraphs.slice(0, 3).join('\n\n').substring(0, 500);
    }

    try {
      const systemPrompt = 'You are a summarization assistant. Provide a brief 2-3 sentence summary of the following web content. Focus on the main points and key information.';
      
      const request: LLMRequest = {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: content.substring(0, 30000) },
        ],
      };

      const response = await this.queryOpenRouter(request);

      return response.message?.content || response.content || '';

    } catch (error) {
      console.error('Summary generation failed:', error);
      return '';
    }
  }
}

export const llmExtractor = new LLMExtractor();
