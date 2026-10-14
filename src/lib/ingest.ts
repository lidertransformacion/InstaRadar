import { formatFollowers } from "@/lib/format";
import { fold, cleanUsername } from "@/lib/text";
import type { CityBundle, CompetitorStudy } from "@/lib/types";
import type { StoredProfile } from "@/lib/db";

export type ResearchCompetitor = {
  username: string;
  url: string;
  displayName: string;
  followers: number;
  following: number;
  posts: number;
  bio: string;
  address: string;
  highlights: string[];
};

export type ResearchInfluencer = {
  username: string;
  url: string;
  displayName: string;
  followers: number;
  following: number;
  posts: number;
  bio: string;
  location: string;
  niche: string;
  mentionedPergamino: boolean;
};

export type ResearchFile = {
  city: string;
  collectedAt: string | null;
  source: string;
  competitors: ResearchCompetitor[];
  influencers: ResearchInfluencer[];
};

export class ResearchFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchFileError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseResearchJson(raw: string): ResearchFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ResearchFileError("Ese archivo no es JSON.");
  }
  const root = asRecord(parsed);
  if (!root) throw new ResearchFileError("El JSON tiene que ser un objeto.");
  const city = asText(root.city);
  if (!city) throw new ResearchFileError("Falta la ciudad.");
  if (!Array.isArray(root.influencers)) {
    throw new ResearchFileError("Falta la lista de influencers.");
  }
  const competitors = Array.isArray(root.competitors) ? root.competitors : [];
  return {
    city,
    collectedAt: asText(root.collected_at) || null,
    source: asText(root.source),
    competitors: competitors.map(parseCompetitor),
    influencers: root.influencers.map(parseInfluencer),
  };
}

function parseCompetitor(value: unknown, index: number): ResearchCompetitor {
  const row = asRecord(value);
  if (!row) throw new ResearchFileError(`La competencia ${index + 1} no es un objeto.`);
  const username = cleanUsername(asText(row.username));
  if (!username) throw new ResearchFileError(`La competencia ${index + 1} no tiene usuario.`);
  const followers = asNumber(row.followers);
  const following = asNumber(row.following);
  const posts = asNumber(row.posts);
  if (followers == null || following == null || posts == null) {
    throw new ResearchFileError(`A @${username} le faltan seguidores, seguidos o publicaciones.`);
  }
  const highlights = Array.isArray(row.highlights)
    ? row.highlights.map(asText).filter(Boolean)
    : [];
  return {
    username,
    url: asText(row.url) || `https://www.instagram.com/${username}/`,
    displayName: asText(row.display_name) || username,
    followers,
    following,
    posts,
    bio: asText(row.bio),
    address: asText(row.address),
    highlights,
  };
}

function parseInfluencer(value: unknown, index: number): ResearchInfluencer {
  const row = asRecord(value);
  if (!row) throw new ResearchFileError(`El perfil ${index + 1} no es un objeto.`);
  const username = cleanUsername(asText(row.username));
  if (!username) throw new ResearchFileError(`El perfil ${index + 1} no tiene usuario.`);
  const followers = asNumber(row.followers);
  const following = asNumber(row.following);
  const posts = asNumber(row.posts);
  if (followers == null || following == null || posts == null) {
    throw new ResearchFileError(`A @${username} le faltan seguidores, seguidos o publicaciones.`);
  }
  return {
    username,
    url: asText(row.url) || `https://www.instagram.com/${username}/`,
    displayName: asText(row.display_name) || username,
    followers,
    following,
    posts,
    bio: asText(row.bio),
    location: asText(row.location),
    niche: asText(row.niche),
    mentionedPergamino: row.mentioned_pergamino === true,
  };
}

export function matchCity(name: string, cities: CityBundle[]): CityBundle | null {
  const wanted = fold(name);
  return (
    cities.find((city) => fold(city.name) === wanted || fold(city.id) === wanted) ?? null
  );
}

export function matchZone(location: string, zones: string[]): string | null {
  const folded = fold(location);
  const hits = zones.filter((zone) => {
    const name = fold(zone);
    return name.length > 2 && folded.includes(name);
  });
  hits.sort((a, b) => fold(b).length - fold(a).length);
  return hits[0] ?? null;
}

export function planProfiles(
  file: ResearchFile,
  city: CityBundle,
  competitor: string,
): StoredProfile[] {
  const zones = city.zones.map((zone) => zone.name);
  return file.influencers.map((person) => {
    const captions = [person.niche, person.location].filter(Boolean);
    if (person.mentionedPergamino && competitor) {
      captions.push(`Mención pública a @${competitor}`);
    }
    return {
      username: person.username,
      fullName: person.displayName,
      bio: person.bio,
      followers: person.followers,
      following: person.following,
      postsCount: person.posts,
      cityId: city.id,
      zone: matchZone(person.location, zones),
      source: "investigación",
      sample: false,
      isPrivate: false,
      posts: captions.map((caption) => ({
        caption,
        likes: 0,
        comments: 0,
        takenAt: null,
        mediaType: "note",
      })),
    };
  });
}

export function planCompetitorStudy(
  competitor: ResearchCompetitor,
  cityId: string,
  studiedAt: string,
): CompetitorStudy {
  const followers = formatFollowers(competitor.followers);
  const posts = formatFollowers(competitor.posts);
  const highlights =
    competitor.highlights.length > 0
      ? `Destacados: ${competitor.highlights.join(", ")}.`
      : "Este archivo no trae comentarios ni colaboradores.";
  return {
    username: competitor.username,
    cityId,
    studiedAt,
    mock: false,
    summary: `${competitor.displayName} tiene ${followers} seguidores y ${posts} publicaciones.`,
    cadence: "Este archivo no trae fechas de publicación.",
    tone: competitor.bio || "Sin biografía en el archivo.",
    audience: highlights,
    formats: [],
    topPosts: [],
    collaborators: [],
    commenters: [],
    account: {
      displayName: competitor.displayName,
      followers: competitor.followers,
      following: competitor.following,
      posts: competitor.posts,
      bio: competitor.bio,
      address: competitor.address,
      highlights: competitor.highlights,
      url: competitor.url,
    },
  };
}
