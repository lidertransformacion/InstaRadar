import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

register("./alias-hook.mjs", import.meta.url);

const file = process.argv[2];
if (!file) {
  console.error("Usage: make import FILE=path.json");
  process.exit(1);
}

const absolute = path.resolve(process.cwd(), file);
if (!fs.existsSync(absolute)) {
  console.error(`No está el archivo ${file}`);
  process.exit(1);
}

const { getDb, importResearch } = await import(pathToFileURL(path.resolve("src/lib/db.ts")).href);
const { ResearchFileError } = await import(pathToFileURL(path.resolve("src/lib/ingest.ts")).href);

try {
  const result = importResearch(getDb(), fs.readFileSync(absolute, "utf8"));
  console.log(result.message);
} catch (error) {
  if (error instanceof ResearchFileError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
