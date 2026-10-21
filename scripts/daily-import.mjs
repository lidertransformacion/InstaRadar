import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

register("./alias-hook.mjs", import.meta.url);

const args = process.argv.slice(2);
const fileFlag = args.findIndex((arg) => arg === "--out");
const outPath = fileFlag >= 0 ? args[fileFlag + 1] : "";
const file = args.find((arg, index) => arg !== "--out" && index !== fileFlag + 1 && !arg.startsWith("--"));

if (!file || (fileFlag >= 0 && !outPath)) {
  console.error("Usage: node scripts/daily-import.mjs <file.json> [--out file.sql]");
  process.exit(1);
}

const absolute = path.resolve(process.cwd(), file);
if (!fs.existsSync(absolute)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

const { buildDailySearchSql } = await import(pathToFileURL(path.resolve("src/lib/daily-import.ts")).href);
const { ResearchFileError } = await import(pathToFileURL(path.resolve("src/lib/ingest.ts")).href);

try {
  const result = buildDailySearchSql(fs.readFileSync(absolute, "utf8"));
  const count = result.candidates.length;
  const noun = count === 1 ? "candidate profile" : "candidate profiles";
  console.error(
    `Daily search SQL for ${result.cityId}: ${count} ${noun}, found on ${result.foundOn}.`,
  );
  console.error("Existing usernames are skipped when the file is applied. Run markers are always updated.");
  if (outPath) {
    const destination = path.resolve(process.cwd(), outPath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, result.sql);
    console.error(`Wrote ${outPath}`);
  } else {
    process.stdout.write(result.sql);
  }
} catch (error) {
  if (error instanceof ResearchFileError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
