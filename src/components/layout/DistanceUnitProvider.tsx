"use client";

import { createContext, useContext, useSyncExternalStore, ReactNode } from "react";
import type { DistanceUnit } from "@/lib/types";

interface DistanceUnitContextType {
  unit: DistanceUnit;
  setUnit: (unit: DistanceUnit) => void;
  toggleUnit: () => void;
}

const DistanceUnitContext = createContext<DistanceUnitContextType | undefined>(undefined);

const STORAGE_KEY = "distance-unit";
const CHANGE_EVENT = "distance-unit-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getSnapshot(): DistanceUnit {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "km" || stored === "mi" ? stored : "mi";
}

// The server (and the client's hydration pass) always renders "mi"; the stored
// preference applies right after hydration, so the first client render never
// diverges from the server-rendered HTML.
function getServerSnapshot(): DistanceUnit {
  return "mi";
}

export function DistanceUnitProvider({ children }: { children: ReactNode }) {
  const unit = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setUnit = (newUnit: DistanceUnit) => {
    localStorage.setItem(STORAGE_KEY, newUnit);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  const toggleUnit = () => {
    setUnit(unit === "km" ? "mi" : "km");
  };

  return (
    <DistanceUnitContext.Provider value={{ unit, setUnit, toggleUnit }}>
      {children}
    </DistanceUnitContext.Provider>
  );
}

export function useDistanceUnit() {
  const context = useContext(DistanceUnitContext);
  if (context === undefined) {
    throw new Error("useDistanceUnit must be used within a DistanceUnitProvider");
  }
  return context;
}
