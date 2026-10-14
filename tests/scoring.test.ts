import { describe, expect, it } from "vitest";
import { DEFAULT_CITIES } from "@/lib/catalog";
import {
  engagementRate,
  fakeFollowerShare,
  scoreProfile,
  UNVERIFIED_RANK_PENALTY,
  type ScoreInput,
} from "@/lib/scoring";

type Fixture = {
  username: string;
  bio: string;
  followers: number;
  following: number;
  postsCount: number;
  cityId: string;
  zone: string;
  captions: string[];
  likes: number;
  comments: number;
  daysAgo: number[];
};

const FIXTURES: Fixture[] = [
  {
    username: "luna.mesa",
    bio: "Brunch, café de especialidad y tardes en Laureles.",
    followers: 18400,
    following: 620,
    postsCount: 248,
    cityId: "medellin",
    zone: "Laureles",
    likes: 780,
    comments: 46,
    daysAgo: [2, 6, 11, 16, 23],
    captions: [
      "Domingo de brunch en Laureles. Huevos y flat white.",
      "Nuevo filtro de origen. Café de la semana en el barrio.",
      "Mesa larga, croissant y latte.",
      "Paseo corto y espresso antes del almuerzo.",
      "Desayuno lento y otro café.",
    ],
  },
  {
    username: "vale.provenza",
    bio: "Ciudad, mesas y algo de café. Provenza.",
    followers: 22100,
    following: 980,
    postsCount: 340,
    cityId: "medellin",
    zone: "Provenza",
    likes: 160,
    comments: 32,
    daysAgo: [4, 12, 20, 28],
    captions: [
      "Tarde en Provenza, outfit y una mesa.",
      "Paseo por el barrio.",
      "Un latte entre diligencias.",
      "Domingo sin planes en la ciudad.",
    ],
  },
  {
    username: "con.pergamino",
    bio: "Café y brunch en El Poblado.",
    followers: 15100,
    following: 700,
    postsCount: 220,
    cityId: "medellin",
    zone: "El Poblado",
    likes: 690,
    comments: 40,
    daysAgo: [3, 8, 14, 21],
    captions: [
      "Brunch largo y un flat white.",
      "Gracias @pergaminocafe por la mesa de hoy.",
      "Café de especialidad en El Poblado.",
      "Desayuno con croissant.",
    ],
  },
  {
    username: "sigue.a.todos",
    bio: "",
    followers: 6000,
    following: 18500,
    postsCount: 4,
    cityId: "medellin",
    zone: "El Poblado",
    likes: 4200,
    comments: 80,
    daysAgo: [1, 2],
    captions: ["Follow back", "Follow back"],
  },
  {
    username: "noche.poblado",
    bio: "Música, barra y planes de noche.",
    followers: 15000,
    following: 800,
    postsCount: 400,
    cityId: "medellin",
    zone: "El Poblado",
    likes: 200,
    comments: 15,
    daysAgo: [2, 5, 9, 13],
    captions: ["La barra de anoche.", "DJ set y luces.", "Otro after en la 10.", "Lista para salir."],
  },
];

function inputFrom(profile: Fixture, captions = profile.captions): ScoreInput {
  const city = DEFAULT_CITIES.find((item) => item.id === profile.cityId);
  if (!city) throw new Error(profile.cityId);
  const now = Date.parse("2026-10-13T12:00:00.000Z");
  return {
    bio: profile.bio,
    captions,
    zone: profile.zone,
    cityName: city.name,
    zones: city.zones.map((zone) => zone.name),
    followers: profile.followers,
    following: profile.following,
    postsCount: profile.postsCount,
    recentPosts: captions.map((caption, index) => ({
      caption,
      likes: profile.likes,
      comments: profile.comments,
      takenAt: new Date(now - (profile.daysAgo[index] ?? index) * 86_400_000).toISOString(),
    })),
    competitorUsernames: [city.competitor, ...city.watches].filter(Boolean),
  };
}

function scoreName(username: string, captions?: string[]) {
  const profile = FIXTURES.find((item) => item.username === username);
  if (!profile) throw new Error(username);
  return scoreProfile(inputFrom(profile, captions));
}

