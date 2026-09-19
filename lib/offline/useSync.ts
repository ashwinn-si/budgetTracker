"use client";

import { useState, useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, seedInitialDataIfEmpty } from "./db";
import { flushSyncQueue, pullFromServer } from "./syncQueue";

export type SyncState = "synced" | "syncing" | "pending" | "offline";

export function useSync() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Live count of items in sync queue
  const queueItems = useLiveQuery(() => db.syncQueue.toArray(), []);
  const pendingCount = queueItems?.length || 0;

  // Track online/offline status
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

    // Initial check tags & sync
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

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;

    setIsSyncing(true);
    try {
      const result = await flushSyncQueue();
      await pullFromServer();
      if (result.success) {
        const now = new Date();
        setLastSyncedAt(now);
        localStorage.setItem("budget_last_synced", now.toISOString());
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

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
