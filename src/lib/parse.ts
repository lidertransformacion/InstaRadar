const RESERVED = new Set([
  "explore",
  "reels",
  "stories",
  "accounts",
  "p",
  "reel",
  "direct",
  "about",
  "legal",
  "developer",
  "emails",
  "directory",
]);

export type ParsedMeta = {
  followers: number | null;
  following: number | null;
  posts: number | null;
  fullName: string | null;
};

export function parseCompactNumber(raw: string, locale: "en" | "es"): number | null {
  let token = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!token) return null;
  let multiplier = 1;
  if (token.endsWith("mil")) {
    multiplier = 1_000;
    token = token.slice(0, -3);
  } else if (token.endsWith("mill")) {
    multiplier = 1_000_000;
    token = token.slice(0, -4);
  } else if (token.endsWith("k")) {
    multiplier = 1_000;
    token = token.slice(0, -1);
  } else if (token.endsWith("m")) {
    multiplier = 1_000_000;
    token = token.slice(0, -1);
  }
  if (!token) return null;

  let value: number;
  if (multiplier !== 1) {
    value = Number(token.replace(",", "."));
  } else if (locale === "es") {
    value = Number(token.replace(/\./g, "").replace(",", "."));
  } else {
    value = Number(token.replace(/,/g, ""));
  }
  if (!Number.isFinite(value)) return null;
  return Math.round(value * multiplier);
}

function parseDisplayName(description: string): string | null {
  const cut = description.indexOf("(@");
  const before = (cut >= 0 ? description.slice(0, cut) : description).trim();
  const match = before.match(
    /(?:from|de)\s+([\p{L}][\p{L}'’.\-]*(?:\s+[\p{L}][\p{L}'’.\-]*){0,2})\s*$/iu,
  );
  return match?.[1]?.trim() || null;
}

function localeOf(text: string): "en" | "es" {
  return /seguidores|seguidos|publicaciones|me gusta|comentarios/i.test(text) ? "es" : "en";
}

function matchCount(text: string, label: string, locale: "en" | "es"): number | null {
  const pattern = new RegExp(`([\\d.,]+\\s*(?:k|m|mil|mill)?)\\s*(?:${label})`, "i");
  const match = text.match(pattern);
  if (!match) return null;
  return parseCompactNumber(match[1], locale);
}

export function parseProfileMeta(description: string): ParsedMeta {
  const locale = localeOf(description);
  const fullName = parseDisplayName(description);
  return {
    followers: matchCount(description, "followers|seguidores", locale),
    following: matchCount(description, "following|seguidos", locale),
    posts: matchCount(description, "posts|publicaciones", locale),
    fullName,
  };
}

export function parseEngagementText(text: string): {
  likes: number | null;
  comments: number | null;
} {
  const locale = localeOf(text);
  return {
    likes: matchCount(text, "likes|me gusta", locale),
    comments: matchCount(text, "comments|comentarios", locale),
  };
}

export function isPrivateAccount(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return (
    normalized.includes("this account is private") ||
    normalized.includes("esta cuenta es privada")
  );
}

export function usernamesFromHrefs(hrefs: string[]): string[] {
  const found: string[] = [];
  for (const href of hrefs) {
    const match = href.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
    if (!match) continue;
    const username = match[1].toLowerCase();
    if (RESERVED.has(username)) continue;
    if (!found.includes(username)) found.push(username);
  }
  return found;
}

export function postPathsFromHrefs(hrefs: string[]): string[] {
  const found: string[] = [];
  for (const href of hrefs) {
    const match = href.match(/^\/(p|reel)\/([A-Za-z0-9_-]+)\/?/);
    if (!match) continue;
    const postPath = `/${match[1]}/${match[2]}/`;
    if (!found.includes(postPath)) found.push(postPath);
  }
  return found;
}

export function mediaTypeFromPath(postPath: string): "reel" | "image" {
  return postPath.startsWith("/reel/") ? "reel" : "image";
}
