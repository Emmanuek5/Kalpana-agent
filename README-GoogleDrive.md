# Google Drive Integration Setup

This guide explains how to set up Google Drive integration for the AI Container system.

## Prerequisites

1. **Google Cloud Project**: You need a Google Cloud project with the Google Drive API enabled
2. **OAuth 2.0 Credentials**: Create OAuth 2.0 client credentials for your application

## Setup Steps

### 1. Create Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"

### 2. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Choose "Desktop application" as the application type
4. Set the name (e.g., "AI Container Google Drive")
5. Add authorized redirect URIs:
   - `http://localhost:3000/oauth/callback`
6. Download the credentials JSON file

### 3. Configure Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Google Drive OAuth Configuration
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback

# Optional: Custom model for file summarization
SUB_AGENT_MODEL_ID=openai/gpt-4o-mini
```

### 4. Install Dependencies

The `googleapis` package is already added to package.json. Install it with:

```bash
bun install
```

## Usage

### 1. Check Account Status

```bash
# In AI Container CLI
pDrive.isAccountLinked
```

### 2. Link Your Google Account

```bash
# Start OAuth flow
pDrive.linkAccount
```

This will:
- Start a callback server on port 3000
- Provide you with an authorization URL
- Open the URL in your browser to authorize access
- Automatically handle the token exchange

### 3. Account Management

```bash
# Check if account is linked
pDrive.isAccountLinked

# Link account (start OAuth flow)
pDrive.linkAccount

# Unlink account (disconnect and remove all tokens)
pDrive.unlinkAccount
```

### 4. Use Google Drive Features

Once linked, you can:

```bash
# List files
pDrive.listFiles

# Search for files
pDrive.searchFiles query:"project documents"

# Read a file (get file ID from listFiles or searchFiles)
pDrive.readFile fileId:"1ABC123..."

# Create a new file
pDrive.writeFile name:"my-document.txt" content:"Hello World"

# Unlink account (disconnect and remove tokens)
pDrive.unlinkAccount
```

## Supported File Types

- **Google Docs**: Exported as plain text or HTML
- **Google Sheets**: Exported as CSV or other formats
- **Google Slides**: Exported as plain text
- **Regular files**: PDFs, text files, images, etc.
- **Folders**: Browse and organize files

## Security Notes

- **Token Storage**: OAuth tokens are stored locally in `.gdrive-token.json`
- **Scopes**: The integration requests these permissions:
  - `https://www.googleapis.com/auth/drive` - Full Google Drive access
  - `https://www.googleapis.com/auth/drive.file` - Access to files created by the app
  - `https://www.googleapis.com/auth/userinfo.email` - User email for identification
- **Local Server**: OAuth callback runs on localhost:3000 temporarily during auth

## Troubleshooting

### Common Issues

1. **"googleapis module not found"**
   - Run `bun install` to install dependencies

2. **"OAuth credentials not configured"**
   - Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in `.env`

3. **"Authorization failed"**
   - Check that redirect URI matches exactly: `http://localhost:3000/oauth/callback`
   - Ensure port 3000 is not in use by other applications

4. **"Token expired"**
   - Delete `.gdrive-token.json` and run `pDrive.linkAccount` again

### Debug Mode

Set `DEBUG=1` in your environment to see detailed OAuth flow information.

## File Operations Examples

### Reading Google Docs
```bash
# Find your document
pDrive.searchFiles query:"My Important Document"

# Read the document content
pDrive.readFile fileId:"1ABC123..." mimeType:"text/plain"
```

### Working with Spreadsheets
```bash
# Find spreadsheet
pDrive.listFiles query:"name contains 'budget'"

# Export as CSV
pDrive.readFile fileId:"1XYZ789..." mimeType:"text/csv"
```

### Creating Files
```bash
# Create a text file
pDrive.writeFile name:"analysis-results.txt" content:"Analysis complete..."

# Create in specific folder
pDrive.writeFile name:"report.md" content:"# Report" folderId:"1FOLDER123"
```

## Integration with AI Container

The Google Drive integration works seamlessly with other AI Container features:

1. **Read documents** from Google Drive
2. **Analyze content** with AI tools
3. **Process data** in the sandbox environment
4. **Create reports** and save back to Google Drive
5. **Combine with web research** and other tools

This enables powerful workflows like:
- Analyzing documents stored in Google Drive
- Creating reports based on Google Sheets data
- Backing up analysis results to Google Drive
- Collaborative document processing
