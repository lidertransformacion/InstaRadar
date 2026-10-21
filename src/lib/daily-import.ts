import { DEFAULT_CITIES } from "@/lib/catalog";
import { matchCity, parseResearchJson, planProfiles, ResearchFileError } from "@/lib/ingest";
import { bogotaDate } from "@/lib/nuevo-hoy";
import { fakeFollowerShare, scoreProfile } from "@/lib/scoring";
import type { ProfileCard } from "@/lib/types";
import type { StoredProfile } from "@/lib/db";

export const DAILY_SEARCH_META_KEYS = [
  "daily_search_enabled",
  "daily_search_last_run_at",
  "daily_search_last_run_new",
] as const;

export type DailySearchSql = {
  sql: string;
  cityId: string;
  candidates: string[];
  foundOn: string;
  ranAt: string;
};

export function buildDailySearchSql(raw: string, now = new Date()): DailySearchSql {
  const file = parseResearchJson(raw);
  const city = matchCity(file.city, DEFAULT_CITIES);
  if (!city) {
    throw new ResearchFileError(
      `Unknown city "${file.city}". Use a city name or id from the catalog.`,
    );
  }
  const competitor = file.competitors[0]?.username || city.competitor || "";
  const handles = [...new Set([competitor, ...city.watches].filter(Boolean))];
  const seen = new Set<string>();
  const planned = planProfiles(file, city, competitor).filter((profile) => {
    if (seen.has(profile.username)) return false;
    seen.add(profile.username);
    return true;
  });
  const foundOn = bogotaDate(now);
  const ranAt = now.toISOString();
  const cards = planned.map((profile) => toDailyCard(profile, city.name, city.zones.map((zone) => zone.name), handles, foundOn));
  return {
    sql: renderSql(cards, foundOn, ranAt),
    cityId: city.id,
    candidates: cards.map((card) => card.username),
    foundOn,
    ranAt,
  };
}

function toDailyCard(
  profile: StoredProfile,
  cityName: string,
  zones: string[],
  competitorUsernames: string[],
  foundOn: string,
): ProfileCard & { newToday: true; foundOn: string } {
  const scored = scoreProfile({
    bio: profile.bio,
    captions: profile.posts.map((post) => post.caption),
    zone: profile.zone,
    cityName,
    zones,
    followers: profile.followers ?? 0,
    following: profile.following ?? 0,
    postsCount: profile.postsCount ?? -1,
    recentPosts: profile.posts.map((post) => ({
      likes: post.likes,
      comments: post.comments,
      takenAt: post.takenAt,
      caption: post.caption,
    })),
    competitorUsernames,
    verified: profile.verified,
    fakeFollowerShare: fakeFollowerShare(profile.notes),
  });
  return {
    id: dailyProfileId(profile.username),
    username: profile.username,
    fullName: profile.fullName,
    zone: profile.zone,
    followers: profile.followers,
    following: profile.following,
    engagementRate: scored.engagementRate,
    score: scored.score,
    reason: scored.reason,
    source: profile.source,
    verified: profile.verified,
    followersSource: profile.followersSource,
    evidenceUrl: profile.evidenceUrl,
    notes: profile.notes,
    avatarUrl: "",
    profileUrl: `https://www.instagram.com/${profile.username}/`,
    cityId: profile.cityId,
    sample: false,
    hasDraft: false,
    draftId: null,
    breakdown: scored.breakdown,
    newToday: true,
    foundOn,
  };
}

/** Stable id above local sqlite row ids so a cloud card does not collide with a Mac id. */
export function dailyProfileId(username: string): number {
  let hash = 2166136261;
  for (let index = 0; index < username.length; index += 1) {
    hash ^= username.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 1_000_000_000 + ((hash >>> 0) % 800_000_000);
}

function renderSql(
  cards: Array<ProfileCard & { newToday: true; foundOn: string }>,
  foundOn: string,
  ranAt: string,
): string {
  const lines = [
    "-- Daily search import for D1 instaradar.",
    "-- Inserts profiles whose username is not already present.",
    "-- Clears newToday on rows found on an earlier Bogota date.",
    "-- Always sets daily_search_last_run_at and daily_search_last_run_new.",
    "DROP TABLE IF EXISTS daily_search_import_scratch;",
    "CREATE TABLE daily_search_import_scratch (before_count INTEGER NOT NULL);",
    "INSERT INTO daily_search_import_scratch (before_count) VALUES ((SELECT COUNT(*) FROM profiles));",
    "UPDATE profiles",
    "SET data = json_set(data, '$.newToday', json('false'))",
    "WHERE json_extract(data, '$.newToday') = 1",
    `  AND coalesce(json_extract(data, '$.foundOn'), '') != ${sqlString(foundOn)};`,
  ];
  for (const card of cards) {
    lines.push(
      "INSERT INTO profiles (username, city_id, data)",
      `SELECT ${sqlString(card.username)}, ${sqlString(card.cityId)}, ${sqlString(JSON.stringify(card))}`,
      `WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE username = ${sqlString(card.username)});`,
    );
  }
  lines.push(
    "INSERT INTO meta (key, value) VALUES ('daily_search_last_run_at', " +
      `${sqlString(JSON.stringify(ranAt))})`,
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
    "INSERT INTO meta (key, value) VALUES (",
    "  'daily_search_last_run_new',",
    "  (SELECT CAST((SELECT COUNT(*) FROM profiles) - before_count AS TEXT) FROM daily_search_import_scratch)",
    ")",
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
    "DROP TABLE daily_search_import_scratch;",
    "",
  );
  return lines.join("\n");
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
