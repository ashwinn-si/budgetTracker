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
- **Animations**: Only use instant states, or specific on-load SVG drawing / hover translations. No drifting background orbs.
- Read `glassmorphism.md` for specific CSS values and aesthetic rules.

## 4. Architectural Rules
- All offline database interactions MUST use Dexie, not `localStorage`.
- All writes land in IndexedDB first, with `syncStatus: "pending"`, and sync in the background.
- Respect Next.js App Router conventions (server vs client components).
- Refer to `implementation.md` for detailed step-by-step feature implementations and data model definitions.
