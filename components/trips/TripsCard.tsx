"use client";

import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plane,
  Wallet,
  Plus,
  Eye,
  Pencil,
  CheckCircle2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { TripFormModal } from "@/components/trips/TripFormModal";
import { db, LocalTrip, LocalExpense, LocalTag } from "@/lib/offline/db";
import { queueTripUpdate, queueTripDeletion } from "@/lib/offline/syncQueue";
import { useTrip } from "@/context/TripContext";
import { useCurrency } from "@/context/CurrencyContext";
import { GENERAL_TRIP_ID } from "@/lib/trips";
import { formatDate } from "@/lib/dateUtils";

function TripIcon({ trip, className }: { trip: LocalTrip; className?: string }) {
  if (trip.emoji) {
    return <span className={className}>{trip.emoji}</span>;
  }
  if (trip.tripId === GENERAL_TRIP_ID) {
    return <Wallet className={className} />;
  }
  return <Plane className={className} />;
}

const EMPTY_EXPENSES: LocalExpense[] = [];
const EMPTY_TAGS: LocalTag[] = [];

export function TripsCard() {
  const { activeTrips, completedTrips, activeTripId, setActiveTrip, getTrip } = useTrip();
  const { formatAmount } = useCurrency();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<LocalTrip | null>(null);
  const [tripToDelete, setTripToDelete] = useState<LocalTrip | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const rawExpenses = useLiveQuery(() => db.expenses.toArray(), []) ?? EMPTY_EXPENSES;
  const rawTags = useLiveQuery(() => db.tags.toArray(), []) ?? EMPTY_TAGS;

  const statsByTrip = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const exp of rawExpenses) {
      const tripId = exp.tripId || GENERAL_TRIP_ID;
      const entry = map.get(tripId) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += exp.amount || 0;
      map.set(tripId, entry);
    }
    return map;
  }, [rawExpenses]);

  const tagCountByTrip = useMemo(() => {
    const map = new Map<string, number>();
    for (const tag of rawTags) {
      const tripId = tag.tripId || GENERAL_TRIP_ID;
      map.set(tripId, (map.get(tripId) || 0) + 1);
    }
    return map;
  }, [rawTags]);

  const openCreate = () => {
    setEditingTrip(null);
    setIsFormOpen(true);
  };

  const openEdit = (trip: LocalTrip) => {
    setEditingTrip(trip);
    setIsFormOpen(true);
  };

  const handleView = (trip: LocalTrip) => {
    setActiveTrip(trip.tripId);
    toast.success(`Switched to ${trip.name}`);
  };

  const handleToggleComplete = async (trip: LocalTrip) => {
    setTogglingId(trip.tripId);
    try {
      const isCompleting = trip.status !== "completed";
      const updated: LocalTrip = {
        ...trip,
        status: isCompleting ? "completed" : "active",
        completedAt: isCompleting ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      };
      await queueTripUpdate(updated);
      toast.success(isCompleting ? "Trip marked completed" : "Trip reopened");
    } catch (err) {
      console.error("[TripsCard] Failed to toggle trip status:", err);
      toast.error("Failed to update trip");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!tripToDelete || isDeleting) return;
    const toDelete = tripToDelete;
    setTripToDelete(null);
    setIsDeleting(true);
    try {
      const ok = await queueTripDeletion(toDelete.tripId);
      if (ok) {
        toast.success("Trip deleted");
      } else {
        toast.error("Failed to delete trip");
      }
    } catch (err) {
      console.error("[TripsCard] Failed to delete trip:", err);
      toast.error("Failed to delete trip");
    } finally {
      setIsDeleting(false);
    }
  };

  const renderRow = (trip: LocalTrip) => {
    const isCurrent = trip.tripId === activeTripId;
    const isGeneral = trip.tripId === GENERAL_TRIP_ID;
    const isCompleted = trip.status === "completed";
    const stats = statsByTrip.get(trip.tripId) || { count: 0, total: 0 };
    const mirrorNames = (trip.mirrorToTripIds || [])
      .map((id) => getTrip(id)?.name)
      .filter((n): n is string => Boolean(n));
    const isToggling = togglingId === trip.tripId;

    return (
      <div
        key={trip.tripId}
        className="p-3.5 sm:p-4 rounded-2xl bg-white/50 dark:bg-black/30 border border-white/60 dark:border-white/10 hover:border-emerald-500/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
      >
        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
          <div
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 border text-base"
            style={{
              backgroundColor: `${trip.colorKey || "#22C55E"}20`,
              borderColor: `${trip.colorKey || "#22C55E"}40`,
              color: trip.colorKey || "#22C55E",
            }}
          >
            <TripIcon trip={trip} className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] truncate max-w-[180px] sm:max-w-xs">
                {trip.name}
              </h4>
              {isCurrent && (
                <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                  Current
                </span>
              )}
              {trip.isSharingEnabled && (
                <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 shrink-0">
                  Shared
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] mt-1 flex-wrap">
              <span>
                {stats.count} expense{stats.count === 1 ? "" : "s"} • {formatAmount(stats.total)}
              </span>
              {mirrorNames.length > 0 && (
                <>
                  <span>•</span>
                  <span>Counts in: {mirrorNames.join(", ")}</span>
                </>
              )}
              {trip.startDate && (
                <>
                  <span>•</span>
                  <span>
                    {formatDate(trip.startDate)}
                    {trip.endDate ? ` – ${formatDate(trip.endDate)}` : ""}
                  </span>
                </>
              )}
              {isCompleted && trip.completedAt && (
                <>
                  <span>•</span>
                  <span>Completed on {formatDate(trip.completedAt)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/5">
          {!isCurrent && (
            <button
              type="button"
              onClick={() => handleView(trip)}
              aria-label={`View ${trip.name}`}
              title="View"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors cursor-pointer"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => openEdit(trip)}
            aria-label={`Edit ${trip.name}`}
            title="Edit"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Pencil className="w-4 h-4" />
          </button>
          {!isGeneral && (
            <button
              type="button"
              onClick={() => handleToggleComplete(trip)}
              disabled={isToggling}
              aria-label={isCompleted ? `Reopen ${trip.name}` : `Mark ${trip.name} as completed`}
              title={isCompleted ? "Reopen" : "Mark as completed"}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isCompleted ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            </button>
          )}
          {!isGeneral && (
            <button
              type="button"
              onClick={() => setTripToDelete(trip)}
              aria-label={`Delete ${trip.name}`}
              title="Delete"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const deleteStats = tripToDelete ? statsByTrip.get(tripToDelete.tripId) || { count: 0, total: 0 } : null;
  const deleteTagCount = tripToDelete ? tagCountByTrip.get(tripToDelete.tripId) || 0 : 0;

  return (
    <>
      <GlassCard variant="strong" id="trips" className="p-4 sm:p-6 lg:p-7 space-y-5 scroll-mt-24">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-sm border border-emerald-500/20 mt-0.5">
              <Plane className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-xl font-serif-display font-medium text-[var(--text-primary)] leading-snug">
                Trips
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                Organize expenses by trip or event, and choose which trips share expenses.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openCreate}
            icon={<Plus className="w-3.5 h-3.5" />}
            className="shrink-0 text-xs px-2.5 sm:px-3 h-8 sm:h-9"
          >
            New trip
          </Button>
        </div>

        <div className="max-h-[360px] overflow-y-auto custom-scrollbar p-1 -m-1 space-y-5">
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Active
            </label>
            <div className="space-y-2.5">{activeTrips.map(renderRow)}</div>
          </div>

          {completedTrips.length > 0 && (
            <div className="space-y-2 pt-1 border-t border-black/5 dark:border-white/5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] pt-3">
                Completed ({completedTrips.length})
              </label>
              <div className="space-y-2.5">{completedTrips.map(renderRow)}</div>
            </div>
          )}
        </div>
      </GlassCard>

      <TripFormModal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} trip={editingTrip || undefined} />

      <ConfirmModal
        isOpen={!!tripToDelete}
        onClose={() => setTripToDelete(null)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        variant="danger"
        title={`Delete ${tripToDelete?.name}?`}
        message={`${deleteStats?.count ?? 0} expense${deleteStats?.count === 1 ? "" : "s"} and ${deleteTagCount} categor${deleteTagCount === 1 ? "y" : "ies"} will move to the Recycle Bin.`}
        confirmText="Delete trip"
      />
    </>
  );
}
