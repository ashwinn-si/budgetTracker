/**
 * Build fetch headers for authenticated API calls.
 *
 * Priority: Authorization header (Bearer token) > cookies (automatic).
 * Sending the Bearer token explicitly makes sync work in browsers that strip
 * or block cookies (Safari ITP, Arc incognito, cross-origin contexts).
 */
export function buildAuthHeaders(accessToken?: string | null): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  return headers;
}

/**
 * Retrieve the stored access token from sessionStorage (persisted there by
 * AuthContext so it survives page reloads within the same tab).
 */
export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem("budget_access_token");
  } catch {
    return null;
  }
}

/**
 * Attempt to refresh the access token silently if an API call returns 401.
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/refresh", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      if (data.accessToken) {
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem("budget_access_token", data.accessToken);
          } catch {}
        }
        return data.accessToken;
      }
    }
  } catch (err) {
    console.error("[auth] Failed to refresh token:", err);
  }
  return null;
}

export function isOnline(): boolean {
  return typeof window !== "undefined" && navigator.onLine;
}
