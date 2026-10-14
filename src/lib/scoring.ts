import { fold, mentionsHandle, oneLine } from "@/lib/text";

const COFFEE = [
  "cafe",
  "coffee",
  "espresso",
  "latte",
  "cappuccino",
  "flat white",
  "pour over",
  "v60",
  "barista",
  "tostion",
  "tostador",
  "especialidad",
  "specialty",
  "cortado",
  "cold brew",
  "filtro",
  "aeropress",
  "chemex",
  "origen",
  "tueste",
];

const FOOD = [
  "brunch",
  "desayuno",
  "breakfast",
  "comida",
  "foodie",
  "restaurante",
  "panaderia",
  "croissant",
  "almuerzo",
  "huevos",
  "bakery",
  "tostada",
  "pastel",
];

const LIFESTYLE = [
  "lifestyle",
  "ciudad",
  "medallo",
  "barrio",
  "paseo",
  "outfit",
  "local",
  "costanera",
];

export type RecentPost = {
  likes: number;
  comments: number;
  takenAt: string | null;
  caption?: string;
};

export type ScoreInput = {
  bio: string;
  captions: string[];
  zone: string | null;
  cityName: string;
  zones: string[];
  followers: number;
  following: number;
  recentPosts: RecentPost[];
  postsCount: number;
  competitorUsernames: string[];
  /** False when the account was found on the web and still needs an Instagram check. */
  verified?: boolean;
  /** Share of followers flagged as fake, from 0 to 1. */
  fakeFollowerShare?: number | null;
};

export const UNVERIFIED_RANK_PENALTY = 4;

