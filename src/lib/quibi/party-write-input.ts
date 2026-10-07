export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function customerCreateInput(form: FormData): string | null {
  const customerId = form.get("customerId");
  return typeof customerId === "string" && UUID_RE.test(customerId) && form.get("confirmed") === "yes"
    ? customerId : null;
}

export function vehicleCreateInput(form: FormData): { customerId: string; vehicleId: string } | null {
  const customerId = customerCreateInput(form);
  const vehicleId = form.get("vehicleId");
  return customerId && typeof vehicleId === "string" && UUID_RE.test(vehicleId)
    ? { customerId, vehicleId } : null;
}
