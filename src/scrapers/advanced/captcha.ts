// src/scrapers/advanced/captcha.ts
// CAPTCHA Handling - Integration with CAPTCHA solving services

export interface CaptchaConfig {
  provider: '2captcha' | 'anticaptcha' | 'capmonster' | 'none';
  apiKey: string;
  timeoutMs: number;
  retryAttempts: number;
}

export interface CaptchaSolution {
  solution: string;
  captchaId: string;
  provider: string;
}

export type CaptchaType = 'image' | 'recaptcha-v2' | 'recaptcha-v3' | 'hcaptcha' | 'turnstile';

export class CaptchaSolver {
  private config: CaptchaConfig;

  constructor(config?: Partial<CaptchaConfig>) {
    this.config = {
      provider: config?.provider || 'none',
      apiKey: config?.apiKey || '',
      timeoutMs: config?.timeoutMs || 120000,
      retryAttempts: config?.retryAttempts || 3,
    };
  }

  isConfigured(): boolean {
    return this.config.provider !== 'none' && !!this.config.apiKey;
  }

  async solve(type: CaptchaType, data: { siteUrl: string; siteKey?: string; image?: string }): Promise<CaptchaSolution | null> {
    if (!this.isConfigured()) {
      console.log('CAPTCHA solver not configured');
      return null;
    }

    try {
      switch (type) {
        case 'recaptcha-v2':
          return await this.solveReCaptchaV2(data.siteUrl, data.siteKey!);
        case 'recaptcha-v3':
          return await this.solveReCaptchaV3(data.siteUrl, data.siteKey!);
        case 'hcaptcha':
          return await this.solveHCaptcha(data.siteUrl, data.siteKey!);
        case 'turnstile':
          return await this.solveTurnstile(data.siteUrl, data.siteKey!);
        default:
          console.log(`Unsupported CAPTCHA type: ${type}`);
          return null;
      }
    } catch (error) {
      console.error('CAPTCHA solving failed:', error);
      return null;
    }
  }

  private async solveReCaptchaV2(siteUrl: string, siteKey: string): Promise<CaptchaSolution | null> {
    const captchaId = await this.submitCaptcha({
      method: 'userrecaptcha',
      googlekey: siteKey,
      pageurl: siteUrl,
    });

    if (!captchaId) return null;

    return await this.waitForSolution(captchaId);
  }

  private async solveReCaptchaV3(siteUrl: string, siteKey: string): Promise<CaptchaSolution | null> {
    const captchaId = await this.submitCaptcha({
      method: 'userrecaptcha',
      googlekey: siteKey,
      pageurl: siteUrl,
      version: 'v3',
      action: 'verify',
      minScore: 0.3,
    });

    if (!captchaId) return null;

    return await this.waitForSolution(captchaId);
  }

  private async solveHCaptcha(siteUrl: string, siteKey: string): Promise<CaptchaSolution | null> {
    const captchaId = await this.submitCaptcha({
      method: 'hcaptcha',
      sitekey: siteKey,
      pageurl: siteUrl,
    });

    if (!captchaId) return null;

    return await this.waitForSolution(captchaId);
  }

  private async solveTurnstile(siteUrl: string, siteKey: string): Promise<CaptchaSolution | null> {
    const captchaId = await this.submitCaptcha({
      method: 'turnstile',
      sitekey: siteKey,
      pageurl: siteUrl,
    });

    if (!captchaId) return null;

    return await this.waitForSolution(captchaId);
  }

