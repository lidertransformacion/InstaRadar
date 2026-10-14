import { listProfiles } from "@/lib/db";
import { csvCell } from "@/lib/format";
import { engagementDisplay } from "@/lib/libertario-match";


export async function GET(request: Request) {
  const url = new URL(request.url);
  const cityId = url.searchParams.get("city") || "medellin";
  const min = Number(url.searchParams.get("min") ?? 0);
  const max = Number(url.searchParams.get("max") ?? Number.MAX_SAFE_INTEGER);
  const zone = url.searchParams.get("zone") || "";
  const includeUnknown = url.searchParams.get("unknown") !== "0";
  const verifiedOnly = url.searchParams.get("verified") === "1";
  const rows = listProfiles(cityId).filter((profile) => {
    if (verifiedOnly && !profile.verified) return false;
    if (profile.followers == null) {
      if (!includeUnknown) return false;
    } else if (profile.followers < min || profile.followers > max) {
      return false;
    }
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
        profile.followers == null ? "sin dato" : profile.followers,
        profile.following == null ? "" : profile.following,
        engagementDisplay(profile.username, profile.engagementRate).label,
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
