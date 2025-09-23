// Safe Browser Automation Tools
// Provides specific, well-defined browser actions instead of arbitrary script execution

import type { Browser, Page } from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getActiveSandbox } from '../sandbox';

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

export async function navigateAndTakeScreenshot(options: {
  url: string;
  path?: string;
  fullPage?: boolean;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  timeout?: number;
  scrollWaitMs?: number;
}): Promise<{ success: boolean; title?: string; url?: string; screenshot?: string; path?: string; error?: string }> {
  try {
    const { page } = await getBrowserInstance();

    // Navigate and wait until page is loaded
    await page.goto(options.url, {
      waitUntil: options.waitUntil || 'networkidle2',
      timeout: options.timeout || 30000,
    });

    // Scroll to bottom to trigger lazy-load/animations and dynamic content
    const pause = options.scrollWaitMs ?? 800;
    try {
      let previousHeight = await page.evaluate(() => document.body.scrollHeight);
      // Perform incremental bottom scroll until no new content is added
      // Limit iterations to prevent infinite loops
      for (let i = 0; i < 25; i++) {
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' }));
        await new Promise(resolve => setTimeout(resolve, pause));
        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        if (newHeight === previousHeight) break;
        previousHeight = newHeight;
      }
    } catch {
      // Ignore scroll errors and proceed to screenshot
    }

    // Prepare screenshot options with sandbox mapping
    const screenshotOptions: any = {
      fullPage: options?.fullPage ?? true,
      encoding: 'base64',
    };

    if (options?.path) {
      const { hostVolumePath, containerVolumePath } = getActiveSandbox();
      const raw = options.path.replace(/\\/g, '/');
      let rel: string;
      if (raw === containerVolumePath || raw.startsWith(containerVolumePath + '/')) {
        rel = raw.slice(containerVolumePath.length).replace(/^\/+/, '');
      } else if (path.isAbsolute(options.path)) {
        rel = path.basename(options.path);
      } else {
        rel = options.path;
      }
      const hostPath = path.resolve(hostVolumePath, rel);
      await fs.mkdir(path.dirname(hostPath), { recursive: true });
      screenshotOptions.path = hostPath;
      screenshotOptions.encoding = undefined;
    }

    const title = await page.title();
    const currentUrl = page.url();
    const screenshot = await page.screenshot(screenshotOptions);

    return {
      success: true,
      title,
      url: currentUrl,
      screenshot: options?.path ? undefined : (screenshot as string),
      path: options?.path,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to navigate and take screenshot: ${error.message}`,
    };
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
      // Map container or relative paths to host volume within sandbox
      const { hostVolumePath, containerVolumePath } = getActiveSandbox();
      const raw = options.path.replace(/\\/g, '/');
      let rel: string;
      if (raw === containerVolumePath || raw.startsWith(containerVolumePath + '/')) {
        rel = raw.slice(containerVolumePath.length).replace(/^\/+/, '');
      } else if (path.isAbsolute(options.path)) {
        // Keep absolute non-container paths as is (best-effort), but prefer sandbox root
        rel = path.basename(options.path);
      } else {
        rel = options.path;
      }
      const hostPath = path.resolve(hostVolumePath, rel);
      await fs.mkdir(path.dirname(hostPath), { recursive: true });
      screenshotOptions.path = hostPath;
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

export async function scrollTo(options: {
  x?: number;
  y?: number;
  selector?: string;
  behavior?: 'auto' | 'smooth';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    
    if (options.selector) {
      // Scroll to element
      await page.evaluate((selector: string) => {
        const element = document.querySelector(selector);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          throw new Error(`Element not found: ${selector}`);
        }
      }, options.selector);
    } else {
      // Scroll to coordinates
      await page.evaluate((x: number | undefined, y: number | undefined, behavior: ScrollBehavior | undefined) => {
        window.scrollTo({ 
          left: x || 0, 
          top: y || 0, 
          behavior: behavior || 'smooth' 
        });
      }, options.x, options.y, options.behavior);
    }
    
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to scroll: ${error.message}`
    };
  }
}

