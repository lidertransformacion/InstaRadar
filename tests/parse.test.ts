import { describe, expect, it } from "vitest";
import { buildInvitation } from "@/lib/drafts";
import {
  isPrivateAccount,
  parseCompactNumber,
  parseEngagementText,
  parseProfileMeta,
  postPathsFromHrefs,
  usernamesFromHrefs,
} from "@/lib/parse";
import { parsePriceCsv, parsePriceJson } from "@/lib/prices";

describe("instagram text parsing", () => {
  it("reads English and Spanish profile summaries", () => {
    const english = parseProfileMeta(
      "18.4K Followers, 890 Following, 312 Posts - See Instagram photos and videos from Luna Mesa (@luna.mesa)",
    );
    expect(english).toMatchObject({
      followers: 18400,
      following: 890,
      posts: 312,
      fullName: "Luna Mesa",
    });

    const spanish = parseProfileMeta(
      "18,4 mil seguidores, 890 seguidos, 312 publicaciones - Mira las fotos y los videos de Instagram de Luna Mesa (@luna.mesa)",
    );
    expect(spanish).toMatchObject({
      followers: 18400,
      following: 890,
      posts: 312,
      fullName: "Luna Mesa",
    });
  });

  it("parses compact counts and post engagement", () => {
    expect(parseCompactNumber("1.2M", "en")).toBe(1_200_000);
    expect(parseCompactNumber("1.234", "es")).toBe(1234);
    expect(parseCompactNumber("1,234", "en")).toBe(1234);
    expect(parseEngagementText("1,234 likes\n48 comments")).toEqual({ likes: 1234, comments: 48 });
    expect(parseEngagementText("1.234 Me gusta\n48 comentarios")).toEqual({
      likes: 1234,
      comments: 48,
    });
  });

  it("keeps profile links and drops posts, and notices private accounts", () => {
    expect(
      usernamesFromHrefs(["/luna.mesa/", "/explore/", "/p/abc/", "/andres.filtro"]),
    ).toEqual(["luna.mesa", "andres.filtro"]);
    expect(postPathsFromHrefs(["/p/abc/", "/reel/xyz/?hl=es", "/luna.mesa/"])).toEqual([
      "/p/abc/",
      "/reel/xyz/",
    ]);
    expect(isPrivateAccount("Esta cuenta es privada")).toBe(true);
    expect(isPrivateAccount("18,4 mil seguidores")).toBe(false);
  });
});

describe("drafts and prices", () => {
  it("writes a breakfast invite for the shop in that zone", () => {
    const body = buildInvitation({
      fullName: "Luna Mesa",
      username: "luna.mesa",
      zone: "Laureles",
      bio: "Brunch y café en Laureles",
      captions: ["flat white y huevos"],
      shop: {
        zone: "Laureles",
        name: "Libertario Laureles",
        address: "Diagonal 75 #39cb-20, Laureles",
      },
    });
    expect(body).toContain("Luna");
    expect(body).toContain("Laureles");
    expect(body).toContain("Diagonal 75 #39cb-20, Laureles");
    expect(body.toLowerCase()).not.toContain("te pago");
    expect(body.toLowerCase()).toContain("sin pauta");
  });

  it("loads price rows from JSON and CSV", () => {
    const json = parsePriceJson(
      JSON.stringify({
        note: "mano",
        rows: [{ item: "Espresso", libertario: "5000", competitor: "5500", notes: "sala" }],
      }),
    );
    expect(json.error).toBeNull();
    expect(json.rows[0]?.item).toBe("Espresso");
    expect(json.note).toBe("mano");

    const csv = parsePriceCsv("item,libertario,competitor,notes\nLatte,9000,9800,sala\n");
    expect(csv.error).toBeNull();
    expect(csv.rows[0]).toMatchObject({ item: "Latte", libertario: "9000", competitor: "9800" });
  });
});
