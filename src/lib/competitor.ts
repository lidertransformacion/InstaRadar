import { fold } from "@/lib/text";
import type { CompetitorStudy, FormatStat, HandleCount } from "@/lib/types";

export type RawCompetitorPost = {
  shortcode: string;
  caption: string;
  likes: number;
  comments: number;
  mediaType: "image" | "carousel" | "reel";
  takenAt: string;
  collaborators: string[];
  commenters: string[];
};

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const TONE_BUCKETS: { id: string; label: string; terms: string[] }[] = [
  { id: "product", label: "producto", terms: ["origen", "tueste", "notas", "variedad", "proceso", "filtro", "espresso"] },
  { id: "table", label: "la mesa", terms: ["brunch", "desayuno", "mesa", "croissant", "huevos", "pastel"] },
  { id: "community", label: "comunidad", terms: ["gracias", "equipo", "barrio", "juntos", "visita"] },
  { id: "promo", label: "promoción", terms: ["descuento", "promo", "2x1", "hoy solo", "cupon"] },
];

function engagement(post: RawCompetitorPost): number {
  return post.likes + post.comments;
}

function topCounts(values: string[], limit: number): HandleCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const username = value.replace(/^@/, "").toLowerCase();
    if (!username) continue;
    counts.set(username, (counts.get(username) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([username, posts]) => ({ username, posts }));
}

function cadenceText(posts: RawCompetitorPost[]): string {
  if (posts.length < 2) return "Muy pocas publicaciones para ver el ritmo.";
  const times = posts
    .map((post) => Date.parse(post.takenAt))
    .filter((time) => !Number.isNaN(time))
    .sort((a, b) => a - b);
  if (times.length < 2) return "No hay fechas suficientes.";
  const spanDays = Math.max(1, (times[times.length - 1] - times[0]) / 86_400_000);
  const perWeek = ((times.length - 1) / spanDays) * 7;
  const weekdayCounts = new Map<string, number>();
  for (const time of times) {
    const name = WEEKDAYS[new Date(time).getDay()];
    weekdayCounts.set(name, (weekdayCounts.get(name) ?? 0) + 1);
  }
  const topDays = [...weekdayCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([day]) => day);
  const rate = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(perWeek);
  return `Unas ${rate} publicaciones por semana, sobre todo ${topDays.join(" y ")}.`;
}

function toneText(posts: RawCompetitorPost[]): string {
  const scores = TONE_BUCKETS.map((bucket) => {
    const hits = posts.filter((post) => {
      const text = fold(post.caption);
      return bucket.terms.some((term) => text.includes(fold(term)));
    }).length;
    return { label: bucket.label, hits };
  }).sort((a, b) => b.hits - a.hits);
  const leading = scores.filter((score) => score.hits > 0).slice(0, 2);
  if (leading.length === 0) return "El tono no se deja leer con estas piezas.";
  if (leading.length === 1) return `Habla sobre todo de ${leading[0].label}.`;
  return `Habla más de ${leading[0].label} y de ${leading[1].label} que de lo demás.`;
}

function audienceText(posts: RawCompetitorPost[], commenters: HandleCount[]): string {
  const comments = posts.reduce((sum, post) => sum + post.comments, 0);
  const repeated = commenters.filter((person) => person.posts >= 2);
  if (posts.length === 0) return "Sin comentarios para leer.";
  if (repeated.length === 0) {
    return `${comments} comentarios en la muestra, sin cuentas que se repitan.`;
  }
  return `${comments} comentarios en la muestra. Se repiten ${repeated
    .slice(0, 3)
    .map((person) => "@" + person.username)
    .join(", ")}.`;
}

const FORMAT_LABELS: Record<string, string> = {
  reel: "Reel",
  carousel: "Carrusel",
  image: "Foto",
};

export function summarizeCompetitor(
  username: string,
  cityId: string,
  posts: RawCompetitorPost[],
  studiedAt: string,
): Omit<CompetitorStudy, "mock"> {
  const ranked = [...posts].sort((a, b) => engagement(b) - engagement(a));
  const formats: FormatStat[] = ["reel", "carousel", "image"].map((type) => {
    const group = posts.filter((post) => post.mediaType === type);
    const avg =
      group.length === 0
        ? 0
        : Math.round(group.reduce((sum, post) => sum + engagement(post), 0) / group.length);
    return {
      type,
      label: FORMAT_LABELS[type] ?? type,
      count: group.length,
      avgEngagement: avg,
    };
  });
  const bestFormat = [...formats].sort((a, b) => b.avgEngagement - a.avgEngagement)[0];
  const collaborators = topCounts(
    posts.flatMap((post) => post.collaborators),
    8,
  );
  const commenters = topCounts(
    posts.flatMap((post) => post.commenters),
    8,
  );
  const summary = bestFormat && bestFormat.count > 0
    ? `En @${username} rinde más el formato ${bestFormat.label.toLowerCase()}.`
    : `Muestra corta de @${username}.`;

  return {
    username,
    cityId,
    studiedAt,
    summary,
    cadence: cadenceText(posts),
    tone: toneText(posts),
    audience: audienceText(posts, commenters),
    formats,
    topPosts: ranked.slice(0, 5).map((post) => ({
      shortcode: post.shortcode,
      caption: post.caption.replace(/\s+/g, " ").trim(),
      likes: post.likes,
      comments: post.comments,
      mediaType: FORMAT_LABELS[post.mediaType] ?? post.mediaType,
      engagement: engagement(post),
      url: `https://www.instagram.com/${post.mediaType === "reel" ? "reel" : "p"}/${post.shortcode}/`,
    })),
    collaborators,
    commenters,
    account: null,
  };
}
