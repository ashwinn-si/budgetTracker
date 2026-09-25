import { buildAuthHeaders, refreshAccessToken } from "../auth";

/**
 * Shared auth state for one pullFromServer run. A 401 on any GET triggers a
 * single token refresh; the refreshed headers are reused by later steps.
 */
export class PullSession {
  private headers: HeadersInit;

  constructor(accessToken: string | null) {
    this.headers = buildAuthHeaders(accessToken);
  }

  async get(url: string): Promise<Response> {
    let res = await fetch(url, { headers: this.headers });
    if (res.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        this.headers = buildAuthHeaders(refreshedToken);
        res = await fetch(url, { headers: this.headers });
      }
    }
    return res;
  }
}

/** Server ids arrive as ObjectId-like objects or strings; normalise to string. */
export function toIdString(id: unknown): string {
  return (id as { toString(): string })?.toString() ?? String(id);
}

/** Normalise a server date to `YYYY-MM-DD`. */
export function toDateOnly(date: unknown): string {
  return typeof date === "string"
    ? date.split("T")[0]
    : new Date(date as string).toISOString().split("T")[0];
}

export function toIsoOrNow(date: unknown): string {
  return date ? new Date(date as string).toISOString() : new Date().toISOString();
}
