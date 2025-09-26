import { google } from "googleapis";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { URL } from "node:url";

export interface GCalAuthStatus {
  isLinked: boolean;
  email?: string;
  expiresAt?: string;
  scopes?: string[];
  error?: string;
}

export interface ListEventsInput {
  calendarId?: string;
  timeMin?: string; // ISO string
  timeMax?: string; // ISO string
  maxResults?: number;
  q?: string;
  singleEvents?: boolean;
  orderBy?: "startTime" | "updated";
}

export interface CreateEventInput {
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string; optional?: boolean }>;
}

export interface UpdateEventInput extends CreateEventInput {
  eventId: string;
}

export interface DeleteEventInput {
  calendarId?: string;
  eventId: string;
}

export interface QuickAddInput {
  calendarId?: string;
  text: string; // Natural language, e.g., "Lunch with Alex tomorrow 12pm"
}

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
];

const CONFIG_DIR = path.join(os.homedir(), ".kalpana");
const TOKEN_PATH = path.join(CONFIG_DIR, "gcal-token.json");

async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch {}
}

let oAuth2Client: any = null;

function getOAuth2Client() {
  if (!oAuth2Client) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      "http://localhost:44565/oauth/callback";

    if (!clientId || !clientSecret) {
      throw new Error(
        "Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
      );
    }

    oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }
  return oAuth2Client;
}

function getCalendarClient() {
  const auth = getOAuth2Client();
  return google.calendar({ version: "v3", auth });
}

export async function isCalendarLinked(): Promise<GCalAuthStatus> {
  try {
    await ensureConfigDir();
    const tokenExists = await fs
      .access(TOKEN_PATH)
      .then(() => true)
      .catch(() => false);

    if (!tokenExists) return { isLinked: false };

    const tokenData = JSON.parse(await fs.readFile(TOKEN_PATH, "utf8"));
    const auth = getOAuth2Client();
    auth.setCredentials(tokenData);

    try {
      const oauth2 = google.oauth2({ version: "v2", auth });
      const userInfo = await oauth2.userinfo.get();
      return {
        isLinked: true,
        email: userInfo.data.email || undefined,
        expiresAt: tokenData.expiry_date
          ? new Date(tokenData.expiry_date).toISOString()
          : undefined,
        scopes: tokenData.scope?.split(" ") || SCOPES,
      };
    } catch {
      return { isLinked: false };
    }
  } catch (error) {
    return {
      isLinked: false,
      error: `Failed to check Calendar auth status: ${
        (error as Error).message
      }`,
    };
  }
}

export async function linkCalendarAccount(): Promise<{
  success: boolean;
  authUrl?: string;
  message: string;
  callbackPort?: number;
}> {
  try {
    const auth = getOAuth2Client();
    const authUrl = auth.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
    });

    const callbackPort = 44565; // reuse default unless GOOGLE_REDIRECT_URI changes
    let server: any = null;

    const tokenPromise = new Promise<void>((resolve, reject) => {
      server = createServer(async (req, res) => {
        const url = new URL(req.url || "", `http://localhost:${callbackPort}`);
        if (url.pathname === "/oauth/callback") {
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");
          if (error) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(
              `<html><body><h1>Authorization Failed</h1><p>Error: ${error}</p></body></html>`
            );
            reject(new Error(`OAuth error: ${error}`));
            return;
          }
          if (!code) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(
              `<html><body><h1>Authorization Failed</h1><p>No authorization code received.</p></body></html>`
            );
            reject(new Error("No authorization code received"));
            return;
          }
          try {
            const { tokens } = await auth.getToken(code);
            auth.setCredentials(tokens);
            await ensureConfigDir();
            await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(
              `<html><body><h1>✅ Google Calendar Linked Successfully!</h1><p>You can close this window.</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`
            );
            resolve();
          } catch (tokenError) {
            res.writeHead(500, { "Content-Type": "text/html" });
            res.end(
              `<html><body><h1>Token Exchange Failed</h1><p>Error: ${
                (tokenError as Error).message
              }</p></body></html>`
            );
            reject(tokenError as Error);
          }
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
        }
      });
      server.listen(callbackPort, () => {});
      setTimeout(
        () => reject(new Error("OAuth flow timed out after 5 minutes")),
        5 * 60 * 1000
      );
    });

    // Close server after timeout regardless
    setTimeout(() => {
      if (server)
        try {
          server.close();
        } catch {}
    }, 5 * 60 * 1000);

    return {
      success: true,
      authUrl,
      callbackPort,
      message: `Please visit the following URL to authorize Google Calendar access:\n\n${authUrl}\n\nAfter authorization, the callback server will handle the token exchange automatically.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to start Calendar OAuth flow: ${
        (error as Error).message
      }`,
    };
  }
}

