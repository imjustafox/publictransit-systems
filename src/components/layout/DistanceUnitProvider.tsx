"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { DistanceUnit } from "@/lib/types";

interface DistanceUnitContextType {
  unit: DistanceUnit;
  setUnit: (unit: DistanceUnit) => void;
  toggleUnit: () => void;
}

const DistanceUnitContext = createContext<DistanceUnitContextType | undefined>(undefined);

const STORAGE_KEY = "distance-unit";

function getInitialUnit(): DistanceUnit {
  if (typeof window === "undefined") return "mi";

  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "km" || stored === "mi" ? stored : "mi";
}

export function DistanceUnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<DistanceUnit>(getInitialUnit);

  const setUnit = (newUnit: DistanceUnit) => {
    setUnitState(newUnit);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, newUnit);
    }
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
