"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useAuth } from "./AuthContext";
import { db, ensureLocalGeneralTrip, LocalTrip } from "@/lib/offline/db";
import { GENERAL_TRIP_ID } from "@/lib/trips";

const GENERAL_PLACEHOLDER: LocalTrip = {
  tripId: GENERAL_TRIP_ID,
  userId: "",
  name: "General",
  emoji: "",
  colorKey: "#22C55E",
  isDefault: true,
  status: "active",
  mirrorToTripIds: [],
};

interface TripContextType {
  trips: LocalTrip[];
  activeTrips: LocalTrip[];
  completedTrips: LocalTrip[];
  activeTripId: string;
  activeTrip: LocalTrip;
  setActiveTrip: (tripId: string) => void;
  getTrip: (tripId: string) => LocalTrip | undefined;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

function readStoredActiveTripId(): string {
  if (typeof window === "undefined") return GENERAL_TRIP_ID;
  try {
    return localStorage.getItem("budget_active_trip_id") || GENERAL_TRIP_ID;
  } catch {
    return GENERAL_TRIP_ID;
  }
}

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const rawTrips = useLiveQuery(() => db.trips.toArray(), []);
  const [activeTripId, setActiveTripId] = useState<string>(readStoredActiveTripId);

  const trips = useMemo(() => {
    return [...(rawTrips ?? [])].sort((a, b) => {
      if (a.tripId === GENERAL_TRIP_ID) return -1;
      if (b.tripId === GENERAL_TRIP_ID) return 1;
      if (!a.createdAt && !b.createdAt) return 0;
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [rawTrips]);

  const activeTrips = useMemo(() => trips.filter((t) => t.status === "active"), [trips]);
  const completedTrips = useMemo(() => trips.filter((t) => t.status === "completed"), [trips]);

  useEffect(() => {
    if (user?.id) {
      ensureLocalGeneralTrip(user.id);
    }
  }, [user?.id]);

  // Once trips have loaded, fall back to General if the stored active trip no longer exists.
  const resolvedActiveTripId = useMemo(() => {
    if (trips.length === 0) return activeTripId;
    const found = trips.some((t) => t.tripId === activeTripId);
    return found ? activeTripId : GENERAL_TRIP_ID;
  }, [trips, activeTripId]);

  useEffect(() => {
    if (resolvedActiveTripId === activeTripId) return;
    try {
      localStorage.setItem("budget_active_trip_id", resolvedActiveTripId);
    } catch {}
  }, [resolvedActiveTripId, activeTripId]);

  const setActiveTrip = useCallback((tripId: string) => {
    setActiveTripId(tripId);
    try {
      localStorage.setItem("budget_active_trip_id", tripId);
    } catch {}
  }, []);

  const getTrip = useCallback((tripId: string) => trips.find((t) => t.tripId === tripId), [trips]);

  const activeTrip = useMemo(
    () => getTrip(resolvedActiveTripId) || GENERAL_PLACEHOLDER,
    [getTrip, resolvedActiveTripId]
  );

  return (
    <TripContext.Provider
      value={{
        trips,
        activeTrips,
        completedTrips,
        activeTripId: resolvedActiveTripId,
        activeTrip,
        setActiveTrip,
        getTrip,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const context = useContext(TripContext);
  if (!context) {
    throw new Error("useTrip must be used within a TripProvider");
  }
  return context;
}
