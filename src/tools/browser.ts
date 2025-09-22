// Safe Browser Automation Tools
// Provides specific, well-defined browser actions instead of arbitrary script execution

import type { Browser, Page } from 'puppeteer';

// Global browser instance management
let globalBrowser: Browser | null = null;
let globalPage: Page | null = null;

async function getBrowserInstance(): Promise<{ browser: Browser; page: Page }> {
  const puppeteer = await import('puppeteer');
  
  if (!globalBrowser || !globalBrowser.isConnected()) {
    globalBrowser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }
  
  if (!globalPage || globalPage.isClosed()) {
    globalPage = await globalBrowser.newPage();
    
    // Set up error handlers
    globalPage.on('error', (err) => {
      console.warn('Browser page error:', err.message);
    });
    
    globalPage.on('pageerror', (err) => {
      console.warn('Browser page script error:', err.message);
    });
  }
  
  return { browser: globalBrowser, page: globalPage };
}

export async function closeBrowser(): Promise<{ success: boolean; error?: string }> {
  try {
    if (globalPage && !globalPage.isClosed()) {
      await globalPage.close();
      globalPage = null;
    }
    if (globalBrowser && globalBrowser.isConnected()) {
      await globalBrowser.close();
      globalBrowser = null;
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function goToPage(options: {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  timeout?: number;
}): Promise<{ success: boolean; title?: string; url?: string; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    
    await page.goto(options.url, {
      waitUntil: options.waitUntil || 'networkidle2',
      timeout: options.timeout || 30000
    });
    
    const title = await page.title();
    const currentUrl = page.url();
    
    return {
      success: true,
      title,
      url: currentUrl
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to navigate to ${options.url}: ${error.message}`
    };
  }
}

export async function clickElement(options: {
  selector: string;
  waitForSelector?: boolean;
  timeout?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    
    if (options.waitForSelector !== false) {
      await page.waitForSelector(options.selector, { 
        timeout: options.timeout || 10000 
      });
    }
    
    await page.click(options.selector);
    
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to click element '${options.selector}': ${error.message}`
    };
  }
}

export async function typeText(options: {
  selector: string;
  text: string;
  clear?: boolean;
  delay?: number;
  waitForSelector?: boolean;
  timeout?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    
    if (options.waitForSelector !== false) {
      await page.waitForSelector(options.selector, { 
        timeout: options.timeout || 10000 
      });
    }
    
    if (options.clear) {
      await page.click(options.selector, { clickCount: 3 }); // Select all
    }
    
    await page.type(options.selector, options.text, {
      delay: options.delay || 0
    });
    
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to type into '${options.selector}': ${error.message}`
    };
  }
}

export async function takeScreenshot(options?: {
  path?: string;
  fullPage?: boolean;
  quality?: number;
}): Promise<{ success: boolean; screenshot?: string; path?: string; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    
    const screenshotOptions: any = {
      fullPage: options?.fullPage || false,
      encoding: 'base64'
    };
    
    if (options?.path) {
      screenshotOptions.path = options.path;
      screenshotOptions.encoding = undefined;
    }
    
    if (options?.quality && options.path?.endsWith('.jpg')) {
      screenshotOptions.quality = options.quality;
    }
    
    const screenshot = await page.screenshot(screenshotOptions);
    
    return {
      success: true,
      screenshot: options?.path ? undefined : screenshot as string,
      path: options?.path
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to take screenshot: ${error.message}`
    };
  }
}

export async function waitForElement(options: {
  selector: string;
  timeout?: number;
  visible?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    
    await page.waitForSelector(options.selector, {
      timeout: options.timeout || 10000,
      visible: options.visible
    });
    
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to wait for element '${options.selector}': ${error.message}`
    };
  }
}

export async function getPageInfo(): Promise<{ 
  success: boolean; 
  title?: string; 
  url?: string; 
  error?: string 
}> {
  try {
    const { page } = await getBrowserInstance();
    
    const title = await page.title();
    const url = page.url();
    
    return {
      success: true,
      title,
      url
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to get page info: ${error.message}`
    };
  }
}

export async function evaluateScript(options: {
  script: string;
  timeout?: number;
}): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    
    const result = await Promise.race([
      page.evaluate(options.script),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Script timeout')), options.timeout || 10000)
      )
    ]);
    
    return {
      success: true,
      result
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Script evaluation failed: ${error.message}`
    };
  }
}
