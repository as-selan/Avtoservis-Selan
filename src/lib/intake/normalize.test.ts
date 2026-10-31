import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeIntakeEmail,
  normalizeIntakePhone,
  normalizeIntakeRegistration,
  normalizeIntakeVin,
} from "./normalize.ts";

test("normalizeIntakePhone strips separators and preserves leading +", () => {
  assert.equal(normalizeIntakePhone("041 123 456"), "041123456");
  assert.equal(normalizeIntakePhone("041-123-456"), "041123456");
  assert.equal(normalizeIntakePhone("(041) 123 456"), "041123456");
  assert.equal(normalizeIntakePhone("+386 41 123 456"), "+38641123456");
  assert.notEqual(
    normalizeIntakePhone("+38641123456"),
    normalizeIntakePhone("041123456"),
  );
});

test("normalizeIntakeEmail lowercases and trims", () => {
  assert.equal(normalizeIntakeEmail("  A@B.C  "), "a@b.c");
  assert.equal(normalizeIntakeEmail("   "), null);
});

test("normalizeIntakeVin uppercases", () => {
  assert.equal(normalizeIntakeVin(" wba123 "), "WBA123");
});

test("normalizeIntakeRegistration strips non-alphanumeric", () => {
  assert.equal(normalizeIntakeRegistration("LJ 41-NPK"), "LJ41NPK");
  assert.equal(normalizeIntakeRegistration("  "), null);
});
