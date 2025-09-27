import { google } from "googleapis";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Reuse shared token with Sheets
const CONFIG_DIR = path.join(os.homedir(), ".kalpana");
const TOKEN_PATH = path.join(CONFIG_DIR, "gworkspace-token.json");

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

async function loadCredentials() {
  const auth = getOAuth2Client();
  const tokenData = JSON.parse(await fs.readFile(TOKEN_PATH, "utf8"));
  auth.setCredentials(tokenData);
  return auth;
}

function getDocsClient() {
  const auth = getOAuth2Client();
  return google.docs({ version: "v1", auth });
}

export async function createDocument({ title }: { title: string }) {
  try {
    await loadCredentials();
    const docs = getDocsClient();
    const res = await docs.documents.create({ requestBody: { title } });
    return {
      success: true,
      documentId: res.data.documentId,
      title: res.data.title,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create document: ${(error as Error).message}`,
    };
  }
}

export async function getDocument({ documentId }: { documentId: string }) {
  try {
    await loadCredentials();
    const docs = getDocsClient();
    const res = await docs.documents.get({ documentId });
    return { success: true, document: res.data };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get document: ${(error as Error).message}`,
      documentId,
    };
  }
}

export async function batchUpdate({
  documentId,
  requests,
}: {
  documentId: string;
  requests: any[];
}) {
  try {
    await loadCredentials();
    const docs = getDocsClient();
    const res = await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });
    return { success: true, replies: res.data.replies || [] };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update document: ${(error as Error).message}`,
    };
  }
}
