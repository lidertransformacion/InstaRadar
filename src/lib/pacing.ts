import { fold } from "@/lib/text";

export type PacingConfig = {
  minDelayMs: number;
  maxDelayMs: number;
  hourlyCap: number;
  dailyCap: number;
};

export type CapSnapshot = {
  actionsThisHour: number;
  actionsToday: number;
  hourlyCap: number;
  dailyCap: number;
};

export type ChallengeKind = "checkpoint" | "rate_limit" | "challenge";

export type ChallengeHit = {
  kind: ChallengeKind;
};

const CHALLENGE_RULES: { kind: ChallengeKind; pattern: RegExp }[] = [
  {
    kind: "checkpoint",
    pattern:
      /checkpoint|confirm it.?s you|confirma que eres tu|confirm your identity|ayudanos a confirmar|help us confirm|suspicious login|inicio de sesion sospechoso|unusual login|actividad inusual/,
  },
  {
    kind: "rate_limit",
    pattern:
      /try again later|intentalo mas tarde|please wait a few minutes|espera unos minutos|feedback required|action blocked|we limit how often|limite de acciones|temporar(?:y|ily) blocked|bloquead[oa] temporalmente/,
  },
  {
    kind: "challenge",
    pattern: /\/challenge\/|\/accounts\/suspended|\/consent\//,
  },
];

/**
 * Delay clustered toward the middle of the range so pauses feel uneven
 * without becoming either instant or stuck.
 */
export function randomDelayMs(
  config: Pick<PacingConfig, "minDelayMs" | "maxDelayMs">,
  rng: () => number = Math.random,
): number {
  const min = Math.min(config.minDelayMs, config.maxDelayMs);
  const max = Math.max(config.minDelayMs, config.maxDelayMs);
  if (max === min) return min;
  const unit = (rng() + rng()) / 2;
  return Math.round(min + unit * (max - min));
}

/** Exponential pause after a failed read. Caps so a bad hour does not retry all day. */
export function backoffDelayMs(
  attempt: number,
  rng: () => number = Math.random,
  base = 30_000,
  cap = 15 * 60_000,
): number {
  const step = Math.max(1, Math.floor(attempt));
  const exponential = Math.min(cap, base * 2 ** (step - 1));
  const jitter = 0.85 + rng() * 0.3;
  return Math.round(Math.min(cap, exponential * jitter));
}

export function capDecision(state: CapSnapshot): {
  pause: boolean;
  reason: "hour" | "day" | null;
} {
  if (state.actionsToday >= state.dailyCap) return { pause: true, reason: "day" };
  if (state.actionsThisHour >= state.hourlyCap) {
    return { pause: true, reason: "hour" };
  }
  return { pause: false, reason: null };
}

export function capMessage(reason: "hour" | "day"): string {
  if (reason === "day") {
    return "Pausa: se alcanzó el tope del día. Sigue mañana.";
  }
  return "Pausa: se alcanzó el tope de esta hora.";
}

export function detectChallenge(input: {
  url?: string;
  text?: string;
}): ChallengeHit | null {
  const blob = fold(`${input.url ?? ""} ${input.text ?? ""}`);
  for (const rule of CHALLENGE_RULES) {
    if (rule.pattern.test(blob)) return { kind: rule.kind };
  }
  return null;
}

export function challengeMessage(kind: ChallengeKind): string {
  if (kind === "rate_limit") {
    return "Pausa: Instagram pidió esperar. El radar no reintenta solo.";
  }
  return "Pausa: Instagram mostró una verificación. Resuélvela en la ventana. El radar no sigue solo.";
}

export function pageLooksLikeLogin(url: string, text: string): boolean {
  if (/\/accounts\/login/i.test(url)) return true;
  const normalized = fold(text);
  const asksUser = /username|usuario|telefono|phone|correo/.test(normalized);
  const asksPass = /password|contrasena/.test(normalized);
  return asksUser && asksPass;
}

export function withinFollowerRange(
  followers: number | null,
  min: number,
  max: number,
): boolean {
  if (followers == null || !Number.isFinite(followers)) return false;
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return followers >= low && followers <= high;
}

export function scrollPlan(
  rng: () => number,
  pauses: { min: number; max: number },
): { steps: number; pausesMs: number[] } {
  const min = Math.min(pauses.min, pauses.max);
  const max = Math.max(pauses.min, pauses.max);
  const steps = 3 + Math.floor(rng() * 5);
  const pausesMs = Array.from({ length: steps }, () =>
    Math.round(min + rng() * (max - min)),
  );
  return { steps, pausesMs };
}

export function hourAgoIso(now = new Date()): string {
  return new Date(now.getTime() - 3_600_000).toISOString();
}

export function dayStartIso(now = new Date()): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException ||
    (error instanceof Error && error.name === "AbortError")
  );
}
