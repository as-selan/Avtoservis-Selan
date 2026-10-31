import {fileURLToPath,pathToFileURL} from "node:url";
import {resolve as resolvePath} from "node:path";
const sourceRoot=fileURLToPath(new URL("../src/",import.meta.url));
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target=resolvePath(sourceRoot,specifier.slice(2));
    return nextResolve(pathToFileURL(/\.[cm]?[jt]sx?$/.test(target)?target:target+".ts").href,context);
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[cm]?[jt]sx?$/.test(specifier)
  ) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
