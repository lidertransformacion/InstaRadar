import { listProfiles } from "@/lib/db";
import { csvCell, formatPercent } from "@/lib/format";


export async function GET(request: Request) {
  const url = new URL(request.url);
  const cityId = url.searchParams.get("city") || "medellin";
  const min = Number(url.searchParams.get("min") ?? 0);
  const max = Number(url.searchParams.get("max") ?? Number.MAX_SAFE_INTEGER);
  const zone = url.searchParams.get("zone") || "";
  const rows = listProfiles(cityId).filter((profile) => {
    if (profile.followers < min || profile.followers > max) return false;
    if (zone && profile.zone !== zone) return false;
    return true;
  });
  const header = [
    "usuario",
    "nombre",
    "zona",
    "seguidores",
    "seguidos",
    "engagement",
    "puntaje",
    "motivo",
    "origen",
    "perfil",
    "ciudad",
  ];
  const lines = [
    header.join(","),
    ...rows.map((profile) =>
      [
        profile.username,
        profile.fullName,
        profile.zone ?? "",
        profile.followers,
        profile.following,
        formatPercent(profile.engagementRate),
        profile.score,
        profile.reason,
        profile.source,
        profile.profileUrl,
        profile.cityId,
      ]
        .map((cell) => csvCell(cell))
        .join(","),
    ),
  ];
  return new Response(`\uFEFF${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="radar-${cityId}.csv"`,
    },
  });
}
