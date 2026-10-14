import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CITIES } from "@/lib/catalog";
import {
  AVATAR_CAP_PER_RUN,
  AVATAR_GAP,
  avatarFetchAllowed,
  avatarFile,
  cachedAvatarUrl,
  cleanAvatarUrl,
  instagramCdnUrl,
  readAvatarFile,
  resetAvatarRun,
  savedAvatarsThisRun,
  writeAvatarFile,
} from "@/lib/avatars";
import { parseResearchJson, planProfiles } from "@/lib/ingest";
import { randomDelayMs } from "@/lib/pacing";

const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUSEhMVFhUXFxUWFxUVFxUVFxUVFxUWFxUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGhAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAEAAqAMBIgACEQEDEQH/xAAbAAACAwEBAQAAAAAAAAAAAAACAwEEBQYBB//EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH0f//Z",
  "base64",
);

const roots: string[] = [];

afterEach(() => {
  resetAvatarRun();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("avatar cache", () => {
  it("fetches only on a headed Mac, from profiles that are not cached, under the run cap", () => {
    expect(
      avatarFetchAllowed({ platform: "darwin", headless: false, cached: false, savedThisRun: 0 }),
    ).toBe(true);
    expect(
      avatarFetchAllowed({ platform: "linux", headless: false, cached: false, savedThisRun: 0 }),
    ).toBe(false);
    expect(
      avatarFetchAllowed({ platform: "darwin", headless: true, cached: false, savedThisRun: 0 }),
    ).toBe(false);
    expect(
      avatarFetchAllowed({ platform: "darwin", headless: false, cached: true, savedThisRun: 0 }),
    ).toBe(false);
    expect(
      avatarFetchAllowed({
        platform: "darwin",
        headless: false,
        cached: false,
        savedThisRun: AVATAR_CAP_PER_RUN,
      }),
    ).toBe(false);
    expect(AVATAR_CAP_PER_RUN).toBeLessThanOrEqual(8);
  });

  it("waits a few seconds between photos", () => {
    expect(randomDelayMs(AVATAR_GAP, () => 0)).toBe(3_000);
    expect(randomDelayMs(AVATAR_GAP, () => 1)).toBe(6_000);
  });

  it("keeps an https address and only downloads Instagram image hosts", () => {
    expect(cleanAvatarUrl("https://scontent.cdninstagram.com/v/photo.jpg")).toContain("cdninstagram.com");
    expect(cleanAvatarUrl("http://cdninstagram.com/a.jpg")).toBe("");
    expect(cleanAvatarUrl("javascript:alert(1)")).toBe("");
    expect(instagramCdnUrl("https://scontent-bog1-1.xx.fbcdn.net/v/t51.jpg")).toBe(true);
    expect(instagramCdnUrl("https://example.com/photo.jpg")).toBe(false);
  });

  it("writes a local jpg and refuses a path escape", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "radar-avatars-"));
    roots.push(root);
    expect(avatarFile("../etc/passwd", root)).toBeNull();
    expect(writeAvatarFile("tomandocafe", TINY_JPEG, root)).toBe(true);
    expect(savedAvatarsThisRun()).toBe(1);
    expect(cachedAvatarUrl("tomandocafe", root)).toBe("/api/avatars/tomandocafe");
    const read = readAvatarFile("tomandocafe", root);
    expect(read?.type).toBe("image/jpeg");
    expect(writeAvatarFile("tomandocafe", Buffer.from("not-an-image"), root)).toBe(false);
  });

  it("imports avatar_url onto the profile", () => {
    const file = parseResearchJson(
      JSON.stringify({
        city: "Medellín",
        influencers: [
          {
            username: "tomandocafe",
            display_name: "Tomando Café",
            avatar_url: "https://scontent.cdninstagram.com/v/tomando.jpg",
          },
        ],
      }),
    );
    const city = DEFAULT_CITIES.find((item) => item.id === "medellin");
    if (!city) throw new Error("medellin");
    const [profile] = planProfiles(file, city, "pergaminocafe");
    expect(profile.avatarUrl).toBe("https://scontent.cdninstagram.com/v/tomando.jpg");
    expect(profile.followers).toBeNull();
  });
});
