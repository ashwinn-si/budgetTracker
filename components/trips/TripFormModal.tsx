"use client";

import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Calendar as CalendarIcon, X } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { db, LocalTrip, LocalTag } from "@/lib/offline/db";
import { queueTripCreation, queueTripUpdate } from "@/lib/offline/syncQueue";
import { useAuth } from "@/context/AuthContext";
import { useTrip } from "@/context/TripContext";
import { GENERAL_TRIP_ID, generateTripId, canMirrorInto } from "@/lib/trips";
import { PRESET_COLORS } from "@/lib/colors";
import { formatDate } from "@/lib/dateUtils";

const QUICK_EMOJIS = ["✈️", "🏖️", "🏔️", "🏕️", "🚗", "🎒", "🌍", "🏙️", "🎉", "💼"];

const EMPTY_TAGS: LocalTag[] = [];

function countGraphemes(value: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(value)].length;
  }
  return [...value].length;
}

interface TripFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip?: LocalTrip;
}

export function TripFormModal({ isOpen, onClose, trip }: TripFormModalProps) {
  const { user } = useAuth();
  const { trips, setActiveTrip } = useTrip();
  const isEdit = Boolean(trip);
  const openKey = isOpen ? trip?.tripId || "__create__" : null;

  const [newTripId, setNewTripId] = useState<string>(() => trip?.tripId || generateTripId());

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [colorKey, setColorKey] = useState(PRESET_COLORS[0]);
  const [copyTagsFromTripId, setCopyTagsFromTripId] = useState<string | null>(null);
  const [mirrorToTripIds, setMirrorToTripIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Re-initialize form fields whenever the modal opens for a (possibly different) trip,
  // without resetting on every render. Adjusting state during render (React's recommended
  // pattern for this) instead of in an effect avoids an extra render pass.
  const [lastOpenKey, setLastOpenKey] = useState<string | null>(null);
  if (openKey === null && lastOpenKey !== null) {
    setLastOpenKey(null);
  }
  if (openKey !== null && openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    setNewTripId(trip?.tripId || generateTripId());
    if (trip) {
      setName(trip.name);
      setEmoji(trip.emoji || "");
      setColorKey(trip.colorKey || PRESET_COLORS[0]);
      setMirrorToTripIds(trip.mirrorToTripIds || []);
      setStartDate(trip.startDate || null);
      setEndDate(trip.endDate || null);
    } else {
      setName("");
      setEmoji("");
      setColorKey(PRESET_COLORS[0]);
      setCopyTagsFromTripId(null);
      setMirrorToTripIds([]);
      setStartDate(null);
      setEndDate(null);
    }
    setError(null);
  }

  const allTags = useLiveQuery(() => db.tags.toArray(), []) ?? EMPTY_TAGS;

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tag of allTags) {
      const tId = tag.tripId || GENERAL_TRIP_ID;
      counts.set(tId, (counts.get(tId) || 0) + 1);
    }
    return counts;
  }, [allTags]);

  const sortedTrips = useMemo(() => {
    return [...trips].sort((a, b) => {
      if (a.tripId === GENERAL_TRIP_ID) return -1;
      if (b.tripId === GENERAL_TRIP_ID) return 1;
      return 0;
    });
  }, [trips]);

  const mirrorCandidates = sortedTrips.filter((t) => t.tripId !== newTripId);

  const toggleMirror = (targetTripId: string) => {
    setMirrorToTripIds((prev) =>
      prev.includes(targetTripId) ? prev.filter((id) => id !== targetTripId) : [...prev, targetTripId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Trip name is required.");
      return;
    }
    if (trimmedName.length > 40) {
      setError("Trip name must be 40 characters or fewer.");
      return;
    }
    if (!user?.id) {
      setError("You must be signed in.");
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      if (isEdit && trip) {
        const updatedTrip: LocalTrip = {
          ...trip,
          name: trimmedName,
          emoji,
          colorKey,
          mirrorToTripIds,
          startDate,
          endDate,
          updatedAt: nowIso,
        };
        await queueTripUpdate(updatedTrip);
        toast.success("Trip updated");
      } else {
        const newTrip: LocalTrip = {
          tripId: newTripId,
          userId: user.id,
          name: trimmedName,
          emoji,
          colorKey,
          isDefault: false,
          status: "active",
          completedAt: null,
          mirrorToTripIds,
          startDate,
          endDate,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        await queueTripCreation(newTrip, {
          copyTagsFromTripId: copyTagsFromTripId || undefined,
        });
        setActiveTrip(newTrip.tripId);
        toast.success("Trip created");
      }
      onClose();
    } catch (err) {
      console.error("[TripFormModal] Failed to save trip:", err);
      toast.error("Failed to save trip");
    } finally {
      setIsSaving(false);
    }
  };

  const dateInputButton = (
    label: string,
    value: string | null,
    onOpen: () => void
  ) => (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center justify-between px-4 py-2.5 text-xs sm:text-sm font-medium bg-white/60 dark:bg-black/40 border border-white/60 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 text-[var(--text-primary)] cursor-pointer hover:bg-white/80 dark:hover:bg-black/60 transition-all shadow-xs"
    >
      <span className="flex items-center gap-2 truncate text-[var(--text-muted)]">
        <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
        <span className={value ? "text-[var(--text-primary)]" : ""}>
          {value ? formatDate(value) : label}
        </span>
      </span>
    </button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit trip" : "New trip"}
      subtitle={isEdit ? "Update this trip's details" : "Track expenses for a specific trip or event"}
      maxWidth="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            type="submit"
            form="trip-form"
            variant="primary"
            isLoading={isSaving}
            className="w-full sm:w-auto"
          >
            {isEdit ? "Save changes" : "Create trip"}
          </Button>
        </>
      }
    >
      <form id="trip-form" onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Trip name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="e.g., Japan 2026, Goa Weekend..."
            maxLength={40}
            autoFocus
            className="w-full px-4 py-3 rounded-2xl bg-white/80 dark:bg-black/25 border border-black/[0.08] dark:border-white/10 focus:border-emerald-500 focus:ring-3 focus:ring-emerald-500/20 outline-none text-sm text-[var(--text-primary)] transition-all shadow-xs"
          />
          {error && <p className="text-xs text-rose-500 mt-1.5">{error}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Emoji
          </label>
          <input
            type="text"
            value={emoji}
            onChange={(e) => {
              const val = e.target.value;
              if (countGraphemes(val) <= 2) setEmoji(val);
            }}
            placeholder="✈️"
            className="w-20 px-3 py-2.5 rounded-2xl bg-white/80 dark:bg-black/25 border border-black/[0.08] dark:border-white/10 focus:border-emerald-500 focus:ring-3 focus:ring-emerald-500/20 outline-none text-lg text-center text-[var(--text-primary)] transition-all shadow-xs mb-2.5"
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_EMOJIS.map((qe) => (
              <button
                key={qe}
                type="button"
                onClick={() => setEmoji(qe)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-base transition-all cursor-pointer border ${
                  emoji === qe
                    ? "bg-emerald-500/15 border-emerald-500 scale-105 shadow-sm"
                    : "bg-white/40 dark:bg-black/30 border-black/5 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/5"
                }`}
              >
                {qe}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Colour
          </label>
          <div className="flex flex-wrap gap-2.5">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setColorKey(color)}
                style={{ backgroundColor: color }}
                className={`w-8 h-8 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                  colorKey === color
                    ? "ring-3 ring-offset-2 ring-emerald-500 scale-110 shadow-md"
                    : "opacity-80 hover:opacity-100 hover:scale-105"
                }`}
              />
            ))}
          </div>
        </div>

        {!isEdit && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Copy categories from
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCopyTagsFromTripId(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                  copyTagsFromTripId === null
                    ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-semibold"
                    : "bg-black/5 dark:bg-white/5 border-transparent text-[var(--text-secondary)] hover:bg-black/10 dark:hover:bg-white/10"
                }`}
              >
                Don&apos;t copy
              </button>
              {sortedTrips.map((t) => (
                <button
                  key={t.tripId}
                  type="button"
                  onClick={() => setCopyTagsFromTripId(t.tripId)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer border ${
                    copyTagsFromTripId === t.tripId
                      ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-semibold"
                      : "bg-black/5 dark:bg-white/5 border-transparent text-[var(--text-secondary)] hover:bg-black/10 dark:hover:bg-white/10"
                  }`}
                >
                  {t.name} ({categoryCounts.get(t.tripId) || 0})
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Also count expenses in
          </label>
          <p className="text-xs text-[var(--text-muted)] mb-2.5 leading-relaxed">
            Expenses added to this trip will also show up in the selected trips.
          </p>
          <div className="flex flex-wrap gap-2">
            {mirrorCandidates.map((t) => {
              const selected = mirrorToTripIds.includes(t.tripId);
              const disabled = !canMirrorInto(trips, newTripId, t.tripId);
              return (
                <button
                  key={t.tripId}
                  type="button"
                  disabled={disabled}
                  title={disabled ? "Already counts in this trip" : undefined}
                  onClick={() => toggleMirror(t.tripId)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                    disabled
                      ? "opacity-40 cursor-not-allowed bg-black/5 dark:bg-white/5 border-transparent text-[var(--text-muted)]"
                      : selected
                      ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-semibold cursor-pointer"
                      : "bg-black/5 dark:bg-white/5 border-transparent text-[var(--text-secondary)] hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
            {mirrorCandidates.length === 0 && (
              <p className="text-xs text-[var(--text-muted)]">No other trips yet.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Start date
            </label>
            {dateInputButton("Optional", startDate, () => setStartPickerOpen((v) => !v))}
            {startPickerOpen && (
              <div className="absolute z-20 mt-2 p-3 bg-[var(--surface-overlay)] backdrop-blur-xl border border-[var(--border-subtle)] rounded-2xl shadow-2xl text-[var(--text-primary)]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Start date
                  </span>
                  <button
                    type="button"
                    onClick={() => setStartPickerOpen(false)}
                    className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <DayPicker
                  mode="single"
                  selected={startDate ? new Date(startDate) : undefined}
                  onSelect={(d) => {
                    setStartDate(d ? d.toISOString().slice(0, 10) : null);
                    setStartPickerOpen(false);
                  }}
                  styles={{ root: { margin: 0, fontSize: "13px" } }}
                />
                {startDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate(null);
                      setStartPickerOpen(false);
                    }}
                    className="w-full mt-2 text-xs text-rose-500 hover:text-rose-600"
                  >
                    Clear date
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              End date
            </label>
            {dateInputButton("Optional", endDate, () => setEndPickerOpen((v) => !v))}
            {endPickerOpen && (
              <div className="absolute z-20 mt-2 p-3 bg-[var(--surface-overlay)] backdrop-blur-xl border border-[var(--border-subtle)] rounded-2xl shadow-2xl text-[var(--text-primary)]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    End date
                  </span>
                  <button
                    type="button"
                    onClick={() => setEndPickerOpen(false)}
                    className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <DayPicker
                  mode="single"
                  selected={endDate ? new Date(endDate) : undefined}
                  onSelect={(d) => {
                    setEndDate(d ? d.toISOString().slice(0, 10) : null);
                    setEndPickerOpen(false);
                  }}
                  disabled={startDate ? { before: new Date(startDate) } : undefined}
                  styles={{ root: { margin: 0, fontSize: "13px" } }}
                />
                {endDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setEndDate(null);
                      setEndPickerOpen(false);
                    }}
                    className="w-full mt-2 text-xs text-rose-500 hover:text-rose-600"
                  >
                    Clear date
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
