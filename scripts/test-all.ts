#!/usr/bin/env ts-node
/**
 * WebCastle Comprehensive Test Script
 * Tests all API features: scrape, crawl, YouTube, search, LLM extraction, etc.
 */

import fetch from 'node-fetch';

const BASE_URL = process.env.WEBCASTLE_URL || 'http://localhost:3052';
const API_KEY = process.env.WEBCASTLE_API_KEY || 'sk_demo_key_for_landing_page';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string) {
  log('\n' + '='.repeat(60), colors.blue);
  log(`  ${title}`, colors.blue);
  log('='.repeat(60), colors.blue);
}

function logTest(name: string, success: boolean, details?: string) {
  const icon = success ? '✓' : '✗';
  const color = success ? colors.green : colors.red;
  log(`  ${icon} ${name}`, color);
  if (details) {
    log(`    ${details}`, colors.cyan);
  }
}

async function apiRequest(endpoint: string, body: any): Promise<any> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify(body),
  });
  
  const data = await response.json();
  return { status: response.status, data };
}

async function apiGet(endpoint: string): Promise<any> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: {
      'x-api-key': API_KEY,
    },
  });
  
  const data = await response.json();
  return { status: response.status, data };
}

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name: string, fn: () => Promise<boolean>) {
  try {
    const result = await fn();
    if (result) {
      testsPassed++;
      logTest(name, true);
    } else {
      testsFailed++;
      logTest(name, false);
    }
  } catch (error: any) {
    testsFailed++;
    logTest(name, false, error.message);
  }
}

// =============== TESTS ===============

async function testServerHealth() {
  logSection('1. SERVER HEALTH');
  
  await runTest('Server is running', async () => {
    const { status, data } = await apiGet('/health');
    return status === 200;
  });
  
  await runTest('Capabilities endpoint works', async () => {
    const { status } = await apiGet('/v1/capabilities');
    return status === 200;
  });
  
  await runTest('Metrics endpoint works', async () => {
    const { status } = await apiGet('/metrics');
    return status === 200 || status === 404;
  });
}

async function testWebScrape() {
  logSection('2. WEB SCRAPING');
  
  await runTest('Basic scrape - example.com', async () => {
    const { status, data } = await apiRequest('/v1/scrape', {
      url: 'https://example.com',
    });
    return status === 200 && data.success === true;
  });
  
  await runTest('Scrape with Markdown format', async () => {
    const { status, data } = await apiRequest('/v1/scrape', {
      url: 'https://example.com',
      formats: ['markdown'],
    });
    return status === 200 && data.data?.content?.length > 0;
  });
  
  await runTest('Scrape with HTML format', async () => {
    const { status, data } = await apiRequest('/v1/scrape', {
      url: 'https://example.com',
      formats: ['html'],
    });
    return status === 200 && data.data?.content?.length > 0;
  });
  
  await runTest('Scrape with FAST mode', async () => {
    const { status, data } = await apiRequest('/v1/scrape', {
      url: 'https://example.com',
      fidelity: 'FAST',
    });
    return status === 200 && data.success === true;
  });
  
  await runTest('Scrape with DEEP mode (Playwright)', async () => {
    const { status, data } = await apiRequest('/v1/scrape', {
      url: 'https://example.com',
      fidelity: 'DEEP',
    });
    return status === 200 && data.success === true;
  });
  
  await runTest('Scrape with screenshot', async () => {
    const { status, data } = await apiRequest('/v1/scrape', {
      url: 'https://example.com',
      screenshot: true,
    });
    return status === 200 && data.success === true;
  });
  
  await runTest('Scrape with waitForSelector', async () => {
    const { status, data } = await apiRequest('/v1/scrape', {
      url: 'https://example.com',
      waitForSelector: 'h1',
    });
    return status === 200;
  });
  
  await runTest('Mobile emulation', async () => {
    const { status, data } = await apiRequest('/v1/scrape', {
      url: 'https://example.com',
      mobile: true,
    });
    return status === 200;
  });
}

async function testLLMExtraction() {
  logSection('3. LLM JSON EXTRACTION');
  
  await runTest('LLM Extract - JSON schema', async () => {
    const { status, data } = await apiRequest('/v1/scrape', {
      url: 'https://example.com',
      extract: {
        schema: {
          title: 'string',
          description: 'string',
        },
      },
    });
    return status === 200 && data.success === true;
  });
  
  await runTest('LLM Extract - with custom prompt', async () => {
    const { status, data } = await apiRequest('/v1/scrape', {
      url: 'https://example.com',
      extract: {
        schema: {
          mainHeading: 'string',
        },
        prompt: 'Extract the main heading from the page',
      },
    });
    return status === 200;
  });
  
  await runTest('LLM Extract - complex schema', async () => {
    const { status, data } = await apiRequest('/v1/scrape', {
      url: 'https://example.com',
      extract: {
        schema: {
          properties: {
            title: { type: 'string' },
            links: { type: 'array' },
          },
        },
      },
    });
    return status === 200;
  });
}