export function fakeFollowerShare(notes: string): number | null {
  const match = notes.match(/fake followers\s+([\d]+(?:[.,]\d+)?)\s*%/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return value / 100;
}

export type ScoreBreakdown = {
  content: number;
  location: number;
  engagement: number;
  authenticity: number;
  frequency: number;
  penalty: number;
};

export type ScoreResult = {
  score: number;
  reason: string;
  engagementRate: number;
  breakdown: ScoreBreakdown;
  flags: string[];
  competitor: string | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stripHandles(text: string): string {
  return text.replace(/@[a-z0-9._]+/gi, " ");
}

function hits(text: string, terms: string[]): boolean {
  const normalized = fold(stripHandles(text));
  return terms.some((term) => normalized.includes(term));
}

function share(docs: string[], terms: string[]): number {
  if (docs.length === 0) return 0;
  const found = docs.filter((doc) => hits(doc, terms)).length;
  return found / docs.length;
}

export function engagementRate(posts: RecentPost[], followers: number): number {
  if (!Number.isFinite(followers) || followers <= 0 || posts.length === 0) return 0;
  const total = posts.reduce(
    (sum, post) => sum + Math.max(0, post.likes) + Math.max(0, post.comments),
    0,
  );
  return total / posts.length / followers;
}

function engagementPoints(rate: number, followers: number): number {
  const percent = rate * 100;
  if (percent <= 0) return 0;
  if (percent < 0.4) return 4;
  if (percent < 1.2) return 12;
  if (percent <= 6) return 25;
  if (percent <= 10) return 20;
  if (percent <= 15) return followers < 4000 ? 18 : 12;
  return followers < 4000 ? 14 : 5;
}

export function postsPerWeek(posts: RecentPost[]): number | null {
  const times = posts
    .map((post) => (post.takenAt ? Date.parse(post.takenAt) : Number.NaN))
    .filter((time) => !Number.isNaN(time))
    .sort((a, b) => a - b);
  if (times.length < 2) return null;
  const spanDays = (times[times.length - 1] - times[0]) / 86_400_000;
  if (spanDays < 0.25) return null;
  return ((times.length - 1) / spanDays) * 7;
}

function frequencyPoints(perWeek: number | null): number {
  if (perWeek == null) return 5;
  if (perWeek >= 1 && perWeek <= 5) return 10;
  if (perWeek >= 0.4 && perWeek < 1) return 7;
  if (perWeek > 5 && perWeek <= 9) return 6;
  if (perWeek > 9) return 3;
  return 2;
}

function locationPoints(input: ScoreInput): number {
  const blob = fold([input.bio, ...input.captions].join(" \n "));
  const zoneNames = input.zones.map((zone) => fold(zone)).filter((zone) => zone.length > 2);
  const assigned = input.zone ? fold(input.zone) : "";
  const assignedKnown =
    assigned.length > 0 &&
    zoneNames.some(
      (zone) => zone === assigned || assigned.includes(zone) || zone.includes(assigned),
    );
  const mentioned = zoneNames.some((zone) => blob.includes(zone));
  if (assignedKnown && mentioned) return 20;
  if (assignedKnown || mentioned) return 16;
  const city = fold(input.cityName);
  if (city.length > 2 && blob.includes(city)) return 10;
  return 0;
}

function authenticityPoints(
  input: ScoreInput,
  rate: number,
  docs: string[],
): { points: number; flags: string[] } {
  let points = 15;
  const flags: string[] = [];
  const followers = input.followers;
  const following = input.following;

  if (followers > 0 && following / followers > 6) {
    points -= 11;
    flags.push("sigue a muchas más cuentas de las que lo siguen");
  } else if (followers > 0 && following / followers > 2.5) {
    points -= 6;
    flags.push("sigue a demasiadas cuentas");
  }

  if (rate > 0.2 && followers >= 5000) {
    points -= 8;
    flags.push("engagement poco creíble para el tamaño");
  }

  if (input.postsCount >= 0 && input.postsCount < 8 && followers > 5000) {
    points -= 5;
    flags.push("pocas publicaciones para tantos seguidores");
  }

  const fake = input.fakeFollowerShare;
  if (fake != null && fake >= 0.25) {
    points -= 5;
    flags.push("una parte alta de seguidores no parece real");
  } else if (fake != null && fake >= 0.15) {
    points -= 3;
    flags.push("hay una señal de seguidores falsos");
  }

  if (!input.bio.trim()) {
    points -= 3;
    flags.push("sin biografía");
  }

  const captions = input.captions.map((caption) => fold(caption)).filter(Boolean);
  if (captions.length >= 3 && new Set(captions).size === 1) {
    points -= 4;
    flags.push("textos repetidos");
  }

  if (docs.length === 0 && followers > 1000) {
    points -= 2;
  }

  return { points: clamp(points, 0, 15), flags };
}

function matchedCompetitor(docs: string[], handles: string[]): string | null {
  for (const handle of handles) {
    if (docs.some((doc) => mentionsHandle(doc, handle))) {
      return handle.replace(/^@/, "");
    }
  }
  return null;
}

export function formatPercent(rate: number): string {
  const formatted = new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rate * 100);
  return `${formatted}%`;
}

function topicLabel(coffeeShare: number, foodShare: number): string {
  if (coffeeShare >= 0.34 && foodShare >= 0.25) return "Café y brunch";
  if (coffeeShare >= 0.34) return "Café";
  if (foodShare >= 0.34) return "Brunch y comida";
  return "Estilo de vida";
}

function buildReason(input: {
  score: number;
  zone: string | null;
  cityName: string;
  engagementRate: number;
  content: number;
  location: number;
  authenticity: number;
  topic: string;
  competitor: string | null;
}): string {
  const place = input.zone ? `en ${input.zone}` : `en ${input.cityName}`;
  const percent = formatPercent(input.engagementRate);
  if (input.authenticity <= 6) {
    return oneLine("El engagement no cuadra con el tamaño de la cuenta.");
  }
  if (input.competitor && input.content < 8) {
    return oneLine(`Poca conversación de café, y ya aparece con @${input.competitor}.`);
  }
  if (input.content < 8) {
    return oneLine("Poca conversación de café, brunch o comida local.");
  }
  if (input.competitor) {
    return oneLine(`Buen encaje ${place}, pero ya aparece con @${input.competitor}.`);
  }
  if (input.score >= 75) {
    return oneLine(`${input.topic} ${place}, engagement ${percent} y publica con ritmo.`);
  }
  if (input.location < 8) {
    return oneLine(`Algo de afinidad, sin zona clara. Engagement ${percent}.`);
  }
  return oneLine(`Encaje parcial ${place}. Engagement ${percent}.`);
}

export function scoreProfile(input: ScoreInput): ScoreResult {
  const docs = [input.bio, ...input.captions].map((part) => part.trim()).filter(Boolean);
  const coffeeShare = share(docs, COFFEE);
  const foodShare = share(docs, FOOD);
  const lifeShare = share(docs, LIFESTYLE);

  let content = coffeeShare * 18 + foodShare * 8 + lifeShare * 4;
  if (coffeeShare > 0 && foodShare > 0) content += 4;
  content = clamp(content, 0, 30);

  const location = locationPoints(input);
  const rate = engagementRate(input.recentPosts, input.followers);
  const engagementRaw = engagementPoints(rate, input.followers);
  // A nightlife account with likes but no coffee talk should not outrank a café profile.
  const engagement = content < 8 ? Math.round(engagementRaw * 0.5) : engagementRaw;
  const { points: authenticity, flags } = authenticityPoints(input, rate, docs);
  const frequency = frequencyPoints(postsPerWeek(input.recentPosts));
  const competitor = matchedCompetitor(docs, input.competitorUsernames);
  const penalty = competitor ? 8 : 0;
  const review = input.verified === false ? UNVERIFIED_RANK_PENALTY : 0;

  const fit = Math.round(
    clamp(content + location + engagement + authenticity + frequency - penalty, 0, 100),
  );
  const score = Math.max(0, fit - review);

  const reason = buildReason({
    score: fit,
    zone: input.zone,
    cityName: input.cityName,
    engagementRate: rate,
    content,
    location,
    authenticity,
    topic: topicLabel(coffeeShare, foodShare),
    competitor,
  });

  return {
    score,
    reason,
    engagementRate: rate,
    breakdown: {
      content: Math.round(content * 10) / 10,
      location,
      engagement,
      authenticity,
      frequency,
      penalty,
    },
    flags,
    competitor,
  };
}

export function contentHint(
  bio: string,
  captions: string[],
): "cafe" | "brunch" | "lifestyle" | "mix" {
  const docs = [bio, ...captions].filter((part) => part.trim());
  const coffeeShare = share(docs, COFFEE);
  const foodShare = share(docs, FOOD);
  if (coffeeShare >= 0.34 && foodShare >= 0.25) return "mix";
  if (foodShare > coffeeShare && foodShare >= 0.34) return "brunch";
  if (coffeeShare >= 0.34) return "cafe";
  return "lifestyle";
}
