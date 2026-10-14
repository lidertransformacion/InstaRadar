import { getDraft, getProfileDetail, listCities, updateDraft, upsertDraft } from "@/lib/db";
import { buildInvitation, pickShop } from "@/lib/drafts";
import type { DraftStatus } from "@/lib/types";


const EDITABLE: DraftStatus[] = ["draft", "approved", "skipped"];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { profileId?: number };
  const detail = getProfileDetail(Number(body.profileId));
  if (!detail) return Response.json({ error: "No está ese perfil." }, { status: 404 });
  const city = listCities().find((item) => item.id === detail.card.cityId);
  const shop = pickShop(detail.card.zone, city?.shops ?? []);
  if (!shop) {
    return Response.json({ error: "Agrega una tienda en Ajustes." }, { status: 400 });
  }
  try {
    const draft = upsertDraft(
      detail.card.id,
      buildInvitation({
        fullName: detail.card.fullName,
        username: detail.card.username,
        zone: detail.card.zone,
        bio: detail.bio,
        captions: detail.captions,
        shop,
      }),
      shop.name,
    );
    return Response.json({ draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No pude crear el borrador.";
    return Response.json({ error: message }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: number;
    body?: string;
    status?: DraftStatus;
  };
  if (!body.id) return Response.json({ error: "Falta el borrador." }, { status: 400 });
  if (body.status && !EDITABLE.includes(body.status)) {
    return Response.json({ error: "Ese estado no se cambia desde aquí." }, { status: 400 });
  }
  const current = getDraft(body.id);
  if (!current) return Response.json({ error: "No está ese borrador." }, { status: 404 });
  if (current.status === "sent" || current.status === "sending") {
    return Response.json({ error: "Ese mensaje ya salió o está saliendo." }, { status: 409 });
  }
  const draft = updateDraft(body.id, {
    body: body.body,
    status: body.status,
    error: null,
  });
  return Response.json({ draft });
}
