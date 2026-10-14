import path from "node:path";

export const SEND_DAILY_CAP = 15;
export const SEND_GAP_MIN_MS = 3 * 60_000;
export const SEND_GAP_MAX_MS = 8 * 60_000;

export function nextSendGapMs(rng: () => number = Math.random): number {
  return Math.round(SEND_GAP_MIN_MS + rng() * (SEND_GAP_MAX_MS - SEND_GAP_MIN_MS));
}

export type SendDecision =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Sending is a separate, manual step. Every gate here must pass, and the
 * caller still has to confirm. The research profile can never be the sender.
 */
export function evaluateSend(input: {
  sendEnabled: boolean;
  status: string;
  attemptsToday: number;
  dailyCap: number;
  nextSendAt: number | null;
  now: number;
  researchDir: string;
  outreachDir: string;
  confirm: boolean;
  searchRunning: boolean;
}): SendDecision {
  if (!input.sendEnabled) {
    return {
      ok: false,
      reason: "El envío está apagado. Se activa a mano y solo con la otra cuenta.",
    };
  }
  if (input.searchRunning) {
    return { ok: false, reason: "Espera a que termine la búsqueda." };
  }
  if (input.status !== "approved") {
    return { ok: false, reason: "Aprueba el borrador antes de enviar." };
  }
  if (!input.confirm) {
    return { ok: false, reason: "Falta la confirmación manual." };
  }

  const research = path.resolve(input.researchDir);
  const outreach = path.resolve(input.outreachDir || "");
  if (!input.outreachDir.trim() || research === outreach) {
    return {
      ok: false,
      reason: "La cuenta de envío tiene que ser distinta a la de investigación.",
    };
  }

  const cap = Math.min(SEND_DAILY_CAP, Math.max(1, input.dailyCap));
  if (input.attemptsToday >= cap) {
    return { ok: false, reason: `Tope de hoy: ${cap} mensajes.` };
  }

  if (input.nextSendAt != null && input.now < input.nextSendAt) {
    const minutes = Math.max(1, Math.ceil((input.nextSendAt - input.now) / 60_000));
    return {
      ok: false,
      reason: `Espera ${minutes} min antes del siguiente mensaje.`,
    };
  }

  return { ok: true };
}
