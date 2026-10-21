import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDailySearchSql } from "@/lib/daily-import";
import { ResearchFileError } from "@/lib/ingest";
import { bogotaDate, isNuevoHoy } from "@/lib/nuevo-hoy";

const NOW = new Date("2026-10-21T18:00:00.000Z");

function research(influencers: unknown[]): string {
  return JSON.stringify({
    city: "Medellín",
    collected_at: "2026-10-21",
    source: "daily search",
    competitors: [],
    influencers,
  });
}

function person(username: string, extra: Record<string, unknown> = {}) {
  return {
    username,
    url: `https://www.instagram.com/${username}/`,
    display_name: "Café Ejemplo",
    followers: 4200,
    following: 180,
    posts: 40,
    bio: "Café de barrio en Laureles",
    location: "Laureles",
    niche: "café de especialidad",
    mentioned_pergamino: false,
    verified: true,
    source: "instagram",
    ...extra,
  };
}

type Row = Record<string, unknown>;

function apply(sql: string, seed: string): { profiles: Row[]; meta: Row[] } {
  const script = `
    const { DatabaseSync } = require("node:sqlite");
    const fs = require("node:fs");
    const db = new DatabaseSync(":memory:");
    const seed = fs.readFileSync(0, "utf8");
    const parts = seed.split("\\n-- SQL --\\n");
    db.exec(parts[0]);
    db.exec(parts[1]);
    const profiles = db.prepare("SELECT username, city_id, data FROM profiles ORDER BY username").all();
    const meta = db.prepare("SELECT key, value FROM meta WHERE key LIKE 'daily_search_%' ORDER BY key").all();
    process.stdout.write(JSON.stringify({ profiles, meta }));
  `;
  const payload = `${seed}\n-- SQL --\n${sql}`;
  const output = execFileSync(process.execPath, ["--experimental-sqlite", "-e", script], {
    input: payload,
    encoding: "utf8",
  });
  return JSON.parse(output) as { profiles: Row[]; meta: Row[] };
}

const SCHEMA = `
  CREATE TABLE profiles (username TEXT PRIMARY KEY, city_id TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  INSERT INTO meta (key, value) VALUES ('daily_search_enabled', 'false');
  INSERT INTO meta (key, value) VALUES ('daily_search_last_run_at', 'null');
  INSERT INTO meta (key, value) VALUES ('daily_search_last_run_new', '0');
`;

describe("daily search SQL", () => {
  it("inserts a new profile flagged for today and skips a username that is already stored", () => {
    const sql = buildDailySearchSql(
      research([
        person("cafe.nuevo"),
        person("cafe.nuevo"),
        person("ya.existe", { display_name: "Should not replace", bio: "replacement bio" }),
        person("ohara", {
          display_name: "O'Hara",
          bio: 'Comillas "y" café',
          notes: `Nota con 'cita' y "comillas"`,
        }),
      ]),
      NOW,
    );
    expect(sql.cityId).toBe("medellin");
    expect(sql.foundOn).toBe("2026-10-21");
    expect(sql.candidates).toEqual(["cafe.nuevo", "ya.existe", "ohara"]);
    expect(sql.sql).toContain("WHERE NOT EXISTS");
    expect(sql.sql).toContain("'daily_search_last_run_at'");
    expect(sql.sql).toContain("'daily_search_last_run_new'");

    const existingToday = {
      username: "ya.existe",
      fullName: "Nombre original",
      bio: "keep me",
      newToday: true,
      foundOn: "2026-10-21",
      score: 10,
    };
    const existingYesterday = {
      username: "ayer",
      fullName: "Ayer",
      newToday: true,
      foundOn: "2026-10-20",
      score: 9,
    };
    const seed = `
      ${SCHEMA}
      INSERT INTO profiles (username, city_id, data) VALUES (
        'ya.existe', 'medellin', '${JSON.stringify(existingToday).replace(/'/g, "''")}'
      );
      INSERT INTO profiles (username, city_id, data) VALUES (
        'ayer', 'medellin', '${JSON.stringify(existingYesterday).replace(/'/g, "''")}'
      );
    `;
    const applied = apply(sql.sql, seed);
    const byName = Object.fromEntries(
      applied.profiles.map((row) => [String(row.username), JSON.parse(String(row.data)) as Record<string, unknown>]),
    );

    expect(byName["ya.existe"]?.fullName).toBe("Nombre original");
    expect(byName["ya.existe"]?.bio).toBe("keep me");
    expect(byName["ya.existe"]?.newToday).toBe(true);
    expect(byName["ayer"]?.newToday).toBe(false);
    expect(byName["ayer"]?.fullName).toBe("Ayer");
    expect(byName["cafe.nuevo"]?.newToday).toBe(true);
    expect(byName["cafe.nuevo"]?.foundOn).toBe("2026-10-21");
    expect(byName["cafe.nuevo"]?.zone).toBe("Laureles");
    expect(byName["cafe.nuevo"]?.cityId).toBe("medellin");
    expect(byName.ohara?.fullName).toBe("O'Hara");
    expect(byName.ohara?.notes).toBe(`Nota con 'cita' y "comillas"`);
    expect(String(byName.ohara?.reason ?? "")).not.toBe("");
    expect(applied.profiles.filter((row) => row.username === "cafe.nuevo")).toHaveLength(1);

    const meta = Object.fromEntries(applied.meta.map((row) => [String(row.key), JSON.parse(String(row.value))]));
    expect(meta.daily_search_last_run_at).toBe(NOW.toISOString());
    expect(meta.daily_search_last_run_new).toBe(2);
    expect(meta.daily_search_enabled).toBe(false);
  });

  it("records a run with zero new profiles", () => {
    const sql = buildDailySearchSql(research([]), NOW);
    expect(sql.candidates).toEqual([]);
    expect(sql.sql).not.toContain("INSERT INTO profiles");
    const applied = apply(sql.sql, SCHEMA);
    const meta = Object.fromEntries(applied.meta.map((row) => [String(row.key), JSON.parse(String(row.value))]));
    expect(applied.profiles).toEqual([]);
    expect(meta.daily_search_last_run_at).toBe(NOW.toISOString());
    expect(meta.daily_search_last_run_new).toBe(0);
  });

  it("counts zero when every username is already present", () => {
    const sql = buildDailySearchSql(research([person("ya.existe")]), NOW);
    const seed = `
      ${SCHEMA}
      INSERT INTO profiles (username, city_id, data) VALUES (
        'ya.existe', 'medellin', '{"username":"ya.existe","fullName":"Original","newToday":false}'
      );
    `;
    const applied = apply(sql.sql, seed);
    const meta = Object.fromEntries(applied.meta.map((row) => [String(row.key), JSON.parse(String(row.value))]));
    expect(applied.profiles).toHaveLength(1);
    expect(JSON.parse(String(applied.profiles[0]?.data)).fullName).toBe("Original");
    expect(meta.daily_search_last_run_new).toBe(0);
    expect(meta.daily_search_last_run_at).toBe(NOW.toISOString());
  });

  it("rejects an unknown city", () => {
    expect(() => buildDailySearchSql(JSON.stringify({ city: "Lima", influencers: [] }))).toThrow(ResearchFileError);
  });
});

