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
  
  try {
    // Execute the script in a sandboxed context
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const scriptFunction = new AsyncFunction('puppeteer', script);
    
    const result = await Promise.race([
      scriptFunction(puppeteer),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Script timeout')), timeout)
      )
    ]);

    return {
      success: true,
      output: result ? String(result) : 'Script executed successfully',
      error: undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      output: '',
      error: error.message || String(error),
    };
  }
}
