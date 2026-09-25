# Budget Tracker — Implementation Guide

## About the Project

A personal budget tracking web app built with Next.js, MongoDB, and Vercel. Mobile-first (bottom nav on mobile, collapsible left sidebar on desktop), with offline-first expense entry that syncs in the background, silent auto-login via access/refresh tokens, Google login, and export to both Excel and the user's own Google Sheets. Visual language is a light-green glassmorphism theme with full light/dark mode support.

---

## Confirmed Feature List

| # | Feature | Notes |
|---|---|---|
| 1 | Expense entry: amount, note, multiple user-created tags | |
| 2 | Dashboard: spend analytics, filterable by date range and/or tag, fully customizable | |
| 3 | Login / register (email + password) | |
| 4 | Google OAuth login | Also grants the Sheets scope up front |
| 5 | Profile page | User info, reset-password flow, **offline sync status**, **Google Sheets sync status**, **tag management (create/edit/delete)** |
| 6 | Auto-login via access + refresh token | No repeated logins |
| 7 | Offline entry with background sync | Must-have for v1 |
| 8 | Light / dark mode | Light-green glassmorphism theme |
| 9 | Reusable, mobile-friendly component library | Modals and buttons sized/behave for touch first |
| 10 | Excel export | |
| 11 | Google Sheets sync | One-way export to the user's own Sheet |
| 12 | Global loading state via React Context | |
| 13 | Trips & Trip Sharing Mode | Dedicated trip budgets, mirrored expenses, and combined share views |
| 14 | Public Dashboard & Spending Breakdown | Read-only shared links with Day/Week/Month bar chart & data table, category progress, and paginated expense list |
| 15 | Smart Expense Sorting & Dynamic Totals | Recent-first addition sorting, dynamic header total responding to active filters |

---

## Tech Stack

- **Framework:** Next.js (App Router), TypeScript
- **Auth:** Auth.js (NextAuth v5) for Google OAuth + a custom credentials flow with your own access/refresh token pair
- **Database:** MongoDB Atlas + Mongoose
- **Offline store:** IndexedDB via Dexie.js (not `localStorage` — see Phase 5)
- **Data fetching / caching:** TanStack Query
- **Charts:** Recharts
- **Excel export:** `exceljs`
- **Google Sheets:** `googleapis`, using the user's own OAuth token
- **Styling:** Tailwind CSS (utility classes map cleanly onto the design tokens below) or CSS Modules — either works with the token system
- **Hosting:** Vercel (app + API routes) + MongoDB Atlas (database)

---

## Environment Variables

Create `.env.local` for development, and mirror every value into Vercel's Project Settings → Environment Variables for production (Vercel does **not** read `.env.local`).

```bash
# --- MongoDB ---
MONGODB_URI=                    # mongodb+srv://<user>:<pass>@cluster.mongodb.net/budget-tracker

# --- Auth.js / NextAuth ---
NEXTAUTH_URL=                   # http://localhost:3000 in dev, https://yourapp.vercel.app in prod
NEXTAUTH_SECRET=                # generate with: openssl rand -base64 32

# --- Google OAuth (login + Sheets access) ---
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Configured in Google Cloud Console → APIs & Services → Credentials.
# Authorized redirect URI: {NEXTAUTH_URL}/api/auth/callback/google
# Scopes to request: openid, email, profile, https://www.googleapis.com/auth/spreadsheets, https://www.googleapis.com/auth/drive.file

# --- Custom access/refresh tokens (email+password auth) ---
JWT_ACCESS_SECRET=              # openssl rand -base64 32
JWT_REFRESH_SECRET=             # a different secret from the above
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d

# --- Transactional email (password reset) ---
EMAIL_SERVER_HOST=
EMAIL_SERVER_PORT=
EMAIL_SERVER_USER=
EMAIL_SERVER_PASSWORD=
EMAIL_FROM=                     # e.g. "Budget Tracker <no-reply@yourdomain.com>"

# --- App ---
NEXT_PUBLIC_APP_URL=            # same as NEXTAUTH_URL, exposed to the client
```

Keep a checked-in `.env.local.example` with the same keys and empty/placeholder values so the shape of the config is documented in the repo without leaking secrets. Never commit `.env.local` itself — confirm it's in `.gitignore`.

