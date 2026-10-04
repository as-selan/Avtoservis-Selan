import { createHash } from "node:crypto";
import type { QuibiCustomer, QuibiDocument, QuibiEstimateDetail, QuibiVehicle } from "./contracts.ts";

// Synthetic, server-side READ fixture. There is deliberately no HTTP transport.
const customers: QuibiCustomer[] = [
  { id: "2001", name: "Nina Demo", phone: "+38640555101", email: "nina.demo@example.test" },
  { id: "2002", name: "Luka Demo", phone: "+38640555102", email: "luka.demo@example.test" },
];
const vehicles: QuibiVehicle[] = [
  { id: "5001", customerId: "2001", vin: "TST00000000000006", registration: "LJ DEMO1",
    make: "Test", model: "Quibi", disabled: false },
];
const estimate: QuibiEstimateDetail = {
  id: "4001", customerId: "2001", amount: "285.00", status: "Osnutek",
  lines: [{ description: "Sintetična servisna storitev", quantity: "1", grossPrice: "285.00" }],
  contentSha256: createHash("sha256").update("selan-demo-estimate-4001-v1").digest("hex"),
};
const id = (value: string) => {
  if (!/^\d+$/.test(value)) throw new Error("QUIBI_INVALID_ID");
  return value;
};
const copy = <T>(value: T): T => structuredClone(value);

export function createDemoQuibiReadClient() {
  return {
    async searchCustomers(query: string): Promise<QuibiCustomer[]> {
      const needle = query.trim().toLocaleLowerCase("sl-SI");
      if (needle.length < 2 || needle.length > 100) return [];
      return copy(customers.filter((customer) => [customer.id, customer.name, customer.phone, customer.email]
        .some((value) => value.toLocaleLowerCase("sl-SI").includes(needle))).slice(0, 30));
    },
    async customer(customerId: string): Promise<QuibiCustomer> {
      const found = customers.find((item) => item.id === id(customerId));
      if (!found) throw new Error("QUIBI_CUSTOMER_NOT_FOUND");
      return copy(found);
    },
    async vehicles(customerId: string): Promise<QuibiVehicle[]> {
      return copy(vehicles.filter((item) => item.customerId === id(customerId)));
    },
    async vehicle(vehicleId: string, customerId: string): Promise<QuibiVehicle> {
      const found = vehicles.find((item) => item.id === id(vehicleId));
      if (!found || found.customerId !== id(customerId)) throw new Error("QUIBI_VEHICLE_NOT_FOUND");
      return copy(found);
    },
    async workOrders(customerId: string): Promise<QuibiDocument[]> {
      return id(customerId) === "2001" ? [{ id: "3001", customerId: "2001", numberingId: "1" }] : [];
    },
    async estimates(customerId: string): Promise<QuibiDocument[]> {
      return id(customerId) === "2001" ? [{ id: "4001", customerId: "2001", numberingId: "1" }] : [];
    },
    async estimateDetail(estimateId: string, customerId: string): Promise<QuibiEstimateDetail> {
      if (id(estimateId) !== estimate.id || id(customerId) !== estimate.customerId) {
        throw new Error("QUIBI_DOCUMENT_NOT_FOUND");
      }
      return copy(estimate);
    },
  };
}
