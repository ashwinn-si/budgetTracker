"use client";

import React from "react";
import { Plane } from "lucide-react";
import { useTrip } from "@/context/TripContext";

interface TripSourceBadgeProps {
  tripId: string;
  size?: "sm" | "xs";
  className?: string;
}

export function TripSourceBadge({ tripId, size = "sm", className = "" }: TripSourceBadgeProps) {
  const { getTrip } = useTrip();
  const trip = getTrip(tripId);
  if (!trip) return null;

  const color = trip.colorKey || "#22C55E";
  const sizeClasses =
    size === "xs"
      ? "px-1.5 py-0.5 text-[9px] gap-1"
      : "px-2 py-0.5 text-[10px] gap-1";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium border max-w-[160px] ${sizeClasses} ${className}`}
      style={{
        backgroundColor: `${color}1F`,
        borderColor: `${color}40`,
        color,
      }}
      title={`From ${trip.name}`}
    >
      {trip.emoji ? (
        <span className="shrink-0">{trip.emoji}</span>
      ) : (
        <Plane className={size === "xs" ? "w-2.5 h-2.5 shrink-0" : "w-3 h-3 shrink-0"} />
      )}
      <span className="truncate">From {trip.name}</span>
    </span>
  );
}
