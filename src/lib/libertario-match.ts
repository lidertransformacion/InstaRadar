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
  explicacion: string;
};

const table = data as Record<string, LibertarioMatch>;

export function libertarioMatch(username: string): LibertarioMatch | null {
  return table[username.toLowerCase()] ?? null;
}
