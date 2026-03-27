// src/scrapers/branding.ts
// Extract branding information from web pages

import { JSDOM } from 'jsdom';

interface BrandingData {
  colorScheme?: 'light' | 'dark';
  logo?: string;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    textPrimary?: string;
    textSecondary?: string;
    link?: string;
    success?: string;
    warning?: string;
    error?: string;
  };
  fonts?: Array<{ family: string }>;
  typography?: {
    fontFamilies?: {
      primary?: string;
      heading?: string;
      code?: string;
    };
    fontSizes?: Record<string, string>;
    fontWeights?: Record<string, number>;
    lineHeights?: Record<string, string>;
  };
  spacing?: {
    baseUnit?: number;
    borderRadius?: string;
    padding?: Record<string, string>;
    margins?: Record<string, string>;
  };
  components?: {
    buttonPrimary?: Record<string, string>;
    buttonSecondary?: Record<string, string>;
    input?: Record<string, string>;
  };
  icons?: Record<string, string>;
  images?: {
    logo?: string;
    favicon?: string;
    ogImage?: string;
  };
  animations?: Record<string, string>;
  layout?: Record<string, any>;
  personality?: Record<string, string>;
}

export class BrandingExtractor {
  extract(html: string, url: string): BrandingData {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;
    
    const branding: BrandingData = {};
    
    // Extract color scheme
    branding.colorScheme = this.detectColorScheme(document);
    
    // Extract colors
    branding.colors = this.extractColors(document);
    
    // Extract logo
    branding.logo = this.extractLogo(document, url);
    
    // Extract fonts
    branding.fonts = this.extractFonts(document);
    
    // Extract typography
    branding.typography = this.extractTypography(document);
    
    // Extract favicon and OG image
    branding.images = this.extractImages(document, url);
    
    // Extract spacing
    branding.spacing = this.extractSpacing(document);
    
    // Extract component styles
    branding.components = this.extractComponents(document);
    
    return branding;
  }

  private detectColorScheme(document: Document): 'light' | 'dark' | undefined {
    const html = document.documentElement;
    
    // Check for dark mode class
    if (html.classList.contains('dark') || 
        html.classList.contains('dark-mode') ||
        html.getAttribute('data-theme') === 'dark') {
      return 'dark';
    }
    
    // Check meta theme-color
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      const color = themeColor.getAttribute('content') || '';
      // Simple dark color detection
      if (this.isDarkColor(color)) {
        return 'dark';
      }
    }
    
    // Check background color
    const body = document.body;
    if (body) {
      const bgColor = this.getComputedStyle(body, 'background-color');
      if (bgColor && this.isDarkColor(bgColor)) {
        return 'dark';
      }
    }
    
