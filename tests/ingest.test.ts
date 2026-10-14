import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CITIES } from "@/lib/catalog";
import {
  matchCity,
  matchZone,
  parseResearchJson,
  planCompetitorStudy,
  planProfiles,
} from "@/lib/ingest";
import { fakeFollowerShare, scoreProfile, UNVERIFIED_RANK_PENALTY } from "@/lib/scoring";

const raw = fs.readFileSync(path.join(process.cwd(), "data/real/medellin.json"), "utf8");

describe("research import", () => {
  const file = parseResearchJson(raw);
  const city = matchCity(file.city, DEFAULT_CITIES);
  if (!city) throw new Error("medellin");
  const profiles = planProfiles(file, city, file.competitors[0].username);

  it("keeps Pergamino's real account size", () => {
    const study = planCompetitorStudy(file.competitors[0], city.id, "2026-10-13T12:00:00.000Z");
    expect(study.mock).toBe(false);
    expect(study.account?.followers).toBe(161000);
    expect(study.account?.posts).toBe(3187);
    expect(study.summary).toContain("161.000");
    expect(study.summary).toContain("3.187");
  });

  it("places Amalia in Envigado and scores a Pergamino mention", () => {
    expect(matchZone("Medellín / Envigado (inferido)", city.zones.map((zone) => zone.name))).toBe(
      "Envigado",
    );
    const amalia = profiles.find((profile) => profile.username === "amalia.vasquezv");
    const tomando = profiles.find((profile) => profile.username === "tomandocafe");
    expect(amalia?.zone).toBe("Envigado");
    expect(tomando?.sample).toBe(false);
    const mentioned = scoreProfile({
      bio: amalia!.bio,
      captions: amalia!.posts.map((post) => post.caption),
      zone: amalia!.zone,
      cityName: city.name,
      zones: city.zones.map((zone) => zone.name),
      followers: amalia!.followers ?? 0,
      following: amalia!.following ?? 0,
      postsCount: amalia!.postsCount ?? -1,
      recentPosts: [],
      competitorUsernames: ["pergaminocafe"],
    });
    const clean = scoreProfile({
      bio: tomando!.bio,
      captions: tomando!.posts.map((post) => post.caption),
      zone: tomando!.zone,
      cityName: city.name,
      zones: city.zones.map((zone) => zone.name),
      followers: tomando!.followers ?? 0,
      following: tomando!.following ?? 0,
      postsCount: tomando!.postsCount ?? -1,
      recentPosts: [],
      competitorUsernames: ["pergaminocafe"],
    });
    expect(mentioned.breakdown.penalty).toBe(8);
    expect(mentioned.reason).toContain("@pergaminocafe");
    expect(clean.breakdown.penalty).toBe(0);
    expect(mentioned.score).toBeLessThan(clean.score);
  });

  it("uses the same usernames on a second plan so a re-import can merge", () => {
    const again = planProfiles(parseResearchJson(raw), city, "pergaminocafe");
    expect(again.map((profile) => profile.username)).toEqual(profiles.map((profile) => profile.username));
    expect(new Set(again.map((profile) => profile.username)).size).toBe(39);
    expect(profiles.filter((profile) => profile.verified)).toHaveLength(9);
  });

  it("keeps compact counts, empty followers, and the pending Instagram check", () => {
    const sara = profiles.find((profile) => profile.username === "saradegusta");
    const sharon = profiles.find((profile) => profile.username === "sharonbiker");
    const caro = profiles.find((profile) => profile.username === "carobarrada_");
    expect(sara?.followers).toBe(6400);
    expect(sara?.following).toBeNull();
    expect(sara?.postsCount).toBeNull();
    expect(sara?.verified).toBe(false);
    expect(sara?.bio).toContain("CHEF");
    expect(sharon?.bio).toContain("je t'aime");
    expect(caro?.followers).toBeNull();
    expect(caro?.notes).toContain("experta en brunch");
    expect(caro?.evidenceUrl).toContain("h13n.com");

    const shared = {
      bio: sara!.bio,
      captions: sara!.posts.map((post) => post.caption),
      zone: sara!.zone,
      cityName: city.name,
      zones: city.zones.map((zone) => zone.name),
      followers: sara!.followers ?? 0,
      following: sara!.following ?? 0,
      postsCount: sara!.postsCount ?? -1,
      recentPosts: [],
      competitorUsernames: ["pergaminocafe"],
      fakeFollowerShare: fakeFollowerShare(sara!.notes),
    };
    const pending = scoreProfile({ ...shared, verified: false });
    const checked = scoreProfile({ ...shared, verified: true });
    expect(pending.score).toBe(Math.max(0, checked.score - UNVERIFIED_RANK_PENALTY));
    expect(shared.fakeFollowerShare).toBeGreaterThan(0.25);
  });
});
