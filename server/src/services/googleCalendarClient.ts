import { GoogleCalendarIntegration } from "@prisma/client";
import { OAuth2Client } from "google-auth-library";
import { calendar_v3, google } from "googleapis";
import { prisma } from "../db/prisma";
import { decrypt, encrypt } from "../utils/crypto";
import { env } from "../utils/env";

const getGoogleOAuthRuntimeConfig = () => {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || env.googleClientId,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || env.googleClientSecret,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || env.googleRedirectUri
  };
};

const isPlaceholderValue = (value: string) => value.trim().startsWith("REEMPLAZA_");

export const assertGoogleCalendarEnv = (config = getGoogleOAuthRuntimeConfig()) => {
  const { clientId, clientSecret, redirectUri } = config;
  if (
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    isPlaceholderValue(clientId) ||
    isPlaceholderValue(clientSecret)
  ) {
    throw new Error("Google Calendar integration env vars are missing or still placeholders");
  }
};

export const createGoogleOAuthClient = () => {
  const config = getGoogleOAuthRuntimeConfig();
  assertGoogleCalendarEnv(config);
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
};

export const createCalendarClientFromIntegration = (integration: GoogleCalendarIntegration) => {
  const oauth2Client = createGoogleOAuthClient();
  oauth2Client.setCredentials({
    access_token: decrypt(integration.accessTokenEnc),
    refresh_token: decrypt(integration.refreshTokenEnc),
    expiry_date: integration.tokenExpiry?.getTime()
  });

  return {
    oauth2Client,
    calendar: google.calendar({ version: "v3", auth: oauth2Client })
  };
};

export const persistUpdatedGoogleTokens = async (
  integration: GoogleCalendarIntegration,
  oauth2Client: OAuth2Client
): Promise<GoogleCalendarIntegration> => {
  const credentials = oauth2Client.credentials;

  const decryptedExistingAccess = decrypt(integration.accessTokenEnc);
  const decryptedExistingRefresh = decrypt(integration.refreshTokenEnc);

  const nextAccessToken = credentials.access_token ?? decryptedExistingAccess;
  const nextRefreshToken = credentials.refresh_token ?? decryptedExistingRefresh;
  const nextTokenExpiry = credentials.expiry_date ? new Date(credentials.expiry_date) : integration.tokenExpiry;

  const changed =
    nextAccessToken !== decryptedExistingAccess ||
    nextRefreshToken !== decryptedExistingRefresh ||
    (nextTokenExpiry?.getTime() ?? null) !== (integration.tokenExpiry?.getTime() ?? null);

  if (!changed) {
    return integration;
  }

  return prisma.googleCalendarIntegration.update({
    where: { id: integration.id },
    data: {
      accessTokenEnc: encrypt(nextAccessToken),
      refreshTokenEnc: encrypt(nextRefreshToken),
      tokenExpiry: nextTokenExpiry
    }
  });
};

export const withGoogleCalendarClient = async <T>(
  integration: GoogleCalendarIntegration,
  runner: (args: { oauth2Client: OAuth2Client; calendar: calendar_v3.Calendar }) => Promise<T>
): Promise<T> => {
  const { oauth2Client, calendar } = createCalendarClientFromIntegration(integration);

  // Trigger token refresh flow when needed before using Calendar API.
  await oauth2Client.getAccessToken();

  const result = await runner({ oauth2Client, calendar });
  await persistUpdatedGoogleTokens(integration, oauth2Client);

  return result;
};
