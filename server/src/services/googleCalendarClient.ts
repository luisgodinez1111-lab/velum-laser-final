import { GoogleCalendarIntegration } from "@prisma/client";
import { OAuth2Client } from "google-auth-library";
import { calendar_v3, google } from "googleapis";
import { withTenantContext } from "../db/withTenantContext";
import { decrypt, encrypt } from "../utils/crypto";
import { env } from "../utils/env";
import { logger } from "../utils/logger";
import { reportError } from "../utils/errorReporter";

/** Detecta refresh token revocado/expirado (OAuth error `invalid_grant`). */
const isInvalidGrant = (err: unknown): boolean =>
  /invalid_grant/i.test(err instanceof Error ? err.message : String(err));

const getGoogleOAuthRuntimeConfig = () => {
  return {
    clientId: env.googleClientId,
    clientSecret: env.googleClientSecret,
    redirectUri: env.googleRedirectUri,
  };
};

const isPlaceholderValue = (value: string) => value.trim().startsWith("REEMPLAZA_");

export const isGoogleCalendarConfigured = (config = getGoogleOAuthRuntimeConfig()): boolean => {
  const { clientId, clientSecret, redirectUri } = config;
  return !!(clientId && clientSecret && redirectUri &&
    !isPlaceholderValue(clientId) && !isPlaceholderValue(clientSecret));
};

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

  if (!changed) return integration;

  return withTenantContext(async (tx) => tx.googleCalendarIntegration.update({
    where: { id: integration.id },
    data: {
      accessTokenEnc: encrypt(nextAccessToken),
      refreshTokenEnc: encrypt(nextRefreshToken),
      tokenExpiry: nextTokenExpiry
    }
  }));
};

export const withGoogleCalendarClient = async <T>(
  integration: GoogleCalendarIntegration,
  runner: (args: { oauth2Client: OAuth2Client; calendar: calendar_v3.Calendar }) => Promise<T>
): Promise<T> => {
  const { oauth2Client, calendar } = createCalendarClientFromIntegration(integration);
  try {
    await oauth2Client.getAccessToken();
    const result = await runner({ oauth2Client, calendar });
    await persistUpdatedGoogleTokens(integration, oauth2Client);
    return result;
  } catch (err) {
    // invalid_grant = refresh token revocado/expirado: la sincronización no puede
    // funcionar hasta reconectar. Desactivamos la integración (evita reintentar 8×
    // por cada job en silencio y divergir la agenda) y alertamos para reconexión.
    if (isInvalidGrant(err) && integration.isActive) {
      await withTenantContext(async (tx) => tx.googleCalendarIntegration.update({
        where: { id: integration.id },
        data: { isActive: false, watchChannelId: null, watchResourceId: null },
      })).catch((e) => logger.error({ err: e, integrationId: integration.id }, "[gcal] no se pudo desactivar integración tras invalid_grant"));
      logger.error({ integrationId: integration.id, clinicId: integration.clinicId }, "[gcal] invalid_grant — integración DESACTIVADA; requiere reconexión de Google Calendar");
      reportError(err instanceof Error ? err : new Error(String(err)), { context: "google-calendar.invalid_grant", integrationId: integration.id });
    }
    throw err;
  }
};
