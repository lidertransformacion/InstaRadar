import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_CITIES, DEFAULT_SETTINGS } from "@/lib/catalog";
import {
  matchCity,
  parseResearchJson,
  planCompetitorStudy,
  planProfiles,
  ResearchFileError,
} from "@/lib/ingest";
import { readPriceFile } from "@/lib/prices";
import { scoreProfile, type ScoreResult } from "@/lib/scoring";
import { dayStartIso, hourAgoIso } from "@/lib/pacing";
import type {
  CityBundle,
  CompetitorStudy,
  DraftCard,
  DraftStatus,
  PanelState,
  ProfileCard,
  RunStatus,
  RunView,
  Settings,
  Shop,
  Zone,
} from "@/lib/types";

type SqlRow = Record<string, unknown>;

let database: DatabaseSync | null = null;

function dataDir(): string {
  return path.join(process.cwd(), "data");
}

export function getDb(): DatabaseSync {
  if (database) return database;
  fs.mkdirSync(dataDir(), { recursive: true });
  const db = new DatabaseSync(path.join(dataDir(), "radar.sqlite"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  seedIfEmpty(db);
  recoverStaleRun(db);
  database = db;
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT NOT NULL,
      competitor TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS zones (
      id INTEGER PRIMARY KEY,
      city_id TEXT NOT NULL,
      name TEXT NOT NULL,
      location_url TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS hashtags (
      id INTEGER PRIMARY KEY,
      city_id TEXT NOT NULL,
      tag TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS watches (
      id INTEGER PRIMARY KEY,
      city_id TEXT NOT NULL,
      username TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY,
      city_id TEXT NOT NULL,
      zone TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      followers INTEGER NOT NULL DEFAULT 0,
      following INTEGER NOT NULL DEFAULT 0,
      posts_count INTEGER NOT NULL DEFAULT 0,
      city_id TEXT NOT NULL,
      zone TEXT,
      source TEXT NOT NULL DEFAULT '',
      profile_url TEXT NOT NULL,
      is_private INTEGER NOT NULL DEFAULT 0,
      sample INTEGER NOT NULL DEFAULT 0,
      discovered_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY,
      profile_id INTEGER NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      likes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      taken_at TEXT,
      media_type TEXT NOT NULL DEFAULT 'image',
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS scores (
      profile_id INTEGER PRIMARY KEY,
      score INTEGER NOT NULL,
      reason TEXT NOT NULL,
      engagement_rate REAL NOT NULL,
      content REAL NOT NULL,
      location REAL NOT NULL,
      engagement REAL NOT NULL,
      authenticity REAL NOT NULL,
      frequency REAL NOT NULL,
      penalty REAL NOT NULL,
      scored_at TEXT NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY,
      profile_id INTEGER NOT NULL UNIQUE,
      body TEXT NOT NULL,
      shop_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS studies (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      city_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS run_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      city_id TEXT,
      mode TEXT,
      seen INTEGER NOT NULL DEFAULT 0,
      kept INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS action_log (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS send_log (
      id INTEGER PRIMARY KEY,
      draft_id INTEGER,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS send_gate (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next_send_at TEXT
    );
  `);
}

function recoverStaleRun(db: DatabaseSync): void {
  const row = one(db, "SELECT status FROM run_state WHERE id = 1");
  if (row?.status === "running" || row?.status === "sending") {
    db.prepare(
      `UPDATE run_state SET status = 'stopped', message = ?, updated_at = ? WHERE id = 1`,
    ).run("La búsqueda se cortó al reiniciar.", new Date().toISOString());
  }
}

function seedIfEmpty(db: DatabaseSync): void {
  const existing = one(db, "SELECT COUNT(*) AS n FROM cities");
  if (Number(existing?.n ?? 0) > 0) return;
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO settings (id, json) VALUES (1, ?)").run(
      JSON.stringify(DEFAULT_SETTINGS),
    );
    db.prepare(
      `INSERT INTO run_state (id, status, message, city_id, mode, seen, kept, updated_at)
       VALUES (1, 'idle', ?, 'medellin', NULL, 0, 0, ?)`,
    ).run("Sin perfiles todavía.", now);
    db.prepare("INSERT INTO send_gate (id, next_send_at) VALUES (1, NULL)").run();

    for (const city of DEFAULT_CITIES) insertCity(db, city);
    const bundled = path.join(dataDir(), "real", "medellin.json");
    if (fs.existsSync(bundled)) {
      const result = importResearch(db, fs.readFileSync(bundled, "utf8"));
      db.prepare(
        `UPDATE run_state SET message = ?, seen = ?, kept = ?, updated_at = ? WHERE id = 1`,
      ).run(result.message, result.added + result.updated, result.added + result.updated, now);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export type ImportResult = {
  cityId: string;
  added: number;
  updated: number;
  message: string;
};

export function importResearch(db: DatabaseSync, raw: string): ImportResult {
  const file = parseResearchJson(raw);
  const cities = all(db, "SELECT id FROM cities").map((row) => getCity(db, String(row.id)));
  const known = cities.filter((city): city is CityBundle => city != null);
  const city = matchCity(file.city, known);
  if (!city) {
    throw new ResearchFileError(
      `No conozco la ciudad "${file.city}". Usa ${known.map((item) => item.name).join(" o ") || "una ciudad del radar"}.`,
    );
  }
  const competitorName =
    file.competitors[0]?.username || city.competitor || "";
  if (competitorName && competitorName !== city.competitor) {
    db.prepare("UPDATE cities SET competitor = ? WHERE id = ?").run(competitorName, city.id);
    city.competitor = competitorName;
  }
  const profiles = planProfiles(file, city, competitorName);
  let added = 0;
  let updated = 0;
  for (const profile of profiles) {
    const prior = one(db, "SELECT id FROM profiles WHERE username = ?", profile.username);
    saveProfile(db, profile);
    if (prior) updated += 1;
    else added += 1;
  }
  const competitor = file.competitors[0];
  if (competitor) {
    const studiedAt = file.collectedAt
      ? new Date(`${file.collectedAt}T12:00:00.000Z`).toISOString()
      : new Date().toISOString();
    const study = planCompetitorStudy(
      competitor,
      city.id,
      Number.isNaN(Date.parse(studiedAt)) ? new Date().toISOString() : studiedAt,
    );
    db.prepare(
      `INSERT INTO studies (username, city_id, payload, created_at) VALUES (?, ?, ?, ?)`,
    ).run(study.username, study.cityId, JSON.stringify(study), study.studiedAt);
  }
  const message =
    updated === 0
      ? `Cargué ${added} perfiles en ${city.name}.`
      : `Cargué ${added} perfiles nuevos y actualicé ${updated} en ${city.name}.`;
  return { cityId: city.id, added, updated, message };
}

function insertCity(db: DatabaseSync, city: CityBundle): void {
  db.prepare(
    "INSERT INTO cities (id, name, country, competitor) VALUES (?, ?, ?, ?)",
  ).run(city.id, city.name, city.country, city.competitor);
  const zone = db.prepare(
    "INSERT INTO zones (city_id, name, location_url) VALUES (?, ?, ?)",
  );
  for (const item of city.zones) zone.run(city.id, item.name, item.locationUrl);
  const tag = db.prepare("INSERT INTO hashtags (city_id, tag) VALUES (?, ?)");
  for (const item of city.hashtags) tag.run(city.id, item);
  const watch = db.prepare("INSERT INTO watches (city_id, username) VALUES (?, ?)");
  for (const item of city.watches) watch.run(city.id, item);
  const shop = db.prepare(
    "INSERT INTO shops (city_id, zone, name, address) VALUES (?, ?, ?, ?)",
  );
  for (const item of city.shops) shop.run(city.id, item.zone, item.name, item.address);
}

export type StoredPost = {
  caption: string;
  likes: number;
  comments: number;
  takenAt: string | null;
  mediaType: string;
};

export type StoredProfile = {
  username: string;
  fullName: string;
  bio: string;
  followers: number;
  following: number;
  postsCount: number;
  cityId: string;
  zone: string | null;
  source: string;
  sample: boolean;
  isPrivate: boolean;
  posts: StoredPost[];
};

export function saveProfile(db: DatabaseSync, profile: StoredProfile): number {
  const now = new Date().toISOString();
  const url = `https://www.instagram.com/${profile.username}/`;
  db.prepare(
    `INSERT INTO profiles (
      username, full_name, bio, followers, following, posts_count, city_id, zone,
      source, profile_url, is_private, sample, discovered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      full_name = excluded.full_name,
      bio = excluded.bio,
      followers = excluded.followers,
      following = excluded.following,
      posts_count = excluded.posts_count,
      city_id = excluded.city_id,
      zone = excluded.zone,
      source = excluded.source,
      is_private = excluded.is_private,
      sample = excluded.sample`,
  ).run(
    profile.username,
    profile.fullName,
    profile.bio,
    profile.followers,
    profile.following,
    profile.postsCount,
    profile.cityId,
    profile.zone,
    profile.source,
    url,
    profile.isPrivate ? 1 : 0,
    profile.sample ? 1 : 0,
    now,
  );
  const idRow = one(db, "SELECT id FROM profiles WHERE username = ?", profile.username);
  const id = Number(idRow?.id);
  db.prepare("DELETE FROM posts WHERE profile_id = ?").run(id);
  const insertPost = db.prepare(
    `INSERT INTO posts (profile_id, caption, likes, comments, taken_at, media_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const post of profile.posts) {
    insertPost.run(
      id,
      post.caption,
      post.likes,
      post.comments,
      post.takenAt,
      post.mediaType,
    );
  }
  rescore(db, id);
  return id;
}

export function storeDiscovered(profile: StoredProfile): number {
  return saveProfile(getDb(), profile);
}

function rescore(db: DatabaseSync, profileId: number): ScoreResult | null {
  const profile = one(db, "SELECT * FROM profiles WHERE id = ?", profileId);
  if (!profile) return null;
  const city = getCity(db, String(profile.city_id));
  const posts = all(db, "SELECT * FROM posts WHERE profile_id = ? ORDER BY taken_at DESC", profileId);
  const captions = posts.map((post) => String(post.caption ?? ""));
  const result = scoreProfile({
    bio: String(profile.bio ?? ""),
    captions,
    zone: profile.zone ? String(profile.zone) : null,
    cityName: city?.name ?? "",
    zones: city?.zones.map((zone) => zone.name) ?? [],
    followers: Number(profile.followers ?? 0),
    following: Number(profile.following ?? 0),
    postsCount: Number(profile.posts_count ?? 0),
    recentPosts: posts.map((post) => ({
      likes: Number(post.likes ?? 0),
      comments: Number(post.comments ?? 0),
      takenAt: post.taken_at ? String(post.taken_at) : null,
      caption: String(post.caption ?? ""),
    })),
    competitorUsernames: competitorHandles(db, String(profile.city_id)),
  });
  db.prepare(
    `INSERT INTO scores (
      profile_id, score, reason, engagement_rate, content, location, engagement,
      authenticity, frequency, penalty, scored_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET
      score = excluded.score,
      reason = excluded.reason,
      engagement_rate = excluded.engagement_rate,
      content = excluded.content,
      location = excluded.location,
      engagement = excluded.engagement,
      authenticity = excluded.authenticity,
      frequency = excluded.frequency,
      penalty = excluded.penalty,
      scored_at = excluded.scored_at`,
  ).run(
    profileId,
    result.score,
    result.reason,
    result.engagementRate,
    result.breakdown.content,
    result.breakdown.location,
    result.breakdown.engagement,
    result.breakdown.authenticity,
    result.breakdown.frequency,
    result.breakdown.penalty,
    new Date().toISOString(),
  );
  return result;
}

function competitorHandles(db: DatabaseSync, cityId: string): string[] {
  const city = one(db, "SELECT competitor FROM cities WHERE id = ?", cityId);
  const watches = all(db, "SELECT username FROM watches WHERE city_id = ?", cityId).map((row) =>
    String(row.username),
  );
  const competitor = city?.competitor ? [String(city.competitor)] : [];
  return [...new Set([...competitor, ...watches].filter(Boolean))];
}

export function getSettings(): Settings {
  const row = one(getDb(), "SELECT json FROM settings WHERE id = 1");
  return { ...DEFAULT_SETTINGS, ...JSON.parse(String(row?.json ?? "{}")) };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = normalizeSettings({ ...getSettings(), ...patch });
  getDb().prepare("UPDATE settings SET json = ? WHERE id = 1").run(JSON.stringify(next));
  return next;
}

export function normalizeSettings(input: Settings): Settings {
  const minFollowers = clamp(input.minFollowers, 0, 2_000_000, 2000);
  let maxFollowers = clamp(input.maxFollowers, 0, 5_000_000, 25000);
  if (maxFollowers < minFollowers) maxFollowers = minFollowers;
  const minDelayMs = clamp(input.minDelayMs, 800, 120_000, 3200);
  let maxDelayMs = clamp(input.maxDelayMs, 800, 180_000, 8600);
  if (maxDelayMs < minDelayMs) maxDelayMs = minDelayMs;
  return {
    cityId: input.cityId || "medellin",
    minFollowers,
    maxFollowers,
    hourlyCap: clamp(input.hourlyCap, 1, 80, 12),
    dailyCap: clamp(input.dailyCap, 1, 200, 40),
    minDelayMs,
    maxDelayMs,
    mockMode: Boolean(input.mockMode),
    sendEnabled: Boolean(input.sendEnabled),
    sendDailyCap: clamp(input.sendDailyCap, 1, 15, 15),
    researchProfileDir: input.researchProfileDir || DEFAULT_SETTINGS.researchProfileDir,
    outreachProfileDir: input.outreachProfileDir || DEFAULT_SETTINGS.outreachProfileDir,
    priceFile: input.priceFile || DEFAULT_SETTINGS.priceFile,
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function listCities(): CityBundle[] {
  const db = getDb();
  return all(db, "SELECT * FROM cities ORDER BY name").map((row) => getCity(db, String(row.id))!);
}

export function getCity(db: DatabaseSync, cityId: string): CityBundle | null {
  const city = one(db, "SELECT * FROM cities WHERE id = ?", cityId);
  if (!city) return null;
  return {
    id: String(city.id),
    name: String(city.name),
    country: String(city.country),
    competitor: String(city.competitor ?? ""),
    zones: all(db, "SELECT name, location_url FROM zones WHERE city_id = ? ORDER BY id", cityId).map(
      (row) => ({ name: String(row.name), locationUrl: String(row.location_url ?? "") }),
    ),
    hashtags: all(db, "SELECT tag FROM hashtags WHERE city_id = ? ORDER BY id", cityId).map((row) =>
      String(row.tag),
    ),
    watches: all(db, "SELECT username FROM watches WHERE city_id = ? ORDER BY id", cityId).map(
      (row) => String(row.username),
    ),
    shops: all(
      db,
      "SELECT zone, name, address FROM shops WHERE city_id = ? ORDER BY id",
      cityId,
    ).map((row) => ({
      zone: String(row.zone),
      name: String(row.name),
      address: String(row.address),
    })),
  };
}

export function updateCityCatalog(
  cityId: string,
  patch: Partial<Pick<CityBundle, "competitor" | "zones" | "hashtags" | "watches" | "shops">>,
): CityBundle | null {
  const db = getDb();
  const current = getCity(db, cityId);
  if (!current) return null;
  db.exec("BEGIN");
  try {
    if (patch.competitor != null) {
      db.prepare("UPDATE cities SET competitor = ? WHERE id = ?").run(
        patch.competitor.replace(/^@/, "").trim(),
        cityId,
      );
    }
    if (patch.zones) replaceZones(db, cityId, patch.zones);
    if (patch.hashtags) replaceHashtags(db, cityId, patch.hashtags);
    if (patch.watches) replaceWatches(db, cityId, patch.watches);
    if (patch.shops) replaceShops(db, cityId, patch.shops);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getCity(db, cityId);
}

function replaceZones(db: DatabaseSync, cityId: string, zones: Zone[]): void {
  db.prepare("DELETE FROM zones WHERE city_id = ?").run(cityId);
  const insert = db.prepare(
    "INSERT INTO zones (city_id, name, location_url) VALUES (?, ?, ?)",
  );
  for (const zone of zones) {
    if (!zone.name.trim()) continue;
    insert.run(cityId, zone.name.trim(), zone.locationUrl.trim());
  }
}

function replaceHashtags(db: DatabaseSync, cityId: string, tags: string[]): void {
  db.prepare("DELETE FROM hashtags WHERE city_id = ?").run(cityId);
  const insert = db.prepare("INSERT INTO hashtags (city_id, tag) VALUES (?, ?)");
  for (const tag of tags) insert.run(cityId, tag);
}

function replaceWatches(db: DatabaseSync, cityId: string, usernames: string[]): void {
  db.prepare("DELETE FROM watches WHERE city_id = ?").run(cityId);
  const insert = db.prepare("INSERT INTO watches (city_id, username) VALUES (?, ?)");
  for (const username of usernames) insert.run(cityId, username);
}

function replaceShops(db: DatabaseSync, cityId: string, shops: Shop[]): void {
  db.prepare("DELETE FROM shops WHERE city_id = ?").run(cityId);
  const insert = db.prepare(
    "INSERT INTO shops (city_id, zone, name, address) VALUES (?, ?, ?, ?)",
  );
  for (const shop of shops) {
    if (!shop.name.trim() || !shop.address.trim()) continue;
    insert.run(cityId, shop.zone.trim(), shop.name.trim(), shop.address.trim());
  }
}

function listProfileRows(db: DatabaseSync, cityId: string): ProfileCard[] {
  const rows = all(
    db,
    `SELECT p.*, s.score, s.reason, s.engagement_rate, s.content, s.location, s.engagement,
            s.authenticity, s.frequency, s.penalty, d.id AS draft_id
     FROM profiles p
     JOIN scores s ON s.profile_id = p.id
     LEFT JOIN drafts d ON d.profile_id = p.id
     WHERE p.city_id = ? AND p.is_private = 0
     ORDER BY s.score DESC, s.engagement_rate DESC, p.followers DESC`,
    cityId,
  );
  return rows.map(toProfileCard);
}

function toProfileCard(row: SqlRow): ProfileCard {
  return {
    id: Number(row.id),
    username: String(row.username),
    fullName: String(row.full_name ?? ""),
    zone: row.zone ? String(row.zone) : null,
    followers: Number(row.followers ?? 0),
    following: Number(row.following ?? 0),
    engagementRate: Number(row.engagement_rate ?? 0),
    score: Number(row.score ?? 0),
    reason: String(row.reason ?? ""),
    source: String(row.source ?? ""),
    profileUrl: String(row.profile_url),
    cityId: String(row.city_id),
    sample: Number(row.sample) === 1,
    hasDraft: row.draft_id != null,
    draftId: row.draft_id == null ? null : Number(row.draft_id),
    breakdown: {
      content: Number(row.content ?? 0),
      location: Number(row.location ?? 0),
      engagement: Number(row.engagement ?? 0),
      authenticity: Number(row.authenticity ?? 0),
      frequency: Number(row.frequency ?? 0),
      penalty: Number(row.penalty ?? 0),
    },
  };
}

export function listProfiles(cityId: string): ProfileCard[] {
  return listProfileRows(getDb(), cityId);
}

export function getProfileDetail(profileId: number): {
  card: ProfileCard;
  bio: string;
  captions: string[];
} | null {
  const db = getDb();
  const row = one(
    db,
    `SELECT p.*, s.score, s.reason, s.engagement_rate, s.content, s.location, s.engagement,
            s.authenticity, s.frequency, s.penalty, d.id AS draft_id
     FROM profiles p
     JOIN scores s ON s.profile_id = p.id
     LEFT JOIN drafts d ON d.profile_id = p.id
     WHERE p.id = ?`,
    profileId,
  );
  if (!row) return null;
  const captions = all(db, "SELECT caption FROM posts WHERE profile_id = ? ORDER BY id", profileId).map(
    (post) => String(post.caption ?? ""),
  );
  return { card: toProfileCard(row), bio: String(row.bio ?? ""), captions };
}

export function getRun(): RunView {
  const row = one(getDb(), "SELECT * FROM run_state WHERE id = 1");
  return {
    status: (row?.status as RunStatus) ?? "idle",
    message: String(row?.message ?? ""),
    cityId: row?.city_id ? String(row.city_id) : null,
    mode: row?.mode === "live" || row?.mode === "mock" ? row.mode : null,
    seen: Number(row?.seen ?? 0),
    kept: Number(row?.kept ?? 0),
  };
}

export function setRun(patch: Partial<RunView>): RunView {
  const current = getRun();
  const next = { ...current, ...patch };
  getDb()
    .prepare(
      `UPDATE run_state
       SET status = ?, message = ?, city_id = ?, mode = ?, seen = ?, kept = ?, updated_at = ?
       WHERE id = 1`,
    )
    .run(
      next.status,
      next.message,
      next.cityId,
      next.mode,
      next.seen,
      next.kept,
      new Date().toISOString(),
    );
  return next;
}

export function countActions(kind: string, sinceIso: string): number {
  const row = one(
    getDb(),
    "SELECT COUNT(*) AS n FROM action_log WHERE kind = ? AND created_at >= ?",
    kind,
    sinceIso,
  );
  return Number(row?.n ?? 0);
}

export function logAction(kind: string): void {
  getDb()
    .prepare("INSERT INTO action_log (kind, created_at) VALUES (?, ?)")
    .run(kind, new Date().toISOString());
}

export function profileCaps(now = new Date()): { hour: number; day: number } {
  return {
    hour: countActions("profile_visit", hourAgoIso(now)),
    day: countActions("profile_visit", dayStartIso(now)),
  };
}

export function listDrafts(): DraftCard[] {
  const rows = all(
    getDb(),
    `SELECT d.*, p.username, p.full_name, p.zone, p.city_id, p.profile_url
     FROM drafts d
     JOIN profiles p ON p.id = d.profile_id
     ORDER BY d.updated_at DESC`,
  );
  const rank: Record<string, number> = {
    draft: 0,
    approved: 1,
    failed: 2,
    sending: 3,
    sent: 4,
    skipped: 5,
  };
  return rows
    .map((row) => ({
      id: Number(row.id),
      profileId: Number(row.profile_id),
      username: String(row.username),
      fullName: String(row.full_name ?? ""),
      zone: row.zone ? String(row.zone) : null,
      cityId: String(row.city_id),
      body: String(row.body ?? ""),
      status: String(row.status) as DraftStatus,
      shopName: String(row.shop_name ?? ""),
      error: row.error ? String(row.error) : null,
      profileUrl: String(row.profile_url),
    }))
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.id - a.id);
}

export function getDraft(id: number): DraftCard | null {
  return listDrafts().find((draft) => draft.id === id) ?? null;
}

export function upsertDraft(profileId: number, body: string, shopName: string): DraftCard {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = one(db, "SELECT id, status FROM drafts WHERE profile_id = ?", profileId);
  if (!existing) {
    db.prepare(
      `INSERT INTO drafts (profile_id, body, shop_name, status, error, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', NULL, ?, ?)`,
    ).run(profileId, body, shopName, now, now);
  } else if (existing.status === "sent" || existing.status === "sending") {
    throw new Error("Ese borrador ya se está enviando o se envió.");
  } else {
    db.prepare(
      `UPDATE drafts SET body = ?, shop_name = ?, status = 'draft', error = NULL, updated_at = ? WHERE profile_id = ?`,
    ).run(body, shopName, now, profileId);
  }
  const row = one(db, "SELECT id FROM drafts WHERE profile_id = ?", profileId);
  const draft = getDraft(Number(row?.id));
  if (!draft) throw new Error("No se pudo guardar el borrador.");
  return draft;
}

export function updateDraft(
  id: number,
  patch: { body?: string; status?: DraftStatus; error?: string | null },
): DraftCard | null {
  const current = getDraft(id);
  if (!current) return null;
  const status = patch.status ?? current.status;
  const body = patch.body ?? current.body;
  const error = patch.error === undefined ? current.error : patch.error;
  const sentAt = status === "sent" ? new Date().toISOString() : null;
  getDb()
    .prepare(
      `UPDATE drafts
       SET body = ?, status = ?, error = ?, updated_at = ?, sent_at = COALESCE(?, sent_at)
       WHERE id = ?`,
    )
    .run(body, status, error, new Date().toISOString(), sentAt, id);
  return getDraft(id);
}

export function attemptsToday(now = new Date()): number {
  const row = one(
    getDb(),
    "SELECT COUNT(*) AS n FROM send_log WHERE created_at >= ?",
    dayStartIso(now),
  );
  return Number(row?.n ?? 0);
}

export function logSend(draftId: number, result: string): void {
  getDb()
    .prepare("INSERT INTO send_log (draft_id, result, created_at) VALUES (?, ?, ?)")
    .run(draftId, result, new Date().toISOString());
}

export function getNextSendAt(): string | null {
  const row = one(getDb(), "SELECT next_send_at FROM send_gate WHERE id = 1");
  return row?.next_send_at ? String(row.next_send_at) : null;
}

export function setNextSendAt(iso: string | null): void {
  getDb().prepare("UPDATE send_gate SET next_send_at = ? WHERE id = 1").run(iso);
}

export function latestStudy(cityId: string): CompetitorStudy | null {
  const row = one(
    getDb(),
    "SELECT payload FROM studies WHERE city_id = ? ORDER BY id DESC LIMIT 1",
    cityId,
  );
  if (!row?.payload) return null;
  return JSON.parse(String(row.payload)) as CompetitorStudy;
}

export function saveStudy(study: CompetitorStudy): void {
  getDb()
    .prepare(
      "INSERT INTO studies (username, city_id, payload, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(study.username, study.cityId, JSON.stringify(study), study.studiedAt);
}

export function clearSamples(cityId?: string): number {
  const db = getDb();
  const result = cityId
    ? db.prepare("DELETE FROM profiles WHERE sample = 1 AND city_id = ?").run(cityId)
    : db.prepare("DELETE FROM profiles WHERE sample = 1").run();
  return Number(result.changes ?? 0);
}

export function knownUsernames(): Set<string> {
  return new Set(
    all(getDb(), "SELECT username FROM profiles").map((row) => String(row.username)),
  );
}

export function getPanelState(): PanelState {
  const settings = getSettings();
  const pricePath = path.resolve(process.cwd(), settings.priceFile);
  const prices = readPriceFile(pricePath);
  return {
    settings,
    cities: listCities(),
    run: getRun(),
    profiles: listProfiles(settings.cityId),
    drafts: listDrafts(),
    study: latestStudy(settings.cityId),
    prices: prices.rows,
    pricesNote: prices.note,
    pricesError: prices.error,
    sendsToday: attemptsToday(),
    nextSendAt: getNextSendAt(),
  };
}

function all(db: DatabaseSync, sql: string, ...params: unknown[]): SqlRow[] {
  const statement = db.prepare(sql);
  const rows = (params.length ? statement.all(...(params as never[])) : statement.all()) as SqlRow[];
  return rows.map((row) => ({ ...row }));
}

function one(db: DatabaseSync, sql: string, ...params: unknown[]): SqlRow | undefined {
  return all(db, sql, ...params)[0];
}

export function resetDatabaseForTests(): void {
  if (database) {
    database.close();
    database = null;
  }
}
