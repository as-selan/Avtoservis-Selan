/**
 * Offline test helper: resolve extensionless relative imports to .ts
 * (Next/TS omits extensions; Node ESM requires them).
 *
 * node --import ./scripts/ts-ext-register.mjs --experimental-strip-types --test src/lib/intake/*.test.ts
 */
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const loaderPath = join(dirname(fileURLToPath(import.meta.url)), "ts-ext-loader.mjs");
register(pathToFileURL(loaderPath).href);
