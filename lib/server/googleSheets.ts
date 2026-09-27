import { google } from "googleapis";
import { IUser } from "@/models/User";

const MAX_SPREADSHEET_TITLE_LENGTH = 150;

// Builds Sheets/Drive clients for the user and persists any refreshed OAuth tokens back to the database.
export function createGoogleClients(user: IUser) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken || undefined,
  });

  oauth2Client.on("tokens", async (tokens) => {
    try {
      let changed = false;
      if (tokens.access_token && tokens.access_token !== user.googleAccessToken) {
        user.googleAccessToken = tokens.access_token;
        changed = true;
      }
      if (tokens.refresh_token && tokens.refresh_token !== user.googleRefreshToken) {
        user.googleRefreshToken = tokens.refresh_token;
        changed = true;
      }
      if (changed) {
        await user.save();
      }
    } catch (tokenErr) {
      console.warn("Failed to update refreshed Google OAuth tokens:", tokenErr);
    }
  });

  return {
    sheets: google.sheets({ version: "v4", auth: oauth2Client }),
    drive: google.drive({ version: "v3", auth: oauth2Client }),
  };
}

// Each trip has its own spreadsheet, e.g. "Budget Tracker - Goa".
export function tripSpreadsheetTitle(tripName: string): string {
  return `Budget Tracker - ${tripName}`.slice(0, MAX_SPREADSHEET_TITLE_LENGTH);
}

// A1-notation sheet reference; single quotes inside the title must be doubled.
export function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

export function isNotFoundError(err: unknown): boolean {
  const e = err as { code?: number; status?: number } | null;
  return e?.code === 404 || e?.status === 404;
}

export function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

// Moves a spreadsheet to Drive trash (recoverable for 30 days). Best effort; never throws.
export async function trashSpreadsheet(user: IUser, spreadsheetId: string): Promise<void> {
  if (!user.googleAccessToken) return;
  try {
    const { drive } = createGoogleClients(user);
    await drive.files.update({ fileId: spreadsheetId, requestBody: { trashed: true } });
  } catch (err) {
    if (!isNotFoundError(err)) console.warn(`Could not trash spreadsheet ${spreadsheetId}:`, err);
  }
}

// Renames a spreadsheet. Best effort; returns false if it failed (a missing file counts as done).
export async function renameSpreadsheet(user: IUser, spreadsheetId: string, title: string): Promise<boolean> {
  if (!user.googleAccessToken) return false;
  try {
    const { sheets } = createGoogleClients(user);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ updateSpreadsheetProperties: { properties: { title }, fields: "title" } }],
      },
    });
    return true;
  } catch (err) {
    if (isNotFoundError(err)) return true;
    console.warn(`Could not rename spreadsheet ${spreadsheetId}:`, err);
    return false;
  }
}
