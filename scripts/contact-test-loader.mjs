import { pathToFileURL } from "node:url";
import { resolve as pathResolve } from "node:path";
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(pathResolve("src", specifier.slice(2) + ".ts")).href, context);
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
  if (specifier.startsWith("next/") && !specifier.endsWith(".js")) return nextResolve(`${specifier}.js`, context);
  return nextResolve(specifier, context);
}
