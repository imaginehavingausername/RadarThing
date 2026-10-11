"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";
import { type PositionUpdate } from "~/lib/aircraft-store";

const ANON_TRACKER_KEY = "radarthing.anonTrackerId";

function createAnonTrackerId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `anon:${crypto.randomUUID()}`;
  }

  return `anon:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

export function useActiveTracker(selectedAircrafts: PositionUpdate[]) {
  const { user, isLoaded, isSignedIn } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const startTracking = useMutation(api.activeTrackers.startTracking);
  const stopTracking = useMutation(api.activeTrackers.stopTracking);
  const heartbeat = useMutation(api.activeTrackers.heartbeat);
  const prevTrackedRef = useRef({ trackerId: null as string | null, key: "" });
  const [anonTrackerId, setAnonTrackerId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const existing = window.localStorage.getItem(ANON_TRACKER_KEY);
    if (existing) {
      setAnonTrackerId(existing);
      return;
    }

    const created = createAnonTrackerId();
    window.localStorage.setItem(ANON_TRACKER_KEY, created);
    setAnonTrackerId(created);
  }, []);

  const trackerId = !isLoaded
    ? null
    : isSignedIn
      ? isAuthenticated
        ? (user?.id ?? null)
        : null
      : anonTrackerId;
  const trackedCallsigns = useMemo(() => {
    return Array.from(
      new Set(
        selectedAircrafts
          .map((aircraft) => aircraft.callsign?.trim())
          .filter((callsign): callsign is string => Boolean(callsign)),
      ),
    ).sort();
  }, [selectedAircrafts]);
  const trackedKey = trackedCallsigns.join("|");

  // Start/stop tracking when selection changes
  useEffect(() => {
    if (!trackerId) {
      prevTrackedRef.current = { trackerId: null, key: "" };
      return;
    }

    const previous = prevTrackedRef.current;
    if (trackerId === previous.trackerId && trackedKey === previous.key) return;

    if (trackedCallsigns.length > 0) {
      void startTracking({ clerkId: trackerId, callsigns: trackedCallsigns });
    } else if (previous.trackerId === trackerId && previous.key) {
      void stopTracking({ clerkId: trackerId });
    }

    prevTrackedRef.current = { trackerId, key: trackedKey };
  }, [trackerId, trackedCallsigns, trackedKey, startTracking, stopTracking]);

  // Heartbeat every 60 seconds while tracking
  useEffect(() => {
    if (!trackerId || trackedCallsigns.length === 0) return;

    const interval = setInterval(() => {
      void heartbeat({ clerkId: trackerId });
    }, 60_000);

    return () => clearInterval(interval);
  }, [trackerId, trackedCallsigns.length, heartbeat]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (trackerId) {
        void stopTracking({ clerkId: trackerId });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerId]);
}
