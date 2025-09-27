# Gmail Integration Setup

This guide explains how to link Gmail and use email tools in AI Container.

## Prerequisites

1. Google Cloud project with the Gmail API enabled
2. OAuth 2.0 client (Desktop) with redirect URI `http://localhost:44565/oauth/callback`

## Environment Variables

Add to `.env`:

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:44565/oauth/callback
```

## Link Your Account

In the CLI:

```bash
gmail.isLinked
gmail.linkAccount   # prints an auth URL
```

Authorize in the browser. Tokens are stored at `~/.kalpana/gmail-token.json`.

To unlink:

```bash
gmail.unlinkAccount
```

## Usage

```bash
# Labels
gmail.listLabels

# Search or list messages
gmail.listMessages q:"from:team@example.com newer_than:7d" maxResults:20
gmail.listMessages labelIds:["INBOX"]

# Read a message
gmail.getMessage id:"<message-id>"

# Send an email
gmail.sendMessage to:"you@example.com" subject:"Hello" text:"Hi there from AI Container"
```

## Notes

- Scopes requested: `gmail.readonly`, `gmail.send`, `userinfo.email`.
- Callback server runs on `localhost:44565` during auth.
- Uses the same OAuth env vars as Drive/Calendar.
