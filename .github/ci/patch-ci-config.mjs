#!/usr/bin/env node
/**
 * Patch a *copied* supabase/config.toml for disposable CI local stacks only.
 * Does not modify the repository's canonical supabase/config.toml.
 *
 * CI identity:
 *   project_id = avtoservis-selan-m3-review
 *   [db] port  = 55322
 *   [db.seed]  = disabled
 */
import fs from "node:fs";
import path from "node:path";

const CI_PROJECT_ID = "avtoservis-selan-m3-review";
const CI_DB_HOST_PORT = 55322;

function patchConfig(text) {
  if (!/^project_id\s*=/m.test(text)) {
    throw new Error("Refusing patch: project_id key missing in config.toml");
  }

  text = text.replace(
    /^project_id\s*=\s*.*$/m,
    `project_id = "${CI_PROJECT_ID}"`,
  );

  const lines = text.split(/(?<=\n)/);
  const out = [];
  let section = null;
  let dbPortPatched = false;
  let seedEnabledPatched = false;

  for (const line of lines) {
    const stripped = line.trim();
    if (stripped.startsWith("[") && stripped.endsWith("]")) {
      section = stripped.slice(1, -1);
      out.push(line);
      continue;
    }

    if (section === "db" && /^port\s*=/.test(stripped) && !dbPortPatched) {
      out.push(`port = ${CI_DB_HOST_PORT}\n`);
      dbPortPatched = true;
      continue;
    }

    if (
      section === "db.seed" &&
      /^enabled\s*=/.test(stripped) &&
      !seedEnabledPatched
    ) {
      out.push("enabled = false\n");
      seedEnabledPatched = true;
      continue;
    }

    out.push(line);
  }

  if (!dbPortPatched) {
    throw new Error("Refusing patch: [db] port = ... not found");
  }
  if (!seedEnabledPatched) {
    throw new Error("Refusing patch: [db.seed] enabled = ... not found");
  }

  const patched = out.join("");
  if (!patched.includes(`project_id = "${CI_PROJECT_ID}"`)) {
    throw new Error("Refusing patch: project_id patch failed");
  }
  if (!patched.includes(`port = ${CI_DB_HOST_PORT}`)) {
    throw new Error("Refusing patch: db port patch failed");
  }
  return patched;
}

function main() {
  const [, , sourceArg, destArg] = process.argv;
  if (!sourceArg || !destArg) {
    console.error("Usage: patch-ci-config.mjs <source-config.toml> <dest-config.toml>");
    process.exit(2);
  }

  const source = path.resolve(sourceArg);
  const dest = path.resolve(destArg);
  if (source === dest) {
    console.error(
      "Refusing: source and dest are the same path (would mutate canonical config).",
    );
    process.exit(2);
  }

  const sourceText = fs.readFileSync(source, "utf8");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, patchConfig(sourceText), "utf8");
  console.log(
    `CI config written: project_id=${CI_PROJECT_ID} db.port=${CI_DB_HOST_PORT} seed=disabled -> ${dest}`,
  );
}

main();