describe("scoreProfile", () => {
  it("ranks a Laureles brunch account as a strong Libertario fit", () => {
    const result = scoreName("luna.mesa");
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.reason).toContain("Laureles");
    expect(result.reason).not.toContain("\n");
    expect(result.breakdown.penalty).toBe(0);
  });

  it("puts coffee accounts above nightlife and suspicious accounts", () => {
    const luna = scoreName("luna.mesa").score;
    const vale = scoreName("vale.provenza").score;
    const noche = scoreName("noche.poblado").score;
    const fake = scoreName("sigue.a.todos");
    expect(luna).toBeGreaterThan(vale);
    expect(vale).toBeGreaterThan(noche);
    expect(fake.score).toBeLessThan(45);
    expect(fake.breakdown.authenticity).toBeLessThanOrEqual(6);
    expect(fake.reason.toLowerCase()).toContain("engagement");
  });

  it("subtracts when a profile already appears with a competitor", () => {
    const withCollab = scoreName("con.pergamino");
    const without = scoreName(
      "con.pergamino",
      FIXTURES.find((item) => item.username === "con.pergamino")!.captions.map((caption) =>
        caption.replace("@pergaminocafe", "la tienda"),
      ),
    );
    expect(withCollab.competitor).toBe("pergaminocafe");
    expect(withCollab.breakdown.penalty).toBe(8);
    expect(without.breakdown.penalty).toBe(0);
    expect(withCollab.score).toBe(without.score - 8);
    expect(withCollab.reason).toContain("@pergaminocafe");
  });

  it("computes engagement as the average of likes plus comments over followers", () => {
    const posts = [
      { likes: 10, comments: 5, takenAt: "2026-10-01T00:00:00.000Z" },
      { likes: 30, comments: 5, takenAt: "2026-10-08T00:00:00.000Z" },
    ];
    expect(engagementRate(posts, 1000)).toBeCloseTo(0.025, 5);
    expect(engagementRate([], 1000)).toBe(0);
    expect(engagementRate(posts, 0)).toBe(0);
  });

  it("ranks an unchecked account a little below the same fit", () => {
    const base = inputFrom(FIXTURES[0]);
    const checked = scoreProfile({ ...base, verified: true });
    const pending = scoreProfile({ ...base, verified: false });
    expect(UNVERIFIED_RANK_PENALTY).toBe(4);
    expect(pending.score).toBe(checked.score - UNVERIFIED_RANK_PENALTY);
    expect(pending.reason).toBe(checked.reason);
  });

  it("reads a fake-follower share and does not treat an unknown post count as thin", () => {
    expect(fakeFollowerShare("Bio: café | fake followers 27.76%, ER 1.06%")).toBeCloseTo(0.2776);
    expect(fakeFollowerShare("fake followers -")).toBeNull();
    const heavy = scoreProfile({ ...inputFrom(FIXTURES[0]), fakeFollowerShare: 0.28 });
    const light = scoreProfile({ ...inputFrom(FIXTURES[0]), fakeFollowerShare: 0.1 });
    expect(heavy.breakdown.authenticity).toBeLessThan(light.breakdown.authenticity);
    const unknown = scoreProfile({ ...inputFrom(FIXTURES[0]), postsCount: -1, followers: 8000 });
    const thin = scoreProfile({ ...inputFrom(FIXTURES[0]), postsCount: 2, followers: 8000 });
    expect(unknown.breakdown.authenticity).toBeGreaterThan(thin.breakdown.authenticity);
  });

  it("stays inside 0–100 for empty and extreme inputs", () => {
    const empty = scoreProfile({
      bio: "",
      captions: [],
      zone: null,
      cityName: "Medellín",
      zones: ["Laureles"],
      followers: 0,
      following: 0,
      recentPosts: [],
      postsCount: 0,
      competitorUsernames: [],
    });
    expect(empty.score).toBeGreaterThanOrEqual(0);
    expect(empty.score).toBeLessThanOrEqual(100);
    expect(empty.reason).not.toContain("\n");

    const saturated = scoreProfile({
      bio: "café brunch lifestyle barrio",
      captions: Array.from({ length: 6 }, () => "café de especialidad, brunch y croissant en Laureles"),
      zone: "Laureles",
      cityName: "Medellín",
      zones: ["Laureles"],
      followers: 8000,
      following: 100,
      recentPosts: [
        { likes: 200, comments: 40, takenAt: "2026-09-01T00:00:00.000Z" },
        { likes: 220, comments: 30, takenAt: "2026-09-20T00:00:00.000Z" },
      ],
      postsCount: 40,
      competitorUsernames: ["pergaminocafe", "otrocafe"],
    });
    expect(saturated.score).toBeGreaterThanOrEqual(0);
    expect(saturated.score).toBeLessThanOrEqual(100);
  });
});