describe("Nuevos hoy", () => {
  it("uses the Bogota calendar day, including just before and after midnight", () => {
    const beforeMidnight = new Date("2026-10-21T04:30:00.000Z");
    const afterMidnight = new Date("2026-10-21T05:30:00.000Z");
    expect(bogotaDate(beforeMidnight)).toBe("2026-10-20");
    expect(bogotaDate(afterMidnight)).toBe("2026-10-21");
    const profile = { newToday: true, foundOn: "2026-10-21" };
    expect(isNuevoHoy(profile, beforeMidnight)).toBe(false);
    expect(isNuevoHoy(profile, afterMidnight)).toBe(true);
    expect(isNuevoHoy({ newToday: true }, afterMidnight)).toBe(true);
    expect(isNuevoHoy({ newToday: false, foundOn: "2026-10-20" }, afterMidnight)).toBe(false);
  });
});

describe("daily search wiring", () => {
  it("creates the three meta keys from build.py without overwriting a previous run", () => {
    const output = execFileSync("python3", ["-c", `
import importlib.util
spec = importlib.util.spec_from_file_location("build", "cloudflare/build.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
state = {"profiles": [{"username": "a"}], "settings": {"cityId": "medellin"}}
mod.ensure_daily_search_keys(state)
assert state["daily_search_enabled"] is False
assert state["daily_search_last_run_at"] is None
assert state["daily_search_last_run_new"] == 0
state["daily_search_enabled"] = True
state["daily_search_last_run_new"] = 4
mod.ensure_daily_search_keys(state)
assert state["daily_search_enabled"] is True
assert state["daily_search_last_run_new"] == 4
print("ok")
`]);
    expect(output.toString()).toContain("ok");
  });

  it("exposes GET and POST /api/daily-search on the worker", () => {
    const worker = fs.readFileSync(path.join(process.cwd(), "cloudflare/worker.js"), "utf8");
    expect(worker).toContain('pathname === "/api/daily-search"');
    expect(worker).toContain('request.method === "GET"');
    expect(worker).toContain('request.method === "POST"');
    expect(worker).toContain("daily_search_enabled");
    expect(worker).toContain("daily_search_last_run_at");
    expect(worker).toContain("daily_search_last_run_new");
  });

  it("writes SQL from the CLI for an empty candidate list", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-search-"));
    const input = path.join(dir, "empty.json");
    const output = path.join(dir, "nested", "daily.sql");
    fs.writeFileSync(input, research([]));
    execFileSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/daily-import.mjs", input, "--out", output],
      { encoding: "utf8" },
    );
    const sql = fs.readFileSync(output, "utf8");
    expect(sql).toContain("daily_search_last_run_at");
    expect(sql).toContain("daily_search_last_run_new");
    expect(sql).not.toContain("INSERT INTO profiles");
  });
});
