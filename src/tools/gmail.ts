import { google } from "googleapis";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { URL } from "node:url";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

const CONFIG_DIR = path.join(os.homedir(), ".kalpana");
const TOKEN_PATH = path.join(CONFIG_DIR, "gmail-token.json");

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

function getGmailClient() {
  const auth = getOAuth2Client();
  return google.gmail({ version: "v1", auth });
}

export async function isGmailLinked(): Promise<{
  isLinked: boolean;
  email?: string;
  expiresAt?: string;
  scopes?: string[];
  error?: string;
}> {
  try {
    await ensureConfigDir();
    const exists = await fs
      .access(TOKEN_PATH)
      .then(() => true)
      .catch(() => false);
    if (!exists) return { isLinked: false };
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
      error: `Failed to check Gmail auth status: ${(error as Error).message}`,
    };
  }
}

export async function linkGmailAccount(): Promise<{
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
    const callbackPort = 44565;
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
              `<html><body><h1>✅ Gmail Linked Successfully!</h1><p>You can close this window.</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`
            );
            resolve();
          } catch (e: any) {
            res.writeHead(500, { "Content-Type": "text/html" });
            res.end(
              `<html><body><h1>Token Exchange Failed</h1><p>Error: ${e.message}</p></body></html>`
            );
            reject(e);
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
      message: `Authorize Gmail access:\n\n${authUrl}\n\nCallback server will handle token exchange.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to start Gmail OAuth flow: ${(error as Error).message}`,
    };
  }
}

export async function unlinkGmailAccount(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const status = await isGmailLinked();
    if (!status.isLinked)
      return { success: false, message: "Gmail is not linked." };
    try {
      await ensureConfigDir();
      await fs.unlink(TOKEN_PATH);
    } catch (e: any) {
      if (e?.code !== "ENOENT") throw e;
    }
    if (oAuth2Client) oAuth2Client.setCredentials({});
    return {
      success: true,
      message: `Gmail account (${
        status.email || "unknown"
      }) has been unlinked.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to unlink Gmail: ${(error as Error).message}`,
    };
  }
}

export async function listLabels() {
  try {
    const status = await isGmailLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Gmail not linked. Use gmail.linkAccount first.",
      };
    const gmail = getGmailClient();
    const res = await gmail.users.labels.list({ userId: "me" });
    const labels = res.data.labels || [];
    return { success: true, count: labels.length, labels };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list labels: ${(error as Error).message}`,
    };
  }
}

export async function listMessages({
  labelIds,
  q,
  maxResults = 25,
}: { labelIds?: string[]; q?: string; maxResults?: number } = {}) {
  try {
    const status = await isGmailLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Gmail not linked. Use gmail.linkAccount first.",
      };
    const gmail = getGmailClient();
    const res = await gmail.users.messages.list({
      userId: "me",
      labelIds,
      q,
      maxResults,
    });
    const messages = res.data.messages || [];
    return { success: true, count: messages.length, messages };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list messages: ${(error as Error).message}`,
    };
  }
}

export async function getMessage({ id }: { id: string }) {
  try {
    const status = await isGmailLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Gmail not linked. Use gmail.linkAccount first.",
      };
    const gmail = getGmailClient();
    const res = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });
    return { success: true, message: res.data };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get message: ${(error as Error).message}`,
      id,
    };
  }
}

function createEmail({
  to,
  subject,
  text,
  from,
}: {
  to: string;
  subject: string;
  text: string;
  from?: string;
}) {
  const sender = from || "me";
  const lines = [
    `From: ${sender}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
  ];
  const mail = lines.join("\r\n");
  return Buffer.from(mail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function sendMessage({
  to,
  subject,
  text,
  from,
}: {
  to: string;
  subject: string;
  text: string;
  from?: string;
}) {
  try {
    const status = await isGmailLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Gmail not linked. Use gmail.linkAccount first.",
      };
    const gmail = getGmailClient();
    const raw = createEmail({ to, subject, text, from });
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    return { success: true, id: res.data.id, threadId: res.data.threadId };
  } catch (error) {
    return {
      success: false,
      error: `Failed to send message: ${(error as Error).message}`,
    };
  }
}
