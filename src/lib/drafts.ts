import { contentHint } from "@/lib/scoring";
import { fold } from "@/lib/text";
import type { Shop } from "@/lib/types";

export function pickShop(zone: string | null, shops: Shop[]): Shop | null {
  if (shops.length === 0) return null;
  if (!zone) return shops[0];
  const normalized = fold(zone);
  const exact = shops.find((shop) => fold(shop.zone) === normalized);
  if (exact) return exact;
  const laureles = shops.find((shop) => fold(shop.zone).includes("laureles"));
  const rio = shops.find(
    (shop) => fold(shop.zone).includes("rio") || fold(shop.name).includes("rio"),
  );
  if (normalized.includes("laureles") || normalized.includes("estadio")) {
    return laureles ?? shops[0];
  }
  if (
    rio &&
    ["poblado", "provenza", "manila", "envigado", "sabaneta", "rio"].some((part) =>
      normalized.includes(part),
    )
  ) {
    return rio;
  }
  return shops[0];
}

function firstName(fullName: string, username: string): string {
  const cleaned = fullName.trim().split(/\s+/)[0];
  if (cleaned && !cleaned.startsWith("@")) return cleaned;
  return username;
}

const HOOKS: Record<"cafe" | "brunch" | "lifestyle" | "mix", string> = {
  cafe: "vi que el café aparece seguido en lo que publicas",
  brunch: "vi tus desayunos y se parecen a la mesa que armamos en la tienda",
  lifestyle: "tu forma de contar la ciudad encaja con lo que queremos mostrar",
  mix: "vi café y comida en tu perfil, y se siente cercano a Libertario",
};

export function buildInvitation(input: {
  fullName: string;
  username: string;
  zone: string | null;
  bio: string;
  captions: string[];
  shop: Shop;
}): string {
  const hint = contentHint(input.bio, input.captions);
  const name = firstName(input.fullName, input.username);
  const place = input.zone ? ` en ${input.zone}` : "";
  return [
    `Hola ${name}, ${HOOKS[hint]}${place}.`,
    "",
    `Soy Santiago, de Libertario Coffee Roasters. Quería invitarte a desayunar en ${input.shop.name} (${input.shop.address}), sin pauta y sin guion: pides lo que te provoque y, si te nace, lo cuentas a tu manera.`,
    "",
    "¿Te queda bien un día de esta semana o de la próxima?",
    "Santiago",
  ].join("\n");
}
