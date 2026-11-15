export type InspectionAction = "request" | "complete" | "repair_ordered" | "repair_not_ordered";

/** Case-stage gate for the UI and server action; the database remains the final authority. */
export function canAdvancePreliminaryInspection(status: string, action: InspectionAction): boolean {
  if (action === "request" || action === "complete") {
    return status === "new" || status === "preparing_offer";
  }
  return ["new", "preparing_offer", "awaiting_customer_approval", "awaiting_slot_selection", "declined"].includes(status);
}
