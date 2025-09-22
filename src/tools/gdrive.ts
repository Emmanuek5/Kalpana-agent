import { google } from "googleapis";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { URL } from "node:url";

// Google Drive API interfaces
export interface GDriveAuthInput {
  // No input needed for initial auth
}

export interface GDriveAuthStatus {
  isLinked: boolean;
  email?: string;
  expiresAt?: string;
  scopes?: string[];
  error?: string;
}

export interface GDriveListFilesInput {
  folderId?: string;
  query?: string;
  maxResults?: number;
  orderBy?: string;
}

export interface GDriveReadFileInput {
  fileId: string;
  mimeType?: string;
}

export interface GDriveWriteFileInput {
  name: string;
  content: string;
  folderId?: string;
  mimeType?: string;
}

export interface GDriveSearchInput {
  query: string;
  maxResults?: number;
}

// OAuth configuration
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email'
];

const CREDENTIALS_PATH = path.join(process.cwd(), '.gdrive-credentials.json');
const TOKEN_PATH = path.join(process.cwd(), '.gdrive-token.json');

// OAuth client setup
let oAuth2Client: any = null;

function getOAuth2Client() {
  if (!oAuth2Client) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback';

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    }

    oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }
  return oAuth2Client;
}

// Initialize Google Drive API client
function getDriveClient() {
  const auth = getOAuth2Client();
  return google.drive({ version: 'v3', auth });
}

// Check if account is linked and token is valid
export async function isAccountLinked(): Promise<GDriveAuthStatus> {
  try {
    const tokenExists = await fs.access(TOKEN_PATH).then(() => true).catch(() => false);
    
    if (!tokenExists) {
      return { isLinked: false };
    }

    const tokenData = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));
    const auth = getOAuth2Client();
    auth.setCredentials(tokenData);

    // Check if token is still valid by making a test API call
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth });
      const userInfo = await oauth2.userinfo.get();
      
      return {
        isLinked: true,
        email: userInfo.data.email || undefined,
        expiresAt: tokenData.expiry_date ? new Date(tokenData.expiry_date).toISOString() : undefined,
        scopes: tokenData.scope?.split(' ') || SCOPES
      };
    } catch (apiError) {
      // Token might be expired or invalid
      return { isLinked: false };
    }
  } catch (error) {
    return { 
      isLinked: false,
      error: `Failed to check auth status: ${(error as Error).message}`
    };
  }
}

