# Notion Integration Setup

This guide will help you set up Notion integration with the AI Container system.

## Prerequisites

1. A Notion account
2. Admin access to a Notion workspace

## Setup Steps

### 1. Create a Notion Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **"+ New integration"**
3. Fill in the integration details:
   - **Name**: `AI Container Agent` (or any name you prefer)
   - **Logo**: Optional
   - **Associated workspace**: Select your workspace
4. Click **"Submit"**

### 2. Get Your Integration Token

1. After creating the integration, you'll see the **"Internal Integration Token"**
2. Click **"Show"** and copy the token (starts with `secret_`)
3. **Keep this token secure** - it provides access to your Notion workspace

### 3. Configure Permissions

Your integration will have these capabilities by default:
- **Read content**: View pages and databases
- **Update content**: Modify existing pages and databases  
- **Insert content**: Create new pages and databases

### 4. Share Pages/Databases with Integration

**Important**: The integration can only access pages and databases that are explicitly shared with it.

For each page or database you want the AI to access:

1. Open the page/database in Notion
2. Click **"Share"** in the top right
3. Click **"Invite"**
4. Search for your integration name (e.g., "AI Container Agent")
5. Select the integration and choose permissions:
   - **Can edit**: Full read/write access
   - **Can comment**: Read access + commenting
   - **Can view**: Read-only access
6. Click **"Invite"**

### 5. Link Account in AI Container

Run the AI Container and use the following command:

```bash
notion.linkAccount({ token: "secret_your_integration_token_here" })
```

### 6. Verify Connection

Check if the integration is working:

```bash
notion.isLinked()
```

You should see: `✅ Notion account is linked and ready`

## Available Operations

Once linked, you can use these Notion operations:

### Pages
- `notion.createPage()` - Create new pages
- `notion.getPage()` - Retrieve page content
- `notion.updatePage()` - Update page properties
- `notion.addBlocks()` - Add content blocks to pages

### Databases
- `notion.createDatabase()` - Create new databases
- `notion.getDatabase()` - Get database schema
- `notion.queryDatabase()` - Query database entries

### Search & Discovery
- `notion.search()` - Search across all accessible content

## Example Usage

### Create a Simple Page

```javascript
notion.createPage({
  parentId: "page-id-here",
  title: "My New Page",
  content: "This is the initial content of the page."
})
```

### Create a Task Database

```javascript
notion.createDatabase({
  parentId: "page-id-here", 
  title: "Tasks",
  properties: {
    "Name": {
      "title": {}
    },
    "Status": {
      "select": {
        "options": [
          { "name": "Not started", "color": "red" },
          { "name": "In progress", "color": "yellow" },
          { "name": "Completed", "color": "green" }
        ]
      }
    },
    "Due Date": {
      "date": {}
    },
    "Priority": {
      "select": {
        "options": [
          { "name": "High", "color": "red" },
          { "name": "Medium", "color": "yellow" },
          { "name": "Low", "color": "gray" }
        ]
      }
    }
  }
})
```

### Query Database

```javascript
notion.queryDatabase({
  databaseId: "database-id-here",
  filter: {
    "property": "Status",
    "select": {
      "equals": "In progress"
    }
  },
  sorts: [
    {
      "property": "Due Date",
      "direction": "ascending"
    }
  ]
})
```

## Tips & Best Practices

### 1. Page IDs and Database IDs
- You can find IDs in the URL: `https://notion.so/Page-Title-{PAGE_ID}`
- Remove hyphens when using IDs: `abc123def456` not `abc123-def456`

### 2. Database Properties
- Define your database schema carefully - properties define data types
- Common property types: `title`, `rich_text`, `number`, `select`, `multi_select`, `date`, `checkbox`

### 3. Content Blocks
- Pages can contain various block types: paragraphs, headings, lists, images, etc.
- Use `notion.addBlocks()` to add structured content

### 4. Permissions
- Start with a test page/database to verify integration works
- Grant minimal necessary permissions for security
- You can always add more pages/databases later

## Troubleshooting

### "Notion not linked" Error
- Verify your integration token is correct
- Make sure you used `notion.linkAccount()` with the right token

### "Object not found" Error  
- Check that the page/database ID is correct
- Ensure the page/database is shared with your integration
- Remove hyphens from IDs if copying from URLs

### Permission Denied
- Make sure the integration has appropriate permissions on the page/database
- Check that you invited the integration with "Can edit" permissions

### Integration Not Found
- Verify the integration exists in your workspace
- Check that you're using the correct workspace

## Security Notes

- **Never share your integration token** - it provides access to your Notion workspace
- **Use environment variables** for tokens in production
- **Regularly rotate tokens** if needed
- **Grant minimal permissions** - only share necessary pages/databases

## Unlink Account

To remove the integration:

```bash
notion.unlinkAccount()
```

This will remove the stored token and disconnect the integration.
