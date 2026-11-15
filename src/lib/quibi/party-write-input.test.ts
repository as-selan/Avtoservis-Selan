import assert from "node:assert/strict";
import { test } from "node:test";
import { customerCreateInput, vehicleCreateInput } from "./party-write-input.ts";

const customerId = "00000000-0000-4000-8000-000000000011";
const vehicleId = "00000000-0000-4000-8000-000000000012";

test("server-action customer input accepts a valid 8-4-4-4-12 UUID", () => {
  const form = new FormData();
  form.set("customerId", customerId);
  form.set("confirmed", "yes");
  assert.equal(customerCreateInput(form), customerId);
});

test("server-action vehicle input accepts valid customer and vehicle UUIDs", () => {
  const form = new FormData();
  form.set("customerId", customerId);
  form.set("vehicleId", vehicleId);
  form.set("confirmed", "yes");
  assert.deepEqual(vehicleCreateInput(form), { customerId, vehicleId });
});

test("server-action input rejects malformed UUIDs and missing confirmation", () => {
  const form = new FormData();
  form.set("customerId", "00000000-0000-4000-000000000011");
  form.set("vehicleId", vehicleId);
  form.set("confirmed", "yes");
  assert.equal(customerCreateInput(form), null);
  assert.equal(vehicleCreateInput(form), null);
  form.set("customerId", customerId);
  form.set("vehicleId", "00000000-0000-4000-000000000012");
  assert.equal(vehicleCreateInput(form), null);
  form.set("vehicleId", vehicleId);
  form.delete("confirmed");
  assert.equal(customerCreateInput(form), null);
  assert.equal(vehicleCreateInput(form), null);
});