export async function getText(options: {
  selector: string;
  waitForSelector?: boolean;
  timeout?: number;
}): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    
    if (options.waitForSelector !== false) {
      await page.waitForSelector(options.selector, { 
        timeout: options.timeout || 10000 
      });
    }
    
    const text = await page.$eval(options.selector, (el) => el.textContent?.trim() || '');
    
    return {
      success: true,
      text
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to get text from '${options.selector}': ${error.message}`
    };
  }
}

export async function getAttribute(options: {
  selector: string;
  attribute: string;
  waitForSelector?: boolean;
  timeout?: number;
}): Promise<{ success: boolean; value?: string; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    
    if (options.waitForSelector !== false) {
      await page.waitForSelector(options.selector, { 
        timeout: options.timeout || 10000 
      });
    }
    
    const value = await page.$eval(
      options.selector, 
      (el, attr) => el.getAttribute(attr),
      options.attribute
    );
    
    return {
      success: true,
      value: value || undefined
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to get attribute '${options.attribute}' from '${options.selector}': ${error.message}`
    };
  }
}

export async function selectOption(options: {
  selector: string;
  value?: string;
  text?: string;
  index?: number;
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
    
    if (options.value !== undefined) {
      await page.select(options.selector, options.value);
    } else if (options.text !== undefined) {
      await page.evaluate((selector: string, text: string) => {
        const select = document.querySelector(selector) as HTMLSelectElement;
        if (!select) throw new Error(`Select element not found: ${selector}`);
        
        const option = Array.from(select.options).find((opt: HTMLOptionElement) => opt.text === text);
        if (!option) throw new Error(`Option with text '${text}' not found`);
        
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, options.selector, options.text);
    } else if (options.index !== undefined) {
      await page.evaluate((selector: string, index: number) => {
        const select = document.querySelector(selector) as HTMLSelectElement;
        if (!select) throw new Error(`Select element not found: ${selector}`);
        if (index >= select.options.length) throw new Error(`Index ${index} out of bounds`);
        
        select.selectedIndex = index;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, options.selector, options.index);
    } else {
      throw new Error('Must provide value, text, or index');
    }
    
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to select option: ${error.message}`
    };
  }
}

export async function hover(options: {
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
    
    await page.hover(options.selector);
    
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to hover over '${options.selector}': ${error.message}`
    };
  }
}

export async function pressKey(options: {
  key: string;
  selector?: string;
  modifiers?: string[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    
    if (options.selector) {
      await page.focus(options.selector);
    }
    
    if (options.modifiers && options.modifiers.length > 0) {
      // Hold down modifiers
      for (const modifier of options.modifiers) {
        await page.keyboard.down(modifier as any);
      }
      
      await page.keyboard.press(options.key as any);
      
      // Release modifiers
      for (const modifier of options.modifiers.reverse()) {
        await page.keyboard.up(modifier as any);
      }
    } else {
      await page.keyboard.press(options.key as any);
    }
    
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to press key '${options.key}': ${error.message}`
    };
  }
}

export async function refresh(): Promise<{ success: boolean; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    await page.reload({ waitUntil: 'networkidle2' });
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to refresh page: ${error.message}`
    };
  }
}

export async function goBack(): Promise<{ success: boolean; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    await page.goBack({ waitUntil: 'networkidle2' });
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to go back: ${error.message}`
    };
  }
}

export async function goForward(): Promise<{ success: boolean; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    await page.goForward({ waitUntil: 'networkidle2' });
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to go forward: ${error.message}`
    };
  }
}

export async function getAllElements(options: {
  selector: string;
  attribute?: string;
  getText?: boolean;
  waitForSelector?: boolean;
  timeout?: number;
}): Promise<{ success: boolean; elements?: any[]; error?: string }> {
  try {
    const { page } = await getBrowserInstance();
    
    if (options.waitForSelector !== false) {
      await page.waitForSelector(options.selector, { 
        timeout: options.timeout || 10000 
      });
    }
    
    const elements = await page.$$eval(options.selector, (els, attribute, getText) => {
      return els.map((el, index) => {
        const result: any = { index };
        
        if (getText) {
          result.text = el.textContent?.trim() || '';
        }
        
        if (attribute) {
          result.attribute = el.getAttribute(attribute);
        }
        
        // Always include tag name and basic info
        result.tagName = el.tagName.toLowerCase();
        result.id = el.id || undefined;
        result.className = el.className || undefined;
        
        return result;
      });
    }, options.attribute, options.getText);
    
    return {
      success: true,
      elements
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to get elements '${options.selector}': ${error.message}`
    };
  }
}
