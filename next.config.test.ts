import assert from "node:assert/strict";
import { test } from "node:test";

test("reviewed preview opts into real Quibi DEV reads only when explicitly requested", async () => {
  const keys = ["VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "VERCEL_URL", "QUIBI_MODE"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_REF = "codex/selan-pr18-manual-qa";
    process.env.VERCEL_URL = "selan-review.vercel.app";
    process.env.QUIBI_MODE = "dev";
    const configUrl = new URL("./next.config.ts", import.meta.url).href;
    const dev = (await import(`${configUrl}?quibi-dev-test`)).default;
    assert.equal(dev.env?.QUIBI_MODE, "dev");
    assert.equal(dev.env?.SELAN_REMOTE_DEMO, "0");
    assert.equal(dev.env?.NEXT_PUBLIC_SELAN_REMOTE_DEMO, "0");

    delete process.env.QUIBI_MODE;
    const fallback = (await import(`${configUrl}?quibi-demo-test`)).default;
    assert.equal(fallback.env?.QUIBI_MODE, "demo");
    assert.equal(fallback.env?.SELAN_REMOTE_DEMO, "1");
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
