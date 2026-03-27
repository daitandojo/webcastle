import { scraperEngine } from './scrapers/engine';

const caps = scraperEngine.getCapabilities();
console.log('Scraping Service Capabilities:');
console.log('Name:', caps.name);
console.log('Version:', caps.version);
console.log('Supported Modes:', caps.supportedModes);
console.log('Capabilities:', caps.capabilities);
console.log('Limits:', caps.limits);