// src/scrapers/browser.ts
import { chromium, type Page } from 'playwright'
import { config } from '../config/env'

export class BrowserManager {
  async withStealthPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const browser = await chromium.launch({
      headless: config.playwrightHeadless,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        `--user-agent=${config.scraperUserAgent}`,
      ],
    })

    const context = await browser.newContext({
      viewport: config.playwrightViewport,
      javaScriptEnabled: true,
    })

    if (config.playwrightStealthMode) {
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      })
    }

    const page = await context.newPage()
    try {
      const result = await fn(page)
      return result
    } finally {
      await browser.close()
    }
  }

  async handleConsent(page: Page): Promise<void> {
    const buttons = ['Accept all', 'Allow all', 'Agree', 'Godkend alle', 'I accept']
    for (const text of buttons) {
      try {
        const btn = page.getByRole('button', { name: text }).first()
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click()
          await page.waitForTimeout(500)
        }
      } catch {}
    }
  }

  async navigateWithTimeout(page: Page, url: string, timeoutMs: number = config.playwrightTimeoutMs): Promise<void> {
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: timeoutMs 
    })
  }

  async takeScreenshot(page: Page, fullPage: boolean = true): Promise<Buffer> {
    const screenshot = await page.screenshot({ fullPage })
    return Buffer.from(screenshot)
  }

  async getPageContent(page: Page): Promise<{ html: string, title: string }> {
    const html = await page.content()
    const title = await page.title()
    return { html, title }
  }
}

export const browserManager = new BrowserManager()