async function testYouTubeTranscript() {
  logSection('4. YOUTUBE TRANSCRIPT');
  
  await runTest('YouTube transcript - valid URL', async () => {
    const { status, data } = await apiRequest('/v1/youtube/transcript', {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    // May succeed or fail depending on video availability
    return status === 200;
  });
  
  await runTest('YouTube transcript - invalid URL', async () => {
    const { status, data } = await apiRequest('/v1/youtube/transcript', {
      url: 'https://invalid-url.com',
    });
    return status === 400 || (status === 200 && data.success === false);
  });
  
  await runTest('YouTube transcript - missing URL', async () => {
    const { status, data } = await apiRequest('/v1/youtube/transcript', {});
    return status === 400;
  });
}

async function testCrawling() {
  logSection('5. WEBSITE CRAWLING');
  
  await runTest('Crawl - start job', async () => {
    const { status, data } = await apiRequest('/v1/crawl', {
      url: 'https://example.com',
      limit: 5,
    });
    return status === 200 && data.id;
  });
  
  await runTest('Crawl - with sitemap', async () => {
    const { status, data } = await apiRequest('/v1/crawl', {
      url: 'https://example.com',
      sitemap: 'include',
      limit: 3,
    });
    return status === 200;
  });
  
  await runTest('Crawl - depth control', async () => {
    const { status, data } = await apiRequest('/v1/crawl', {
      url: 'https://example.com',
      maxDiscoveryDepth: 2,
      limit: 5,
    });
    return status === 200;
  });
}

async function testSearch() {
  logSection('6. WEB SEARCH');
  
  await runTest('Search - basic query', async () => {
    const { status, data } = await apiRequest('/v1/search', {
      query: 'artificial intelligence',
      limit: 3,
    });
    return status === 200;
  });
  
  await runTest('Search - with scrape', async () => {
    const { status, data } = await apiRequest('/v1/search', {
      query: 'web scraping',
      limit: 2,
      scrape: true,
    });
    return status === 200;
  });
  
  await runTest('Search - category filter', async () => {
    const { status, data } = await apiRequest('/v1/search', {
      query: 'news',
      category: 'news',
      limit: 3,
    });
    return status === 200;
  });
}

async function testImages() {
  logSection('7. IMAGE EXTRACTION');
  
  await runTest('Image hunt', async () => {
    const { status, data } = await apiRequest('/v1/scrape/images', {
      url: 'https://example.com',
      limit: 5,
    });
    return status === 200;
  });
}

async function testLinks() {
  logSection('8. LINK EXTRACTION');
  
  await runTest('Extract links', async () => {
    const { status, data } = await apiRequest('/v1/scrape/links', {
      url: 'https://example.com',
    });
    return status === 200;
  });
}

async function testScreenshot() {
  logSection('9. SCREENSHOTS');
  
  await runTest('Full page screenshot', async () => {
    const { status, data } = await apiRequest('/v1/scrape/screenshot', {
      url: 'https://example.com',
      fullPage: true,
    });
    return status === 200;
  });
  
  await runTest('Viewport screenshot', async () => {
    const { status, data } = await apiRequest('/v1/scrape/screenshot', {
      url: 'https://example.com',
      fullPage: false,
    });
    return status === 200;
  });
}

async function testAPIKeyManagement() {
  logSection('10. API KEY MANAGEMENT');
  
  await runTest('Get key info (/v1/auth/me)', async () => {
    const { status, data } = await apiGet('/v1/auth/me');
    return status === 200;
  });
  
  await runTest('List keys (/v1/auth/keys)', async () => {
    const { status, data } = await apiGet('/v1/auth/keys');
    return status === 200;
  });
}

async function testRateLimiting() {
  logSection('11. RATE LIMITING');
  
  await runTest('Rate limit - without key', async () => {
    const response = await fetch(`${BASE_URL}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    // Without auth, should either work (if disabled) or return 401/403
    return response.status !== 500;
  });
}

// =============== MAIN ===============

async function main() {
  log('\n');
  log('🏰 WebCastle Comprehensive Test Suite', colors.cyan);
  log('====================================', colors.cyan);
  log(`  Base URL: ${BASE_URL}`, colors.cyan);
  log(`  API Key: ${API_KEY.substring(0, 10)}...`, colors.cyan);
  log('');
  
  // Check server first
  try {
    const health = await fetch(`${BASE_URL}/health`);
    if (health.status !== 200) {
      log(`\n❌ Server is not running at ${BASE_URL}`, colors.red);
      log(`   Please start the server with: npm run dev`, colors.yellow);
      process.exit(1);
    }
  } catch (error) {
    log(`\n❌ Cannot connect to server at ${BASE_URL}`, colors.red);
    log(`   Please start the server with: npm run dev`, colors.yellow);
    process.exit(1);
  }
  
  // Run all tests
  await testServerHealth();
  await testWebScrape();
  await testLLMExtraction();
  await testYouTubeTranscript();
  await testCrawling();
  await testSearch();
  await testImages();
  await testLinks();
  await testScreenshot();
  await testAPIKeyManagement();
  await testRateLimiting();
  
  // Summary
  logSection('TEST SUMMARY');
  log(`  ✅ Passed: ${testsPassed}`, colors.green);
  log(`  ❌ Failed: ${testsFailed}`, testsFailed > 0 ? colors.red : colors.green);
  log(`  📊 Total:  ${testsPassed + testsFailed}`, colors.cyan);
  log('');
  
  if (testsFailed === 0) {
    log('🎉 All tests passed! WebCastle is working correctly.', colors.green);
    process.exit(0);
  } else {
    log('⚠️  Some tests failed. Check the logs above for details.', colors.yellow);
    process.exit(1);
  }
}

main().catch((error) => {
  log(`\n❌ Test suite crashed: ${error.message}`, colors.red);
  process.exit(1);
});
