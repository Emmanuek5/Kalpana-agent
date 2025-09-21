import { Hyperbrowser } from "@hyperbrowser/sdk";
import { connect } from "puppeteer-core";

export interface CreateSessionInput {
  profile?: { id?: string; persistChanges?: boolean };
}

export interface NavigateInput {
  sessionId: string;
  url: string;
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

export async function navigate({ sessionId, url }: NavigateInput) {
  const session = await client.sessions.get(sessionId);
  const browser = await connect({
    browserWSEndpoint: session.wsEndpoint,
    defaultViewport: null,
  });
  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const title = await page.title();
  const content = await page.content();
  await browser.disconnect();
  return { title, html: content };
}
