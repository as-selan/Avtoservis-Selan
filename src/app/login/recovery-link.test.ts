import assert from "node:assert/strict";
import { test } from "node:test";
import { authLinkRedirectTarget, passwordSetupOtpType } from "./recovery-link.ts";

test("recovery and invite fragments use the existing session exchange page", () => {
  assert.equal(
    authLinkRedirectTarget("#access_token=synthetic-access&refresh_token=synthetic-refresh&type=recovery"),
    "/auth/accept-invite#type=recovery&access_token=synthetic-access&refresh_token=synthetic-refresh",
  );
  assert.equal(
    authLinkRedirectTarget("#type=invite&access_token=synthetic-access&refresh_token=synthetic-refresh&next=https://evil.test"),
    "/auth/accept-invite#type=invite&access_token=synthetic-access&refresh_token=synthetic-refresh",
  );
  assert.equal(authLinkRedirectTarget("#access_token=synthetic-access&type=recovery"), null);
  assert.equal(authLinkRedirectTarget("#access_token=synthetic-access&refresh_token=synthetic-refresh&type=signup"), null);
  assert.equal(authLinkRedirectTarget(""), null);
});

test("only invite and recovery token hashes may enter password setup", () => {
  assert.equal(passwordSetupOtpType("invite"), "invite");
  assert.equal(passwordSetupOtpType("recovery"), "recovery");
  assert.equal(passwordSetupOtpType("signup"), null);
  assert.equal(passwordSetupOtpType(null), null);
});