// Start OAuth flow and return authorization URL
export async function linkAccount(): Promise<{
  success: boolean;
  authUrl?: string;
  message: string;
  callbackPort?: number;
}> {
  try {
    const auth = getOAuth2Client();
    
    // Generate the URL for OAuth consent
    const authUrl = auth.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent' // Force consent to get refresh token
    });

    // Start a temporary callback server
    const callbackPort = 3000;
    let server: any = null;
    
    const tokenPromise = new Promise<any>((resolve, reject) => {
      server = createServer(async (req, res) => {
        const url = new URL(req.url || '', `http://localhost:${callbackPort}`);
        
        if (url.pathname === '/oauth/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Authorization Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            reject(new Error(`OAuth error: ${error}`));
            return;
          }
          
          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Authorization Failed</h1>
                  <p>No authorization code received.</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            reject(new Error('No authorization code received'));
            return;
          }

          try {
            // Exchange code for tokens
            const { tokens } = await auth.getToken(code);
            auth.setCredentials(tokens);
            
            // Save tokens to file
            await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>✅ Google Drive Linked Successfully!</h1>
                  <p>Your Google Drive account has been linked to AI Container.</p>
                  <p>You can now close this window and return to the CLI.</p>
                  <script>
                    setTimeout(() => window.close(), 3000);
                  </script>
                </body>
              </html>
            `);
            
            resolve(tokens);
          } catch (tokenError) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body>
                  <h1>Token Exchange Failed</h1>
                  <p>Error: ${(tokenError as Error).message}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            reject(tokenError);
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });
      
      server.listen(callbackPort, () => {
        // OAuth callback server started silently
      });
      
      // Timeout after 5 minutes
      setTimeout(() => {
        reject(new Error('OAuth flow timed out after 5 minutes'));
      }, 5 * 60 * 1000);
    });

    // Don't await the token promise here - just return the auth URL
    // The server will handle the callback asynchronously
    setTimeout(() => {
      if (server) {
        server.close();
      }
    }, 5 * 60 * 1000); // Close server after 5 minutes

    return {
      success: true,
      authUrl,
      callbackPort,
      message: `Please visit the following URL to authorize Google Drive access:\n\n${authUrl}\n\nAfter authorization, the callback server will handle the token exchange automatically.`
    };

  } catch (error) {
    return {
      success: false,
      message: `Failed to start OAuth flow: ${(error as Error).message}`
    };
  }
}

// Unlink Google Drive account
export async function unlinkAccount(): Promise<{ success: boolean; message: string }> {
  try {
    const authStatus = await isAccountLinked();
    if (!authStatus.isLinked) {
      return {
        success: false,
        message: 'Google Drive account is not currently linked.'
      };
    }

    // Remove the token file
    try {
      await fs.unlink(TOKEN_PATH);
    } catch (error) {
      // File might not exist, which is fine
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }

    // Clear OAuth client credentials
    if (oAuth2Client) {
      oAuth2Client.setCredentials({});
    }

    return {
      success: true,
      message: `Google Drive account (${authStatus.email || 'unknown'}) has been successfully unlinked. All stored tokens have been removed.`
    };

  } catch (error) {
    return {
      success: false,
      message: `Failed to unlink Google Drive account: ${(error as Error).message}`
    };
  }
}

// List files in Google Drive
export async function listFiles({
  folderId,
  query,
  maxResults = 50,
  orderBy = 'modifiedTime desc'
}: GDriveListFilesInput = {}) {
  try {
    const authStatus = await isAccountLinked();
    if (!authStatus.isLinked) {
      return {
        success: false,
        error: 'Google Drive account not linked. Use pDrive.linkAccount first.',
        needsAuth: true
      };
    }

    const drive = getDriveClient();
    
    let searchQuery = query || '';
    if (folderId) {
      searchQuery += (searchQuery ? ' and ' : '') + `'${folderId}' in parents`;
    }
    
    const response = await drive.files.list({
      q: searchQuery || undefined,
      pageSize: maxResults,
      orderBy,
      fields: 'files(id,name,mimeType,size,modifiedTime,createdTime,parents,webViewLink,webContentLink)'
    });

    const files = response.data.files || [];
    
    return {
      success: true,
      files: files.map((file: any) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size ? parseInt(file.size) : undefined,
        modifiedTime: file.modifiedTime,
        createdTime: file.createdTime,
        parents: file.parents,
        webViewLink: file.webViewLink,
        webContentLink: file.webContentLink,
        isFolder: file.mimeType === 'application/vnd.google-apps.folder'
      })),
      count: files.length,
      query: searchQuery || 'all files'
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list files: ${(error as Error).message}`
    };
  }
}

// Read file content from Google Drive
export async function readFile({ fileId, mimeType }: GDriveReadFileInput) {
  try {
    const authStatus = await isAccountLinked();
    if (!authStatus.isLinked) {
      return {
        success: false,
        error: 'Google Drive account not linked. Use pDrive.linkAccount first.',
        needsAuth: true
      };
    }

    const drive = getDriveClient();
    
    // Get file metadata first
    const metadata = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,size,modifiedTime'
    });

    const file = metadata.data;
    let content = '';
    
    // Handle different file types
    if (file.mimeType?.startsWith('application/vnd.google-apps.')) {
      // Google Workspace files need to be exported
      let exportMimeType = mimeType || 'text/plain';
      
      if (file.mimeType === 'application/vnd.google-apps.document') {
        exportMimeType = mimeType || 'text/plain';
      } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
        exportMimeType = mimeType || 'text/csv';
      } else if (file.mimeType === 'application/vnd.google-apps.presentation') {
        exportMimeType = mimeType || 'text/plain';
      }
      
      const exportResponse = await drive.files.export({
        fileId,
        mimeType: exportMimeType
      });
      
      content = exportResponse.data as string;
    } else {
      // Regular files can be downloaded directly
      const response = await drive.files.get({
        fileId,
        alt: 'media'
      });
      
      content = response.data as string;
    }

    return {
      success: true,
      fileId,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size ? parseInt(file.size) : undefined,
      modifiedTime: file.modifiedTime,
      content,
      contentLength: content.length
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read file: ${(error as Error).message}`,
      fileId
    };
  }
}

// Write/create file in Google Drive
export async function writeFile({
  name,
  content,
  folderId,
  mimeType = 'text/plain'
}: GDriveWriteFileInput) {
  try {
    const authStatus = await isAccountLinked();
    if (!authStatus.isLinked) {
      return {
        success: false,
        error: 'Google Drive account not linked. Use pDrive.linkAccount first.',
        needsAuth: true
      };
    }

    const drive = getDriveClient();
    
    const fileMetadata: any = {
      name,
      parents: folderId ? [folderId] : undefined
    };

    const media = {
      mimeType,
      body: content
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id,name,webViewLink'
    });

    const file = response.data;
    
    return {
      success: true,
      fileId: file.id,
      name: file.name,
      webViewLink: file.webViewLink,
      message: `File '${name}' created successfully in Google Drive`
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to write file: ${(error as Error).message}`,
      name
    };
  }
}

// Search files in Google Drive
export async function searchFiles({
  query,
  maxResults = 20
}: GDriveSearchInput) {
  try {
    const authStatus = await isAccountLinked();
    if (!authStatus.isLinked) {
      return {
        success: false,
        error: 'Google Drive account not linked. Use pDrive.linkAccount first.',
        needsAuth: true
      };
    }

    const drive = getDriveClient();
    
    // Build search query
    const searchQuery = `name contains '${query}' or fullText contains '${query}'`;
    
    const response = await drive.files.list({
      q: searchQuery,
      pageSize: maxResults,
      orderBy: 'relevance desc',
      fields: 'files(id,name,mimeType,size,modifiedTime,parents,webViewLink)'
    });

    const files = response.data.files || [];
    
    return {
      success: true,
      files: files.map((file: any) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size ? parseInt(file.size) : undefined,
        modifiedTime: file.modifiedTime,
        parents: file.parents,
        webViewLink: file.webViewLink,
        isFolder: file.mimeType === 'application/vnd.google-apps.folder'
      })),
      count: files.length,
      query
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to search files: ${(error as Error).message}`,
      query
    };
  }
}
