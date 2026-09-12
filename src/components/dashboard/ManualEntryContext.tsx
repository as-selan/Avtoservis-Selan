"use client";

import { createContext, useContext, useMemo, useState } from "react";

interface ManualEntryContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const ManualEntryContext = createContext<ManualEntryContextValue | null>(null);

export function ManualEntryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return (
    <ManualEntryContext.Provider value={value}>
      {children}
    </ManualEntryContext.Provider>
  );
}

export function useManualEntry() {
  const ctx = useContext(ManualEntryContext);
  if (!ctx) {
    throw new Error("useManualEntry mora biti znotraj ManualEntryProvider");
  }
  return ctx;
}
