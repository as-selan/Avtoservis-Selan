"use client";

import type {IntakeCustomerCandidate} from '@/lib/intake/types';
import { createContext, useContext, useMemo, useState } from "react";

interface ManualEntryContextValue {
  prefill?:{candidate:IntakeCustomerCandidate;vehicleId?:string};
  openWithCandidate:(candidate:IntakeCustomerCandidate,vehicleId?:string)=>void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const ManualEntryContext = createContext<ManualEntryContextValue | null>(null);

export function ManualEntryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [prefill,setPrefill]=useState<{candidate:IntakeCustomerCandidate;vehicleId?:string}>();
  const [open, setOpenState] = useState(false);
  const value = useMemo(() => ({ open, setOpen:(value:boolean)=>{if(!value)setPrefill(undefined);setOpenState(value);}, prefill, openWithCandidate:(candidate:IntakeCustomerCandidate,vehicleId?:string)=>{setPrefill({candidate,vehicleId});setOpenState(true);} }), [open,prefill]);
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
