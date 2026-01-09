# Email Setup Guide

This guide explains how to configure the email service to send deed PDFs to users after NFT purchase using Google Workspace Gmail.

## Prerequisites

- A Google Workspace account (or regular Gmail account)
- Access to Google Cloud Console

## Step 1: Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API:
   - Navigate to **APIs & Services** > **Library**
   - Search for "Gmail API"
   - Click on it and press **Enable**

4. Create OAuth 2.0 credentials:
   - Go to **APIs & Services** > **Credentials**
   - Click **Create Credentials** > **OAuth client ID**
   - If prompted, configure the OAuth consent screen:
     - Choose **External** (or Internal if you have Google Workspace)
     - Fill in the required fields (App name, User support email, Developer contact)
     - Add scopes: `https://www.googleapis.com/auth/gmail.send`
     - Add test users if needed (for testing)
   - Application type: Select **Web application**
   - Name: Give it a name (e.g., "WorldTile Email Service")
   - Authorized redirect URIs: Not required for this setup, but you can add:
     ```
     http://localhost:3000/oauth/callback
     ```
   - Click **Create**
   - **Important**: Copy the **Client ID** and **Client Secret** (you'll need these for the `.env` file)

## Step 2: Generate Refresh Token

You need to generate a refresh token using OAuth 2.0. Here's a simple way to do it:

### Option A: Using Google OAuth Playground (Recommended for Quick Setup)

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check **"Use your own OAuth credentials"**
4. Enter your **Client ID** and **Client Secret** from Step 1
5. In the left panel, find **"Gmail API v1"**
6. Select **`https://www.googleapis.com/auth/gmail.send`**
7. Click **Authorize APIs**
8. Sign in with your Google Workspace/Gmail account
9. Click **Allow** to grant permissions
10. Click **Exchange authorization code for tokens**
11. Copy the **Refresh token** (you'll need this for the `.env` file)

### Option B: Using a Node.js Script

Create a temporary script to generate the refresh token:

```javascript
// generate-refresh-token.js
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'http://localhost:3000/oauth/callback'
);

// Generate the URL for authorization
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/gmail.send'],
});

console.log('Authorize this app by visiting this url:', authUrl);

// After authorization, you'll get a code. Exchange it for tokens:
// const { tokens } = await oauth2Client.getToken('AUTHORIZATION_CODE');
// console.log('Refresh token:', tokens.refresh_token);
```

## Step 3: Configure Environment Variables

Add the following variables to your `.env` file:

```env
# Gmail OAuth2 Configuration
GMAIL_USER=your-email@yourdomain.com
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
```

### Explanation of Variables:

- **GMAIL_USER**: The Gmail/Google Workspace email address that will send the emails (e.g., `noreply@yourdomain.com` or `support@yourdomain.com`)
- **GMAIL_CLIENT_ID**: The OAuth 2.0 Client ID from Step 1
- **GMAIL_CLIENT_SECRET**: The OAuth 2.0 Client Secret from Step 1
- **GMAIL_REFRESH_TOKEN**: The refresh token generated in Step 2

## Step 4: Test Email Sending

Once configured, the email service will automatically send emails when:
1. A user completes a purchase
2. An NFT is successfully minted
3. A deed is created

The email will include:
- A congratulatory message
- Deed details (Plot ID, City, Seal Number, etc.)
- The deed PDF as an attachment

## Troubleshooting

### Error: "Invalid credentials"
- Verify that your Client ID, Client Secret, and Refresh Token are correct
- Make sure there are no extra spaces in the `.env` file
- Regenerate the refresh token if needed

### Error: "Access token expired"
- The refresh token should automatically get a new access token
- If issues persist, regenerate the refresh token

### Email not sending
- Check server logs for detailed error messages
- Verify that the Gmail API is enabled in Google Cloud Console
- Ensure the OAuth consent screen is properly configured
- Check that the refresh token has the correct scope (`gmail.send`)

### Rate Limits
- Gmail API has rate limits (default: 1 billion quota units per day)
- Each email sent uses 100 quota units
- You should have plenty of quota, but monitor usage in Google Cloud Console

## Security Notes

- **Never commit** your `.env` file to version control
- Keep your Client Secret and Refresh Token secure
- If compromised, immediately revoke credentials in Google Cloud Console and regenerate
- For production, consider using Google Cloud Secret Manager or similar services

## Email Format

The emails sent include:
- Professional HTML template with WorldTile branding
- Personalized greeting with user's name
- Deed summary (Plot ID, City, Seal Number, Issue Date)
- PDF attachment with the complete deed document
- Congratulations message welcoming the user

## Support

If you encounter issues:
1. Check the server logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test the OAuth credentials using the OAuth Playground
4. Ensure the Gmail API is enabled and the correct scopes are granted

