import nodemailer from "nodemailer";
import { google } from "googleapis";

const OAuth2 = google.auth.OAuth2;

export const mailer = async () => {
  const {
    EMAIL_CLIENT_ID,
    EMAIL_CLIENT_SECRET,
    EMAIL_REDIRECT_URI,
    EMAIL_REFRESH_TOKEN,
    EMAIL_USER,
  } = process.env;

  if (!EMAIL_CLIENT_ID || !EMAIL_CLIENT_SECRET || !EMAIL_REDIRECT_URI || !EMAIL_REFRESH_TOKEN || !EMAIL_USER) {
    throw new Error("⚠️ Missing email env variables");
  }

  const oauth2Client = new OAuth2(EMAIL_CLIENT_ID, EMAIL_CLIENT_SECRET, EMAIL_REDIRECT_URI);
  oauth2Client.setCredentials({ refresh_token: EMAIL_REFRESH_TOKEN });

  const { token: accessToken } = await oauth2Client.getAccessToken();
  if (!accessToken) throw new Error("❌ INVALID OAUTH TOKEN — regenerate refresh token");

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: EMAIL_USER,
      clientId: EMAIL_CLIENT_ID,
      clientSecret: EMAIL_CLIENT_SECRET,
      refreshToken: EMAIL_REFRESH_TOKEN,
      accessToken,
    },
  });
};
