import { Hyperbrowser } from "@hyperbrowser/sdk";
import { connect } from "puppeteer-core";
import type { Browser, Page } from 'puppeteer';

export interface CreateSessionInput {
  profile?: { id?: string; persistChanges?: boolean };
}

export interface NavigateInput {
  sessionId: string;
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  timeout?: number;
}

const client = new Hyperbrowser({
  apiKey: process.env.HYPERBROWSER_API_KEY,
});

export async function createSession({ profile }: CreateSessionInput = {}) {
  const session = await client.sessions.create({
    profile,
    solveCaptchas: true,
    adblock: true,
    annoyances: true,
    trackers: true,
  });
  return { id: session.id, wsEndpoint: session.wsEndpoint };
}

export async function stopSession(sessionId: string) {
  await client.sessions.stop(sessionId);
  return { ok: true };
}

// Helper function to get browser and page from session
async function getBrowserAndPage(sessionId: string): Promise<{ browser: Browser; page: Page }> {
  const session = await client.sessions.get(sessionId);
  const browser = await connect({
    browserWSEndpoint: session.wsEndpoint,
    defaultViewport: null,
  });
  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());
  return { browser, page };
}

export async function navigate({ sessionId, url, waitUntil, timeout }: NavigateInput) {
  try {
    const { browser, page } = await getBrowserAndPage(sessionId);
    
    await page.goto(url, {
      waitUntil: waitUntil || 'networkidle2',
      timeout: timeout || 30000
    });
    
    const title = await page.title();
    const currentUrl = page.url();
    
    await browser.disconnect();
    return {
      success: true,
      title,
      url: currentUrl
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to navigate to ${url}: ${error.message}`
    };
  }
}

export async function clickElement(options: {
  sessionId: string;
  selector: string;
  waitForSelector?: boolean;
  timeout?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(options.sessionId);
    
    if (options.waitForSelector !== false) {
      await page.waitForSelector(options.selector, { 
        timeout: options.timeout || 10000 
      });
    }
    
    await page.click(options.selector);
    await browser.disconnect();
    
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to click element '${options.selector}': ${error.message}`
    };
  }
}

export async function typeText(options: {
  sessionId: string;
  selector: string;
  text: string;
  clear?: boolean;
  delay?: number;
  waitForSelector?: boolean;
  timeout?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(options.sessionId);
    
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
    
    await browser.disconnect();
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to type into '${options.selector}': ${error.message}`
    };
  }
}

export async function takeScreenshot(options: {
  sessionId: string;
  path?: string;
  fullPage?: boolean;
  quality?: number;
}): Promise<{ success: boolean; screenshot?: string; path?: string; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(options.sessionId);
    
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
    await browser.disconnect();
    
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
  sessionId: string;
  selector: string;
  timeout?: number;
  visible?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(options.sessionId);
    
    await page.waitForSelector(options.selector, {
      timeout: options.timeout || 10000,
      visible: options.visible
    });
    
    await browser.disconnect();
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to wait for element '${options.selector}': ${error.message}`
    };
  }
}

export async function getPageInfo(sessionId: string): Promise<{ 
  success: boolean; 
  title?: string; 
  url?: string; 
  error?: string 
}> {
  try {
    const { browser, page } = await getBrowserAndPage(sessionId);
    
    const title = await page.title();
    const url = page.url();
    
    await browser.disconnect();
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
  sessionId: string;
  script: string;
  timeout?: number;
}): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(options.sessionId);
    
    const result = await Promise.race([
      page.evaluate(options.script),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Script timeout')), options.timeout || 10000)
      )
    ]);
    
    await browser.disconnect();
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
  sessionId: string;
  x?: number;
  y?: number;
  selector?: string;
  behavior?: 'auto' | 'smooth';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(options.sessionId);
    
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
    
    await browser.disconnect();
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to scroll: ${error.message}`
    };
  }
}

export async function getText(options: {
  sessionId: string;
  selector: string;
  waitForSelector?: boolean;
  timeout?: number;
}): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(options.sessionId);
    
    if (options.waitForSelector !== false) {
      await page.waitForSelector(options.selector, { 
        timeout: options.timeout || 10000 
      });
    }
    
    const text = await page.$eval(options.selector, (el) => el.textContent?.trim() || '');
    
    await browser.disconnect();
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
  sessionId: string;
  selector: string;
  attribute: string;
  waitForSelector?: boolean;
  timeout?: number;
}): Promise<{ success: boolean; value?: string; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(options.sessionId);
    
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
    
    await browser.disconnect();
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
  sessionId: string;
  selector: string;
  value?: string;
  text?: string;
  index?: number;
  waitForSelector?: boolean;
  timeout?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(options.sessionId);
    
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
    
    await browser.disconnect();
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to select option: ${error.message}`
    };
  }
}

export async function hover(options: {
  sessionId: string;
  selector: string;
  waitForSelector?: boolean;
  timeout?: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(options.sessionId);
    
    if (options.waitForSelector !== false) {
      await page.waitForSelector(options.selector, { 
        timeout: options.timeout || 10000 
      });
    }
    
    await page.hover(options.selector);
    
    await browser.disconnect();
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to hover over '${options.selector}': ${error.message}`
    };
  }
}

export async function pressKey(options: {
  sessionId: string;
  key: string;
  selector?: string;
  modifiers?: string[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(options.sessionId);
    
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
    
    await browser.disconnect();
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to press key '${options.key}': ${error.message}`
    };
  }
}

export async function refresh(sessionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(sessionId);
    await page.reload({ waitUntil: 'networkidle2' });
    await browser.disconnect();
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to refresh page: ${error.message}`
    };
  }
}

export async function goBack(sessionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(sessionId);
    await page.goBack({ waitUntil: 'networkidle2' });
    await browser.disconnect();
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to go back: ${error.message}`
    };
  }
}

export async function goForward(sessionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(sessionId);
    await page.goForward({ waitUntil: 'networkidle2' });
    await browser.disconnect();
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to go forward: ${error.message}`
    };
  }
}

export async function getAllElements(options: {
  sessionId: string;
  selector: string;
  attribute?: string;
  getText?: boolean;
  waitForSelector?: boolean;
  timeout?: number;
}): Promise<{ success: boolean; elements?: any[]; error?: string }> {
  try {
    const { browser, page } = await getBrowserAndPage(options.sessionId);
    
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
    
    await browser.disconnect();
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
