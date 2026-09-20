"use client";

import { useState, useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, seedInitialDataIfEmpty } from "./db";
import { flushSyncQueue, pullFromServer } from "./syncQueue";

export type SyncState = "synced" | "syncing" | "pending" | "offline";

interface UseSyncOptions {
  /**
   * JWT access token from AuthContext. When provided it is forwarded to every
   * sync/pull request as `Authorization: Bearer <token>`, making sync work in
   * browsers that strip or restrict cookies (Safari ITP, Arc, etc.).
   */
  accessToken?: string | null;
}

export function useSync({ accessToken }: UseSyncOptions = {}) {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Live count of items in sync queue
  const queueItems = useLiveQuery(() => db.syncQueue.toArray(), []);
  const pendingCount = queueItems?.length || 0;

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;

    setIsSyncing(true);
    try {
      // Pass the access token so requests carry the Authorization header.
      // flushSyncQueue / pullFromServer also fall back to sessionStorage so
      // this works even before the AuthContext token is available (e.g., on
      // initial mount before the silent-refresh response comes back).
      const result = await flushSyncQueue(accessToken);
      await pullFromServer(accessToken);
      if (result.success) {
        const now = new Date();
        setLastSyncedAt(now);
        localStorage.setItem("budget_last_synced", now.toISOString());
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, accessToken]);

  // Track online/offline status + boot sync
  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial seed + sync on mount
    seedInitialDataIfEmpty().then(() => {
      triggerSync();
    });

    const savedLastSync = localStorage.getItem("budget_last_synced");
    if (savedLastSync) {
      setLastSyncedAt(new Date(savedLastSync));
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Auto-sync: whenever items appear in the queue, flush them after a short
  // debounce so users never have to hit "Sync" manually
  useEffect(() => {
    if (pendingCount === 0 || isSyncing || !isOnline) return;
    const timer = setTimeout(() => {
      triggerSync();
    }, 1500);
    return () => clearTimeout(timer);
  }, [pendingCount, isOnline, triggerSync]);

  let status: SyncState = "synced";
  if (!isOnline) {
    status = "offline";
  } else if (isSyncing) {
    status = "syncing";
  } else if (pendingCount > 0) {
    status = "pending";
  }

  return {
    isOnline,
    isSyncing,
    status,
    pendingCount,
    lastSyncedAt,
    syncNow: triggerSync,
  };
}
