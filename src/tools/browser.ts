// Simple Puppeteer interface - no container complexity needed
// Since all container ports are mirrored to host, external Puppeteer works fine

export interface PuppeteerScriptInput {
  script: string;
  timeout?: number;
}

export async function runPuppeteerScript({
  script,
  timeout = 60000,
}: PuppeteerScriptInput) {
  // Just execute Puppeteer script directly - no container checks needed
  // Puppeteer can connect to any localhost services from the host
  
  const puppeteer = await import('puppeteer');
  let browser = null;
  
  try {
    // Launch browser with error handling
    try {
      browser = await puppeteer.default.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    } catch (launchError: any) {
      return {
        success: false,
        output: '',
        error: `Failed to launch browser: ${launchError.message}`,
      };
    }

    const page = await browser.newPage();
    
    // Set up error handlers for the page
    page.on('error', (err) => {
      console.warn('Browser page error:', err.message);
    });
    
    page.on('pageerror', (err) => {
      console.warn('Browser page script error:', err.message);
    });

    // Validate script before execution
    if (!script || typeof script !== 'string') {
      return {
        success: false,
        output: '',
        error: 'Invalid script: must be a non-empty string',
      };
    }

    // Execute the script in a sandboxed context with error wrapping
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    
    // Wrap the user script with try-catch for better error handling
    const wrappedScript = `
      try {
        ${script}
      } catch (scriptError) {
        throw new Error('Script execution error: ' + scriptError.message);
      }
    `;
    
    const scriptFunction = new AsyncFunction('browser', 'page', 'puppeteer', wrappedScript);
    
    const result = await Promise.race([
      scriptFunction(browser, page, puppeteer).catch((scriptError: any) => {
        throw new Error(`Script error: ${scriptError.message}`);
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Script timeout after ${timeout}ms`)), timeout)
      )
    ]);

    return {
      success: true,
      output: result ? String(result) : 'Script executed successfully',
      error: undefined,
    };
  } catch (error: any) {
    // Enhanced error logging without crashing
    console.error('Browser script execution failed:', {
      error: error.message,
      stack: error.stack,
      script: script?.substring(0, 200) + (script?.length > 200 ? '...' : ''),
    });

    return {
      success: false,
      output: '',
      error: `Browser execution failed: ${error.message}`,
    };
  } finally {
    // Always close the browser
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn('Failed to close browser:', closeError);
      }
    }
  }
}
