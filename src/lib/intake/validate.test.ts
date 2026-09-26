import assert from "node:assert/strict";
import { test } from "node:test";
import { validateManualIntakeForm } from "./validate.ts";

const base = {
  displayName: "Janez Novak",
  phone: "041 123 456",
  email: "",
  channel: "phone",
  vin: "",
  registration: "",
  make: "",
  model: "",
  year: "",
  powerKw: "",
  engine: "",
  engineType: "",
  fuel: "",
  mileage: "150000",
  serviceWanted: "Servis",
  problemDescription: "",
  bringsOwnMaterial: false,
  selectedCustomerId: null as string | null,
  selectedVehicleId: null as string | null,
  clientRequestId: "11111111-1111-4111-8111-111111111111",
};

test("validate maps mileage to mileageReportedKm without inventing vehicle cache", () => {
  const result = validateManualIntakeForm(base);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.input.mileageReportedKm, 150000);
});

test("validate rejects negative mileage", () => {
  const result = validateManualIntakeForm({ ...base, mileage: "-1" });
  assert.equal(result.ok, false);
});

test("validate requires phone or email", () => {
  const result = validateManualIntakeForm({
    ...base,
    phone: "",
    email: "",
  });
  assert.equal(result.ok, false);
});

test("validate rejects vehicle selection without customer", () => {
  const result = validateManualIntakeForm({
    ...base,
    selectedVehicleId: "22222222-2222-4222-8222-222222222222",
    selectedCustomerId: null,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.formError ?? "", /stranko/i);
});

test("validate rejects invalid email format", () => {
  const result = validateManualIntakeForm({
    ...base,
    phone: "",
    email: "not-an-email",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.fieldErrors.email, "Neveljavna e-pošta");
});

test("validate rejects invalid email even when phone is present", () => {
  const result = validateManualIntakeForm({
    ...base,
    phone: "041123456",
    email: "still-bad",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.fieldErrors.email, "Neveljavna e-pošta");
});

test("validate requires clientRequestId", () => {
  const result = validateManualIntakeForm({
    ...base,
    clientRequestId: "   ",
  });
  assert.equal(result.ok, false);
});
