/**
 * Offline-first sync layer (public API). Import from "@/lib/offline/syncQueue".
 *
 * Module map:
 *   auth.ts        – auth headers, stored token, silent refresh, isOnline
 *   directSync.ts  – executeDirectSync, sendOrQueue, reconcileTagMap
 *   expenses.ts    – queueExpenseCreation / Update / Deletion
 *   savings.ts     – queueSavingCreation / Update / Deletion
 *   tags.ts        – queueTagCreation / Update / Deletion, deduplicateLocalTags
 *   trips.ts       – queueTripCreation / Update / Deletion
 *   deleteLogs.ts  – Recycle Bin: canonical ids, dedup, permanent delete, clear
 *   recovery.ts    – recoverDeletedItem (restore from Recycle Bin)
 *   flush.ts       – flushSyncQueue, clearAllLocalExpenses
 *   pull/          – pullFromServer and per-entity pull steps
 */
export { refreshAccessToken } from "./auth";
export { executeDirectSync, reconcileTagMap } from "./directSync";
export { queueExpenseCreation, queueExpenseUpdate, queueExpenseDeletion } from "./expenses";
export { queueSavingCreation, queueSavingUpdate, queueSavingDeletion } from "./savings";
export { queueTagCreation, queueTagUpdate, queueTagDeletion, deduplicateLocalTags } from "./tags";
export { queueTripCreation, queueTripUpdate, queueTripDeletion } from "./trips";
export {
  deduplicateDeleteLogs,
  permanentDeleteLog,
  clearAllDeleteLogs,
  mapServerDeleteLog,
} from "./deleteLogs";
export { recoverDeletedItem } from "./recovery";
export { flushSyncQueue, clearAllLocalExpenses } from "./flush";
export { pullFromServer } from "./pull";
