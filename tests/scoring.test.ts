import { describe, expect, it } from "vitest";
import { DEFAULT_CITIES, SAMPLE_PROFILES, type SeedProfile } from "@/lib/catalog";
import { engagementRate, scoreProfile, type ScoreInput } from "@/lib/scoring";

function inputFrom(profile: SeedProfile, captions = profile.captions): ScoreInput {
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
  const profile = SAMPLE_PROFILES.find((item) => item.username === username);
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
      SAMPLE_PROFILES.find((item) => item.username === "con.pergamino")!.captions.map((caption) =>
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