---

## Data Model (MongoDB Collections)

```
User
  _id, name, email, passwordHash (null if Google-only), googleId (nullable),
  googleAccessToken, googleRefreshToken (encrypted, for Sheets access),
  sheetsLinked: boolean, sheetsSpreadsheetId (nullable), sheetsLastSyncedAt (nullable),
  createdAt

RefreshToken
  _id, userId, tokenHash, deviceInfo, expiresAt, revokedAt (nullable)

Tag
  _id, userId, name, colorKey

Expense
  _id, userId, amount, note, tagIds: [Tag._id], date, createdAt, updatedAt,
  clientId (UUID from the device, for offline dedup),
  syncStatus: "synced" | "pending" | "conflict"
```

`sheetsLinked` / `sheetsSpreadsheetId` / `sheetsLastSyncedAt` on `User` are what power the Google Sheets status shown on the profile page. `syncStatus` (rolled up across the user's expenses) is what powers the offline sync status indicator there.

---

## Design System — Light Green Glassmorphism

Adapted from the glassmorphism spec you provided: same physical-glass logic (three-layer depth, blurred glass surfaces, top-edge light catch), retuned to a green palette instead of violet, plus mobile-first modal and button rules for the parts your spec didn't cover.

### Palette (light mode)

```css
:root {
  /* Atmosphere — page background field */
  --bg-cream: #F5F0E8;
  --bg-sage-light: #E8F0E9;
  --bg-sage: #DCEBDD;

  /* Text — warm near-blacks, never pure black */
  --text-primary: #16281A;
  --text-secondary: #3A4F3D;
  --text-muted: #7A8C7C;

  /* Accent — the ONE vivid color, green instead of violet */
  --accent: #22C55E;
  --accent-dark: #16A34A;
  --accent-tint: rgba(34, 197, 94, 0.10);

  /* Supporting chart/tag colors — used only inside charts and tags */
  --data-amber: #F59E0B;
  --data-blue: #3B82F6;
  --data-pink: #E879F9;

  /* Glass surfaces */
  --glass-strong-bg: rgba(255,255,255,0.52);
  --glass-mid-bg: rgba(255,255,255,0.38);
  --glass-light-bg: rgba(255,255,255,0.26);
  --glass-border: rgba(255,255,255,0.65);
}
```

### Palette (dark mode)

```css
[data-theme="dark"] {
  --bg-cream: #0F1712;
  --bg-sage-light: #131F17;
  --bg-sage: #17251A;

  --text-primary: #E9F3EA;
  --text-secondary: #B6C9B8;
  --text-muted: #7E9481;

  --accent: #34D976;
  --accent-dark: #22C55E;
  --accent-tint: rgba(52, 217, 118, 0.14);

  --glass-strong-bg: rgba(255,255,255,0.07);
  --glass-mid-bg: rgba(255,255,255,0.05);
  --glass-light-bg: rgba(255,255,255,0.035);
  --glass-border: rgba(255,255,255,0.12);
}
```

Wire theme switching through a `ThemeContext` that toggles `data-theme` on `<html>` and persists the choice (localStorage is fine here — it's a UI preference, not app data).

### Glass card formula (unchanged from your spec, tokenized)

```css
.glass-mid {
  background: var(--glass-mid-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.6),
    0 8px 24px rgba(0,0,0,0.05);
}
```
Keep the rules from your spec as-is: max 2–3 background tones, one accent color only, never stack blur on blur, never exceed `blur(24px)`, top-edge inset highlight on every card.

### The animated ring, applied to this app specifically

Your spec's signature "animated data ring" maps directly onto the dashboard's headline stat: **% of this month's spend against a reference budget (or against last month, if no budget limit is set)**. Same SVG/dashoffset technique as your spec, stroke color set to `var(--accent)`. This becomes the hero element at the top of the dashboard card, with the by-tag breakdown listed below it.

### Mobile-friendly modals (bottom-sheet pattern)

Your spec doesn't cover modals — here's the pattern to use, since you asked for all modals to be mobile-friendly:

- **On mobile (< 640px):** modals render as a **bottom sheet** — slides up from the bottom, rounded top corners only (`border-radius: 20px 20px 0 0`), max-height ~85vh with internal scroll, a small drag-handle bar at the top, and a **sticky footer** holding the primary/secondary action buttons so they're always reachable with a thumb.
- **On desktop (≥ 640px):** the same modal component renders as a centered glass panel (`glass-strong`, `border-radius: 24px`, max-width ~480px).
- Build this as one `<Modal>` component that switches presentation via a CSS media query or a `useMediaQuery` hook — not two separate components — so behavior stays consistent (focus trap, escape-to-close, backdrop tap-to-close) regardless of viewport.
- Respect `env(safe-area-inset-bottom)` in the sticky footer padding so buttons aren't obscured by the home-indicator area on iOS.

### Mobile-friendly buttons

- Minimum tap target: **44×44px** (iOS HIG) / **48×48dp** (Material) — apply as a minimum `height`/`min-width` on the base button component, not just padding, so short-label buttons don't shrink under the threshold.
- Primary buttons in mobile forms and sheets go **full-width**; on desktop they can size to content.
- Keep the same three button tiers from your spec (solid primary in `--accent`, glass ghost secondary, tinted `--accent-tint` tertiary) — just swap every violet reference to the green tokens above.

---

## Suggested Folder Structure

```
app/
  (auth)/login/page.tsx
  (auth)/register/page.tsx
  (app)/expenses/page.tsx
  (app)/dashboard/page.tsx
  (app)/profile/page.tsx          # info, password reset, tags, sync status, Sheets status
  api/
    auth/[...nextauth]/route.ts
    auth/refresh/route.ts
    auth/reset-password/route.ts
    expenses/route.ts
    expenses/sync/route.ts
    tags/route.ts
    export/excel/route.ts
    export/sheets/route.ts
lib/
  db.ts                           # cached Mongoose connection
  auth.ts
  offline/
    db.ts                         # Dexie schema (v6: deleteLogs indexed by entityId)
    useSync.ts                    # online/offline listener, flush + pull loop
    syncQueue/                    # offline sync layer — import via "@/lib/offline/syncQueue"
      index.ts                    # public barrel (only import path callers should use)
      auth.ts                     # auth headers, stored token, silent refresh, isOnline
      directSync.ts               # executeDirectSync, sendOrQueue, reconcileTagMap
      expenses.ts / savings.ts    # queue*Creation / Update / Deletion
      tags.ts                     # tag queue helpers + deduplicateLocalTags
      trips.ts                    # trip queue helpers (cascade delete of tags/expenses)
      deleteLogs.ts               # Recycle Bin: canonical ids, dedup, permanent delete, clear
      recovery.ts                 # recoverDeletedItem
      flush.ts                    # flushSyncQueue, clearAllLocalExpenses
      pull/                       # pullFromServer: trips → tags → expenses → savings → deleteLogs
context/
  LoadingContext.tsx
  ThemeContext.tsx
components/
  layout/Sidebar.tsx
  layout/BottomNav.tsx
  ui/
    Modal.tsx                     # bottom-sheet on mobile, centered on desktop
    Button.tsx
    GlassCard.tsx
    Ring.tsx                      # animated SVG progress ring
models/
  User.ts, Tag.ts, Expense.ts, RefreshToken.ts
```

---

## Step-by-Step Implementation Guide

### Phase 0 — Project Setup
1. `npx create-next-app@latest` (TypeScript, App Router).
2. Create the MongoDB Atlas cluster, get the connection string.
3. Write `lib/db.ts` with the cached-connection pattern (store the connection promise on the Node global object) — this is the standard fix for the intermittent `MongoServerSelectionError` issue that shows up on Vercel when a fresh connection opens on every serverless invocation.
4. Fill in `.env.local` from the Environment Variables section above.

### Phase 1 — Database & Models
1. Define the Mongoose schemas above.
2. Index `Expense` on `{ userId, date }` and `{ userId, tagIds }`; index `Tag` on a unique compound `{ userId, name }`.
3. Build plain CRUD API routes for expenses and tags first, against a hardcoded test user, before wiring up auth.

### Phase 2 — Authentication
1. Auth.js (NextAuth v5), `"jwt"` session strategy, Google provider + Credentials provider.
2. Request the `https://www.googleapis.com/auth/spreadsheets` scope in the Google provider config alongside the standard `openid email profile`, so Sheets access is captured at sign-in time — store the resulting Google access/refresh tokens (encrypted) on the `User` document.
3. Issue your own short-lived access token (~15 min) plus a long-lived refresh token (~30 days) stored hashed in `RefreshToken` and sent to the browser as an `httpOnly`, `secure`, `sameSite=lax` cookie.
4. Build `POST /api/auth/refresh`: validate the refresh cookie against the stored hash, issue a new access token (rotate the refresh token too, if you want full rotation). The client calls this silently on app load — that's what makes auto-login invisible.
5. Password reset: token + expiry hashed and stored, emailed as a link, verified on submission before allowing a new password. Skip this entirely in the UI for Google-only accounts (no `passwordHash`).

### Phase 3 — Expense Entry
1. Tag CRUD first (name + color), since expenses reference tags.
2. Expense form: amount, date, note, multi-select tags with inline "create new tag" support.
3. Route every write through the offline-aware data layer built in Phase 5 from the start, rather than a direct fetch.

### Phase 4 — Dashboard & Analytics
1. One flexible `GET /api/analytics` route: query params for date range, tag ids, and grouping; MongoDB aggregation (`$match` → `$group` → `$sum`).
2. Keep filter state in the URL query string so filtered views are shareable and survive a refresh.
3. Hero stat = the animated ring (see Design System) showing spend progress for the period; supporting Recharts line/bar for the trend, and a by-tag breakdown below.

### Phase 5 — Offline-First Sync
1. Use **IndexedDB via Dexie.js**, not `localStorage` (async, structured data, no ~5–10MB ceiling).
2. Mirror the schema in `lib/offline/db.ts`: local `expenses`, `tags`, and a `syncQueue` table.
3. All reads come from IndexedDB first; fetch from the server in the background and reconcile.
4. All writes land in IndexedDB immediately with a `clientId` and `syncStatus: "pending"`, then get queued.
5. `useSync` hook: listens for `online`/`offline`, flushes the queue via `POST /api/expenses/sync` (keyed by `clientId` for server-side dedup) whenever online.
6. Conflict rule for v1: last-write-wins by `updatedAt`, server timestamp as tiebreaker — reasonable for a single-user app.
7. **Module layout**: the sync layer lives in `lib/offline/syncQueue/` (one file per concern — see the file tree above). Every write goes through `sendOrQueue()` in `directSync.ts`: send directly when online, otherwise (or on failure) append to `db.syncQueue`.
8. **Recycle Bin / delete logs**: each local delete log is stored under the canonical id `del_${entityId}` — at most one row per entity. `writeDeleteLog()` purges any existing rows for the entity before writing, server logs are mapped with `mapServerDeleteLog()`, and `deduplicateDeleteLogs()` (run on mount, after pull, recovery and permanent delete) collapses legacy duplicates and drops logs for entities that are alive again. Server `DELETE /api/delete-logs` and `POST /api/delete-logs/recover` remove all logs matching the `_id` **or** `entityId`.
9. **Delete confirmation**: `ConfirmModal` guards against double-submit with a ref lock; pages clear their "item to delete" state *before* awaiting the queue call so a second click cannot fire the same deletion twice.
10. Roll the per-expense `syncStatus` up into a single overall status ("All synced" / "Syncing…" / "N pending") and surface it on the **profile page**, plus a "last synced" timestamp.

### Phase 6 — Export (Excel + Google Sheets)
1. `GET /api/export/excel`: query the user's (filtered) expenses, build a workbook with `exceljs`, stream it back as an attachment.
2. `POST /api/export/sheets`: using the Google token captured in Phase 2, call the Sheets API (`googleapis`) to create or update a spreadsheet in the user's own Drive:
   - **In-place updates**: when `sheetsSpreadsheetId` is present and valid, update the exact same spreadsheet in Google Drive by clearing old data ranges and writing updated records and summaries, without creating duplicate files.
   - **Delete & fresh resync**: accepts `action: "fresh"` to delete/trash the old file in Google Drive via Drive API and create a brand-new clean sheet.
   - **Token auto-refresh**: listens to `oauth2Client.on("tokens")` and automatically persists refreshed tokens to MongoDB.
   - On success, updates `sheetsLinked`, `sheetsSpreadsheetId`, and `sheetsLastSyncedAt` on the `User` document.
3. Both routes read from the same "get filtered expenses" function the dashboard uses, so there's one source of truth for what counts as the current dataset.

### Phase 7 — Profile Page
This page now does more than account info:
1. **User info + password reset** (or "set a password" for Google-only accounts, as in Phase 2).
2. **Tag management** — full list of the user's tags with rename/delete/recolor actions, and a count of expenses using each tag (so deleting a heavily-used tag can warn before it happens).
3. **Offline sync status** — reads the rolled-up status from Phase 5 ("All synced" / "N pending" / last-synced time).
4. **Google Sheets sync hub** — shows live connection status, "Sync Changes" (in-place update), "Delete & Resync" (modal confirmation to delete old sheet and create fresh), "Unlink", spreadsheet link display, "Copy Link" button, "Open Sheet" button, and "Copy Sheet ID" button.

### Phase 8 — Design System & Theming
1. Set up the CSS custom properties from the Design System section as global tokens (`globals.css` or a Tailwind theme extension).
2. Build the shared primitives once: `GlassCard`, `Button` (with the 44px minimum tap target baked in), `Modal` (bottom-sheet on mobile / centered on desktop), `Ring`.
3. Build `ThemeContext` to toggle `data-theme="dark"` on `<html>` and persist the choice.
4. Everything else (sidebar, bottom nav, forms, dashboard cards) consumes these primitives rather than styling ad hoc — this is what keeps "reusable components" true in practice, not just in the plan.

### Phase 9 — Global Loading State
1. `LoadingContext` exposing `{ isLoading, setLoading }` via a `useLoading()` hook.
2. Wire it into the shared fetch/query layer so pages don't manage loading state manually.
3. One global indicator (top progress bar) plus local skeletons for the dashboard charts specifically.

### Phase 10 — Deployment on Vercel
1. Connect the repo to Vercel; set every variable from the Environment Variables section in Project Settings (not just `.env.local`).
2. Re-confirm the cached MongoDB connection pattern before any load testing.
3. Set `secure: true` and the correct `sameSite` on the refresh-token cookie for the deployed domain — cookie behavior differs between `localhost` and a real Vercel domain.
4. Anything touching IndexedDB or Dexie must live in a `"use client"` component, guarded from running during SSR.
5. Update the Google OAuth authorized redirect URI in Google Cloud Console to include the production `NEXTAUTH_URL`.

### Phase 11 — Public & Trip Dashboard Sharing & Analytics
1. **Public Sharing Route (`app/share/[shareId]/page.tsx`)**:
   - Generates read-only shareable links supporting either monthly views or whole-trip modes.
   - Modular architecture composed of components from `components/share/`:
     - `SharedSpendingBreakdown`: Day, Week, and Month breakdown with interactive Recharts bar chart, detailed table, micro-metric chips (Total Spend, Active Periods, Average Spend, Peak Spend).
     - `SharedExpensesList`: Paginated expense receipts (10 items/page) inside a bounded scroll container (`max-h-[520px] custom-scrollbar`) with sticky date headers in trip mode.
     - `SharedCategoryBreakdown`: Category distribution with progress bars, tag initials, and month navigation.
     - `SharedMetricCards`: Total spend and savings balance indicators.
     - `TripSwitcher`: Switcher for combined trip shares with mobile bottom-sheet and desktop popover.
     - `ExpenseRow` & `FromTripPill`: Itemized transaction rows with mirrored trip indications.
2. **Smart Expense Management**:
   - Expenses ordered by recency of addition (`addedTimestamp`), ensuring newly logged entries always appear at the top.
   - Dynamic total badge in the Expenses page header computing the live sum of filtered items.
3. **Mobile & Viewport Optimization**:
   - Strict zero horizontal overflow across all modals and sliding sheets (`min-w-0`, `max-w-full`, text truncation).
   - Use dynamic viewport units (`100dvh`) to avoid mobile browser navigation bar layout jumps.