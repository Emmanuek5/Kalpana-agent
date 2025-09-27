import { google } from "googleapis";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { URL } from "node:url";

// Shared Google Workspace OAuth token (Sheets + Docs)
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/userinfo.email",
];

const CONFIG_DIR = path.join(os.homedir(), ".kalpana");
const TOKEN_PATH = path.join(CONFIG_DIR, "gworkspace-token.json");

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

function getSheetsClient() {
  const auth = getOAuth2Client();
  return google.sheets({ version: "v4", auth });
}

export async function isWorkspaceLinked(): Promise<{
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
      error: `Failed to check Google Workspace auth status: ${
        (error as Error).message
      }`,
    };
  }
}

export async function linkWorkspaceAccount(): Promise<{
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
              `<html><body><h1>✅ Google Workspace Linked Successfully!</h1><p>You can close this window.</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`
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
      message: `Authorize Google Workspace access (Sheets & Docs):\n\n${authUrl}\n\nCallback server will handle token exchange.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to start Google Workspace OAuth flow: ${
        (error as Error).message
      }`,
    };
  }
}

export async function unlinkWorkspaceAccount(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const status = await isWorkspaceLinked();
    if (!status.isLinked)
      return { success: false, message: "Google Workspace is not linked." };
    try {
      await ensureConfigDir();
      await fs.unlink(TOKEN_PATH);
    } catch (e: any) {
      if (e?.code !== "ENOENT") throw e;
    }
    if (oAuth2Client) oAuth2Client.setCredentials({});
    return {
      success: true,
      message: `Google Workspace account (${
        status.email || "unknown"
      }) has been unlinked.`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to unlink Google Workspace: ${(error as Error).message}`,
    };
  }
}

export async function readRange({
  spreadsheetId,
  range,
}: {
  spreadsheetId: string;
  range: string;
}) {
  try {
    const status = await isWorkspaceLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Workspace not linked. Use sheets.linkAccount first.",
      };
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return {
      success: true,
      values: res.data.values || [],
      range,
      spreadsheetId,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read range: ${(error as Error).message}`,
      spreadsheetId,
      range,
    };
  }
}

export async function writeRange({
  spreadsheetId,
  range,
  values,
  valueInputOption = "RAW",
}: {
  spreadsheetId: string;
  range: string;
  values: any[][];
  valueInputOption?: "RAW" | "USER_ENTERED";
}) {
  try {
    const status = await isWorkspaceLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Workspace not linked. Use sheets.linkAccount first.",
      };
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values },
    });
    return { success: true, updated: res.data.updatedCells || 0 };
  } catch (error) {
    return {
      success: false,
      error: `Failed to write range: ${(error as Error).message}`,
    };
  }
}

export async function appendRows({
  spreadsheetId,
  range,
  values,
  valueInputOption = "RAW",
}: {
  spreadsheetId: string;
  range: string;
  values: any[][];
  valueInputOption?: "RAW" | "USER_ENTERED";
}) {
  try {
    const status = await isWorkspaceLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Workspace not linked. Use sheets.linkAccount first.",
      };
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption,
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });
    return { success: true, updatedRange: res.data.updates?.updatedRange };
  } catch (error) {
    return {
      success: false,
      error: `Failed to append rows: ${(error as Error).message}`,
    };
  }
}

export async function createSpreadsheet({ title }: { title: string }) {
  try {
    const status = await isWorkspaceLinked();
    if (!status.isLinked)
      return {
        success: false,
        needsAuth: true,
        error: "Workspace not linked. Use sheets.linkAccount first.",
      };
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.create({
      requestBody: { properties: { title } },
    });
    return {
      success: true,
      spreadsheetId: res.data.spreadsheetId,
      url: res.data.spreadsheetUrl,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create spreadsheet: ${(error as Error).message}`,
    };
  }
}
