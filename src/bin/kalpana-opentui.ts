#!/usr/bin/env node

/**
 * Kalpana OpenTUI CLI - Experimental
 * Tries to start the OpenTUI-based UI; falls back to Ink if OpenTUI is unavailable.
 */

import "dotenv/config";

async function start() {
  try {
    // @ts-ignore - resolved at runtime after build
    const { startOpenTui } = await import("../opentui-app.js");
    await startOpenTui();
    return;
  } catch {}
  try {
    // @ts-ignore - dev mode fallback
    const { startOpenTui } = await import("../opentui-app.ts");
    await startOpenTui();
    return;
  } catch {}
  console.error(
    "OpenTUI not available or failed to start. Falling back to Ink UI."
  );
  const { startInteractiveCliV2 } = await import("../interactive-cli-v2.js");
  startInteractiveCliV2();
}

start();
