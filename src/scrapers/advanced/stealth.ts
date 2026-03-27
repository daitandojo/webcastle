// src/scrapers/advanced/stealth.ts
// Enhanced Stealth - Browser fingerprint randomization to defeat anti-bot detection

import { type BrowserContext, type Browser, chromium, firefox, webkit } from 'playwright';

export interface StealthConfig {
  canvasNoise: boolean;
  webglNoise: boolean;
  audioNoise: boolean;
  timezoneId: string;
  locale: string;
  viewport: { width: number; height: number };
  userAgent: string;
  deviceScaleFactor: number;
  hasTouch: boolean;
  colorScheme: 'light' | 'dark' | 'no-preference';
  languages: string[];
  platform: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  screenWidth: number;
  screenHeight: number;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
];

const LOCALES = [
  'en-US',
  'en-GB',
  'en-CA',
  'en-AU',
  'fr-FR',
  'de-DE',
  'es-ES',
  'ja-JP',
  'zh-CN',
  'zh-TW',
  'ko-KR',
  'pt-BR',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1200 },
  { width: 2560, height: 1440 },
];

const LANGUAGES = [
  ['en-US', 'en'],
  ['en-GB', 'en'],
  ['en-US', 'en', 'es'],
  ['en-US', 'en', 'zh'],
  ['fr-FR', 'fr'],
  ['de-DE', 'de'],
  ['ja-JP', 'ja'],
];

export class StealthBrowser {
  private config: Partial<StealthConfig> = {};

  randomize(config?: Partial<StealthConfig>): StealthConfig {
    const randomized: StealthConfig = {
      canvasNoise: config?.canvasNoise ?? true,
      webglNoise: config?.webglNoise ?? true,
      audioNoise: config?.audioNoise ?? true,
      timezoneId: config?.timezoneId ?? this.randomFromArray(TIMEZONES),
      locale: config?.locale ?? this.randomFromArray(LOCALES),
      viewport: config?.viewport ?? this.randomFromArray(VIEWPORTS),
      userAgent: config?.userAgent ?? this.randomFromArray(USER_AGENTS),
      deviceScaleFactor: config?.deviceScaleFactor ?? this.randomChoice([1, 1.25, 1.5, 1.75, 2]),
      hasTouch: config?.hasTouch ?? false,
      colorScheme: config?.colorScheme ?? this.randomFromArray(['light', 'dark', 'no-preference']),
      languages: config?.languages ?? this.randomFromArray(LANGUAGES),
      platform: config?.platform ?? this.randomFromArray(['Win32', 'MacIntel', 'Linux x86_64']),
      hardwareConcurrency: config?.hardwareConcurrency ?? this.randomChoice([4, 6, 8, 12, 16]),
      deviceMemory: config?.deviceMemory ?? this.randomChoice([4, 8, 16]),
      screenWidth: config?.screenWidth ?? this.randomChoice([1920, 1440, 1536, 1366, 1280, 2560]),
      screenHeight: config?.screenHeight ?? this.randomChoice([1080, 900, 864, 768, 800, 720, 1440, 1200]),
    };
    
    this.config = randomized;
    return randomized;
  }

  private randomFromArray<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async createContext(options?: {
    browser?: Browser;
    proxy?: { server: string; username?: string; password?: string };
  }): Promise<BrowserContext> {
    const stealth = this.randomize();
    const browser = options?.browser || await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    });

    const contextOptions: any = {
      viewport: stealth.viewport,
      userAgent: stealth.userAgent,
      deviceScaleFactor: stealth.deviceScaleFactor,
      hasTouch: stealth.hasTouch,
      locale: stealth.locale,
      timezoneId: stealth.timezoneId,
      colorScheme: stealth.colorScheme,
      languages: stealth.languages,
      permissions: ['geolocation'],
      ignoreHTTPSErrors: true,
    };

    if (options?.proxy) {
      contextOptions.proxy = options.proxy;
    }

    const context = await browser.newContext(contextOptions);

    await context.addInitScript(() => {
      // Override navigator properties
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });

      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' },
        ],
        configurable: true,
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
        configurable: true,
      });

      // Remove automation detection
      if ((window as any).chrome) {
        (window as any).chrome.runtime = { connect: () => {}, id: '' };
      }
    });

    return context;
  }

  getCurrentConfig(): StealthConfig | null {
    return this.config as StealthConfig;
  }
}

export const stealthBrowser = new StealthBrowser();
