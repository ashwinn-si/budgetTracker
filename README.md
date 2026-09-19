# Budget Tracker

A personal budget tracking web app built with Next.js, MongoDB, and Vercel. 

## Features
- **Mobile-First Design**: Bottom nav on mobile, collapsible left sidebar on desktop.
- **Offline-First Sync**: Enter expenses completely offline; background sync to MongoDB when reconnected.
- **Detailed Analytics**: Dashboard with spend analytics, filterable by date and tags.
- **Authentication**: Google OAuth and Email/Password with silent auto-login.
- **Public Dashboard Sharing**: Generate a secure, public link to share read-only monthly spending and savings balances with parents or dependents.
- **Exports**: Export data to Excel or sync directly to your personal Google Sheets.
- **Modern UI Patterns**: Mobile-optimized bottom sheets for filters, global toast notifications via `react-hot-toast`, and a sleek light-green glassmorphism aesthetic with full light/dark mode support.

## Tech Stack
- **Frontend**: Next.js (App Router), React, Tailwind CSS, Recharts
- **Backend**: Next.js API Routes, Auth.js (NextAuth), Mongoose (MongoDB)
- **Offline**: Dexie.js (IndexedDB)
- **State Management**: TanStack Query

## Getting Started

### Prerequisites
- Node.js
- MongoDB Atlas account

### Setup Environment
Rename `.env.local.example` to `.env.local` and configure your keys:
```bash
cp .env.local.example .env.local
```

### Install Dependencies & Run
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Development Resources
- [Architecture & Implementation Plan](./implementation.md)
- [Design System Guide](./glassmorphism.md)
- [Agent Instructions](./agent-instructions.md)
