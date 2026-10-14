import { clearSamples, getSettings, updateCityCatalog, updateSettings } from "@/lib/db";
import { cleanHashtag, cleanUsername } from "@/lib/text";
import type { Settings, Shop, Zone } from "@/lib/types";


export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | (Partial<Settings> & {
        clearSamples?: boolean;
        cityId?: string;
        catalog?: {
          competitor?: string;
          zones?: Zone[];
          hashtags?: string[];
          watches?: string[];
          shops?: Shop[];
        };
      })
    | null;
  if (!body) return Response.json({ error: "Nada que guardar." }, { status: 400 });

  try {
    if (body.clearSamples) {
      const removed = clearSamples(body.cityId);
      return Response.json({ ok: true, removed, settings: getSettings() });
    }

    if (body.catalog && body.cityId) {
      const hashtags = body.catalog.hashtags
        ?.map((tag) => cleanHashtag(tag))
        .filter((tag): tag is string => Boolean(tag));
      const watches = body.catalog.watches
        ?.map((username) => cleanUsername(username))
        .filter((username): username is string => Boolean(username));
      const city = updateCityCatalog(body.cityId, {
        competitor: body.catalog.competitor,
        zones: body.catalog.zones,
        hashtags,
        watches,
        shops: body.catalog.shops,
      });
      if (!city) return Response.json({ error: "No está esa ciudad." }, { status: 404 });
    }

    const settingKeys = [
      "cityId",
      "minFollowers",
      "maxFollowers",
      "hourlyCap",
      "dailyCap",
      "minDelayMs",
      "maxDelayMs",
      "mockMode",
      "sendEnabled",
      "sendDailyCap",
      "researchProfileDir",
      "outreachProfileDir",
      "priceFile",
    ] as const;
    const patch: Partial<Settings> = {};
    for (const key of settingKeys) {
      if (body[key] !== undefined) Object.assign(patch, { [key]: body[key] });
    }
    const settings = updateSettings(patch);
    return Response.json({ ok: true, settings });
  } catch (error) {
    console.error("[radar] settings failed", error);
    return Response.json({ error: "No pude guardar." }, { status: 500 });
  }
}
