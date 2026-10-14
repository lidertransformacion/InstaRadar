import data from "@/data/match-libertario.json";

export type LibertarioMatch = {
  total: number;
  nicho: number;
  zona: number;
  tamano: number;
  engagement: number;
  autenticidad: number;
  valores: number;
  competencia: number;
  penalizacion: number;
  er: number | null;
  fake: number | null;
  verificado: boolean;
  medicion?: {
    disponible: boolean;
    nota?: string;
    posts?: number;
    er_mediana?: number;
    er_promedio?: number;
    com_post?: number;
    virales?: number;
    ratio_com_likes?: number;
    etiqueta?: string;
    fecha?: string;
    pod?: boolean;
  } | null;
  explicacion: string;
};

const table = data as Record<string, LibertarioMatch>;

export function libertarioMatch(username: string): LibertarioMatch | null {
  return table[username.toLowerCase()] ?? null;
}

export type EngagementDisplay = {
  /** Percent value (1.8 = 1.8%), or null when nothing was measured. */
  value: number | null;
  source: "medido" | "Modash" | "sin medir";
  label: string;
};

/** Measured median ER first, then Modash, then "Sin medir". Never a fake 0.0%. */
export function engagementDisplay(username: string, legacyRate = 0): EngagementDisplay {
  const match = libertarioMatch(username);
  const fmt = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`;
  const measured = match?.medicion;
  if (measured?.disponible && measured.er_mediana != null) {
    return { value: measured.er_mediana, source: "medido", label: `ER mediana ${fmt(measured.er_mediana)}` };
  }
  if (measured && !measured.disponible) {
    return { value: null, source: "sin medir", label: `Sin medir (${measured.nota ?? "sin dato"})` };
  }
  if (match?.er != null) {
    return { value: match.er, source: "Modash", label: `ER ${fmt(match.er)} · Modash` };
  }
  if (legacyRate > 0) {
    return { value: legacyRate * 100, source: "medido", label: `ER ${fmt(legacyRate * 100)}` };
  }
  return { value: null, source: "sin medir", label: "Sin medir" };
}
