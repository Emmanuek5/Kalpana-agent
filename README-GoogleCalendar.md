# Google Calendar Integration Setup

This guide explains how to set up and use Google Calendar integration in AI Container.

## Prerequisites

1. Google Cloud project with the Google Calendar API enabled
2. OAuth 2.0 Client ID and Secret

## Setup Steps

### 1) Enable API and Create OAuth Client

1. Go to the Google Cloud Console (`https://console.cloud.google.com`)
2. Select or create a project
3. Enable the API: APIs & Services → Library → "Google Calendar API" → Enable
4. Create OAuth 2.0 credentials: APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: Desktop application
   - Authorized redirect URI: `http://localhost:44565/oauth/callback`

### 2) Configure Environment Variables

Add to your `.env`:

```bash
# Google OAuth (shared by Drive and Calendar integrations)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:44565/oauth/callback
```

Then install deps and (re)start:

```bash
bun install
```

## Linking Your Account

In the AI Container CLI:

```bash
# Check status
gcal.isLinked

# Start OAuth flow
gcal.linkAccount
```

This will print an authorization URL. Open it, grant access, and the local callback server will store your token at `~/.kalpana/gcal-token.json`.

To unlink:

```bash
gcal.unlinkAccount
```

## Using Calendar Tools

Once linked:

```bash
# List calendars
gcal.listCalendars

# List upcoming events (primary calendar)
gcal.listEvents

# List events within a window
gcal.listEvents calendarId:"primary" timeMin:"2025-09-27T00:00:00Z" timeMax:"2025-09-30T23:59:59Z"

# Quick add via natural language
gcal.quickAdd text:"Lunch with Alex tomorrow 12pm"

# Create an event (explicit start/end)
gcal.createEvent summary:"Project Sync" start:{dateTime:"2025-09-28T15:00:00Z"} end:{dateTime:"2025-09-28T15:30:00Z"} attendees:[{email:"alex@example.com"}]

# Update an event
gcal.updateEvent eventId:"<event-id>" summary:"Project Sync - Updated"

# Delete an event
gcal.deleteEvent eventId:"<event-id>"
```

## Notes & Security

- Tokens are stored locally at `~/.kalpana/gcal-token.json`.
- Scopes requested:
  - `https://www.googleapis.com/auth/calendar`
  - `https://www.googleapis.com/auth/userinfo.email`
- The OAuth callback server binds locally (`localhost:44565`) only during auth.

## Troubleshooting

- "OAuth credentials not configured": Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.
- "Authorization failed": The redirect URI must match exactly. Verify `GOOGLE_REDIRECT_URI` and that port 44565 is free.
- "Not linked" errors: Run `gcal.linkAccount` first. If issues persist, delete `~/.kalpana/gcal-token.json` and re-link.
