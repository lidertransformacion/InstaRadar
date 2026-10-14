import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.resolve(process.cwd(), "src", specifier.slice(2));
    const file = [".ts", ".tsx", ".js", ".mjs"].map((ext) => base + ext).find((candidate) => existsSync(candidate));
    if (!file) {
      throw new Error(`Cannot resolve ${specifier}`);
    }
    return nextResolve(pathToFileURL(file).href, context);
  }
  return nextResolve(specifier, context);
}
