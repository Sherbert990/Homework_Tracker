/**
 * DisplayUnitContext — provides the points/dollar toggle to all pages reactively.
 * Wrap the app with <DisplayUnitProvider> so every page re-renders on toggle.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { loadPrefs, savePrefs, type DisplayUnit, POINTS_TO_DOLLARS, formatCurrency, formatPoints } from "@/lib/dataStore";

interface DisplayUnitContextValue {
  unit: DisplayUnit;
  setUnit: (unit: DisplayUnit) => void;
  /** Format a POINTS value according to the current unit */
  fmtValue: (pts: number) => string;
  /** Format a dollar value (already in $) according to the current unit */
  fmtDollars: (usd: number) => string;
}

const DisplayUnitContext = createContext<DisplayUnitContextValue>({
  unit: 'dollars',
  setUnit: () => {},
  fmtValue: (pts) => formatCurrency(pts / POINTS_TO_DOLLARS),
  fmtDollars: (usd) => formatCurrency(usd),
});

export function DisplayUnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<DisplayUnit>(() => loadPrefs().displayUnit);

  const setUnit = useCallback((newUnit: DisplayUnit) => {
    setUnitState(newUnit);
    savePrefs({ displayUnit: newUnit });
  }, []);

  /** Format a value stored in POINTS */
  const fmtValue = useCallback((pts: number): string => {
    if (unit === 'dollars') return formatCurrency(pts / POINTS_TO_DOLLARS);
    return formatPoints(pts);
  }, [unit]);

  /** Format a value already in dollars */
  const fmtDollars = useCallback((usd: number): string => {
    if (unit === 'dollars') return formatCurrency(usd);
    // Convert back to points for display
    return formatPoints(usd * POINTS_TO_DOLLARS);
  }, [unit]);

  return (
    <DisplayUnitContext.Provider value={{ unit, setUnit, fmtValue, fmtDollars }}>
      {children}
    </DisplayUnitContext.Provider>
  );
}

export function useDisplayUnit() {
  return useContext(DisplayUnitContext);
}
