import type { FuelType } from "@/lib/dashboard/types";
import type { IntakeFuelDb } from "@/lib/intake/types";

/** Map demo UI fuel values to M3 DB fuel enum. */
export function mapUiFuelToDb(
  fuel: FuelType | "" | null | undefined,
): IntakeFuelDb | null {
  switch (fuel) {
    case "bencin":
      return "petrol";
    case "dizel":
      return "diesel";
    case "hibrid":
      return "hybrid";
    case "elektrika":
      return "electric";
    case "plin":
      return "lpg";
    default:
      return null;
  }
}

const DB_FUEL = new Set<string>([
  "petrol",
  "diesel",
  "hybrid",
  "plug_in_hybrid",
  "electric",
  "lpg",
  "cng",
  "hydrogen",
  "other",
]);

export function isIntakeFuelDb(value: string): value is IntakeFuelDb {
  return DB_FUEL.has(value);
}