    return 'light';
  }

  private isDarkColor(color: string): boolean {
    // Parse rgb/rgba or hex
    let r = 0, g = 0, b = 0;
    
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      }
    } else if (color.startsWith('rgb')) {
      const match = color.match(/\d+/g);
      if (match && match.length >= 3) {
        r = parseInt(match[0]);
        g = parseInt(match[1]);
        b = parseInt(match[2]);
      }
    }
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  }

  private extractColors(document: Document): BrandingData['colors'] {
    const colors: Record<string, string> = {};
    
    // Get common color variables from CSS
    const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
    let cssText = '';
    
    styles.forEach(style => {
      if (style.textContent) {
        cssText += style.textContent;
      }
    });
    
    // Extract CSS custom properties
    const varRegex = /--([a-z-]+):\s*([^;]+)/g;
    let match;
    
    while ((match = varRegex.exec(cssText)) !== null) {
      const name = match[1].trim();
      const value = match[2].trim();
      
      if (name.includes('color') || name.includes('bg') || name.includes('background')) {
        const key = this.mapCssVarToBrand(name);
        if (key) {
          colors[key] = value;
        }
      }
    }
    
    // Try to find primary colors from common selectors
    const primarySelectors = [
      '[class*="primary"]',
      '[class*="accent"]',
      'a[href]',
      'button',
    ];
    
    for (const selector of primarySelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const el = elements[0] as Element;
        const color = this.getComputedStyle(el as Element, 'color');
        const bgColor = this.getComputedStyle(el as Element, 'background-color');
        
        if (!colors.primary && color && !this.isTransparent(color)) {
          colors.primary = color;
        }
        if (!colors.background && bgColor && !this.isTransparent(bgColor)) {
          colors.background = bgColor;
        }
      }
    }
    
    return Object.keys(colors).length > 0 ? colors : undefined;
  }

  private mapCssVarToBrand(name: string): string | null {
    const mapping: Record<string, string> = {
      'primary-color': 'primary',
      'secondary-color': 'secondary',
      'accent-color': 'accent',
      'background-color': 'background',
      'text-color': 'textPrimary',
      'link-color': 'link',
      'success-color': 'success',
      'warning-color': 'warning',
      'error-color': 'error',
    };
    
    return mapping[name] || null;
  }

  private isTransparent(color: string): boolean {
    return color === 'transparent' || color.startsWith('rgba(0, 0, 0, 0)');
  }

  private extractLogo(document: Document, url: string): string | undefined {
    // Try common logo selectors
    const logoSelectors = [
      '[class*="logo"] img',
      'header img',
      'nav img',
      '[class*="brand"] img',
      'a[class*="logo"]',
    ];
    
    for (const selector of logoSelectors) {
      const logo = document.querySelector(selector);
      if (logo) {
        if (logo.tagName === 'IMG') {
          return (logo as HTMLImageElement).src;
        }
        const img = logo.querySelector('img');
        if (img) {
          return img.src;
        }
        // Maybe it's a link with text
        const text = logo.textContent?.trim();
        if (text) {
          return text;
        }
      }
    }
    
    // Try Open Graph logo
    const ogImage = document.querySelector('meta[property="og:logo"]');
    if (ogImage) {
      return ogImage.getAttribute('content') || undefined;
    }
    
    return undefined;
  }

  private extractFonts(document: Document): Array<{ family: string }> | undefined {
    const fonts = new Set<string>();
    
    // Get fonts from stylesheets
    const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
    styles.forEach(style => {
      const text = style.textContent || '';
      const fontMatches = text.match(/font-family:\s*['"]?([^;'"]+)['"]?/g);
      if (fontMatches) {
        fontMatches.forEach(match => {
          const font = match.split(':')[1]?.trim().replace(/['"]/g, '');
          if (font && font !== 'inherit') {
            fonts.add(font);
          }
        });
      }
    });
    
    // Get from computed style
    const body = document.body;
    if (body) {
      const fontFamily = this.getComputedStyle(body, 'font-family');
      if (fontFamily) {
        fonts.add(fontFamily.split(',')[0].trim().replace(/['"]/g, ''));
      }
    }
    
    const fontList = Array.from(fonts).slice(0, 10).map(f => ({ family: f }));
    return fontList.length > 0 ? fontList : undefined;
  }

  private extractTypography(document: Document): BrandingData['typography'] {
    const typography: any = {};
    
    // Font families
    const body = document.body;
    if (body) {
      const fontFamily = this.getComputedStyle(body, 'font-family');
      if (fontFamily) {
        typography.fontFamilies = {
          primary: fontFamily.split(',')[0].trim().replace(/['"]/g, ''),
        };
      }
      
      // Font sizes for headings
      const headings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
      typography.fontSizes = {};
      
      for (const heading of headings) {
        const el = document.querySelector(heading);
        if (el) {
          const size = this.getComputedStyle(el, 'font-size');
          if (size) {
            typography.fontSizes[heading] = size;
          }
        }
      }
      
      // Font weights
      typography.fontWeights = {
        light: 300,
        regular: 400,
        medium: 500,
        bold: 700,
      };
    }
    
    return Object.keys(typography).length > 0 ? typography : undefined;
  }

  private extractImages(document: Document, url: string): BrandingData['images'] {
    const images: any = {};
    
    // Favicon
    const favicon = document.querySelector('link[rel="icon"]') || 
                    document.querySelector('link[rel="shortcut icon"]');
    if (favicon) {
      const href = favicon.getAttribute('href');
      if (href) {
        images.favicon = href.startsWith('http') ? href : new URL(href, url).href;
      }
    }
    
    // Open Graph image
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
      const content = ogImage.getAttribute('content');
      if (content) {
        images.ogImage = content.startsWith('http') ? content : new URL(content, url).href;
      }
    }
    
    return Object.keys(images).length > 0 ? images : undefined;
  }

  private extractSpacing(document: Document): BrandingData['spacing'] {
    const spacing: any = {};
    
    // Try to get base unit from CSS
    const root = document.documentElement;
    const rootStyle = (root as any).style;
    
    if (rootStyle) {
      // Common spacing variables
      const spacingVars = ['--spacing', '--gap', '--margin', '--padding'];
      for (const varName of spacingVars) {
        const value = rootStyle.getPropertyValue(varName);
        if (value) {
          spacing.baseUnit = parseInt(value) || undefined;
          break;
        }
      }
    }
    
    // Default border radius
    const button = document.querySelector('button');
    if (button) {
      const radius = this.getComputedStyle(button, 'border-radius');
      if (radius) {
        spacing.borderRadius = radius;
      }
    }
    
    return Object.keys(spacing).length > 0 ? spacing : undefined;
  }

  private extractComponents(document: Document): BrandingData['components'] {
    const components: any = {};
    
    // Primary button
    const primaryButton = document.querySelector('button[class*="primary"], button[class*="accent"], .btn-primary, .button-primary');
    if (primaryButton) {
      components.buttonPrimary = {
        background: this.getComputedStyle(primaryButton as Element, 'background-color'),
        textColor: this.getComputedStyle(primaryButton as Element, 'color'),
        borderRadius: this.getComputedStyle(primaryButton as Element, 'border-radius'),
      };
    }
    
    // Input fields
    const input = document.querySelector('input[type="text"], input[type="email"], input[type="search"]');
    if (input) {
      components.input = {
        background: this.getComputedStyle(input as Element, 'background-color'),
        border: this.getComputedStyle(input as Element, 'border'),
        borderRadius: this.getComputedStyle(input as Element, 'border-radius'),
      };
    }
    
    return Object.keys(components).length > 0 ? components : undefined;
  }

  private getComputedStyle(element: Element, property: string): string | null {
    try {
      const style = (element as any).ownerDocument.defaultView?.getComputedStyle(element);
      return style?.[property] || null;
    } catch {
      return null;
    }
  }
}

export const brandingExtractor = new BrandingExtractor();