export async function unlinkCalendarAccount(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const status = await isCalendarLinked();
    if (!status.isLinked) {
      return {
        success: false,
        message: "Google Calendar account is not currently linked.",
      };
    }
    try {
      await ensureConfigDir();
      await fs.unlink(TOKEN_PATH);
    } catch (e: any) {
      if (e?.code !== "ENOENT") throw e;
    }
    if (oAuth2Client) oAuth2Client.setCredentials({});
    return {
      success: true,
      message: `Google Calendar account (${
        status.email || "unknown"
      }) has been unlinked.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to unlink Google Calendar account: ${
        (error as Error).message
      }`,
    };
  }
}

export async function listCalendars() {
  try {
    const status = await isCalendarLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Google Calendar not linked. Use gcal.linkAccount first.",
      };
    const calendar = getCalendarClient();
    const res = await calendar.calendarList.list({});
    const items = res.data.items || [];
    return {
      success: true,
      calendars: items.map((c: any) => ({
        id: c.id,
        summary: c.summary,
        primary: !!c.primary,
        timeZone: c.timeZone,
        accessRole: c.accessRole,
      })),
      count: items.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list calendars: ${(error as Error).message}`,
    };
  }
}

export async function listEvents({
  calendarId = "primary",
  timeMin,
  timeMax,
  maxResults = 50,
  q,
  singleEvents = true,
  orderBy = "startTime",
}: ListEventsInput = {}) {
  try {
    const status = await isCalendarLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Google Calendar not linked. Use gcal.linkAccount first.",
      };
    const calendar = getCalendarClient();
    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      maxResults,
      q,
      singleEvents,
      orderBy,
    } as any);
    const items = res.data.items || [];
    return {
      success: true,
      calendarId,
      events: items.map((e: any) => ({
        id: e.id,
        status: e.status,
        summary: e.summary,
        description: e.description,
        location: e.location,
        start: e.start,
        end: e.end,
        attendees: e.attendees,
        htmlLink: e.htmlLink,
        updated: e.updated,
      })),
      count: items.length,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list events: ${(error as Error).message}`,
      calendarId,
    };
  }
}

export async function createEvent({
  calendarId = "primary",
  summary,
  description,
  location,
  start,
  end,
  attendees,
}: CreateEventInput) {
  try {
    const status = await isCalendarLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Google Calendar not linked. Use gcal.linkAccount first.",
      };
    const calendar = getCalendarClient();
    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary,
        description,
        location,
        start,
        end,
        attendees,
      },
    });
    const ev = res.data;
    return { success: true, calendarId, eventId: ev.id, htmlLink: ev.htmlLink };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create event: ${(error as Error).message}`,
      calendarId,
    };
  }
}

export async function updateEvent({
  calendarId = "primary",
  eventId,
  summary,
  description,
  location,
  start,
  end,
  attendees,
}: UpdateEventInput) {
  try {
    const status = await isCalendarLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Google Calendar not linked. Use gcal.linkAccount first.",
      };
    const calendar = getCalendarClient();
    const res = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: { summary, description, location, start, end, attendees },
    });
    return {
      success: true,
      calendarId,
      eventId: res.data.id,
      htmlLink: res.data.htmlLink,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update event: ${(error as Error).message}`,
      calendarId,
      eventId,
    };
  }
}

export async function deleteEvent({
  calendarId = "primary",
  eventId,
}: DeleteEventInput) {
  try {
    const status = await isCalendarLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Google Calendar not linked. Use gcal.linkAccount first.",
      };
    const calendar = getCalendarClient();
    await calendar.events.delete({ calendarId, eventId });
    return { success: true, calendarId, eventId };
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete event: ${(error as Error).message}`,
      calendarId,
      eventId,
    };
  }
}

export async function quickAdd({
  calendarId = "primary",
  text,
}: QuickAddInput) {
  try {
    const status = await isCalendarLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Google Calendar not linked. Use gcal.linkAccount first.",
      };
    const calendar = getCalendarClient();
    const res = await calendar.events.quickAdd({ calendarId, text });
    return {
      success: true,
      calendarId,
      eventId: res.data.id,
      htmlLink: res.data.htmlLink,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to quick add event: ${(error as Error).message}`,
      calendarId,
    };
  }
}
