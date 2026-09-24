# Agent Instructions for Budget Tracker

## 1. Project Overview
A personal budget tracking web app built with Next.js (App Router), MongoDB, and Vercel. Features a mobile-first design, offline-first expense entry that syncs in the background, silent auto-login via access/refresh tokens, Google login, and export to both Excel and Google Sheets.

## 2. Tech Stack
- **Framework:** Next.js (App Router), TypeScript
- **Auth:** Auth.js (NextAuth v5) + Custom credentials
- **Database:** MongoDB Atlas + Mongoose
- **Offline Store:** IndexedDB via Dexie.js
- **Styling:** Tailwind CSS (Light Green Glassmorphism Theme)
- **Data Fetching:** TanStack Query
- **Charts:** Recharts
- **Hosting:** Vercel

## 3. Key Design Principles (Glassmorphism)
- Use a three-layer depth model: atmosphere (background gradient), diffusion (soft blur behind glass), and surface (the glass panels themselves).
- Glass elements must have top-edge highlight: `inset 0 1px 0 rgba(255,255,255,0.6)`.
- **Colors**: Do not use `#000` or `#fff` for text. Use warm near-blacks (e.g. `#16281A`). The only vivid color is the green accent (`#22C55E`).
- **Typography**: Display/Headings use a warm editorial serif. UI uses clean geometric sans.
- **Components**: Do not use native `alert()` or standard `<select>` tags on mobile. Use `react-hot-toast` for notifications and bottom sliding sheets (like `SelectSheet.tsx`) for dropdowns.
- **Animations**: Only use instant states, or specific on-load SVG drawing / hover translations. Modals use `motion/react` spring physics (damping: 30, stiffness: 320).
- Read `glassmorphism.md` for specific CSS values and aesthetic rules.

## 4. Architectural Rules
- All offline database interactions MUST use Dexie, not `localStorage`.
- All writes land in IndexedDB first, with `syncStatus: "pending"`, and sync in the background.
- Respect Next.js App Router conventions (server vs client components).
- **Expense Ordering**: Expenses must always be presented in descending order of addition (recent first), prioritizing `addedTimestamp` / creation time over older calendar transaction dates.
- **Mobile Responsive Layout & iOS Input Ergonomics**: Enforce `min-w-0`, `max-w-full`, and `overflow-x-hidden` across all modals, pages, and sliding sheets. To strictly prevent iOS Safari from automatically zooming the viewport on focus (which causes horizontal page blowout), all text, number, and date inputs must have a font size of at least `16px` on mobile screens (`text-base sm:text-sm` or global fallback in `globals.css`). WebKit date inputs must normalize with `appearance: none; -webkit-appearance: none; min-width: 0; max-width: 100%;`. Hero amount input rows must be wrapped in `min-w-0 max-w-full overflow-hidden` containers. Use `100dvh` for full mobile viewport heights.
- **Shared Dashboard Architecture**: Public share pages live in `app/share/[shareId]/page.tsx` and must stay modular by consuming components from `components/share/` (`SharedSpendingBreakdown`, `SharedExpensesList`, `SharedCategoryBreakdown`, `SharedMetricCards`, `TripSwitcher`, etc.).
- Google Sheets sync must always update the user's existing spreadsheet in-place (`sheetsSpreadsheetId`) to prevent duplicate sheets, unless a fresh sync (`action: "fresh"`) is explicitly requested. Token auto-refresh events must be persisted to the database.
- Refer to `implementation.md` for detailed step-by-step feature implementations and data model definitions.
