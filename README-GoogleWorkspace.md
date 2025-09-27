# Google Workspace (Sheets & Docs) Integration

This guide covers linking Google Workspace once for both Sheets and Docs.

## Prerequisites

1. Enable APIs: Google Sheets API and Google Docs API in Google Cloud Console
2. OAuth 2.0 client (Desktop) with redirect URI `http://localhost:44565/oauth/callback`

## Environment Variables

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:44565/oauth/callback
```

## Link Workspace

```bash
sheets.isLinked
sheets.linkAccount
```

Authorize in browser. Tokens stored at `~/.kalpana/gworkspace-token.json`.

To unlink:

```bash
sheets.unlinkAccount
```

## Sheets Usage

```bash
# Read a range
sheets.readRange spreadsheetId:"<id>" range:"Sheet1!A1:D10"

# Write values
sheets.writeRange spreadsheetId:"<id>" range:"Sheet1!A1:B2" values:[["A","B"],["C","D"]]

# Append rows
sheets.appendRows spreadsheetId:"<id>" range:"Sheet1!A:D" values:[["x","y"]] valueInputOption:"USER_ENTERED"

# Create spreadsheet
sheets.createSpreadsheet title:"My Data"
```

## Docs Usage

```bash
# Create a document
gdocs.createDocument title:"Status Report"

# Get a document
gdocs.getDocument documentId:"<docId>"

# Batch update (example: insert text at start)
gdocs.batchUpdate documentId:"<docId>" requests:[{
  insertText: { location: { index: 1 }, text: "Hello from AI Container\n" }
}]
```

## Notes

- Sheets and Docs share the same Workspace token (`gworkspace-token.json`).
- Scopes requested allow reading/writing spreadsheets and documents; plus `userinfo.email`.
- Callback server runs on `localhost:44565` only during auth.
