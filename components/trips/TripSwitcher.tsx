"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Wallet, Plane } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { useTrip } from "@/context/TripContext";
import { GENERAL_TRIP_ID } from "@/lib/trips";
import { LocalTrip } from "@/lib/offline/db";

interface TripSwitcherProps {
  variant: "desktop" | "mobile" | "compact";
  className?: string;
}

function TripIcon({ trip, className }: { trip: LocalTrip; className?: string }) {
  if (trip.emoji) {
    return <span className={className}>{trip.emoji}</span>;
  }
  if (trip.tripId === GENERAL_TRIP_ID) {
    return <Wallet className={className} />;
  }
  return <Plane className={className} />;
}

export function TripSwitcher({ variant, className = "" }: TripSwitcherProps) {
  const router = useRouter();
  const { trips, activeTrips, completedTrips, activeTripId, activeTrip, setActiveTrip, getTrip } = useTrip();
  const [isOpen, setIsOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const hasOtherActiveTrips = activeTrips.some((t) => t.tripId !== GENERAL_TRIP_ID);
  const hasOtherTrips = trips.some((t) => t.tripId !== GENERAL_TRIP_ID);

  if (variant === "desktop" || variant === "compact") {
    if (!hasOtherTrips) return null;
  } else {
    if (!hasOtherActiveTrips && activeTripId === GENERAL_TRIP_ID) return null;
  }

  const isViewingCompleted = activeTrip.status === "completed";

  const handleSelect = (tripId: string) => {
    const trip = getTrip(tripId);
    setActiveTrip(tripId);
    setIsOpen(false);
    toast.success(`Switched to ${trip?.name || "trip"}`);
  };

  const handleManageTrips = () => {
    setIsOpen(false);
    router.push("/profile#trips");
  };

  const desktopActiveTrips = trips.filter((t) => t.status === "active");

  const renderOptionRow = (trip: LocalTrip, isSelected: boolean) => (
    <button
      key={trip.tripId}
      type="button"
      onClick={() => handleSelect(trip.tripId)}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left text-sm transition-colors ${
        isSelected
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-semibold"
          : "hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-primary)]"
      }`}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: trip.colorKey || "#22C55E" }}
        />
        <TripIcon trip={trip} className="w-4 h-4 shrink-0" />
        <span className="truncate">{trip.name}</span>
      </span>
      {isSelected && <Check className="w-4 h-4 shrink-0" />}
    </button>
  );

  const modal = (
    <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Switch trip" maxWidth="sm">
      <div className="max-h-[50vh] overflow-y-auto custom-scrollbar -mx-2 px-2 space-y-1">
        {variant === "mobile" ? (
          <>
            {isViewingCompleted && (
              <div className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-black/5 dark:bg-white/5 text-sm mb-1">
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: activeTrip.colorKey || "#22C55E" }}
                  />
                  <TripIcon trip={activeTrip} className="w-4 h-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[var(--text-primary)]">
                      {activeTrip.name}
                    </span>
                    <span className="block text-[11px] text-[var(--text-muted)]">
                      Currently viewing · completed
                    </span>
                  </span>
                </span>
                <Check className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              </div>
            )}
            {activeTrips.map((trip) => renderOptionRow(trip, trip.tripId === activeTripId))}
          </>
        ) : (
          <>
            {desktopActiveTrips.map((trip) => renderOptionRow(trip, trip.tripId === activeTripId))}

            {completedTrips.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowCompleted((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <span>Completed ({completedTrips.length})</span>
                  {showCompleted ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
                {showCompleted && (
                  <div className="space-y-1 mt-1">
                    {completedTrips.map((trip) => renderOptionRow(trip, trip.tripId === activeTripId))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={handleManageTrips}
        className="w-full mt-3 pt-3 border-t border-black/[0.06] dark:border-white/10 text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer"
      >
        Manage trips
      </button>
    </Modal>
  );

  if (variant === "compact") {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title={activeTrip.name}
          aria-label={`Switch trip (current: ${activeTrip.name})`}
          className={`w-12 h-12 mx-auto flex items-center justify-center rounded-2xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer ${className}`}
        >
          <TripIcon trip={activeTrip} className="w-5 h-5" />
        </button>
        {modal}
      </>
    );
  }

  if (variant === "mobile") {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-xs text-[var(--text-primary)] shrink-0 ${className}`}
        >
          <TripIcon trip={activeTrip} className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate max-w-[9rem]">{activeTrip.name}</span>
          <ChevronDown className="w-3 h-3 shrink-0 text-[var(--text-muted)]" />
        </button>
        {modal}
      </>
    );
  }

  // desktop
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-xs sm:text-sm font-medium bg-white/60 dark:bg-black/40 border border-white/60 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 text-[var(--text-primary)] cursor-pointer hover:bg-white/80 dark:hover:bg-black/60 transition-all shadow-xs ${className}`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <TripIcon trip={activeTrip} className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
          <span className="truncate">{activeTrip.name}</span>
        </span>
        <ChevronDown className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
      </button>
      {modal}
    </>
  );
}