  private async submitCaptcha(params: Record<string, any>): Promise<string | null> {
    const provider = this.config.provider;
    let submitUrl = '';
    let responseKey = 'captchaId';

    switch (provider) {
      case '2captcha':
        submitUrl = 'https://2captcha.com/in.php';
        responseKey = 'captchaId';
        break;
      case 'anticaptcha':
        submitUrl = 'https://api.anti-captcha.com/createTask';
        responseKey = 'taskId';
        break;
      case 'capmonster':
        submitUrl = 'https://api.capmonster.cloud/createTask';
        responseKey = 'taskId';
        break;
      default:
        return null;
    }

    try {
      const formData = new URLSearchParams();
      formData.append('key', this.config.apiKey);
      
      for (const [key, value] of Object.entries(params)) {
        formData.append(key, String(value));
      }

      const response = await fetch(submitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      const result = await response.text();

      if (result.startsWith('OK|')) {
        return result.substring(3);
      }

      console.log(`CAPTCHA submission failed: ${result}`);
      return null;
    } catch (error) {
      console.error('CAPTCHA submission error:', error);
      return null;
    }
  }

  private async waitForSolution(captchaId: string): Promise<CaptchaSolution | null> {
    const provider = this.config.provider;
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.timeoutMs) {
      try {
        let checkUrl = '';
        switch (provider) {
          case '2captcha':
            checkUrl = `https://2captcha.com/res.php?key=${this.config.apiKey}&action=get&id=${captchaId}`;
            break;
          case 'anticaptcha':
          case 'capmonster':
            checkUrl = JSON.stringify({
              clientKey: this.config.apiKey,
              taskId: captchaId,
            });
            break;
        }

        const response = await fetch(checkUrl, { method: 'POST' });
        const result = await response.text();

        if (provider === '2captcha') {
          if (result === 'CAPCHA_NOT_READY') {
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          if (result.startsWith('OK|')) {
            return {
              solution: result.substring(3),
              captchaId,
              provider,
            };
          }
        } else {
          const data = JSON.parse(result);
          if (data.status === 'ready') {
            return {
              solution: data.solution?.gRecaptchaResponse || data.solution?.token || '',
              captchaId,
              provider,
            };
          }
          if (data.errorId > 0) {
            console.error('CAPTCHA API error:', data.errorCode, data.errorDescription);
            return null;
          }
          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (error) {
        console.error('CAPTCHA check error:', error);
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    console.log('CAPTCHA solving timed out');
    return null;
  }

  async detectAndSolve(page: any): Promise<boolean> {
    // Check for reCAPTCHA v2
    const recaptchaV2 = await page.$('.g-recaptcha[data-sitekey]');
    if (recaptchaV2) {
      const siteKey = await recaptchaV2.getAttribute('data-sitekey');
      const siteUrl = page.url();
      const solution = await this.solve('recaptcha-v2', { siteUrl, siteKey: siteKey! });
      if (solution) {
        await page.evaluate((token: string) => {
          const el = document.querySelector('[name="g-recaptcha-response"]');
          if (el) (el as HTMLTextAreaElement).value = token;
          const btn = document.querySelector('[data-sitekey]');
          if (btn) (btn as HTMLElement).click();
        }, solution.solution);
        return true;
      }
    }

    // Check for hCaptcha
    const hcaptcha = await page.$('[data-sitekey]');
    if (hcaptcha) {
      const siteKey = await hcaptcha.getAttribute('data-sitekey');
      const siteUrl = page.url();
      const solution = await this.solve('hcaptcha', { siteUrl, siteKey: siteKey! });
      if (solution) {
        await page.evaluate((token: string) => {
          const el = document.querySelector('[name="h-captcha-response"]');
          if (el) (el as HTMLTextAreaElement).value = token;
        }, solution.solution);
        return true;
      }
    }

    // Check for Cloudflare Turnstile
    const turnstile = await page.$('.cf-turnstile');
    if (turnstile) {
      const siteKey = await turnstile.getAttribute('data-sitekey');
      const siteUrl = page.url();
      const solution = await this.solve('turnstile', { siteUrl, siteKey: siteKey! });
      if (solution) {
        await page.evaluate((token: string) => {
          const el = document.querySelector('[name="cf-turnstile-response"]');
          if (el) (el as HTMLTextAreaElement).value = token;
        }, solution.solution);
        return true;
      }
    }

    return false;
  }
}

export const captchaSolver = new CaptchaSolver();
