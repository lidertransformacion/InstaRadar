import fs from "node:fs";
import type { PriceRow } from "@/lib/types";

export type PriceFile = {
  rows: PriceRow[];
  note: string;
  error: string | null;
};

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function parsePriceJson(text: string): PriceFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { rows: [], note: "", error: "El JSON de precios no se pudo leer." };
  }
  const record = parsed as { note?: unknown; rows?: unknown };
  if (!Array.isArray(record.rows)) {
    return { rows: [], note: "", error: "El JSON necesita una lista rows." };
  }
  const rows = record.rows
    .map((row) => {
      const item = row as Record<string, unknown>;
      return {
        item: asText(item.item),
        libertario: asText(item.libertario),
        competitor: asText(item.competitor),
        notes: asText(item.notes),
      };
    })
    .filter((row) => row.item);
  return { rows, note: asText(record.note), error: null };
}

export function parsePriceCsv(text: string): PriceFile {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { rows: [], note: "", error: "El CSV de precios está vacío." };
  }
  const header = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const index = (name: string) => header.indexOf(name);
  const itemIndex = index("item");
  const libertarioIndex = index("libertario");
  const competitorIndex = index("competitor");
  const notesIndex = index("notes");
  if (itemIndex < 0 || libertarioIndex < 0 || competitorIndex < 0) {
    return {
      rows: [],
      note: "",
      error: "El CSV necesita columnas item, libertario y competitor.",
    };
  }
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return {
      item: cells[itemIndex] ?? "",
      libertario: cells[libertarioIndex] ?? "",
      competitor: cells[competitorIndex] ?? "",
      notes: notesIndex >= 0 ? (cells[notesIndex] ?? "") : "",
    };
  }).filter((row) => row.item);
  return { rows, note: "", error: null };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function readPriceFile(filePath: string): PriceFile {
  if (!fs.existsSync(filePath)) {
    return { rows: [], note: "", error: "No está el archivo de precios." };
  }
  const text = fs.readFileSync(filePath, "utf8");
  if (filePath.toLowerCase().endsWith(".csv")) return parsePriceCsv(text);
  return parsePriceJson(text);
}
